import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  MAX_OPEN_CARE_OFFERS,
  PUBLIC_CAREGIVER_STATUSES,
  colomboToday,
  effectiveCareOfferStatus,
  type CareOfferStatus,
  type CareType,
  type OfferCandidate,
  type OfferCandidatePage,
  type OfferCandidateRequestFacts,
  type PricingRateType,
} from '@care-platform/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { CARE_TYPE_COLUMNS, availability, careRequests, caregiverLanguages, caregiverSkills, caregivers, cities, districts, languages, patients, requestOffers, skills } from '../database/schema';
import { CaregiversService } from '../caregivers/caregivers.service';
import { CandidatePoolService, type CandidateRow } from '../matching/candidate-pool.service';
import { scoreMatch, type MatchCandidate, type MatchRequest } from '../matching/matching-rules';
import { maskPhone } from '../common/utils/masking.util';
import { skillNameSql } from '../skills/skill-name';
import type { OfferCandidatesQueryDto } from './dto/offer-candidates.dto';

/** The most caregivers scored for one search; past this staff are asked to narrow the filters. */
export const MAX_SCORED = 500;

/**
 * Finding the right caregivers to offer a request to (staff, the "Offers to
 * caregivers" card). The caregiver list's filters, plus what only makes sense
 * against this request: does this kind of care, free by the start date, no
 * clashing booking, rating, and the matching agent's own score and reasons.
 *
 * It reads; sending stays with OffersService.send, one caregiver at a time,
 * with all its checks.
 */
