'use client';

import type { ClientBooking } from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n';
import { useBookingLive } from '@/lib/hooks/use-client-care';
import { LiveMap } from '@/components/map/live-map';

/**
 * "Nimal is on the way" (GPS tracking B), as in the app: for each booking
 * whose caregiver tapped On my way and has not checked in, about how long
 * until they arrive and a small map with them and the home. Gone once they
 * check in.
 */
export function OnTheWay({ bookings }: { bookings: ClientBooking[] }) {
  const coming = bookings.filter((b) => b.shifts.some((s) => s.visit?.onTheWay));
  if (!coming.length) return null;
  return (
    <div className="space-y-3">
      {coming.map((b) => (
        <OnTheWayCard key={b.id} bookingId={b.id} />
      ))}
    </div>
  );
}

function OnTheWayCard({ bookingId }: { bookingId: string }) {
  const { t } = useTranslation();
  const { data } = useBookingLive(bookingId);
  if (!data || data.status !== 'ON_THE_WAY') return null;
  const eta = data.stale
    ? t('onTheWay.stale')
    : data.eta.arriving
      ? t('onTheWay.arriving')
      : data.eta.minutes !== null
        ? t('onTheWay.minutes', { minutes: data.eta.minutes })
        : data.position
          ? t('onTheWay.noHome')
          : t('onTheWay.waiting');
  return (
    <section className="space-y-2 rounded-lg border border-brand/40 bg-white p-4" aria-labelledby={`otw-${bookingId}`} data-testid={`on-the-way-${bookingId}`}>
      <h2 id={`otw-${bookingId}`} className="text-base font-semibold text-ink">
        {t('onTheWay.title', { name: data.caregiverName })}
      </h2>
      <p aria-live="polite" className={`text-sm font-medium ${data.stale ? 'text-ink/60' : 'text-brand-dark'}`}>
        {eta}
      </p>
      {data.position && (
        <LiveMap
          caregivers={[{ id: data.shiftId, label: data.caregiverName, ...data.position }]}
          homes={data.home ? [{ id: 'home', label: t('onTheWay.home'), ...data.home }] : []}
          label={t('onTheWay.map')}
          failedText={t('account.places.mapFailed')}
        />
      )}
    </section>
  );
}
