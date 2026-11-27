import { LOCALES, type Locale } from './locale';

/**
 * In-app help: the engine shared by the staff app and the mobile app.
 *
 * A topic explains one business task ("Handle a care request"). Each app keeps
 * its topics in two parts:
 *
 * - `topics.ts`: what does not depend on the language - which screens a topic
 *   belongs to (`contexts`), who it is for (`audiences`), how many steps and
 *   tips it has, and the illustrated diagram of the screen.
 * - `help/{en,si,ta}.json`: the words, in the same shape as the app's own
 *   dictionaries, so translators work on them the same way.
 *
 * Step text can quote the app's own labels with `[[ui:some.key]]`: the help
 * shows that key's text from the app's dictionary in the help's language, so
 * a button named in the help always reads exactly like the button on screen,
 * in every language, and changes with it. `{brand}` is the company name.
 */

export type HelpLocale = Locale;

/** Who a topic is for. The staff roles come from the account; GUEST is anyone not signed in. */
export const HELP_AUDIENCES = ['ADMIN', 'STAFF', 'VERIFIER', 'CAREGIVER', 'CLIENT', 'GUEST'] as const;
export type HelpAudience = (typeof HELP_AUDIENCES)[number];

/** Text in a diagram: an app label (`ui`), a label of the topic's own (`label`), or a grey placeholder bar. */
export type HelpText = { ui: string } | { label: string } | { placeholder: 'short' | 'medium' | 'long' };

export type HelpButtonVariant = 'primary' | 'secondary' | 'danger' | 'link';

/**
 * One piece of a pictured screen. `callout` puts a numbered marker on it: the
 * number of the step that uses it.
 */
export type HelpBlock = { callout?: number } & (
  | { kind: 'title'; text: HelpText }
  | { kind: 'text'; text?: HelpText; lines?: number }
  | { kind: 'button'; text: HelpText; variant?: HelpButtonVariant }
  | { kind: 'buttons'; items: { text: HelpText; variant?: HelpButtonVariant; callout?: number }[] }
  | { kind: 'field'; text: HelpText; value?: HelpText; select?: boolean }
  | { kind: 'search'; text: HelpText }
  | { kind: 'tabs'; items: HelpText[]; active?: number }
  | { kind: 'list'; rows: number; columns?: HelpText[]; badge?: HelpText }
  | { kind: 'card'; title?: HelpText; children: HelpBlock[]; highlight?: boolean }
  | { kind: 'row'; children: HelpBlock[] }
  | { kind: 'checklist'; items: { text: HelpText; state: 'done' | 'notDone' | 'open' }[] }
  | { kind: 'stars'; filled: number }
  | { kind: 'badge'; text: HelpText; tone?: 'brand' | 'accent' | 'muted' }
  | { kind: 'map' }
);

/**
 * A simplified drawing of a screen.
 * - `staff`: the staff app, with its left menu; `nav` is the menu item to show as open.
 * - `phone`: the mobile app, with its coloured header; `tab` is the bottom tab to show as open.
 */
export interface HelpDiagram {
  frame: 'staff' | 'phone';
  /** staff: the menu item's label key (`nav.requests`). */
  nav?: string;
  /** phone: the bottom tabs' label keys, and which one is open. */
  tabs?: string[];
  tab?: number;
  /** The screen's heading (phone: in the coloured band). */
  heading?: HelpText;
  blocks: HelpBlock[];
}

export interface HelpTopicDef {
  /** Lowercase words joined by hyphens: `handle-request`. Also the key of its text. */
  id: string;
  /** The group it is listed under (`areas.<area>` in the help dictionary). */
  area: string;
  audiences: readonly HelpAudience[];
  /**
   * The screens it explains, as route patterns: `/requests`, `/requests/[id]`.
   * `[name]` matches one path segment, a trailing `/*` any number.
   */
  contexts: readonly string[];
  /** How many steps and tips the text has (`steps.1` … `steps.n`). */
  steps: number;
  tips?: number;
  diagram?: HelpDiagram;
  related?: readonly string[];
}

export type HelpDictionary = Record<string, unknown>;

/** What a topic says in one language, with `[[ui:…]]` and `{brand}` still in place. */
export interface HelpTopicText {
  title: string;
  summary: string;
  steps: string[];
  tips: string[];
}

/** A piece of step text: plain words, or an app label to show as on screen. */
export type HelpSegment = { kind: 'text'; text: string } | { kind: 'ui'; text: string };

function lookup(dict: HelpDictionary, path: string): unknown {
  let cur: unknown = dict;
  for (const part of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** A string at a dotted path, or undefined. Topic ids contain no dots, so `topics.<id>.title` is safe. */
export function helpString(dict: HelpDictionary, path: string): string | undefined {
  const v = lookup(dict, path);
  return typeof v === 'string' ? v : undefined;
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? vars[name] : m));
}

export interface HelpSources {
  /** The help text, per language. */
  help: Record<HelpLocale, HelpDictionary>;
  /** The app's own dictionaries, per language, for `[[ui:…]]` and `{ ui }`. */
  app: Record<HelpLocale, HelpDictionary>;
  /** `{brand}` and any other placeholder every string may use. */
  vars: Record<string, string>;
}

