import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CaregiverShift, PresenceReply, StartedShare } from '@care-platform/shared';
import { api } from '@/api';
import { useTranslation } from '@/i18n';
import { useColors } from '@/theme';
import { Button, FormError } from '@/ui/controls';
import { Text } from '@/ui/Text';
import { currentSession, finishTracking, isTracking, startTracking, type StartResult } from '@/location/tracker';
import type { TrackSession } from '@/location/session';
import { useCaregiver } from './api';

export interface VisitChecksDeps {
  start: typeof startTracking;
  tracking: typeof isTracking;
  session: typeof currentSession;
}
const defaultDeps: VisitChecksDeps = { start: startTracking, tracking: isTracking, session: currentSession };

/** The phone's session for the checks during a visit, from the share the API gave at check-in. */
export function visitSession(share: StartedShare, shiftId: string, notification: { title: string; body: string }, now = Date.now()): TrackSession {
  return {
    id: share.shareId,
    kind: 'SHIFT',
    everyMinutes: share.everyMinutes,
    startedAt: now,
    endsBy: Date.parse(share.endsBy),
    sink: 'SERVER',
    uploadToken: share.uploadToken,
    shiftId,
    notification,
  };
}

/** Start the checks on this phone (after check-in, or "share from this phone"). The trip, if any, is replaced. */
export async function startVisitChecks(
  share: StartedShare,
  shiftId: string,
  notification: { title: string; body: string },
  start: typeof startTracking = startTracking,
): Promise<StartResult> {
  return start(visitSession(share, shiftId, notification));
}

/** After check-out: stop the checks if this phone runs them for that shift. */
export async function endVisitFor(shiftId: string): Promise<void> {
  const session = await currentSession();
  if (session?.kind === 'SHIFT' && session.shiftId === shiftId) await finishTracking();
}

/**
 * Location checks during a visit (GPS tracking C), on the checked-in card:
 * that they are running and how often, "Still with …?" when the office's
 * agent asked, and "Share from this phone" when this phone is not the one
 * sending. When the app opens during a visit and the phone stopped tracking
 * (iOS stops it when the app is swiped away), it starts again by itself.
 */
export function VisitChecks({ shift, deps = defaultDeps }: { shift: CaregiverShift; deps?: VisitChecksDeps }) {
  const { t } = useTranslation();
  const colors = useColors();
  const qc = useQueryClient();
  const me = useCaregiver();
  const p = shift.checkIn?.presence ?? null;
  const [here, setHere] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['caregiver', me?.userId ?? 'none', 'shifts'] });
  const notification = { title: t('visitChecks.notificationTitle'), body: t('visitChecks.notificationBody', { minutes: p?.everyMinutes ?? 30 }) };

  // Is this phone the one sending? If it was and stopped behind our back, start again (the app is open, so it may).
  useEffect(() => {
    let live = true;
    if (!p?.shareId) return setHere(null);
    void (async () => {
      const session = await deps.session();
      let ours = session?.id === p.shareId && (await deps.tracking());
      if (!ours && session?.id === p.shareId && session.kind === 'SHIFT') ours = (await deps.start(session)) === 'started';
      if (live) setHere(ours);
    })();
    return () => {
      live = false;
    };
  }, [p?.shareId, deps]);

  const restart = useMutation({
    mutationFn: async () => {
      const share = await api.post<StartedShare>(`/me/shifts/${encodeURIComponent(shift.id)}/presence/restart`);
      return startVisitChecks(share, shift.id, notification, deps.start);
    },
    onSuccess: (r) => setProblem(r === 'denied' ? t('onMyWay.denied') : r === 'unavailable' ? t('onMyWay.unavailable') : null),
    onSettled: () => void refresh(),
  });
  const reply = useMutation({
    mutationFn: (answer: PresenceReply) => api.post(`/me/shifts/${encodeURIComponent(shift.id)}/presence/reply`, { reply: answer }),
    onSettled: () => void refresh(),
  });

  if (!p || !shift.checkIn?.checkedInAt || shift.checkIn.checkedOutAt) return null;
  const error = restart.error || reply.error ? ((restart.error ?? reply.error) as Error).message || t('onMyWay.failed') : problem;

  return (
    <View style={{ gap: 8 }}>
      {p.askedAt ? (
        <View style={[styles.card, { borderColor: colors.danger, backgroundColor: colors.surface }]}>
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
            {t('visitChecks.askTitle')}
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 22, color: colors.ink }}>{t('visitChecks.askBody')}</Text>
          <Button label={t('visitChecks.withClient')} busy={reply.isPending} onPress={() => reply.mutate('WITH_CLIENT')} />
          <Button variant="secondary" label={t('visitChecks.outForClient')} busy={reply.isPending} onPress={() => reply.mutate('OUT_FOR_CLIENT')} />
        </View>
      ) : null}
      {p.shareId && here !== false ? (
        <Text style={{ fontSize: 14, color: colors.muted }}>{t('visitChecks.running', { minutes: p.everyMinutes })}</Text>
      ) : (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 14, color: colors.muted }}>{t('visitChecks.notThisPhone')}</Text>
          <Button variant="secondary" icon="navigate-outline" label={t('onMyWay.again')} busy={restart.isPending} onPress={() => restart.mutate()} />
        </View>
      )}
      <FormError message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: 14, padding: 14, gap: 8 },
});
