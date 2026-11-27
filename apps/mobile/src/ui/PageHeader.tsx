import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { homeFor } from '@/auth/sides';
import { useTranslation } from '@/i18n';
import { useColors } from '@/theme';
import { Text } from './Text';
import { HeroBand, type IconName } from './visual';
import { Bell } from '@/notifications/Bell';
import { helpPhrase } from '@care-platform/shared';
import { useHelpSources, useOpenHelp } from '@/help/useHelp';

/** Where Home goes: a signed-in person's own area, else the welcome screen. */
export function useHome(): string {
  const { user } = useAuth();
  return user ? homeFor(user) : '/';
}

/**
 * The top of every screen: the brand band, curved at the bottom, with a
 * labelled Back button and a labelled Home button - words as well as arrows,
 * for people who are new to phones - with the bell between them for a
 * signed-in client or caregiver, then the screen's title. `isHome` marks
 * the Home button as where the person already is. `children` sit on the band
 * under the title (a greeting, a search box).
 */
export function PageHeader({
  title,
  subtitle,
  isHome = false,
  onBack,
  help,
  children,
}: {
  title?: string;
  subtitle?: string;
  isHome?: boolean;
  /** Instead of going back a screen: closing a sheet, a step of a form. */
  onBack?: () => void;
  /**
   * The ? that opens the help. By default it opens the topics for this
   * screen and is left out where there are none; a topic id opens that
   * topic; `false` leaves it out (the help screen itself).
   */
  help?: string | false;
  children?: ReactNode;
}) {
  const { t, locale } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const home = useHome();
  const openHelp = useOpenHelp(typeof help === 'string' ? help : undefined);
  const helpSources = useHelpSources();
  const helpButton = help !== false && openHelp ? <HelpButton label={helpPhrase(helpSources, locale, 'ui.open')} onPress={openHelp} /> : null;

  // Opened from a link or a notification there may be nothing to go back to: then Back goes home.
  const back = onBack ?? (() => (router.canGoBack?.() ? router.back() : router.replace(home as never)));

  return (
    <HeroBand style={{ paddingTop: insets.top + 12, paddingBottom: title || children ? 24 : 18, gap: 18 }}>
      <View style={styles.nav}>
        <NavButton icon="chevron-back" label={t('nav.back')} onPress={back} />
        <Bell />
        <NavButton icon="home" label={t('nav.home')} current={isHome} onPress={() => (isHome ? undefined : router.replace(home as never))} />
      </View>
      {title ? (
        <View style={styles.titleRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.brandText }]}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {helpButton}
        </View>
      ) : helpButton ? (
        <View style={{ alignItems: 'flex-end', marginTop: -6 }}>{helpButton}</View>
      ) : null}
      {children}
    </HeroBand>
  );
}

/** The round ? beside a screen's title. Named "Help" for screen readers, in the app's language. */
function HelpButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.helpButton, { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}
    >
      <Ionicons name="help" size={28} color={colors.deep} />
    </Pressable>
  );
}

function NavButton({ icon, label, onPress, current = false }: { icon: IconName; label: string; onPress: () => void; current?: boolean }) {
  const colors = useColors();
  const fg = current ? colors.brandText : colors.deep;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: current }}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.navButton, { backgroundColor: current ? colors.deep : colors.surface, opacity: pressed ? 0.85 : 1 }]}
    >
      <Ionicons name={icon} size={24} color={fg} />
      <Text style={[styles.navLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  navButton: { minHeight: 50, borderRadius: 25, paddingLeft: 12, paddingRight: 18, flexDirection: 'row', alignItems: 'center', gap: 6 },
  navLabel: { fontSize: 18, fontWeight: '700' },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '800' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  helpButton: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  subtitle: { fontSize: 17, lineHeight: 24, color: '#FFFFFF' },
});
