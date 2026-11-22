import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { agreementVersion } from '@care-platform/shared';
import en from '../src/i18n/en.json';
import Register from '../app/(auth)/register';
import { AppProviders, serveApi } from '../test-utils/app';
import { mockRouter } from '../test-utils/router';
import { pickDate } from '../test-utils/calendar';
import { tokensFor } from '../test-utils/helpers';
import { tokenStore } from '@/api';
import { rememberSearch } from '@/care/last-search';

jest.mock('expo-router', () => require('../test-utils/router').expoRouterMock());

/**
 * Registering in the app (no more website): the sign-in method first, then
 * one form without anything the sign-in or the last search settled, and the
 * service agreement.
 */

const show = (ui: React.ReactElement) => render(<AppProviders>{ui}</AppProviders>);
const fill = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);

const METHODS = { email: true, whatsapp: true, providers: { GOOGLE: false, MICROSOFT: false, FACEBOOK: false } };
const DISTRICTS = [{ id: 1, name: 'Western', districts: [{ id: 1, name: 'Colombo' }] }];
const CITIES = [{ id: 340, name: 'Dehiwala', subName: null, postcode: '10350', latitude: 6.85, longitude: 79.86 }];

const commonRoutes = (side: 'client' | 'caregiver', extra: Parameters<typeof serveApi>[0] = {}) =>
  serveApi({
    'GET /auth/signup/methods': () => ({ status: 200, body: METHODS }),
    'GET /public/meta/locations/tree': () => ({ status: 200, body: DISTRICTS }),
    'GET /public/meta/locations/cities': () => ({ status: 200, body: CITIES }),
    'GET /public/meta/skills': () => ({ status: 200, body: [] }),
    'POST /auth/signup/whatsapp/request-otp': () => ({ status: 200, body: { phone: '+94771234567', resendAfterSeconds: 60, expiresInSeconds: 300, devOtp: '123456' } }),
    'POST /auth/signup/whatsapp/verify-otp': () => ({
      status: 200,
      body: { signedIn: false, ticket: 'wa-ticket', expiresInSeconds: 3600, method: 'WHATSAPP', side, phone: '+94771234567', email: null, name: null },
    }),
    ...extra,
  });

async function throughWhatsapp() {
  await fireEvent.press(await screen.findByRole('button', { name: en.signup.whatsapp }));
  await fill(en.signup.whatsappNumber, '0771234567');
  await fireEvent.press(screen.getByRole('button', { name: en.signup.sendCode }));
  await fireEvent.changeText(await screen.findByLabelText(en.signup.code), '123456');
  await fireEvent.press(screen.getByRole('button', { name: en.signup.verify }));
  await screen.findByText(en.signup.chosen.WHATSAPP.replace('{value}', '+94771234567'));
}

async function pick(label: string, choice: string) {
  await fireEvent.press(screen.getByRole('button', { name: label }));
  await fireEvent.press(await screen.findByText(choice));
}

beforeEach(() => {
  mockRouter.reset();
  rememberSearch(null);
});

