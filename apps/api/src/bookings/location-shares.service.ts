import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte } from 'drizzle-orm';
import {
  LOCATION_MAX_SPEED_KMH,
  LOCATION_POINTS_BATCH_MAX,
  LOCATION_STALE_MINUTES,
  ON_MY_WAY_CAP_HOURS,
  distanceMetres,
  etaFrom,
  insideSriLanka,
  isFarFromHome,
  type PresenceReply,
  type StaffPresenceDetail,
  toColombo,
  type ClientLive,
  type GeoPoint,
  type LocationPointInput,
  type PointsAccepted,
  type StaffLiveShare,
  type StartedShare,
} from '@care-platform/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { bookingShifts, bookings, caregivers, locationNotices, locationPoints, locationShares, patients, shiftCheckins } from '../database/schema';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { JobsService } from '../jobs/jobs.service';
import { CareLocationsService } from '../care-locations/care-locations.service';
import { CheckInService } from './check-in.service';
import { hashToken, latestShiftShares, openShare, presenceOf, type ShareRow } from './location-shares.db';

export const LOCATION_SWEEP_JOB = 'location-shares.sweep';
const SWEEP_MS = 2 * 60_000;

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

const ON_THE_WAY_CLIENT = {
  en: { title: '{name} is on the way', body: 'Your caregiver is on the way to the {time} visit. Open the booking to see about how long until they arrive.' },
  si: { title: '{name} පැමිණෙමින් සිටී', body: 'ඔබගේ රැකවරණ සේවකයා {time} මුරය සඳහා පැමිණෙමින් සිටී. ඔවුන් පැමිණීමට ආසන්න කාලය බැලීමට වෙන්කිරීම විවෘත කරන්න.' },
  ta: { title: '{name} வந்துகொண்டிருக்கிறார்', body: 'உங்கள் பராமரிப்பாளர் {time} வருகைக்கு வந்துகொண்டிருக்கிறார். அவர் வந்துசேர ஏறக்குறைய எவ்வளவு நேரம் என்று பார்க்க முன்பதிவைத் திறக்கவும்.' },
};
const ON_MY_WAY_REMINDER = {
  en: { title: 'Leaving for your {time} visit?', body: 'Tap "On my way" when you set off, so the client knows you are coming.' },
  si: { title: 'ඔබගේ {time} මුරය සඳහා පිටත් වනවාද?', body: 'ඔබ පිටත් වන විට "මම එනවා" තට්ටු කරන්න, එවිට ඔබ එන බව සේවාලාභියා දනී.' },
  ta: { title: 'உங்கள் {time} வருகைக்குப் புறப்படுகிறீர்களா?', body: 'புறப்படும்போது "வருகிறேன்" என்பதைத் தட்டுங்கள், இதனால் நீங்கள் வருவது வாடிக்கையாளருக்குத் தெரியும்.' },
};

/**
 * Live location, Phase B: "On my way".
 *
 * - A caregiver taps On my way from the admin's minutes before a visit
 *   (Settings > Check-in) until they check in. That opens a share; the phone
 *   sends its points to it with the share's own upload token.
 * - The client sees where the caregiver is and about how long until they
 *   arrive, only while the share is open; staff see every open share.
 * - The share closes on its own: at check-in, "I can't make this shift", the
 *   end of the shift, or after ON_MY_WAY_CAP_HOURS. The caregiver can stop it.
 * - Raw points are deleted after the admin's retention days; a share keeps
 *   only its summary.
 *
 * Nothing here blocks a check-in or changes a shift, pay or an invoice.
 */
