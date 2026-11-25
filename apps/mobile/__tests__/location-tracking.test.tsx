jest.mock('expo-router', () => require('../test-utils/router').expoRouterMock());
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import LocationTest from '../app/location-test';
import { AppProviders } from '../test-utils/app';
import { expectedGapMs, keepPoint, summarise, toCsv, trackingOptions, type TrackPoint, type TrackSession } from '../src/location/session';
import { readPoints, receiveLocations } from '../src/location/tracker';
import { locationTestAvailable } from '../src/location/test-mode';

const T0 = Date.UTC(2026, 10, 25, 4, 0, 0);
const MIN = 60_000;
const accuracy = { Balanced: 3, High: 4 };
const session = (over: Partial<TrackSession> = {}): TrackSession => ({
  id: 's-1',
  kind: 'SHIFT',
  everyMinutes: 30,
  startedAt: T0,
  endsBy: T0 + 9 * 60 * MIN,
  sink: 'TEST',
  notification: { title: 'Checked in', body: 'Location checked every 30 min' },
  ...over,
});
const fix = (at: number, extra: Partial<{ accuracy: number; mocked: boolean }> = {}) => ({
  timestamp: at,
  coords: { latitude: 6.9271, longitude: 79.8452, accuracy: extra.accuracy ?? 18.4, speed: 0 },
  mocked: extra.mocked,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('what the phone is asked for', () => {
  it('runs as a foreground service with the indicator, never "Allow all the time", at balanced accuracy', () => {
    for (const platform of ['ios', 'android'] as const) {
      for (const s of [session(), session({ kind: 'TRIP' })]) {
        const o = trackingOptions(s, platform, accuracy);
        expect(o.accuracy).toBe(accuracy.Balanced);
        expect(o.foregroundService).toEqual({ notificationTitle: 'Checked in', notificationBody: 'Location checked every 30 min', killServiceOnDestroy: false });
        expect(o.showsBackgroundLocationIndicator).toBe(true);
      }
    }
  });

  it('asks Android for the admin interval during a visit, and iOS for a distance filter', () => {
    expect(trackingOptions(session({ everyMinutes: 15 }), 'android', accuracy)).toMatchObject({ timeInterval: 15 * MIN, distanceInterval: 0 });
    expect(trackingOptions(session({ everyMinutes: 15 }), 'ios', accuracy)).toMatchObject({ distanceInterval: 25, deferredUpdatesInterval: 15 * MIN });
    expect(trackingOptions(session({ kind: 'TRIP' }), 'android', accuracy)).toMatchObject({ timeInterval: 30_000 });
    expect(trackingOptions(session({ kind: 'TRIP' }), 'ios', accuracy)).toMatchObject({ distanceInterval: 100 });
  });

  it('keeps the interval within 5 to 120 minutes', () => {
    expect(expectedGapMs(session({ everyMinutes: 1 }))).toBe(5 * MIN);
    expect(expectedGapMs(session({ everyMinutes: 600 }))).toBe(120 * MIN);
    expect(expectedGapMs(session({ everyMinutes: undefined }))).toBe(30 * MIN);
  });
});

describe('which points are kept', () => {
  it('keeps one per interval during a visit, allowing a minute early', () => {
    const s = session();
    expect(keepPoint(s, null, T0)).toBe(true);
    expect(keepPoint(s, T0, T0 + 10 * MIN)).toBe(false);
    expect(keepPoint(s, T0, T0 + 29 * MIN)).toBe(true);
    expect(keepPoint(session({ kind: 'TRIP' }), T0, T0 + 10_000)).toBe(false);
    expect(keepPoint(session({ kind: 'TRIP' }), T0, T0 + 30_000)).toBe(true);
  });

  it('thins what iOS sends to one point per interval, with the battery level for the test', async () => {
    await AsyncStorage.setItem('location.session', JSON.stringify(session()));
    const battery = jest.fn(async () => 87);
    // iOS wakes the app every few minutes while the phone moves round the house.
    await receiveLocations([fix(T0 + 3 * MIN), fix(T0 + 1 * MIN), fix(T0 + 12 * MIN)], T0 + 13 * MIN, battery);
    await receiveLocations([fix(T0 + 20 * MIN), fix(T0 + 31 * MIN, { mocked: true, accuracy: 9.6 })], T0 + 32 * MIN, battery);
    const kept = await readPoints('s-1');
    expect(kept.map((p) => (p.at - T0) / MIN)).toEqual([1, 31]);
    expect(kept[1]).toMatchObject({ accuracyM: 10, mocked: true, battery: 87 });
  });

  it('stops by itself after the hard stop, and keeps nothing more', async () => {
    await AsyncStorage.setItem('location.session', JSON.stringify(session({ endsBy: T0 + 60 * MIN })));
    await receiveLocations([fix(T0 + 61 * MIN)], T0 + 61 * MIN, async () => 50);
    expect(await readPoints()).toEqual([]);
    expect(await AsyncStorage.getItem('location.session')).toBeNull();
  });

  it('keeps nothing with no session (the phone woke the app after it was stopped)', async () => {
    await receiveLocations([fix(T0)], T0, async () => 50);
    expect(await readPoints()).toEqual([]);
  });
});

describe('the test summary', () => {
  const point = (minutes: number, battery: number | null, extra: Partial<TrackPoint> = {}): TrackPoint => ({
    at: T0 + minutes * MIN,
    latitude: 6.9271,
    longitude: 79.8452,
    accuracyM: 20,
    speed: null,
    mocked: false,
    battery,
    ...extra,
  });

  it('counts gaps, the longest one, battery per hour and simulated positions', () => {
    const s = session();
    const points = [point(0, 90), point(30, 89), point(60, 88), point(180, 84, { accuracyM: 40, mocked: true }), point(210, 83)];
    const summary = summarise(s, points, T0 + 240 * MIN);
    expect(summary).toMatchObject({ points: 5, minutes: 240, gaps: 1, longestGapMinutes: 120, batteryStart: 90, batteryNow: 83, mocked: 1, medianAccuracyM: 20 });
    expect(summary.batteryPerHour).toBe(2);
  });

  it('counts a phone that went quiet up to now as a gap', () => {
    expect(summarise(session(), [point(0, 90)], T0 + 90 * MIN).gaps).toBe(1);
    expect(summarise(session(), [point(0, 90)], T0 + 50 * MIN).gaps).toBe(0);
  });

  it('shares the points as CSV, oldest first', () => {
    const csv = toCsv([point(30, null), point(0, 90, { mocked: true })]).split('\n');
    expect(csv[0]).toBe('time,latitude,longitude,accuracy_m,speed_m_s,mocked,battery_pct');
    expect(csv[1]).toBe('2026-11-25T04:00:00.000Z,6.9271,79.8452,20,,1,90');
    expect(csv[2]).toBe('2026-11-25T04:30:00.000Z,6.9271,79.8452,20,,0,');
  });
});

describe('the test mode', () => {
  it('is in internal builds only, never the store app', () => {
    const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      expect(locationTestAvailable('preview')).toBe(true);
      expect(locationTestAvailable('development')).toBe(true);
      expect(locationTestAvailable('production')).toBe(false);
      expect(locationTestAvailable(null)).toBe(false);
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
    }
  });
});

describe('the test screen', () => {
  it('offers the three tests, and says plainly when the build cannot track in the background', async () => {
    await render(
      <AppProviders>
        <LocationTest />
      </AppProviders>,
    );
    expect(await screen.findByText('Trip: every 30 s, up to 1 hour')).toBeTruthy();
    expect(screen.getByText('Visit: every 30 min, up to 9 hours')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start test' }));
    expect(await screen.findByText(/needs a new development or preview build/)).toBeTruthy();
  });
});
