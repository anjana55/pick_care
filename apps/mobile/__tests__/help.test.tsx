// @ts-nocheck - this test reads the app's route files with Node's fs and path; the app's tsconfig has no Node types (Jest runs it on Node).
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { checkHelp, helpContextMatches, helpTopicsForPath } from '@care-platform/shared';
import { HELP_DICTIONARIES, HELP_TOPICS } from '../src/help/topics';
import appEn from '../src/i18n/en.json';
import appSi from '../src/i18n/si.json';
import appTa from '../src/i18n/ta.json';
import en from '../src/help/en.json';
import si from '../src/help/si.json';
import ta from '../src/help/ta.json';
import { AppProviders, serveApi } from '../test-utils/app';
import { mockRouter } from '../test-utils/router';
import HelpScreen from '../app/help';
import { PageHeader } from '@/ui/PageHeader';

jest.mock('expo-router', () => require('../test-utils/router').expoRouterMock());

afterEach(async () => {
  await AsyncStorage.clear();
  mockRouter.reset();
});

/** Every screen's path as expo-router reports it: groups such as (client) left out, index as /. */
function routes(dir = join(__dirname, '..', 'app'), prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routes(path, /^\(.*\)$/.test(name) ? prefix : `${prefix}/${name}`);
    if (!name.endsWith('.tsx') || name.startsWith('_') || name.startsWith('+')) return [];
    const route = name.replace(/\.tsx$/, '');
    return [route === 'index' ? prefix || '/' : `${prefix}/${route}`];
  });
}

function sources(dir = join(__dirname, '..')): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (['node_modules', '__tests__', '.expo', 'test-utils'].includes(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [readFileSync(path, 'utf8')] : [];
  });
}

describe('mobile help content', () => {
  it('has every word in every language, and quotes only labels the app has', () => {
    expect(checkHelp(HELP_TOPICS, { help: HELP_DICTIONARIES, app: { en: appEn, si: appSi, ta: appTa } })).toEqual([]);
  });

  it('names only screens that exist', () => {
    const all = routes();
    const unknown = HELP_TOPICS.flatMap((t) => t.contexts.filter((c) => !all.some((r) => r === c || helpContextMatches(c, r))).map((c) => `${t.id}: ${c}`));
    expect(unknown).toEqual([]);
  });

  it('points every ? at a topic that exists', () => {
    const ids = new Set(HELP_TOPICS.map((t) => t.id));
    const used = sources().flatMap((src) => [...src.matchAll(/<Help(?:Hint|Link) topic="([^"]+)"/g)].map((m) => m[1]));
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('has help on the screens people use most', () => {
    for (const [path, who] of [
      ['/', 'GUEST'],
      ['/find', 'CLIENT'],
      ['/bookings', 'CLIENT'],
      ['/invoices', 'CLIENT'],
      ['/shifts', 'CAREGIVER'],
      ['/documents', 'CAREGIVER'],
      ['/offers', 'CAREGIVER'],
    ] as const) {
      expect(helpTopicsForPath(HELP_TOPICS, path, who).length).toBeGreaterThan(0);
    }
  });

  it('writes Sinhala and Tamil, not copies of the English', () => {
    const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v]] : flat(v, `${p}${k}.`)));
    const english = new Map(flat(en));
    for (const dict of [si, ta]) {
      const copied = flat(dict).filter(([k, v]) => v === english.get(k) && /[a-z]{4}/i.test(v.replace(/\[\[ui:[^\]]+\]\]/g, '')));
      expect(copied.map(([k]) => k)).toEqual([]);
    }
  });
});

describe('the help screen', () => {
  it("opens on the topic it was asked for, with its steps and the app's own button names", async () => {
    // Not signed in: the topics for visitors. (A caregiver's topics need a caregiver session.)
    mockRouter.params = { topic: 'find-caregiver', from: '/find' };
    serveApi({});
    await render(
      <AppProviders>
        <HelpScreen />
      </AppProviders>,
    );
    expect(await screen.findByRole('header', { name: en.topics['find-caregiver'].title })).toBeTruthy();
    expect(screen.getAllByText(appEn.care.contactCta, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByRole('header', { name: en.ui.steps })).toBeTruthy();
  });

  it('changes only its own language', async () => {
    mockRouter.params = { topic: 'get-started', from: '/' };
    serveApi({});
    await render(
      <AppProviders>
        <HelpScreen />
      </AppProviders>,
    );
    await screen.findByRole('header', { name: en.topics['get-started'].title });
    await fireEvent.press(screen.getByRole('radio', { name: 'தமிழ்' }));
    expect(await screen.findByRole('header', { name: ta.topics['get-started'].title })).toBeTruthy();
    // The header's Back button is still in the app's language.
    expect(screen.getByRole('button', { name: appEn.nav.back })).toBeTruthy();
    // The choice lasts while the app runs: the next help opens in Tamil too. Back to English for the other tests.
    await fireEvent.press(screen.getByRole('radio', { name: 'English' }));
  });

  it('lists the topics for the screen it was opened from, and finds others by words', async () => {
    mockRouter.params = { from: '/' };
    serveApi({});
    await render(
      <AppProviders>
        <HelpScreen />
      </AppProviders>,
    );
    // One topic for the welcome screen: it opens straight on it.
    expect(await screen.findByRole('header', { name: en.topics['get-started'].title })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(en.ui.search), 'caregiver profile');
    expect(await screen.findByRole('button', { name: en.topics['find-caregiver'].title })).toBeTruthy();
  });
});

describe('the ? in the header', () => {
  it('opens the help for the screen it is on', async () => {
    mockRouter.pathname = '/';
    serveApi({});
    await render(
      <AppProviders>
        <PageHeader title="Welcome" />
      </AppProviders>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: en.ui.open }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/help', params: { from: '/' } });
  });

  it('is left out where there is no help', async () => {
    mockRouter.pathname = '/location-test';
    serveApi({});
    await render(
      <AppProviders>
        <PageHeader title="Location test" />
      </AppProviders>,
    );
    await screen.findByText('Location test');
    expect(screen.queryByRole('button', { name: en.ui.open })).toBeNull();
  });
});
