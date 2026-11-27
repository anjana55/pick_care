import { fireEvent, render, screen } from '@testing-library/react-native';
import en from '../src/i18n/en.json';
import CommunicationPreferencesScreen from '../app/communication-preferences';
import { AppProviders, serveApi } from '../test-utils/app';
import { mockRouter } from '../test-utils/router';
import { tokensFor } from '../test-utils/helpers';
import { tokenStore } from '@/api';

jest.mock('expo-router', () => require('../test-utils/router').expoRouterMock());

const show = () =>
  render(
    <AppProviders>
      <CommunicationPreferencesScreen />
    </AppProviders>,
  );
const base = {
  preferredContactMethod: 'WHATSAPP',
  preferredContactTime: null,
  pushEnabled: true,
  reminderMessagesEnabled: true,
  hasAccount: true,
  hasEmail: false,
  hasPhone: true,
  appDevices: 1,
};

beforeEach(() => mockRouter.reset());

describe('How we contact you', () => {
  it('saves each choice as it is tapped, and hides email when there is no address', async () => {
    await tokenStore.set(tokensFor('PATIENT_GUARDIAN', { patientId: 'p-1', phone: '+94771234567' }));
    let current = { ...base };
    const calls = serveApi({
      'GET /me/communication-preferences': () => ({ status: 200, body: current }),
      'PATCH /me/communication-preferences': (body) => {
        current = { ...current, ...body };
        return { status: 200, body: current };
      },
    });
    await show();

    expect(await screen.findByRole('radio', { name: 'WhatsApp' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Email' })).toBeNull();
    expect(screen.getByText(en.commsPrefs.time)).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: 'Phone call' }));
    expect(await screen.findByText(en.commsPrefs.phoneCallHint)).toBeTruthy();
    await fireEvent(screen.getByLabelText(en.commsPrefs.push), 'valueChange', false);
    expect(await screen.findByText(en.commsPrefs.saved)).toBeTruthy();

    const patches = calls.filter((c) => c.route === 'PATCH /me/communication-preferences').map((c) => c.body);
    expect(patches).toEqual([{ preferredContactMethod: 'PHONE_CALL' }, { pushEnabled: false }]);
  });

  it("shows the API's reason when a save is refused, and no contact time for caregivers", async () => {
    await tokenStore.set(tokensFor('CAREGIVER', { caregiverId: 'cg-1', phone: '+94771234567' }));
    serveApi({
      'GET /me/communication-preferences': () => ({ status: 200, body: base }),
      'PATCH /me/communication-preferences': () => ({
        status: 400,
        body: { message: 'WhatsApp cannot be the preferred contact method without a phone number' },
      }),
    });
    await show();
    await fireEvent(await screen.findByLabelText(en.commsPrefs.reminders), 'valueChange', false);
    expect(await screen.findByText('WhatsApp cannot be the preferred contact method without a phone number')).toBeTruthy();
    expect(screen.queryByText(en.commsPrefs.time)).toBeNull();
  });
});
