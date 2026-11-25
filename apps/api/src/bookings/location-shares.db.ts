import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { LocationShareEndReason, LocationShareKind } from '@care-platform/shared';
import type { Database } from '../database/database.module';
import { locationShares } from '../database/schema';

/**
 * Small database helpers for live location, kept apart from
 * LocationSharesService so check-in and "I can't make this shift" can close a
 * share without depending on it (which depends on them).
 */

export type ShareRow = typeof locationShares.$inferSelect;

/** Close the open shares of a shift (of one kind, or all). Returns how many were closed. */
export async function closeShares(db: Database, shiftId: string, reason: LocationShareEndReason, now = new Date(), kind?: LocationShareKind): Promise<number> {
  const open = await db
    .select({ id: locationShares.id })
    .from(locationShares)
    .where(and(eq(locationShares.shiftId, shiftId), isNull(locationShares.endedAt), kind ? eq(locationShares.kind, kind) : undefined));
  if (!open.length) return 0;
  await db
    .update(locationShares)
    .set({ endedAt: now, endReason: reason })
    .where(inArray(locationShares.id, open.map((o) => o.id)));
  return open.length;
}

/** The open shares of these shifts, by shift id (one per shift and kind; the newest wins). */
export async function openShares(db: Database, shiftIds: string[], kind: LocationShareKind = 'ON_THE_WAY'): Promise<Map<string, ShareRow>> {
  if (!shiftIds.length) return new Map();
  const rows = await db
    .select()
    .from(locationShares)
    .where(and(inArray(locationShares.shiftId, shiftIds), eq(locationShares.kind, kind), isNull(locationShares.endedAt)));
  const out = new Map<string, ShareRow>();
  for (const r of rows.sort((a, b) => +new Date(a.startedAt) - +new Date(b.startedAt))) out.set(r.shiftId, r);
  return out;
}
