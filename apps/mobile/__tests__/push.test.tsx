import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PushRegistration, DEVICE_ID_KEY } from '../src/push/PushRegistration';
import { useTranslation } from '@/i18n';
import { AppProviders, serveApi } from '../test-utils/app';
import { mockRouter } from '../test-utils/router';
import { tokensFor } from '../test-utils/helpers';
import { tokenStore } from '@/api';

jest.mock('expo-router', () => require('../test-utils/router').expoRouterMock());

// The phone's notification system: a tapped notification is delivered to the listener.
const mockTapListeners: ((r: unknown) => void)[] = [];
let mockLastResponse: unknown = null;
const mockNotifications = {
  getLastNotificationResponse: () => mockLastResponse,
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  addNotificationResponseReceivedListener: (fn: (r: unknown) => void) => {
    mockTapListeners.push(fn);
    return { remove: () => mockTapListeners.splice(mockTapListeners.indexOf(fn), 1) };
  },
  // A push arriving while the app is open.
  addNotificationReceivedListener: (fn: (r: unknown) => void) => {
    mockReceivedListeners.push(fn);
    return { remove: () => mockReceivedListeners.splice(mockReceivedListeners.indexOf(fn), 1) };
  },
  setBadgeCountAsync: jest.fn(async (_n: number) => true),
};
const mockReceivedListeners: ((r: unknown) => void)[] = [];
jest.mock('../src/push/notifications', () => ({
  ...jest.requireActual('../src/push/notifications'),
  notifications: () => mockNotifications,
  localNotifications: () => mockNotifications,
}));
const tap = (path: string) => ({ notification: { request: { content: { data: { path } } } } });

function SinhalaButton() {
  const { setLocale } = useTranslation();
  return (
    <Pressable onPress={() => setLocale('si')}>
      <Text>සිංහල</Text>
    </Pressable>
  );
}

const TOKEN = 'ExponentPushToken[phone-1]';

async function showApp(getPushToken: () => Promise<string | null>) {
  return render(
    <AppProviders>
      <PushRegistration getPushToken={getPushToken} />
      <SinhalaButton />
    </AppProviders>,
  );
}

beforeEach(() => {
  mockRouter.reset();
  mockTapListeners.length = 0;
  mockLastResponse = null;
});

describe('push registration', () => {
  it('registers a signed-in person’s phone, in the app’s language, and remembers it', async () => {
    await tokenStore.set(tokensFor('CAREGIVER'));
    const calls = serveApi({ 'POST /me/devices': () => ({ status: 200, body: { id: 'd-1' } }) });
    await showApp(async () => TOKEN);

    await waitFor(() => expect(calls.filter((c) => c.route === 'POST /me/devices')).toHaveLength(1));
    const call = calls.find((c) => c.route === 'POST /me/devices')!;
    expect(call.body).toMatchObject({ expoPushToken: TOKEN, platform: 'ios', locale: 'en' });
    expect(call.headers.Authorization).toMatch(/^Bearer /);
    await waitFor(async () => expect(await AsyncStorage.getItem(DEVICE_ID_KEY)).toBe('d-1'));
  });

  it('registers again in the new language when the person switches it, so pushes come in that language', async () => {
    await tokenStore.set(tokensFor('PATIENT_GUARDIAN'));
    const calls = serveApi({ 'POST /me/devices': () => ({ status: 200, body: { id: 'd-1' } }) });
    await showApp(async () => TOKEN);
    await waitFor(() => expect(calls.filter((c) => c.route === 'POST /me/devices')).toHaveLength(1));

    await fireEvent.press(screen.getByText('සිංහල'));
    await waitFor(() => expect(calls.filter((c) => c.route === 'POST /me/devices')).toHaveLength(2));
    expect(calls.filter((c) => c.route === 'POST /me/devices')[1].body.locale).toBe('si');
  });

  it('does nothing for someone who isn’t signed in, and forgets the phone’s id', async () => {
    await AsyncStorage.setItem(DEVICE_ID_KEY, 'd-old');
    const calls = serveApi({});
    const getToken = jest.fn(async () => TOKEN);
    await showApp(getToken);
    await waitFor(async () => expect(await AsyncStorage.getItem(DEVICE_ID_KEY)).toBeNull());
    expect(getToken).not.toHaveBeenCalled();
    expect(calls.some((c) => c.route === 'POST /me/devices')).toBe(false);
  });

  it('carries on without push when the person says no to notifications', async () => {
    await tokenStore.set(tokensFor('CAREGIVER'));
    const calls = serveApi({});
    const getToken = jest.fn(async () => null);
    await showApp(getToken);
    await waitFor(() => expect(getToken).toHaveBeenCalled());
    expect(calls.some((c) => c.route === 'POST /me/devices')).toBe(false);
  });
});

