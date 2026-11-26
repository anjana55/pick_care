import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { CaregiverShift, ClientBooking, ClientLive } from '@care-platform/shared';
import en from '../src/i18n/en.json';
import { OnMyWay, type OnMyWayDeps } from '../src/caregiver/OnMyWay';
import { VisitChecks, visitSession, type VisitChecksDeps } from '../src/caregiver/VisitChecks';
import { OnTheWay, liveHtml } from '../src/care/OnTheWay';
import { visitSoon } from '../src/care/bookings-api';
import { flushOutbox } from '../src/location/outbox';
import type { TrackPoint, TrackSession } from '../src/location/session';
import { AppProviders, serveApi } from '../test-utils/app';
import { mockRouter } from '../test-utils/router';
import { tokensFor } from '../test-utils/helpers';
import { tokenStore } from '@/api';

jest.mock('expo-router', () => require('../test-utils/router').expoRouterMock());

const show = (ui: React.ReactElement) => render(<AppProviders>{ui}</AppProviders>);
const NOW = Date.parse('2026-11-25T02:00:00.000Z');
const MIN = 60_000;

beforeEach(async () => {
  mockRouter.reset();
  await AsyncStorage.clear();
});

const shift = (onMyWay: CaregiverShift['checkIn'] extends infer C ? (C extends { onMyWay: infer O } ? O : never) : never): CaregiverShift => ({
  id: 's-1',
  paused: false,
  cantMake: null,
  startsAt: new Date(NOW + 40 * MIN).toISOString(),
  endsAt: new Date(NOW + 8 * 60 * MIN).toISOString(),
  status: 'SCHEDULED',
  isCover: false,
  bookingReference: 'BK-1',
  scheduleType: 'DAY',
  area: 'Colombo',
  hasCarePlan: false,
  checkIn: { state: 'UPCOMING', opensAt: new Date(NOW - 20 * MIN).toISOString(), checkedInAt: null, checkedOutAt: null, codeLocked: false, onMyWay, presence: null },
});

const deps = (over: Partial<OnMyWayDeps> = {}): OnMyWayDeps => ({
  start: jest.fn(async () => 'started' as const),
  finish: jest.fn(async () => undefined),
  tracking: jest.fn(async () => true),
  now: () => NOW,
  ...over,
});

