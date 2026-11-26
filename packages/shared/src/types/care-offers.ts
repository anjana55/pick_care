import type { CareType } from './care-types';
import type { PricingRateType } from './pricing';

/**
 * Job offers: a care request is offered to a caregiver, who accepts or
 * declines in their own time, up to a deadline. Several caregivers can hold
 * an offer for the same request at once; the first to accept takes it and the
 * others are withdrawn.
 *
 * What a caregiver is shown about a job is deliberately little: the kind of
 * care, the area, the start date and the rate. Never the client's name,
 * address, phone number or health details - those come with the booking.
 */

/**
 * JOB: a care request, offered to caregivers who might take it on.
 * COVER: one shift of a running booking whose caregiver cannot come, offered
 * to caregivers who might step in for that shift only.
 */
export const CARE_OFFER_KINDS = ['JOB', 'COVER'] as const;
export type CareOfferKind = (typeof CARE_OFFER_KINDS)[number];

export const CARE_OFFER_STATUSES = ['OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'] as const;
export type CareOfferStatus = (typeof CARE_OFFER_STATUSES)[number];

export const CARE_OFFER_DECLINE_REASONS = ['NOT_AVAILABLE', 'TOO_FAR', 'RATE_TOO_LOW', 'OTHER'] as const;
export type CareOfferDeclineReason = (typeof CARE_OFFER_DECLINE_REASONS)[number];

/** How long a caregiver has to answer, in minutes. */
export const CARE_OFFER_MINUTES = { default: 24 * 60, min: 10, max: 7 * 24 * 60 } as const;
export const MAX_CARE_OFFER_NOTE = 500;
/** Offers one request can have waiting at the same time. */
export const MAX_OPEN_CARE_OFFERS = 10;

/** An offer that is past its deadline is expired, whether or not the clean-up job has reached it yet. */
export function effectiveCareOfferStatus(status: CareOfferStatus, expiresAt: string | Date, now: Date = new Date()): CareOfferStatus {
  return status === 'OFFERED' && new Date(expiresAt).getTime() <= now.getTime() ? 'EXPIRED' : status;
}

export type LocalPlaceName = { en: string; si: string; ta: string };

/** An offer as the caregiver sees it. */
export interface CaregiverCareOffer {
  id: string;
  kind: CareOfferKind;
  /** The request's reference (or, for cover, the booking's), to quote to the office. */
  reference: string;
  status: CareOfferStatus;
  careType: CareType | null;
  district: LocalPlaceName | null;
  city: LocalPlaceName | null;
  desiredStartDate: string | null;
  /** Cover only: the shift to step in for (ISO instants). Null on a job offer. */
  shift: { startsAt: string; endsAt: string } | null;
  /** What the caregiver would be paid, and per what. Null: to be agreed with the office. */
  rateType: PricingRateType | null;
  payRate: number | null;
  /** A line from the office about the job. */
  note: string | null;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
}

/** An offer as staff see it on the request. */
export interface StaffCareOffer {
  id: string;
  kind: CareOfferKind;
  /** The request a job offer is for; null on a cover offer. */
  requestId: string | null;
  /** The shift a cover offer is for; null on a job offer. */
  shiftId: string | null;
  caregiver: { id: string; fullName: string; registrationNumber: string };
  status: CareOfferStatus;
  rateType: PricingRateType | null;
  payRate: number | null;
  /** What the client would be charged (rate + fee). Null when the rate was entered by hand or is still to be agreed. */
  clientRate: number | null;
  note: string | null;
  declineReason: CareOfferDeclineReason | null;
  sentByName: string | null;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
}

export interface SendCareOfferInput {
  caregiverId: string;
  /** Minutes the caregiver has to answer. Default 24 hours. */
  expiresInMinutes?: number;
  note?: string | null;
  /** Only when the caregiver has no usable rate of their own for this kind of care. */
  rateType?: PricingRateType;
  payRate?: number;
}

// --- Finding caregivers to offer a request to (staff) -----------------------

/**
 * How the staff offer search orders caregivers. MATCH is the matching agent's
 * own score for this request (same rules, same reasons), so staff and the
 * agent agree on who fits best.
 */
export const OFFER_CANDIDATE_SORTS = ['MATCH', 'RATING', 'RATE', 'NAME'] as const;
export type OfferCandidateSort = (typeof OFFER_CANDIDATE_SORTS)[number];

/** The filters, as sent. Each list is "any of" except skills and languages, which need all. */
export interface OfferCandidateFilters {
  search?: string;
  districtIds?: number[];
  skillIds?: string[];
  languageIds?: string[];
  gender?: string;
  dayDuty?: boolean;
  nightDuty?: boolean;
  liveIn24h?: boolean;
  /** Default: the statuses listed on the public site. */
  statuses?: string[];
  /** Only those who do the request's kind of care (on by default when the request has one). */
  doesCareType?: boolean;
  /** Only those with an app/website account, who can answer an offer themselves. */
  hasAccount?: boolean;
  /** Clients' average at least this (1-5); unrated caregivers are left out. */
  minRating?: number;
  /** Free by the request's start date (said so, or gave no date). */
  freeByStart?: boolean;
  /** No confirmed booking running when the care would start. */
  noClash?: boolean;
  /** Show caregivers already offered this request (shown with how they answered). */
  includeOffered?: boolean;
  sort?: OfferCandidateSort;
  page?: number;
  pageSize?: number;
}

/** What the request asks for, used to prefill the filters and explain the score. */
export interface OfferCandidateRequestFacts {
  careType: CareType | null;
  districtId: number | null;
  districtName: string | null;
  cityName: string | null;
  schedule: 'DAY' | 'NIGHT' | 'LIVE_IN_24H' | 'NOT_SURE' | null;
  /** YYYY-MM-DD: the date asked for, or today when needed at once. */
  startDate: string | null;
  genderPreference: 'MALE' | 'FEMALE' | null;
  /** Offers waiting now, and how many more can be sent. */
  waitingOffers: number;
  slotsLeft: number;
}

export interface OfferCandidate {
  id: string;
  fullName: string;
  registrationNumber: string;
  publicId: string;
  status: string;
  gender: string | null;
  phone: string | null;
  districtName: string | null;
  cityName: string | null;
  sameCity: boolean;
  sameDistrict: boolean;
  travelsToCity: boolean;
  skills: string[];
  languages: string[];
  dayDuty: boolean;
  nightDuty: boolean;
  liveIn24h: boolean;
  doesCareType: boolean | null;
  hasAccount: boolean;
  ratingAverage: number | null;
  ratingCount: number;
  ownRate: { amount: number; rateType: PricingRateType } | null;
  availableFrom: string | null;
  runningBookings: number;
  /** The matching agent's score and its reasons, in plain English. */
  score: number;
  reasons: string[];
  /** Their latest offer on this request, if any. */
  offer: { status: CareOfferStatus } | null;
}

export interface OfferCandidatePage {
  request: OfferCandidateRequestFacts;
  items: OfferCandidate[];
  total: number;
  page: number;
  pageSize: number;
  /** More caregivers matched than are scored at once: narrow the filters. */
  truncated: boolean;
}