describe('tapping a notification', () => {
  it('opens the app on the screen it is about', async () => {
    await tokenStore.set(tokensFor('PATIENT_GUARDIAN'));
    serveApi({});
    await showApp(async () => null);
    await act(async () => mockTapListeners.forEach((fn) => fn(tap('/bookings/b-1'))));
    // A booking notice opens the Bookings tab.
    expect(mockRouter.push).toHaveBeenCalledWith('/bookings');
  });

  it('opens it too when the tap started the app', async () => {
    mockLastResponse = tap('/home');
    serveApi({});
    await showApp(async () => null);
    // It waits a tick for the navigator to mount.
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(mockRouter.push).toHaveBeenCalledWith('/home');
    expect(mockNotifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
  });

  it('marks the bell row it was about read', async () => {
    await tokenStore.set(tokensFor('CAREGIVER'));
    const calls = serveApi({ 'POST /me/notifications/read': () => ({ status: 200, body: { marked: 1 } }) });
    await showApp(async () => null);
    await act(async () =>
      mockTapListeners.forEach((fn) => fn({ notification: { request: { content: { data: { path: '/documents', notificationId: 'n-7' } } } } })),
    );
    expect(mockRouter.push).toHaveBeenCalledWith('/documents');
    await waitFor(() => expect(calls.find((c) => c.route === 'POST /me/notifications/read')?.body).toEqual({ ids: ['n-7'] }));
  });

  // The bug: a caregiver tapping "a family has asked for you" landed on the
  // client's My requests, which showed "Sign up to contact this caregiver".
  it('opens a caregiver’s care request notice on their own side, never the client’s My requests', async () => {
    await tokenStore.set(tokensFor('CAREGIVER'));
    serveApi({});
    await showApp(async () => null);
    await act(async () => mockTapListeners.forEach((fn) => fn(tap('/requests/r-1'))));
    expect(mockRouter.push).toHaveBeenCalledWith('/notifications');
    expect(mockRouter.push).not.toHaveBeenCalledWith('/requests');
  });

  it('opens a client’s care request notice on My requests', async () => {
    await tokenStore.set(tokensFor('PATIENT_GUARDIAN'));
    serveApi({});
    await showApp(async () => null);
    await act(async () => mockTapListeners.forEach((fn) => fn(tap('/requests/r-1'))));
    expect(mockRouter.push).toHaveBeenCalledWith('/requests');
  });
});

describe('where push works', () => {
  it('needs the Expo project id, which comes with the build setup', () => {
    const { pushSupported } = jest.requireActual('../src/push/notifications');
    expect(pushSupported()).toBe(false);
  });

  it('opens the screen a notice is about, and only screens the app has', () => {
    const { screenFor } = jest.requireActual('../src/push/notifications');
    const client = (p: unknown) => screenFor(p, 'PATIENT_GUARDIAN');
    expect(client('/home')).toBe('/home');
    expect(client('/bookings/b-1')).toBe('/bookings');
    expect(client('/care')).toBe('/bookings');
    expect(client('/requests/r-1')).toBe('/requests');
    expect(client('/bookings/b-1/../../admin')).toBe('/home');
    expect(client('/invoices/9')).toBe('/home');
    expect(client('/invoices')).toBe('/invoices');
    expect(client('/notifications')).toBe('/notifications');
    expect(client(undefined)).toBe('/home');
    // A client never opens a caregiver-only screen.
    for (const p of ['/shifts', '/payments', '/documents', '/me/ratings', '/care-offers']) expect(client(p)).toBe('/home');
  });

  it('sends a caregiver only to screens on their side', () => {
    const { screenFor } = jest.requireActual('../src/push/notifications');
    const caregiver = (p: unknown) => screenFor(p, 'CAREGIVER');
    expect(caregiver('/requests/r-1')).toBe('/notifications');
    expect(caregiver('/requests')).toBe('/notifications');
    expect(caregiver('/bookings/b-1')).toBe('/shifts');
    expect(caregiver('/care')).toBe('/shifts');
    expect(caregiver('/shifts')).toBe('/shifts');
    expect(caregiver('/documents')).toBe('/documents');
    expect(caregiver('/payments')).toBe('/payments');
    expect(caregiver('/me/ratings')).toBe('/ratings');
    expect(caregiver('/care-offers')).toBe('/offers');
    expect(caregiver('/notifications')).toBe('/notifications');
    // Client-only screens are never opened for a caregiver.
    for (const p of ['/invoices', '/invoices/9e0c1b2a-0000-4000-8000-000000000000', '/bookings/9e0c1b2a-0000-4000-8000-000000000000/rate/CG-1'])
      expect(caregiver(p)).toBe('/home');
  });
});
