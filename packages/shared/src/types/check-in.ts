import {
  DEFAULT_LOCATION_RETENTION_DAYS,
  DEFAULT_ON_MY_WAY_MINUTES,
  DEFAULT_PRESENCE,
  LOCATION_RETENTION_LIMITS,
  ON_MY_WAY_MINUTES_LIMITS,
  PRESENCE_AWAY_POINTS_LIMITS,
  PRESENCE_EVERY_LIMITS,
  PRESENCE_SILENT_LIMITS,
  type CaregiverOnMyWay,
  type CaregiverPresence,
  type StaffPresence,
} from './location-shares';
import type { ShiftStatus } from './bookings';
import { haversineKm, type GeoPoint } from './geo';

/**
 * Shift check-in: the caregiver arrives, asks the client for the day's
 * four-digit arrival code and enters it; they check out when they leave.
 * It proves the right person reached the right door and records when. Off
 * until an admin switches it on (Settings > Check-in). It never blocks care
 * and never changes a shift's status or what is billed.
 */

export const ARRIVAL_CODE_LENGTH = 4;
/** After this many wrong codes on one shift the caregiver has to ask the office. */
export const CHECK_IN_MAX_WRONG_CODES = 5;
/** The default for Settings > Check-in "Far from the home": a check-in further than this from the booking's place is pointed out to staff. */
export const CHECK_IN_FAR_METRES = 300;
/** A poor fix widens the circle by its accuracy, up to this much, so a phone that only knows "within 400 m" is not called far. */
export const CHECK_IN_ACCURACY_ALLOWANCE_MAX = 500;
/** A fix less sure than this says nothing about whether the caregiver is at the home. */
export const CHECK_IN_USELESS_ACCURACY_M = 1000;
/** The client sees a shift's arrival code from this long before it starts. */
export const ARRIVAL_CODE_SHOWN_HOURS = 12;
export const CHECK_IN_NOTE_MAX = 300;

export interface CheckInSettings {
  /** Off: nobody sees a code or a check-in button. */
  enabled: boolean;
  /** How long before the shift starts a caregiver may check in. */
  earlyMinutes: number;
  /** Minutes after the start with no check-in before staff are told. */
  lateAfterMinutes: number;
  /** A check-in further than this many metres from the booking's place (plus the fix's accuracy) is pointed out to staff. */
  farMetres: number;
  /** Live location: caregivers may tap On my way (and, with presence on, be checked during visits). Off by default. */
  liveEnabled: boolean;
  /** On my way can be tapped from this many minutes before the start. */
  onMyWayMinutes: number;
  /** Raw location points are deleted after this many days. */
  locationRetentionDays: number;
  /** Location checks during a visit (needs live location on). Off by default. */
  presenceEnabled: boolean;
  /** Minutes between checks while checked in. */
  presenceEveryMinutes: number;
  /** This many checks in a row outside the home's circle: "Still with …?", then staff. */
  presenceAwayPoints: number;
  /** No check for this many intervals: staff see "no location". */
  presenceSilentMultiplier: number;
}

export const DEFAULT_CHECK_IN_SETTINGS: CheckInSettings = {
  enabled: false,
  earlyMinutes: 60,
  lateAfterMinutes: 15,
  farMetres: CHECK_IN_FAR_METRES,
  liveEnabled: false,
  onMyWayMinutes: DEFAULT_ON_MY_WAY_MINUTES,
  locationRetentionDays: DEFAULT_LOCATION_RETENTION_DAYS,
  presenceEnabled: false,
  presenceEveryMinutes: DEFAULT_PRESENCE.everyMinutes,
  presenceAwayPoints: DEFAULT_PRESENCE.awayPoints,
  presenceSilentMultiplier: DEFAULT_PRESENCE.silentMultiplier,
};
export const CHECK_IN_SETTINGS_LIMITS = {
  earlyMinutes: { min: 0, max: 240 },
  lateAfterMinutes: { min: 5, max: 120 },
  farMetres: { min: 50, max: 2000 },
  onMyWayMinutes: ON_MY_WAY_MINUTES_LIMITS,
  locationRetentionDays: LOCATION_RETENTION_LIMITS,
  presenceEveryMinutes: PRESENCE_EVERY_LIMITS,
  presenceAwayPoints: PRESENCE_AWAY_POINTS_LIMITS,
  presenceSilentMultiplier: PRESENCE_SILENT_LIMITS,
} as const;

