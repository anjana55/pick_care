'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import type { StaffLiveShare } from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n/provider';
import { useLiveVisits } from '@/lib/hooks/use-check-in';
import { fmtTime } from '@/lib/colombo-time';
import { LiveMap } from '@/components/map/live-map';
import { Button } from '@/components/ui/button';

/**
 * Today's visits: caregivers on their way right now (GPS tracking B). Closed
 * until a staff member opens it; opening it is written to the audit log.
 * Positions refresh every 20 seconds while it is open.
 */
export function LiveVisitsPanel({ onTheWay }: { onTheWay: number }) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useLiveVisits(open);
  if (!onTheWay && !open) return null;
  const shares = (data ?? []).filter((s) => s.kind === 'ON_THE_WAY');
  const eta = (s: StaffLiveShare) =>
    s.stale
      ? t('visits.live.stale')
      : s.eta.arriving
        ? t('visits.note.arriving')
        : s.eta.minutes !== null
          ? t('visits.note.onTheWayEta', { minutes: s.eta.minutes })
          : t('visits.note.onTheWay');

  return (
    <section aria-labelledby="live-heading" className="mb-6 rounded border border-border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="live-heading" className="flex items-center gap-1 text-sm font-semibold text-ink">
          <MapPin size={14} aria-hidden />
          {t('visits.live.title', { n: open ? shares.length : onTheWay })}
        </h2>
        <Button size="sm" variant="secondary" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? t('visits.live.hide') : t('visits.live.show')}
        </Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-ink/50">{t('visits.live.audited')}</p>
          {isLoading && <p className="text-sm text-ink/50">{t('common.loading')}</p>}
          {data && shares.length === 0 && <p className="text-sm text-ink/50">{t('visits.live.none')}</p>}
          {shares.length > 0 && (
            <>
              <LiveMap
                caregivers={shares
                  .filter((s) => s.position)
                  .map((s) => ({ id: s.shareId, label: `${s.caregiverName} · ${s.bookingReference}`, ...s.position! }))}
                homes={shares.filter((s) => s.home).map((s) => ({ id: s.shareId, label: s.clientName, ...s.home! }))}
                label={t('visits.live.map')}
                failedText={t('careLocation.mapFailed')}
                className="relative h-80 w-full overflow-hidden rounded border border-ink/10"
              />
              <ul className="divide-y divide-border text-sm">
                {shares.map((s) => (
                  <li key={s.shareId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium text-ink">{s.caregiverName}</span>{' '}
                      <span className="text-ink/60">
                        → {s.clientName} ·{' '}
                        <Link href={`/bookings/${s.bookingId}`} className="text-brand-dark hover:underline">
                          {s.bookingReference}
                        </Link>{' '}
                        · {fmtTime(s.startsAt, locale)}
                      </span>
                    </span>
                    <span className={s.stale ? 'text-ink/50' : 'text-brand-dark'}>
                      {eta(s)}
                      {s.position?.mocked ? ` · ${t('visits.live.mocked')}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
