import { createHash, randomBytes, randomUUID } from 'crypto';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { presenceSlots, type LocationShareEndReason, type LocationShareKind, type StaffPresence, type StartedShare } from '@care-platform/shared';
import type { Database } from '../database/database.module';
import { locationPoints, locationShares } from '../database/schema';

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

/** Open a share and give the phone its upload token (only its hash is kept). Closes any open share of the same shift and kind first. */
export async function openShare(
  db: Database,
  input: { kind: LocationShareKind; shiftId: string; bookingId: string; caregiverId: string; endsBy: Date; everyMinutes?: number },
  now = new Date(),
): Promise<StartedShare> {
  await closeShares(db, input.shiftId, 'REPLACED', now, input.kind);
  const token = randomBytes(24).toString('base64url');
  const id = randomUUID();
  await db.insert(locationShares).values({
    id,
    kind: input.kind,
    shiftId: input.shiftId,
    bookingId: input.bookingId,
    caregiverId: input.caregiverId,
    uploadTokenHash: hashToken(token),
    startedAt: now,
    endsBy: input.endsBy,
    everyMinutes: input.everyMinutes ?? null,
  });
  return { shareId: id, uploadToken: token, kind: input.kind, endsBy: input.endsBy.toISOString(), ...(input.everyMinutes ? { everyMinutes: input.everyMinutes } : {}) };
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Staff's view of the checks during one visit, from the share and its points
 * (or, once the points are deleted, from the summary written when it closed).
 */
export async function presenceOf(db: Database, share: ShareRow, now = new Date()): Promise<StaffPresence> {
  const every = (share.everyMinutes ?? 30) * 60_000;
  const open = !share.endedAt && new Date(share.endsBy).getTime() > now.getTime();
  let summary = share.summary;
  if (!summary) {
    const points = await db
      .select({ at: locationPoints.at, inside: locationPoints.inside, mocked: locationPoints.mocked })
      .from(locationPoints)
      .where(eq(locationPoints.shareId, share.id))
      .orderBy(asc(locationPoints.at));
    const until = share.endedAt ? new Date(share.endedAt).getTime() : Math.min(now.getTime(), new Date(share.endsBy).getTime());
    const slots = presenceSlots(new Date(share.startedAt).getTime(), until, every, points.map((p) => ({ at: new Date(p.at).getTime(), inside: p.inside })));
    summary = { slots, inside: slots.filter((s) => s === 'IN').length, away: slots.filter((s) => s === 'AWAY').length, none: slots.filter((s) => s === 'NONE').length, mocked: points.filter((p) => p.mocked).length };
  }
  return {
    shareId: share.id,
    everyMinutes: share.everyMinutes ?? 30,
    open,
    startedAt: new Date(share.startedAt).toISOString(),
    endedAt: share.endedAt ? new Date(share.endedAt).toISOString() : null,
    endReason: share.endReason ?? null,
    ...summary,
    reply: share.awayReply ?? null,
    repliedAt: share.awayRepliedAt ? new Date(share.awayRepliedAt).toISOString() : null,
  };
}

/** The newest ON_SHIFT share of each shift, open or closed. */
export async function latestShiftShares(db: Database, shiftIds: string[]): Promise<Map<string, ShareRow>> {
  if (!shiftIds.length) return new Map();
  const rows = await db.select().from(locationShares).where(and(inArray(locationShares.shiftId, shiftIds), eq(locationShares.kind, 'ON_SHIFT')));
  const out = new Map<string, ShareRow>();
  // Oldest first, so the newest wins; started in the same second, the open one is the newer (it replaced the other).
  const order = (a: ShareRow, b: ShareRow) => +new Date(a.startedAt) - +new Date(b.startedAt) || (a.endedAt ? 0 : 1) - (b.endedAt ? 0 : 1);
  for (const r of rows.sort(order)) out.set(r.shiftId, r);
  return out;
}
