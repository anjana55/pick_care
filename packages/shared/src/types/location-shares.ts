import type { GeoPoint } from './geo';

/**
 * Live location (GPS tracking, Phases B and C).
 *
 * B, "On my way": the caregiver taps On my way before a visit; until they
 * check in, the client and staff see where they are and about how long until
 * they arrive. C (built next) reuses the same shares for the checks during a
 * visit, kind ON_SHIFT, seen by staff only.
 *
 * Every share starts from the caregiver's tap and ends on its own: at
 * check-in, at "I can't make this shift", at the end of the shift, or after
 * a hard cap. Raw points are deleted after the admin's retention days.
 */

export const locationShareKinds = ['ON_THE_WAY', 'ON_SHIFT'] as const;
export type LocationShareKind = (typeof locationShareKinds)[number];

export const locationShareEndReasons = ['CHECKED_IN', 'STOPPED', 'SHIFT_ENDED', 'CANT_MAKE', 'CAP', 'CHECKED_OUT', 'TURNED_OFF'] as const;
export type LocationShareEndReason = (typeof locationShareEndReasons)[number];

/** On my way can be tapped from this many minutes before the start (the admin's setting) until check-in. */
export const DEFAULT_ON_MY_WAY_MINUTES = 60;
/** A trip share stops by itself after this long, whatever happens. */
export const ON_MY_WAY_CAP_HOURS = 3;
/** The phone sends at most this many points at once. */
export const LOCATION_POINTS_BATCH_MAX = 50;
/** Points from the phone that imply a speed above this are dropped as glitches. */
export const LOCATION_MAX_SPEED_KMH = 200;
/** No point for this long: "location not updating". */
export const LOCATION_STALE_MINUTES = 5;
export const DEFAULT_LOCATION_RETENTION_DAYS = 30;
export const LOCATION_RETENTION_LIMITS = { min: 7, max: 365 } as const;
export const ON_MY_WAY_MINUTES_LIMITS = { min: 15, max: 180 } as const;

/** POST /me/shifts/:id/on-my-way: what the phone needs to track and send. */
export interface StartedShare {
  shareId: string;
  /** The phone sends points with this, not the sign-in: it works with the phone locked and the session expired. Shown once. */
  uploadToken: string;
  kind: LocationShareKind;
  /** The share stops by itself at this time. */
  endsBy: string;
  /** ON_SHIFT: minutes between points. */
  everyMinutes?: number;
}

/** One point from the phone. `at` is the phone's time of the fix. */
export interface LocationPointInput extends GeoPoint {
  at: string;
  accuracyM?: number | null;
  speed?: number | null;
  mocked?: boolean;
}

/** POST /location-shares/:id/points answers whether to keep sending. */
export interface PointsAccepted {
  accepted: number;
  /** False once the share has ended (check-in, shift over, stopped): the phone stops tracking. */
  open: boolean;
}

/** About how many minutes from here to the home: rounded, and null when it can't be said. */
export interface Eta {
  minutes: number | null;
  /** Within the home's circle already. */
  arriving: boolean;
  /** Straight-line metres to the home. */
  distanceM: number | null;
}

/** GET /me/bookings/:id/live (client): the caregiver on their way to the next visit. */
export type ClientLive =
  | { status: 'NONE' }
  | {
      status: 'ON_THE_WAY';
      shiftId: string;
      caregiverName: string;
      startsAt: string;
      /** Null until the phone's first point arrives. */
      position: (GeoPoint & { accuracyM: number | null }) | null;
      /** Where care happens, as the client set it; null when there is no pin (then no ETA either). */
      home: GeoPoint | null;
      eta: Eta;
      updatedAt: string | null;
      /** No point for LOCATION_STALE_MINUTES. */
      stale: boolean;
    };

/** GET /visits/live (staff): caregivers sharing their location right now. */
export interface StaffLiveShare {
  shareId: string;
  kind: LocationShareKind;
  shiftId: string;
  bookingId: string;
  bookingReference: string;
  caregiverName: string;
  caregiverRegistration: string;
  clientName: string;
  startsAt: string;
  startedAt: string;
  position: (GeoPoint & { accuracyM: number | null; mocked: boolean }) | null;
  home: GeoPoint | null;
  eta: Eta;
  updatedAt: string | null;
  stale: boolean;
}

/** A caregiver's own view of On my way for one shift (on CaregiverCheckIn). */
export interface CaregiverOnMyWay {
  /** On my way can be tapped from this time. */
  opensAt: string;
  /** The open share, when they already tapped it. */
  shareId: string | null;
  sharingSince: string | null;
}

/** Straight-line distance at a typical speed for the time of day in Colombo: a rough "about". */
export function etaFrom(distanceM: number | null, at: Date, arrivingWithinM: number): Eta {
  if (distanceM === null) return { minutes: null, arriving: false, distanceM: null };
  if (distanceM <= arrivingWithinM) return { minutes: 0, arriving: true, distanceM: Math.round(distanceM) };
  const colomboHour = Math.floor(((at.getUTCHours() * 60 + at.getUTCMinutes() + 330) % 1440) / 60);
  const rush = (colomboHour >= 7 && colomboHour < 10) || (colomboHour >= 16 && colomboHour < 19);
  const kmh = rush ? 15 : 25;
  // Roads are not straight: about 1.4 times the straight line.
  const raw = ((distanceM * 1.4) / 1000 / kmh) * 60;
  const minutes = raw <= 15 ? Math.max(1, Math.round(raw)) : Math.round(raw / 5) * 5;
  return { minutes, arriving: false, distanceM: Math.round(distanceM) };
}
