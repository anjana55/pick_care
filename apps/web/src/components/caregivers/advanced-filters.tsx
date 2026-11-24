'use client';

import { useMemo } from 'react';
import { useSkills, useLanguages, useLocationTree } from '@/lib/hooks/use-caregivers';
import { useTranslation } from '@/lib/i18n/provider';
import { FilterDropdown } from '@/components/ui/filter-dropdown';
import type { CaregiverSearchFilters } from '@/lib/api/types';

export const AVAILABILITY_KEYS = ['dayDuty', 'nightDuty', 'liveIn24h'] as const;
export type AvailabilityKey = (typeof AVAILABILITY_KEYS)[number];
const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

/**
 * The Caregivers list's filters. Location is by district: a caregiver
 * matches when they live in, or would work in, any picked district (the API's
 * `districtIds`). The old picker went district -> city pills, which for a
 * 25-district, 2,155-city country was a list, not a filter.
 */
export interface AdvancedFilters {
  districtIds: number[];
  skillIds: string[];
  languageIds: string[];
  availability: AvailabilityKey[];
  gender?: string;
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFilters = {
  districtIds: [],
  skillIds: [],
  languageIds: [],
  availability: [],
  gender: undefined,
};

export function countActiveFilters(f: AdvancedFilters): number {
  return f.districtIds.length + f.skillIds.length + f.languageIds.length + f.availability.length + (f.gender ? 1 : 0);
}

export function toApiFilters(f: AdvancedFilters): Partial<CaregiverSearchFilters> {
  return {
    districtIds: f.districtIds.length ? f.districtIds : undefined,
    skillIds: f.skillIds.length ? f.skillIds : undefined,
    languageIds: f.languageIds.length ? f.languageIds : undefined,
    gender: f.gender || undefined,
    dayDuty: f.availability.includes('dayDuty') || undefined,
    nightDuty: f.availability.includes('nightDuty') || undefined,
    liveIn24h: f.availability.includes('liveIn24h') || undefined,
  };
}

/**
 * One row of compact dropdowns under the search box - District, Skills,
 * Languages, Availability, Gender - each naming what is picked, plus "Clear
 * all". Always visible, so there is no panel to open and no chips row to read.
 */
export function CaregiverFilterBar({ filters, onChange }: { filters: AdvancedFilters; onChange: (next: AdvancedFilters) => void }) {
  const { t, locale } = useTranslation();
  const { data: skills, isLoading: skillsLoading } = useSkills();
  const { data: languages, isLoading: languagesLoading } = useLanguages();
  const { data: tree, isLoading: treeLoading } = useLocationTree(locale);

  const districtOptions = useMemo(
    () =>
      (tree ?? [])
        .flatMap((p) => p.districts.map((d) => ({ value: d.id, label: d.name, hint: p.name })))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    [tree, locale],
  );
  const skillOptions = useMemo(() => (skills ?? []).map((s) => ({ value: s.id, label: s.name, hint: s.category })), [skills]);
  const languageOptions = useMemo(() => (languages ?? []).map((l) => ({ value: l.id, label: l.name })), [languages]);

  const common = {
    searchPlaceholder: t('caregivers.filters.searchPlaceholder'),
    noMatchesText: t('caregivers.filters.noMatches'),
    clearText: t('caregivers.filters.clear'),
  };
  const active = countActiveFilters(filters);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label={t('filters.button')}>
      <FilterDropdown
        label={t('caregivers.filters.district')}
        options={districtOptions}
        selected={filters.districtIds}
        onChange={(districtIds) => onChange({ ...filters, districtIds })}
        loading={treeLoading}
        hint={t('caregivers.filters.districtHint')}
        {...common}
      />
      <FilterDropdown
        label={t('caregivers.filters.skills')}
        options={skillOptions}
        selected={filters.skillIds}
        onChange={(skillIds) => onChange({ ...filters, skillIds })}
        loading={skillsLoading}
        hint={t('caregivers.filters.skillsHint')}
        {...common}
      />
      <FilterDropdown
        label={t('caregivers.filters.languages')}
        options={languageOptions}
        selected={filters.languageIds}
        onChange={(languageIds) => onChange({ ...filters, languageIds })}
        loading={languagesLoading}
        hint={t('caregivers.filters.languagesHint')}
        {...common}
      />
      <FilterDropdown
        label={t('caregivers.filters.availability')}
        options={AVAILABILITY_KEYS.map((k) => ({ value: k, label: t(`caregivers.filters.${k}`) }))}
        selected={filters.availability}
        onChange={(availability) => onChange({ ...filters, availability })}
        hint={t('caregivers.filters.availabilityHint')}
        {...common}
      />
      <FilterDropdown
        label={t('caregivers.filters.gender')}
        multiple={false}
        options={GENDERS.map((g) => ({ value: g, label: t(`personalInfo.options.gender.${g}`) }))}
        selected={filters.gender ? [filters.gender] : []}
        onChange={([gender]) => onChange({ ...filters, gender })}
        {...common}
      />
      {active > 0 && (
        <button type="button" onClick={() => onChange(EMPTY_ADVANCED_FILTERS)} className="px-1 text-xs font-medium text-ink/50 hover:text-danger">
          {t('filters.clearAll')}
        </button>
      )}
    </div>
  );
}
