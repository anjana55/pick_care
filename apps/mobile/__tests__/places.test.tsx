import { fireEvent, render, screen } from '@testing-library/react-native';
import type { CareLocation, CaregiverShift } from '@care-platform/shared';
import en from '../src/i18n/en.json';
import CarePlaces from '../app/care-places';
import { ShiftCheckIn } from '../src/caregiver/ShiftCheckIn';
import { pinHtml } from '../src/places/PinMap';
import { AppProviders, serveApi } from '../test-utils/app';
import { mockRouter } from '../test-utils/router';
import { tokensFor } from '../test-utils/helpers';
import { tokenStore } from '@/api';

jest.mock('expo-router', () => require('../test-utils/router').expoRouterMock());

const show = (ui: React.ReactElement) => render(<AppProviders>{ui}</AppProviders>);
const HOME = { latitude: 6.9271, longitude: 79.8452 };

beforeEach(() => mockRouter.reset());

describe('Check-in: "you\'re at the client\'s home"', () => {
  const shift: CaregiverShift = {
    id: 's-1',
    paused: false,
    cantMake: null,
    startsAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    endsAt: new Date(Date.now() + 8 * 3_600_000).toISOString(),
    status: 'SCHEDULED',
    isCover: false,
    bookingReference: 'BK-1',
    scheduleType: 'DAY',
    area: 'Colombo',
    hasCarePlan: false,
    checkIn: { state: 'DUE', opensAt: new Date().toISOString(), checkedInAt: null, checkedOutAt: null, codeLocked: false, onMyWay: null, presence: null },
  };

  it('asks once on opening, says the phone is at the home, and checks in with that same fix', async () => {
    await tokenStore.set(tokensFor('CAREGIVER', { caregiverId: 'cg-1' }));
    const calls = serveApi({
      'POST /me/shifts/s-1/near': () => ({ status: 200, body: { atHome: true } }),
      'POST /me/shifts/s-1/check-in': () => ({ status: 200, body: { ok: true } }),
      'GET /me/shifts': () => ({ status: 200, body: [shift] }),
    });
    const locate = jest.fn(async () => ({ ...HOME, accuracyM: 12, mocked: true }));
    await show(<ShiftCheckIn shift={shift} locate={locate} />);
    await fireEvent.press(await screen.findByRole('button', { name: en.checkIn.caregiver.checkIn }));
    expect(await screen.findByText(en.checkIn.caregiver.atHome)).toBeTruthy();
    expect(calls.find((c) => c.route === 'POST /me/shifts/s-1/near')!.body).toEqual({ ...HOME, accuracyM: 12 });

    await fireEvent.changeText(screen.getByLabelText(en.checkIn.caregiver.codeLabel), '4821');
    await fireEvent.press(screen.getByRole('button', { name: en.checkIn.caregiver.submit }));
    await screen.findByRole('button', { name: en.checkIn.caregiver.checkIn });
    expect(calls.find((c) => c.route === 'POST /me/shifts/s-1/check-in')!.body).toEqual({ code: '4821', ...HOME, accuracyM: 12, mocked: true });
    expect(locate).toHaveBeenCalledTimes(1);
  });

  it('warns, without stopping the check-in, when the phone is not at the home', async () => {
    await tokenStore.set(tokensFor('CAREGIVER', { caregiverId: 'cg-1' }));
    serveApi({ 'POST /me/shifts/s-1/near': () => ({ status: 200, body: { atHome: false } }) });
    await show(<ShiftCheckIn shift={shift} locate={async () => ({ latitude: 7.2, longitude: 80.6, accuracyM: 20 })} />);
    await fireEvent.press(await screen.findByRole('button', { name: en.checkIn.caregiver.checkIn }));
    expect(await screen.findByText(en.checkIn.caregiver.notAtHome)).toBeTruthy();
    expect(screen.getByLabelText(en.checkIn.caregiver.codeLabel)).toBeTruthy();
  });
});

