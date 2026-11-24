'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterOption<V extends string | number> {
  value: V;
  label: string;
  /** A smaller second line, e.g. a skill's category. */
  hint?: string | null;
}

/**
 * One compact filter on a list toolbar: a button that names what is picked
 * ("District: Kandy +1"), opening a short checklist. Replaces the old open
 * panel of pills, where every option of every facet was on screen at once.
 *
 * `multiple` false makes it a single choice (picking the current one again
 * clears it). Long lists get a search box. Closes on Escape and outside click.
 */
export function FilterDropdown<V extends string | number>({
  label,
  options,
  selected,
  onChange,
  multiple = true,
  loading = false,
  hint,
  searchPlaceholder,
  noMatchesText,
  clearText,
}: {
  label: string;
  options: FilterOption<V>[];
  selected: V[];
  onChange: (next: V[]) => void;
  multiple?: boolean;
  loading?: boolean;
  /** One line under the list header, e.g. "Must have all selected". */
  hint?: string;
  searchPlaceholder: string;
  noMatchesText: string;
  clearText: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return q ? options.filter((o) => o.label.toLocaleLowerCase().includes(q) || o.hint?.toLocaleLowerCase().includes(q)) : options;
  }, [options, query]);

  const selectedLabels = options.filter((o) => selected.includes(o.value)).map((o) => o.label);
  const summary = selectedLabels.length === 0 ? null : selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels[0]} +${selectedLabels.length - 1}`;

  const toggle = (value: V) => {
    if (multiple) {
      onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
    } else {
      onChange(selected.includes(value) ? [] : [value]);
      setOpen(false);
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-9 max-w-[16rem] items-center gap-1.5 rounded border px-3 text-sm transition-colors',
          summary ? 'border-brand bg-brand-light text-brand-dark' : 'border-border bg-white text-ink/70 hover:bg-paper',
        )}
      >
        <span className={cn('shrink-0', summary && 'font-medium')}>{label}</span>
        {summary && <span className="truncate">: {summary}</span>}
        <ChevronDown size={14} className={cn('shrink-0 opacity-60 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-1 w-72 rounded-lg border border-border bg-white shadow-lg">
          {options.length > 8 && (
            <div className="relative border-b border-border p-2">
              <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/40" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded border border-border pl-8 pr-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
          )}
          {hint && <p className="px-3 pt-2 text-xs text-ink/50">{hint}</p>}
          <ul id={listId} role="listbox" aria-multiselectable={multiple} aria-label={label} className="max-h-72 overflow-y-auto py-1">
            {loading && <li className="px-3 py-2 text-sm text-ink/40">…</li>}
            {!loading && visible.length === 0 && <li className="px-3 py-2 text-sm text-ink/40">{noMatchesText}</li>}
            {visible.map((o) => {
              const on = selected.includes(o.value);
              return (
                <li key={String(o.value)} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-start gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-paper"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border',
                        multiple ? 'rounded' : 'rounded-full',
                        on ? 'border-brand bg-brand text-white' : 'border-border bg-white',
                      )}
                      aria-hidden
                    >
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-ink">{o.label}</span>
                      {o.hint && <span className="block text-xs text-ink/40">{o.hint}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected.length > 0 && (
            <div className="border-t border-border px-3 py-2 text-right">
              <button type="button" onClick={() => onChange([])} className="text-xs font-medium text-ink/50 hover:text-danger">
                {clearText}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