/** An app label in a language, falling back to English, then to the key itself. */
export function helpUi(sources: HelpSources, locale: HelpLocale, key: string): string {
  const s = helpString(sources.app[locale], key) ?? helpString(sources.app.en, key) ?? key;
  return fill(s, sources.vars);
}

/** One help string in a language, falling back to English. */
export function helpPhrase(sources: HelpSources, locale: HelpLocale, path: string): string {
  const s = helpString(sources.help[locale], path) ?? helpString(sources.help.en, path) ?? '';
  return fill(s, sources.vars);
}

const UI_TOKEN = /\[\[ui:([A-Za-z0-9_.]+)\]\]/g;

/** Step text split into words and quoted app labels, ready to render. */
export function helpSegments(sources: HelpSources, locale: HelpLocale, text: string): HelpSegment[] {
  const out: HelpSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(UI_TOKEN)) {
    if (m.index! > last) out.push({ kind: 'text', text: fill(text.slice(last, m.index), sources.vars) });
    out.push({ kind: 'ui', text: helpUi(sources, locale, m[1]) });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: fill(text.slice(last), sources.vars) });
  return out;
}

/** Step text as plain words (for search, and for screen readers' summaries). */
export function helpPlain(sources: HelpSources, locale: HelpLocale, text: string): string {
  return helpSegments(sources, locale, text)
    .map((s) => s.text)
    .join('');
}

/** A topic's words in one language; a missing translation falls back to English, string by string. */
export function helpTopicText(sources: HelpSources, locale: HelpLocale, def: HelpTopicDef): HelpTopicText {
  const base = `topics.${def.id}`;
  const many = (kind: 'steps' | 'tips', n: number) => Array.from({ length: n }, (_, i) => helpPhrase(sources, locale, `${base}.${kind}.${i + 1}`));
  return {
    title: helpPhrase(sources, locale, `${base}.title`),
    summary: helpPhrase(sources, locale, `${base}.summary`),
    steps: many('steps', def.steps),
    tips: many('tips', def.tips ?? 0),
  };
}

/** Text shown in a diagram. Placeholders have no words. */
export function helpDiagramText(sources: HelpSources, locale: HelpLocale, def: HelpTopicDef, text: HelpText): string | null {
  if ('ui' in text) return helpUi(sources, locale, text.ui);
  if ('label' in text) return helpPhrase(sources, locale, `topics.${def.id}.labels.${text.label}`);
  return null;
}

function patternMatches(pattern: string, path: string): boolean {
  const clean = (p: string) => p.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  const want = clean(pattern).split('/');
  const have = clean(path).split('/');
  for (let i = 0; i < want.length; i++) {
    if (want[i] === '*' && i === want.length - 1) return true;
    if (i >= have.length) return false;
    if (/^\[[^\]]+\]$/.test(want[i])) {
      if (!have[i]) return false;
      continue;
    }
    if (want[i] !== have[i]) return false;
  }
  return want.length === have.length;
}

/** Whether a route pattern matches a path: `/requests/[id]` matches `/requests/abc`. */
export function helpContextMatches(pattern: string, path: string): boolean {
  return patternMatches(pattern, path);
}

/** Topics for this audience, in the order they are defined. */
export function helpTopicsFor(defs: readonly HelpTopicDef[], audience: HelpAudience): HelpTopicDef[] {
  return defs.filter((d) => d.audiences.includes(audience));
}

/**
 * The topics about the screen at `path`, for this audience. Topics that name
 * the screen exactly come before ones that cover it with a pattern.
 */
