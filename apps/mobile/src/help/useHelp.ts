import { useMemo } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { helpTopicsFor, helpTopicsForPath, type HelpAudience, type HelpSources, type HelpTopicDef } from '@care-platform/shared';
import { useAuth } from '@/auth/AuthProvider';
import { useBranding } from '@/branding/BrandingProvider';
import appEn from '@/i18n/en.json';
import appSi from '@/i18n/si.json';
import appTa from '@/i18n/ta.json';
import { HELP_DICTIONARIES, HELP_TOPICS } from './topics';

/** Who the help is for: the signed-in side, or a visitor who hasn't signed in. */
export function useHelpAudience(): HelpAudience {
  const { user } = useAuth();
  if (!user) return 'GUEST';
  return user.role === 'CAREGIVER' ? 'CAREGIVER' : 'CLIENT';
}

/** The help's words and the app's own labels in every language, with the brand name filled in. */
export function useHelpSources(): HelpSources {
  const { branding } = useBranding();
  return useMemo(() => ({ help: HELP_DICTIONARIES, app: { en: appEn, si: appSi, ta: appTa }, vars: { brand: branding.companyName } }), [branding.companyName]);
}

/** Topics this person may see; and those about `path`. */
export function useHelpTopics(path?: string): { all: HelpTopicDef[]; forPath: HelpTopicDef[] } {
  const audience = useHelpAudience();
  return useMemo(() => ({ all: helpTopicsFor(HELP_TOPICS, audience), forPath: path ? helpTopicsForPath(HELP_TOPICS, path, audience) : [] }), [audience, path]);
}

/**
 * Opens the help from the current screen: on `topic`, or on the topics for
 * this screen. Returns null when there is no help for this screen, so
 * callers can leave the ? out.
 */
export function useOpenHelp(topic?: string): (() => void) | null {
  const router = useRouter();
  const path = usePathname();
  const { all, forPath } = useHelpTopics(path);
  if (topic ? !all.some((t) => t.id === topic) : !forPath.length) return null;
  return () => router.push({ pathname: '/help', params: topic ? { topic, from: path } : { from: path } } as never);
}
