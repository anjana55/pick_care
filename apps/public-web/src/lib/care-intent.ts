import { useCallback, useSyncExternalStore } from 'react';
import { careNeedsFromSearch as sharedCareNeeds, colomboToday, intakeFromSearch, type SearchRequest } from '@care-platform/shared';
import type { PatientIntakeValues } from './schemas/patient-intake';

/**
 * What a signed-out visitor has already told us, kept on their device so the
 * client journey never asks twice:
 *
 * - the last search they ran (and, for AI Search, what they typed), which
 *   pre-fills the care intake on sign-up and restores their results on /find;
 * - the caregiver they were about to contact, so signing up or in brings them
 *   straight back with the request dialog open;
 * - a device shortlist, so Save works before there is an account and is
 *   copied to the account the moment they sign in as a client.
 *
 * localStorage for the same reason as return-to.ts: email sign-up finishes in
 * whatever tab the verification link opens. Everything expires (the shortlist
 * aside) so a shared computer does not hand one visitor's care needs to the
 * next, and every read is defensive - storage may be blocked or hand-edited.
 */

const SEARCH_KEY = 'care-platform-last-search';
const PENDING_KEY = 'care-platform-pending-contact';
const SHORTLIST_KEY = 'care-platform-device-shortlist';
const DAY_MS = 24 * 60 * 60 * 1000;
const SHORTLIST_MAX = 50;
const SHORTLIST_EVENT = 'care-platform-shortlist-change';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked (private mode): the journey still works, it just asks again.
  }
}

function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------------ */
/* The last search                                                          */
/* ------------------------------------------------------------------------ */

export interface SearchContext {
  request: SearchRequest;
  /** The free-text description typed into AI Search, when that was used. */
  aiQuery?: string;
  /** Names of the skills picked, resolved when the search ran (ids alone mean nothing to staff). */
  skillNames?: string[];
}

export function rememberSearch(context: SearchContext) {
  writeJson(SEARCH_KEY, { ...context, at: Date.now() });
}

export function loadSearch(): SearchContext | null {
  const stored = readJson<SearchContext & { at?: unknown }>(SEARCH_KEY);
  if (!stored || typeof stored.at !== 'number' || Date.now() - stored.at > DAY_MS) return null;
  if (!stored.request || typeof stored.request !== 'object') return null;
  return {
    request: stored.request,
    aiQuery: typeof stored.aiQuery === 'string' ? stored.aiQuery : undefined,
    skillNames: Array.isArray(stored.skillNames) ? stored.skillNames.filter((s) => typeof s === 'string') : undefined,
  };
}

export function forgetSearch() {
  remove(SEARCH_KEY);
}

/* ------------------------------------------------------------------------ */
/* The caregiver they were about to contact                                 */
/* ------------------------------------------------------------------------ */

export function rememberPendingContact(publicId: string) {
  if (!UUID.test(publicId)) return;
  writeJson(PENDING_KEY, { publicId, at: Date.now() });
}

/** The caregiver a visitor set out to contact in the last day, if any. Does not clear it. */
export function peekPendingContact(): string | null {
  const stored = readJson<{ publicId?: unknown; at?: unknown }>(PENDING_KEY);
  if (!stored || typeof stored.publicId !== 'string' || typeof stored.at !== 'number') return null;
  if (Date.now() - stored.at > DAY_MS || !UUID.test(stored.publicId)) return null;
  return stored.publicId;
}

export function clearPendingContact() {
  remove(PENDING_KEY);
}

/* ------------------------------------------------------------------------ */
/* Device shortlist                                                         */
/* ------------------------------------------------------------------------ */

export function readDeviceShortlist(): string[] {
  const stored = readJson<unknown>(SHORTLIST_KEY);
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string' && UUID.test(id)).slice(0, SHORTLIST_MAX) : [];
}

function writeDeviceShortlist(ids: string[]) {
  if (ids.length === 0) remove(SHORTLIST_KEY);
  else writeJson(SHORTLIST_KEY, ids.slice(0, SHORTLIST_MAX));
  try {
    window.dispatchEvent(new Event(SHORTLIST_EVENT));
  } catch {
    // ignore
  }
}

export function setDeviceSaved(publicId: string, saved: boolean) {
  if (!UUID.test(publicId)) return;
  const current = readDeviceShortlist().filter((id) => id !== publicId);
  writeDeviceShortlist(saved ? [publicId, ...current] : current);
}

/** Drops the given ids (the ones copied to the account) and keeps any that failed. */
export function removeFromDeviceShortlist(ids: string[]) {
  const drop = new Set(ids);
  writeDeviceShortlist(readDeviceShortlist().filter((id) => !drop.has(id)));
}

// useSyncExternalStore needs a stable snapshot, so the parsed list is cached
// against the raw string it came from.
let cachedRaw: string | null | undefined;
let cachedList: string[] = [];
function shortlistSnapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SHORTLIST_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = readDeviceShortlist();
  }
  return cachedList;
}
const EMPTY: string[] = [];

function subscribe(onChange: () => void) {
  window.addEventListener(SHORTLIST_EVENT, onChange);
  window.addEventListener('storage', onChange); // other tabs
  return () => {
    window.removeEventListener(SHORTLIST_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The device shortlist, live across components and tabs. */
export function useDeviceShortlist() {
  const ids = useSyncExternalStore(subscribe, shortlistSnapshot, () => EMPTY);
  const isSaved = useCallback((publicId: string) => ids.includes(publicId), [ids]);
  return { ids, isSaved, setSaved: setDeviceSaved };
}

/* ------------------------------------------------------------------------ */
/* Search -> care intake                                                    */
/* ------------------------------------------------------------------------ */

/*
 * The mapping itself is shared with the mobile app
 * (packages/shared/src/types/intake-from-search.ts), so both read a search
 * the same way; these wrap it in the website's types and wording.
 */
export { colomboToday, careStartFromDate } from '@care-platform/shared';

/**
 * The care-needs note staff read, written from the search: what the visitor
 * typed into AI Search, the help they asked for and any health conditions.
 * Undefined when the search said none of that - the field is optional.
 */
export function careNeedsFromSearch(context: SearchContext, t: (key: string, params?: Record<string, string | number>) => string) {
  return sharedCareNeeds(context, wordingFor(t));
}

/**
 * Everything the sign-up intake can take from the last search. Only fields the
 * search actually answered are returned - nothing is guessed - so whatever is
 * missing is simply left for the client, and every carried-over answer stays
 * editable on the form.
 */
export function intakeDefaultsFromSearch(
  context: SearchContext,
  t: (key: string, params?: Record<string, string | number>) => string,
  today = colomboToday(),
): Partial<PatientIntakeValues> {
  return intakeFromSearch(context, wordingFor(t), today);
}

const wordingFor = (t: (key: string, params?: Record<string, string | number>) => string) => ({
  help: (list: string) => t('careIntent.needs.help', { list }),
  conditions: (list: string) => t('careIntent.needs.conditions', { list }),
});
