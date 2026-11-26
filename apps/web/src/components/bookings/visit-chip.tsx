'use client';

import type { StaffCheckIn, VisitState } from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n/provider';
import { fmtTime } from '@/lib/colombo-time';
import { cn } from '@/lib/utils';
import { PresenceStrip } from './presence-strip';

const TONE: Record<VisitState, string> = {
  UPCOMING: 'bg-ink/5 text-ink/60',
  DUE: 'bg-accent-light text-accent',
  LATE: 'bg-danger-light text-danger',
  IN: 'bg-brand text-white',
  OUT: 'bg-brand-light text-brand-dark',
  NOT_RECORDED: 'bg-ink/10 text-ink/60',
};

/**
 * Where one visit's check-in stands, in a few words: "Checked in 08:03",
 * "Late - 22 min", "Left 17:02". The same chip on the booking page and on
 * Today's visits.
 */
export function VisitChip({ checkIn, minutesLate }: { checkIn: StaffCheckIn; minutesLate?: number | null }) {
  const { t, locale } = useTranslation();
  const text =
    checkIn.state === 'IN' && checkIn.checkedInAt
      ? t('visits.state.inAt', { time: fmtTime(checkIn.checkedInAt, locale) })
      : checkIn.state === 'OUT' && checkIn.checkedOutAt
        ? t('visits.state.outAt', { time: fmtTime(checkIn.checkedOutAt, locale) })
        : checkIn.state === 'LATE' && minutesLate
          ? t('visits.state.lateBy', { n: minutesLate })
          : t(`visits.state.${checkIn.state}`);
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium', TONE[checkIn.state])}>{text}</span>;
}

/** The small print under a visit: who recorded it, anything odd about it. Nothing when there is nothing to say. */
export function VisitNotes({ checkIn, shiftId, withMap = false }: { checkIn: StaffCheckIn; shiftId: string; withMap?: boolean }) {
  const { t, locale } = useTranslation();
  const lines: { text: string; warn?: boolean }[] = [];
  if (checkIn.onTheWay) {
    const o = checkIn.onTheWay;
    lines.push({ text: o.arriving ? t('visits.note.arriving') : o.etaMinutes !== null ? t('visits.note.onTheWayEta', { minutes: o.etaMinutes }) : t('visits.note.onTheWay') });
  }
  if (checkIn.checkedInAt && checkIn.checkedOutAt) lines.push({ text: t('visits.note.inAndOut', { in: fmtTime(checkIn.checkedInAt, locale), out: fmtTime(checkIn.checkedOutAt, locale) }) });
  if (checkIn.inBy === 'STAFF') lines.push({ text: t('visits.note.inByStaff', { name: checkIn.inByName ?? '—' }) + (checkIn.inNote ? ` — ${checkIn.inNote}` : '') });
  if (checkIn.outBy === 'STAFF') lines.push({ text: t('visits.note.outByStaff', { name: checkIn.outByName ?? '—' }) + (checkIn.outNote ? ` — ${checkIn.outNote}` : '') });
  if (checkIn.inBy === 'CAREGIVER' && !checkIn.inLocation) lines.push({ text: t('visits.note.noPosition') });
  const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
  if (checkIn.inFar && checkIn.inDistanceM !== null) {
    lines.push({ text: t(checkIn.inDistanceFrom === 'PIN' ? 'visits.note.farFromHome' : 'visits.note.far', { distance: metres(checkIn.inDistanceM) }), warn: true });
  }
  if (checkIn.inMocked) lines.push({ text: t('visits.note.mockedIn'), warn: true });
  if (checkIn.outFar && checkIn.outDistanceM !== null) lines.push({ text: t('visits.note.outFarFromHome', { distance: metres(checkIn.outDistanceM) }), warn: true });
  if (checkIn.outMocked) lines.push({ text: t('visits.note.mockedOut'), warn: true });
  if (checkIn.codeLocked) lines.push({ text: t('visits.note.locked'), warn: true });
  else if (!checkIn.checkedInAt && checkIn.wrongCodes > 0) lines.push({ text: t('visits.note.wrongCodes', { n: checkIn.wrongCodes }) });
  if (!lines.length && !checkIn.inLocation && !checkIn.presence) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-ink/60">
      {lines.map((line) => (
        <li key={line.text} className={line.warn ? 'text-danger' : undefined}>
          {line.text}
        </li>
      ))}
      {checkIn.presence && (
        <li>
          <PresenceStrip shiftId={shiftId} presence={checkIn.presence} withMap={withMap} />
        </li>
      )}
      {checkIn.inLocation && (
        <li>
          <a className="text-brand-dark hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${checkIn.inLocation.latitude}&mlon=${checkIn.inLocation.longitude}#map=17/${checkIn.inLocation.latitude}/${checkIn.inLocation.longitude}`}>
            {t('visits.note.map')}
          </a>
        </li>
      )}
    </ul>
  );
}
