import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { checkHelp, helpContextMatches, helpTopicsForPath, HELP_AUDIENCES } from '@care-platform/shared';
import { HELP_DICTIONARIES, HELP_TOPICS } from '@/help/topics';
import { DICTIONARIES } from '@/lib/i18n/provider';

/** Every page route in the staff app, as Next names it: /bookings/[id]. */
function routes(dir = join(__dirname, '..', 'app'), prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      // Route groups such as (app) are not part of the URL.
      const segment = /^\(.*\)$/.test(name) ? '' : `/${name}`;
      return routes(path, prefix + segment);
    }
    return name === 'page.tsx' ? [prefix || '/'] : [];
  });
}

function sources(dir = join(__dirname, '..')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [readFileSync(path, 'utf8')] : [];
  });
}

describe('staff help content', () => {
  it('has every word in every language, and quotes only labels the app has', () => {
    expect(checkHelp(HELP_TOPICS, { help: HELP_DICTIONARIES, app: DICTIONARIES })).toEqual([]);
  });

  it('names only screens that exist', () => {
    const all = routes();
    const unknown = HELP_TOPICS.flatMap((t) => t.contexts.filter((c) => !all.some((r) => r === c || helpContextMatches(c, r))).map((c) => `${t.id}: ${c}`));
    expect(unknown).toEqual([]);
  });

  it('uses only the audiences the help knows', () => {
    for (const t of HELP_TOPICS) for (const a of t.audiences) expect(HELP_AUDIENCES).toContain(a);
  });

  it('points every ? at a topic that exists', () => {
    const ids = new Set(HELP_TOPICS.map((t) => t.id));
    const used = sources().flatMap((src) => [...src.matchAll(/<HelpHint\s+topic="([^"]+)"/g)].map((m) => m[1]));
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('has help for the main working pages', () => {
    for (const path of [
      '/dashboard',
      '/requests',
      '/requests/abc',
      '/bookings/new',
      '/bookings/abc',
      '/bookings/today',
      '/caregivers/abc',
      '/clients',
      '/invoices/abc',
      '/payouts',
    ]) {
      expect(helpTopicsForPath(HELP_TOPICS, path, 'STAFF').length).toBeGreaterThan(0);
    }
  });

  it('writes Sinhala and Tamil, not copies of the English', () => {
    const flat = (o: unknown, p = ''): [string, string][] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v] as [string, string]] : flat(v, `${p}${k}.`)));
    const en = new Map(flat(HELP_DICTIONARIES.en));
    for (const locale of ['si', 'ta'] as const) {
      const copied = flat(HELP_DICTIONARIES[locale]).filter(([k, v]) => v === en.get(k) && /[a-z]{4}/i.test(v.replace(/\[\[ui:[^\]]+\]\]/g, '')));
      expect(copied.map(([k]) => k)).toEqual([]);
    }
  });
});
