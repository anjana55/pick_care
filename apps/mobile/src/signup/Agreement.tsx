import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { agreementText, agreementVersion, type SignupSide } from '@care-platform/shared';
import { useBranding } from '@/branding/BrandingProvider';
import { useTranslation } from '@/i18n';
import { useColors } from '@/theme';
import { Button } from '@/ui/controls';
import { Text } from '@/ui/Text';
import { Card, IconBadge } from '@/ui/visual';

/** A big, plain tick box: the whole row is the target. */
export function TickBox({ label, checked, onChange, error }: { label: string; checked: boolean; onChange: (v: boolean) => void; error?: string | null }) {
  const colors = useColors();
  return (
    <View style={{ gap: 4 }}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={styles.tick}>
        <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={30} color={error ? colors.danger : colors.brand} />
        <Text style={{ flex: 1, fontSize: 16, lineHeight: 23, color: colors.ink }}>{label}</Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={{ fontSize: 14, color: colors.danger }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The service agreement on the registration form: its title, the full text a
 * tap away, and the tick box that accepts it.
 */
export function AgreementBox({ side, checked, onChange, error }: { side: SignupSide; checked: boolean; onChange: (v: boolean) => void; error?: string | null }) {
  const { t, locale } = useTranslation();
  const colors = useColors();
  const { branding } = useBranding();
  const [open, setOpen] = useState(false);
  const text = agreementText(side, locale, branding.companyName);
  return (
    <Card style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>
        {text.title}
      </Text>
      <Button variant="link" label={open ? t('signup.agreement.hide') : t('signup.agreement.read')} onPress={() => setOpen((o) => !o)} />
      {open ? (
        <View style={{ gap: 10 }}>
          <Text style={styles.body}>{text.intro}</Text>
          {text.sections.map((s) => (
            <View key={s.heading} style={{ gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{s.heading}</Text>
              <Text style={[styles.body, { color: colors.ink }]}>{s.body}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 13, color: colors.muted }}>{t('signup.agreement.version', { version: agreementVersion(side) })}</Text>
        </View>
      ) : null}
      <TickBox label={text.acceptLabel} checked={checked} onChange={onChange} error={error} />
    </Card>
  );
}

/** The dialler, for an office number as it is written in Settings > Branding. */
export const dialUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/**
 * "Call the office to register" - one big button that dials, for clients and
 * caregivers who would rather not fill in a form. The 3rd choice in step 1 of
 * registering (MethodStep). Nothing when the office has no number.
 */
export function CallOfficeCard() {
  const { t } = useTranslation();
  const colors = useColors();
  const { branding } = useBranding();
  if (!branding.officePhone) return null;
  const phone = branding.officePhone;
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconBadge name="call" tone="accent" size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>{t('signup.callOffice.title')}</Text>
          <Text style={{ fontSize: 15, lineHeight: 21, color: colors.muted }}>{t('signup.callOffice.body')}</Text>
        </View>
      </View>
      <Button icon="call" label={t('signup.callOffice.cta', { phone })} onPress={() => void Linking.openURL(dialUrl(phone))} />
    </Card>
  );
}

const styles = StyleSheet.create({
  tick: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 48, paddingVertical: 6 },
  body: { fontSize: 15, lineHeight: 22 },
});
