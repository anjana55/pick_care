import { useMemo } from 'react';
import { Link, Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '@/i18n';
import { homeFor } from '@/auth/sides';
import { LanguagePicker } from '@/ui/LanguagePicker';
import { useAuth } from '@/auth/AuthProvider';
import { useColors, type Colors } from '@/theme';
import { Text } from '@/ui/Text';
import { CaregiversIllustration } from '@/ui/Illustration';
import { BrandLogo, tint } from '@/ui/visual';
import { Button } from '@/ui/controls';

/**
 * First screen, kept simple: the brand, the language, a picture of the people
 * the app is about, one sentence, and one button - Get started - which asks
 * which side of the app this person is on. People who already have an account
 * have their own, separate section to sign in from - two clear paths, not a
 * button and a small link.
 */
export default function Welcome() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const router = useRouter();

  // Already signed in: straight to their area.
  if (user) return <Redirect href={homeFor(user)} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} bounces={false}>
      <View testID="welcome-band" style={[styles.band, { paddingTop: insets.top + 20 }]}>
        <View pointerEvents="none" style={[styles.blob, { backgroundColor: tint(colors.accent, 0.45) }]} />
        <View style={styles.bandTop}>
          <BrandLogo reverse height={40} name={t('app.name')} />
          <LanguagePicker onBrand />
        </View>
        <View style={styles.art}>
          <CaregiversIllustration width={Math.min(width - 24, 380)} />
        </View>
      </View>

      <View style={styles.body}>
        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={styles.headline}>
            {t('welcome.headline')}
          </Text>
          <Text style={styles.subline}>{t('welcome.subline')}</Text>
        </View>

        {/* Two plainly separate paths: new here, or already registered. */}
        <View style={styles.path}>
          <Text style={styles.pathLabel}>{t('signup.newHere')}</Text>
          <Link href="/get-started" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={t('welcome.getStarted')} style={styles.start}>
              <Text style={styles.startText}>{t('welcome.getStarted')}</Text>
              <Ionicons name="arrow-forward" size={26} color={colors.brandText} />
            </Pressable>
          </Link>
        </View>

        <View style={[styles.path, styles.signIn]}>
          <Text style={styles.pathLabel}>{t('welcome.haveAccount')}</Text>
          <Button
            variant="secondary"
            icon="log-in-outline"
            label={t('signIn.client')}
            onPress={() => router.push({ pathname: '/sign-in', params: { role: 'client' } })}
          />
          <Button
            variant="secondary"
            icon="medkit-outline"
            label={t('signIn.caregiver')}
            onPress={() => router.push({ pathname: '/sign-in', params: { role: 'caregiver' } })}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    band: { backgroundColor: colors.brand, borderBottomLeftRadius: 48, borderBottomRightRadius: 48, overflow: 'hidden' },
    blob: { position: 'absolute', width: 260, height: 260, borderRadius: 130, top: -80, right: -80 },
    bandTop: { paddingHorizontal: 24, gap: 18 },
    art: { alignItems: 'center', marginTop: 12 },
    body: { paddingHorizontal: 24, paddingTop: 28, gap: 24 },
    headline: { fontSize: 30, lineHeight: 38, fontWeight: '800', color: colors.deep },
    subline: { fontSize: 18, lineHeight: 27, color: colors.muted },
    // One flat style each: expo-router's <Link asChild> refuses an array of styles on its child.
    start: { minHeight: 64, borderRadius: 18, backgroundColor: colors.deep, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    startText: { fontSize: 22, fontWeight: '800', color: colors.brandText },
    path: { gap: 10 },
    pathLabel: { fontSize: 16, fontWeight: '700', color: colors.muted },
    signIn: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 20 },
  });
