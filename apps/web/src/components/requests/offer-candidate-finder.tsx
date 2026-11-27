'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Search, Star, X } from 'lucide-react';
import {
  MAX_CARE_OFFER_NOTE,
  OFFER_CANDIDATE_SORTS,
  type OfferCandidate,
  type OfferCandidateFilters,
  type OfferCandidateRequestFacts,
  type OfferCandidateSort,
} from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n/provider';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useOfferCandidates, useSendOffer } from '@/lib/hooks/use-care-offers';
import { CaregiverFilterBar, EMPTY_ADVANCED_FILTERS, toApiFilters, type AdvancedFilters } from '@/components/caregivers/advanced-filters';
import { useDebounced } from '@/components/requests/caregiver-picker';
import { CaregiverRef } from '@/components/caregivers/caregiver-ref';
import { FilterDropdown } from '@/components/ui/filter-dropdown';
import { StatusBadge } from '@/components/ui/badge';
import { ListPagination } from '@/components/ui/list-pagination';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { CAREGIVER_STATUS_OPTIONS } from '@/lib/caregiver-status';

const DEADLINES = [60, 240, 1440, 4320] as const;
const PAGE_SIZE = 10;
const money = (n: number) => n.toLocaleString('en-LK');

/** The request-only switches, in the order they show. */
const SWITCHES = ['doesCareType', 'freeByStart', 'noClash', 'hasAccount', 'includeOffered'] as const;
type SwitchKey = (typeof SWITCHES)[number];
type Switches = Record<SwitchKey, boolean>;
const DEFAULT_SWITCHES: Switches = { doesCareType: true, freeByStart: false, noClash: false, hasAccount: false, includeOffered: false };

/** The caregiver-list filters that say what the request asks for: its district, time of day and the client's gender preference. */
function fromRequest(r: OfferCandidateRequestFacts): AdvancedFilters {
  const availability: AdvancedFilters['availability'] =
    r.schedule === 'DAY' ? ['dayDuty'] : r.schedule === 'NIGHT' ? ['nightDuty'] : r.schedule === 'LIVE_IN_24H' ? ['liveIn24h'] : [];
  return { ...EMPTY_ADVANCED_FILTERS, districtIds: r.districtId ? [r.districtId] : [], availability, gender: r.genderPreference ?? undefined };
}

/**
 * Find the right caregivers for a request and offer it to one or several at
 * once. The search opens already narrowed to what the request asks for
 * (district, time of day, kind of care, gender preference) and ordered by the
 * matching agent's own score, with its reasons on each caregiver. Staff
 * widen or narrow it with the caregiver list's filters plus the ones that
 * only make sense here, tick the people they want, and send.
 */