/**
 * Is a position "far from the home"? The circle is widened by the fix's
 * accuracy (up to CHECK_IN_ACCURACY_ALLOWANCE_MAX), so only a check-in that is
 * clearly outside it counts.
 */
export function isFarFromHome(distanceM: number | null, accuracyM: number | null, farMetres: number): boolean {
  if (distanceM === null) return false;
  return distanceM > farMetres + Math.min(Math.max(accuracyM ?? 0, 0), CHECK_IN_ACCURACY_ALLOWANCE_MAX);
}

/** What a check-in distance was measured from: the booking's place on the map, or (with none) its first located check-in. */
export type CheckInDistanceFrom = 'PIN' | 'EARLIER';

/**
 * Where one visit stands:
 *  UPCOMING - too early to check in;  DUE - check-in is open;
 *  LATE - started a while ago with nobody checked in;
 *  IN - the caregiver is there;  OUT - they have left;
 *  NOT_RECORDED - the shift ended with no check-in.
 */
export type VisitState = 'UPCOMING' | 'DUE' | 'LATE' | 'IN' | 'OUT' | 'NOT_RECORDED';

interface VisitTimes {
  startsAt: Date | string;
  endsAt: Date | string;
  checkedInAt: Date | string | null;
  checkedOutAt: Date | string | null;
}

const ms = (d: Date | string) => (d instanceof Date ? d.getTime() : Date.parse(d));

export function visitState(visit: VisitTimes, settings: Pick<CheckInSettings, 'earlyMinutes' | 'lateAfterMinutes'>, now: Date = new Date()): VisitState {
  if (visit.checkedOutAt) return 'OUT';
  if (visit.checkedInAt) return 'IN';
  const t = now.getTime();
  const start = ms(visit.startsAt);
  if (t < start - settings.earlyMinutes * 60_000) return 'UPCOMING';
  if (t >= ms(visit.endsAt)) return 'NOT_RECORDED';
  // A shift shorter than the grace period is late once it is half over.
  const grace = Math.min(settings.lateAfterMinutes * 60_000, (ms(visit.endsAt) - start) / 2);
  return t < start + grace ? 'DUE' : 'LATE';
}

/** A caregiver can check in while the visit is due or late - not before, and not after the shift has ended. */
export const checkInOpen = (state: VisitState) => state === 'DUE' || state === 'LATE';

/** Whole minutes since the shift started, for a visit that is late. */
export function minutesLate(visit: Pick<VisitTimes, 'startsAt'>, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - ms(visit.startsAt)) / 60_000));
}

/** The client is shown the code from a few hours before the shift until the caregiver checks in or the shift ends. */
export function arrivalCodeShown(visit: VisitTimes, now: Date = new Date()): boolean {
  const t = now.getTime();
  return !visit.checkedInAt && t >= ms(visit.startsAt) - ARRIVAL_CODE_SHOWN_HOURS * 3_600_000 && t < ms(visit.endsAt);
}

/** Distance between two points on the ground, in whole metres. */
export function distanceMetres(a: GeoPoint, b: GeoPoint): number {
  return Math.round(haversineKm(a, b) * 1000);
}

