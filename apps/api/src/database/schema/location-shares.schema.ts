import { bigint, boolean, datetime, decimal, index, int, json, mysqlEnum, mysqlTable, primaryKey, varchar } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { locationShareEndReasons, locationShareKinds, presenceReplies, type PresenceSlot } from '@care-platform/shared';

/**
 * A caregiver sharing where they are, started by their own tap (GPS tracking
 * B and C): ON_THE_WAY from "On my way" until check-in; ON_SHIFT (Phase C)
 * while checked in. Ends on its own; `ended_at` set means closed.
 *
 * The phone sends points with `upload_token` (only its hash is kept), not
 * with the sign-in, so a locked phone with an expired session keeps sending.
 */
export const locationShares = mysqlTable(
  'location_shares',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    kind: mysqlEnum('kind', locationShareKinds).notNull(),
    shiftId: varchar('shift_id', { length: 36 }).notNull(),
    bookingId: varchar('booking_id', { length: 36 }).notNull(),
    caregiverId: varchar('caregiver_id', { length: 36 }).notNull(),
    /** sha256 of the phone's upload token. */
    uploadTokenHash: varchar('upload_token_hash', { length: 64 }).notNull(),
    startedAt: datetime('started_at').notNull(),
    /** The hard stop: the share closes at this time whatever happens. */
    endsBy: datetime('ends_by').notNull(),
    endedAt: datetime('ended_at'),
    endReason: mysqlEnum('end_reason', locationShareEndReasons),
    /** ON_SHIFT: minutes between points. */
    everyMinutes: int('every_minutes'),
    // The latest point, kept here so the live views read one row.
    lastLatitude: decimal('last_latitude', { precision: 9, scale: 6, mode: 'number' }),
    lastLongitude: decimal('last_longitude', { precision: 9, scale: 6, mode: 'number' }),
    lastAccuracyM: int('last_accuracy_m'),
    lastMocked: boolean('last_mocked').notNull().default(false),
    lastAt: datetime('last_at'),
    /** Straight-line metres to the booking's place at the last point; null with no place. */
    lastDistanceM: int('last_distance_m'),
    points: int('points').notNull().default(0),
    // ON_SHIFT (GPS tracking C): "Still with …?" asked, and the caregiver's answer.
    awayAskedAt: datetime('away_asked_at'),
    awayReply: mysqlEnum('away_reply', presenceReplies),
    awayRepliedAt: datetime('away_replied_at'),
    /** ON_SHIFT, written when it closes: the dot strip and counts, so they outlive the points. */
    summary: json('summary').$type<{ slots: PresenceSlot[]; inside: number; away: number; none: number; mocked: number }>(),
    createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    shiftIdx: index('location_shares_shift_idx').on(table.shiftId, table.kind),
    openIdx: index('location_shares_open_idx').on(table.endedAt, table.endsBy),
  }),
);

/** The points themselves. Deleted after the admin's retention days; the share's summary stays. */
export const locationPoints = mysqlTable(
  'location_points',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    shareId: varchar('share_id', { length: 36 }).notNull(),
    at: datetime('at').notNull(),
    latitude: decimal('latitude', { precision: 9, scale: 6, mode: 'number' }).notNull(),
    longitude: decimal('longitude', { precision: 9, scale: 6, mode: 'number' }).notNull(),
    accuracyM: int('accuracy_m'),
    /** Metres a second, as the phone reported. */
    speed: decimal('speed', { precision: 6, scale: 1, mode: 'number' }),
    mocked: boolean('mocked').notNull().default(false),
    /** Inside the home's circle (allowing for accuracy); null with no place on the map. */
    inside: boolean('inside'),
    distanceM: int('distance_m'),
    receivedAt: datetime('received_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    shareIdx: index('location_points_share_idx').on(table.shareId, table.at),
    atIdx: index('location_points_at_idx').on(table.at),
  }),
);

/** Reminders already sent about a shift (the T-60 "tap On my way", the client's "on the way"), so each goes once. */
export const locationNotices = mysqlTable('location_notices', {
  shiftId: varchar('shift_id', { length: 36 }).notNull(),
  kind: mysqlEnum('kind', ['ON_MY_WAY_REMINDER', 'CLIENT_ON_THE_WAY']).notNull(),
  sentAt: datetime('sent_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({ pk: primaryKey({ columns: [table.shiftId, table.kind] }) }));