@Injectable()
export class OfferCandidatesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly caregiversService: CaregiversService,
    private readonly pools: CandidatePoolService,
  ) {}

  async search(requestId: string, q: OfferCandidatesQueryDto, lang?: string, now = new Date()): Promise<OfferCandidatePage> {
    const request = await this.requestFacts(requestId, now);
    const conditions: SQL[] = await this.caregiversService.filterConditions(q);
    conditions.push(inArray(caregivers.status, (q.statuses?.length ? q.statuses : [...PUBLIC_CAREGIVER_STATUSES]) as (typeof caregivers.status._.data)[]));
    if (q.hasAccount) conditions.push(isNotNull(caregivers.userId));
    const column = request.careType ? CARE_TYPE_COLUMNS[request.careType as keyof typeof CARE_TYPE_COLUMNS] : undefined;
    // No availability record yet means nothing has been narrowed down: every kind of care is on (as in the matching pool).
    if (q.doesCareType !== false && column) conditions.push(or(isNull(availability.caregiverId), eq(availability[column], true))!);

    const rows = await this.db
      .select({
        id: caregivers.id,
        registrationNumber: caregivers.registrationNumber,
        status: caregivers.status,
        districtId: caregivers.districtId,
        cityId: caregivers.cityId,
        userId: caregivers.userId,
        avail: availability,
      })
      .from(caregivers)
      .leftJoin(availability, eq(availability.caregiverId, caregivers.id))
      .where(and(...conditions))
      .orderBy(caregivers.registrationNumber)
      .limit(MAX_SCORED + 1);
    const truncated = rows.length > MAX_SCORED;
    const pool = rows.slice(0, MAX_SCORED);

    const offers = await this.offersOn(requestId, now);
    const visible = q.includeOffered ? pool : pool.filter((r) => !offers.has(r.id));

    const match: MatchRequest = {
      careType: (request.careType ?? '') as string,
      // No district on the request yet: nobody scores "same district".
      districtId: request.districtId ?? -1,
      cityId: request.cityId,
      schedule: request.schedule,
      urgency: null,
      desiredStartDate: request.startDate,
    };
    const facts = await this.pools.facts(visible as CandidateRow[], match, now);
    const byId = new Map(visible.map((r) => [r.id, r]));

    const kept = facts
      .filter((f) => (q.minRating ? f.ratingAverage !== null && f.ratingAverage >= q.minRating : true))
      .filter((f) => (q.freeByStart && request.startDate ? !f.availableFrom || f.availableFrom <= request.startDate : true))
      .filter((f) => (q.noClash ? f.runningBookings === 0 : true))
      .map((f) => ({ f, ranked: scoreMatch(match, f) }));

    const sort = q.sort ?? 'MATCH';
    const byReg = (a: MatchCandidate, b: MatchCandidate) => a.registrationNumber.localeCompare(b.registrationNumber);
    kept.sort((a, b) => {
      if (sort === 'RATING') return (b.f.ratingAverage ?? -1) - (a.f.ratingAverage ?? -1) || b.f.ratingCount - a.f.ratingCount || byReg(a.f, b.f);
      if (sort === 'RATE') return (a.f.ownRate?.amount ?? Infinity) - (b.f.ownRate?.amount ?? Infinity) || byReg(a.f, b.f);
      if (sort === 'NAME') return 0; // ordered by name below, once names are loaded
      return b.ranked.score - a.ranked.score || byReg(a.f, b.f);
    });

    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    let ordered = kept;
    if (sort === 'NAME') {
      const names = await this.namesOf(kept.map((k) => k.f.caregiverId));
      ordered = [...kept].sort((a, b) => (names.get(a.f.caregiverId) ?? '').localeCompare(names.get(b.f.caregiverId) ?? '') || byReg(a.f, b.f));
    }
    const slice = ordered.slice((page - 1) * pageSize, page * pageSize);
    const details = await this.details(slice.map((k) => k.f.caregiverId), lang);

    const items: OfferCandidate[] = slice.map(({ f, ranked }) => {
      const d = details.get(f.caregiverId)!;
      const row = byId.get(f.caregiverId)!;
      return {
        id: f.caregiverId,
        fullName: d.fullName,
        registrationNumber: f.registrationNumber,
        publicId: d.publicId,
        status: row.status,
        gender: d.gender,
        phone: maskPhone(d.phone),
        districtName: d.districtName,
        cityName: d.cityName,
        sameCity: f.sameCity,
        sameDistrict: f.sameDistrict,
        travelsToCity: f.travelsToCity,
        skills: d.skills,
        languages: d.languages,
        dayDuty: f.dayDuty,
        nightDuty: f.nightDuty,
        liveIn24h: f.liveIn24h,
        doesCareType: column ? (row.avail ? Boolean(row.avail[column]) : true) : null,
        hasAccount: Boolean(row.userId),
        ratingAverage: f.ratingAverage,
        ratingCount: f.ratingCount,
        ownRate: f.ownRate ? { amount: f.ownRate.amount, rateType: f.ownRate.rateType as PricingRateType } : null,
        availableFrom: f.availableFrom,
        runningBookings: f.runningBookings,
        score: ranked.score,
        reasons: ranked.reasons,
        offer: offers.has(f.caregiverId) ? { status: offers.get(f.caregiverId)! } : null,
      };
    });

    const waiting = [...offers.values()].filter((s) => s === 'OFFERED').length;
    return {
      request: { ...request.view, waitingOffers: waiting, slotsLeft: Math.max(0, MAX_OPEN_CARE_OFFERS - waiting) },
      items,
      total: kept.length,
      page,
      pageSize,
      truncated,
    };
  }

  /** What the request asks for: its own answers first, else what the client said at sign-up (as the matching agent reads it). */
  private async requestFacts(requestId: string, now: Date) {
    const [r] = await this.db
      .select({
        careType: careRequests.careType,
        districtId: sql<number | null>`COALESCE(${careRequests.districtId}, ${patients.districtId})`,
        cityId: sql<number | null>`IF(${careRequests.districtId} IS NULL, ${patients.cityId}, ${careRequests.cityId})`,
        schedule: sql<'DAY' | 'NIGHT' | 'LIVE_IN_24H' | 'NOT_SURE' | null>`COALESCE(${careRequests.schedule}, ${patients.careSchedule})`,
        desiredStartDate: careRequests.desiredStartDate,
        urgency: patients.careStart,
        genderPreference: patients.preferredCaregiverGender,
      })
      .from(careRequests)
      .innerJoin(patients, eq(patients.id, careRequests.patientId))
      .where(eq(careRequests.id, requestId))
      .limit(1);
    if (!r) throw new NotFoundException('Request not found');

    const districtId = r.districtId === null ? null : Number(r.districtId);
    const cityId = r.cityId === null ? null : Number(r.cityId);
    const [[district], [city]] = await Promise.all([
      districtId === null ? Promise.resolve([] as { name: string }[]) : this.db.select({ name: districts.nameEn }).from(districts).where(eq(districts.id, districtId)).limit(1),
      cityId === null ? Promise.resolve([] as { name: string }[]) : this.db.select({ name: cities.nameEn }).from(cities).where(eq(cities.id, cityId)).limit(1),
    ]);
    const asDay = (d: Date | string | null) => (!d ? null : typeof d === 'string' ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    const startDate = asDay(r.desiredStartDate) ?? (r.urgency === 'IMMEDIATELY' || r.urgency === 'WITHIN_WEEK' ? colomboToday(now) : null);
    const view: Omit<OfferCandidateRequestFacts, 'waitingOffers' | 'slotsLeft'> = {
      careType: (r.careType as CareType | null) ?? null,
      districtId,
      districtName: district?.name ?? null,
      cityName: city?.name ?? null,
      schedule: r.schedule ?? null,
      startDate,
      genderPreference: r.genderPreference === 'MALE' || r.genderPreference === 'FEMALE' ? r.genderPreference : null,
    };
    return { ...view, cityId, view };
  }

  /** Each caregiver's latest job offer on this request, by its effective status. */
  private async offersOn(requestId: string, now: Date): Promise<Map<string, CareOfferStatus>> {
    const rows = await this.db
      .select({ caregiverId: requestOffers.caregiverId, status: requestOffers.status, expiresAt: requestOffers.expiresAt, createdAt: requestOffers.createdAt })
      .from(requestOffers)
      .where(and(eq(requestOffers.requestId, requestId), eq(requestOffers.kind, 'JOB')))
      .orderBy(requestOffers.createdAt);
    const out = new Map<string, CareOfferStatus>();
    for (const o of rows) out.set(o.caregiverId, effectiveCareOfferStatus(o.status, o.expiresAt, now));
    return out;
  }

  private async namesOf(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.db.select({ id: caregivers.id, fullName: caregivers.fullName }).from(caregivers).where(inArray(caregivers.id, ids));
    return new Map(rows.map((r) => [r.id, r.fullName]));
  }

  /** Names, places, skills and languages for one page of results. */
  private async details(ids: string[], lang?: string) {
    const out = new Map<string, { fullName: string; publicId: string; gender: string | null; phone: string | null; districtName: string | null; cityName: string | null; skills: string[]; languages: string[] }>();
    if (!ids.length) return out;
    const [rows, skillRows, languageRows] = await Promise.all([
      this.db
        .select({
          id: caregivers.id,
          fullName: caregivers.fullName,
          publicId: caregivers.publicId,
          gender: caregivers.gender,
          phone: caregivers.primaryPhone,
          districtName: districts.nameEn,
          cityName: cities.nameEn,
        })
        .from(caregivers)
        .leftJoin(districts, eq(districts.id, caregivers.districtId))
        .leftJoin(cities, eq(cities.id, caregivers.cityId))
        .where(inArray(caregivers.id, ids)),
      this.db
        .select({ caregiverId: caregiverSkills.caregiverId, name: skillNameSql(lang) })
        .from(caregiverSkills)
        .innerJoin(skills, eq(skills.id, caregiverSkills.skillId))
        .where(inArray(caregiverSkills.caregiverId, ids)),
      this.db
        .select({ caregiverId: caregiverLanguages.caregiverId, name: languages.name })
        .from(caregiverLanguages)
        .innerJoin(languages, eq(languages.id, caregiverLanguages.languageId))
        .where(inArray(caregiverLanguages.caregiverId, ids)),
    ]);
    for (const r of rows) {
      out.set(r.id, {
        fullName: r.fullName,
        publicId: r.publicId,
        gender: r.gender ?? null,
        phone: r.phone ?? null,
        districtName: r.districtName ?? null,
        cityName: r.cityName ?? null,
        skills: skillRows.filter((s) => s.caregiverId === r.id).map((s) => s.name),
        languages: languageRows.filter((l) => l.caregiverId === r.id).map((l) => l.name),
      });
    }
    return out;
  }
}