describe('On my way (caregiver)', () => {
  beforeEach(async () => {
    await tokenStore.set(tokensFor('CAREGIVER', { caregiverId: 'cg-1' }));
  });

  it('says when it opens, before it does', async () => {
    await show(<OnMyWay shift={shift({ opensAt: new Date(NOW + 10 * MIN).toISOString(), shareId: null, sharingSince: null })} deps={deps()} />);
    expect(await screen.findByText(/"On my way" opens at/)).toBeTruthy();
  });

  it('explains once, then starts sharing with the share\'s own upload token', async () => {
    const calls = serveApi({
      'POST /me/shifts/s-1/on-my-way': () => ({ status: 200, body: { shareId: 'sh-1', uploadToken: 'tok', kind: 'ON_THE_WAY', endsBy: new Date(NOW + 180 * MIN).toISOString() } }),
      'GET /me/shifts': () => ({ status: 200, body: [] }),
    });
    const d = deps();
    await show(<OnMyWay shift={shift({ opensAt: new Date(NOW - 20 * MIN).toISOString(), shareId: null, sharingSince: null })} deps={d} />);
    await fireEvent.press(await screen.findByRole('button', { name: en.onMyWay.start }));
    expect(await screen.findByText(en.onMyWay.explain)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: en.onMyWay.agree }));
    await screen.findByRole('button', { name: en.onMyWay.start });
    expect(calls.filter((c) => c.route === 'POST /me/shifts/s-1/on-my-way')).toHaveLength(1);
    expect(d.start).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sh-1', kind: 'TRIP', sink: 'SERVER', uploadToken: 'tok', shiftId: 's-1', endsBy: NOW + 180 * MIN, notification: { title: en.onMyWay.notificationTitle, body: en.onMyWay.notificationBody } }),
    );
    // The second time, no explanation.
    await fireEvent.press(screen.getByRole('button', { name: en.onMyWay.start }));
    await screen.findByRole('button', { name: en.onMyWay.start });
    expect(calls.filter((c) => c.route === 'POST /me/shifts/s-1/on-my-way')).toHaveLength(2);
  });

  it('closes the share and says why when the phone may not share', async () => {
    await AsyncStorage.setItem('location.onMyWay.explained.v1', 'yes');
    const calls = serveApi({
      'POST /me/shifts/s-1/on-my-way': () => ({ status: 200, body: { shareId: 'sh-2', uploadToken: 'tok', kind: 'ON_THE_WAY', endsBy: new Date(NOW + 180 * MIN).toISOString() } }),
      'POST /me/location-shares/sh-2/stop': () => ({ status: 200, body: { ok: true } }),
      'GET /me/shifts': () => ({ status: 200, body: [] }),
    });
    await show(<OnMyWay shift={shift({ opensAt: new Date(NOW - 20 * MIN).toISOString(), shareId: null, sharingSince: null })} deps={deps({ start: jest.fn(async () => 'denied' as const) })} />);
    await fireEvent.press(await screen.findByRole('button', { name: en.onMyWay.start }));
    expect(await screen.findByText(en.onMyWay.denied)).toBeTruthy();
    expect(calls.map((c) => c.route)).toContain('POST /me/location-shares/sh-2/stop');
  });

  it('shows it is sharing, and stops when asked', async () => {
    await AsyncStorage.setItem('location.session', JSON.stringify({ id: 'sh-3', kind: 'TRIP', startedAt: NOW, endsBy: NOW + 3_600_000, sink: 'SERVER', notification: { title: '', body: '' } }));
    const calls = serveApi({ 'POST /me/location-shares/sh-3/stop': () => ({ status: 200, body: { ok: true } }), 'GET /me/shifts': () => ({ status: 200, body: [] }) });
    const d = deps();
    await show(<OnMyWay shift={shift({ opensAt: new Date(NOW - 20 * MIN).toISOString(), shareId: 'sh-3', sharingSince: new Date(NOW).toISOString() })} deps={d} />);
    expect(await screen.findByText(en.onMyWay.sharing)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: en.onMyWay.stop }));
    await screen.findByText(en.onMyWay.sharing);
    expect(calls.map((c) => c.route)).toContain('POST /me/location-shares/sh-3/stop');
    expect(d.finish).toHaveBeenCalled();
  });

  it('offers to share again from a phone that is not the one sharing', async () => {
    await show(<OnMyWay shift={shift({ opensAt: new Date(NOW - 20 * MIN).toISOString(), shareId: 'sh-elsewhere', sharingSince: new Date(NOW).toISOString() })} deps={deps({ tracking: jest.fn(async () => false) })} />);
    expect(await screen.findByRole('button', { name: en.onMyWay.again })).toBeTruthy();
    expect(screen.getByText(en.onMyWay.notThisPhone)).toBeTruthy();
  });
});

describe('sending the points', () => {
  const session: TrackSession = { id: 'sh-9', kind: 'TRIP', startedAt: NOW, endsBy: NOW + 3_600_000, sink: 'SERVER', uploadToken: 'secret', notification: { title: '', body: '' } };
  const points = (n: number): TrackPoint[] => Array.from({ length: n }, (_, i) => ({ at: NOW + i * 30_000, latitude: 6.93, longitude: 79.85, accuracyM: 20, speed: null, mocked: false, battery: null }));
  const answer = (status: number, body: object) => jest.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

  it('sends in batches of 50 with the upload token, forgetting each batch once the API has it', async () => {
    const fetch = answer(200, { accepted: 50, open: true });
    const forget = jest.fn(async () => undefined);
    const stop = jest.fn(async () => undefined);
    expect(await flushOutbox(session, { read: async () => points(70), forget, stop, fetch: fetch as never })).toBe('sent');
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/location-shares\/sh-9\/points$/);
    expect((init.headers as Record<string, string>)['X-Share-Token']).toBe('secret');
    expect(JSON.parse(String(init.body)).points).toHaveLength(50);
    expect(forget).toHaveBeenNthCalledWith(1, 'sh-9', NOW + 49 * 30_000);
    expect(stop).not.toHaveBeenCalled();
  });

  it('stops tracking once the share is closed, and keeps the points when offline', async () => {
    const stop = jest.fn(async () => undefined);
    expect(await flushOutbox(session, { read: async () => points(3), forget: jest.fn(async () => undefined), stop, fetch: answer(200, { accepted: 3, open: false }) as never })).toBe('closed');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(await flushOutbox(session, { read: async () => points(3), forget: jest.fn(async () => undefined), stop, fetch: answer(401, {}) as never })).toBe('closed');
    const forget = jest.fn(async () => undefined);
    const offline = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    expect(await flushOutbox(session, { read: async () => points(3), forget, stop, fetch: offline as never })).toBe('offline');
    expect(forget).not.toHaveBeenCalled();
    // The test mode's points never go anywhere.
    expect(await flushOutbox({ ...session, sink: 'TEST' }, { read: async () => points(3), forget, stop, fetch: offline as never })).toBe('nothing');
  });
});

