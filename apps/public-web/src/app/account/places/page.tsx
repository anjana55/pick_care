'use client';

import { useState } from 'react';
import { LocateFixed, MapPin, Star } from 'lucide-react';
import { CARE_LOCATIONS_MAX, CARE_LOCATION_LABEL_MAX, type CareLocation, type GeoPoint } from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n';
import { ApiError } from '@/lib/api/client';
import { useMyCareLocations, useRemoveCareLocation, useSaveCareLocation } from '@/lib/hooks/use-client-care';
import { devicePosition } from '@/lib/device-position';
import { PinPicker } from '@/components/map/pin-picker';
import { LoadingState, ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

type Editing = { id?: string; point: GeoPoint | null; label: string; start: GeoPoint | null };

/**
 * "Where care happens": the client puts a pin on the home (and any other
 * house they have care at). The caregiver's check-in is compared with it, so
 * the office knows the visit happened at the right door. The point is never
 * shown to caregivers - the office still shares the address.
 */
export default function CarePlacesPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useMyCareLocations();
  const save = useSaveCareLocation();
  const remove = useRemoveCareLocation();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labels = { map: t('account.places.map'), pin: t('account.places.pin'), failed: t('account.places.mapFailed') };
  const fail = (err: unknown) => setError(err instanceof ApiError && err.message ? err.message : t('account.places.saveError'));

  const locateMe = async () => {
    if (!editing) return;
    setLocating(true);
    setError(null);
    const p = await devicePosition();
    setLocating(false);
    if (p.latitude === undefined || p.longitude === undefined) return setError(t('account.places.noLocation'));
    setEditing({ ...editing, point: { latitude: p.latitude, longitude: p.longitude } });
  };

  const submit = () => {
    if (!editing?.point) return;
    setError(null);
    save.mutate({ id: editing.id, ...editing.point, label: editing.label.trim() || undefined }, { onSuccess: () => setEditing(null), onError: fail });
  };

  const startEdit = (p?: CareLocation) => {
    setError(null);
    setEditing(p ? { id: p.id, point: p, label: p.label, start: p } : { point: null, label: '', start: null });
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-ink">{t('account.places.title')}</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink/60">{t('account.places.subtitle')}</p>

      <div className="mt-6 space-y-4">
        {isLoading && <LoadingState label={t('common.loading')} />}
        {isError && <ErrorState onRetry={() => refetch()} />}

        {editing && (
          <section className="space-y-3 rounded-lg border border-brand/30 bg-white p-4 sm:p-5" aria-labelledby="place-edit">
            <h2 id="place-edit" className="text-base font-semibold text-ink">
              {editing.id ? t('account.places.moveTitle') : t('account.places.addTitle')}
            </h2>
            <p className="text-sm text-ink/70">{t('account.places.howTo')}</p>
            <Button type="button" variant="secondary" onClick={() => void locateMe()} disabled={locating}>
              <LocateFixed className="mr-2 h-4 w-4" aria-hidden />
              {locating ? t('common.loading') : t('account.places.useMyLocation')}
            </Button>
            <PinPicker value={editing.point} start={editing.start} onChange={(point) => setEditing({ ...editing, point })} labels={labels} className="relative h-80 w-full overflow-hidden rounded border border-ink/10" />
            <div className="max-w-sm">
              <Label htmlFor="place-label">{t('account.places.label')}</Label>
              <Input id="place-label" value={editing.label} maxLength={CARE_LOCATION_LABEL_MAX} placeholder={t('account.places.labelPlaceholder')} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={submit} disabled={!editing.point || save.isPending}>
                {save.isPending ? t('common.loading') : t('account.places.save')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </Button>
            </div>
            {!editing.point && <p className="text-xs text-ink/50">{t('account.places.tapHint')}</p>}
          </section>
        )}

        {data && data.length === 0 && !editing && (
          <div className="rounded-lg border border-dashed border-border bg-white px-6 py-10 text-center">
            <MapPin className="mx-auto h-8 w-8 text-brand" aria-hidden />
            <p className="mt-2 text-sm text-ink/70">{t('account.places.empty')}</p>
            <Button type="button" className="mt-4" onClick={() => startEdit()}>
              {t('account.places.addFirst')}
            </Button>
          </div>
        )}

        {data && data.length > 0 && (
          <ul className="space-y-3">
            {data.map((p) => (
              <li key={p.id} className="rounded-lg border border-border bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    <MapPin className="h-4 w-4 text-brand" aria-hidden />
                    {p.label}
                    {p.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-light px-2 py-0.5 text-xs font-medium text-brand-dark">
                        <Star className="h-3 w-3" aria-hidden />
                        {t('account.places.default')}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(p)}>
                      {t('account.places.move')}
                    </Button>
                    {!p.isDefault && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => save.mutate({ id: p.id, isDefault: true }, { onError: fail })}>
                        {t('account.places.makeDefault')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(t('account.places.removeConfirm', { name: p.label }))) remove.mutate(p.id, { onError: fail });
                      }}
                    >
                      {t('account.places.remove')}
                    </Button>
                  </div>
                </div>
                {editing?.id !== p.id && <PinPicker value={p} labels={labels} className="relative mt-3 h-40 w-full overflow-hidden rounded border border-ink/10" />}
              </li>
            ))}
          </ul>
        )}

        {data && data.length > 0 && data.length < CARE_LOCATIONS_MAX && !editing && (
          <Button type="button" variant="secondary" onClick={() => startEdit()}>
            {t('account.places.addAnother')}
          </Button>
        )}
        {error && !editing && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
