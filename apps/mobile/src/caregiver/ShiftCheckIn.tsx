import { useState } from 'react';
import { View } from 'react-native';
import { checkInOpen, type CaregiverShift } from '@care-platform/shared';
import { useTranslation } from '@/i18n';
import { useColors } from '@/theme';
import { Button, Field, FormError } from '@/ui/controls';
import { Text } from '@/ui/Text';
import { fmtTime } from '@/ui/dates';
import { useNearHome, useShiftCheckIn, useShiftCheckOut } from './api';
import { phonePosition, type Position } from './position';
import { OnMyWay, endTripFor } from './OnMyWay';
import { VisitChecks, endVisitFor, startVisitChecks } from './VisitChecks';

/**
 * Check-in for one of the caregiver's shifts, as on the website: while it is
 * open, "Check in" asks for the four digits the client reads out; once in,
 * "Check out". Where the phone is goes along when the caregiver allows it,
 * and is never needed. Opening check-in asks the phone where it is once and
 * says "You're at the client's home" (or that it doesn't look like it), so a
 * caregiver at the wrong house finds out before asking for the code. Renders nothing while check-in is switched off or
 * there is nothing to do or say yet.
 */
export function ShiftCheckIn({ shift, locate = phonePosition }: { shift: CaregiverShift; locate?: () => Promise<Position> }) {
  const { t } = useTranslation();
  const colors = useColors();
  const checkIn = useShiftCheckIn();
  const checkOut = useShiftCheckOut();
  const near = useNearHome();
  const [open, setOpen] = useState(false);
  // The fix taken on opening, reused for the check-in while it is fresh.
  const [fix, setFix] = useState<{ position: Position; at: number } | null>(null);
  const [atHome, setAtHome] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const c = shift.checkIn;
  // Paused by the office: nobody should go, so there is nothing to check in to.
  if (shift.paused && !c?.checkedInAt) return <Text style={{ fontSize: 14, fontWeight: '600', color: colors.danger }}>{t('portal.shifts.paused')}</Text>;
  if (!c || (shift.status !== 'SCHEDULED' && shift.status !== 'COMPLETED')) return null;

  if (c.checkedInAt && c.checkedOutAt)
    return (
      <Text style={{ fontSize: 14, color: colors.brand }}>{t('checkIn.caregiver.out', { in: fmtTime(c.checkedInAt), out: fmtTime(c.checkedOutAt) })}</Text>
    );
  if (c.checkedInAt) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.brand }}>{t('checkIn.caregiver.in', { time: fmtTime(c.checkedInAt) })}</Text>
        <VisitChecks shift={shift} />
        {shift.status === 'SCHEDULED' ? (
          <Button
            variant="secondary"
            label={t('checkIn.caregiver.checkOut')}
            busy={busy || checkOut.isPending}
            onPress={async () => {
              setBusy(true);
              const position = await locate();
              checkOut.mutate(
                { shiftId: shift.id, ...position },
                {
                  // Checked out: the checks during the visit stop.
                  onSuccess: () => void endVisitFor(shift.id),
                  onSettled: () => setBusy(false),
                },
              );
            }}
          />
        ) : null}
        <FormError message={checkOut.error ? (checkOut.error as Error).message || t('checkIn.caregiver.failed') : null} />
      </View>
    );
  }
  if (shift.status !== 'SCHEDULED') return null;
  if (c.codeLocked) return <Text style={{ fontSize: 14, color: colors.danger }}>{t('checkIn.caregiver.locked')}</Text>;
  if (c.state === 'NOT_RECORDED') return <Text style={{ fontSize: 14, color: colors.muted }}>{t('checkIn.caregiver.notRecorded')}</Text>;
  // "On my way" sits with check-in until the caregiver arrives.
  const onMyWay = c.onMyWay ? <OnMyWay shift={shift} /> : null;
  if (!checkInOpen(c.state)) return onMyWay;

  const start = async () => {
    setOpen(true);
    setAtHome(null);
    const position = await locate();
    setFix({ position, at: Date.now() });
    if (position.latitude === undefined || position.longitude === undefined) return;
    near.mutate(
      { shiftId: shift.id, latitude: position.latitude, longitude: position.longitude, accuracyM: position.accuracyM },
      { onSuccess: (answer) => setAtHome(answer.atHome), onError: () => setAtHome(null) },
    );
  };
  if (!open) {
    return (
      <View style={{ gap: 10 }}>
        {onMyWay}
        <Button label={t('checkIn.caregiver.checkIn')} onPress={() => void start()} />
      </View>
    );
  }

  const send = async () => {
    if (code.length !== 4 || busy) return;
    setBusy(true);
    const position = fix && Date.now() - fix.at < 2 * 60_000 && fix.position.latitude !== undefined ? fix.position : await locate();
    checkIn.mutate(
      { shiftId: shift.id, code, ...position },
      {
        onSuccess: (result) => {
          setOpen(false);
          // Arrived: the trip ends; with checks during the visit on, they take over on this phone.
          if (result?.presence) {
            void startVisitChecks(result.presence, shift.id, {
              title: t('visitChecks.notificationTitle'),
              body: t('visitChecks.notificationBody', { minutes: result.presence.everyMinutes ?? 30 }),
            });
          } else void endTripFor(shift.id);
        },
        onSettled: () => setBusy(false),
      },
    );
  };
  return (
    <View style={{ gap: 8 }}>
      {atHome === true ? (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, fontWeight: '600', color: colors.brand }}>
          {t('checkIn.caregiver.atHome')}
        </Text>
      ) : atHome === false ? (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, fontWeight: '600', color: colors.danger }}>
          {t('checkIn.caregiver.notAtHome')}
        </Text>
      ) : null}
      {c.presence ? (
        <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{t('visitChecks.notice', { minutes: c.presence.everyMinutes })}</Text>
      ) : null}
      <Field
        label={t('checkIn.caregiver.codeLabel')}
        hint={t('checkIn.caregiver.codeHint')}
        value={code}
        onChangeText={(v) => {
          checkIn.reset();
          setCode(v.replace(/\D/g, '').slice(0, 4));
        }}
        keyboardType="number-pad"
        maxLength={4}
        textContentType="oneTimeCode"
      />
      <FormError message={checkIn.error ? (checkIn.error as Error).message || t('checkIn.caregiver.failed') : null} />
      <Button label={t('checkIn.caregiver.submit')} busy={busy || checkIn.isPending} disabled={code.length !== 4} onPress={() => void send()} />
      <Button variant="secondary" label={t('checkIn.caregiver.cancel')} onPress={() => setOpen(false)} />
    </View>
  );
}
