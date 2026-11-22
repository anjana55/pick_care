import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { createHash } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { agreementVersion } from '@care-platform/shared';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/database.module';
import { agreementAcceptances, caregivers, patients, socialAccounts, users } from '../src/database/schema';
import { SEED_PASSWORD } from './seed-password';

/**
 * Registration with the sign-in method chosen first (/auth/signup/*), against
 * the real database and HTTP stack. Only Google's servers are stood in for.
 */

const unlimitedThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }),
};

describe('Sign-up with the sign-in method first (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let adminToken: string;
  let intake: Record<string, unknown>;
  const realFetch = global.fetch;
  let googleProfile: { sub: string; email: string };

  const api = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const runBase = Math.floor(Date.now() / 1000) % 10_000;
  let counter = 0;
  const newPhone = () => `071${String(runBase * 1000 + ++counter).padStart(7, '0')}`;
  const newEmail = () => `signup${Date.now()}${++counter}@example.com`;
  const nonce = () => 'n'.repeat(8) + Math.random().toString(16).slice(2, 18).padEnd(16, '0');
  const agreement = (side: 'client' | 'caregiver') => ({ consentAccepted: true, agreementAccepted: true, agreementVersion: agreementVersion(side) });

  const caregiverFields = (name: string) => ({
    fullName: name,
    permanentAddress: '12 Temple Road, Colombo',
    dateOfBirth: '1992-06-15',
    gender: 'FEMALE',
    civilStatus: 'SINGLE',
    emergencyContactName: 'EC Person',
    emergencyContactNumber: '0770001111',
    emergencyContactRelationship: 'Sister',
  });

  async function whatsappTicket(side: 'client' | 'caregiver', phone = newPhone()) {
    const sent = await api().post('/auth/signup/whatsapp/request-otp').send({ side, phone }).expect(200);
    expect(sent.body.devOtp).toMatch(/^\d{6}$/);
    const verified = await api().post('/auth/signup/whatsapp/verify-otp').send({ side, phone, code: sent.body.devOtp }).expect(200);
    return { phone, normalised: sent.body.phone as string, body: verified.body };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage).useValue(unlimitedThrottle).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get<Database>(DRIZZLE);
    adminToken = (await api().post('/auth/login').send({ email: 'admin@care-platform.local', password: SEED_PASSWORD })).body.accessToken;

    const tree = (await api().get('/public/meta/locations/tree?locale=en').expect(200)).body as { districts: { id: number }[] }[];
    const districtId = tree.flatMap((p) => p.districts)[0].id;
    const cityId = (await api().get(`/public/meta/locations/cities?districtId=${districtId}&locale=en`).expect(200)).body[0].id as number;
    // No careNeeds: it is optional now.
    intake = {
      registrantType: 'GUARDIAN',
      recipientName: 'Sunil Fernando',
      recipientRelationship: 'PARENT',
      recipientAge: 78,
      recipientGender: 'MALE',
      preferredContactMethod: 'PHONE_CALL',
      districtId,
      cityId,
      careSchedule: 'DAY',
      careStart: 'WITHIN_WEEK',
    };

    await api()
      .patch('/settings/whatsapp')
      .set(bearer(adminToken))
      .send({
        enabled: true,
        provider: 'CONSOLE',
        caregiverEnabled: true,
        customerEnabled: true,
        registrationEnabled: true,
        loginEnabled: true,
        recoveryEnabled: true,
        otpLength: 6,
        otpTtlSeconds: 300,
        otpMaxAttempts: 5,
        otpResendCooldownSeconds: 15,
        otpMaxSendsPerHour: 20,
        defaultCountryCode: '94',
      })
      .expect(200);

    await db.execute(sql`DELETE FROM social_auth_provider_settings`);
    await api()
      .patch('/settings/social-auth/google')
      .set(bearer(adminToken))
      .send({ enabled: true, clientId: 'e2e-google-id.apps.googleusercontent.com', clientSecret: 'GOCSPX-e2e-secret-value' })
      .expect(200);
    global.fetch = jest.fn(async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'provider-access-token' }), { status: 200 });
      if (url.includes('openidconnect.googleapis.com/v1/userinfo')) {
        return new Response(JSON.stringify({ ...googleProfile, email_verified: true, name: 'Nimali Perera' }), { status: 200 });
      }
      return realFetch(input, init);
    }) as never;
  });

  afterAll(async () => {
    global.fetch = realFetch;
    await db.execute(sql`DELETE FROM social_auth_provider_settings`);
    await app.close();
  });

  beforeEach(() => {
    googleProfile = { sub: `g-${Math.random().toString(16).slice(2)}`, email: newEmail() };
  });

  it('says which sign-in methods the first screen may offer', async () => {
    const res = await api().get('/auth/signup/methods').query({ side: 'client' }).expect(200);
    expect(res.body).toEqual({ email: true, whatsapp: true, providers: { GOOGLE: true, MICROSOFT: false, FACEBOOK: false } });
    await api().get('/auth/signup/methods').query({ side: 'staff' }).expect(400);
  });

  describe('WhatsApp first', () => {
    it('registers a client without asking for the phone again, signed in at once', async () => {
      const { normalised, body } = await whatsappTicket('client');
      expect(body).toMatchObject({ signedIn: false, method: 'WHATSAPP', side: 'client', phone: normalised });
      expect(body.ticket).toMatch(/^[0-9a-f]{64}$/);

      const res = await api()
        .post('/auth/signup/client')
        .send({ fullName: 'Kamala Silva', signupTicket: body.ticket, ...intake, ...agreement('client') })
        .expect(201);
      expect(res.body).toMatchObject({ signedIn: true, method: 'WHATSAPP' });
      expect(res.body.tokens.accessToken).toBeDefined();

      const [user] = await db.select().from(users).where(eq(users.phone, normalised));
      expect(user).toMatchObject({ role: 'PATIENT_GUARDIAN', email: null, passwordHash: null });
      expect(user.phoneVerifiedAt).not.toBeNull();
      const [patient] = await db.select().from(patients).where(eq(patients.userId, user.id));
      expect(patient).toMatchObject({ phone: normalised, careNeeds: null, status: 'PENDING_REVIEW' });
      const accepted = await db.select().from(agreementAcceptances).where(eq(agreementAcceptances.userId, user.id));
      expect(accepted).toEqual([expect.objectContaining({ kind: 'CLIENT_SERVICE', version: agreementVersion('client') })]);

      // And can sign in with WhatsApp from then on (once the resend cooldown has passed).
      await db.execute(sql`UPDATE whatsapp_otps SET created_at = created_at - INTERVAL 1 HOUR`);
      const login = await api().post('/auth/whatsapp/request-otp').send({ phone: normalised, purpose: 'LOGIN', portal: 'customer' }).expect(201);
      expect(login.body.devOtp).toBeDefined();
    });

    it('accepts a ticket once only', async () => {
      const { body } = await whatsappTicket('client');
      const send = () => api().post('/auth/signup/client').send({ fullName: 'Once Only', signupTicket: body.ticket, ...intake, ...agreement('client') });
      await send().expect(201);
      const again = await send().expect(401);
      expect(again.body.code).toBe('ticket_expired');
    });

    it('does not let a client ticket register a caregiver', async () => {
      const { body } = await whatsappTicket('client');
      const res = await api()
        .post('/auth/signup/caregiver')
        .send({ ...caregiverFields('Wrong Side'), signupTicket: body.ticket, ...agreement('caregiver') })
        .expect(401);
      expect(res.body.code).toBe('ticket_expired');
    });

    it('signs a returning WhatsApp user in instead of registering them twice', async () => {
      const { phone, body } = await whatsappTicket('caregiver');
      await api().post('/auth/signup/caregiver').send({ ...caregiverFields('Returning Carer'), signupTicket: body.ticket, ...agreement('caregiver') }).expect(201);

      // A while later, the cooldown passed, they "register" again with the same number.
      await db.execute(sql`UPDATE whatsapp_otps SET created_at = created_at - INTERVAL 1 HOUR`);
      const again = await whatsappTicket('caregiver', phone);
      expect(again.body.signedIn).toBe(true);
      expect(again.body.tokens.accessToken).toBeDefined();
    });

    it('registers a caregiver with the verified number as their only phone', async () => {
      const { normalised, body } = await whatsappTicket('caregiver');
      const res = await api().post('/auth/signup/caregiver').send({ ...caregiverFields('WhatsApp Carer'), signupTicket: body.ticket, ...agreement('caregiver') }).expect(201);
      expect(res.body).toMatchObject({ signedIn: true, method: 'WHATSAPP' });
      expect(res.body.registrationNumber).toBeDefined();
      const [user] = await db.select().from(users).where(eq(users.phone, normalised));
      const [cg] = await db.select().from(caregivers).where(eq(caregivers.userId, user.id));
      expect(cg.primaryPhone).toBe(normalised);
    });

    it('refuses a wrong code', async () => {
      const phone = newPhone();
      await api().post('/auth/signup/whatsapp/request-otp').send({ side: 'client', phone }).expect(200);
      await api().post('/auth/signup/whatsapp/verify-otp').send({ side: 'client', phone, code: '000000' }).expect(401);
    });
  });

  describe('email and password', () => {
    it('registers a client and sends the confirmation link', async () => {
      const email = newEmail();
      const res = await api()
        .post('/auth/signup/client')
        .send({ fullName: 'Email Client', email, password: 'correct-horse-1', phone: newPhone(), ...intake, careNeeds: 'Help with meals', ...agreement('client') })
        .expect(201);
      expect(res.body).toMatchObject({ signedIn: false, method: 'EMAIL', email, verificationSent: true });
      expect(res.body.devVerificationUrl).toContain('/verify-email?token=');
      const [user] = await db.select().from(users).where(eq(users.email, email));
      expect(user.emailVerifiedAt).toBeNull();
      const [patient] = await db.select().from(patients).where(eq(patients.userId, user.id));
      expect(patient.careNeeds).toBe('Help with meals');
    });

    it('registers a caregiver with a password they can sign in with once confirmed', async () => {
      const email = newEmail();
      const res = await api()
        .post('/auth/signup/caregiver')
        .send({ ...caregiverFields('Email Carer'), email, password: 'correct-horse-2', phone: newPhone(), ...agreement('caregiver') })
        .expect(201);
      expect(res.body).toMatchObject({ signedIn: false, method: 'EMAIL', verificationSent: true });
      const token = new URL(res.body.devVerificationUrl).searchParams.get('token');
      await api().post('/auth/verify-email').send({ token }).expect(201);
      await api().post('/auth/login').send({ email, password: 'correct-horse-2', portal: 'caregiver' }).expect(201);
    });

    it('needs a phone number, an email and a password', async () => {
      await api().post('/auth/signup/client').send({ fullName: 'No Phone', email: newEmail(), password: 'correct-horse-3', ...intake, ...agreement('client') }).expect(400);
      await api().post('/auth/signup/client').send({ fullName: 'No Password', email: newEmail(), phone: newPhone(), ...intake, ...agreement('client') }).expect(400);
    });
  });

  describe('the service agreement', () => {
    it('must be accepted, and in its current version', async () => {
      const base = { fullName: 'Agreement Test', email: newEmail(), password: 'correct-horse-4', phone: newPhone(), ...intake, consentAccepted: true };
      await api().post('/auth/signup/client').send({ ...base, agreementAccepted: false, agreementVersion: agreementVersion('client') }).expect(400);
      const stale = await api().post('/auth/signup/client').send({ ...base, agreementAccepted: true, agreementVersion: '2020-01-01' }).expect(409);
      expect(stale.body.code).toBe('agreement_changed');
    });
  });

  describe('Google first', () => {
    async function googleRoundTrip(side: 'client' | 'caregiver', opts: { app?: boolean } = {}) {
      const n = nonce();
      const verifier = 'v'.repeat(50);
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const start = await api()
        .get('/auth/social/google/signup-url')
        .query({ nonce: n, side, ...(opts.app ? { client: 'app', challenge } : {}) })
        .expect(200);
      const state = new URL(start.body.url).searchParams.get('state')!;
      const cb = await api().get('/auth/social/google/callback').query({ code: 'provider-code', state }).expect(302);
      return { n, verifier, landing: new URL(cb.headers.location) };
    }

    it('proves the identity, then registers a client signed in, with the address verified', async () => {
      const { n, landing } = await googleRoundTrip('client');
      expect(landing.pathname).toBe('/social/callback');
      expect(landing.searchParams.get('flow')).toBe('identify');
      expect(landing.searchParams.get('nonce')).toBe(n);

      const identity = await api().post('/auth/signup/identity/exchange').send({ code: landing.searchParams.get('code') }).expect(200);
      expect(identity.body).toMatchObject({ method: 'GOOGLE', side: 'client', email: googleProfile.email, name: 'Nimali Perera' });
      // The code is single use.
      await api().post('/auth/signup/identity/exchange').send({ code: landing.searchParams.get('code') }).expect(401);

      const res = await api()
        .post('/auth/signup/client')
        .send({ fullName: 'Nimali Perera', phone: newPhone(), signupTicket: identity.body.ticket, ...intake, ...agreement('client') })
        .expect(201);
      expect(res.body).toMatchObject({ signedIn: true, method: 'GOOGLE' });
      const [user] = await db.select().from(users).where(eq(users.email, googleProfile.email));
      expect(user.emailVerifiedAt).not.toBeNull();
      const links = await db.select().from(socialAccounts).where(eq(socialAccounts.userId, user.id));
      expect(links).toEqual([expect.objectContaining({ provider: 'GOOGLE', providerAccountId: googleProfile.sub })]);
    });

    it('signs an already-registered identity in instead', async () => {
      const first = await googleRoundTrip('caregiver');
      const identity = await api().post('/auth/signup/identity/exchange').send({ code: first.landing.searchParams.get('code') }).expect(200);
      await api()
        .post('/auth/signup/caregiver')
        .send({ ...caregiverFields('Google Carer'), phone: newPhone(), signupTicket: identity.body.ticket, ...agreement('caregiver') })
        .expect(201);

      const again = await googleRoundTrip('caregiver');
      expect(again.landing.pathname).toBe('/caregiver/social/callback');
      expect(again.landing.searchParams.get('flow')).toBe('login');
      await api().post('/auth/social/exchange').send({ code: again.landing.searchParams.get('code') }).expect(201);
    });

    it('from the app, hands the ticket only to the verifier behind the challenge', async () => {
      const { verifier, landing } = await googleRoundTrip('client', { app: true });
      expect(landing.protocol).toBe('carelink:');
      const code = landing.searchParams.get('code');
      await api().post('/auth/signup/identity/exchange').send({ code, verifier: 'w'.repeat(50) }).expect(401);
      // Spent by the failed attempt.
      await api().post('/auth/signup/identity/exchange').send({ code, verifier }).expect(401);

      const second = await googleRoundTrip('client', { app: true });
      await api().post('/auth/signup/identity/exchange').send({ code: second.landing.searchParams.get('code'), verifier: second.verifier }).expect(200);
    });

    it('refuses an address that already has an account', async () => {
      const email = newEmail();
      await api()
        .post('/auth/signup/client')
        .send({ fullName: 'Taken Address', email, password: 'correct-horse-5', phone: newPhone(), ...intake, ...agreement('client') })
        .expect(201);
      googleProfile = { sub: `g-${Math.random()}`, email };
      const { landing } = await googleRoundTrip('client');
      expect(landing.searchParams.get('error')).toBe('email_taken');
      expect(landing.searchParams.get('flow')).toBe('identify');
    });
  });

  it('keeps a text size per language, changing only the languages sent', async () => {
    await api().patch('/settings/branding').set(bearer(adminToken)).send({ textScale: { si: 85 } }).expect(200);
    expect((await api().get('/branding').expect(200)).body.textScale).toEqual({ en: 100, si: 85, ta: 90 });
    await api().patch('/settings/branding').set(bearer(adminToken)).send({ textScale: { si: 50 } }).expect(400);
    await api().patch('/settings/branding').set(bearer(adminToken)).send({ textScale: { fr: 90 } }).expect(400);
    await api().patch('/settings/branding').set(bearer(adminToken)).send({ textScale: { si: 90 } }).expect(200);
  });

  it('publishes the office phone number for "Call the office"', async () => {
    await api().patch('/settings/branding').set(bearer(adminToken)).send({ officePhone: '011 234 5678' }).expect(200);
    expect((await api().get('/branding').expect(200)).body.officePhone).toBe('011 234 5678');
    await api().patch('/settings/branding').set(bearer(adminToken)).send({ officePhone: 'call us' }).expect(400);
    await api().patch('/settings/branding').set(bearer(adminToken)).send({ officePhone: '' }).expect(200);
    expect((await api().get('/branding').expect(200)).body.officePhone).toBeNull();
  });
});
