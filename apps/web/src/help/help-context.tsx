'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { helpTopicsFor, helpTopicsForPath, type HelpAudience, type HelpLocale, type HelpSources, type HelpTopicDef } from '@care-platform/shared';
import { useAuth } from '@/lib/api/auth-context';
import { useBranding } from '@/lib/branding/provider';
import { DICTIONARIES, useTranslation } from '@/lib/i18n/provider';
import { HELP_DICTIONARIES, HELP_TOPICS } from './topics';

interface HelpState {
  /** Whether the panel is open. */
  open: boolean;
  /** The topic shown, or null for the list ("for this page" and every topic). */
  topicId: string | null;
  /** The help's own language. Starts as the app's; changing it here leaves the app alone. */
  locale: HelpLocale;
  setLocale: (locale: HelpLocale) => void;
  /**
   * Open the help on a topic; `null` opens the list. With nothing passed it
   * opens on this page's topic when there is exactly one, else the list.
   */
  show: (topicId?: string | null) => void;
  close: () => void;
  /** Topics this person may see, and those about the current page. */
  topics: HelpTopicDef[];
  pageTopics: HelpTopicDef[];
  topic: (id: string) => HelpTopicDef | undefined;
  sources: HelpSources;
}

const HelpContext = createContext<HelpState | null>(null);

/**
 * The help panel's state, for the whole staff app. The panel follows the
 * app's language until the reader picks another inside the help; from then
 * on (for this visit) the help stays in theirs and the app in its own.
 */
export function HelpProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { locale: appLocale } = useTranslation();
  const { companyName } = useBranding();
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<HelpLocale | null>(null);

  const audience: HelpAudience = (user?.role as HelpAudience | undefined) ?? 'STAFF';
  const topics = useMemo(() => helpTopicsFor(HELP_TOPICS, audience), [audience]);
  const pageTopics = useMemo(() => helpTopicsForPath(HELP_TOPICS, pathname, audience), [pathname, audience]);
  const sources = useMemo<HelpSources>(() => ({ help: HELP_DICTIONARIES, app: DICTIONARIES, vars: { brand: companyName } }), [companyName]);

  const show = useCallback(
    (id?: string | null) => {
      // The page's own topic straight away when there is exactly one.
      const next = id !== undefined ? id : pageTopics.length === 1 ? pageTopics[0].id : null;
      setTopicId(next);
      setOpen(true);
    },
    [pageTopics],
  );
  const close = useCallback(() => setOpen(false), []);
  const topic = useCallback((id: string) => topics.find((t) => t.id === id), [topics]);

  const value = useMemo<HelpState>(
    () => ({ open, topicId, locale: chosen ?? appLocale, setLocale: setChosen, show, close, topics, pageTopics, topic, sources }),
    [open, topicId, chosen, appLocale, show, close, topics, pageTopics, topic, sources],
  );
  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp(): HelpState {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error('useHelp must be used within HelpProvider');
  return ctx;
}

/** Like useHelp, for places that may render outside the staff shell (they then show no help). */
export function useOptionalHelp(): HelpState | null {
  return useContext(HelpContext);
}
