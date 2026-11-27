'use client';

import type { ReactNode } from 'react';
import {
  helpDiagramText,
  helpUi,
  type HelpBlock,
  type HelpButtonVariant,
  type HelpLocale,
  type HelpSources,
  type HelpText,
  type HelpTopicDef,
} from '@care-platform/shared';
import { cn } from '@/lib/utils';

/** The staff menu as pictured: the main items, in the order the sidebar shows them. */
const STAFF_MENU = [
  'nav.dashboard',
  'nav.requests',
  'nav.bookings',
  'nav.peopleWaiting',
  'nav.caregivers',
  'nav.clients',
  'nav.reviews',
  'nav.invoices',
  'nav.payouts',
  'nav.recruitment',
  'nav.announcements',
  'nav.settings',
];

interface Ctx {
  sources: HelpSources;
  locale: HelpLocale;
  def: HelpTopicDef;
}

/** A numbered marker matching a step, in the accent colour. */
export function Callout({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold leading-none text-white ring-2 ring-white',
        className,
      )}
    >
      {n}
    </span>
  );
}

function Words({ text, ctx, className }: { text: HelpText; ctx: Ctx; className?: string }) {
  const words = helpDiagramText(ctx.sources, ctx.locale, ctx.def, text);
  if (words === null) {
    const width = 'placeholder' in text ? { short: 'w-12', medium: 'w-24', long: 'w-40' }[text.placeholder] : 'w-24';
    return <span aria-hidden className={cn('inline-block h-2 rounded bg-ink/15 align-middle', width, className)} />;
  }
  return <span className={className}>{words}</span>;
}

const BUTTON: Record<HelpButtonVariant, string> = {
  primary: 'bg-brand text-white',
  secondary: 'border border-border bg-white text-ink',
  danger: 'bg-danger text-white',
  link: 'text-brand-dark underline',
};

function Marked({ callout, children, className }: { callout?: number; children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {callout ? <Callout n={callout} className="absolute -right-2 -top-2" /> : null}
    </div>
  );
}