/** A caregiver's own view of a shift's check-in (on GET /me/shifts). Null on the shift when check-in is off. */
export interface CaregiverCheckIn {
  state: VisitState;
  /** When check-in opens for this shift. */
  opensAt: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  /** Too many wrong codes: only the office can check them in now. */
  codeLocked: boolean;
  /** "On my way": null when live location is off, or the shift is past it (checked in, ended). */
  onMyWay: CaregiverOnMyWay | null;
  /** Location checks during the visit: null when they are off or the visit is over. */
  presence: CaregiverPresence | null;
}

/** A client's view of one visit (on a shift in GET /me/bookings). Null when check-in is off. */
export interface ClientVisit {
  /** The code to read to the caregiver at the door; null when it is not the time to show it. */
  arrivalCode: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  /** The caregiver tapped On my way and has not checked in yet: GET /me/bookings/:id/live shows where they are. */
  onTheWay: boolean;
}

export type CheckInBy = 'CAREGIVER' | 'STAFF';

/** Staff's view of a visit's check-in. */
export interface StaffCheckIn {
  state: VisitState;
  arrivalCode: string;
  wrongCodes: number;
  codeLocked: boolean;
  checkedInAt: string | null;
  inBy: CheckInBy | null;
  inByName: string | null;
  inNote: string | null;
  inLocation: (GeoPoint & { accuracyM: number | null }) | null;
  /** Metres from the booking's place (or, with none, its first located check-in); null when there is nothing to compare. */
  inDistanceM: number | null;
  /** What inDistanceM was measured from. */
  inDistanceFrom: CheckInDistanceFrom | null;
  /** The check-in was clearly outside the home's circle (allowing for the fix's accuracy). */
  inFar: boolean;
  /** The phone said its position was simulated (Android's mock-location flag). */
  inMocked: boolean;
  checkedOutAt: string | null;
  outBy: CheckInBy | null;
  outByName: string | null;
  outNote: string | null;
  outLocation: (GeoPoint & { accuracyM: number | null }) | null;
  /** Location checks during this visit; null when there were none. */
  presence: StaffPresence | null;
  /** An open "On my way" share for this shift, with its last ETA; null when there is none. */
  onTheWay: { shareId: string; etaMinutes: number | null; arriving: boolean; updatedAt: string | null } | null;
  /** Metres from the booking's place at check-out; null when either is missing. */
  outDistanceM: number | null;
  outFar: boolean;
  outMocked: boolean;
}

/** GET /visits/today (staff): every visit on today's roster, in time order. */
export interface TodayVisit {
  shiftId: string;
  bookingId: string;
  bookingReference: string;
  startsAt: string;
  endsAt: string;
  shiftStatus: ShiftStatus;
  client: { id: string; fullName: string; recipientName: string | null; area: string | null };
  caregiver: { id: string; fullName: string; registrationNumber: string; phone: string | null };
  isCover: boolean;
  /** Minutes since the start, when nobody has checked in and it is late. */
  minutesLate: number | null;
  checkIn: StaffCheckIn;
  /** Cover offers for this shift still waiting for an answer. */
  coverWaiting: number;
  /** Visits on this booking are paused until the client pays: nobody should go. */
  paused: boolean;
  /** The caregiver said they cannot make it. */
  cantMake: { at: string; note: string | null } | null;
}

export interface TodayVisits {
  settings: CheckInSettings;
  /** Today in Sri Lanka, YYYY-MM-DD. */
  date: string;
  visits: TodayVisit[];
  /** The day had more visits than are shown (the first 2,000 by start time). */
  truncated?: boolean;
}

/** POST /me/shifts/:id/check-in (caregiver). The position is optional: a phone that cannot give one still checks in. */
export interface CheckInInput {
  code: string;
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  /** Android reports a simulated (mock) location. Recorded and pointed out to staff, never refused. */
  mocked?: boolean;
}

/** POST /visits/:shiftId/check-in and /check-out (staff, on the caregiver's behalf). */
export interface StaffCheckInInput {
  /** When it happened, if not now (ISO). Never in the future. */
  at?: string;
  note?: string;
}
