'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { CareLocationSuggestion } from '@care-platform/shared';
import { api } from '@/lib/api/client';
import { useTranslation } from '@/lib/i18n/provider';
import { fmtDateTime } from '@/lib/colombo-time';
import { PinPicker } from '@/components/map/pin-picker';

/**
 * Places to confirm (Needs attention): points taken from a client's first
 * located check-in, waiting for staff. Each links to the booking, where
 * staff confirm, move or discard it. Until then, check-ins are not measured
 * from it.
 */
export default function PlacesToConfirmPage() {
  const { t, locale } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['care-locations', 'suggestions'],
    queryFn: () => api.get<CareLocationSuggestion[]>('/care-locations/suggestions'),
  });
  const labels = { map: t('careLocation.map'), pin: t('careLocation.pin'), failed: t('careLocation.mapFailed') };
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold text-ink">{t('placesToConfirm.title')}</h1>
      <p className="mt-1 text-sm text-ink/60">{t('placesToConfirm.subtitle')}</p>
      <div className="mt-4 space-y-3">
        {isLoading && <p className="text-sm text-ink/50">{t('common.loading')}</p>}
        {data && data.length === 0 && <p className="text-sm text-ink/50">{t('placesToConfirm.none')}</p>}
        {data?.map((p) => (
          <article key={p.id} className="grid gap-3 rounded-lg border border-border bg-white p-4 sm:grid-cols-[1fr_16rem]">
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-ink">{p.clientName}</p>
              <p className="text-ink/60">{t('placesToConfirm.from', { when: fmtDateTime(p.suggestedAt, locale) })}</p>
              {p.bookingId ? (
                <Link href={`/bookings/${p.bookingId}`} className="inline-block font-medium text-brand-dark hover:underline">
                  {t('placesToConfirm.open', { reference: p.bookingReference ?? '' })}
                </Link>
              ) : null}
            </div>
            <PinPicker value={p} labels={labels} className="relative h-36 w-full overflow-hidden rounded border border-ink/10" />
          </article>
        ))}
      </div>
    </div>
  );
}
