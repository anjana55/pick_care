import { boolean, datetime, decimal, index, mysqlEnum, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { CARE_LOCATION_LABEL_MAX, careLocationSources } from '@care-platform/shared';

/**
 * Where care happens, as a point on the map: the client's home, or another
 * house they have care at. The client drops the pin themselves (website or
 * app); staff can set or move it; and when there is none, the first located
 * check-in on one of their bookings is kept as a suggestion for staff to
 * confirm.
 *
 * Check-in distances are measured from here, and the later phases (the
 * caregiver's "On my way", location checks during a visit) use it as the
 * destination and the home's circle.
 *
 * A booking uses its own `care_location_id` when staff or the client picked
 * one, otherwise the client's default confirmed location.
 */
export const careLocations = mysqlTable(
  'care_locations',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    patientId: varchar('patient_id', { length: 36 }).notNull(),
    label: varchar('label', { length: CARE_LOCATION_LABEL_MAX }).notNull(),
    latitude: decimal('latitude', { precision: 9, scale: 6, mode: 'number' }).notNull(),
    longitude: decimal('longitude', { precision: 9, scale: 6, mode: 'number' }).notNull(),
    /** CLIENT_PIN: dropped by the client. STAFF: set by staff. FROM_CHECKIN: suggested from a check-in, until confirmed. */
    source: mysqlEnum('source', careLocationSources).notNull(),
    /** The client's default: what bookings use unless they name another. One per client. */
    isDefault: boolean('is_default').notNull().default(false),
    /** Null only for a FROM_CHECKIN suggestion nobody has confirmed yet. Unconfirmed points are never measured from. */
    confirmedAt: datetime('confirmed_at'),
    confirmedBy: varchar('confirmed_by', { length: 36 }),
    /** For a FROM_CHECKIN suggestion: the shift it came from. */
    fromShiftId: varchar('from_shift_id', { length: 36 }),
    createdBy: varchar('created_by', { length: 36 }),
    createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    patientIdx: index('care_locations_patient_idx').on(table.patientId, table.isDefault),
  }),
);
