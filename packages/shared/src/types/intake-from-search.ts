import type { SearchRequest } from './public-search';
import { colomboToday } from './bookings';

/**
 * What a client's caregiver search already told us, turned into the answers
 * of the registration intake - so the sign-up form, on the website and in
 * the app, never asks again for something the search settled. Only what the
 * search actually answered is returned; nothing is guessed, and the form
 * shows whatever is missing.
 *
 * Pure, and shared by both frontends so the website and the app read a
 * search the same way.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type IntakeCareSchedule = 'DAY' | 'NIGHT' | 'LIVE_IN_24H' | 'NOT_SURE';
export type IntakeCareStart = 'IMMEDIATELY' | 'WITHIN_WEEK' | 'WITHIN_MONTH' | 'JUST_EXPLORING';
export type IntakeCaregiverGender = 'NO_PREFERENCE' | 'MALE' | 'FEMALE';

export interface SearchIntakeContext {
  request: SearchRequest;
  /** The free-text description typed into AI Search, when that was used. */
  aiQuery?: string;
  /** Names of the skills picked (ids alone mean nothing to staff). */
  skillNames?: string[];
}

export interface IntakeFromSearch {
  recipientAge?: number;
  recipientGender?: 'MALE' | 'FEMALE';
  districtId?: number;
  cityId?: number;
  careSchedule?: IntakeCareSchedule;
  careStart?: IntakeCareStart;
  preferredCaregiverGender?: IntakeCaregiverGender;
  careNeeds?: string;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** A start date picked in search -> the coarse "when should care start" the intake asks for. */
export function careStartFromDate(date: string | undefined, today: string): IntakeCareStart | undefined {
  if (!date || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return undefined;
  const days = daysBetween(today, date);
  if (days <= 2) return 'IMMEDIATELY';
  if (days <= 7) return 'WITHIN_WEEK';
  if (days <= 31) return 'WITHIN_MONTH';
  // Further out than the intake's buckets go: let the client say.
  return undefined;
}

const SHIFT_TO_SCHEDULE: Record<string, IntakeCareSchedule> = {
  DAY: 'DAY',
  NIGHT: 'NIGHT',
  TWENTY_FOUR_HOUR_LIVE_IN: 'LIVE_IN_24H',
  FLEXIBLE: 'NOT_SURE',
};

const GENDER_PREFERENCE: Record<string, IntakeCaregiverGender> = { ANY: 'NO_PREFERENCE', MALE: 'MALE', FEMALE: 'FEMALE' };

export const CARE_NEEDS_MAX = 1000;

/** How the care-needs note words the picked skills and conditions, in the reader's language. */
export interface CareNeedsWording {
  help: (list: string) => string;
  conditions: (list: string) => string;
}

/**
 * The care-needs note staff read, written from the search: what the visitor
 * typed into AI Search, the help they asked for and any health conditions.
 * Undefined when the search said none of that.
 */
export function careNeedsFromSearch(context: SearchIntakeContext, wording: CareNeedsWording): string | undefined {
  const parts: string[] = [];
  const typed = context.aiQuery?.trim();
  if (typed) parts.push(typed);
  if (context.skillNames && context.skillNames.length > 0) parts.push(wording.help(context.skillNames.join(', ')));
  const conditions = context.request.patient?.medicalConditions ?? [];
  if (conditions.length > 0) parts.push(wording.conditions(conditions.join(', ')));
  const text = parts.join('\n').trim();
  return text ? text.slice(0, CARE_NEEDS_MAX) : undefined;
}

/** Everything the registration intake can take from a search. */
export function intakeFromSearch(context: SearchIntakeContext, wording: CareNeedsWording, today = colomboToday()): IntakeFromSearch {
  const { request } = context;
  const out: IntakeFromSearch = {};
  const age = request.patient?.age;
  if (typeof age === 'number' && Number.isInteger(age) && age >= 0 && age <= 120) out.recipientAge = age;
  if (request.patient?.gender === 'MALE' || request.patient?.gender === 'FEMALE') out.recipientGender = request.patient.gender;
  if (request.location?.districtId) out.districtId = request.location.districtId;
  if (request.location?.districtId && request.location.cityId) out.cityId = request.location.cityId;
  if (request.shift && SHIFT_TO_SCHEDULE[request.shift]) out.careSchedule = SHIFT_TO_SCHEDULE[request.shift];
  const start = careStartFromDate(request.desiredStartDate, today);
  if (start) out.careStart = start;
  if (request.caregiverGenderPreference && GENDER_PREFERENCE[request.caregiverGenderPreference]) {
    out.preferredCaregiverGender = GENDER_PREFERENCE[request.caregiverGenderPreference];
  }
  const needs = careNeedsFromSearch(context, wording);
  if (needs) out.careNeeds = needs;
  return out;
}
