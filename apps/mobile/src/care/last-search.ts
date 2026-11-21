import type { CreateCareRequestBody, SearchIntakeContext, SearchRequest } from '@care-platform/shared';

/**
 * What the client last searched for, carried into a request so they aren't
 * asked again (the website does the same). Kept for this app session only.
 */
let last: SearchRequest | null = null;
let lastQuery: string | null = null;

/** `query`: what was typed into AI Search, when that was used - it becomes the care-needs note on sign-up. */
export function rememberSearch(request: SearchRequest | null, query: string | null = null) {
  last = request;
  lastQuery = request ? query : null;
}

/** The last search, as registration reads it (packages/shared intake-from-search). */
export function lastSearchContext(): SearchIntakeContext | null {
  return last ? { request: last, ...(lastQuery ? { aiQuery: lastQuery } : {}) } : null;
}

export function detailsFromLastSearch(): Pick<CreateCareRequestBody, 'careType' | 'districtId' | 'cityId' | 'desiredStartDate'> {
  if (!last) return {};
  return {
    ...(last.careType ? { careType: last.careType } : {}),
    ...(last.location?.districtId ? { districtId: last.location.districtId } : {}),
    ...(last.location?.cityId ? { cityId: last.location.cityId } : {}),
    ...(last.desiredStartDate ? { desiredStartDate: last.desiredStartDate } : {}),
  };
}
