import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID as uuid } from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import type { NotificationSettings } from '@care-platform/shared';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/database.module';
import { auditLogs, caregivers, notifications, patients, users } from '../src/database/schema';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ReminderSweepService, type Candidate } from '../src/notifications/reminder-sweep.service';
import { ReviewsNotifier } from '../src/reviews/reviews-notifier.service';
import { PushService } from '../src/push/push.service';
import { EmailService } from '../src/email/email.service';
import { SEED_PASSWORD } from './seed-password';

/**
 * Communication preferences over real HTTP: the person's own settings, the
 * staff card on the details pages, who may see what, the checks on each
 * choice, the audit trail, and that push and reminder messages honour them.
 */

const unlimitedThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }),
};

describe('Communication preferences (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let jwt: JwtService;
  let accessSecret: string;
  let staffToken: string;
  let verifierToken: string;
  let intake: Record<string, unknown>;
  let districtId: number;

  const api = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const run = Math.floor(Date.now() / 1000) % 10_000;
  let n = 0;
  const newPhone = () => `076${String(run * 1000 + ++n).padStart(7, '0')}`;

  async function newCaregiver() {
    const phone = newPhone();
    const reg = await api()
      .post('/auth/register-caregiver/unified')
      .send({
        phone, consentAccepted: true, fullName: `Prefs Caregiver ${phone}`, permanentAddress: '1 Lake Road, Kandy',
        dateOfBirth: '1988-01-20', gender: 'FEMALE', civilStatus: 'MARRIED', emergencyContactName: 'EC', emergencyContactNumber: '0770001111',
        emergencyContactRelationship: 'Husband',
      })
      .expect(201);
    const [row] = await db.select().from(caregivers).where(eq(caregivers.registrationNumber, reg.body.registrationNumber));
    await db.execute(sql`UPDATE caregivers SET status = 'ACTIVE', district_id = ${districtId} WHERE id = ${row.id}`);
    const token = jwt.sign({ sub: row.userId, role: 'CAREGIVER', caregiverId: row.id }, { secret: accessSecret, expiresIn: '10m' });
    return { id: row.id, userId: row.userId!, token };
  }

  async function newClient() {
    const reg = await api()
      .post('/auth/register-patient')
      .send({ email: `prefs-client-${run}-${++n}@example.com`, password: 'SelfRegPass123', fullName: `Prefs Client Abson`, phone: newPhone(), consentAccepted: true, ...intake })
      .expect(201);
    const [row] = await db.select().from(patients).where(eq(patients.id, reg.body.patientId));
    const token = jwt.sign({ sub: row.userId, role: 'PATIENT_GUARDIAN', patientId: row.id }, { secret: accessSecret, expiresIn: '10m' });
    return { patientId: row.id, userId: row.userId!, token };
  }

  const settings: NotificationSettings = { remindersEnabled: true, quietStartHour: 21, quietEndHour: 7, dailyReminderCap: 5, retentionDays: 180 } as NotificationSettings;
  const line = (kind: 'INVOICE_DUE' | 'DOCUMENT_REJECTED', userId: string): Candidate => ({
    userId,
    stage: 'TEST',
    line: { kind, todo: { key: `${kind.toLowerCase()}:${uuid()}`, kind: kind === 'INVOICE_DUE' ? 'PAY_INVOICE' : 'DOCUMENT_REJECTED', path: '/notifications', vars: { number: 'INV-1', amount: 'LKR 1,000', date: 'tomorrow', document: 'Police clearance' } } as never },
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage).useValue(unlimitedThrottle).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get<Database>(DRIZZLE);
    jwt = app.get(JwtService);
    accessSecret = app.get(ConfigService).get<string>('JWT_ACCESS_SECRET')!;
    const login = (email: string) => api().post('/auth/login').send({ email, password: SEED_PASSWORD });
    staffToken = (await login('staff@care-platform.local')).body.accessToken;
    verifierToken = (await login('verifier@care-platform.local')).body.accessToken;
    const tree = (await api().get('/public/meta/locations/tree?locale=en').expect(200)).body as { districts: { id: number }[] }[];
    districtId = tree.flatMap((p) => p.districts)[0].id;
    const cityId = (await api().get(`/public/meta/locations/cities?districtId=${districtId}&locale=en`).expect(200)).body[0].id;
    intake = {
      registrantType: 'GUARDIAN', recipientName: 'Sunil Fernando', recipientRelationship: 'PARENT', recipientAge: 78, recipientGender: 'MALE',
      preferredContactMethod: 'WHATSAPP', districtId, cityId, careNeeds: 'Needs help with bathing, meals and medication reminders.',
      careSchedule: 'DAY', careStart: 'WITHIN_WEEK',
    };
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => jest.restoreAllMocks());

  it('lets a client read and change their own preferences, and audits each change', async () => {
    const client = await newClient();
    const got = await api().get('/me/communication-preferences').set(bearer(client.token)).expect(200);
    expect(got.body).toMatchObject({ preferredContactMethod: 'WHATSAPP', pushEnabled: true, reminderMessagesEnabled: true, hasAccount: true, hasEmail: true, hasPhone: true, appDevices: 0 });

    const saved = await api()
      .patch('/me/communication-preferences')
      .set(bearer(client.token))
      .send({ preferredContactMethod: 'EMAIL', preferredContactTime: 'MORNING', pushEnabled: false, reminderMessagesEnabled: false })
      .expect(200);
    expect(saved.body).toMatchObject({ preferredContactMethod: 'EMAIL', preferredContactTime: 'MORNING', pushEnabled: false, reminderMessagesEnabled: false });

    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, client.patientId), eq(auditLogs.action, 'UPDATE_OWN_COMMUNICATION_PREFERENCES'))).orderBy(desc(auditLogs.createdAt)).limit(1);
    expect(audit.userId).toBe(client.userId);
    expect((audit.metadata as { changes: Record<string, unknown> }).changes).toMatchObject({
      preferredContactMethod: { from: 'WHATSAPP', to: 'EMAIL' },
      pushEnabled: { from: true, to: false },
      reminderMessagesEnabled: { from: true, to: false },
    });

    // Saving the same thing again changes and audits nothing.
    const before = (await db.select().from(auditLogs).where(eq(auditLogs.entityId, client.patientId))).length;
    await api().patch('/me/communication-preferences').set(bearer(client.token)).send({ pushEnabled: false }).expect(200);
    expect((await db.select().from(auditLogs).where(eq(auditLogs.entityId, client.patientId))).length).toBe(before);

    await api().patch('/me/communication-preferences').set(bearer(client.token)).send({ preferredContactMethod: 'SMS' }).expect(400);
  });

  it('gives staff the card on both details pages, and keeps it from everyone else', async () => {
    const client = await newClient();
    const caregiver = await newCaregiver();

    await api().get(`/patients/${client.patientId}/communication-preferences`).set(bearer(staffToken)).expect(200);
    const cg = await api().get(`/caregivers/${caregiver.id}/communication-preferences`).set(bearer(staffToken)).expect(200);
    expect(cg.body).toMatchObject({ preferredContactTime: null, hasAccount: true, hasEmail: false, hasPhone: true });

    const changed = await api().patch(`/patients/${client.patientId}/communication-preferences`).set(bearer(staffToken)).send({ reminderMessagesEnabled: false }).expect(200);
    expect(changed.body.reminderMessagesEnabled).toBe(false);
    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, client.patientId), eq(auditLogs.action, 'UPDATE_COMMUNICATION_PREFERENCES'))).limit(1);
    expect(audit).toBeDefined();

    // Not for clients, caregivers or verifiers; not someone else's.
    await api().get(`/patients/${client.patientId}/communication-preferences`).set(bearer(client.token)).expect(403);
    await api().get(`/caregivers/${caregiver.id}/communication-preferences`).set(bearer(caregiver.token)).expect(403);
    await api().get(`/caregivers/${caregiver.id}/communication-preferences`).set(bearer(verifierToken)).expect(403);
    await api().get('/me/communication-preferences').set(bearer(staffToken)).expect(403);
    await api().get(`/patients/${uuid()}/communication-preferences`).set(bearer(staffToken)).expect(404);
  });

  it('refuses a channel the person cannot be reached on, and turns auto notify off for phone calls', async () => {
    const caregiver = await newCaregiver();
    // Registered by WhatsApp: no email address.
    const refused = await api().patch(`/caregivers/${caregiver.id}/communication-preferences`).set(bearer(staffToken)).send({ preferredContactMethod: 'EMAIL' }).expect(400);
    expect(refused.body.message).toMatch(/email address/i);
    await api().patch(`/caregivers/${caregiver.id}/communication-preferences`).set(bearer(staffToken)).send({ preferredContactTime: 'MORNING' }).expect(400);

    await db.update(caregivers).set({ preferredContactMethod: 'WHATSAPP', autoNotifyRequests: true }).where(eq(caregivers.id, caregiver.id));
    await api().patch('/me/communication-preferences').set(bearer(caregiver.token)).send({ preferredContactMethod: 'PHONE_CALL' }).expect(200);
    const [row] = await db.select({ m: caregivers.preferredContactMethod, auto: caregivers.autoNotifyRequests }).from(caregivers).where(eq(caregivers.id, caregiver.id));
    expect(row).toEqual({ m: 'PHONE_CALL', auto: false });
  });

  it('keeps the bell but skips the push for someone who turned push off', async () => {
    const on = await newClient();
    const off = await newClient();
    await api().patch('/me/communication-preferences').set(bearer(off.token)).send({ pushEnabled: false }).expect(200);
    const push = jest.spyOn(app.get(PushService), 'notify').mockImplementation(() => undefined);

    await app.get(NotificationsService).deliver([on.userId, off.userId], () => ({ title: 'Booking confirmed', body: 'BK-1' }), '/bookings', 'prefs push test');
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toEqual([on.userId]);
    // Both still have it in the bell.
    for (const u of [on, off]) expect((await db.select().from(notifications).where(eq(notifications.userId, u.userId))).length).toBe(1);

    push.mockClear();
    await app.get(NotificationsService).deliver([off.userId], () => ({ title: 'x', body: 'y' }), '/bookings', 'prefs push test 2');
    expect(push).not.toHaveBeenCalled();
  });

  it('sends the rating reminder to the bell only when reminder messages are off, but always the first ask', async () => {
    const client = await newClient();
    await api().patch('/me/communication-preferences').set(bearer(client.token)).send({ preferredContactMethod: 'EMAIL', reminderMessagesEnabled: false }).expect(200);
    const email = jest.spyOn(app.get(EmailService), 'sendNotificationEmail').mockResolvedValue(undefined as never);
    const bookingId = uuid();
    const args = { patientId: client.patientId, bookingId, reference: 'CP-1', language: 'en' as const, caregiverPublicId: 'CG-TEST' };
    const notifier = app.get(ReviewsNotifier);

    expect(await notifier.askClient('REMINDER', args)).toBe(true);
    expect(email).not.toHaveBeenCalled();
    expect(await notifier.askClient('ASK', args)).toBe(true);
    expect(email).toHaveBeenCalledTimes(1);
  });

  it('still sends payment reminders by WhatsApp/email, and holds back the optional ones', async () => {
    const caregiver = await newCaregiver();
    await db.update(users).set({ reminderMessagesEnabled: false }).where(eq(users.id, caregiver.userId));
    const sweep = app.get(ReminderSweepService);
    const usual = jest.spyOn(sweep as unknown as { usualChannel: () => Promise<void> }, 'usualChannel').mockResolvedValue(undefined);
    const noon = new Date(new Date().toISOString().slice(0, 10) + 'T06:30:00Z');

    expect(await sweep.remind(caregiver.userId, [line('DOCUMENT_REJECTED', caregiver.userId)], settings, noon)).toBe(true);
    expect(usual).not.toHaveBeenCalled();

    expect(await sweep.remind(caregiver.userId, [line('INVOICE_DUE', caregiver.userId)], settings, noon)).toBe(true);
    expect(usual).toHaveBeenCalledTimes(1);

    // Switched back on, the optional one goes again.
    await db.update(users).set({ reminderMessagesEnabled: true }).where(eq(users.id, caregiver.userId));
    expect(await sweep.remind(caregiver.userId, [line('DOCUMENT_REJECTED', caregiver.userId)], settings, noon)).toBe(true);
    expect(usual).toHaveBeenCalledTimes(2);
  });
});