describe('Where care happens', () => {
  it('puts a pin on the home from where the phone is, then lists it', async () => {
    await tokenStore.set(tokensFor('PATIENT_GUARDIAN', { patientId: 'p-1' }));
    let places: CareLocation[] = [];
    const calls = serveApi({
      'GET /me/care-locations': () => ({ status: 200, body: places }),
      'POST /me/care-locations': (sent) => {
        const body = sent as { latitude: number; longitude: number; label?: string };
        places = [{ id: 'cl-1', label: body.label ?? 'Home', latitude: body.latitude, longitude: body.longitude, source: 'CLIENT_PIN', isDefault: true, confirmed: true, updatedAt: new Date().toISOString() }];
        return { status: 201, body: places[0] };
      },
    });
    await show(<CarePlaces locate={async () => ({ ...HOME, accuracyM: 8 })} />);
    await fireEvent.press(await screen.findByRole('button', { name: en.places.addFirst }));
    // Nothing to save until there is a point.
    expect(screen.getByRole('button', { name: en.places.save })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: en.places.useWhereIAm }));
    await fireEvent.changeText(screen.getByLabelText(en.places.label), ' Amma ');
    await fireEvent.press(screen.getByRole('button', { name: en.places.save }));
    expect(await screen.findByText('Amma')).toBeTruthy();
    expect(screen.getByText(en.places.default)).toBeTruthy();
    expect(calls.find((c) => c.route === 'POST /me/care-locations')!.body).toEqual({ ...HOME, label: 'Amma' });
  });

  it('says so when the phone cannot give a position', async () => {
    await tokenStore.set(tokensFor('PATIENT_GUARDIAN', { patientId: 'p-1' }));
    serveApi({ 'GET /me/care-locations': () => ({ status: 200, body: [] }) });
    await show(<CarePlaces locate={async () => ({})} />);
    await fireEvent.press(await screen.findByRole('button', { name: en.places.addFirst }));
    await fireEvent.press(screen.getByRole('button', { name: en.places.useWhereIAm }));
    expect(await screen.findByText(en.places.noLocation)).toBeTruthy();
  });

  it('finds the house by its typed address, and saves the pin there', async () => {
    await tokenStore.set(tokensFor('PATIENT_GUARDIAN', { patientId: 'p-1' }));
    const calls = serveApi({
      'GET /me/care-locations': () => ({ status: 200, body: [] }),
      'GET /geo/address-search': () => ({
        status: 200,
        body: {
          mapSearchUnavailable: false,
          results: [
            { label: '42 Temple Road', detail: 'Nugegoda, Colombo District', latitude: 6.8655, longitude: 79.9001, precision: 'ADDRESS', source: 'MAP' },
            { label: 'Nugegoda', detail: 'Colombo', latitude: 6.8649, longitude: 79.8997, precision: 'TOWN', source: 'TOWNS' },
          ],
        },
      }),
      'POST /me/care-locations': (body) => ({ status: 201, body: { id: 'cl-1', label: 'Home', ...body, source: 'CLIENT_PIN', isDefault: true, confirmed: true, updatedAt: new Date().toISOString() } }),
    });
    await show(<CarePlaces locate={async () => ({})} />);
    await fireEvent.press(await screen.findByRole('button', { name: en.places.addFirst }));
    await fireEvent.changeText(screen.getByLabelText(en.addressSearch.label), '42 Temple Road Nugegoda');
    await fireEvent.press(await screen.findByRole('button', { name: /^42 Temple Road, Nugegoda, Colombo District/ }, { timeout: 3000 }));
    expect(calls.find((c) => c.route === 'GET /geo/address-search')!.query).toEqual({ q: '42 Temple Road Nugegoda', locale: 'en' });
    expect(await screen.findByText(en.addressSearch.next.ADDRESS)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: en.places.save }));
    await screen.findByRole('button', { name: en.places.addFirst }).catch(() => undefined);
    expect(calls.find((c) => c.route === 'POST /me/care-locations')!.body).toEqual({ latitude: 6.8655, longitude: 79.9001 });
  });

  it('asks to zoom in on the house when only the town was found', async () => {
    await tokenStore.set(tokensFor('PATIENT_GUARDIAN', { patientId: 'p-1' }));
    serveApi({
      'GET /me/care-locations': () => ({ status: 200, body: [] }),
      'GET /geo/address-search': () => ({
        status: 200,
        body: { mapSearchUnavailable: true, results: [{ label: 'Nugegoda', detail: 'Colombo', latitude: 6.8649, longitude: 79.8997, precision: 'TOWN', source: 'TOWNS' }] },
      }),
    });
    await show(<CarePlaces locate={async () => ({})} />);
    await fireEvent.press(await screen.findByRole('button', { name: en.places.addFirst }));
    await fireEvent.changeText(screen.getByLabelText(en.addressSearch.label), 'Nugegoda');
    expect(await screen.findByText(en.addressSearch.mapSearchUnavailable, {}, { timeout: 3000 })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Nugegoda, Colombo/ }));
    expect(await screen.findByText(en.places.zoomIn)).toBeTruthy();
    expect(screen.getByRole('button', { name: en.places.save })).toBeDisabled();
  });

  it('builds a map page that opens at the place and only reports moves when it can be moved', () => {
    const editable = pinHtml('https://tiles.example/style.json', HOME, { editable: true, brand: '#1F6A74' });
    expect(editable).toContain('var at=[79.8452,6.9271]');
    expect(editable).toContain('interactive:true');
    const fixed = pinHtml('https://tiles.example/style.json', null, { editable: false, brand: '#1F6A74' });
    expect(fixed).toContain('interactive:false');
    expect(fixed).toContain('var at=null');
    // A found address can open wider than one house.
    expect(editable).toContain('zoom:p.zoom||17');
  });
});