describe('registering a client in the app', () => {
  it('starts with how to sign in, without asking again whether they have an account', async () => {
    commonRoutes('client');
    mockRouter.params = { role: 'client' };
    await show(<Register />);
    expect(await screen.findByRole('header', { name: en.signup.chooseTitle })).toBeTruthy();
    expect(await screen.findByRole('button', { name: en.signup.whatsapp })).toBeTruthy();
    expect(screen.getByRole('button', { name: en.signup.email })).toBeTruthy();
    // They tapped "Create an account" to get here.
    expect(screen.queryByText(en.signup.haveAccount)).toBeNull();
    expect(screen.queryByRole('button', { name: en.signup.signIn })).toBeNull();
  });

  it('after WhatsApp, asks no phone number, needs the agreement, and finishes signed in', async () => {
    const tokens = tokensFor('PATIENT_GUARDIAN', { patientId: 'p-1' });
    const calls = commonRoutes('client', { 'POST /auth/signup/client': () => ({ status: 201, body: { signedIn: true, method: 'WHATSAPP', tokens } }) });
    mockRouter.params = { role: 'client' };
    await show(<Register />);
    await throughWhatsapp();

    expect(screen.queryByLabelText(en.signup.phone)).toBeNull();
    // No email address: email is no way to reach them.
    expect(screen.queryByRole('radio', { name: en.patientIntake.options.contactMethod.EMAIL })).toBeNull();

    await fill(en.signup.fullName, 'Kamala Perera');
    await fireEvent.press(screen.getByRole('radio', { name: en.patientIntake.options.registrantType.SELF }));
    await fill(en.patientIntake.fields.yourAge, '72');
    // The first "Female" is their gender; the second, the caregiver they would prefer.
    await fireEvent.press(screen.getAllByRole('radio', { name: en.patientIntake.options.gender.FEMALE })[0]);
    await pick(en.patientIntake.fields.district, 'Colombo');
    await pick(en.patientIntake.fields.city, 'Dehiwala');
    await fireEvent.press(screen.getByRole('radio', { name: en.patientIntake.options.careSchedule.DAY }));
    await fireEvent.press(screen.getByRole('radio', { name: en.patientIntake.options.careStart.WITHIN_WEEK }));
    await fireEvent.press(screen.getByRole('checkbox', { name: en.signup.consentClient }));

    // Not yet: the agreement is not ticked.
    await fireEvent.press(screen.getByRole('button', { name: en.signup.submit }));
    expect(await screen.findByText(en.signup.agreement.required)).toBeTruthy();
    expect(calls.some((c) => c.route === 'POST /auth/signup/client')).toBe(false);

    await fireEvent.press(screen.getByRole('link', { name: en.signup.agreement.read }));
    expect(screen.getByText('Bookings and payment')).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I have read and agree to the client service agreement' }));
    await fireEvent.press(screen.getByRole('button', { name: en.signup.submit }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/start'));
    const body = calls.find((c) => c.route === 'POST /auth/signup/client')!.body;
    expect(body).toMatchObject({
      signupTicket: 'wa-ticket',
      fullName: 'Kamala Perera',
      registrantType: 'SELF',
      recipientAge: 72,
      recipientGender: 'FEMALE',
      districtId: 1,
      cityId: 340,
      careSchedule: 'DAY',
      careStart: 'WITHIN_WEEK',
      preferredContactMethod: 'WHATSAPP',
      agreementAccepted: true,
      agreementVersion: agreementVersion('client'),
    });
    expect(body).not.toHaveProperty('phone');
    // The description of the care is optional, and was left out.
    expect(body).not.toHaveProperty('careNeeds');
    expect(tokenStore.get()).toEqual(tokens);
  });

  it('does not ask again what the last search answered', async () => {
    rememberSearch({ patient: { age: 80, gender: 'MALE' }, location: { districtId: 1, cityId: 340 }, shift: 'NIGHT' }, 'Help for my father after a fall');
    commonRoutes('client');
    mockRouter.params = { role: 'client' };
    await show(<Register />);
    await fireEvent.press(await screen.findByRole('button', { name: en.signup.email }));
    await fill(en.signup.emailLabel, 'kamala@example.com');
    await fill(en.signup.passwordLabel, 'longenough');
    await fill(en.signup.confirmPassword, 'longenough');
    await fireEvent.press(screen.getByRole('button', { name: en.signup.continue }));

    expect(await screen.findByText(en.careIntent.fromSearch)).toBeTruthy();
    expect(screen.getByText('Age 80 · Male')).toBeTruthy();
    expect(screen.getByText('Help for my father after a fall')).toBeTruthy();
    // Answered, so not asked:
    expect(screen.queryByLabelText(en.patientIntake.fields.yourAge)).toBeNull();
    expect(screen.queryByRole('button', { name: en.patientIntake.fields.district })).toBeNull();
    expect(screen.queryByRole('radio', { name: en.patientIntake.options.careSchedule.DAY })).toBeNull();
    // Not answered, so asked - and the phone, after email:
    expect(screen.getByLabelText(en.signup.phone)).toBeTruthy();
    expect(screen.getByRole('radio', { name: en.patientIntake.options.careStart.IMMEDIATELY })).toBeTruthy();

    await fireEvent.press(screen.getByRole('link', { name: en.careIntent.edit }));
    expect(screen.getByLabelText(en.patientIntake.fields.yourAge)).toBeTruthy();
  });

  it('goes back to choosing when the sign-in step has expired', async () => {
    commonRoutes('client', { 'POST /auth/signup/client': () => ({ status: 401, body: { message: 'expired', code: 'ticket_expired' } }) });
    rememberSearch({ patient: { age: 80, gender: 'MALE' }, location: { districtId: 1, cityId: 340 }, shift: 'NIGHT', desiredStartDate: new Date().toISOString().slice(0, 10) });
    mockRouter.params = { role: 'client' };
    await show(<Register />);
    await throughWhatsapp();
    await fill(en.signup.fullName, 'Kamala Perera');
    await fireEvent.press(screen.getByRole('radio', { name: en.patientIntake.options.registrantType.SELF }));
    await fireEvent.press(screen.getByRole('checkbox', { name: en.signup.consentClient }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I have read and agree to the client service agreement' }));
    await fireEvent.press(screen.getByRole('button', { name: en.signup.submit }));
    expect(await screen.findByText(en.signup.errors.ticketExpired)).toBeTruthy();
    expect(screen.getByRole('header', { name: en.signup.chooseTitle })).toBeTruthy();
  });
});

describe('registering a caregiver in the app', () => {
  it('after email and password, asks the phone once, and says to check the inbox', async () => {
    const calls = commonRoutes('caregiver', {
      'GET /branding': () => ({ status: 200, body: { companyName: 'CareLink', officePhone: '011 234 5678' } }),
      'POST /auth/signup/caregiver': () => ({ status: 201, body: { signedIn: false, method: 'EMAIL', email: 'nadeesha@example.com', verificationSent: true, registrationNumber: 'CG-1' } }),
    });
    mockRouter.params = { role: 'caregiver' };
    await show(<Register />);
    // The office's number is right there for anyone who would rather call.
    expect(await screen.findByText(en.signup.callOffice.title)).toBeTruthy();

    await fireEvent.press(await screen.findByRole('button', { name: en.signup.email }));
    await fill(en.signup.emailLabel, 'nadeesha@example.com');
    await fill(en.signup.passwordLabel, 'longenough');
    await fill(en.signup.confirmPassword, 'longenough');
    await fireEvent.press(screen.getByRole('button', { name: en.signup.continue }));

    await fill(en.personalInfo.fields.fullName, 'Nadeesha Silva');
    await fill(en.signup.phone, '0771234567');
    await pickDate(en.personalInfo.fields.dateOfBirth, '1990-04-12');
    await fireEvent.press(screen.getByRole('radio', { name: en.personalInfo.options.gender.FEMALE }));
    await fireEvent.press(screen.getByRole('radio', { name: en.personalInfo.options.civilStatus.SINGLE }));
    await fill(en.personalInfo.fields.permanentAddress, '12 Temple Road, Colombo');
    await pick(en.personalInfo.fields.district, 'Colombo');
    await pick(en.personalInfo.fields.city, 'Dehiwala');
    await fill(en.personalInfo.fields.emergencyContactName, 'Kamal Silva');
    await fill(en.personalInfo.fields.emergencyContactNumber, '0712345678');
    await fill(en.personalInfo.fields.emergencyContactRelationship, 'Brother');
    await fireEvent.press(screen.getByRole('checkbox', { name: en.signup.consentCaregiver }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I have read and agree to the caregiver service agreement' }));
    await fireEvent.press(screen.getByRole('button', { name: en.signup.submit }));

    expect(await screen.findByText(en.signup.checkEmailTitle)).toBeTruthy();
    expect(screen.getByText(en.signup.regNumber.replace('{number}', 'CG-1'))).toBeTruthy();
    const body = calls.find((c) => c.route === 'POST /auth/signup/caregiver')!.body;
    expect(body).toMatchObject({
      email: 'nadeesha@example.com',
      password: 'longenough',
      phone: '0771234567',
      dateOfBirth: '1990-04-12',
      gender: 'FEMALE',
      civilStatus: 'SINGLE',
      districtId: 1,
      cityId: 340,
      agreementVersion: agreementVersion('caregiver'),
    });
  });
});

describe('calling the office instead (caregivers)', () => {
  it('is on the first registration step, and dials the office', async () => {
    const { Linking } = require('react-native');
    commonRoutes('caregiver', { 'GET /branding': () => ({ status: 200, body: { companyName: 'CareLink', officePhone: '011 234 5678' } }) });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    mockRouter.params = { role: 'caregiver' };
    await show(<Register />);
    await fireEvent.press(await screen.findByRole('button', { name: en.signup.callOffice.cta.replace('{phone}', '011 234 5678') }));
    expect(open).toHaveBeenCalledWith('tel:0112345678');
  });

  it('is left out when there is no office number', async () => {
    commonRoutes('caregiver', { 'GET /branding': () => ({ status: 200, body: { companyName: 'CareLink', officePhone: null } }) });
    mockRouter.params = { role: 'caregiver' };
    await show(<Register />);
    await screen.findByRole('button', { name: en.signup.whatsapp });
    expect(screen.queryByText(en.signup.callOffice.title)).toBeNull();
  });
});
