import { Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, usePathname } from 'expo-router';
import { helpPhrase, helpTopicText } from '@care-platform/shared';
import { useTranslation } from '@/i18n';
import { Button } from '@/ui/controls';
import { MenuRow } from '@/ui/visual';
import { useColors } from '@/theme';
import { HELP_TOPICS } from './topics';
import { useHelpSources, useOpenHelp } from './useHelp';

/** "All help topics" in a menu (My account). */
export function HelpMenuRow() {
  const router = useRouter();
  const from = usePathname();
  const { locale } = useTranslation();
  const sources = useHelpSources();
  return (
    <MenuRow
      icon="help-circle-outline"
      label={helpPhrase(sources, locale, 'ui.allTopics')}
      onPress={() => router.push({ pathname: '/help', params: { from } } as never)}
    />
  );
}

/** A plain Help link, for screens without the usual header (the welcome screen). */
export function HelpLink({ topic }: { topic?: string }) {
  const router = useRouter();
  const from = usePathname();
  const { locale } = useTranslation();
  const sources = useHelpSources();
  return (
    <Button
      variant="link"
      icon="help-circle-outline"
      label={helpPhrase(sources, locale, 'ui.open')}
      onPress={() => router.push({ pathname: '/help', params: topic ? { topic, from } : { from } } as never)}
    />
  );
}

/** A small ? beside a card's title: opens the help on that card's topic. */
export function HelpHint({ topic }: { topic: string }) {
  const open = useOpenHelp(topic);
  const colors = useColors();
  const { locale } = useTranslation();
  const sources = useHelpSources();
  const def = HELP_TOPICS.find((t) => t.id === topic);
  if (!open || !def) return null;
  const label = helpPhrase(sources, locale, 'ui.openTopic').replace('{title}', helpTopicText(sources, locale, def).title);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={open}
      hitSlop={10}
      style={({ pressed }) => [styles.hint, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}
    >
      <Ionicons name="help" size={20} color={colors.deep} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
