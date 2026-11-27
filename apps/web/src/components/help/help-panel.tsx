'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CircleHelp, Search, X } from 'lucide-react';
import { helpPhrase, helpSegments, helpTopicText, searchHelpTopics, type HelpLocale, type HelpSources, type HelpTopicDef } from '@care-platform/shared';
import { FONT_CLASSES, useTranslation } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { useHelp } from '@/help/help-context';
import { Callout, HelpDiagramView } from './help-diagram';

/** Each language named in itself, so a reader who cannot read the current one still finds theirs. */
const LANGUAGE_NAMES: Record<HelpLocale, string> = { en: 'English', si: 'සිංහල', ta: 'தமிழ்' };

/** Step text with the app's labels shown the way they look on screen. */
function RichText({ text, sources, locale }: { text: string; sources: HelpSources; locale: HelpLocale }) {
  return (
    <>
      {helpSegments(sources, locale, text).map((s, i) =>
        s.kind === 'ui' ? (
          <strong key={i} className="whitespace-nowrap rounded bg-paper px-1 py-px font-semibold text-ink ring-1 ring-border">
            {s.text}
          </strong>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function TopicLink({ def, onOpen, sources, locale }: { def: HelpTopicDef; onOpen: (id: string) => void; sources: HelpSources; locale: HelpLocale }) {
  const text = helpTopicText(sources, locale, def);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(def.id)}
        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-left hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="block text-sm font-medium text-ink">{text.title}</span>
        <span className="mt-0.5 block text-xs text-ink/60">{text.summary}</span>
      </button>
    </li>
  );
}

function TopicView({ def, onOpen, sources, locale }: { def: HelpTopicDef; onOpen: (id: string) => void; sources: HelpSources; locale: HelpLocale }) {
  const { topic } = useHelp();
  const text = helpTopicText(sources, locale, def);
  const p = (k: string) => helpPhrase(sources, locale, `ui.${k}`);
  const related = (def.related ?? []).map((id) => topic(id)).filter((d): d is HelpTopicDef => Boolean(d));
  const hasCallout = (n: number) => JSON.stringify(def.diagram ?? {}).includes(`"callout":${n}`);
  return (
    <article className="space-y-5">
      <header>
        <h2 className="text-lg font-semibold text-ink">{text.title}</h2>
        <p className="mt-1 text-sm text-ink/70">{text.summary}</p>
      </header>
      <HelpDiagramView def={def} sources={sources} locale={locale} />
      <section aria-labelledby="help-steps">
        <h3 id="help-steps" className="mb-2 text-sm font-semibold text-ink">
          {p('steps')}
        </h3>
        <ol className="space-y-3">
          {text.steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink">
              {hasCallout(i + 1) ? (
                <Callout n={i + 1} className="mt-0.5 ring-0" />
              ) : (
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-paper text-[11px] font-bold text-ink/70"
                >
                  {i + 1}
                </span>
              )}
              <span className="min-w-0">
                <span className="sr-only">{p('step').replace('{n}', String(i + 1))}: </span>
                <RichText text={s} sources={sources} locale={locale} />
              </span>
            </li>
          ))}
        </ol>
      </section>
      {text.tips.length ? (
        <section aria-labelledby="help-tips" className="rounded-lg bg-accent-light/60 p-3">
          <h3 id="help-tips" className="mb-1.5 text-sm font-semibold text-ink">
            {p('tips')}
          </h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            {text.tips.map((tip, i) => (
              <li key={i}>
                <RichText text={tip} sources={sources} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {related.length ? (
        <section aria-labelledby="help-related">
          <h3 id="help-related" className="mb-2 text-sm font-semibold text-ink">
            {p('related')}
          </h3>
          <ul className="space-y-2">
            {related.map((r) => (
              <TopicLink key={r.id} def={r} onOpen={onOpen} sources={sources} locale={locale} />
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

/**
 * The help, as a panel down the right of every staff page. Opened by a ?
 * beside a heading (straight on that task's topic) or by Help in the top bar
 * (the topics for this page, then every topic). It has its own language
 * switch: reading the help in Tamil leaves the app in English.
 */
export function HelpPanel() {
  const { availableLocales } = useTranslation();
  const { open, topicId, locale, setLocale, show, close, topics, pageTopics, topic, sources } = useHelp();
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const p = (k: string) => helpPhrase(sources, locale, `ui.${k}`);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHistory([]);
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    const body = panelRef.current?.querySelector('[data-help-body]');
    if (body) body.scrollTop = 0;
  }, [topicId, query]);

  const results = useMemo(() => (query.trim() ? searchHelpTopics(sources, locale, topics, query) : []), [sources, locale, topics, query]);
  const current = topicId ? topic(topicId) : undefined;

  const openTopic = (id: string) => {
    if (topicId) setHistory((h) => [...h, topicId]);
    setQuery('');
    show(id);
  };
  const back = () => {
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setQuery('');
    show(prev ?? null);
  };

  if (!open) return null;

  const areas = [...new Set(topics.map((t) => t.area))];
  const offered = availableLocales.length ? availableLocales : (['en', 'si', 'ta'] as HelpLocale[]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/20 print:hidden lg:hidden" onClick={close} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="help-panel-title"
        lang={locale}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-white shadow-xl print:hidden',
          FONT_CLASSES[locale],
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          {current || query ? (
            <button
              type="button"
              onClick={back}
              className="flex h-8 w-8 items-center justify-center rounded text-ink/60 hover:bg-paper hover:text-ink"
              aria-label={p('back')}
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <CircleHelp size={20} className="text-brand" aria-hidden />
          )}
          <h2 id="help-panel-title" className="flex-1 text-base font-semibold text-ink">
            {p('title')}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            className="flex h-8 w-8 items-center justify-center rounded text-ink/60 hover:bg-paper hover:text-ink"
            aria-label={p('close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 border-b border-border px-4 py-3">
          {offered.length > 1 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink/60">{p('language')}</span>
              <div className="flex overflow-hidden rounded border border-border" role="group" aria-label={p('language')}>
                {offered.map((code) => (
                  <button
                    key={code}
                    type="button"
                    lang={code}
                    onClick={() => setLocale(code)}
                    aria-pressed={locale === code}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium',
                      FONT_CLASSES[code],
                      locale === code ? 'bg-brand text-white' : 'bg-white text-ink/70 hover:bg-paper',
                    )}
                  >
                    {LANGUAGE_NAMES[code]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <label className="relative block">
            <span className="sr-only">{p('search')}</span>
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={p('search')}
              className="h-9 w-full rounded border border-border bg-white pl-8 pr-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </label>
        </div>

        <div data-help-body className="flex-1 overflow-y-auto px-4 py-4">
          {query.trim() ? (
            results.length ? (
              <ul className="space-y-2" aria-label={p('results')}>
                {results.map((d) => (
                  <TopicLink key={d.id} def={d} onOpen={openTopic} sources={sources} locale={locale} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink/60">{p('noResults')}</p>
            )
          ) : current ? (
            <TopicView def={current} onOpen={openTopic} sources={sources} locale={locale} />
          ) : (
            <div className="space-y-6">
              {pageTopics.length ? (
                <section aria-labelledby="help-this-page">
                  <h3 id="help-this-page" className="mb-2 text-sm font-semibold text-ink">
                    {p('thisPage')}
                  </h3>
                  <ul className="space-y-2">
                    {pageTopics.map((d) => (
                      <TopicLink key={d.id} def={d} onOpen={openTopic} sources={sources} locale={locale} />
                    ))}
                  </ul>
                </section>
              ) : null}
              {areas.map((area) => (
                <section key={area} aria-labelledby={`help-area-${area}`}>
                  <h3 id={`help-area-${area}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">
                    {helpPhrase(sources, locale, `areas.${area}`)}
                  </h3>
                  <ul className="space-y-2">
                    {topics
                      .filter((t) => t.area === area)
                      .map((d) => (
                        <TopicLink key={d.id} def={d} onOpen={openTopic} sources={sources} locale={locale} />
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
