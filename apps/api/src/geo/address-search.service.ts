import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AddressMatch, AddressPrecision, AddressSearchResult, Locale } from '@care-platform/shared';
import { GeoService, localName } from './geo.service';

/** Results shown at most. */
const MAX_RESULTS = 8;
const MAX_TOWNS = 5;
const TIMEOUT_MS = 4_000;
/** Same words, same answer for a day: addresses don't move. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_SIZE = 1_000;
/** OpenStreetMap's public Nominatim allows one request a second from an app. */
const NOMINATIM_GAP_MS = 1_100;

export type GeocoderProvider = 'nominatim' | 'google' | 'off';

/** Sri Lanka, with a margin: anything the map search returns outside it is dropped. */
const LK = { south: 5.7, north: 10.1, west: 79.4, east: 82.1 };
const inSriLanka = (lat: number, lng: number) => lat >= LK.south && lat <= LK.north && lng >= LK.west && lng <= LK.east;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const fold = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

interface NominatimHit {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  addresstype?: string;
  type?: string;
  class?: string;
  address?: Record<string, string>;
}
interface GoogleHit {
  formatted_address: string;
  geometry: { location: { lat: number; lng: number }; location_type: string };
  types: string[];
  address_components: { long_name: string; types: string[] }[];
}

/**
 * Typed address -> places on the map, for the pin maps (staff, website, app).
 *
 * Two sources, merged:
 * - our own list of ~2,200 Sri Lankan towns, in English, Sinhala and Tamil:
 *   free, instant, never down, and always gets the person to the right town;
 * - a map search for streets, buildings and landmarks: OpenStreetMap's
 *   Nominatim by default (no key, the same map data as the tiles), or Google
 *   when GEOCODER_PROVIDER=google and a key are set.
 *
 * The map search is called from here, never from the browser or the app, so
 * Nominatim's usage policy (one request a second, an identifying User-Agent,
 * results cached) is kept in one place and a Google key never leaves the
 * server. If it is slow or down, the towns still answer.
 */
@Injectable()
export class AddressSearchService {
  private readonly logger = new Logger(AddressSearchService.name);
  private readonly cache = new Map<string, { at: number; results: AddressMatch[] }>();
  private nextSlot = 0;

  constructor(
    private readonly geo: GeoService,
    private readonly config: ConfigService,
  ) {}

  get provider(): GeocoderProvider {
    const p = (this.config.get<string>('GEOCODER_PROVIDER') ?? 'nominatim').toLowerCase();
    if (p === 'google') return this.config.get<string>('GEOCODER_GOOGLE_API_KEY') ? 'google' : 'nominatim';
    return p === 'off' ? 'off' : 'nominatim';
  }

  async search(query: string, locale: Locale): Promise<AddressSearchResult> {
    const q = query.trim();
    const towns = await this.towns(q, locale);
    let map: AddressMatch[] = [];
    let mapSearchUnavailable = false;
    if (this.provider !== 'off') {
      try {
        map = await this.mapSearch(q, locale);
      } catch (err) {
        mapSearchUnavailable = true;
        this.logger.warn(`Address search: map search failed (${this.provider}) - ${(err as Error).message}`);
      }
    }
    // The map search's specific matches first; then towns it didn't already give.
    const near = (a: AddressMatch, b: AddressMatch) => Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;
    const results = [...map, ...towns.filter((t) => !map.some((m) => m.precision === 'TOWN' && near(m, t)))].slice(0, MAX_RESULTS);
    return { results, mapSearchUnavailable };
  }

  /** Towns whose name (any language) starts with what was typed, then those containing it. */
  async towns(q: string, locale: Locale): Promise<AddressMatch[]> {
    const typed = fold(q);
    if (!typed) return [];
    // "12 Main Street, Kandy": the town is usually the last part.
    const parts = typed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const words = [...new Set([typed, ...parts.reverse()])];
    const { cities, districts } = await this.geo.all();
    const scored: { score: number; match: AddressMatch }[] = [];
    for (const c of cities.values()) {
      const names = [c.nameEn, c.nameSi, c.nameTa].map(fold);
      let score = 0;
      for (const [i, w] of words.entries()) {
        if (w.length < 2) continue;
        const weight = words.length - i;
        if (names.some((n) => n === w)) score = Math.max(score, 30 + weight);
        else if (names.some((n) => n.startsWith(w))) score = Math.max(score, 20 + weight);
        else if (w.length >= 3 && names.some((n) => n.includes(w))) score = Math.max(score, 10 + weight);
      }
      if (!score) continue;
      const district = districts.get(c.districtId);
      scored.push({
        score,
        match: {
          label: localName(c, locale),
          detail: district ? localName(district, locale) : null,
          latitude: round6(c.latitude),
          longitude: round6(c.longitude),
          precision: 'TOWN',
          source: 'TOWNS',
        },
      });
    }
    return scored
      .sort((a, b) => b.score - a.score || a.match.label.localeCompare(b.match.label))
      .slice(0, MAX_TOWNS)
      .map((s) => s.match);
  }

