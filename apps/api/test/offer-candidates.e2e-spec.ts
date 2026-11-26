import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID as uuid } from 'crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { colomboToday, type OfferCandidatePage } from '@care-platform/shared';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/database.module';
import { availability, caregivers } from '../src/database/schema';
import { EmailService } from '../src/email/email.service';
import { SEED_PASSWORD } from './seed-password';

/**
 * Finding caregivers to offer a request to, over real HTTP: the request's
 * own facts prefill the search, the caregiver list's filters and the
 * request-only ones narrow it, the matching agent's score orders it, and
 * caregivers already offered are kept out unless asked for.
 */

const unlimitedThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }),
};

describe('Offer candidates (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let staffToken: string;
  let intake: Record<string, unknown>;
  let districtId: number;
  let otherDistrictId: number;
  const api = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const run = (Math.floor(Date.now() / 1000) + 3300) % 10_000;
  // Every caregiver made here has this in their name, so a search keeps out everyone else in the database.
  const tag = `Finder${run}`;
  let n = 0;
  const newPhone = (prefix = '072') => `${prefix}${String(run * 1000 + ++n).padStart(7, '0')}`;
  const sign = (payload: object) => app.get(JwtService).sign(payload, { secret: app.get(ConfigService).get<string>('JWT_ACCESS_SECRET')!, expiresIn: '10m' });

  async function newCaregiver(name: string, opts: { gender?: 'MALE' | 'FEMALE'; district?: number; day?: boolean; night?: boolean; nursingHome?: boolean; availableFrom?: string } = {}) {
    const phone = newPhone();
    const reg = await api()
      .post('/auth/register-caregiver/unified')
      .send({
        phone, consentAccepted: true, fullName: `${tag} ${name}`, permanentAddress: '1 Lake Road, Kandy',
        dateOfBirth: '1988-01-20', gender: opts.gender ?? 'FEMALE', civilStatus: 'MARRIED', emergencyContactName: 'EC', emergencyContactNumber: '0770001111',
        emergencyContactRelationship: 'Husband',
      })
      .expect(201);
    const [row] = await db.select().from(caregivers).where(eq(caregivers.registrationNumber, reg.body.registrationNumber));
    await db.update(caregivers).set({ status: 'ACTIVE', districtId: opts.district ?? otherDistrictId }).where(eq(caregivers.id, row.id));
    await db.delete(availability).where(eq(availability.caregiverId, row.id));
    await db.insert(availability).values({
      id: uuid(), caregiverId: row.id, dayDuty: opts.day ?? false, nightDuty: opts.night ?? false, liveIn24h: false,
      careNursingHome: opts.nursingHome ?? true, availableFrom: (opts.availableFrom ?? null) as never,
    });
    return { id: row.id, name: `${tag} ${name}`, token: sign({ sub: row.userId, role: 'CAREGIVER', caregiverId: row.id }) };
  }

  async function newRequest() {
    const reg = await api()
      .post('/auth/register-patient')
      .send({ email: `finder-client-${run}-${++n}@example.com`, password: 'SelfRegPass123', fullName: 'Nimal Kumara Perera', phone: newPhone('077'), consentAccepted: true, ...intake });
    if (reg.status !== 201) throw new Error(`register-patient: ${JSON.stringify(reg.body)}`);
    const res = await api().post('/care-requests').set(bearer(staffToken)).send({ language: 'en', patientId: reg.body.patientId, careType: 'NURSING_HOME', message: 'Mother needs help' }).expect(201);
    return res.body.id as string;
  }

  const find = async (requestId: string, query: Record<string, string | number | boolean> = {}) =>
    (await api().get(`/care-requests/${requestId}/offer-candidates`).query({ search: tag, ...query }).set(bearer(staffToken)).expect(200)).body as OfferCandidatePage;
  const names = (p: OfferCandidatePage) => p.items.map((i) => i.fullName.replace(`${tag} `, ''));

  let requestId: string;
  let near: Awaited<ReturnType<typeof newCaregiver>>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage).useValue(unlimitedThrottle).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get<Database>(DRIZZLE);
    jest.spyOn(app.get(EmailService), 'sendNotificationEmail').mockResolvedValue(undefined as never);
    staffToken = (await api().post('/auth/login').send({ email: 'staff@care-platform.local', password: SEED_PASSWORD })).body.accessToken;
    const tree = (await api().get('/public/meta/locations/tree?locale=en').expect(200)).body as { districts: { id: number }[] }[];
    const all = tree.flatMap((p) => p.districts);
    districtId = all[0].id;
    otherDistrictId = all[1].id;
    const cityId = (await api().get(`/public/meta/locations/cities?districtId=${districtId}&locale=en`).expect(200)).body[0].id;
    intake = {
      registrantType: 'GUARDIAN', recipientName: 'Sunil Fernando', recipientRelationship: 'PARENT', recipientAge: 78, recipientGender: 'MALE',
      preferredContactMethod: 'PHONE_CALL', districtId, cityId, careNeeds: 'Needs help with bathing, meals and medication reminders.',
      careSchedule: 'DAY', careStart: 'WITHIN_WEEK',
    };

    near = await newCaregiver('Anula Near', { district: districtId, day: true });
    await newCaregiver('Bimal Far', { gender: 'MALE', night: true });
    await newCaregiver('Chandra NoNursing', { district: districtId, day: true, nursingHome: false });
    await newCaregiver('Dilini Later', { district: districtId, day: true, availableFrom: '2099-01-01' });
    requestId = await newRequest();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("prefills from the request, keeps out those who don't do the care, and puts the best match first", async () => {
    const page = await find(requestId);
    expect(page.request).toMatchObject({ careType: 'NURSING_HOME', districtId, schedule: 'DAY', startDate: colomboToday(), genderPreference: null, waitingOffers: 0, slotsLeft: 10 });
    expect(page.request.districtName).toBeTruthy();
    expect(names(page)).not.toContain('Chandra NoNursing');
    expect(names(page)[0]).toBe('Anula Near');
    const best = page.items[0];
    expect(best.reasons).toEqual(expect.arrayContaining(['Checked by the office', 'Lives in the same district', 'Works day shifts']));
    expect(page.items.find((i) => i.fullName.endsWith('Dilini Later'))?.reasons).toContain('Free only from 2099-01-01');
    expect(best.score).toBeGreaterThan(page.items.find((i) => i.fullName.endsWith('Bimal Far'))!.score);
    expect(best).toMatchObject({ sameDistrict: true, dayDuty: true, doesCareType: true, hasAccount: true, offer: null });
    expect(best.phone).not.toMatch(/^07\d{8}$/); // masked

    // Switched off, everyone shows, and the card says who doesn't do this kind of care.
    const everyone = await find(requestId, { doesCareType: false });
    expect(everyone.items.find((i) => i.fullName.endsWith('Chandra NoNursing'))?.doesCareType).toBe(false);
  });

  it('filters by the caregiver list filters and the request-only ones', async () => {
    expect(names(await find(requestId, { gender: 'MALE' }))).toEqual(['Bimal Far']);
    expect(names(await find(requestId, { nightDuty: true }))).toEqual(['Bimal Far']);
    expect(names(await find(requestId, { districtIds: String(districtId), sort: 'NAME' }))).toEqual(['Anula Near', 'Dilini Later']);
    expect(names(await find(requestId, { freeByStart: true }))).not.toContain('Dilini Later');
    expect(names(await find(requestId, { noClash: true })).length).toBe(3);
    // Nobody here is rated yet.
    expect((await find(requestId, { minRating: 4 })).items).toEqual([]);
    expect(names(await find(requestId, { sort: 'NAME' }))).toEqual(['Anula Near', 'Bimal Far', 'Dilini Later']);
  });

  it('shows only listed caregivers unless other statuses are asked for', async () => {
    const hidden = await newCaregiver('Esha Suspended', { district: districtId, day: true });
    await db.update(caregivers).set({ status: 'SUSPENDED' }).where(eq(caregivers.id, hidden.id));
    expect(names(await find(requestId))).not.toContain('Esha Suspended');
    expect(names(await find(requestId, { statuses: 'SUSPENDED' }))).toEqual(['Esha Suspended']);
  });

  it('keeps caregivers already offered out, unless asked, and counts the offers left', async () => {
    const id = await newRequest();
    await api().post(`/care-requests/${id}/offers`).set(bearer(staffToken)).send({ caregiverId: near.id, expiresInMinutes: 60 }).expect(201);
    const page = await find(id);
    expect(names(page)).not.toContain('Anula Near');
    expect(page.request).toMatchObject({ waitingOffers: 1, slotsLeft: 9 });
    const withOffered = await find(id, { includeOffered: true });
    expect(withOffered.items.find((i) => i.id === near.id)?.offer).toEqual({ status: 'OFFERED' });
  });

  it('pages the results', async () => {
    const first = await find(requestId, { pageSize: 2, sort: 'NAME' });
    const second = await find(requestId, { pageSize: 2, page: 2, sort: 'NAME' });
    expect(first.total).toBe(3);
    expect(names(first)).toEqual(['Anula Near', 'Bimal Far']);
    expect(names(second)).toEqual(['Dilini Later']);
  });

  it('is for staff only, and checks what it is given', async () => {
    await api().get(`/care-requests/${requestId}/offer-candidates`).set(bearer(near.token)).expect(403);
    await api().get(`/care-requests/${uuid()}/offer-candidates`).set(bearer(staffToken)).expect(404);
    await api().get(`/care-requests/${requestId}/offer-candidates`).query({ minRating: 9 }).set(bearer(staffToken)).expect(400);
    await api().get(`/care-requests/${requestId}/offer-candidates`).query({ sort: 'RANDOM' }).set(bearer(staffToken)).expect(400);
    await api().get(`/care-requests/${requestId}/offer-candidates`).query({ statuses: 'NOPE' }).set(bearer(staffToken)).expect(400);
  });
});
