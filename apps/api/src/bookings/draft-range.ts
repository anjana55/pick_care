import { and, eq, inArray, max, min } from 'drizzle-orm';
import { toColombo } from '@care-platform/shared';
import type { Database } from '../database/database.module';
import { bookingShifts } from '../database/schema';

/**
 * The dates a draft actually covers: the Colombo date of its first and last
 * draft shift. A draft's stored start/end dates come from the pattern staff
 * set; adding, moving or removing one shift by hand (say, starting a day
 * earlier because the client asked) changes the roster but not those dates.
 * What the client is asked to check must be the roster as it is now.
 *
 * Bookings with no draft shifts are left out: the caller keeps the stored dates.
 */
export async function draftShiftRanges(db: Pick<Database, 'select'>, bookingIds: string[]): Promise<Map<string, { startDate: string; endDate: string }>> {
  if (!bookingIds.length) return new Map();
  const rows = await db
    .select({ bookingId: bookingShifts.bookingId, first: min(bookingShifts.startsAt), last: max(bookingShifts.startsAt) })
    .from(bookingShifts)
    .where(and(inArray(bookingShifts.bookingId, bookingIds), eq(bookingShifts.status, 'DRAFT')))
    .groupBy(bookingShifts.bookingId);
  const out = new Map<string, { startDate: string; endDate: string }>();
  for (const r of rows) {
    if (r.first && r.last) out.set(r.bookingId, { startDate: toColombo(r.first).date, endDate: toColombo(r.last).date });
  }
  return out;
}
