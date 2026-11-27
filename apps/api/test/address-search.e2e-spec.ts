import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { and, eq, isNotNull } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../src/database/database.module';
import { caregivers, patients, users } from '../src/database/schema';
import type { AddressSearchResult } from '@care-platform/shared';
import { AppModule } from '../src/app.module';
import { SEED_PASSWORD } from './seed-password';

/** "Find an address" above the pin maps, over real HTTP, with the map search outside stubbed. */
const unlimitedThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }),
};

describe('Address search (e2e)', () => {
  let app: INestApplication;
  let staffToken: string;
  const api = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const sign = (payload: object) => app.get(JwtService).sign(payload, { secret: app.get(ConfigService).get<string>('JWT_ACCESS_SECRET')!, expiresIn: '10m' });
  const realFetch = global.fetch;
  let town: { name: string; district: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue(unlimitedThrottle)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    staffToken = (await api().post('/auth/login').send({ email: 'staff@care-platform.local', password: SEED_PASSWORD })).body.accessToken;
    const tree = (await api().get('/public/meta/locations/tree?locale=en').expect(200)).body as { districts: { id: number; name: string }[] }[];
    const district = tree.flatMap((p) => p.districts)[0];
    const cities = (await api().get(`/public/meta/locations/cities?districtId=${district.id}&locale=en`).expect(200)).body as { name: string }[];
    town = { name: cities[0].name, district: district.name };
  });

  afterEach(() => (global.fetch = realFetch));
  afterAll(async () => {
    await app?.close();
  });

  it('finds a town from the reference data, with its district, even when the map search is down', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as never;
    const res = await api()
      .get('/geo/address-search')
      .query({ q: `12 Main Street, ${town.name}`, locale: 'en' })
      .set(bearer(staffToken))
      .expect(200);
    const body = res.body as AddressSearchResult;
    expect(body.mapSearchUnavailable).toBe(true);
    expect(body.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: town.name, detail: town.district, precision: 'TOWN', source: 'TOWNS' })]),
    );
  });

  it('returns map matches first when the map search answers', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          lat: '6.9',
          lon: '79.86',
          name: 'Lady Ridgeway Hospital',
          display_name: 'Lady Ridgeway Hospital, Dr Danister De Silva Mawatha, Colombo 8, Sri Lanka',
          addresstype: 'hospital',
          class: 'amenity',
        },
      ],
    })) as never;
    const body = (await api().get('/geo/address-search').query({ q: 'Lady Ridgeway Hospital' }).set(bearer(staffToken)).expect(200))
      .body as AddressSearchResult;
    expect(body.results[0]).toMatchObject({ label: 'Lady Ridgeway Hospital', precision: 'ADDRESS', source: 'MAP', latitude: 6.9, longitude: 79.86 });
  });

  it('is for signed-in clients, caregivers and staff, and checks what is typed', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => [] })) as never;
    await api().get('/geo/address-search').query({ q: town.name }).expect(401);
    const db = app.get<Database>(DRIZZLE);
    const [client] = await db
      .select({ userId: patients.userId, patientId: patients.id })
      .from(patients)
      .innerJoin(users, eq(users.id, patients.userId))
      .where(eq(users.isActive, true))
      .limit(1);
    const [cg] = await db
      .select({ userId: caregivers.userId, caregiverId: caregivers.id })
      .from(caregivers)
      .innerJoin(users, eq(users.id, caregivers.userId))
      .where(and(isNotNull(caregivers.userId), eq(users.isActive, true)))
      .limit(1);
    await api()
      .get('/geo/address-search')
      .query({ q: town.name })
      .set(bearer(sign({ sub: client.userId, role: 'PATIENT_GUARDIAN', patientId: client.patientId })))
      .expect(200);
    await api()
      .get('/geo/address-search')
      .query({ q: town.name })
      .set(bearer(sign({ sub: cg.userId, role: 'CAREGIVER', caregiverId: cg.caregiverId })))
      .expect(200);
    await api().get('/geo/address-search').query({ q: 'ab' }).set(bearer(staffToken)).expect(400);
    await api()
      .get('/geo/address-search')
      .query({ q: 'x'.repeat(201) })
      .set(bearer(staffToken))
      .expect(400);
    await api().get('/geo/address-search').query({ q: town.name, locale: 'fr' }).set(bearer(staffToken)).expect(400);
  });
});
