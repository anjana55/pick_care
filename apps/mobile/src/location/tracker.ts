import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasNativeModule } from '@/native';
import { keepPoint, sessionOver, trackingOptions, type TrackPoint, type TrackSession } from './session';
import { flushOutbox, type FlushResult } from './outbox';

/**
 * Location tracking on the phone: one background task, started from a tap,
 * that keeps the points a session wants (src/location/session.ts). Used by
 * "On my way" (Phase B), the checks during a visit (Phase C) and the test
 * mode (B0).
 *
 * The task is defined when this file is first imported - app/_layout.tsx does
 * that - because iOS and Android may wake the app in the background just to
 * hand it locations, before any screen has loaded.
 *
 * Points are kept on the phone (AsyncStorage) first; a session with sink
 * SERVER is sent from there (the outbox), so no signal loses nothing.
 */

export const LOCATION_TASK = 'pick-care-location';
const SESSION_KEY = 'location.session';
const POINTS_KEY = 'location.points';
/** About 16 hours of a trip's points, or weeks of shift points: older ones go first. */
const MAX_POINTS = 2000;

type LocationModule = typeof import('expo-location');
type TaskManagerModule = typeof import('expo-task-manager');

/**
 * Load a native module only when this build has it (Expo Go and older builds
 * don't). Metro only bundles require() calls with a fixed string, so each
 * module gets its own loader: never require(variable).
 */
function load<T>(native: string, get: () => T): T | null {
  if (!hasNativeModule(native)) return null;
  try {
    return get();
  } catch {
    return null;
  }
}
const location = () => load<LocationModule>('ExpoLocation', () => require('expo-location') as LocationModule);
const taskManager = () => load<TaskManagerModule>('ExpoTaskManager', () => require('expo-task-manager') as TaskManagerModule);

async function batteryPercent(): Promise<number | null> {
  const Battery = load<typeof import('expo-battery')>('ExpoBattery', () => require('expo-battery') as typeof import('expo-battery'));
  if (!Battery) return null;
  try {
    const level = await Battery.getBatteryLevelAsync();
    return level < 0 ? null : Math.round(level * 100);
  } catch {
    return null;
  }
}

// --- what is kept on the phone ---------------------------------------------------

export async function currentSession(): Promise<TrackSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as TrackSession) : null;
  } catch {
    return null;
  }
}

export async function readPoints(sessionId?: string): Promise<(TrackPoint & { sessionId: string })[]> {
  try {
    const raw = await AsyncStorage.getItem(POINTS_KEY);
    const all = raw ? (JSON.parse(raw) as (TrackPoint & { sessionId: string })[]) : [];
    return sessionId ? all.filter((p) => p.sessionId === sessionId) : all;
  } catch {
    return [];
  }
}

async function writePoints(points: (TrackPoint & { sessionId: string })[]) {
  await AsyncStorage.setItem(POINTS_KEY, JSON.stringify(points.slice(-MAX_POINTS)));
}

/** Forget points: a session's, or all of them. The outbox calls it once points are safely sent. */
export async function clearPoints(sessionId?: string, upTo?: number) {
  const all = await readPoints();
  await writePoints(sessionId ? all.filter((p) => p.sessionId !== sessionId || (upTo !== undefined && p.at > upTo)) : []);
}

/** The task's own work: keep the points the session wants, stop when it is over. Exported for tests. */
export async function receiveLocations(
  locations: { timestamp: number; coords: { latitude: number; longitude: number; accuracy: number | null; speed: number | null }; mocked?: boolean }[],
  now = Date.now(),
  battery: () => Promise<number | null> = batteryPercent,
): Promise<void> {
  const session = await currentSession();
  if (!session || sessionOver(session, now)) {
    await finishTracking();
    return;
  }
  const points = await readPoints();
  const mine = points.filter((p) => p.sessionId === session.id);
  let lastKept = mine.length ? mine[mine.length - 1].at : null;
  const level = session.sink === 'TEST' ? await battery() : null;
  for (const l of [...locations].sort((a, b) => a.timestamp - b.timestamp)) {
    if (!keepPoint(session, lastKept, l.timestamp)) continue;
    points.push({
      sessionId: session.id,
      at: l.timestamp,
      latitude: l.coords.latitude,
      longitude: l.coords.longitude,
      accuracyM: l.coords.accuracy === null ? null : Math.round(l.coords.accuracy),
      speed: l.coords.speed !== null && l.coords.speed >= 0 ? Math.round(l.coords.speed * 10) / 10 : null,
      mocked: Boolean(l.mocked),
      battery: level,
    });
    lastKept = l.timestamp;
  }
  await writePoints(points);
}

let lastFlush = 0;
/** Send what is waiting, at most every 25 seconds from the background (the radio wakes less often). */
export async function sendPoints(force = false, now = Date.now()): Promise<FlushResult> {
  if (!force && now - lastFlush < 25_000) return 'nothing';
  lastFlush = now;
  return flushOutbox(await currentSession(), { read: readPoints, forget: (id, upTo) => clearPoints(id, upTo), stop: stopTracking });
}

const tm = taskManager();
if (tm && !tm.isTaskDefined(LOCATION_TASK)) {
  tm.defineTask<{ locations: Parameters<typeof receiveLocations>[0] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations) return;
    await receiveLocations(data.locations);
    await sendPoints().catch(() => undefined);
  });
}

// --- starting and stopping ---------------------------------------------------------

export type StartResult = 'started' | 'denied' | 'unavailable';

/**
 * Start a session. Must be called from a tap with the app open: Android only
 * lets a foreground service start then, and that is what lets it run with
 * "while using the app" permission (no "Allow all the time").
 */
export async function startTracking(session: TrackSession, platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android'): Promise<StartResult> {
  const Location = location();
  if (!Location || !taskManager()) return 'unavailable';
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return 'denied';
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    await Location.startLocationUpdatesAsync(LOCATION_TASK, trackingOptions(session, platform, Location.Accuracy));
    return 'started';
  } catch {
    await AsyncStorage.removeItem(SESSION_KEY).catch(() => undefined);
    return 'unavailable';
  }
}

/** Send what is left, then stop: for check-in, the end of a trip, a stop from the person. */
export async function finishTracking(): Promise<void> {
  await sendPoints(true).catch(() => undefined);
  await stopTracking();
}

/** Stop whatever is running. Points already kept stay until they are sent or cleared. */
export async function stopTracking(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY).catch(() => undefined);
  const Location = location();
  if (!Location) return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    // Already stopped, or the phone stopped it.
  }
}

/** Is the phone really tracking? (It can be stopped behind our back: iOS stops it when the app is swiped away.) */
export async function isTracking(): Promise<boolean> {
  const Location = location();
  if (!Location) return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}
