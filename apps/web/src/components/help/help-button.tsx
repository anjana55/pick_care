'use client';

import { CircleHelp } from 'lucide-react';
import { helpPhrase, helpTopicText } from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { useOptionalHelp } from '@/help/help-context';

/**
 * The small ? beside a heading or a form: opens the help on the topic about
 * that task. Named for screen readers in the app's language ("Help: Handle a
 * care request"). Renders nothing for a reader the topic isn't for.
 */
export function HelpHint({ topic, className }: { topic: string; className?: string }) {
  const help = useOptionalHelp();
  const { locale } = useTranslation();
  const def = help?.topic(topic);
  if (!help || !def) return null;
  const title = helpTopicText(help.sources, locale, def).title;
  const label = helpPhrase(help.sources, locale, 'ui.openTopic').replace('{title}', title);
  return (
    <button
      type="button"
      onClick={() => help.show(topic)}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full align-middle text-ink/40 transition-colors hover:bg-brand-light hover:text-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      <CircleHelp size={17} aria-hidden />
    </button>
  );
}

/** Help in the top bar: this page's topics first, then every topic. */
export function HelpTopbarButton() {
  const help = useOptionalHelp();
  const { locale } = useTranslation();
  if (!help) return null;
  const label = helpPhrase(help.sources, locale, 'ui.title');
  return (
    <button
      type="button"
      onClick={() => help.show()}
      aria-haspopup="dialog"
      aria-expanded={help.open}
      className="flex h-9 items-center gap-1.5 rounded px-2 text-sm text-ink/70 hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <CircleHelp size={18} aria-hidden />
      <span className="sr-only lg:not-sr-only">{label}</span>
    </button>
  );
}
