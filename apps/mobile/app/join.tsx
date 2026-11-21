import { useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBranding } from '@/branding/BrandingProvider';
import { useTranslation } from '@/i18n';
import { useColors, type Colors } from '@/theme';
import { PageHeader } from '@/ui/PageHeader';
import { Text } from '@/ui/Text';
import { tint, type IconName } from '@/ui/visual';
import { dialUrl } from '@/signup/Agreement';

/**
 * Joining as a caregiver, made as simple as it can be: three big choices.
 * Register here in the app; call the office and have them fill it in (for
 * anyone who would rather not type - shown when Settings > Branding has the
 * office number); or, already registered, sign in.
 */
export default function Join() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { branding } = useBranding();
  const phone = branding.officePhone;
  const back = returnTo ? { returnTo } : {};

  return (
    <View style={styles.screen}>
      <PageHeader title={t('signup.join.title')} subtitle={t('signup.join.subtitle')} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <Big
          icon="create-outline"
          title={t('signup.join.inApp')}
          hint={t('signup.join.inAppHint')}
          primary
          onPress={() => router.push({ pathname: '/register', params: { role: 'caregiver', ...back } })}
        />
        {phone ? (
          <Big
            icon="call"
            title={t('signup.join.byPhone')}
            hint={`${t('signup.join.byPhoneHint')}\n${phone}`}
            onPress={() => void Linking.openURL(dialUrl(phone))}
            accessibilityRole="link"
          />
        ) : null}
        <Big
          icon="log-in-outline"
          title={t('signup.join.haveAccount')}
          hint={t('signIn.caregiver')}
          onPress={() => router.push({ pathname: '/sign-in', params: { role: 'caregiver', ...back } })}
        />
      </ScrollView>
    </View>
  );
}

function Big({
  icon,
  title,
  hint,
  onPress,
  primary = false,
  accessibilityRole = 'button',
}: {
  icon: IconName;
  title: string;
  hint: string;
  onPress: () => void;
  primary?: boolean;
  accessibilityRole?: 'button' | 'link';
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable accessibilityRole={accessibilityRole} accessibilityLabel={title} accessibilityHint={hint} onPress={onPress} style={primary ? styles.primary : styles.secondary}>
      <View style={[styles.icon, { backgroundColor: primary ? colors.surface : tint(colors.brand, 0.12) }]}>
        <Ionicons name={icon} size={34} color={primary ? colors.deep : colors.brand} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.title, { color: primary ? colors.brandText : colors.deep }]}>{title}</Text>
        <Text style={[styles.hint, { color: primary ? '#E6EEF3' : colors.muted }]}>{hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={28} color={primary ? colors.brandText : colors.muted} />
    </Pressable>
  );
}

const card = { minHeight: 120, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 } as const;

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    body: { padding: 20, gap: 16 },
    primary: { ...card, backgroundColor: colors.deep },
    secondary: { ...card, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brand },
    icon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 21, fontWeight: '800' },
    hint: { fontSize: 16, lineHeight: 23 },
  });
