import { ConfigService } from '@nestjs/config';
import { AddressSearchService, googlePrecision, nominatimPrecision } from './address-search.service';
import type { GeoService } from './geo.service';

const city = (id: number, en: string, si: string, ta: string, districtId: number, latitude: number, longitude: number) =>
  [id, { id, districtId, nameEn: en, nameSi: si, nameTa: ta, latitude, longitude }] as const;
const geo = {
  all: async () => ({
    cities: new Map([
      city(1, 'Kandy', 'මහනුවර', 'கண்டி', 10, 7.2906, 80.6337),
      city(2, 'Kandana', 'කඳාන', 'கந்தானை', 20, 7.048, 79.897),
      city(3, 'Nugegoda', 'නුගේගොඩ', 'நுகேகொடை', 30, 6.8649, 79.8997),
      city(4, 'Colombo 15', 'කොළඹ 15', 'கொழும்பு 15', 30, 6.959, 79.875),
    ]),
    districts: new Map([
      [10, { id: 10, nameEn: 'Kandy', nameSi: 'මහනුවර', nameTa: 'கண்டி', latitude: 0, longitude: 0 }],
      [20, { id: 20, nameEn: 'Gampaha', nameSi: 'ගම්පහ', nameTa: 'கம்பஹா', latitude: 0, longitude: 0 }],
      [30, { id: 30, nameEn: 'Colombo', nameSi: 'කොළඹ', nameTa: 'கொழும்பு', latitude: 0, longitude: 0 }],
    ]),
  }),
} as unknown as GeoService;

const service = (env: Record<string, string> = {}) => new AddressSearchService(geo, new ConfigService(env));
const reply = (body: unknown, ok = true) => jest.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch;

describe('AddressSearchService', () => {
  const realFetch = global.fetch;
  afterEach(() => (global.fetch = realFetch));

  it('finds towns by the start of their name, in any of the three languages', async () => {
    const s = service({ GEOCODER_PROVIDER: 'off' });
    expect((await s.search('Kand', 'en')).results.map((r) => r.label)).toEqual(['Kandana', 'Kandy']);
    expect((await s.search('Kandy', 'en')).results[0]).toMatchObject({ label: 'Kandy', detail: 'Kandy', precision: 'TOWN', source: 'TOWNS' });
    expect((await s.search('මහනු', 'si')).results[0]).toMatchObject({ label: 'මහනුවර', detail: 'මහනුවර' });
    expect((await s.search('நுகே', 'ta')).results[0].label).toBe('நுகேகொடை');
  });

  it('picks the town out of a typed address', async () => {
    const r = await service({ GEOCODER_PROVIDER: 'off' }).search('42 Temple Road, Nugegoda', 'en');
    expect(r.results[0]).toMatchObject({ label: 'Nugegoda', detail: 'Colombo', latitude: 6.8649, longitude: 79.8997 });
  });

  it('puts the map search first, keeps only Sri Lankan matches, and adds towns it did not give', async () => {
    global.fetch = reply([
      {
        lat: '6.8655',
        lon: '79.9001',
        display_name: '42, Temple Road, Nugegoda, Colombo District, Western Province, 10250, Sri Lanka',
        addresstype: 'house',
        address: { house_number: '42', road: 'Temple Road' },
      },
      { lat: '6.87', lon: '79.90', name: 'Temple Road', display_name: 'Temple Road, Nugegoda, Colombo District, Sri Lanka', addresstype: 'road' },
      { lat: '51.5', lon: '-0.1', display_name: 'Temple Road, London, UK', addresstype: 'road' },
    ]);
    const r = await service().search('42 Temple Road, Nugegoda', 'en');
    expect(r.mapSearchUnavailable).toBe(false);
    expect(r.results.map((m) => [m.label, m.precision, m.source])).toEqual([
      ['42 Temple Road', 'ADDRESS', 'MAP'],
      ['Temple Road', 'STREET', 'MAP'],
      ['Nugegoda', 'TOWN', 'TOWNS'],
    ]);
    expect(r.results[0].detail).toBe('Nugegoda, Colombo District, Western Province');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('https://nominatim.openstreetmap.org/search?');
    expect(url).toContain('countrycodes=lk');
    expect(init.headers['User-Agent']).toMatch(/^CarePlatform\/1\.0 \(/);
  });

  it('still answers with towns when the map search is down, and says so', async () => {
    global.fetch = reply({}, false);
    const r = await service().search('Kandy', 'en');
    expect(r.mapSearchUnavailable).toBe(true);
    expect(r.results[0].label).toBe('Kandy');
  });

  it('asks the map search once for the same words', async () => {
    global.fetch = reply([]);
    const s = service();
    await s.search('Galle Road', 'en');
    await s.search('  galle   road ', 'en');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('uses Google only when it is chosen and has a key', async () => {
    expect(service({ GEOCODER_PROVIDER: 'google' }).provider).toBe('nominatim');
    const s = service({ GEOCODER_PROVIDER: 'google', GEOCODER_GOOGLE_API_KEY: 'k' });
    expect(s.provider).toBe('google');
    global.fetch = reply({
      status: 'OK',
      results: [
        {
          formatted_address: '42 Temple Rd, Nugegoda 10250, Sri Lanka',
          geometry: { location: { lat: 6.8655, lng: 79.9001 }, location_type: 'ROOFTOP' },
          types: ['street_address'],
          address_components: [],
        },
      ],
    });
    const r = await s.search('42 Temple Road Nugegoda', 'en');
    expect(r.results[0]).toMatchObject({ label: '42 Temple Rd', detail: 'Nugegoda 10250', precision: 'ADDRESS', source: 'MAP' });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('components=country%3ALK');
  });

  it('reads how exact a match is', () => {
    expect(nominatimPrecision({ addresstype: 'road' })).toBe('STREET');
    expect(nominatimPrecision({ addresstype: 'suburb' })).toBe('AREA');
    expect(nominatimPrecision({ addresstype: 'town' })).toBe('TOWN');
    expect(nominatimPrecision({ addresstype: 'hospital', class: 'amenity' })).toBe('ADDRESS');
    expect(googlePrecision({ types: ['route'], geometry: { location: { lat: 0, lng: 0 }, location_type: 'GEOMETRIC_CENTER' } })).toBe('STREET');
    expect(googlePrecision({ types: ['locality'], geometry: { location: { lat: 0, lng: 0 }, location_type: 'APPROXIMATE' } })).toBe('TOWN');
  });
});
