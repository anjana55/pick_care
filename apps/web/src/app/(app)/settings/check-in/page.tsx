'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CHECK_IN_SETTINGS_LIMITS, type CheckInSettings } from '@care-platform/shared';
import { useAuth } from '@/lib/api/auth-context';
import { useTranslation } from '@/lib/i18n/provider';
import { ApiError } from '@/lib/api/client';
import { useCheckInSettings, useUpdateCheckInSettings } from '@/lib/hooks/use-check-in';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';

type Draft = {
  enabled: boolean;
  earlyMinutes: string;
  lateAfterMinutes: string;
  farMetres: string;
  liveEnabled: boolean;
  onMyWayMinutes: string;
  locationRetentionDays: string;
  presenceEnabled: boolean;
  presenceEveryMinutes: string;
  presenceAwayPoints: string;
  presenceSilentMultiplier: string;
};
const toDraft = (s: CheckInSettings): Draft => ({
  enabled: s.enabled,
  earlyMinutes: String(s.earlyMinutes),
  lateAfterMinutes: String(s.lateAfterMinutes),
  farMetres: String(s.farMetres),
  liveEnabled: s.liveEnabled,
  onMyWayMinutes: String(s.onMyWayMinutes),
  locationRetentionDays: String(s.locationRetentionDays),
  presenceEnabled: s.presenceEnabled,
  presenceEveryMinutes: String(s.presenceEveryMinutes),
  presenceAwayPoints: String(s.presenceAwayPoints),
  presenceSilentMultiplier: String(s.presenceSilentMultiplier),
});
const inRange = (v: string, { min, max }: { min: number; max: number }) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max;

/**
 * Settings > Check-in (admin): shift check-in on or off, how early a
 * caregiver may check in, how long after the start a visit with nobody
 * checked in counts as late, and how far from the home a check-in is
 * pointed out.
 */
