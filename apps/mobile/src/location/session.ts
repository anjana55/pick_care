/**
 * The rules of location tracking, apart from the phone (GPS tracking, Phases
 * B and C, and the B0 test mode). Pure, so they can be tested without a
 * phone; src/location/tracker.ts does the native part.
 *
 * - TRIP: "On my way". A point every 30 s or 100 m.
 * - SHIFT: checked in to a visit. One point every N minutes (the admin's
 *   setting). Android is asked for exactly that; iOS has no background timer,
 *   so it keeps low-accuracy updates running and the app keeps one per interval.
 *
 * Tracking only ever starts from a tap in the app, with a notification (Android)
 * or the blue location indicator (iOS) showing for as long as it runs, and it
 * stops on its own at `endsBy` whatever happens.
 */

export type TrackKind = 'TRIP' | 'SHIFT';

export interface TrackSession {
  /** Ours, made by the phone; the server's share id when there is one. */
  id: string;
  kind: TrackKind;
  /** SHIFT: minutes between points. */
  everyMinutes?: number;
  startedAt: number;
  /** A hard stop (ms since epoch): tracking ends at this time even if nothing else stops it. */
  endsBy: number;
  /** Where the points go: kept on the phone for the test mode, or sent to the API. */
  sink: 'TEST' | 'SERVER';
  /** The phone's notification while it runs (Android), in the person's language. */
  notification: { title: string; body: string };
  shiftId?: string;
  /** SERVER: the share's upload token, sent with the points instead of the sign-in (works with the phone locked). */
  uploadToken?: string;
}

export interface TrackPoint {
  at: number;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  speed: number | null;
  mocked: boolean;
  /** 0-100, null when the phone won't say. Kept by the test mode only. */
  battery: number | null;
}

export const TRIP_EVERY_SECONDS = 30;
export const TRIP_EVERY_METRES = 100;
/** Points closer together than this are dropped on a trip: some phones send bursts. */
const TRIP_MIN_GAP_MS = 25_000;
/** A shift point may come up to this much early and still count for its interval. */
const SHIFT_EARLY_MS = 60_000;
export const SHIFT_EVERY_LIMITS = { min: 5, max: 120 } as const;

/** Milliseconds between the points a session wants. */
export function expectedGapMs(session: Pick<TrackSession, 'kind' | 'everyMinutes'>): number {
  if (session.kind === 'TRIP') return TRIP_EVERY_SECONDS * 1000;
  return clampMinutes(session.everyMinutes) * 60_000;
}

export function clampMinutes(minutes: number | undefined): number {
  const m = Math.round(minutes ?? 30);
  return Math.min(SHIFT_EVERY_LIMITS.max, Math.max(SHIFT_EVERY_LIMITS.min, Number.isFinite(m) ? m : 30));
}

/** Keep this point, given when the last kept one was taken? */
export function keepPoint(session: Pick<TrackSession, 'kind' | 'everyMinutes'>, lastKeptAt: number | null, at: number): boolean {
  if (lastKeptAt === null) return true;
  const gap = at - lastKeptAt;
  if (session.kind === 'TRIP') return gap >= TRIP_MIN_GAP_MS;
  return gap >= expectedGapMs(session) - SHIFT_EARLY_MS;
}

/** Is the session over (past its hard stop)? */
export const sessionOver = (session: Pick<TrackSession, 'endsBy'>, now: number) => now >= session.endsBy;

/** The bits of expo-location's Accuracy this needs; passed in so tests need no phone. */
export interface AccuracyLevels {
  Balanced: number;
  High: number;
}

/**
 * What to ask the phone for. Balanced accuracy (Wi-Fi and cell towers, about
 * 100 m, GPS only when needed) on both kinds: enough to tell the home from
 * the street, and much kinder to a budget phone's battery than High.
 */
export function trackingOptions(session: TrackSession, platform: 'ios' | 'android', accuracy: AccuracyLevels) {
  const base = {
    accuracy: accuracy.Balanced,
    // Android: the notification for the foreground service. Without it Android needs "Allow all the time".
    foregroundService: { notificationTitle: session.notification.title, notificationBody: session.notification.body, killServiceOnDestroy: false },
    // iOS: the blue pill in the status bar, so the person always sees it is on.
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
  };
  if (session.kind === 'TRIP') return { ...base, timeInterval: TRIP_EVERY_SECONDS * 1000, distanceInterval: platform === 'ios' ? TRIP_EVERY_METRES : 0 };
  // SHIFT. Android honours the interval. iOS ignores timeInterval, so it gets a
  // distance filter to keep quiet while the phone sits in the house; the app
  // keeps one point per interval of what arrives (keepPoint).
  return platform === 'android'
    ? { ...base, timeInterval: expectedGapMs(session), distanceInterval: 0 }
    : { ...base, distanceInterval: 25, deferredUpdatesInterval: expectedGapMs(session) };
}

export interface TestSummary {
  points: number;
  minutes: number;
  /** Points that came more than twice the wanted gap after the one before (or after the start). */
  gaps: number;
  longestGapMinutes: number;
  /** Battery used per hour while it ran, in percentage points; null without two battery readings. */
  batteryPerHour: number | null;
  batteryStart: number | null;
  batteryNow: number | null;
  medianAccuracyM: number | null;
  mocked: number;
}

/** What the test mode shows and shares: did the phone keep sending, and what did it cost? */
export function summarise(session: TrackSession, points: TrackPoint[], now: number): TestSummary {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const end = Math.min(now, session.endsBy);
  const wanted = expectedGapMs(session);
  let gaps = 0;
  let longest = 0;
  let prev = session.startedAt;
  // Every stretch between points, including the one from the last point to now: a phone that went quiet counts.
  for (const p of [...sorted.map((s) => s.at), end]) {
    const gap = p - prev;
    if (gap > wanted * 2) gaps += 1;
    longest = Math.max(longest, gap);
    prev = p;
  }
  const withBattery = sorted.filter((p) => p.battery !== null);
  const first = withBattery[0];
  const last = withBattery[withBattery.length - 1];
  const hours = first && last ? (last.at - first.at) / 3_600_000 : 0;
  const accuracies = sorted
    .map((p) => p.accuracyM)
    .filter((a): a is number => a !== null)
    .sort((a, b) => a - b);
  return {
    points: sorted.length,
    minutes: Math.round((end - session.startedAt) / 60_000),
    gaps,
    longestGapMinutes: Math.round(longest / 60_000),
    batteryPerHour: first && last && hours >= 0.25 ? Math.round((((first.battery ?? 0) - (last.battery ?? 0)) / hours) * 10) / 10 : null,
    batteryStart: first?.battery ?? null,
    batteryNow: last?.battery ?? null,
    medianAccuracyM: accuracies.length ? Math.round(accuracies[Math.floor(accuracies.length / 2)]) : null,
    mocked: sorted.filter((p) => p.mocked).length,
  };
}

/** The test results as CSV, to send from the phone (Share) to whoever reads them. */
export function toCsv(points: TrackPoint[]): string {
  const rows = [...points]
    .sort((a, b) => a.at - b.at)
    .map((p) => [new Date(p.at).toISOString(), p.latitude, p.longitude, p.accuracyM ?? '', p.speed ?? '', p.mocked ? 1 : 0, p.battery ?? ''].join(','));
  return ['time,latitude,longitude,accuracy_m,speed_m_s,mocked,battery_pct', ...rows].join('\n');
}
