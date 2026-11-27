import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID as uuid } from 'crypto';
import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import {
  CARE_LOCATIONS_MAX,
  CARE_LOCATION_LABEL_MAX,
  insideSriLanka,
  type BookingCareLocation,
  type CareLocation,
  type CareLocationSuggestion,
  type CareLocationInput,
  type CareLocationUpdate,
  type GeoPoint,
} from '@care-platform/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { bookingShifts, bookings, careLocations, patients } from '../database/schema';

type Row = typeof careLocations.$inferSelect;
type Who = { kind: 'CLIENT'; userId: string } | { kind: 'STAFF'; userId: string };

/** The client's word for their first place when they give none. Staff see the label as typed. */
const DEFAULT_LABEL = 'Home';

export const toCareLocation = (r: Row): CareLocation => ({
  id: r.id,
  label: r.label,
  latitude: Number(r.latitude),
  longitude: Number(r.longitude),
  source: r.source,
  isDefault: r.isDefault,
  confirmed: r.confirmedAt !== null,
  updatedAt: new Date(r.updatedAt).toISOString(),
});

/** Six decimals is about 10 cm: as precise as a phone gets, and what the column keeps. */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Where care happens, as a point on the map (GPS tracking, Phase A).
 *
 * - A client has up to five places; exactly one confirmed place is their
 *   default whenever they have any.
 * - A booking uses its own place when one was picked for it, otherwise the
 *   client's default.
 * - With no place at all, the first located check-in on one of the client's
 *   bookings is kept as a suggestion (FROM_CHECKIN, unconfirmed). It is never
 *   measured from until staff confirm it - a wrong first check-in must not
 *   decide whether every later one looks right.
 * - The point is never shown to caregivers.
 */
@Injectable()
export class CareLocationsService {
  private readonly logger = new Logger(CareLocationsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private point(latitude: unknown, longitude: unknown): GeoPoint {
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('Choose the place on the map');
    }
    const p = { latitude: round6(latitude), longitude: round6(longitude) };
    if (!insideSriLanka(p)) throw new BadRequestException('That place is outside Sri Lanka - move the pin to the home');
    return p;
  }

  private label(label: string | undefined, fallback: string): string {
    const clean = (label ?? '').replace(/\s+/g, ' ').trim();
    if (clean.length > CARE_LOCATION_LABEL_MAX) throw new BadRequestException(`Keep the name to ${CARE_LOCATION_LABEL_MAX} characters`);
    return clean || fallback;
  }

  async rows(patientId: string): Promise<Row[]> {
    return this.db
      .select()
      .from(careLocations)
      .where(eq(careLocations.patientId, patientId))
      .orderBy(desc(careLocations.isDefault), asc(careLocations.createdAt));
  }

  async list(patientId: string, opts: { includeSuggestions?: boolean } = {}): Promise<CareLocation[]> {
    const rows = await this.rows(patientId);
    return rows.filter((r) => opts.includeSuggestions || r.confirmedAt !== null).map(toCareLocation);
  }

  private async own(patientId: string, id: string): Promise<Row> {
    const [row] = await this.db
      .select()
      .from(careLocations)
      .where(and(eq(careLocations.id, id), eq(careLocations.patientId, patientId)))
      .limit(1);
    if (!row) throw new NotFoundException('Place not found');
    return row;
  }

  /** Make `id` the client's only default. */
  private async makeDefault(db: Database, patientId: string, id: string, now: Date) {
    await db
      .update(careLocations)
      .set({ isDefault: false, updatedAt: now })
      .where(and(eq(careLocations.patientId, patientId), eq(careLocations.isDefault, true)));
    await db.update(careLocations).set({ isDefault: true, updatedAt: now }).where(eq(careLocations.id, id));
  }

  /** After a removal or a change: if confirmed places remain and none is the default, the oldest becomes it. */
  private async keepADefault(db: Database, patientId: string, now: Date) {
    const rows = await db
      .select()
      .from(careLocations)
      .where(and(eq(careLocations.patientId, patientId), isNotNull(careLocations.confirmedAt)))
      .orderBy(asc(careLocations.createdAt));
    if (rows.length && !rows.some((r) => r.isDefault)) await this.makeDefault(db, patientId, rows[0].id, now);
  }