export default function CheckInSettingsPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { data: settings, isLoading } = useCheckInSettings();
  const save = useUpdateCheckInSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (user && user.role !== 'ADMIN') router.replace('/dashboard');
  }, [authLoading, user, router]);
  useEffect(() => {
    if (settings && !draft) setDraft(toDraft(settings));
  }, [settings, draft]);

  if (authLoading || !user || user.role !== 'ADMIN' || isLoading || !draft || !settings) {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-ink/50">{t('common.loading')}</div>;
  }

  const bad = {
    earlyMinutes: !inRange(draft.earlyMinutes, CHECK_IN_SETTINGS_LIMITS.earlyMinutes),
    lateAfterMinutes: !inRange(draft.lateAfterMinutes, CHECK_IN_SETTINGS_LIMITS.lateAfterMinutes),
    farMetres: !inRange(draft.farMetres, CHECK_IN_SETTINGS_LIMITS.farMetres),
    onMyWayMinutes: !inRange(draft.onMyWayMinutes, CHECK_IN_SETTINGS_LIMITS.onMyWayMinutes),
    locationRetentionDays: !inRange(draft.locationRetentionDays, CHECK_IN_SETTINGS_LIMITS.locationRetentionDays),
    presenceEveryMinutes: !inRange(draft.presenceEveryMinutes, CHECK_IN_SETTINGS_LIMITS.presenceEveryMinutes),
    presenceAwayPoints: !inRange(draft.presenceAwayPoints, CHECK_IN_SETTINGS_LIMITS.presenceAwayPoints),
    presenceSilentMultiplier: !inRange(draft.presenceSilentMultiplier, CHECK_IN_SETTINGS_LIMITS.presenceSilentMultiplier),
  };
  const change = (patch: Partial<Draft>) => {
    setSaved(false);
    setError(null);
    setDraft({ ...draft, ...patch });
  };
  const submit = () =>
    save.mutate(
      {
        enabled: draft.enabled,
        earlyMinutes: Number(draft.earlyMinutes),
        lateAfterMinutes: Number(draft.lateAfterMinutes),
        farMetres: Number(draft.farMetres),
        liveEnabled: draft.liveEnabled,
        onMyWayMinutes: Number(draft.onMyWayMinutes),
        locationRetentionDays: Number(draft.locationRetentionDays),
        presenceEnabled: draft.presenceEnabled,
        presenceEveryMinutes: Number(draft.presenceEveryMinutes),
        presenceAwayPoints: Number(draft.presenceAwayPoints),
        presenceSilentMultiplier: Number(draft.presenceSilentMultiplier),
      },
      {
        onSuccess: (data) => {
          setDraft(toDraft(data));
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        },
        onError: (err) => setError(err instanceof ApiError && err.message ? err.message : t('visits.settings.saveError')),
      },
    );

  const number = (key: 'earlyMinutes' | 'lateAfterMinutes' | 'farMetres' | 'onMyWayMinutes' | 'locationRetentionDays' | 'presenceEveryMinutes' | 'presenceAwayPoints' | 'presenceSilentMultiplier', label: string, hint: string) => (
    <div>
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        inputMode="numeric"
        value={draft[key]}
        aria-invalid={bad[key]}
        aria-describedby={`${key}-hint`}
        onChange={(e) => change({ [key]: e.target.value } as Partial<Draft>)}
        className="max-w-[8rem]"
      />
      <p id={`${key}-hint`} className={`mt-1 text-xs ${bad[key] ? 'text-danger' : 'text-ink/50'}`}>
        {hint}
      </p>
    </div>
  );

  return (
    <div className="max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">{t('visits.settings.title')}</h2>
      <p className="mb-4 text-sm text-ink/60">{t('visits.settings.subtitle')}</p>
      <Card>
        <CardContent className="space-y-5 pt-5">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={draft.enabled} onChange={(e) => change({ enabled: e.target.checked })} />
            <span>
              <span className="block text-sm font-medium text-ink">{t('visits.settings.enabled')}</span>
              <span className="block text-xs text-ink/50">{t('visits.settings.enabledHint')}</span>
            </span>
          </label>
          {number('earlyMinutes', t('visits.settings.early'), t('visits.settings.earlyHint', CHECK_IN_SETTINGS_LIMITS.earlyMinutes))}
          {number('lateAfterMinutes', t('visits.settings.late'), t('visits.settings.lateHint', CHECK_IN_SETTINGS_LIMITS.lateAfterMinutes))}
          {number('farMetres', t('visits.settings.far'), t('visits.settings.farHint', CHECK_IN_SETTINGS_LIMITS.farMetres))}
          <fieldset className="space-y-4 border-t border-border pt-4">
            <legend className="sr-only">{t('visits.settings.liveTitle')}</legend>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={draft.liveEnabled} onChange={(e) => change({ liveEnabled: e.target.checked })} />
              <span>
                <span className="block text-sm font-medium text-ink">{t('visits.settings.live')}</span>
                <span className="block text-xs text-ink/50">{t('visits.settings.liveHint')}</span>
              </span>
            </label>
            {number('onMyWayMinutes', t('visits.settings.onMyWay'), t('visits.settings.onMyWayHint', CHECK_IN_SETTINGS_LIMITS.onMyWayMinutes))}
            {number('locationRetentionDays', t('visits.settings.retention'), t('visits.settings.retentionHint', CHECK_IN_SETTINGS_LIMITS.locationRetentionDays))}
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={draft.presenceEnabled} onChange={(e) => change({ presenceEnabled: e.target.checked })} />
              <span>
                <span className="block text-sm font-medium text-ink">{t('visits.settings.presence')}</span>
                <span className="block text-xs text-ink/50">{t('visits.settings.presenceHint')}</span>
              </span>
            </label>
            {number('presenceEveryMinutes', t('visits.settings.presenceEvery'), t('visits.settings.presenceEveryHint', CHECK_IN_SETTINGS_LIMITS.presenceEveryMinutes))}
            {number('presenceAwayPoints', t('visits.settings.presenceAway'), t('visits.settings.presenceAwayHint', CHECK_IN_SETTINGS_LIMITS.presenceAwayPoints))}
            {number('presenceSilentMultiplier', t('visits.settings.presenceSilent'), t('visits.settings.presenceSilentHint', CHECK_IN_SETTINGS_LIMITS.presenceSilentMultiplier))}
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={submit} disabled={save.isPending || Object.values(bad).some(Boolean)}>
              {save.isPending ? t('common.loading') : t('common.save')}
            </Button>
            {saved && (
              <span role="status" className="text-sm text-brand-dark">
                {t('visits.settings.saved')}
              </span>
            )}
            <Link href="/bookings/today" className="text-sm text-brand-dark hover:underline">
              {t('visits.title')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
