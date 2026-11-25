import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';
import {
  ARRIVAL_CODE_LENGTH,
  CHECK_IN_MAX_WRONG_CODES,
  CHECK_IN_SETTINGS_LIMITS,
  CHECK_IN_USELESS_ACCURACY_M,
  DEFAULT_CHECK_IN_SETTINGS,
  addDays,
  arrivalCodeShown,
  checkInOpen,
  colomboToUtc,
  colomboToday,
  distanceMetres,
  isFarFromHome,
  etaFrom,
  minutesLate,
  toColombo,
  visitState,
  type CaregiverCheckIn,
  type CheckInDistanceFrom,
  type CheckInInput,
  type CheckInSettings,
  type ClientVisit,
  type GeoPoint,
  type NearHomeAnswer,
  type StaffCheckIn,
  type StaffCheckInInput,
  type TodayVisits,
} from '@care-platform/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { bookingShifts, bookings, caregivers, checkInSettings, cities, districts, patients, requestOffers, shiftCheckins, users } from '../database/schema';
import { closeCoverOffers } from '../cover/cover-jobs';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { deriveKey } from '../common/utils/secret-box.util';
import { NotificationsService } from '../notifications/notifications.service';
import { JobsService } from '../jobs/jobs.service';
import { AutomationService } from '../automation/automation.service';
import { CareLocationsService } from '../care-locations/care-locations.service';
import { closeShares, openShares } from './location-shares.db';
import { nudgeLiveCare } from './live-care-jobs';
import type { UpdateCheckInSettingsDto } from './dto/check-in.dto';

const SETTINGS_ID = 'default';
type SettingsRow = typeof checkInSettings.$inferSelect;
type CheckinRow = typeof shiftCheckins.$inferSelect;
type Times = { id: string; startsAt: Date | string; endsAt: Date | string };

const toSettings = (row: SettingsRow): CheckInSettings => ({
  enabled: row.enabled,
  earlyMinutes: row.earlyMinutes,
  lateAfterMinutes: row.lateAfterMinutes,
  farMetres: row.farMetres,
  liveEnabled: row.liveEnabled,
  onMyWayMinutes: row.onMyWayMinutes,
  locationRetentionDays: row.locationRetentionDays,
});
const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

/** "Your caregiver has arrived" - the client's bell and push, in their language. */
const ARRIVED = {
  en: { title: 'Your caregiver has arrived', body: 'They checked in at {time}.' },
  si: { title: 'ඔබගේ රැකවරණ සේවකයා පැමිණ ඇත', body: 'ඔවුන් {time} ට පැමිණීම සටහන් කළා.' },
  ta: { title: 'உங்கள் பராமரிப்பாளர் வந்துவிட்டார்', body: 'அவர்கள் {time} மணிக்கு வருகையைப் பதிவுசெய்தனர்.' },
} as const;

/**
 * Shift check-in. The caregiver arrives, asks the client for the shift's
 * four-digit arrival code and enters it; they check out when they leave.
 * Staff can record either on their behalf - the manual way always works.
 *
 * What it is careful about:
 *  - The code is never stored: it is worked out from the shift's id and a
 *    server key, so the client, the staff page and the check are always
 *    talking about the same four digits.
 *  - Five wrong codes lock that shift's code; after that only the office can
 *    check the caregiver in.
 *  - A phone's position is recorded when it can give one and never required.
 *    It is measured from the booking's place on the map (care_locations) or,
 *    with none, from where its first visit checked in; a check-in clearly
 *    outside the home's circle, or one the phone says was simulated, is
 *    pointed out to staff, not refused.
 *  - A check-in never changes the shift: not its status, its times or what
 *    is billed for it.
 *
 * With check-in switched off (the default) the caregiver and client views
 * carry nothing, and both check-in routes refuse.
 */
/** Today's visits shown at most; a bigger day says so on the page. */
const TODAY_MAX = 2000;