function Block({ block, ctx }: { block: HelpBlock; ctx: Ctx }) {
  switch (block.kind) {
    case 'title':
      return (
        <Marked callout={block.callout}>
          <Words text={block.text} ctx={ctx} className="text-[13px] font-semibold text-ink" />
        </Marked>
      );
    case 'text':
      return (
        <Marked callout={block.callout} className="space-y-1">
          {block.text ? <Words text={block.text} ctx={ctx} className="text-[11px] text-ink/60" /> : null}
          {Array.from({ length: block.lines ?? (block.text ? 0 : 2) }, (_, i) => (
            <span key={i} aria-hidden className={cn('block h-1.5 rounded bg-ink/10', i % 2 ? 'w-2/3' : 'w-full')} />
          ))}
        </Marked>
      );
    case 'button':
      return (
        <Marked callout={block.callout} className="inline-block">
          <span className={cn('inline-flex rounded px-2 py-1 text-[11px] font-medium', BUTTON[block.variant ?? 'primary'])}>
            <Words text={block.text} ctx={ctx} />
          </span>
        </Marked>
      );
    case 'buttons':
      return (
        <Marked callout={block.callout} className="flex flex-wrap gap-2">
          {block.items.map((b, i) => (
            <Marked key={i} callout={b.callout} className="inline-block">
              <span className={cn('inline-flex rounded px-2 py-1 text-[11px] font-medium', BUTTON[b.variant ?? 'secondary'])}>
                <Words text={b.text} ctx={ctx} />
              </span>
            </Marked>
          ))}
        </Marked>
      );
    case 'field':
      return (
        <Marked callout={block.callout}>
          <Words text={block.text} ctx={ctx} className="mb-0.5 block text-[10px] font-medium text-ink/70" />
          <span className="flex h-6 items-center justify-between rounded border border-border bg-white px-1.5 text-[11px] text-ink/70">
            {block.value ? <Words text={block.value} ctx={ctx} /> : <span aria-hidden className="h-1.5 w-16 rounded bg-ink/10" />}
            {block.select ? <span aria-hidden>▾</span> : null}
          </span>
        </Marked>
      );
    case 'search':
      return (
        <Marked callout={block.callout}>
          <span className="flex h-6 items-center gap-1 rounded border border-border bg-white px-1.5 text-[11px] text-ink/50">
            <span aria-hidden>⌕</span>
            <Words text={block.text} ctx={ctx} className="truncate" />
          </span>
        </Marked>
      );
    case 'tabs':
      return (
        <Marked callout={block.callout} className="flex flex-wrap gap-x-3 gap-y-1 border-b border-border text-[11px]">
          {block.items.map((t, i) => (
            <span key={i} className={cn('-mb-px pb-1', i === (block.active ?? 0) ? 'border-b-2 border-brand font-semibold text-brand-dark' : 'text-ink/60')}>
              <Words text={t} ctx={ctx} />
            </span>
          ))}
        </Marked>
      );
    case 'list':
      return (
        <Marked callout={block.callout} className="overflow-hidden rounded border border-border bg-white">
          {block.columns?.length ? (
            <div className="flex gap-2 border-b border-border bg-paper px-2 py-1 text-[10px] font-medium text-ink/60">
              {block.columns.map((c, i) => (
                <Words key={i} text={c} ctx={ctx} className="flex-1 truncate" />
              ))}
            </div>
          ) : null}
          {Array.from({ length: block.rows }, (_, i) => (
            <div key={i} className="flex items-center gap-2 border-b border-border px-2 py-1.5 last:border-0">
              <span aria-hidden className="h-1.5 flex-1 rounded bg-ink/10" />
              <span aria-hidden className="h-1.5 w-10 rounded bg-ink/10" />
              {block.badge && i === 0 ? (
                <span className="rounded bg-brand-light px-1.5 text-[10px] text-brand-dark">
                  <Words text={block.badge} ctx={ctx} />
                </span>
              ) : null}
            </div>
          ))}
        </Marked>
      );
    case 'card':
      return (
        <Marked callout={block.callout} className={cn('space-y-2 rounded border bg-white p-2', block.highlight ? 'border-brand' : 'border-border')}>
          {block.title ? <Words text={block.title} ctx={ctx} className="block text-[12px] font-semibold text-ink" /> : null}
          {block.children.map((b, i) => (
            <Block key={i} block={b} ctx={ctx} />
          ))}
        </Marked>
      );
    case 'row':
      return (
        <Marked callout={block.callout} className="flex flex-wrap items-start gap-2 [&>*]:min-w-0 [&>*]:flex-1">
          {block.children.map((b, i) => (
            <Block key={i} block={b} ctx={ctx} />
          ))}
        </Marked>
      );
    case 'checklist':
      return (
        <Marked callout={block.callout} className="space-y-1">
          {block.items.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] text-ink">
              <span
                aria-hidden
                className={cn(
                  'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border text-[9px] text-white',
                  item.state === 'done' ? 'border-brand bg-brand' : item.state === 'notDone' ? 'border-danger bg-danger' : 'border-border bg-white',
                )}
              >
                {item.state === 'done' ? '✓' : item.state === 'notDone' ? '✕' : ''}
              </span>
              <Words text={item.text} ctx={ctx} />
            </div>
          ))}
        </Marked>
      );
    case 'stars':
      return (
        <Marked callout={block.callout} className="text-sm tracking-wider text-accent" aria-hidden>
          {'★'.repeat(block.filled)}
          <span className="text-ink/20">{'★'.repeat(5 - block.filled)}</span>
        </Marked>
      );
    case 'badge':
      return (
        <Marked callout={block.callout} className="inline-block">
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-medium',
              block.tone === 'accent' ? 'bg-accent-light text-accent-dark' : block.tone === 'muted' ? 'bg-paper text-ink/60' : 'bg-brand-light text-brand-dark',
            )}
          >
            <Words text={block.text} ctx={ctx} />
          </span>
        </Marked>
      );
    case 'map':
      return (
        <Marked callout={block.callout}>
          <div aria-hidden className="relative h-16 overflow-hidden rounded border border-border bg-brand-light/60">
            <span className="absolute left-1/3 top-1/3 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-white" />
            <span className="absolute left-2/3 top-1/2 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-white" />
          </div>
        </Marked>
      );
  }
}

/**
 * The topic's screen, drawn from its description in topics.ts: the real
 * labels in the help's language, the brand's colours, and numbered markers
 * that match the steps underneath. Decorative for screen readers - the steps
 * say everything the picture shows.
 */
export function HelpDiagramView({ def, sources, locale }: { def: HelpTopicDef; sources: HelpSources; locale: HelpLocale }) {
  const d = def.diagram;
  if (!d) return null;
  const ctx: Ctx = { sources, locale, def };
  const body = (
    <div className="min-w-0 flex-1 space-y-2.5 p-3">
      {d.heading ? <Words text={d.heading} ctx={ctx} className="block text-[13px] font-semibold text-ink" /> : null}
      {d.blocks.map((b, i) => (
        <Block key={i} block={b} ctx={ctx} />
      ))}
    </div>
  );
  return (
    <figure aria-hidden className="overflow-hidden rounded-lg border border-border bg-paper shadow-sm">
      <div className="flex items-center gap-1 border-b border-border bg-white px-2 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-ink/20" />
        <span className="h-1.5 w-1.5 rounded-full bg-ink/20" />
        <span className="h-1.5 w-1.5 rounded-full bg-ink/20" />
      </div>
      <div className="flex">
        {d.frame === 'staff' ? (
          <div className="w-24 shrink-0 space-y-0.5 border-r border-border bg-white p-1.5">
            {STAFF_MENU.map((key) => (
              <span
                key={key}
                className={cn('block truncate rounded px-1 py-0.5 text-[9px]', key === d.nav ? 'bg-brand font-semibold text-white' : 'text-ink/60')}
              >
                {helpUi(sources, locale, key)}
              </span>
            ))}
          </div>
        ) : null}
        {body}
      </div>
    </figure>
  );
}
