'use client';

// NOTE: this file is duplicated verbatim in apps/web and apps/public-web, like pin-picker.tsx.
// Change both together. Every visible string and the search call come in as props, so it
// carries no dependency on either app's dictionaries or API client.

import { useEffect, useId, useRef, useState } from 'react';
import { ADDRESS_SEARCH_MIN_LENGTH, type AddressMatch, type AddressPrecision, type AddressSearchResult } from '@care-platform/shared';

export interface AddressSearchLabels {
  /** Label and placeholder of the box. */
  label: string;
  placeholder: string;
  searching: string;
  noMatches: string;
  /** Shown under the results when only towns could be searched. */
  mapSearchUnavailable: string;
  /** What each kind of match is, shown beside it ("Street", "Town"). */
  precision: Record<AddressPrecision, string>;
  /** After a pick: what to do next ("Now drag the pin onto the house"). */
  next: Record<AddressPrecision, string>;
  error: string;
}

/**
 * "Find an address" above a pin map: type an address, street, landmark or
 * town; pick a match and the map flies there with the pin on it, ready to be
 * dragged onto the house. For people who know the address but not where it
 * is on the map.
 */
export function AddressSearch({
  search,
  onPick,
  labels,
}: {
  search: (q: string) => Promise<AddressSearchResult>;
  onPick: (m: AddressMatch) => void;
  labels: AddressSearchLabels;
}) {
  const id = useId();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<AddressMatch[] | null>(null);
  const [partial, setPartial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<AddressMatch | null>(null);
  const searchRef = useRef(search);
  searchRef.current = search;
  const seq = useRef(0);

  // Search when typing pauses; only the latest answer counts.
  useEffect(() => {
    const q = term.trim();
    if (q.length < ADDRESS_SEARCH_MIN_LENGTH || (picked && q === picked.label)) {
      setResults(null);
      return;
    }
    const mine = ++seq.current;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      setFailed(false);
      try {
        const r = await searchRef.current(q);
        if (mine !== seq.current) return;
        setResults(r.results);
        setPartial(r.mapSearchUnavailable);
        setActive(0);
        setOpen(true);
      } catch {
        if (mine === seq.current) setFailed(true);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [term, picked]);

  const choose = (m: AddressMatch) => {
    setPicked(m);
    setTerm(m.label);
    setOpen(false);
    setResults(null);
    onPick(m);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !results?.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') setOpen(false);
  };

  const listId = `${id}-results`;
  const showList = open && results !== null;
  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className="mb-1 block text-sm font-medium text-ink">
        {labels.label}
      </label>
      <input
        id={`${id}-input`}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results?.length ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        value={term}
        placeholder={labels.placeholder}
        onChange={(e) => (setTerm(e.target.value), setPicked(null))}
        onKeyDown={onKey}
        onFocus={() => results && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className="w-full rounded border border-ink/20 bg-white px-3 py-2 text-base text-ink placeholder:text-ink/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <p aria-live="polite" className="mt-1 min-h-[1.25rem] text-xs text-ink/60">
        {busy ? labels.searching : failed ? <span className="text-red-700">{labels.error}</span> : picked ? labels.next[picked.precision] : ''}
      </p>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[4.25rem] z-20 max-h-72 overflow-auto rounded border border-ink/15 bg-white py-1 shadow-lg"
        >
          {results!.length === 0 && <li className="px-3 py-2 text-sm text-ink/60">{labels.noMatches}</li>}
          {results!.map((m, i) => (
            <li
              key={`${m.source}-${m.latitude}-${m.longitude}-${m.label}`}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => (e.preventDefault(), choose(m))}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-start justify-between gap-3 px-3 py-2 ${i === active ? 'bg-brand/10' : ''}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{m.label}</span>
                {m.detail && <span className="block truncate text-xs text-ink/60">{m.detail}</span>}
              </span>
              <span className="shrink-0 rounded bg-ink/5 px-1.5 py-0.5 text-[11px] text-ink/60">{labels.precision[m.precision]}</span>
            </li>
          ))}
          {partial && <li className="border-t border-ink/10 px-3 py-1.5 text-xs text-ink/50">{labels.mapSearchUnavailable}</li>}
        </ul>
      )}
    </div>
  );
}