@Injectable()
export class CheckInService {
  private readonly logger = new Logger(CheckInService.name);
  private readonly key: Buffer;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    config: ConfigService,
    private readonly notices: NotificationsService,
    private readonly jobs: JobsService,
    private readonly automation: AutomationService,
    private readonly places: CareLocationsService,
  ) {
    this.key = deriveKey(config.get<string>('SETTINGS_ENCRYPTION_KEY') || config.get<string>('JWT_REFRESH_SECRET') || 'care-platform', 'arrival-code');
  }

  // --- settings ----------------------------------------------------------------

  private async settingsRow(): Promise<SettingsRow> {
    const [existing] = await this.db.select().from(checkInSettings).where(eq(checkInSettings.id, SETTINGS_ID)).limit(1);
    if (existing) return existing;
    await this.db.insert(checkInSettings).values({ id: SETTINGS_ID }).onDuplicateKeyUpdate({ set: { id: SETTINGS_ID } });
    const [created] = await this.db.select().from(checkInSettings).where(eq(checkInSettings.id, SETTINGS_ID)).limit(1);
    return created;
  }

  /** Never throws: a broken settings read means "off", so bookings and rosters still load. */
  async settings(): Promise<CheckInSettings> {
    try {
      return toSettings(await this.settingsRow());
    } catch {
      return DEFAULT_CHECK_IN_SETTINGS;
    }
  }

  async settingsForAdmin(): Promise<CheckInSettings & { updatedAt: Date }> {
    const row = await this.settingsRow();
    return { ...toSettings(row), updatedAt: row.updatedAt };
  }

  async updateSettings(dto: UpdateCheckInSettingsDto, userId: string) {
    const next: Partial<typeof checkInSettings.$inferInsert> = { updatedBy: userId, updatedAt: new Date() };
    if (dto.enabled !== undefined) next.enabled = dto.enabled;
    if (dto.earlyMinutes !== undefined) {
      const { min, max } = CHECK_IN_SETTINGS_LIMITS.earlyMinutes;
      if (dto.earlyMinutes < min || dto.earlyMinutes > max) throw new BadRequestException(`Early check-in must be between ${min} and ${max} minutes`);
      next.earlyMinutes = dto.earlyMinutes;
    }
    if (dto.lateAfterMinutes !== undefined) {
      const { min, max } = CHECK_IN_SETTINGS_LIMITS.lateAfterMinutes;
      if (dto.lateAfterMinutes < min || dto.lateAfterMinutes > max) throw new BadRequestException(`"Late after" must be between ${min} and ${max} minutes`);
      next.lateAfterMinutes = dto.lateAfterMinutes;
    }
    if (dto.farMetres !== undefined) {
      const { min, max } = CHECK_IN_SETTINGS_LIMITS.farMetres;
      if (dto.farMetres < min || dto.farMetres > max) throw new BadRequestException(`"Far from the home" must be between ${min} and ${max} metres`);
      next.farMetres = dto.farMetres;
    }
    if (dto.liveEnabled !== undefined) next.liveEnabled = dto.liveEnabled;
    if (dto.onMyWayMinutes !== undefined) {
      const { min, max } = CHECK_IN_SETTINGS_LIMITS.onMyWayMinutes;
      if (dto.onMyWayMinutes < min || dto.onMyWayMinutes > max) throw new BadRequestException(`"On my way opens" must be between ${min} and ${max} minutes`);
      next.onMyWayMinutes = dto.onMyWayMinutes;
    }
    if (dto.locationRetentionDays !== undefined) {
      const { min, max } = CHECK_IN_SETTINGS_LIMITS.locationRetentionDays;
      if (dto.locationRetentionDays < min || dto.locationRetentionDays > max) throw new BadRequestException(`Keeping location points must be between ${min} and ${max} days`);
      next.locationRetentionDays = dto.locationRetentionDays;
    }
    await this.settingsRow();
    await this.db.update(checkInSettings).set(next).where(eq(checkInSettings.id, SETTINGS_ID));
    return this.settingsForAdmin();
  }

  // --- the code ------------------------------------------------------------------

  /** The shift's arrival code: the same four digits for anyone who asks, and nothing a caregiver could work out. */
  arrivalCode(shiftId: string): string {
    const digest = createHmac('sha256', this.key).update(shiftId).digest();
    return String(digest.readUInt32BE(0) % 10 ** ARRIVAL_CODE_LENGTH).padStart(ARRIVAL_CODE_LENGTH, '0');
  }

  private codeMatches(shiftId: string, given: string): boolean {
    const want = Buffer.from(this.arrivalCode(shiftId));
    const got = Buffer.from(given.replace(/\D/g, ''));
    return got.length === want.length && timingSafeEqual(got, want);
  }

  // --- views -----------------------------------------------------------------------

  private async rowsFor(shiftIds: string[]): Promise<Map<string, CheckinRow>> {
    if (!shiftIds.length) return new Map();
    const rows = await this.db.select().from(shiftCheckins).where(inArray(shiftCheckins.shiftId, shiftIds));
    return new Map(rows.map((r) => [r.shiftId, r]));
  }

  /** For GET /me/shifts: each shift's check-in as its caregiver sees it. Empty when check-in is off. */
  async forCaregiver(shifts: (Times & { status: string })[], now = new Date()): Promise<Map<string, CaregiverCheckIn>> {
    const settings = await this.settings();
    const out = new Map<string, CaregiverCheckIn>();
    if (!settings.enabled) return out;
    const live = shifts.filter((s) => s.status === 'SCHEDULED' || s.status === 'COMPLETED');
    const rows = await this.rowsFor(live.map((s) => s.id));
    const shares = settings.liveEnabled ? await openShares(this.db, live.map((s) => s.id)) : new Map();
    for (const s of live) {
      const row = rows.get(s.id);
      const times = { startsAt: s.startsAt, endsAt: s.endsAt, checkedInAt: row?.checkedInAt ?? null, checkedOutAt: row?.checkedOutAt ?? null };
      const share = shares.get(s.id);
      const shareOpen = share && new Date(share.endsBy).getTime() > now.getTime();
      out.set(s.id, {
        onMyWay:
          settings.liveEnabled && s.status === 'SCHEDULED' && !times.checkedInAt && new Date(s.endsAt).getTime() > now.getTime()
            ? {
                opensAt: new Date(new Date(s.startsAt).getTime() - settings.onMyWayMinutes * 60_000).toISOString(),
                shareId: shareOpen ? share.id : null,
                sharingSince: shareOpen ? new Date(share.startedAt).toISOString() : null,
              }
            : null,
        state: visitState(times, settings, now),
        opensAt: new Date(new Date(s.startsAt).getTime() - settings.earlyMinutes * 60_000).toISOString(),
        checkedInAt: iso(times.checkedInAt),
        checkedOutAt: iso(times.checkedOutAt),
        codeLocked: !row?.checkedInAt && (row?.wrongCodes ?? 0) >= CHECK_IN_MAX_WRONG_CODES,
      });
    }
    return out;
  }

  /** For GET /me/bookings: each shift's visit as the client sees it - the code only while it is useful. Empty when off. */
  async forClient(shifts: (Times & { status: string })[], now = new Date()): Promise<Map<string, ClientVisit>> {
    const settings = await this.settings();
    const out = new Map<string, ClientVisit>();
    if (!settings.enabled) return out;
    const live = shifts.filter((s) => s.status === 'SCHEDULED' || s.status === 'COMPLETED');
    const rows = await this.rowsFor(live.map((s) => s.id));
    const shares = settings.liveEnabled ? await openShares(this.db, live.map((s) => s.id)) : new Map();
    for (const s of live) {
      const row = rows.get(s.id);
      const times = { startsAt: s.startsAt, endsAt: s.endsAt, checkedInAt: row?.checkedInAt ?? null, checkedOutAt: row?.checkedOutAt ?? null };
      const share = shares.get(s.id);
      out.set(s.id, {
        onTheWay: Boolean(share && !times.checkedInAt && new Date(share.endsBy).getTime() > now.getTime()),
        arrivalCode: s.status === 'SCHEDULED' && arrivalCodeShown(times, now) ? this.arrivalCode(s.id) : null,
        checkedInAt: iso(times.checkedInAt),
        checkedOutAt: iso(times.checkedOutAt),
      });
    }
    return out;
  }

  /** For the staff booking page and Today's visits: everything about each shift's check-in. Empty when off. */
  async forStaff(shifts: Times[], now = new Date(), known?: CheckInSettings): Promise<Map<string, StaffCheckIn>> {
    const settings = known ?? (await this.settings());
    const out = new Map<string, StaffCheckIn>();
    if (!settings.enabled) return out;
    const rows = await this.rowsFor(shifts.map((s) => s.id));
    const actorIds = [...new Set([...rows.values()].flatMap((r) => [r.inByUserId, r.outByUserId]).filter((v): v is string => !!v))];
    const names = actorIds.length
      ? new Map((await this.db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, actorIds))).map((u) => [u.id, u.fullName]))
      : new Map<string, string>();
    const shares = settings.liveEnabled ? await openShares(this.db, shifts.map((s) => s.id)) : new Map();
    for (const s of shifts) {
      const row = rows.get(s.id);
      const share = shares.get(s.id);
      const shareOpen = share && !row?.checkedInAt && new Date(share.endsBy).getTime() > now.getTime();
      const eta = shareOpen ? etaFrom(share.lastDistanceM ?? null, now, settings.farMetres) : null;
      const point = (lat: number | null | undefined, lng: number | null | undefined, acc: number | null | undefined) =>
        lat === null || lat === undefined || lng === null || lng === undefined ? null : { latitude: Number(lat), longitude: Number(lng), accuracyM: acc ?? null };
      out.set(s.id, {
        state: visitState({ startsAt: s.startsAt, endsAt: s.endsAt, checkedInAt: row?.checkedInAt ?? null, checkedOutAt: row?.checkedOutAt ?? null }, settings, now),
        arrivalCode: this.arrivalCode(s.id),
        wrongCodes: row?.wrongCodes ?? 0,
        codeLocked: !row?.checkedInAt && (row?.wrongCodes ?? 0) >= CHECK_IN_MAX_WRONG_CODES,
        checkedInAt: iso(row?.checkedInAt ?? null),
        inBy: row?.inBy ?? null,
        inByName: row?.inByUserId ? (names.get(row.inByUserId) ?? null) : null,
        inNote: row?.inNote ?? null,
        inLocation: point(row?.inLatitude, row?.inLongitude, row?.inAccuracyM),
        inDistanceM: row?.inDistanceM ?? null,
        inDistanceFrom: row?.inDistanceFrom ?? null,
        inFar: isFarFromHome(row?.inDistanceM ?? null, row?.inAccuracyM ?? null, settings.farMetres),
        inMocked: row?.inMocked ?? false,
        checkedOutAt: iso(row?.checkedOutAt ?? null),
        outBy: row?.outBy ?? null,
        outByName: row?.outByUserId ? (names.get(row.outByUserId) ?? null) : null,
        outNote: row?.outNote ?? null,
        outLocation: point(row?.outLatitude, row?.outLongitude, row?.outAccuracyM),
        outDistanceM: row?.outDistanceM ?? null,
        outFar: isFarFromHome(row?.outDistanceM ?? null, row?.outAccuracyM ?? null, settings.farMetres),
        outMocked: row?.outMocked ?? false,
        onTheWay: shareOpen && eta ? { shareId: share.id, etaMinutes: eta.minutes, arriving: eta.arriving, updatedAt: iso(share.lastAt) } : null,
      });
    }
    return out;
  }

  /** Today's roster (Sri Lanka's day) with where every visit stands - what staff watch, and later the live-care agent. */
  async today(now = new Date()): Promise<TodayVisits> {
    const settings = await this.settings();
    const date = colomboToday(now);
    const from = colomboToUtc(date, '00:00');
    const to = colomboToUtc(addDays(date, 1), '00:00');
    const rows = await this.db
      .select({
        shiftId: bookingShifts.id,
        bookingId: bookings.id,
        reference: bookings.reference,
        paused: bookings.paymentHoldInvoiceId,
        cantMakeAt: bookingShifts.cantMakeAt,
        cantMakeNote: bookingShifts.cantMakeNote,
        startsAt: bookingShifts.startsAt,
        endsAt: bookingShifts.endsAt,
        status: bookingShifts.status,
        bookedCaregiverId: bookings.caregiverId,
        patientId: patients.id,
        patientName: patients.fullName,
        recipientName: patients.recipientName,
        city: cities.nameEn,
        district: districts.nameEn,
        caregiverId: caregivers.id,
        caregiverName: caregivers.fullName,
        registrationNumber: caregivers.registrationNumber,
        phone: caregivers.primaryPhone,
      })
      .from(bookingShifts)
      .innerJoin(bookings, eq(bookingShifts.bookingId, bookings.id))
      .innerJoin(patients, eq(bookings.patientId, patients.id))
      .innerJoin(caregivers, eq(bookingShifts.caregiverId, caregivers.id))
      .leftJoin(cities, eq(patients.cityId, cities.id))
      .leftJoin(districts, eq(patients.districtId, districts.id))
      .where(and(inArray(bookingShifts.status, ['SCHEDULED', 'COMPLETED', 'MISSED']), ne(bookings.status, 'DRAFT'), lt(bookingShifts.startsAt, to), gt(bookingShifts.endsAt, from)))
      .orderBy(asc(bookingShifts.startsAt), asc(bookings.reference))
      // One more than shown, to know whether the day had more (said on the page rather than dropped quietly).
      .limit(TODAY_MAX + 1);
    const truncated = rows.length > TODAY_MAX;
    if (truncated) rows.length = TODAY_MAX;
    // With check-in off the page still lists the day; each visit simply has nothing recorded.
    const views = await this.forStaff(rows.map((r) => ({ id: r.shiftId, startsAt: r.startsAt, endsAt: r.endsAt })), now, { ...settings, enabled: true });
    const waiting = rows.length
      ? await this.db
          .select({ shiftId: requestOffers.shiftId, n: sql<number>`COUNT(*)` })
          .from(requestOffers)
          .where(and(inArray(requestOffers.shiftId, rows.map((r) => r.shiftId)), eq(requestOffers.status, 'OFFERED'), gt(requestOffers.expiresAt, now)))
          .groupBy(requestOffers.shiftId)
      : [];
    const coverWaiting = new Map(waiting.map((w) => [w.shiftId, Number(w.n)]));
    return {
      settings,
      date,
      truncated,
      visits: rows.map((r) => {
        const checkIn = views.get(r.shiftId)!;
        return {
          shiftId: r.shiftId,
          bookingId: r.bookingId,
          bookingReference: r.reference,
          startsAt: new Date(r.startsAt).toISOString(),
          endsAt: new Date(r.endsAt).toISOString(),
          shiftStatus: r.status,
          client: { id: r.patientId, fullName: r.patientName, recipientName: r.recipientName, area: [r.city, r.district].filter(Boolean).join(', ') || null },
          caregiver: { id: r.caregiverId, fullName: r.caregiverName, registrationNumber: r.registrationNumber, phone: r.phone },
          isCover: r.bookedCaregiverId !== r.caregiverId,
          minutesLate: r.status === 'SCHEDULED' && checkIn.state === 'LATE' ? minutesLate({ startsAt: r.startsAt }, now) : null,
          checkIn,
          coverWaiting: coverWaiting.get(r.shiftId) ?? 0,
          paused: Boolean(r.paused),
          cantMake: r.cantMakeAt ? { at: r.cantMakeAt.toISOString(), note: r.cantMakeNote } : null,
        };
      }),
    };
  }

  /** How many scheduled visits have started with nobody checked in, past the grace period. Zero when check-in is off. */
  async lateCount(now = new Date()): Promise<number> {
    const settings = await this.settings();
    if (!settings.enabled) return 0;
    const rows = await this.db
      .select({ id: bookingShifts.id, startsAt: bookingShifts.startsAt, endsAt: bookingShifts.endsAt, checkedInAt: shiftCheckins.checkedInAt, checkedOutAt: shiftCheckins.checkedOutAt })
      .from(bookingShifts)
      .innerJoin(bookings, eq(bookingShifts.bookingId, bookings.id))
      .leftJoin(shiftCheckins, eq(shiftCheckins.shiftId, bookingShifts.id))
      .where(and(eq(bookingShifts.status, 'SCHEDULED'), eq(bookings.status, 'CONFIRMED'), isNull(bookings.paymentHoldInvoiceId), lt(bookingShifts.startsAt, now), gt(bookingShifts.endsAt, now)))
      .limit(1000);
    return rows.filter((r) => visitState(r, settings, now) === 'LATE').length;
  }

  // --- the caregiver checks in and out ----------------------------------------------

  /** A caregiver's own shift (anyone else's is "not found"). Also used by On my way. */
  async caregiverShift(user: AuthenticatedUser, shiftId: string) {
    if (user.role !== 'CAREGIVER' || !user.caregiverId) throw new ForbiddenException('You do not have permission to perform this action');
    const [shift] = await this.db
      .select({
        id: bookingShifts.id,
        bookingId: bookingShifts.bookingId,
        startsAt: bookingShifts.startsAt,
        endsAt: bookingShifts.endsAt,
        status: bookingShifts.status,
        bookingStatus: bookings.status,
        paused: bookings.paymentHoldInvoiceId,
        cantMakeAt: bookingShifts.cantMakeAt,
        patientUserId: patients.userId,
      })
      .from(bookingShifts)
      .innerJoin(bookings, eq(bookingShifts.bookingId, bookings.id))
      .innerJoin(patients, eq(bookings.patientId, patients.id))
      .where(and(eq(bookingShifts.id, shiftId), eq(bookingShifts.caregiverId, user.caregiverId)))
      .limit(1);
    // Someone else's shift and a shift that does not exist get the same answer.
    if (!shift || shift.bookingStatus === 'DRAFT' || shift.status === 'DRAFT') throw new NotFoundException('Shift not found');
    return shift;
  }

  private position(input: { latitude?: number; longitude?: number; accuracyM?: number }): (GeoPoint & { accuracyM: number | null }) | null {
    const { latitude, longitude } = input;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return { latitude, longitude, accuracyM: typeof input.accuracyM === 'number' && input.accuracyM >= 0 ? Math.min(Math.round(input.accuracyM), 100_000) : null };
  }

  /**
   * Metres from the booking's place on the map; with none, from the first
   * located check-in on the same booking (another shift's). Null when there
   * is nothing to compare with.
   */
  private async distanceFromHome(bookingId: string, shiftId: string, here: GeoPoint | null): Promise<{ metres: number | null; from: CheckInDistanceFrom | null }> {
    if (!here) return { metres: null, from: null };
    const pin = await this.places.pointForBooking(bookingId);
    if (pin) return { metres: distanceMetres(pin, here), from: 'PIN' };
    const [first] = await this.db
      .select({ latitude: shiftCheckins.inLatitude, longitude: shiftCheckins.inLongitude })
      .from(shiftCheckins)
      .where(and(eq(shiftCheckins.bookingId, bookingId), ne(shiftCheckins.shiftId, shiftId), isNotNull(shiftCheckins.checkedInAt), isNotNull(shiftCheckins.inLatitude), isNotNull(shiftCheckins.inLongitude)))
      .orderBy(asc(shiftCheckins.checkedInAt))
      .limit(1);
    if (!first || first.latitude === null || first.longitude === null) return { metres: null, from: null };
    return { metres: distanceMetres({ latitude: Number(first.latitude), longitude: Number(first.longitude) }, here), from: 'EARLIER' };
  }

  /**
   * "You're at the client's home": asked by the app when the caregiver opens
   * check-in, so they know their phone agrees before they ask for the code.
   * Answers only yes, no or can't say - never where the home is.
   */
  async nearHome(user: AuthenticatedUser, shiftId: string, input: { latitude?: number; longitude?: number; accuracyM?: number }, now = new Date()): Promise<NearHomeAnswer> {
    const settings = await this.settings();
    if (!settings.enabled) return { atHome: null };
    const shift = await this.caregiverShift(user, shiftId);
    if (shift.status !== 'SCHEDULED') return { atHome: null };
    const state = visitState({ startsAt: shift.startsAt, endsAt: shift.endsAt, checkedInAt: null, checkedOutAt: null }, settings, now);
    if (!checkInOpen(state)) return { atHome: null };
    const here = this.position(input);
    if (!here || (here.accuracyM !== null && here.accuracyM > CHECK_IN_USELESS_ACCURACY_M)) return { atHome: null };
    const pin = await this.places.pointForBooking(shift.bookingId);
    if (!pin) return { atHome: null };
    return { atHome: !isFarFromHome(distanceMetres(pin, here), here.accuracyM, settings.farMetres) };
  }

  async checkIn(user: AuthenticatedUser, shiftId: string, input: CheckInInput, now = new Date()): Promise<void> {
    const settings = await this.settings();
    if (!settings.enabled) throw new BadRequestException('Check-in is not switched on');
    const shift = await this.caregiverShift(user, shiftId);
    if (shift.status !== 'SCHEDULED') throw new BadRequestException('This shift is not open for check-in');
    const [row] = await this.db.select().from(shiftCheckins).where(eq(shiftCheckins.shiftId, shiftId)).limit(1);
    if (row?.checkedInAt) return; // a second tap, or a retry after a lost reply
    if (shift.paused) throw new BadRequestException('Visits on this booking are paused - please call the office');
    const state = visitState({ startsAt: shift.startsAt, endsAt: shift.endsAt, checkedInAt: null, checkedOutAt: null }, settings, now);
    if (state === 'UPCOMING') throw new BadRequestException('It is too early to check in for this shift');
    if (!checkInOpen(state)) throw new BadRequestException('This shift has ended - ask the office to record your visit');
    if ((row?.wrongCodes ?? 0) >= CHECK_IN_MAX_WRONG_CODES) throw new BadRequestException('Too many wrong codes - ask the office to check you in');

    if (!this.codeMatches(shiftId, input.code ?? '')) {
      await this.db
        .insert(shiftCheckins)
        .values({ shiftId, bookingId: shift.bookingId, wrongCodes: 1 })
        .onDuplicateKeyUpdate({ set: { wrongCodes: sql`${shiftCheckins.wrongCodes} + 1`, updatedAt: now } });
      const left = CHECK_IN_MAX_WRONG_CODES - ((row?.wrongCodes ?? 0) + 1);
      throw new BadRequestException(left > 0 ? 'That code is not right - ask the client to read it to you again' : 'Too many wrong codes - ask the office to check you in');
    }

    const here = this.position(input);
    const distance = await this.distanceFromHome(shift.bookingId, shiftId, here);
    const record = {
      checkedInAt: now,
      inBy: 'CAREGIVER' as const,
      inByUserId: user.userId,
      inLatitude: here?.latitude ?? null,
      inLongitude: here?.longitude ?? null,
      inAccuracyM: here?.accuracyM ?? null,
      inDistanceM: distance.metres,
      inDistanceFrom: distance.from,
      inMocked: Boolean(here && input.mocked),
      updatedAt: now,
    };
    await this.db.insert(shiftCheckins).values({ shiftId, bookingId: shift.bookingId, ...record }).onDuplicateKeyUpdate({ set: record });
    // Arrived: "On my way" is over.
    await closeShares(this.db, shiftId, 'CHECKED_IN', now, 'ON_THE_WAY');
    // No place on the map yet: keep this one as a suggestion for staff to confirm (a fake position is no suggestion).
    if (here && !input.mocked && distance.from !== 'PIN' && (here.accuracyM === null || here.accuracyM <= 100)) {
      await this.places.suggestFromCheckIn(shift.bookingId, shiftId, here, now);
    }
    // The caregiver came after all: anyone offered this shift as cover is told it is no longer open.
    await closeCoverOffers(this.db, this.jobs, shiftId);
    this.tellClient(shift.patientUserId, now, shiftId);
  }

  async checkOut(user: AuthenticatedUser, shiftId: string, input: Omit<CheckInInput, 'code'>, now = new Date()): Promise<void> {
    const settings = await this.settings();
    if (!settings.enabled) throw new BadRequestException('Check-in is not switched on');
    const shift = await this.caregiverShift(user, shiftId);
    const [row] = await this.db.select().from(shiftCheckins).where(eq(shiftCheckins.shiftId, shiftId)).limit(1);
    if (!row?.checkedInAt) throw new BadRequestException('Check in before you check out');
    if (row.checkedOutAt) return;
    const here = this.position(input);
    const pin = here ? await this.places.pointForBooking(shift.bookingId) : null;
    await this.db
      .update(shiftCheckins)
      .set({
        checkedOutAt: now,
        outBy: 'CAREGIVER',
        outByUserId: user.userId,
        outLatitude: here?.latitude ?? null,
        outLongitude: here?.longitude ?? null,
        outAccuracyM: here?.accuracyM ?? null,
        outDistanceM: here && pin ? distanceMetres(pin, here) : null,
        outMocked: Boolean(here && input.mocked),
        updatedAt: now,
      })
      .where(eq(shiftCheckins.shiftId, shift.id));
    // The live-care agent, when it is switched on, marks the shift done.
    await nudgeLiveCare(this.jobs, this.automation, shiftId);
  }

  // --- staff record it on the caregiver's behalf -----------------------------------

  private async anyShift(shiftId: string) {
    const [shift] = await this.db
      .select({ id: bookingShifts.id, bookingId: bookingShifts.bookingId, startsAt: bookingShifts.startsAt, endsAt: bookingShifts.endsAt, status: bookingShifts.status, bookingStatus: bookings.status })
      .from(bookingShifts)
      .innerJoin(bookings, eq(bookingShifts.bookingId, bookings.id))
      .where(eq(bookingShifts.id, shiftId))
      .limit(1);
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.bookingStatus === 'DRAFT' || shift.status === 'DRAFT' || shift.status === 'CANCELLED') throw new BadRequestException('A visit can only be recorded on a scheduled shift');
    return shift;
  }

  private when(at: string | undefined, now: Date): Date {
    if (!at) return now;
    const t = new Date(at);
    if (Number.isNaN(t.getTime())) throw new BadRequestException('Enter a valid time');
    if (t.getTime() > now.getTime() + 60_000) throw new BadRequestException('The time cannot be in the future');
    return t;
  }

  /** Staff record the arrival (the caregiver phoned, the client has no phone to hand, the code was locked). Overwrites nothing. */
  async staffCheckIn(shiftId: string, input: StaffCheckInInput, actor: AuthenticatedUser, now = new Date()): Promise<StaffCheckIn> {
    if (!(await this.settings()).enabled) throw new BadRequestException('Check-in is not switched on');
    const shift = await this.anyShift(shiftId);
    const at = this.when(input.at, now);
    if (at.getTime() < new Date(shift.startsAt).getTime() - 12 * 3_600_000) throw new BadRequestException('That is too long before the shift starts');
    const [row] = await this.db.select().from(shiftCheckins).where(eq(shiftCheckins.shiftId, shiftId)).limit(1);
    if (row?.checkedInAt) throw new BadRequestException('This visit already has a check-in');
    const record = { checkedInAt: at, inBy: 'STAFF' as const, inByUserId: actor.userId, inNote: input.note?.trim() || null, updatedAt: now };
    await this.db.insert(shiftCheckins).values({ shiftId, bookingId: shift.bookingId, ...record }).onDuplicateKeyUpdate({ set: record });
    await closeCoverOffers(this.db, this.jobs, shiftId);
    await closeShares(this.db, shiftId, 'CHECKED_IN', now, 'ON_THE_WAY');
    return (await this.forStaff([shift], now)).get(shiftId)!;
  }

  async staffCheckOut(shiftId: string, input: StaffCheckInInput, actor: AuthenticatedUser, now = new Date()): Promise<StaffCheckIn> {
    if (!(await this.settings()).enabled) throw new BadRequestException('Check-in is not switched on');
    const shift = await this.anyShift(shiftId);
    const at = this.when(input.at, now);
    const [row] = await this.db.select().from(shiftCheckins).where(eq(shiftCheckins.shiftId, shiftId)).limit(1);
    if (!row?.checkedInAt) throw new BadRequestException('Record the check-in first');
    if (row.checkedOutAt) throw new BadRequestException('This visit already has a check-out');
    if (at.getTime() < new Date(row.checkedInAt).getTime()) throw new BadRequestException('The check-out cannot be before the check-in');
    await this.db
      .update(shiftCheckins)
      .set({ checkedOutAt: at, outBy: 'STAFF', outByUserId: actor.userId, outNote: input.note?.trim() || null, updatedAt: now })
      .where(eq(shiftCheckins.shiftId, shiftId));
    await nudgeLiveCare(this.jobs, this.automation, shiftId);
    return (await this.forStaff([shift], now)).get(shiftId)!;
  }

  private tellClient(patientUserId: string | null, at: Date, shiftId: string) {
    try {
      const time = toColombo(at).time;
      this.notices.notify([patientUserId], (lang) => ({ title: ARRIVED[lang].title, body: ARRIVED[lang].body.replace('{time}', time) }), '/bookings', `arrived ${shiftId}`);
    } catch (err) {
      this.logger.warn(`Check-in ${shiftId}: the client could not be told - ${(err as Error).message}`);
    }
  }
}
