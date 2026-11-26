import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerStorage } from '@nestjs/throttler';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { addDays, colomboToday, isoWeekday, type BookingCareLocation, type CareLocation, type CareLocationSuggestion, type CaregiverShift, type ClientBooking, type CheckInResult, type ClientLive, type StaffLiveShare, type StaffPresenceDetail, type StartedShare, type StaffCheckIn, type TodayVisits } from '@care-platform/shared';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/database.module';
import { agentDecisions, bookingShifts, caregivers, locationNotices, locationPoints, locationShares, patients, shiftCheckins } from '../src/database/schema';
import { PresenceAgentService } from '../src/bookings/presence-agent.service';
import { LocationSharesService } from '../src/bookings/location-shares.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { SEED_PASSWORD } from './seed-password';

/**
 * Shift check-in over real HTTP and MySQL: off until an admin switches it on;
 * the client reads the caregiver a four-digit code at the door; the caregiver
 * never sees that code anywhere; five wrong tries lock it; staff can always
 * record the visit by hand; and none of it changes the shift.
 *
 * Imported by automation.e2e-spec.ts: the live-care agent's cases move the
 * same check-in switch, and separate files would run at the same time.
 */

const unlimitedThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }),
};

describe('Shift check-in (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let jwt: JwtService;
  let accessSecret: string;
  let staffToken: string;
  let adminToken: string;
  let intake: Record<string, unknown>;

  const api = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const run = (Math.floor(Date.now() / 1000) + 7300) % 10_000;
  let n = 0;
  const newPhone = (prefix = '071') => `${prefix}${String(run * 1000 + ++n).padStart(7, '0')}`;
  const minutes = (m: number) => new Date(Date.now() + m * 60_000);
  /** A Monday a good while off, a different one each time, so bookings never collide. */
  let weekOffset = 0;
  const freshMonday = () => {
    let d = addDays(colomboToday(), 14 + 21 * weekOffset++);
    while (isoWeekday(d) !== 1) d = addDays(d, 1);
    return d;
  };

  async function newCaregiver() {
    const phone = newPhone();
    const reg = await api()
      .post('/auth/register-caregiver/unified')
      .send({
        phone, consentAccepted: true, fullName: `Visiting Caregiver ${phone}`, permanentAddress: '1 Lake Road, Kandy', dateOfBirth: '1988-01-20', gender: 'FEMALE',
        civilStatus: 'MARRIED', emergencyContactName: 'EC', emergencyContactNumber: '0770001111', emergencyContactRelationship: 'Husband',
      })
      .expect(201);
    const [row] = await db.select().from(caregivers).where(eq(caregivers.registrationNumber, reg.body.registrationNumber));
    await db.update(caregivers).set({ status: 'ACTIVE' }).where(eq(caregivers.id, row.id));
    return { id: row.id, token: jwt.sign({ sub: row.userId, role: 'CAREGIVER', caregiverId: row.id }, { secret: accessSecret, expiresIn: '10m' }) };
  }

  /**
   * A confirmed booking of two day shifts with its own client and caregiver.
   * The first shift is then moved to start `startsIn` minutes from now (four
   * hours long), the second to the same time a day later.
   */
  async function visit(startsIn: number) {
    const cg = await newCaregiver();
    const reg = await api()
      .post('/auth/register-patient')
      .send({ email: `visit-client-${run}-${++n}@example.com`, password: 'SelfRegPass123', fullName: 'Nimal Perera', phone: newPhone('077'), consentAccepted: true, ...intake })
      .expect(201);
    const [patient] = await db.select().from(patients).where(eq(patients.id, reg.body.patientId));
    const clientToken = jwt.sign({ sub: patient.userId, role: 'PATIENT_GUARDIAN', patientId: patient.id }, { secret: accessSecret, expiresIn: '10m' });
    const monday = freshMonday();
    const draft = await api()
      .post('/bookings')
      .set(bearer(staffToken))
      .send({ patientId: patient.id, caregiverId: cg.id, scheduleType: 'DAY', daysOfWeek: [1, 2], shiftStartTime: '08:00', shiftEndTime: '17:00', startDate: monday, endDate: addDays(monday, 1), rateType: 'DAILY', rateAmount: '3500' })
      .expect(201);
    const booking = (await api().post(`/bookings/${draft.body.id}/confirm`).set(bearer(staffToken)).expect(200)).body;
    const [first, second] = booking.shifts as { id: string }[];
    await db.update(bookingShifts).set({ startsAt: minutes(startsIn), endsAt: minutes(startsIn + 240) }).where(eq(bookingShifts.id, first.id));
    await db.update(bookingShifts).set({ startsAt: minutes(startsIn + 1440), endsAt: minutes(startsIn + 1680) }).where(eq(bookingShifts.id, second.id));
    return { bookingId: booking.id as string, reference: booking.reference as string, shiftId: first.id, nextShiftId: second.id, cg, clientToken, patientUserId: patient.userId };
  }

  const setting = (body: object, token = adminToken) => api().patch('/settings/check-in').set(bearer(token)).send(body);
  const myShift = async (token: string, shiftId: string) => ((await api().get('/me/shifts').set(bearer(token)).expect(200)).body as CaregiverShift[]).find((s) => s.id === shiftId)!;
  const clientShift = async (token: string, shiftId: string) =>
    ((await api().get('/me/bookings').set(bearer(token)).expect(200)).body as ClientBooking[]).flatMap((b) => b.shifts).find((s) => s.id === shiftId)!;
  const staffShift = async (bookingId: string, shiftId: string) =>
    ((await api().get(`/bookings/${bookingId}`).set(bearer(staffToken)).expect(200)).body.shifts as { id: string; status: string; checkIn: StaffCheckIn | null }[]).find((s) => s.id === shiftId)!;
  const checkIn = (token: string, shiftId: string, body: object) => api().post(`/me/shifts/${shiftId}/check-in`).set(bearer(token)).send(body);
  const checkOut = (token: string, shiftId: string, body: object = {}) => api().post(`/me/shifts/${shiftId}/check-out`).set(bearer(token)).send(body);
  const wrong = (code: string) => String((Number(code) + 1) % 10_000).padStart(4, '0');

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
    adminToken = (await login('admin@care-platform.local')).body.accessToken;
    const tree = (await api().get('/public/meta/locations/tree?locale=en').expect(200)).body as { districts: { id: number }[] }[];
    const districtId = tree.flatMap((p) => p.districts)[0].id;
    const cityId = (await api().get(`/public/meta/locations/cities?districtId=${districtId}&locale=en`).expect(200)).body[0].id;
    intake = {
      registrantType: 'GUARDIAN', recipientName: 'Sunil Fernando', recipientRelationship: 'PARENT', recipientAge: 78, recipientGender: 'MALE',
      preferredContactMethod: 'PHONE_CALL', districtId, cityId, careNeeds: 'Needs help with bathing, meals and medication reminders.',
      careSchedule: 'DAY', careStart: 'WITHIN_WEEK',
    };
    await setting({ enabled: false, earlyMinutes: 60, lateAfterMinutes: 15, farMetres: 300 }).expect(200);
  });

  afterAll(async () => {
    await setting({ enabled: false, earlyMinutes: 60, lateAfterMinutes: 15, farMetres: 300 });
    await app.close();
  });

  it('is off until an admin switches it on: no code, no button, and both routes refuse', async () => {
    const v = await visit(10);
    expect((await myShift(v.cg.token, v.shiftId)).checkIn).toBeNull();
    expect((await clientShift(v.clientToken, v.shiftId)).visit).toBeNull();
    expect((await staffShift(v.bookingId, v.shiftId)).checkIn).toBeNull();
    expect((await checkIn(v.cg.token, v.shiftId, { code: '1234' }).expect(400)).body.message).toBe('Check-in is not switched on');
    await checkOut(v.cg.token, v.shiftId).expect(400);
    await api().post(`/visits/${v.shiftId}/check-in`).set(bearer(staffToken)).send({}).expect(400);
    // Today's visits still lists the day for staff, with nothing recorded.
    const today = (await api().get('/visits/today').set(bearer(staffToken)).expect(200)).body as TodayVisits;
    expect(today.settings.enabled).toBe(false);

    // Only an admin changes the setting, within limits.
    await setting({ enabled: true }, staffToken).expect(403);
    await setting({ earlyMinutes: 500 }).expect(400);
    await setting({ lateAfterMinutes: 1 }).expect(400);
    expect((await setting({ enabled: true }).expect(200)).body).toMatchObject({ enabled: true, earlyMinutes: 60, lateAfterMinutes: 15 });
  });

  it('checks a caregiver in with the code the client reads out, and out again, without touching the shift', async () => {
    await setting({ enabled: true }).expect(200);
    const v = await visit(30);
    const notify = jest.spyOn(app.get(NotificationsService), 'notify');

    // The client has the code; staff see the same one; the caregiver sees only that check-in is open.
    const code = (await clientShift(v.clientToken, v.shiftId)).visit!.arrivalCode!;
    expect(code).toMatch(/^\d{4}$/);
    expect((await staffShift(v.bookingId, v.shiftId)).checkIn).toMatchObject({ state: 'DUE', arrivalCode: code, wrongCodes: 0, checkedInAt: null });
    const mine = await myShift(v.cg.token, v.shiftId);
    expect(mine.checkIn).toMatchObject({ state: 'DUE', checkedInAt: null, checkedOutAt: null, codeLocked: false });
    expect(JSON.stringify((await api().get('/me/shifts').set(bearer(v.cg.token)).expect(200)).body)).not.toContain(code);
    // Tomorrow's shift: a different code, not shown to the client yet, and too early to check in.
    expect((await clientShift(v.clientToken, v.nextShiftId)).visit).toEqual({ arrivalCode: null, checkedInAt: null, checkedOutAt: null, onTheWay: false });
    expect((await staffShift(v.bookingId, v.nextShiftId)).checkIn!.arrivalCode).not.toBe(code);
    expect((await myShift(v.cg.token, v.nextShiftId)).checkIn!.state).toBe('UPCOMING');
    expect((await checkIn(v.cg.token, v.nextShiftId, { code }).expect(400)).body.message).toBe('It is too early to check in for this shift');

    // No code, a short one, somebody else's shift, a wrong one.
    await checkIn(v.cg.token, v.shiftId, {}).expect(400);
    expect((await checkIn(v.cg.token, v.shiftId, { code: '12' }).expect(400)).body.message).toEqual(['Enter the 4-digit code the client gives you']);
    const stranger = await newCaregiver();
    await checkIn(stranger.token, v.shiftId, { code }).expect(404);
    await checkOut(v.cg.token, v.shiftId).expect(400);
    expect((await checkIn(v.cg.token, v.shiftId, { code: wrong(code) }).expect(400)).body.message).toBe('That code is not right - ask the client to read it to you again');
    expect((await staffShift(v.bookingId, v.shiftId)).checkIn).toMatchObject({ wrongCodes: 1, checkedInAt: null });
    expect(notify).not.toHaveBeenCalledWith([v.patientUserId], expect.anything(), '/bookings', expect.stringContaining('arrived'));

    // The right one, typed with a space, with where the phone is.
    await checkIn(v.cg.token, v.shiftId, { code: `${code.slice(0, 2)} ${code.slice(2)}`, latitude: 6.9271, longitude: 79.8612, accuracyM: 12.4 }).expect(200);
    const seen = (await staffShift(v.bookingId, v.shiftId));
    expect(seen.status).toBe('SCHEDULED');
    expect(seen.checkIn).toMatchObject({ state: 'IN', inBy: 'CAREGIVER', inLocation: { latitude: 6.9271, longitude: 79.8612, accuracyM: 12 }, inDistanceM: null, checkedOutAt: null });
    expect(seen.checkIn!.inByName).toMatch(/Visiting Caregiver/);
    // The client is told, and their code is gone: it has done its job.
    expect(notify).toHaveBeenCalledWith([v.patientUserId], expect.any(Function), '/bookings', `arrived ${v.shiftId}`);
    const text = (notify.mock.calls.find((c) => c[3] === `arrived ${v.shiftId}`)![1] as (l: 'en') => { title: string; body: string })('en');
    expect(text.title).toBe('Your caregiver has arrived');
    expect(text.body).toMatch(/^They checked in at \d{2}:\d{2}\.$/);
    const visitNow = (await clientShift(v.clientToken, v.shiftId)).visit!;
    expect(visitNow.arrivalCode).toBeNull();
    expect(visitNow.checkedInAt).toBe(seen.checkIn!.checkedInAt);
    // A second tap changes nothing and tells nobody twice.
    await checkIn(v.cg.token, v.shiftId, { code }).expect(200);
    expect((await staffShift(v.bookingId, v.shiftId)).checkIn!.checkedInAt).toBe(seen.checkIn!.checkedInAt);
    expect(notify.mock.calls.filter((c) => c[3] === `arrived ${v.shiftId}`)).toHaveLength(1);
    notify.mockRestore();

    // Out again.
    expect((await myShift(v.cg.token, v.shiftId)).checkIn).toMatchObject({ state: 'IN' });
    await checkOut(v.cg.token, v.shiftId, { latitude: 6.9272, longitude: 79.8613 }).expect(200);
    await checkOut(v.cg.token, v.shiftId).expect(200);
    const done = await staffShift(v.bookingId, v.shiftId);
    expect(done.status).toBe('SCHEDULED');
    expect(done.checkIn).toMatchObject({ state: 'OUT', outBy: 'CAREGIVER', outLocation: { latitude: 6.9272, longitude: 79.8613, accuracyM: null } });
    expect((await myShift(v.cg.token, v.shiftId)).checkIn).toMatchObject({ state: 'OUT' });
    expect((await clientShift(v.clientToken, v.shiftId)).visit!.checkedOutAt).toBe(done.checkIn!.checkedOutAt);
  });

  it('points out a check-in far from where the booking\'s earlier visits checked in, and checks in without a position', async () => {
    await setting({ enabled: true }).expect(200);
    const v = await visit(5);
    const code = (id: string) => staffShift(v.bookingId, id).then((s) => s.checkIn!.arrivalCode);
    await checkIn(v.cg.token, v.shiftId, { code: await code(v.shiftId), latitude: 6.9271, longitude: 79.8612 }).expect(200);
    // The next day, about a kilometre north.
    await db.update(bookingShifts).set({ startsAt: minutes(5), endsAt: minutes(200) }).where(eq(bookingShifts.id, v.nextShiftId));
    await checkIn(v.cg.token, v.nextShiftId, { code: await code(v.nextShiftId), latitude: 6.9361, longitude: 79.8612 }).expect(200);
    const far = (await staffShift(v.bookingId, v.nextShiftId)).checkIn!;
    expect(far.inDistanceM).toBeGreaterThan(950);
    expect(far.inDistanceM).toBeLessThan(1050);

    // A phone that cannot say where it is still checks in; nonsense coordinates are refused.
    const w = await visit(5);
    const theirs = (await staffShift(w.bookingId, w.shiftId)).checkIn!.arrivalCode;
    await checkIn(w.cg.token, w.shiftId, { code: theirs, latitude: 123, longitude: 79 }).expect(400);
    await checkIn(w.cg.token, w.shiftId, { code: theirs }).expect(200);
    expect((await staffShift(w.bookingId, w.shiftId)).checkIn).toMatchObject({ state: 'IN', inLocation: null, inDistanceM: null });
  });

  describe('the place on the map (care locations)', () => {
    const places = (token: string) => api().get('/me/care-locations').set(bearer(token));
    const addPlace = (token: string, body: object) => api().post('/me/care-locations').set(bearer(token)).send(body);
    const bookingPlace = async (bookingId: string) => (await api().get(`/bookings/${bookingId}/care-location`).set(bearer(staffToken)).expect(200)).body as BookingCareLocation;
    const codeFor = (bookingId: string, shiftId: string) => staffShift(bookingId, shiftId).then((s) => s.checkIn!.arrivalCode);
    // Galle Face Green, Colombo, and points about 100 m and 1 km north of it.
    const HOME = { latitude: 6.9271, longitude: 79.8452 };
    const NEAR = { latitude: 6.928, longitude: 79.8452 };
    const FAR = { latitude: 6.9361, longitude: 79.8452 };

    it('lets a client keep their places, one default, inside Sri Lanka, and nobody else\'s', async () => {
      const v = await visit(30);
      expect((await places(v.clientToken).expect(200)).body).toEqual([]);
      // Outside Sri Lanka, no point, or a name too long: refused.
      expect((await addPlace(v.clientToken, { latitude: 51.5, longitude: -0.12 }).expect(400)).body.message).toMatch(/outside Sri Lanka/);
      await addPlace(v.clientToken, { label: 'Home' }).expect(400);
      await addPlace(v.clientToken, { ...HOME, label: 'x'.repeat(61) }).expect(400);
      // The first place is the default, and is called Home when no name is given.
      const home = (await addPlace(v.clientToken, HOME).expect(201)).body as CareLocation;
      expect(home).toMatchObject({ label: 'Home', isDefault: true, confirmed: true, source: 'CLIENT_PIN', latitude: HOME.latitude, longitude: HOME.longitude });
      const mum = (await addPlace(v.clientToken, { ...FAR, label: "  Mother's   house " }).expect(201)).body as CareLocation;
      expect(mum).toMatchObject({ label: "Mother's house", isDefault: false });
      // Making the second the default leaves exactly one.
      await api().patch(`/me/care-locations/${mum.id}`).set(bearer(v.clientToken)).send({ isDefault: true }).expect(200);
      let mine = (await places(v.clientToken).expect(200)).body as CareLocation[];
      expect(mine.filter((p) => p.isDefault).map((p) => p.id)).toEqual([mum.id]);
      // Removing the default hands it to what is left.
      await api().delete(`/me/care-locations/${mum.id}`).set(bearer(v.clientToken)).expect(200);
      mine = (await places(v.clientToken).expect(200)).body as CareLocation[];
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ id: home.id, isDefault: true });
      // A client cannot confirm anything, and cannot see or change another client's places or bookings.
      const other = await visit(30);
      await api().patch(`/me/care-locations/${home.id}`).set(bearer(other.clientToken)).send({ label: 'Mine now' }).expect(404);
      await api().put(`/me/bookings/${v.bookingId}/care-location`).set(bearer(other.clientToken)).send({ careLocationId: null }).expect(404);
      await places(v.cg.token).expect(403);
      // Staff see the same place as the booking's.
      expect(await bookingPlace(v.bookingId)).toMatchObject({ location: { id: home.id }, chosenForBooking: false, suggestion: null });
    });

    it('measures check-ins from the home, allowing for a poor fix, and points out a simulated one', async () => {
      await setting({ enabled: true, farMetres: 300 }).expect(200);
      const v = await visit(5);
      await addPlace(v.clientToken, HOME).expect(201);
      // "You're at the home" before asking for the code: yes, no or can't say - and never where it is.
      const near = (body: object) => api().post(`/me/shifts/${v.shiftId}/near`).set(bearer(v.cg.token)).send(body);
      expect((await near({ ...NEAR, accuracyM: 15 }).expect(200)).body).toEqual({ atHome: true });
      expect((await near({ ...FAR, accuracyM: 15 }).expect(200)).body).toEqual({ atHome: false });
      expect((await near({ ...FAR, accuracyM: 5000 }).expect(200)).body).toEqual({ atHome: null });
      expect((await near({}).expect(200)).body).toEqual({ atHome: null });
      expect((await api().post(`/me/shifts/${v.nextShiftId}/near`).set(bearer(v.cg.token)).send(NEAR).expect(200)).body).toEqual({ atHome: null });
      const stranger = await newCaregiver();
      await api().post(`/me/shifts/${v.shiftId}/near`).set(bearer(stranger.token)).send(NEAR).expect(404);
      expect(JSON.stringify((await api().get('/me/shifts').set(bearer(v.cg.token)).expect(200)).body)).not.toContain('79.8452');

      // A kilometre off with a good fix: far. On the way out, a simulated position, near the home.
      await checkIn(v.cg.token, v.shiftId, { code: await codeFor(v.bookingId, v.shiftId), ...FAR, accuracyM: 20 }).expect(200);
      await checkOut(v.cg.token, v.shiftId, { ...NEAR, accuracyM: 10, mocked: true }).expect(200);
      const first = (await staffShift(v.bookingId, v.shiftId)).checkIn!;
      expect(first).toMatchObject({ inDistanceFrom: 'PIN', inFar: true, inMocked: false, outFar: false, outMocked: true });
      expect(first.inDistanceM).toBeGreaterThan(950);
      expect(first.outDistanceM).toBeGreaterThan(80);
      expect(first.outDistanceM).toBeLessThan(120);

      // The next day 400 m off, but the phone is only sure to within 200 m: not called far.
      await db.update(bookingShifts).set({ startsAt: minutes(5), endsAt: minutes(200) }).where(eq(bookingShifts.id, v.nextShiftId));
      await checkIn(v.cg.token, v.nextShiftId, { code: await codeFor(v.bookingId, v.nextShiftId), latitude: 6.9307, longitude: 79.8452, accuracyM: 200 }).expect(200);
      expect((await staffShift(v.bookingId, v.nextShiftId)).checkIn).toMatchObject({ inDistanceFrom: 'PIN', inFar: false });
      // The admin's "far" setting has limits.
      await setting({ farMetres: 10 }).expect(400);
      await setting({ farMetres: 5000 }).expect(400);
    });

    it('keeps the first located check-in as a suggestion for staff, measured from only once confirmed', async () => {
      await setting({ enabled: true, farMetres: 300 }).expect(200);
      const v = await visit(5);
      // A simulated position is no suggestion; a real one with a good fix is.
      await checkIn(v.cg.token, v.shiftId, { code: await codeFor(v.bookingId, v.shiftId), ...HOME, accuracyM: 15 }).expect(200);
      let seen = await bookingPlace(v.bookingId);
      expect(seen.location).toBeNull();
      expect(seen.suggestion).toMatchObject({ source: 'FROM_CHECKIN', confirmed: false, latitude: HOME.latitude, longitude: HOME.longitude });
      // It is on the staff list behind Needs attention, with the booking to confirm it on.
      const waiting = (await api().get('/care-locations/suggestions').set(bearer(staffToken)).expect(200)).body as CareLocationSuggestion[];
      expect(waiting.find((w) => w.id === seen.suggestion!.id)).toMatchObject({ bookingId: v.bookingId, bookingReference: v.reference });
      await api().get('/care-locations/suggestions').set(bearer(v.clientToken)).expect(403);
      // The client is asked to pin the home themselves.
      const todos = (await api().get('/me/notifications/summary').set(bearer(v.clientToken)).expect(200)).body as { todos: { kind: string; path: string }[] };
      expect(todos.todos).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'PIN_HOME', path: '/care-places' })]));
      // The client never sees it, and cannot touch it.
      expect((await places(v.clientToken).expect(200)).body).toEqual([]);
      await api().patch(`/me/care-locations/${seen.suggestion!.id}`).set(bearer(v.clientToken)).send({ isDefault: true }).expect(404);
      // Unconfirmed, it is not measured from: the next day is measured from the earlier check-in instead.
      await db.update(bookingShifts).set({ startsAt: minutes(5), endsAt: minutes(200) }).where(eq(bookingShifts.id, v.nextShiftId));
      // Staff confirm it (and it becomes the default); from now on check-ins are measured from it.
      const confirmed = (await api().patch(`/patients/${(await db.select().from(patients).where(eq(patients.userId, v.patientUserId)))[0].id}/care-locations/${seen.suggestion!.id}`).set(bearer(staffToken)).send({ confirm: true, isDefault: true }).expect(200)).body as CareLocation;
      expect(confirmed).toMatchObject({ confirmed: true, isDefault: true, source: 'FROM_CHECKIN' });
      seen = await bookingPlace(v.bookingId);
      expect(seen).toMatchObject({ location: { id: confirmed.id }, suggestion: null });
      await checkIn(v.cg.token, v.nextShiftId, { code: await codeFor(v.bookingId, v.nextShiftId), ...FAR, accuracyM: 10 }).expect(200);
      expect((await staffShift(v.bookingId, v.nextShiftId)).checkIn).toMatchObject({ inDistanceFrom: 'PIN', inFar: true });

      // A client who drops their own pin replaces any suggestion; a booking can name one of their places.
      const w = await visit(5);
      await checkIn(w.cg.token, w.shiftId, { code: await codeFor(w.bookingId, w.shiftId), ...FAR, accuracyM: 15, mocked: true }).expect(200);
      expect((await bookingPlace(w.bookingId)).suggestion).toBeNull();
      const pin = (await addPlace(w.clientToken, HOME).expect(201)).body as CareLocation;
      const other = (await addPlace(w.clientToken, { ...FAR, label: 'Clinic' }).expect(201)).body as CareLocation;
      await api().put(`/bookings/${w.bookingId}/care-location`).set(bearer(staffToken)).send({ careLocationId: other.id }).expect(200);
      expect(await bookingPlace(w.bookingId)).toMatchObject({ location: { id: other.id }, chosenForBooking: true });
      await api().put(`/me/bookings/${w.bookingId}/care-location`).set(bearer(w.clientToken)).send({ careLocationId: null }).expect(200);
      expect(await bookingPlace(w.bookingId)).toMatchObject({ location: { id: pin.id }, chosenForBooking: false });
      await api().put(`/bookings/${w.bookingId}/care-location`).set(bearer(staffToken)).send({ careLocationId: 'nope' }).expect(400);
    });
  });

  it('locks the code after five wrong tries; staff then record the visit by hand', async () => {
    await setting({ enabled: true }).expect(200);
    const v = await visit(-20); // started twenty minutes ago
    const code = (await staffShift(v.bookingId, v.shiftId)).checkIn!.arrivalCode;
    expect((await staffShift(v.bookingId, v.shiftId)).checkIn!.state).toBe('LATE');
    for (let i = 0; i < 4; i++) expect((await checkIn(v.cg.token, v.shiftId, { code: wrong(code) }).expect(400)).body.message).toMatch(/^That code is not right/);
    expect((await checkIn(v.cg.token, v.shiftId, { code: wrong(code) }).expect(400)).body.message).toBe('Too many wrong codes - ask the office to check you in');
    // Even the right code is refused now.
    expect((await checkIn(v.cg.token, v.shiftId, { code }).expect(400)).body.message).toBe('Too many wrong codes - ask the office to check you in');
    expect((await myShift(v.cg.token, v.shiftId)).checkIn).toMatchObject({ state: 'LATE', codeLocked: true });
    expect((await staffShift(v.bookingId, v.shiftId)).checkIn).toMatchObject({ wrongCodes: 5, codeLocked: true });

    // It shows as late on today's list and in the dashboard's count.
    const today = (await api().get('/visits/today').set(bearer(staffToken)).expect(200)).body as TodayVisits;
    const row = today.visits.find((x) => x.shiftId === v.shiftId)!;
    expect(row).toMatchObject({ bookingReference: v.reference, shiftStatus: 'SCHEDULED', isCover: false, client: { fullName: 'Nimal Perera', recipientName: 'Sunil Fernando' }, checkIn: { state: 'LATE', codeLocked: true } });
    expect(row.minutesLate).toBeGreaterThanOrEqual(19); // the shift's start is stored to the second
    expect(row.caregiver.fullName).toMatch(/Visiting Caregiver/);
    expect(today.visits.map((x) => x.startsAt)).toEqual([...today.visits.map((x) => x.startsAt)].sort());
    const overview = (await api().get('/insights/overview').set(bearer(staffToken)).expect(200)).body;
    expect(overview.attention.lateVisits).toBeGreaterThanOrEqual(1);
    await api().get('/visits/today').set(bearer(v.cg.token)).expect(403);

    // Staff record it: the caregiver phoned at ten past.
    const at = minutes(-10).toISOString();
    await api().post(`/visits/${v.shiftId}/check-out`).set(bearer(staffToken)).send({}).expect(400);
    await api().post(`/visits/${v.shiftId}/check-in`).set(bearer(staffToken)).send({ at: minutes(10).toISOString() }).expect(400);
    await api().post(`/visits/${v.shiftId}/check-in`).set(bearer(v.cg.token)).send({}).expect(403);
    const recorded = (await api().post(`/visits/${v.shiftId}/check-in`).set(bearer(staffToken)).send({ at, note: ' Phoned from the house; the client could not find her phone ' }).expect(200)).body as StaffCheckIn;
    expect(recorded).toMatchObject({ state: 'IN', inBy: 'STAFF', inNote: 'Phoned from the house; the client could not find her phone', checkedInAt: at, codeLocked: false, inLocation: null });
    expect(recorded.inByName).toBeTruthy();
    await api().post(`/visits/${v.shiftId}/check-in`).set(bearer(staffToken)).send({}).expect(400);
    expect((await myShift(v.cg.token, v.shiftId)).checkIn).toMatchObject({ state: 'IN', codeLocked: false });
    // No longer late.
    expect(((await api().get('/visits/today').set(bearer(staffToken)).expect(200)).body as TodayVisits).visits.find((x) => x.shiftId === v.shiftId)).toMatchObject({ minutesLate: null, checkIn: { state: 'IN' } });

    // Out: not before they came in; the caregiver can still do that part themselves.
    await api().post(`/visits/${v.shiftId}/check-out`).set(bearer(staffToken)).send({ at: minutes(-15).toISOString() }).expect(400);
    const out = (await api().post(`/visits/${v.shiftId}/check-out`).set(bearer(staffToken)).send({ note: 'Left at the usual time' }).expect(200)).body as StaffCheckIn;
    expect(out).toMatchObject({ state: 'OUT', outBy: 'STAFF', outNote: 'Left at the usual time' });
    await api().post(`/visits/${v.shiftId}/check-out`).set(bearer(staffToken)).send({}).expect(400);
  });

  it('refuses a check-in once the shift has ended, and on a shift that is not scheduled', async () => {
    await setting({ enabled: true }).expect(200);
    const v = await visit(-300); // ended an hour ago
    const code = (await staffShift(v.bookingId, v.shiftId)).checkIn!.arrivalCode;
    expect((await myShift(v.cg.token, v.shiftId)).checkIn).toMatchObject({ state: 'NOT_RECORDED' });
    expect((await clientShift(v.clientToken, v.shiftId)).visit!.arrivalCode).toBeNull();
    expect((await checkIn(v.cg.token, v.shiftId, { code }).expect(400)).body.message).toBe('This shift has ended - ask the office to record your visit');
    // Staff still can, after the fact.
    await api().post(`/visits/${v.shiftId}/check-in`).set(bearer(staffToken)).send({ at: minutes(-295).toISOString() }).expect(200);

    const w = await visit(10);
    await api().patch(`/bookings/${w.bookingId}/shifts/${w.shiftId}`).set(bearer(staffToken)).send({ status: 'CANCELLED', note: 'The family is away' }).expect(200);
    await checkIn(w.cg.token, w.shiftId, { code: '0000' }).expect(400);
    await api().post(`/visits/${w.shiftId}/check-in`).set(bearer(staffToken)).send({}).expect(400);
    expect(await db.select().from(shiftCheckins).where(eq(shiftCheckins.shiftId, w.shiftId))).toHaveLength(0);
  });
  describe('Location checks during a visit', () => {
    const HOME = { latitude: 6.9271, longitude: 79.8452 };
    const AWAY = { latitude: 6.9361, longitude: 79.8452 };
    const send = (shareId: string, token: string, points: object[]) => api().post(`/location-shares/${shareId}/points`).set('X-Share-Token', token).send({ points });
    const presenceOn = { enabled: true, liveEnabled: true, presenceEnabled: true, presenceEveryMinutes: 30, presenceAwayPoints: 2, presenceSilentMultiplier: 2 };
    const sweep = () => app.get(PresenceAgentService).sweep();
    const decisions = async (bookingId: string) =>
      (await db.select().from(agentDecisions).where(eq(agentDecisions.caseId, bookingId))).map((d) => ({ action: d.action, kind: (d.proposal as { kind?: string } | null)?.kind ?? null, status: d.executedAt ? 'EXECUTED' : d.outcome }));
    /** Check in with the code; the answer carries the share for the phone. */
    const arrive = async (v: Awaited<ReturnType<typeof visit>>) => {
      const code = (await staffShift(v.bookingId, v.shiftId)).checkIn!.arrivalCode;
      return (await checkIn(v.cg.token, v.shiftId, { code, ...HOME, accuracyM: 10 }).expect(200)).body as CheckInResult;
    };
    /** Move the share (and its points) back in time, as if the visit had been under way for a while. */
    const backdate = async (shareId: string, minutes: number) => {
      await db.execute(sql`UPDATE location_shares SET started_at = started_at - INTERVAL ${minutes} MINUTE WHERE id = ${shareId}`);
    };

    beforeAll(async () => {
      await api().post('/settings/automation/master').set(bearer(adminToken)).send({ on: false }).expect(200);
      await api().patch('/settings/automation/functions/LIVE_CARE').set(bearer(adminToken)).send({ mode: 'AUTO' }).expect(200);
    });
    afterAll(async () => {
      await api().patch('/settings/automation/functions/LIVE_CARE').set(bearer(adminToken)).send({ mode: 'MANUAL' });
      await setting({ presenceEnabled: false, presenceEveryMinutes: 30, presenceAwayPoints: 2, presenceSilentMultiplier: 2, liveEnabled: false });
    });

    it('is off until an admin turns it on, and has limits', async () => {
      await setting({ ...presenceOn, presenceEnabled: false }).expect(200);
      const v = await visit(5);
      expect(await arrive(v)).toEqual({ ok: true, presence: null });
      expect((await myShift(v.cg.token, v.shiftId)).checkIn!.presence).toBeNull();
      for (const bad of [{ presenceEveryMinutes: 2 }, { presenceEveryMinutes: 200 }, { presenceAwayPoints: 0 }, { presenceSilentMultiplier: 9 }]) await setting(bad).expect(400);
    });

    it('starts at check-in, marks each check at the home or away, and stops at check-out', async () => {
      await setting(presenceOn).expect(200);
      const v = await visit(5);
      await api().post('/me/care-locations').set(bearer(v.clientToken)).send(HOME).expect(201);
      const res = await arrive(v);
      expect(res.presence).toMatchObject({ kind: 'ON_SHIFT', everyMinutes: 30, uploadToken: expect.any(String) });
      const share = res.presence!;
      expect((await myShift(v.cg.token, v.shiftId)).checkIn!.presence).toEqual({ everyMinutes: 30, shareId: share.shareId, askedAt: null });
      // A retried check-in gets a fresh share; the first one stops.
      const again = (await checkIn(v.cg.token, v.shiftId, { code: '0000' }).expect(200)).body as CheckInResult;
      expect(again.presence!.shareId).not.toBe(share.shareId);
      expect((await send(share.shareId, share.uploadToken, [{ at: new Date().toISOString(), ...HOME }]).expect(200)).body).toMatchObject({ open: false });
      const now = again.presence!;

      await send(now.shareId, now.uploadToken, [{ at: new Date(Date.now() - 60_000).toISOString(), ...HOME, accuracyM: 15 }, { at: new Date().toISOString(), ...AWAY, accuracyM: 15 }]).expect(200);
      const points = await db.select().from(locationPoints).where(eq(locationPoints.shareId, now.shareId));
      expect(points.map((p) => p.inside)).toEqual([true, false]);
      expect((await staffShift(v.bookingId, v.shiftId)).checkIn!.presence).toMatchObject({ shareId: now.shareId, open: true, everyMinutes: 30 });
      const detail = (await api().get(`/visits/${v.shiftId}/presence`).set(bearer(staffToken)).expect(200)).body as StaffPresenceDetail;
      expect(detail.points.map((p) => p.inside)).toEqual([true, false]);
      expect(detail.home).toEqual(HOME);
      await api().get(`/visits/${v.shiftId}/presence`).set(bearer(v.cg.token)).expect(403);

      await checkOut(v.cg.token, v.shiftId, HOME).expect(200);
      const [row] = await db.select().from(locationShares).where(eq(locationShares.id, now.shareId));
      expect(row.endReason).toBe('CHECKED_OUT');
      expect((await send(now.shareId, now.uploadToken, [{ at: new Date().toISOString(), ...HOME }]).expect(200)).body).toMatchObject({ open: false });
      // The sweep keeps the summary, so it outlives the points.
      await app.get(LocationSharesService).sweep();
      const [summed] = await db.select().from(locationShares).where(eq(locationShares.id, now.shareId));
      expect(summed.summary).toMatchObject({ slots: expect.any(Array) });
    });

    it('asks "Still with …?" after two checks away, tells staff if unanswered, and not if answered', async () => {
      await setting(presenceOn).expect(200);
      const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

      // Unanswered: asked, then staff told after the next check away.
      const a = await visit(5);
      await api().post('/me/care-locations').set(bearer(a.clientToken)).send(HOME).expect(201);
      const sa = (await arrive(a)).presence!;
      await backdate(sa.shareId, 90);
      await send(sa.shareId, sa.uploadToken, [{ at: minutesAgo(62), ...HOME }, { at: minutesAgo(31), ...AWAY }, { at: minutesAgo(1), ...AWAY }]).expect(200);
      await sweep();
      expect(await decisions(a.bookingId)).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'live_care.check_presence', status: 'EXECUTED' })]));
      expect((await myShift(a.cg.token, a.shiftId)).checkIn!.presence!.askedAt).toEqual(expect.any(String));
      // Once per spell.
      await sweep();
      expect((await decisions(a.bookingId)).filter((d) => d.action === 'live_care.check_presence')).toHaveLength(1);
      // The next check (a few seconds on: stored times are rounded to the second) is still away.
      await send(sa.shareId, sa.uploadToken, [{ at: new Date(Date.now() + 3000).toISOString(), ...AWAY }]).expect(200);
      await sweep();
      expect(await decisions(a.bookingId)).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'live_care.flag_visit', kind: 'AWAY_DURING_VISIT' })]));

      // Answered ("out for the client"): nobody is told.
      const b = await visit(5);
      await api().post('/me/care-locations').set(bearer(b.clientToken)).send(HOME).expect(201);
      const sb = (await arrive(b)).presence!;
      await backdate(sb.shareId, 90);
      await send(sb.shareId, sb.uploadToken, [{ at: minutesAgo(31), ...AWAY }, { at: minutesAgo(1), ...AWAY }]).expect(200);
      await sweep();
      await api().post(`/me/shifts/${b.shiftId}/presence/reply`).set(bearer(b.cg.token)).send({ reply: 'OUT_FOR_CLIENT' }).expect(200);
      await api().post(`/me/shifts/${b.shiftId}/presence/reply`).set(bearer(b.cg.token)).send({ reply: 'NOPE' }).expect(400);
      expect((await myShift(b.cg.token, b.shiftId)).checkIn!.presence!.askedAt).toBeNull();
      await send(sb.shareId, sb.uploadToken, [{ at: new Date(Date.now() + 3000).toISOString(), ...AWAY }]).expect(200);
      await sweep();
      expect((await decisions(b.bookingId)).filter((d) => d.action === 'live_care.flag_visit')).toHaveLength(0);
      expect((await staffShift(b.bookingId, b.shiftId)).checkIn!.presence).toMatchObject({ reply: 'OUT_FOR_CLIENT' });
    });

    it('points out a quiet phone, a simulated position and checks turned off, and lets another phone take over', async () => {
      await setting(presenceOn).expect(200);
      const v = await visit(5);
      const s1 = (await arrive(v)).presence!;
      await backdate(s1.shareId, 65);
      await send(s1.shareId, s1.uploadToken, [{ at: new Date().toISOString(), ...HOME, mocked: true }]).expect(200);
      await db.update(locationShares).set({ lastAt: new Date(Date.now() - 65 * 60_000) }).where(eq(locationShares.id, s1.shareId));
      await sweep();
      const kinds = (await decisions(v.bookingId)).filter((d) => d.action === 'live_care.flag_visit').map((d) => d.kind);
      expect(kinds).toEqual(expect.arrayContaining(['SIMULATED_LOCATION', 'NO_LOCATION_DURING_VISIT']));

      // "Share from this phone": the old share is replaced, not "stopped".
      const s2 = (await api().post(`/me/shifts/${v.shiftId}/presence/restart`).set(bearer(v.cg.token)).expect(200)).body as StartedShare;
      expect((await db.select().from(locationShares).where(eq(locationShares.id, s1.shareId)))[0].endReason).toBe('REPLACED');
      // The caregiver turns the checks off while checked in: staff are told (it is allowed).
      await api().post(`/me/location-shares/${s2.shareId}/stop`).set(bearer(v.cg.token)).expect(200);
      await sweep();
      expect((await decisions(v.bookingId)).map((d) => d.kind)).toContain('LOCATION_STOPPED');
      // Not checked in: no restart, no reply.
      const w = await visit(5);
      await api().post(`/me/shifts/${w.shiftId}/presence/restart`).set(bearer(w.cg.token)).expect(409);
    });
  });

  describe('On my way (live location)', () => {
    const HOME = { latitude: 6.9271, longitude: 79.8452 };
    const onMyWay = (token: string, shiftId: string) => api().post(`/me/shifts/${shiftId}/on-my-way`).set(bearer(token));
    const send = (shareId: string, token: string | null, points: object[]) => {
      const req = api().post(`/location-shares/${shareId}/points`);
      return (token ? req.set('X-Share-Token', token) : req).send({ points });
    };
    const live = (token: string, bookingId: string) => api().get(`/me/bookings/${bookingId}/live`).set(bearer(token));
    const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
    /** The bell is filled in the background: wait a moment for it. */
    const bellTitles = async (token: string, match: RegExp) => {
      for (let i = 0; i < 20; i++) {
        const page = (await api().get('/me/notifications').set(bearer(token)).expect(200)).body as { items: { title: string }[] };
        const found = page.items.filter((x) => match.test(x.title)).map((x) => x.title);
        if (found.length) return found;
        await new Promise((r) => setTimeout(r, 100));
      }
      return [];
    };
    // About 3 km north of the home, then 1 km.
    const far = (s: number) => ({ at: ago(s), latitude: 6.954, longitude: 79.8452, accuracyM: 25 });
    const nearer = (s: number) => ({ at: ago(s), latitude: 6.936, longitude: 79.8452, accuracyM: 15, speed: 6.5 });

    afterAll(async () => {
      await setting({ liveEnabled: false, onMyWayMinutes: 60, locationRetentionDays: 30 });
    });

    it('is off until an admin turns live location on', async () => {
      await setting({ enabled: true, liveEnabled: false }).expect(200);
      const v = await visit(30);
      expect((await myShift(v.cg.token, v.shiftId)).checkIn!.onMyWay).toBeNull();
      await onMyWay(v.cg.token, v.shiftId).expect(403);
      // The admin's limits.
      await setting({ onMyWayMinutes: 5 }).expect(400);
      await setting({ locationRetentionDays: 3 }).expect(400);
    });

    it('shares the trip with the client and staff until check-in, then closes by itself', async () => {
      await setting({ enabled: true, liveEnabled: true, onMyWayMinutes: 60 }).expect(200);
      // Too early: opens 60 minutes before the start.
      const early = await visit(90);
      expect((await onMyWay(early.cg.token, early.shiftId).expect(409)).body.message).toMatch(/opens 60 minutes before/);

      const v = await visit(30);
      await api().post('/me/care-locations').set(bearer(v.clientToken)).send(HOME).expect(201);
      expect((await myShift(v.cg.token, v.shiftId)).checkIn!.onMyWay).toMatchObject({ shareId: null });
      expect((await live(v.clientToken, v.bookingId).expect(200)).body).toEqual({ status: 'NONE' });

      const started = (await onMyWay(v.cg.token, v.shiftId).expect(200)).body as StartedShare;
      expect(started).toMatchObject({ kind: 'ON_THE_WAY', shareId: expect.any(String), uploadToken: expect.any(String) });
      expect((await myShift(v.cg.token, v.shiftId)).checkIn!.onMyWay).toMatchObject({ shareId: started.shareId });
      expect((await clientShift(v.clientToken, v.shiftId)).visit).toMatchObject({ onTheWay: true });
      // Before any point: on the way, nowhere yet, no ETA.
      expect((await live(v.clientToken, v.bookingId).expect(200)).body).toMatchObject({ status: 'ON_THE_WAY', caregiverName: 'Visiting', position: null, home: HOME, eta: { minutes: null } });

      // Points need the share's own token, not a sign-in.
      await send(started.shareId, null, [far(60)]).expect(401);
      await send(started.shareId, 'not-it', [far(60)]).expect(401);
      await api().post(`/location-shares/${started.shareId}/points`).set(bearer(v.cg.token)).send({ points: [far(60)] }).expect(401);
      // Kept: in order, inside Sri Lanka, possible speeds. Dropped: London, a jump to Jaffna a minute later, a repeat.
      const first = await send(started.shareId, started.uploadToken, [far(90), { at: ago(85), latitude: 51.5, longitude: -0.12 }, { at: ago(80), latitude: 9.66, longitude: 80.02 }, nearer(30), nearer(30)]).expect(200);
      expect(first.body).toEqual({ accepted: 2, open: true });
      await send(started.shareId, started.uploadToken, new Array(51).fill(far(10))).expect(400);

      const seen = (await live(v.clientToken, v.bookingId).expect(200)).body as Extract<ClientLive, { status: 'ON_THE_WAY' }>;
      expect(seen.position).toMatchObject({ latitude: 6.936, longitude: 79.8452, accuracyM: 15 });
      expect(seen.eta.minutes).toBeGreaterThan(0);
      expect(seen.eta.distanceM).toBeGreaterThan(900);
      expect(seen.stale).toBe(false);
      const staff = (await api().get('/visits/live').set(bearer(staffToken)).expect(200)).body as StaffLiveShare[];
      expect(staff.find((s) => s.shareId === started.shareId)).toMatchObject({ kind: 'ON_THE_WAY', bookingReference: v.reference, position: { mocked: false } });
      expect((await staffShift(v.bookingId, v.shiftId)).checkIn!.onTheWay).toMatchObject({ shareId: started.shareId, arriving: false });
      // Nobody else sees it: another client, a caregiver.
      const other = await visit(30);
      await live(other.clientToken, v.bookingId).expect(404);
      await live(v.cg.token, v.bookingId).expect(403);
      await api().get('/visits/live').set(bearer(v.cg.token)).expect(403);
      // The client was told once.
      expect(await bellTitles(v.clientToken, /is on the way/)).toEqual(['Visiting is on the way']);

      // Check-in ends it: the phone is told to stop, the client sees nothing.
      const code = (await staffShift(v.bookingId, v.shiftId)).checkIn!.arrivalCode;
      await checkIn(v.cg.token, v.shiftId, { code, ...HOME, accuracyM: 10 }).expect(200);
      expect((await send(started.shareId, started.uploadToken, [nearer(5)]).expect(200)).body).toMatchObject({ open: false });
      expect((await live(v.clientToken, v.bookingId).expect(200)).body).toEqual({ status: 'NONE' });
      expect((await myShift(v.cg.token, v.shiftId)).checkIn!.onMyWay).toBeNull();
      const [row] = await db.select().from(locationShares).where(eq(locationShares.id, started.shareId));
      // Three points: the last was taken just before the check-in, so it still counts.
      expect(row).toMatchObject({ endReason: 'CHECKED_IN', points: 3 });
      await onMyWay(v.cg.token, v.shiftId).expect(409);
    });

    it("closes on \"I can't make this shift\", on stop, on a second tap, at the hard stop, and when turned off", async () => {
      await setting({ enabled: true, liveEnabled: true, onMyWayMinutes: 60 }).expect(200);
      const shares = app.get(LocationSharesService);
      const reason = async (id: string) => (await db.select().from(locationShares).where(eq(locationShares.id, id)))[0].endReason;

      const a = await visit(20);
      const one = (await onMyWay(a.cg.token, a.shiftId).expect(200)).body as StartedShare;
      // A second tap (a new phone): the old share closes, only the new one sends.
      const two = (await onMyWay(a.cg.token, a.shiftId).expect(200)).body as StartedShare;
      expect(await reason(one.shareId)).toBe('REPLACED');
      // Points the old phone took before it was replaced still count; it is told to stop.
      expect((await send(one.shareId, one.uploadToken, [far(5)]).expect(200)).body).toMatchObject({ open: false });
      await api().post(`/me/shifts/${a.shiftId}/cant-make`).set(bearer(a.cg.token)).send({ note: 'Bus broke down' }).expect(200);
      expect(await reason(two.shareId)).toBe('CANT_MAKE');
      await onMyWay(a.cg.token, a.shiftId).expect(409);

      const b = await visit(20);
      const three = (await onMyWay(b.cg.token, b.shiftId).expect(200)).body as StartedShare;
      const stranger = await newCaregiver();
      await api().post(`/me/location-shares/${three.shareId}/stop`).set(bearer(stranger.token)).expect(404);
      await api().post(`/me/location-shares/${three.shareId}/stop`).set(bearer(b.cg.token)).expect(200);
      expect(await reason(three.shareId)).toBe('STOPPED');

      // The hard stop passes: the sweep closes it. Old points go after the retention days.
      const c = await visit(20);
      const four = (await onMyWay(c.cg.token, c.shiftId).expect(200)).body as StartedShare;
      await send(four.shareId, four.uploadToken, [far(30)]).expect(200);
      await db.insert(locationPoints).values({ shareId: four.shareId, at: new Date(Date.now() - 40 * 86_400_000), latitude: 6.95, longitude: 79.85 });
      await db.update(locationShares).set({ endsBy: new Date(Date.now() - 1000) }).where(eq(locationShares.id, four.shareId));
      expect((await live(c.clientToken, c.bookingId).expect(200)).body).toEqual({ status: 'NONE' });
      await shares.sweep();
      expect(await reason(four.shareId)).toBe('CAP');
      const left = await db.select().from(locationPoints).where(eq(locationPoints.shareId, four.shareId));
      expect(left).toHaveLength(1);

      // Live location turned off: open shares close at the next sweep.
      const d = await visit(20);
      const five = (await onMyWay(d.cg.token, d.shiftId).expect(200)).body as StartedShare;
      await setting({ liveEnabled: false }).expect(200);
      await shares.sweep();
      expect(await reason(five.shareId)).toBe('TURNED_OFF');
    });

    it('reminds the caregiver once when On my way opens', async () => {
      await setting({ enabled: true, liveEnabled: true, onMyWayMinutes: 60 }).expect(200);
      const shares = app.get(LocationSharesService);
      const v = await visit(40);
      await shares.sweep();
      await shares.sweep();
      const sent = await db.select().from(locationNotices).where(eq(locationNotices.shiftId, v.shiftId));
      expect(sent.map((s) => s.kind)).toEqual(['ON_MY_WAY_REMINDER']);
      expect(await bellTitles(v.cg.token, /Leaving for your/)).toHaveLength(1);
    });
  });
});
