'use client';

import type { AddressSearchLabels } from './address-search';
import { useTranslation } from '@/lib/i18n/provider';

/** This app's wording for the address search box (the box itself carries no dictionary). */
export function useAddressSearchLabels(): AddressSearchLabels {
  const { t } = useTranslation();
  const p = (k: string) => t(`addressSearch.precision.${k}`);
  const n = (k: string) => t(`addressSearch.next.${k}`);
  return {
    label: t('addressSearch.label'),
    placeholder: t('addressSearch.placeholder'),
    searching: t('addressSearch.searching'),
    noMatches: t('addressSearch.noMatches'),
    mapSearchUnavailable: t('addressSearch.mapSearchUnavailable'),
    error: t('addressSearch.error'),
    precision: { ADDRESS: p('ADDRESS'), STREET: p('STREET'), AREA: p('AREA'), TOWN: p('TOWN') },
    next: { ADDRESS: n('ADDRESS'), STREET: n('STREET'), AREA: n('AREA'), TOWN: n('TOWN') },
  };
}
