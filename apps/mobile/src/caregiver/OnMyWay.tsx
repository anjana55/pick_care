import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CaregiverShift, StartedShare } from '@care-platform/shared';
import { api } from '@/api';
import { useTranslation } from '@/i18n';
import { useColors } from '@/theme';
import { Button, FormError } from '@/ui/controls';
import { Text } from '@/ui/Text';
import { fmtTime } from '@/ui/dates';
import { currentSession, finishTracking, isTracking, sendPoints, startTracking, type StartResult } from '@/location/tracker';
import { useCaregiver } from './api';

/** Shown once per phone before the first share: what is shared, with whom, until when. */
const CONSENT_KEY = 'location.onMyWay.explained.v1';

export interface OnMyWayDeps {
  start: typeof startTracking;
  finish: typeof finishTracking;
  tracking: typeof isTracking;
  now: () => number;
}
const defaultDeps: OnMyWayDeps = { start: startTracking, finish: finishTracking, tracking: isTracking, now: () => Date.now() };

/**
 * "On my way" (GPS tracking B). From the admin's minutes before a visit
 * until check-in, the caregiver can share where they are with the client and
 * the office. It starts only from this tap, shows a notification (Android)
 * or the blue indicator (iPhone) while it runs, and stops by itself at
 * check-in, at "I can't make this shift", at the end of the shift or after
 * three hours. They can stop it here at any time.
 */
export function OnMyWay({ shift, deps = defaultDeps }: { shift: CaregiverShift; deps?: OnMyWayDeps }) {
  const { t } = useTranslation();
  const colors = useColors();
  const qc = useQueryClient();
  const me = useCaregiver();
  const omw = shift.checkIn?.onMyWay ?? null;
  const [explaining, setExplaining] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [here, setHere] = useState<boolean | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['caregiver', me?.userId ?? 'none', 'shifts'] });

  // Is this phone the one sharing? (iOS stops tracking when the app is swiped away; another phone may have taken over.)
  useEffect(() => {
    let live = true;
    if (!omw?.shareId) return setHere(null);
    void (async () => {
      const session = await currentSession();
      const ours = session?.id === omw.shareId && (await deps.tracking());
      if (live) setHere(ours);
    })();
    // While the app is open, send what is waiting every half a minute.
    const timer = setInterval(() => void sendPoints(true).catch(() => undefined), 30_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [omw?.shareId, deps]);

  const start = useMutation({
    mutationFn: async (): Promise<StartResult> => {
      const share = await api.post<StartedShare>(`/me/shifts/${encodeURIComponent(shift.id)}/on-my-way`);
      const result = await deps.start({
        id: share.shareId,
        kind: 'TRIP',
        startedAt: deps.now(),
        endsBy: Date.parse(share.endsBy),
        sink: 'SERVER',
        uploadToken: share.uploadToken,
        shiftId: shift.id,
        notification: { title: t('onMyWay.notificationTitle'), body: t('onMyWay.notificationBody') },
      });
      // The phone can't share after all: close the share so nobody waits for a dot that never comes.
      if (result !== 'started') await api.post(`/me/location-shares/${encodeURIComponent(share.shareId)}/stop`).catch(() => undefined);
      return result;
    },
    onSuccess: (result) => setProblem(result === 'denied' ? t('onMyWay.denied') : result === 'unavailable' ? t('onMyWay.unavailable') : null),
    onSettled: () => void refresh(),
  });

  const stop = useMutation({
    mutationFn: async () => {
      if (omw?.shareId) await api.post(`/me/location-shares/${encodeURIComponent(omw.shareId)}/stop`);
      await deps.finish();
    },
    onSettled: () => void refresh(),
  });

  if (!omw || shift.cantMake || shift.paused) return null;
  const opens = Date.parse(omw.opensAt);
  if (deps.now() < opens) return <Text style={{ fontSize: 14, color: colors.muted }}>{t('onMyWay.opensAt', { time: fmtTime(omw.opensAt) })}</Text>;

  const tap = async () => {
    setProblem(null);
    if (!(await AsyncStorage.getItem(CONSENT_KEY))) return setExplaining(true);
    start.mutate();
  };
  const error = start.error || stop.error ? ((start.error ?? stop.error) as Error).message || t('onMyWay.failed') : problem;

  if (omw.shareId && here !== false) {
    return (
      <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.surface }]}>
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, fontWeight: '700', color: colors.brand }}>
          {t('onMyWay.sharing')}
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{t('onMyWay.sharingHint')}</Text>
        <Button variant="secondary" label={t('onMyWay.stop')} busy={stop.isPending} onPress={() => stop.mutate()} />
        <FormError message={error} />
      </View>
    );
  }

  if (explaining) {
    return (
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
          {t('onMyWay.explainTitle')}
        </Text>
        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.ink }}>{t('onMyWay.explain')}</Text>
        <Button
          label={t('onMyWay.agree')}
          busy={start.isPending}
          onPress={async () => {
            await AsyncStorage.setItem(CONSENT_KEY, new Date().toISOString());
            setExplaining(false);
            start.mutate();
          }}
        />
        <Button variant="link" label={t('common.cancel')} onPress={() => setExplaining(false)} />
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <Button
        variant="secondary"
        icon="navigate-outline"
        label={omw.shareId ? t('onMyWay.again') : t('onMyWay.start')}
        busy={start.isPending}
        onPress={() => void tap()}
      />
      {omw.shareId ? <Text style={{ fontSize: 14, color: colors.muted }}>{t('onMyWay.notThisPhone')}</Text> : null}
      <FormError message={error} />
    </View>
  );
}

/** After check-in or "I can't make this shift": stop sharing if this phone is sharing for that shift. */
export async function endTripFor(shiftId: string): Promise<void> {
  const session = await currentSession();
  if (session?.kind === 'TRIP' && session.shiftId === shiftId) await finishTracking();
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
});
