'use client';

import { useState } from 'react';
import type { PresenceSlot, StaffPresence } from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n/provider';
import { useVisitPresence } from '@/lib/hooks/use-check-in';
import { fmtTime } from '@/lib/colombo-time';
import { LiveMap } from '@/components/map/live-map';
import { cn } from '@/lib/utils';

const DOT: Record<PresenceSlot, string> = {
  IN: 'bg-brand',
  AWAY: 'bg-accent',
  NONE: 'bg-ink/20',
  UNKNOWN: 'bg-ink/40',
};

/**
 * Location checks during a visit (GPS tracking C), for staff: one dot per
 * interval - at the home, away, no check, or no place on the map to compare
 * with - the counts, the caregiver's answer to "Still with …?", and, on
 * request, the checks on a map (opening it is audited).
 */
export function PresenceStrip({ shiftId, presence, withMap = false }: { shiftId: string; presence: StaffPresence; withMap?: boolean }) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data } = useVisitPresence(shiftId, open);
  const label = (s: PresenceSlot) => t(`visits.presence.slot.${s}`);
  return (
    <div className="mt-1 space-y-1 text-xs text-ink/60">
      <p>
        {t('visits.presence.summary', { every: presence.everyMinutes, inside: presence.inside, away: presence.away, none: presence.none })}
        {presence.open ? ` · ${t('visits.presence.running')}` : ''}
      </p>
      {presence.slots.length > 0 && (
        <ol className="flex flex-wrap gap-1" aria-label={t('visits.presence.strip')}>
          {presence.slots.map((s, i) => (
            <li key={i} title={label(s)} aria-label={label(s)} className={cn('h-2.5 w-2.5 rounded-full', DOT[s])} />
          ))}
        </ol>
      )}
      {presence.reply && presence.repliedAt && (
        <p>{t(`visits.presence.reply.${presence.reply}`, { time: fmtTime(presence.repliedAt, locale) })}</p>
      )}
      {presence.endReason === 'STOPPED' && presence.endedAt && <p className="text-danger">{t('visits.presence.stopped', { time: fmtTime(presence.endedAt, locale) })}</p>}
      {presence.mocked > 0 && <p className="text-danger">{t('visits.presence.mocked', { n: presence.mocked })}</p>}
      {withMap && (
        <button type="button" className="text-brand-dark hover:underline" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? t('visits.presence.hideMap') : t('visits.presence.showMap')}
        </button>
      )}
      {open && data && (
        <LiveMap
          caregivers={data.points.map((p, i) => ({ id: String(i), label: `${fmtTime(p.at, locale)} · ${p.inside === false ? label('AWAY') : p.inside ? label('IN') : label('UNKNOWN')}`, latitude: p.latitude, longitude: p.longitude }))}
          homes={data.home ? [{ id: 'home', label: t('careLocation.pin'), ...data.home }] : []}
          label={t('visits.presence.map')}
          failedText={t('careLocation.mapFailed')}
          className="relative h-56 w-full overflow-hidden rounded border border-ink/10"
        />
      )}
    </div>
  );
}