@Injectable()
export class LocationSharesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LocationSharesService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly checkIns: CheckInService,
    private readonly places: CareLocationsService,
    private readonly notices: NotificationsService,
    private readonly jobs: JobsService,
  ) {}

  onApplicationBootstrap() {
    this.jobs.register(LOCATION_SWEEP_JOB, async () => void (await this.sweep()));
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    const schedule = () =>
      void this.jobs
        .enqueue(LOCATION_SWEEP_JOB, {}, { uniqueKey: `${LOCATION_SWEEP_JOB}:${Math.floor(Date.now() / SWEEP_MS)}`, maxAttempts: 1 })
        .catch((e) => this.logger.warn(`Could not queue the location sweep: ${(e as Error).message}`));
    this.timer = setInterval(schedule, SWEEP_MS / 2);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // --- the caregiver ------------------------------------------------------------------

  /** Can On my way be tapped for this shift now? Throws with the reason when not. */
  private async shiftForOnMyWay(user: AuthenticatedUser, shiftId: string, now: Date) {
    const settings = await this.checkIns.settings();
    if (!settings.enabled || !settings.liveEnabled) throw new ForbiddenException('Live location is turned off');
    const shift = await this.checkIns.caregiverShift(user, shiftId);
    if (shift.status !== 'SCHEDULED' || shift.bookingStatus !== 'CONFIRMED') throw new ConflictException('This shift is not on');
    if (shift.paused) throw new ConflictException('Visits on this booking are paused until the client pays');
    if (shift.cantMakeAt) throw new ConflictException('You said you cannot make this shift');
    const start = new Date(shift.startsAt).getTime();
    const end = new Date(shift.endsAt).getTime();
    const minutes = settings.onMyWayMinutes;
    if (now.getTime() < start - minutes * 60_000) throw new ConflictException(`On my way opens ${minutes} minutes before the start`);
    if (now.getTime() >= end) throw new ConflictException('This shift has ended');
    const [checkin] = await this.db.select({ at: shiftCheckins.checkedInAt }).from(shiftCheckins).where(eq(shiftCheckins.shiftId, shiftId)).limit(1);
    if (checkin?.at) throw new ConflictException('You have already checked in');
    return { shift, settings, end };
  }

  /**
   * "On my way". Tapping again while a share is open starts a fresh one (a
   * new phone, or the app was reinstalled) and closes the old one, so only
   * one phone sends at a time.
   */
  async startOnMyWay(user: AuthenticatedUser, shiftId: string, now = new Date()): Promise<StartedShare> {
    const { shift, end } = await this.shiftForOnMyWay(user, shiftId, now);
    const endsBy = new Date(Math.min(end, now.getTime() + ON_MY_WAY_CAP_HOURS * 3_600_000));
    const started = await openShare(this.db, { kind: 'ON_THE_WAY', shiftId, bookingId: shift.bookingId, caregiverId: user.caregiverId!, endsBy }, now);
    await this.tellClientOnTheWay(shiftId, shift.patientUserId, user.caregiverId!, shift.startsAt, shift.bookingId);
    return started;
  }

  async stop(user: AuthenticatedUser, shareId: string, now = new Date()): Promise<void> {
    if (user.role !== 'CAREGIVER' || !user.caregiverId) throw new ForbiddenException('You do not have permission to perform this action');
    const [row] = await this.db.select().from(locationShares).where(and(eq(locationShares.id, shareId), eq(locationShares.caregiverId, user.caregiverId))).limit(1);
    if (!row) throw new NotFoundException('Not found');
    if (row.endedAt) return;
    await this.db.update(locationShares).set({ endedAt: now, endReason: 'STOPPED' }).where(eq(locationShares.id, shareId));
  }

  /** Once per shift: the client hears the caregiver is on the way (bell and push). */
  private async tellClientOnTheWay(shiftId: string, patientUserId: string | null, caregiverId: string, startsAt: Date | string, bookingId: string) {
    try {
      const inserted = await this.db.insert(locationNotices).ignore().values({ shiftId, kind: 'CLIENT_ON_THE_WAY' });
      if (!(inserted as unknown as [{ affectedRows: number }])[0]?.affectedRows) return;
      const [cg] = await this.db.select({ name: caregivers.fullName }).from(caregivers).where(eq(caregivers.id, caregiverId)).limit(1);
      const name = firstName(cg?.name);
      const time = toColombo(startsAt).time;
      this.notices.notify(
        [patientUserId],
        (lang) => ({ title: ON_THE_WAY_CLIENT[lang].title.replace('{name}', name), body: ON_THE_WAY_CLIENT[lang].body.replace('{time}', time) }),
        `/bookings/${bookingId}`,
        `on the way ${shiftId}`,
      );
    } catch (err) {
      this.logger.warn(`Shift ${shiftId}: could not tell the client - ${(err as Error).message}`);
    }
  }

  // --- the phone's points --------------------------------------------------------------

  private async shareByToken(shareId: string, token: string | undefined): Promise<ShareRow> {
    if (!token) throw new UnauthorizedException('Missing upload token');
    const [row] = await this.db.select().from(locationShares).where(eq(locationShares.id, shareId)).limit(1);
    const want = row ? Buffer.from(row.uploadTokenHash, 'hex') : Buffer.alloc(32);
    const got = Buffer.from(hashToken(token), 'hex');
    if (!row || !timingSafeEqual(want, got)) throw new UnauthorizedException('Not a valid upload token');
    return row;
  }

  /**
   * Points from the phone. Kept only when they belong to the share's time,
   * come in order, are inside Sri Lanka and don't imply an impossible jump;
   * the rest are dropped without fuss (the phone can't fix them).
   */
  async addPoints(shareId: string, token: string | undefined, input: LocationPointInput[], now = new Date()): Promise<PointsAccepted> {
    const share = await this.shareByToken(shareId, token);
    const open = !share.endedAt && new Date(share.endsBy).getTime() > now.getTime();
    if (!Array.isArray(input)) throw new BadRequestException('Send a list of points');
    const max = LOCATION_POINTS_BATCH_MAX;
    if (input.length > max) throw new BadRequestException(`Send at most ${max} points at a time`);
    // Points taken before the share closed still count: the phone may have had no signal.
    const from = new Date(share.startedAt).getTime() - 2 * 60_000;
    const until = Math.min(share.endedAt ? new Date(share.endedAt).getTime() : Infinity, new Date(share.endsBy).getTime(), now.getTime() + 60_000);
    let last: { at: number; p: GeoPoint } | null = share.lastAt && share.lastLatitude !== null && share.lastLongitude !== null ? { at: new Date(share.lastAt).getTime(), p: { latitude: Number(share.lastLatitude), longitude: Number(share.lastLongitude) } } : null;
    const kept: (typeof locationPoints.$inferInsert)[] = [];
    let lastKept: (typeof locationPoints.$inferInsert & { atMs: number }) | null = null;
    const sorted = input
      .map((p) => ({ ...p, atMs: Date.parse(p.at) }))
      .filter((p) => Number.isFinite(p.atMs) && typeof p.latitude === 'number' && typeof p.longitude === 'number')
      .sort((a, b) => a.atMs - b.atMs);
    for (const p of sorted) {
      if (p.atMs < from || p.atMs > until) continue;
      if (last && p.atMs <= last.at) continue;
      const here = { latitude: round6(p.latitude), longitude: round6(p.longitude) };
      if (!insideSriLanka(here)) continue;
      if (last) {
        const hours = (p.atMs - last.at) / 3_600_000;
        if (distanceMetres(last.p, here) / 1000 / Math.max(hours, 1 / 3600) > LOCATION_MAX_SPEED_KMH) continue;
      }
      const accuracy = typeof p.accuracyM === 'number' && p.accuracyM >= 0 ? Math.round(p.accuracyM) : null;
      const speed = typeof p.speed === 'number' && p.speed >= 0 && p.speed < 100 ? Math.round(p.speed * 10) / 10 : null;
      const row = { shareId, at: new Date(p.atMs), latitude: here.latitude, longitude: here.longitude, accuracyM: accuracy, speed, mocked: Boolean(p.mocked), atMs: p.atMs };
      kept.push({ shareId, at: row.at, latitude: row.latitude, longitude: row.longitude, accuracyM: accuracy, speed, mocked: row.mocked });
      lastKept = row;
      last = { at: p.atMs, p: here };
    }
    if (kept.length && lastKept) {
      const pin = await this.places.pointForBooking(share.bookingId);
      const { farMetres } = await this.checkIns.settings();
      // Each point: how far from the home, and whether it is inside the home's circle (allowing for its accuracy).
      for (const k of kept) {
        const d = pin ? Math.round(distanceMetres(pin, { latitude: k.latitude as number, longitude: k.longitude as number })) : null;
        k.distanceM = d;
        k.inside = d === null ? null : !isFarFromHome(d, k.accuracyM ?? null, farMetres);
      }
      await this.db.insert(locationPoints).values(kept);
      await this.db
        .update(locationShares)
        .set({
          lastLatitude: lastKept.latitude,
          lastLongitude: lastKept.longitude,
          lastAccuracyM: lastKept.accuracyM ?? null,
          lastMocked: Boolean(lastKept.mocked),
          lastAt: lastKept.at as Date,
          lastDistanceM: pin ? Math.round(distanceMetres(pin, { latitude: lastKept.latitude as number, longitude: lastKept.longitude as number })) : null,
          points: share.points + kept.length,
        })
        .where(eq(locationShares.id, shareId));
    }
    return { accepted: kept.length, open };
  }

  // --- checks during a visit (C) ------------------------------------------------------------

  /** The caregiver's own checked-in visit, or a clear reason why not. */
  private async checkedInVisit(user: AuthenticatedUser, shiftId: string, now: Date) {
    const settings = await this.checkIns.settings();
    if (!settings.enabled || !settings.liveEnabled || !settings.presenceEnabled) throw new ForbiddenException('Location checks during visits are turned off');
    const shift = await this.checkIns.caregiverShift(user, shiftId);
    const [row] = await this.db.select({ inAt: shiftCheckins.checkedInAt, outAt: shiftCheckins.checkedOutAt }).from(shiftCheckins).where(eq(shiftCheckins.shiftId, shiftId)).limit(1);
    if (!row?.inAt) throw new ConflictException('Check in first');
    if (row.outAt) throw new ConflictException('You have already checked out');
    return { settings, shift, now };
  }

  /** "Share from this phone" while checked in: a new share (the old one, on another phone, stops). */
  async restartPresence(user: AuthenticatedUser, shiftId: string, now = new Date()): Promise<StartedShare> {
    const { settings, shift } = await this.checkedInVisit(user, shiftId, now);
    const started = await this.checkIns.openPresence(settings, shift, user, now);
    if (!started) throw new ConflictException('This shift has ended');
    return started;
  }

  /** The caregiver answers "Still with …?": noted for staff, and nobody is told about this spell away. */
  async reply(user: AuthenticatedUser, shiftId: string, reply: PresenceReply, now = new Date()): Promise<void> {
    await this.checkedInVisit(user, shiftId, now);
    const [share] = await this.db
      .select({ id: locationShares.id })
      .from(locationShares)
      .where(and(eq(locationShares.shiftId, shiftId), eq(locationShares.kind, 'ON_SHIFT'), isNull(locationShares.endedAt)))
      .orderBy(desc(locationShares.startedAt))
      .limit(1);
    if (!share) throw new ConflictException('Location checks are not running for this visit');
    await this.db.update(locationShares).set({ awayReply: reply, awayRepliedAt: now }).where(eq(locationShares.id, share.id));
  }

  /** Staff: the checks during one visit, with the points for the map. */
  async staffPresence(shiftId: string, now = new Date()): Promise<StaffPresenceDetail | null> {
    const shares = await latestShiftShares(this.db, [shiftId]);
    const share = shares.get(shiftId);
    if (!share) return null;
    const points = await this.db.select().from(locationPoints).where(eq(locationPoints.shareId, share.id)).orderBy(asc(locationPoints.at)).limit(500);
    return {
      ...(await presenceOf(this.db, share, now)),
      home: await this.places.pointForBooking(share.bookingId),
      points: points.map((p) => ({ at: new Date(p.at).toISOString(), latitude: Number(p.latitude), longitude: Number(p.longitude), accuracyM: p.accuracyM ?? null, inside: p.inside ?? null, mocked: p.mocked })),
    };
  }

  // --- who sees what -------------------------------------------------------------------

  private live(row: ShareRow, now: Date) {
    return !row.endedAt && new Date(row.endsBy).getTime() > now.getTime();
  }

  private view(row: ShareRow, home: GeoPoint | null, farMetres: number, now: Date) {
    const position = row.lastLatitude !== null && row.lastLongitude !== null ? { latitude: Number(row.lastLatitude), longitude: Number(row.lastLongitude), accuracyM: row.lastAccuracyM ?? null } : null;
    const distance = position && home ? distanceMetres(home, position) : null;
    return {
      position,
      eta: etaFrom(distance, now, farMetres),
      updatedAt: iso(row.lastAt),
      stale: row.lastAt ? now.getTime() - new Date(row.lastAt).getTime() > LOCATION_STALE_MINUTES * 60_000 : now.getTime() - new Date(row.startedAt).getTime() > LOCATION_STALE_MINUTES * 60_000,
    };
  }

  /** The client: their caregiver on the way to this booking's next visit, while the share is open. */
  async clientLive(user: AuthenticatedUser, bookingId: string, now = new Date()): Promise<ClientLive> {
    if (user.role !== 'PATIENT_GUARDIAN' || !user.patientId) throw new ForbiddenException('You do not have permission to perform this action');
    const [b] = await this.db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.patientId, user.patientId))).limit(1);
    if (!b) throw new NotFoundException('Booking not found');
    const settings = await this.checkIns.settings();
    if (!settings.enabled || !settings.liveEnabled) return { status: 'NONE' };
    const rows = await this.db
      .select({ share: locationShares, startsAt: bookingShifts.startsAt, name: caregivers.fullName })
      .from(locationShares)
      .innerJoin(bookingShifts, eq(locationShares.shiftId, bookingShifts.id))
      .innerJoin(caregivers, eq(locationShares.caregiverId, caregivers.id))
      .where(and(eq(locationShares.bookingId, bookingId), eq(locationShares.kind, 'ON_THE_WAY'), isNull(locationShares.endedAt), gt(locationShares.endsBy, now)))
      .orderBy(asc(bookingShifts.startsAt))
      .limit(1);
    const r = rows[0];
    if (!r || !this.live(r.share, now)) return { status: 'NONE' };
    const home = await this.places.pointForBooking(bookingId);
    return { status: 'ON_THE_WAY', shiftId: r.share.shiftId, caregiverName: firstName(r.name), startsAt: new Date(r.startsAt).toISOString(), home, ...this.view(r.share, home, settings.farMetres, now) };
  }

  /** Staff: everyone sharing right now. */
  async staffLive(now = new Date()): Promise<StaffLiveShare[]> {
    const settings = await this.checkIns.settings();
    const rows = await this.db
      .select({
        share: locationShares,
        reference: bookings.reference,
        startsAt: bookingShifts.startsAt,
        caregiverName: caregivers.fullName,
        registration: caregivers.registrationNumber,
        clientName: patients.fullName,
      })
      .from(locationShares)
      .innerJoin(bookingShifts, eq(locationShares.shiftId, bookingShifts.id))
      .innerJoin(bookings, eq(locationShares.bookingId, bookings.id))
      .innerJoin(patients, eq(bookings.patientId, patients.id))
      .innerJoin(caregivers, eq(locationShares.caregiverId, caregivers.id))
      .where(and(isNull(locationShares.endedAt), gt(locationShares.endsBy, now)))
      .orderBy(asc(bookingShifts.startsAt))
      .limit(500);
    const out: StaffLiveShare[] = [];
    for (const r of rows) {
      const home = await this.places.pointForBooking(r.share.bookingId);
      const v = this.view(r.share, home, settings.farMetres, now);
      out.push({
        shareId: r.share.id,
        kind: r.share.kind,
        shiftId: r.share.shiftId,
        bookingId: r.share.bookingId,
        bookingReference: r.reference,
        caregiverName: r.caregiverName,
        caregiverRegistration: r.registration,
        clientName: r.clientName,
        startsAt: new Date(r.startsAt).toISOString(),
        startedAt: new Date(r.share.startedAt).toISOString(),
        home,
        ...v,
        position: v.position ? { ...v.position, mocked: r.share.lastMocked } : null,
      });
    }
    return out;
  }

  // --- the sweep ----------------------------------------------------------------------------

  /**
   * Every two minutes: close shares past their hard stop, remind caregivers
   * to tap On my way, and (once an hour is plenty, but it is cheap) delete
   * points older than the retention days.
   */
  async sweep(now = new Date()): Promise<{ closed: number; reminded: number; deleted: number }> {
    const settings = await this.checkIns.settings();
    let closed = 0;
    // Past the hard stop: the shift ended (SHIFT_ENDED) or the cap came first (CAP).
    const overdue = await this.db
      .select({ id: locationShares.id, endsBy: locationShares.endsBy, shiftEnds: bookingShifts.endsAt })
      .from(locationShares)
      .innerJoin(bookingShifts, eq(locationShares.shiftId, bookingShifts.id))
      .where(and(isNull(locationShares.endedAt), lte(locationShares.endsBy, now)))
      .limit(500);
    for (const o of overdue) {
      const reason = new Date(o.shiftEnds).getTime() <= now.getTime() ? 'SHIFT_ENDED' : 'CAP';
      await this.db.update(locationShares).set({ endedAt: new Date(o.endsBy), endReason: reason }).where(eq(locationShares.id, o.id));
      closed++;
    }
    // Live location turned off: every open share closes.
    if (!settings.enabled || !settings.liveEnabled) {
      const open = await this.db.select({ id: locationShares.id }).from(locationShares).where(isNull(locationShares.endedAt)).limit(500);
      if (open.length) {
        await this.db.update(locationShares).set({ endedAt: now, endReason: 'TURNED_OFF' }).where(inArray(locationShares.id, open.map((o) => o.id)));
        closed += open.length;
      }
    }
    // Closed visit checks: keep the dot strip and counts, so they outlive the points.
    const unsummed = await this.db
      .select()
      .from(locationShares)
      .where(and(eq(locationShares.kind, 'ON_SHIFT'), isNotNull(locationShares.endedAt), isNull(locationShares.summary)))
      .limit(200);
    for (const share of unsummed) {
      const p = await presenceOf(this.db, share, now);
      await this.db.update(locationShares).set({ summary: { slots: p.slots, inside: p.inside, away: p.away, none: p.none, mocked: p.mocked } }).where(eq(locationShares.id, share.id));
    }
    const reminded = settings.enabled && settings.liveEnabled ? await this.remindOnMyWay(now, settings.onMyWayMinutes) : 0;
    const cutoff = new Date(now.getTime() - settings.locationRetentionDays * 86_400_000);
    const deleted = await this.db.delete(locationPoints).where(lt(locationPoints.at, cutoff));
    return { closed, reminded, deleted: (deleted as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0 };
  }

  /** At the start of the On my way window: a push to the caregiver, once per shift. */
  private async remindOnMyWay(now: Date, minutes: number): Promise<number> {
    const due = await this.db
      .select({ shiftId: bookingShifts.id, startsAt: bookingShifts.startsAt, userId: caregivers.userId })
      .from(bookingShifts)
      .innerJoin(bookings, eq(bookingShifts.bookingId, bookings.id))
      .innerJoin(caregivers, eq(bookingShifts.caregiverId, caregivers.id))
      .leftJoin(shiftCheckins, eq(shiftCheckins.shiftId, bookingShifts.id))
      .leftJoin(locationNotices, and(eq(locationNotices.shiftId, bookingShifts.id), eq(locationNotices.kind, 'ON_MY_WAY_REMINDER')))
      .where(
        and(
          eq(bookings.status, 'CONFIRMED'),
          isNull(bookings.paymentHoldInvoiceId),
          eq(bookingShifts.status, 'SCHEDULED'),
          isNull(bookingShifts.cantMakeAt),
          isNull(shiftCheckins.checkedInAt),
          isNull(locationNotices.shiftId),
          // From the window's opening until 15 minutes before the start: later, the live-care agent takes over.
          lte(bookingShifts.startsAt, new Date(now.getTime() + minutes * 60_000)),
          gte(bookingShifts.startsAt, new Date(now.getTime() + 15 * 60_000)),
        ),
      )
      .limit(200);
    if (!due.length) return 0;
    const sharing = await this.db.select({ shiftId: locationShares.shiftId }).from(locationShares).where(inArray(locationShares.shiftId, due.map((d) => d.shiftId)));
    const already = new Set(sharing.map((s) => s.shiftId));
    let sent = 0;
    for (const d of due) {
      await this.db.insert(locationNotices).ignore().values({ shiftId: d.shiftId, kind: 'ON_MY_WAY_REMINDER' });
      if (already.has(d.shiftId) || !d.userId) continue;
      const time = toColombo(d.startsAt).time;
      this.notices.notify([d.userId], (lang) => ({ title: ON_MY_WAY_REMINDER[lang].title.replace('{time}', time), body: ON_MY_WAY_REMINDER[lang].body }), '/shifts', `on my way reminder ${d.shiftId}`);
      sent++;
    }
    return sent;
  }
}

/** The first word of a name: how a client knows their caregiver. */
export function firstName(full: string | null | undefined): string {
  return (full ?? '').trim().split(/\s+/)[0] || 'Your caregiver';
}