describe('on the way (client)', () => {
  const booking = (onTheWay: boolean): ClientBooking =>
    ({ id: 'b-1', shifts: [{ id: 's-1', startsAt: new Date(NOW + 20 * MIN).toISOString(), endsAt: new Date(NOW + 300 * MIN).toISOString(), status: 'SCHEDULED', isCover: false, visit: { arrivalCode: null, checkedInAt: null, checkedOutAt: null, onTheWay } }] }) as unknown as ClientBooking;
  const live = (over: Partial<Extract<ClientLive, { status: 'ON_THE_WAY' }>> = {}): ClientLive => ({
    status: 'ON_THE_WAY',
    shiftId: 's-1',
    caregiverName: 'Nimal',
    startsAt: new Date(NOW + 20 * MIN).toISOString(),
    position: { latitude: 6.95, longitude: 79.85, accuracyM: 20 },
    home: { latitude: 6.9271, longitude: 79.8452 },
    eta: { minutes: 12, arriving: false, distanceM: 2600 },
    updatedAt: new Date(NOW).toISOString(),
    stale: false,
    ...over,
  });

  it('shows who is coming and about how long', async () => {
    await tokenStore.set(tokensFor('PATIENT_GUARDIAN', { patientId: 'p-1' }));
    serveApi({ 'GET /me/bookings/b-1/live': () => ({ status: 200, body: live() }) });
    await show(<OnTheWay bookings={[booking(true)]} />);
    expect(await screen.findByText('Nimal is on the way')).toBeTruthy();
    expect(screen.getByText('About 12 min away')).toBeTruthy();
  });

  it('shows nothing, and asks nothing, when nobody is on the way', async () => {
    await tokenStore.set(tokensFor('PATIENT_GUARDIAN', { patientId: 'p-1' }));
    const calls = serveApi({ 'GET /branding': () => ({ status: 200, body: {} }) });
    await show(<OnTheWay bookings={[booking(false)]} />);
    expect(screen.queryByText('Nimal is on the way')).toBeNull();
    expect(calls.filter((c) => c.route.endsWith('/live'))).toHaveLength(0);
  });

  it('says so when the location stops updating', async () => {
    await tokenStore.set(tokensFor('PATIENT_GUARDIAN', { patientId: 'p-1' }));
    serveApi({ 'GET /me/bookings/b-1/live': () => ({ status: 200, body: live({ stale: true }) }) });
    await show(<OnTheWay bookings={[booking(true)]} />);
    expect(await screen.findByText(en.onTheWay.stale)).toBeTruthy();
  });

  it('says when they are arriving', async () => {
    await tokenStore.set(tokensFor('PATIENT_GUARDIAN', { patientId: 'p-1' }));
    serveApi({ 'GET /me/bookings/b-1/live': () => ({ status: 200, body: live({ eta: { minutes: 0, arriving: true, distanceM: 120 } }) }) });
    await show(<OnTheWay bookings={[booking(true)]} />);
    expect(await screen.findByText(en.onTheWay.arriving)).toBeTruthy();
  });

  it('looks again every minute only while a visit is about to start', () => {
    expect(visitSoon([booking(false)], NOW)).toBe(true);
    expect(visitSoon([booking(false)], NOW - 5 * 60 * MIN)).toBe(false);
    expect(visitSoon(undefined, NOW)).toBe(false);
  });

  it('draws the caregiver and the home on the map', () => {
    const html = liveHtml('https://tiles.example/style.json', { latitude: 6.95, longitude: 79.85 }, { latitude: 6.9271, longitude: 79.8452 }, '#1F6A74');
    expect(html).toContain('var cg=[79.85,6.95], home=[79.8452,6.9271]');
    expect(html).toContain('interactive:false');
  });
});

