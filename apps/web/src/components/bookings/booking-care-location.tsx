'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import type { CareLocation, GeoPoint } from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n/provider';
import { ApiError } from '@/lib/api/client';
import {
  useAddCareLocation,
  useBookingCareLocation,
  useRemoveCareLocation,
  useSetBookingCareLocation,
  useUpdateCareLocation,
} from '@/lib/hooks/use-care-locations';
import { PinPicker } from '@/components/map/pin-picker';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';

const osm = (p: GeoPoint) => `https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=18/${p.latitude}/${p.longitude}`;

/**
 * Where a booking's care happens, on the map: the point its check-ins are
 * measured from. Staff can drop or move the pin, confirm a suggestion taken
 * from the first located check-in, and pick which of the client's places this
 * booking uses. Caregivers never see the point.
 */
export function BookingCareLocationPanel({ bookingId, patientId }: { bookingId: string; patientId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useBookingCareLocation(bookingId);
  const add = useAddCareLocation(patientId);
  const update = useUpdateCareLocation(patientId);
  const remove = useRemoveCareLocation(patientId);
  const choose = useSetBookingCareLocation(bookingId);
  const [editing, setEditing] = useState<{ id: string | null; point: GeoPoint | null; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const labels = { map: t('careLocation.map'), pin: t('careLocation.pin'), failed: t('careLocation.mapFailed') };
  const fail = (err: unknown) => setError(err instanceof ApiError && err.message ? err.message : t('careLocation.saveError'));

  if (isLoading || !data) return null;
  const { location, suggestion, options, chosenForBooking } = data;

  if (editing) {
    const save = () => {
      if (!editing.point) return;
      setError(null);
      const done = { onSuccess: () => setEditing(null), onError: fail };
      if (editing.id) update.mutate({ id: editing.id, ...editing.point, label: editing.label, isDefault: !options.length || undefined }, done);
      else add.mutate({ ...editing.point, label: editing.label || undefined }, done);
    };
    return (
      <div className="mt-3 space-y-2 border-t border-border pt-3">
        <p className="text-xs text-ink/60">{t('careLocation.editHint')}</p>
        <PinPicker value={editing.point} start={location ?? suggestion} onChange={(point) => setEditing({ ...editing, point })} labels={labels} />
        <div>
          <Label htmlFor="care-location-label">{t('careLocation.label')}</Label>
          <Input id="care-location-label" value={editing.label} maxLength={60} placeholder={t('careLocation.labelPlaceholder')} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={!editing.point || add.isPending || update.isPending}>
            {t('careLocation.save')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  const place = (p: CareLocation) => (
    <a className="text-brand-dark hover:underline" target="_blank" rel="noreferrer" href={osm(p)}>
      {t('careLocation.openMap')}
    </a>
  );

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
      <p className="flex items-center gap-1 font-medium text-ink">
        <MapPin size={14} aria-hidden />
        {t('careLocation.title')}
      </p>
      {location ? (
        <>
          <p className="text-ink/70">
            {location.label} · {chosenForBooking ? t('careLocation.forThisBooking') : t('careLocation.clientDefault')} · {place(location)}
          </p>
          <PinPicker value={location} labels={labels} className="relative h-40 w-full overflow-hidden rounded border border-ink/10" />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing({ id: location.id, point: location, label: location.label })}>
              {t('careLocation.move')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing({ id: null, point: null, label: '' })}>
              {t('careLocation.addAnother')}
            </Button>
            {options.length > 1 && (
              <Select
                aria-label={t('careLocation.useFor')}
                className="h-8 max-w-[14rem] text-sm"
                value={chosenForBooking ? location.id : ''}
                onChange={(e) => choose.mutate(e.target.value || null, { onError: fail })}
              >
                <option value="">{t('careLocation.useDefault')}</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </>
      ) : suggestion ? (
        <div className="space-y-2 rounded border border-accent/30 bg-accent-light p-2">
          <p className="text-accent">{t('careLocation.suggested')}</p>
          <PinPicker value={suggestion} labels={labels} className="relative h-40 w-full overflow-hidden rounded border border-ink/10" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => update.mutate({ id: suggestion.id, confirm: true, isDefault: true }, { onError: fail })} disabled={update.isPending}>
              {t('careLocation.confirm')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing({ id: suggestion.id, point: suggestion, label: suggestion.label })}>
              {t('careLocation.moveAndConfirm')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(suggestion.id, { onError: fail })} disabled={remove.isPending}>
              {t('careLocation.discard')}
            </Button>
            {place(suggestion)}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-ink/60">{t('careLocation.none')}</p>
          <Button size="sm" variant="secondary" onClick={() => setEditing({ id: null, point: null, label: '' })}>
            {t('careLocation.add')}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
