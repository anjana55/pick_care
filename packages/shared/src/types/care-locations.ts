import type { GeoPoint } from './geo';

/**
 * Where care happens, as a point on the map (GPS tracking, Phase A).
 *
 * The client drops a pin on their home - or another house they have care at -
 * on the website or in the app; staff can set or move it; and when a client
 * has none, the first located check-in on their bookings is kept as a
 * suggestion for staff to confirm. Check-in distances are measured from the
 * booking's point, and the later phases use it as the destination of "On my
 * way" and the home's circle during a visit.
 *
 * A point is never shown to caregivers: the address is still shared by staff.
 */

export const careLocationSources = ['CLIENT_PIN', 'STAFF', 'FROM_CHECKIN'] as const;
export type CareLocationSource = (typeof careLocationSources)[number];

export const CARE_LOCATION_LABEL_MAX = 60;
/** A client keeps at most this many places. */
export const CARE_LOCATIONS_MAX = 5;

export interface CareLocation extends GeoPoint {
  id: string;
  label: string;
  source: CareLocationSource;
  /** What the client's bookings use unless a booking names another. */
  isDefault: boolean;
  /** False only for a suggestion taken from a check-in that staff have not confirmed. */
  confirmed: boolean;
  updatedAt: string;
}

/** POST /me/care-locations (client) and /patients/:id/care-locations (staff). */
export interface CareLocationInput extends GeoPoint {
  label?: string;
  /** Make it the default. The first place a client adds is the default anyway. */
  isDefault?: boolean;
}

/** PATCH …/care-locations/:id - move, rename, make default; staff can also confirm a suggestion. */
export interface CareLocationUpdate {
  label?: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
  /** Staff only: confirm a suggestion from a check-in. */
  confirm?: boolean;
}

/** Staff's view of where one booking's care happens. */
export interface BookingCareLocation {
  /** The point check-ins are measured from; null when there is none yet. */
  location: CareLocation | null;
  /** True when the booking names its own place rather than using the client's default. */
  chosenForBooking: boolean;
  /** A point taken from a check-in, waiting for staff to confirm; null when there is nothing to confirm. */
  suggestion: CareLocation | null;
  /** Every place the client has, to pick from. */
  options: CareLocation[];
}

/** PUT /bookings/:id/care-location (staff) and /me/bookings/:id/care-location (client). Null = use the client's default. */
export interface SetBookingCareLocationInput {
  careLocationId: string | null;
}

/** A generous box round Sri Lanka: a pin outside it is a slip of the finger, not a client's home. */
export const SRI_LANKA_BOX = { south: 5.7, north: 10.1, west: 79.4, east: 82.1 } as const;

export function insideSriLanka(p: GeoPoint): boolean {
  return p.latitude >= SRI_LANKA_BOX.south && p.latitude <= SRI_LANKA_BOX.north && p.longitude >= SRI_LANKA_BOX.west && p.longitude <= SRI_LANKA_BOX.east;
}

/** POST /me/shifts/:id/near (caregiver): is the phone at the client's home? Never says where the home is. */
export interface NearHomeAnswer {
  /** True within the check-in radius, false outside it, null when the booking has no confirmed place or the fix is too poor to say. */
  atHome: boolean | null;
}