  async create(patientId: string, input: CareLocationInput, who: Who, now = new Date()): Promise<CareLocation> {
    const p = this.point(input.latitude, input.longitude);
    const existing = await this.rows(patientId);
    const confirmed = existing.filter((r) => r.confirmedAt !== null);
    if (confirmed.length >= CARE_LOCATIONS_MAX) throw new BadRequestException(`A client can keep up to ${CARE_LOCATIONS_MAX} places - remove one first`);
    const id = uuid();
    await this.db.transaction(async (tx) => {
      await tx.insert(careLocations).values({
        id,
        patientId,
        label: this.label(input.label, confirmed.length ? `${DEFAULT_LABEL} ${confirmed.length + 1}` : DEFAULT_LABEL),
        latitude: p.latitude,
        longitude: p.longitude,
        source: who.kind === 'CLIENT' ? 'CLIENT_PIN' : 'STAFF',
        isDefault: false,
        confirmedAt: now,
        confirmedBy: who.userId,
        createdBy: who.userId,
        createdAt: now,
        updatedAt: now,
      });
      // A real place supersedes a suggestion from a check-in: there is nothing left to confirm.
      for (const s of existing.filter((r) => r.confirmedAt === null)) await tx.delete(careLocations).where(eq(careLocations.id, s.id));
      if (input.isDefault || !confirmed.length) await this.makeDefault(tx as unknown as Database, patientId, id, now);
    });
    return toCareLocation(await this.own(patientId, id));
  }

  async update(patientId: string, id: string, input: CareLocationUpdate, who: Who, now = new Date()): Promise<CareLocation> {
    const row = await this.own(patientId, id);
    if (input.confirm && who.kind !== 'STAFF') throw new ForbiddenException('Only the office can confirm a suggested place');
    // A client never sees a suggestion, so cannot change one.
    if (row.confirmedAt === null && who.kind === 'CLIENT') throw new NotFoundException('Place not found');
    const next: Partial<typeof careLocations.$inferInsert> = { updatedAt: now };
    if (input.label !== undefined) next.label = this.label(input.label, row.label);
    if (input.latitude !== undefined || input.longitude !== undefined) {
      const p = this.point(input.latitude ?? Number(row.latitude), input.longitude ?? Number(row.longitude));
      next.latitude = p.latitude;
      next.longitude = p.longitude;
      // Moved by hand: it is no longer just what a check-in said.
      next.source = who.kind === 'CLIENT' ? 'CLIENT_PIN' : 'STAFF';
      next.confirmedAt = now;
      next.confirmedBy = who.userId;
    }
    if (input.confirm && row.confirmedAt === null) {
      next.confirmedAt = now;
      next.confirmedBy = who.userId;
    }
    await this.db.transaction(async (tx) => {
      await tx.update(careLocations).set(next).where(eq(careLocations.id, id));
      const confirmedNow = next.confirmedAt !== undefined || row.confirmedAt !== null;
      if (input.isDefault && confirmedNow) await this.makeDefault(tx as unknown as Database, patientId, id, now);
      await this.keepADefault(tx as unknown as Database, patientId, now);
    });
    return toCareLocation(await this.own(patientId, id));
  }

  async remove(patientId: string, id: string, who: Who, now = new Date()): Promise<void> {
    const row = await this.own(patientId, id);
    if (row.confirmedAt === null && who.kind === 'CLIENT') throw new NotFoundException('Place not found');
    await this.db.transaction(async (tx) => {
      // Bookings that named it go back to the client's default.
      await tx.update(bookings).set({ careLocationId: null }).where(eq(bookings.careLocationId, id));
      await tx.delete(careLocations).where(eq(careLocations.id, id));
      await this.keepADefault(tx as unknown as Database, patientId, now);
    });
  }

  // --- bookings ------------------------------------------------------------------