export function OfferCandidateFinder({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [term, setTerm] = useState('');
  const search = useDebounced(term.trim());
  const [advanced, setAdvanced] = useState<AdvancedFilters | null>(null);
  const [switches, setSwitches] = useState<Switches>(DEFAULT_SWITCHES);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [minRating, setMinRating] = useState<number | undefined>();
  const [sort, setSort] = useState<OfferCandidateSort>('MATCH');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<string, OfferCandidate>>(new Map());
  const [minutes, setMinutes] = useState<number>(1440);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [failures, setFailures] = useState<{ name: string; message: string }[]>([]);
  const send = useSendOffer(requestId);

  const filters: OfferCandidateFilters = {
    search: search || undefined,
    ...toApiFilters(advanced ?? EMPTY_ADVANCED_FILTERS),
    statuses: statuses.length ? statuses : undefined,
    minRating,
    ...Object.fromEntries(SWITCHES.map((k) => [k, k === 'doesCareType' ? switches[k] : switches[k] || undefined])),
    sort,
    page,
    pageSize: PAGE_SIZE,
  };
  const { data, isFetching, isError } = useOfferCandidates(requestId, filters);
  const request = data?.request;

  // Open narrowed to what the request asks for, once we know what that is.
  useEffect(() => {
    if (request && advanced === null) setAdvanced(fromRequest(request));
  }, [request, advanced]);
  const ready = advanced !== null;

  // Any change of filter starts again from page 1.
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => (setPage(1), set(v));

  const slotsLeft = request?.slotsLeft ?? 0;
  const toggle = (c: OfferCandidate) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else if (next.size < slotsLeft) next.set(c.id, c);
      return next;
    });

  const statusOptions = useMemo(() => CAREGIVER_STATUS_OPTIONS.map((s) => ({ value: s, label: t(`caregivers.status.${s}`) })), [t]);
  const common = {
    searchPlaceholder: t('caregivers.filters.searchPlaceholder'),
    noMatchesText: t('caregivers.filters.noMatches'),
    clearText: t('caregivers.filters.clear'),
  };
  const message = (err: unknown) => (err instanceof ApiError && err.message ? err.message : t('careOffers.error'));

  /** One at a time, through the normal send with all its checks; whoever fails is listed and stays ticked. */
  const sendAll = async () => {
    setSending(true);
    setFailures([]);
    const failed: { name: string; message: string }[] = [];
    const left = new Map(selected);
    for (const c of selected.values()) {
      try {
        await send.mutateAsync({ caregiverId: c.id, expiresInMinutes: minutes, note: note.trim() || null });
        left.delete(c.id);
      } catch (err) {
        failed.push({ name: c.fullName, message: message(err) });
      }
    }
    setSending(false);
    setSelected(left);
    setFailures(failed);
    if (!failed.length) onDone();
  };

  return (
    <div className="space-y-3 rounded border border-border bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-ink">{t('offerFinder.title')}</h4>
          {request && <p className="text-xs text-ink/60">{requestSummary(request, t)}</p>}
        </div>
        <button type="button" onClick={onDone} aria-label={t('common.cancel')} className="rounded p-1.5 text-ink/50 hover:bg-paper hover:text-ink">
          <X size={16} />
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <Input
          className="pl-9"
          placeholder={t('requests.picker.caregiverSearch')}
          aria-label={t('requests.picker.caregiverSearch')}
          value={term}
          onChange={(e) => (setPage(1), setTerm(e.target.value))}
        />
      </div>

      {ready && (
        <>
          <CaregiverFilterBar filters={advanced} onChange={change(setAdvanced)} />
          <div className="-mt-2 flex flex-wrap items-center gap-2">
            <FilterDropdown
              label={t('offerFinder.status')}
              options={statusOptions}
              selected={statuses}
              onChange={change(setStatuses)}
              hint={t('offerFinder.statusHint')}
              {...common}
            />
            <Select
              aria-label={t('offerFinder.minRating')}
              value={minRating ?? ''}
              onChange={(e) => change(setMinRating)(e.target.value ? Number(e.target.value) : undefined)}
              className="h-8 w-auto py-0 text-xs"
            >
              <option value="">{t('offerFinder.anyRating')}</option>
              {[4.5, 4, 3.5, 3].map((r) => (
                <option key={r} value={r}>
                  {t('offerFinder.ratingAtLeast', { n: r })}
                </option>
              ))}
            </Select>
            {SWITCHES.map((k) => (
              <label
                key={k}
                className={cn(
                  'flex h-8 cursor-pointer items-center gap-1.5 rounded border px-2 text-xs',
                  switches[k] ? 'border-brand bg-brand-light text-brand-dark' : 'border-border text-ink/70',
                )}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={switches[k]}
                  onChange={(e) => change(setSwitches)({ ...switches, [k]: e.target.checked })}
                />
                {t(`offerFinder.switches.${k}`)}
              </label>
            ))}
            {request && (
              <button
                type="button"
                className="px-1 text-xs font-medium text-brand hover:underline"
                onClick={() => (
                  setPage(1),
                  setAdvanced(fromRequest(request)),
                  setSwitches(DEFAULT_SWITCHES),
                  setStatuses([]),
                  setMinRating(undefined),
                  setTerm('')
                )}
              >
                {t('offerFinder.resetToRequest')}
              </button>
            )}
            <span className="ml-auto flex items-center gap-1.5 text-xs text-ink/60">
              <label htmlFor="offer-sort">{t('offerFinder.sort')}</label>
              <Select id="offer-sort" value={sort} onChange={(e) => change(setSort)(e.target.value as OfferCandidateSort)} className="h-8 w-auto py-0 text-xs">
                {OFFER_CANDIDATE_SORTS.map((s) => (
                  <option key={s} value={s}>
                    {t(`offerFinder.sorts.${s}`)}
                  </option>
                ))}
              </Select>
            </span>
          </div>
        </>
      )}

      {isError && <p className="text-sm text-danger">{t('careOffers.error')}</p>}
      {data?.truncated && <p className="rounded bg-accent-light px-2 py-1 text-xs text-accent">{t('offerFinder.truncated')}</p>}

      {ready && data && (
        <>
          <p className="text-xs text-ink/60" aria-live="polite">
            {t('offerFinder.count', { count: data.total })}
            {slotsLeft < 10 && ` · ${t('offerFinder.slots', { n: slotsLeft })}`}
          </p>
          {data.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink/60">{t('offerFinder.none')}</p>
          ) : (
            <ul className={cn('divide-y divide-border rounded border border-border', isFetching && 'opacity-60')} aria-busy={isFetching}>
              {data.items.map((c) => (
                <CandidateRow
                  key={c.id}
                  c={c}
                  checked={selected.has(c.id)}
                  disabled={Boolean(c.offer) || (!selected.has(c.id) && selected.size >= slotsLeft)}
                  onToggle={() => toggle(c)}
                />
              ))}
            </ul>
          )}
          {data.total > PAGE_SIZE && (
            <ListPagination page={page} totalPages={Math.ceil(data.total / PAGE_SIZE)} total={data.total} noun={t('offerFinder.noun')} onPage={setPage} />
          )}
        </>
      )}

      {selected.size > 0 && (
        <div className="space-y-3 rounded bg-paper p-3">
          <p className="text-sm font-medium text-ink">
            {t('offerFinder.selected', { count: selected.size })}:{' '}
            <span className="font-normal">{[...selected.values()].map((c) => c.fullName).join(', ')}</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <div>
              <Label htmlFor="offer-deadline">{t('careOffers.deadline')}</Label>
              <Select id="offer-deadline" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {DEADLINES.map((m) => (
                  <option key={m} value={m}>
                    {t(`careOffers.deadlines.${m}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="offer-note">{t('careOffers.note')}</Label>
              <Input
                id="offer-note"
                value={note}
                maxLength={MAX_CARE_OFFER_NOTE}
                aria-describedby="offer-note-hint"
                onChange={(e) => setNote(e.target.value)}
              />
              <p id="offer-note-hint" className="mt-1 text-xs text-ink/50">
                {t('careOffers.noteHint')}
              </p>
            </div>
          </div>
          {failures.length > 0 && (
            <ul role="alert" className="space-y-0.5 text-sm text-danger">
              {failures.map((f) => (
                <li key={f.name}>
                  {f.name}: {f.message}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={sending} onClick={sendAll}>
              {sending ? t('common.loading') : t('offerFinder.send', { count: selected.size })}
            </Button>
            <Button size="sm" variant="secondary" disabled={sending} onClick={() => (setSelected(new Map()), setFailures([]))}>
              {t('offerFinder.clearSelection')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function requestSummary(r: OfferCandidateRequestFacts, t: (k: string, v?: Record<string, string | number>) => string): string {
  const parts = [
    r.careType ? t(`careTypes.${r.careType}`) : t('offerFinder.noCareType'),
    [r.cityName, r.districtName].filter(Boolean).join(', ') || t('offerFinder.noPlace'),
    r.schedule && r.schedule !== 'NOT_SURE' ? t(`offerFinder.schedules.${r.schedule}`) : null,
    r.startDate ? t('offerFinder.from', { date: r.startDate }) : null,
    r.genderPreference ? t(`offerFinder.prefers.${r.genderPreference}`) : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

function CandidateRow({ c, checked, disabled, onToggle }: { c: OfferCandidate; checked: boolean; disabled: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const place = [c.cityName, c.districtName].filter(Boolean).join(', ');
  const shifts = (['dayDuty', 'nightDuty', 'liveIn24h'] as const).filter((k) => c[k]).map((k) => t(`caregivers.filters.${k}`));
  return (
    <li className={cn('flex gap-3 px-3 py-2.5', checked && 'bg-brand-light/40')}>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        aria-label={t('offerFinder.pick', { name: c.fullName })}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/caregivers/${c.id}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-medium text-ink hover:underline">
            {c.fullName}
            <ExternalLink size={12} className="text-ink/40" aria-hidden />
          </Link>
          <span className="text-xs tabular-nums text-ink/50">{c.registrationNumber}</span>
          <CaregiverRef publicId={c.publicId} />
          <StatusBadge status={c.status as never} label={t(`caregivers.status.${c.status}`)} />
          {c.offer && (
            <span className="rounded bg-accent-light px-1.5 py-0.5 text-xs text-accent">
              {t('offerFinder.alreadyOffered', { status: t(`careOffers.statuses.${c.offer.status}`) })}
            </span>
          )}
          {!c.hasAccount && <span className="rounded bg-ink/10 px-1.5 py-0.5 text-xs text-ink/70">{t('offerFinder.noAccount')}</span>}
          {c.doesCareType === false && <span className="rounded bg-danger-light px-1.5 py-0.5 text-xs text-danger">{t('offerFinder.notThisCare')}</span>}
        </div>
        <p className="text-xs text-ink/70">
          {[
            place || null,
            c.travelsToCity ? t('offerFinder.travels') : null,
            shifts.length ? shifts.join(', ') : null,
            c.gender ? t(`personalInfo.options.gender.${c.gender}`) : null,
            c.phone,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-ink/70">
          <span className="inline-flex items-center gap-1">
            <Star size={12} className={c.ratingAverage !== null ? 'fill-accent text-accent' : 'text-ink/30'} aria-hidden />
            {c.ratingAverage !== null ? t('offerFinder.rating', { avg: c.ratingAverage.toFixed(1), count: c.ratingCount }) : t('offerFinder.unrated')}
          </span>
          <span>
            {c.ownRate
              ? t('offerFinder.ownRate', { amount: money(c.ownRate.amount), unit: t(`pricing.units.${c.ownRate.rateType}`) })
              : t('offerFinder.noOwnRate')}
          </span>
          {c.availableFrom && <span>{t('offerFinder.freeFrom', { date: c.availableFrom })}</span>}
          {c.runningBookings > 0 && <span className="text-danger">{t('offerFinder.busy', { count: c.runningBookings })}</span>}
        </p>
        {c.skills.length > 0 && <p className="truncate text-xs text-ink/50">{c.skills.join(', ')}</p>}
        {c.languages.length > 0 && <p className="truncate text-xs text-ink/50">{c.languages.join(', ')}</p>}
      </div>
      <div className="w-44 shrink-0 text-right">
        <span className="inline-block rounded bg-brand-light px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-dark" title={c.reasons.join('\n')}>
          {t('offerFinder.score', { n: c.score })}
        </span>
        <ul className="mt-1 space-y-0.5 text-[11px] leading-tight text-ink/60">
          {c.reasons.slice(0, 4).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}