  private async mapSearch(q: string, locale: Locale): Promise<AddressMatch[]> {
    const key = `${this.provider}|${locale}|${fold(q)}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;
    const results = this.provider === 'google' ? await this.google(q, locale) : await this.nominatim(q, locale);
    if (this.cache.size >= CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { at: Date.now(), results });
    return results;
  }

  private async nominatim(q: string, locale: Locale): Promise<AddressMatch[]> {
    // One request a second across this process, as the usage policy asks.
    const now = Date.now();
    const wait = Math.max(0, this.nextSlot - now);
    this.nextSlot = Math.max(now, this.nextSlot) + NOMINATIM_GAP_MS;
    if (wait) await new Promise((r) => setTimeout(r, wait));

    const base = (this.config.get<string>('GEOCODER_URL') || 'https://nominatim.openstreetmap.org').replace(/\/+$/, '');
    const url = `${base}/search?${new URLSearchParams({ q, format: 'jsonv2', countrycodes: 'lk', limit: '6', addressdetails: '1', 'accept-language': `${locale},en` })}`;
    const contact = this.config.get<string>('GEOCODER_CONTACT') || this.config.get<string>('PUBLIC_WEB_URL') || 'care-platform';
    const rows = await this.getJson<NominatimHit[]>(url, {
      'User-Agent': `CarePlatform/1.0 (${contact})`,
      Referer: this.config.get<string>('PUBLIC_WEB_URL') ?? '',
    });
    return rows
      .map((r) => ({ r, lat: Number(r.lat), lng: Number(r.lon) }))
      .filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng) && inSriLanka(lat, lng))
      .map(({ r, lat, lng }) => {
        const [first, ...rest] = r.display_name.split(',').map((s) => s.trim());
        const house = r.address?.house_number;
        const road = r.address?.road;
        const label = house && road ? `${house} ${road}` : r.name || first;
        const detail =
          rest
            .filter((s) => s !== label && s !== road && s !== house && s !== 'Sri Lanka' && s !== 'ශ්‍රී ලංකාව' && s !== 'இலங்கை' && !/^\d{5}$/.test(s))
            .slice(0, 3)
            .join(', ') || null;
        return { label, detail, latitude: round6(lat), longitude: round6(lng), precision: nominatimPrecision(r), source: 'MAP' as const };
      });
  }

  private async google(q: string, locale: Locale): Promise<AddressMatch[]> {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({ address: q, components: 'country:LK', language: locale, key: this.config.get<string>('GEOCODER_GOOGLE_API_KEY')! })}`;
    const body = await this.getJson<{ status: string; results: GoogleHit[]; error_message?: string }>(url, {});
    if (body.status === 'ZERO_RESULTS') return [];
    if (body.status !== 'OK') throw new Error(`Google geocoding: ${body.status}${body.error_message ? ` - ${body.error_message}` : ''}`);
    return body.results
      .filter((r) => inSriLanka(r.geometry.location.lat, r.geometry.location.lng))
      .slice(0, 6)
      .map((r) => {
        const [first, ...rest] = r.formatted_address.split(',').map((s) => s.trim());
        return {
          label: first,
          detail: rest.filter((s) => s !== 'Sri Lanka' && !/^\d{5}$/.test(s)).join(', ') || null,
          latitude: round6(r.geometry.location.lat),
          longitude: round6(r.geometry.location.lng),
          precision: googlePrecision(r),
          source: 'MAP' as const,
        };
      });
  }

  private async getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function nominatimPrecision(r: Pick<NominatimHit, 'addresstype' | 'type' | 'class' | 'address'>): AddressPrecision {
  const t = r.addresstype ?? r.type ?? '';
  if (
    r.address?.house_number ||
    ['house', 'building', 'amenity', 'shop', 'office', 'tourism', 'leisure', 'place_of_worship'].includes(t) ||
    r.class === 'building' ||
    r.class === 'amenity'
  )
    return 'ADDRESS';
  if (['road', 'street', 'residential', 'pedestrian', 'service'].includes(t) || r.class === 'highway') return 'STREET';
  if (['city', 'town', 'village', 'municipality', 'county', 'state', 'state_district', 'district'].includes(t)) return 'TOWN';
  return 'AREA';
}

export function googlePrecision(r: Pick<GoogleHit, 'types' | 'geometry'>): AddressPrecision {
  if (
    r.geometry.location_type === 'ROOFTOP' ||
    r.types.some((t) => ['street_address', 'premise', 'subpremise', 'establishment', 'point_of_interest'].includes(t))
  )
    return 'ADDRESS';
  if (r.types.includes('route')) return 'STREET';
  if (r.types.some((t) => ['locality', 'administrative_area_level_1', 'administrative_area_level_2'].includes(t))) return 'TOWN';
  return 'AREA';
}