  private async bookingRow(bookingId: string) {
    const [b] = await this.db
      .select({ id: bookings.id, patientId: bookings.patientId, careLocationId: bookings.careLocationId })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!b) throw new NotFoundException('Booking not found');
    return b;
  }

  /** The confirmed place a booking's check-ins are measured from: its own, else the client's default. Null when there is none. */
  async pointForBooking(bookingId: string): Promise<GeoPoint | null> {
    const b = await this.bookingRow(bookingId).catch(() => null);
    if (!b) return null;
    const rows = await this.rows(b.patientId);
    const chosen =
      (b.careLocationId && rows.find((r) => r.id === b.careLocationId && r.confirmedAt !== null)) || rows.find((r) => r.isDefault && r.confirmedAt !== null);
    return chosen ? { latitude: Number(chosen.latitude), longitude: Number(chosen.longitude) } : null;
  }

  /** Staff's view: the place used, whether the booking picked it, any suggestion waiting, and the client's places. */
  async forBooking(bookingId: string): Promise<BookingCareLocation> {
    const b = await this.bookingRow(bookingId);
    const rows = await this.rows(b.patientId);
    const confirmed = rows.filter((r) => r.confirmedAt !== null);
    const own = b.careLocationId ? confirmed.find((r) => r.id === b.careLocationId) : undefined;
    const used = own ?? confirmed.find((r) => r.isDefault) ?? null;
    const suggestion = rows.find((r) => r.confirmedAt === null) ?? null;
    return {
      location: used ? toCareLocation(used) : null,
      chosenForBooking: Boolean(own),
      suggestion: suggestion ? toCareLocation(suggestion) : null,
      options: confirmed.map(toCareLocation),
    };
  }

  /** Point a booking at one of the client's places, or back to their default (null). */
  async setForBooking(bookingId: string, careLocationId: string | null, opts: { patientId?: string } = {}): Promise<void> {
    const b = await this.bookingRow(bookingId);
    if (opts.patientId && b.patientId !== opts.patientId) throw new NotFoundException('Booking not found');
    if (careLocationId) {
      const row = await this.own(b.patientId, careLocationId);
      if (row.confirmedAt === null) throw new BadRequestException('Confirm the suggested place first');
    }
    await this.db.update(bookings).set({ careLocationId, updatedAt: new Date() }).where(eq(bookings.id, bookingId));
  }

  /**
   * After a located check-in on a booking with no place: keep it as a
   * suggestion for staff, unless the client already has a place or a
   * suggestion. Never throws - a check-in must not fail over this.
   */
  async suggestFromCheckIn(bookingId: string, shiftId: string, here: GeoPoint, now = new Date()): Promise<void> {
    try {
      if (!insideSriLanka(here)) return;
      const b = await this.bookingRow(bookingId);
      const rows = await this.rows(b.patientId);
      if (rows.length) return;
      await this.db.insert(careLocations).values({
        id: uuid(),
        patientId: b.patientId,
        label: DEFAULT_LABEL,
        latitude: round6(here.latitude),
        longitude: round6(here.longitude),
        source: 'FROM_CHECKIN',
        isDefault: false,
        confirmedAt: null,
        fromShiftId: shiftId,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      this.logger.warn(`Booking ${bookingId}: could not keep a suggested place - ${(err as Error).message}`);
    }
  }

  /** Staff: every place suggested from a check-in and not confirmed yet, newest first, with a booking to open it on. */
  async suggestions(): Promise<CareLocationSuggestion[]> {
    const rows = await this.db
      .select({ place: careLocations, clientName: patients.fullName, bookingId: bookingShifts.bookingId, reference: bookings.reference })
      .from(careLocations)
      .innerJoin(patients, eq(careLocations.patientId, patients.id))
      .leftJoin(bookingShifts, eq(careLocations.fromShiftId, bookingShifts.id))
      .leftJoin(bookings, eq(bookingShifts.bookingId, bookings.id))
      .where(isNull(careLocations.confirmedAt))
      .orderBy(desc(careLocations.createdAt))
      .limit(200);
    return rows.map((r) => ({
      ...toCareLocation(r.place),
      patientId: r.place.patientId,
      clientName: r.clientName,
      bookingId: r.bookingId ?? null,
      bookingReference: r.reference ?? null,
      suggestedAt: new Date(r.place.createdAt).toISOString(),
    }));
  }

  /** For the client's own routes. */
  requirePatient(patientId: string | undefined): string {
    if (!patientId) throw new ForbiddenException('You do not have permission to perform this action');
    return patientId;
  }
}
