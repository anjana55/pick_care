import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contactMethodValues, contactTimeValues, type CommunicationPreferences, type UpdateCommunicationPreferences } from '@care-platform/shared';
import { api, ApiError } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { useTranslation } from '@/i18n';
import { useColors } from '@/theme';
import { Chips } from '@/ui/choices';
import { PageHeader } from '@/ui/PageHeader';
import { Text } from '@/ui/Text';
import { Card } from '@/ui/visual';

const KEY = ['communication-preferences'];

/**
 * "How we contact you", from My account (clients) and Me (caregivers): the
 * same settings as the website and the staff card. Each tap saves at once, so
 * there is no Save button to miss.
 */
export default function CommunicationPreferencesScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const { user } = useAuth();
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: KEY, queryFn: () => api.get<CommunicationPreferences>('/me/communication-preferences'), enabled: Boolean(user) });
  const save = useMutation({
    mutationFn: (patch: UpdateCommunicationPreferences) => api.patch<CommunicationPreferences>('/me/communication-preferences', patch),
    onSuccess: (saved) => qc.setQueryData(KEY, saved),
  });

  if (!user) return <Redirect href="/" />;
  const data = prefs.data;
  const isClient = user.role === 'PATIENT_GUARDIAN';
  // Email or WhatsApp can't be picked without an address or a number to send to.
  const methods = contactMethodValues.filter((m) => !data || ((m !== 'EMAIL' || data.hasEmail) && (m !== 'WHATSAPP' || data.hasPhone)));
  const error = save.error ? (save.error instanceof ApiError && save.error.message ? save.error.message : t('commsPrefs.saveError')) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title={t('commsPrefs.title')} />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={{ fontSize: 16, lineHeight: 23, color: colors.muted }}>{t('commsPrefs.intro')}</Text>
        {prefs.isLoading ? <Text style={{ color: colors.muted }}>{t('common.loading')}</Text> : null}
        {prefs.isError ? <Text style={{ color: colors.danger }}>{t('commsPrefs.loadError')}</Text> : null}
        {data ? (
          <>
            <Card style={styles.card}>
              <Chips
                label={t('commsPrefs.method')}
                choices={methods.map((m) => ({ value: m, label: t(`personalInfo.options.contactMethod.${m}`) }))}
                selected={data.preferredContactMethod ? [data.preferredContactMethod] : []}
                onToggle={(m) => save.mutate({ preferredContactMethod: m })}
              />
              {data.preferredContactMethod === 'PHONE_CALL' ? (
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{t('commsPrefs.phoneCallHint')}</Text>
              ) : null}
              {isClient ? (
                <Chips
                  label={t('commsPrefs.time')}
                  choices={contactTimeValues.map((v) => ({ value: v, label: t(`commsPrefs.times.${v}`) }))}
                  selected={data.preferredContactTime ? [data.preferredContactTime] : []}
                  onToggle={(v) => save.mutate({ preferredContactTime: v })}
                />
              ) : null}
            </Card>
            <Card style={styles.card}>
              <Setting
                label={t('commsPrefs.push')}
                hint={t('commsPrefs.pushHelp')}
                value={data.pushEnabled}
                busy={save.isPending}
                onChange={(v) => save.mutate({ pushEnabled: v })}
              />
              <Setting
                label={t('commsPrefs.reminders')}
                hint={t('commsPrefs.remindersHelp')}
                value={data.reminderMessagesEnabled}
                busy={save.isPending}
                onChange={(v) => save.mutate({ reminderMessagesEnabled: v })}
              />
            </Card>
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{t('commsPrefs.alwaysSent')}</Text>
            <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, color: error ? colors.danger : colors.brand }}>
              {error ?? (save.isSuccess ? t('commsPrefs.saved') : '')}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Setting({ label, hint, value, busy, onChange }: { label: string; hint: string; value: boolean; busy: boolean; onChange: (v: boolean) => void }) {
  const colors = useColors();
  return (
    <View style={styles.setting}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>{label}</Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{hint}</Text>
      </View>
      <Switch accessibilityLabel={label} value={value} disabled={busy} onValueChange={onChange} trackColor={{ true: colors.brand, false: colors.border }} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40, gap: 16 },
  card: { padding: 16, gap: 16 },
  setting: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
});