describe('checks during a visit (caregiver)', () => {
  const checkedIn = (presence: { everyMinutes: number; shareId: string | null; askedAt: string | null }): CaregiverShift => {
    const s = shift(null);
    return { ...s, checkIn: { ...s.checkIn!, state: 'IN', checkedInAt: new Date(NOW - 30 * MIN).toISOString(), presence } };
  };
  const vdeps = (over: Partial<VisitChecksDeps> = {}): VisitChecksDeps => ({
    start: jest.fn(async () => 'started' as const),
    tracking: jest.fn(async () => true),
    session: jest.fn(async () => ({ id: 'vs-1', kind: 'SHIFT', everyMinutes: 30, startedAt: NOW, endsBy: NOW + 8 * 3_600_000, sink: 'SERVER', uploadToken: 't', shiftId: 's-1', notification: { title: '', body: '' } }) as TrackSession),
    ...over,
  });

  beforeEach(async () => {
    await tokenStore.set(tokensFor('CAREGIVER', { caregiverId: 'cg-1' }));
  });

  it('says the checks are running on this phone', async () => {
    await show(<VisitChecks shift={checkedIn({ everyMinutes: 30, shareId: 'vs-1', askedAt: null })} deps={vdeps()} />);
    expect(await screen.findByText('Location checked every 30 minutes until you check out.')).toBeTruthy();
  });

  it('starts again by itself when the phone stopped tracking (iOS, app swiped away)', async () => {
    const d = vdeps({ tracking: jest.fn(async () => false) });
    await show(<VisitChecks shift={checkedIn({ everyMinutes: 30, shareId: 'vs-1', askedAt: null })} deps={d} />);
    expect(await screen.findByText('Location checked every 30 minutes until you check out.')).toBeTruthy();
    expect(d.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'vs-1', kind: 'SHIFT' }));
  });

  it('offers "Share from this phone" when another phone runs them, and starts from a fresh share', async () => {
    const calls = serveApi({
      'POST /me/shifts/s-1/presence/restart': () => ({ status: 200, body: { shareId: 'vs-2', uploadToken: 'tok2', kind: 'ON_SHIFT', everyMinutes: 30, endsBy: new Date(NOW + 8 * 3_600_000).toISOString() } }),
      'GET /me/shifts': () => ({ status: 200, body: [] }),
    });
    const d = vdeps({ session: jest.fn(async () => null) });
    await show(<VisitChecks shift={checkedIn({ everyMinutes: 30, shareId: 'vs-1', askedAt: null })} deps={d} />);
    await fireEvent.press(await screen.findByRole('button', { name: en.onMyWay.again }));
    await screen.findByRole('button', { name: en.onMyWay.again });
    expect(calls.map((c) => c.route)).toContain('POST /me/shifts/s-1/presence/restart');
    expect(d.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'vs-2', kind: 'SHIFT', everyMinutes: 30, uploadToken: 'tok2', sink: 'SERVER' }));
  });

  it('answers "Still with the client?"', async () => {
    const calls = serveApi({ 'POST /me/shifts/s-1/presence/reply': () => ({ status: 200, body: { ok: true } }), 'GET /me/shifts': () => ({ status: 200, body: [] }) });
    await show(<VisitChecks shift={checkedIn({ everyMinutes: 30, shareId: 'vs-1', askedAt: new Date(NOW).toISOString() })} deps={vdeps()} />);
    expect(await screen.findByText(en.visitChecks.askTitle)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: en.visitChecks.outForClient }));
    await screen.findByText(en.visitChecks.askTitle);
    expect(calls.find((c) => c.route === 'POST /me/shifts/s-1/presence/reply')!.body).toEqual({ reply: 'OUT_FOR_CLIENT' });
  });

  it('builds the phone session from the check-in answer', () => {
    const session = visitSession({ shareId: 'vs-9', uploadToken: 'x', kind: 'ON_SHIFT', everyMinutes: 15, endsBy: new Date(NOW + MIN).toISOString() }, 's-1', { title: 'a', body: 'b' }, NOW);
    expect(session).toEqual({ id: 'vs-9', kind: 'SHIFT', everyMinutes: 15, startedAt: NOW, endsBy: NOW + MIN, sink: 'SERVER', uploadToken: 'x', shiftId: 's-1', notification: { title: 'a', body: 'b' } });
  });
});
