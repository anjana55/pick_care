/**
 * "Find an address" above the pin maps (where care happens): the person types
 * an address, street, landmark or town and the map jumps there, so they can
 * drop the pin on the house even when they don't know where it is on the map.
 */

/** How exact a match is. Only ADDRESS is one building; the rest need the pin moved onto the house. */
export const ADDRESS_PRECISIONS = ['ADDRESS', 'STREET', 'AREA', 'TOWN'] as const;
export type AddressPrecision = (typeof ADDRESS_PRECISIONS)[number];

export interface AddressMatch {
  /** The main line: "42 Temple Road", "Kandy". */
  label: string;
  /** The rest: "Nugegoda, Colombo District". */
  detail: string | null;
  latitude: number;
  longitude: number;
  precision: AddressPrecision;
  /** MAP: the map search (OpenStreetMap or Google). TOWNS: our own list of towns. */
  source: 'MAP' | 'TOWNS';
}

export interface AddressSearchResult {
  results: AddressMatch[];
  /** The map search could not be reached; only towns were searched. */
  mapSearchUnavailable: boolean;
}

export const ADDRESS_SEARCH_MIN_LENGTH = 3;
export const ADDRESS_SEARCH_MAX_LENGTH = 200;

/** How far to zoom in on a match: close on a building, wider on a town. */
export function zoomForPrecision(p: AddressPrecision): number {
  return p === 'ADDRESS' ? 18 : p === 'STREET' ? 17 : p === 'AREA' ? 15 : 14;
}