export function helpTopicsForPath(defs: readonly HelpTopicDef[], path: string, audience: HelpAudience): HelpTopicDef[] {
  const score = (d: HelpTopicDef) => {
    let best = -1;
    for (const c of d.contexts) {
      if (!patternMatches(c, path)) continue;
      const exact = !/\[|\*/.test(c);
      best = Math.max(best, (exact ? 1000 : 0) + c.split('/').length);
    }
    return best;
  };
  return helpTopicsFor(defs, audience)
    .map((d, i) => ({ d, i, s: score(d) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.d);
}

/** Topics whose words, in this language, contain every word of the query. */
export function searchHelpTopics(sources: HelpSources, locale: HelpLocale, defs: readonly HelpTopicDef[], query: string): HelpTopicDef[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored = defs.map((d) => {
    const t = helpTopicText(sources, locale, d);
    const title = helpPlain(sources, locale, t.title).toLocaleLowerCase();
    const body = [t.summary, ...t.steps, ...t.tips]
      .map((s) => helpPlain(sources, locale, s))
      .join(' ')
      .toLocaleLowerCase();
    const all = `${title} ${body}`;
    if (!words.every((w) => all.includes(w))) return null;
    return { d, s: words.filter((w) => title.includes(w)).length };
  });
  return scored
    .filter((x): x is { d: HelpTopicDef; s: number } => x !== null)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.d);
}

function blockTexts(block: HelpBlock): HelpText[] {
  switch (block.kind) {
    case 'title':
    case 'button':
    case 'search':
    case 'badge':
      return [block.text];
    case 'text':
      return block.text ? [block.text] : [];
    case 'field':
      return block.value ? [block.text, block.value] : [block.text];
    case 'buttons':
      return block.items.map((i) => i.text);
    case 'tabs':
      return block.items;
    case 'list':
      return [...(block.columns ?? []), ...(block.badge ? [block.badge] : [])];
    case 'card':
      return [...(block.title ? [block.title] : []), ...block.children.flatMap(blockTexts)];
    case 'row':
      return block.children.flatMap(blockTexts);
    case 'checklist':
      return block.items.map((i) => i.text);
    default:
      return [];
  }
}

function blockCallouts(block: HelpBlock): number[] {
  const own = block.callout ? [block.callout] : [];
  if (block.kind === 'card' || block.kind === 'row') return [...own, ...block.children.flatMap(blockCallouts)];
  if (block.kind === 'buttons') return [...own, ...block.items.flatMap((i) => (i.callout ? [i.callout] : []))];
  return own;
}

/** Every callout number a diagram shows. */
export function helpDiagramCallouts(diagram: HelpDiagram): number[] {
  return diagram.blocks.flatMap(blockCallouts);
}

/**
 * Everything that would show wrong: missing or extra words in a language, app
 * labels that do not exist, callouts with no step, unknown related topics.
 * Each app's tests run this over its own topics and fail on any problem.
 */
export function checkHelp(defs: readonly HelpTopicDef[], sources: Omit<HelpSources, 'vars'>): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const uiKeys = new Set<string>();
  for (const d of defs) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.id)) problems.push(`${d.id}: the id must be lowercase words joined by hyphens`);
    if (ids.has(d.id)) problems.push(`${d.id}: defined twice`);
    ids.add(d.id);
    if (!d.audiences.length) problems.push(`${d.id}: no audience`);
    if (!d.contexts.length) problems.push(`${d.id}: no screen (contexts)`);
    if (d.steps < 1) problems.push(`${d.id}: no steps`);
    for (const locale of LOCALES) {
      const base = `topics.${d.id}`;
      const need = [
        'title',
        'summary',
        ...Array.from({ length: d.steps }, (_, i) => `steps.${i + 1}`),
        ...Array.from({ length: d.tips ?? 0 }, (_, i) => `tips.${i + 1}`),
      ];
      for (const k of need) if (!helpString(sources.help[locale], `${base}.${k}`)?.trim()) problems.push(`${d.id}: ${locale} has no ${k}`);
      for (const kind of ['steps', 'tips'] as const) {
        const have = lookup(sources.help[locale], `${base}.${kind}`);
        const count = have && typeof have === 'object' ? Object.keys(have).length : 0;
        const want = kind === 'steps' ? d.steps : (d.tips ?? 0);
        if (count !== want) problems.push(`${d.id}: ${locale} has ${count} ${kind}, the topic defines ${want}`);
      }
      const texts = [helpString(sources.help[locale], `${base}.title`), helpString(sources.help[locale], `${base}.summary`)];
      for (let i = 1; i <= d.steps; i++) texts.push(helpString(sources.help[locale], `${base}.steps.${i}`));
      for (let i = 1; i <= (d.tips ?? 0); i++) texts.push(helpString(sources.help[locale], `${base}.tips.${i}`));
      for (const t of texts) for (const m of (t ?? '').matchAll(UI_TOKEN)) uiKeys.add(m[1]);
    }
    if (d.diagram) {
      for (const c of helpDiagramCallouts(d.diagram)) if (c < 1 || c > d.steps) problems.push(`${d.id}: callout ${c} has no step`);
      const texts = d.diagram.blocks.flatMap(blockTexts);
      if (d.diagram.heading) texts.push(d.diagram.heading);
      for (const k of [d.diagram.nav, ...(d.diagram.tabs ?? [])]) if (k) uiKeys.add(k);
      for (const t of texts) {
        if ('ui' in t) uiKeys.add(t.ui);
        if ('label' in t)
          for (const locale of LOCALES)
            if (!helpString(sources.help[locale], `topics.${d.id}.labels.${t.label}`)) problems.push(`${d.id}: ${locale} has no label ${t.label}`);
      }
    }
  }
  for (const d of defs) for (const r of d.related ?? []) if (!ids.has(r)) problems.push(`${d.id}: related topic ${r} does not exist`);
  for (const k of uiKeys) for (const locale of LOCALES) if (!helpString(sources.app[locale], k)) problems.push(`app label ${k} is missing in ${locale}`);
  for (const locale of LOCALES) {
    const topics = lookup(sources.help[locale], 'topics');
    for (const id of Object.keys((topics as Record<string, unknown>) ?? {})) if (!ids.has(id)) problems.push(`${locale} has words for an unknown topic ${id}`);
  }
  return [...new Set(problems)];
}
