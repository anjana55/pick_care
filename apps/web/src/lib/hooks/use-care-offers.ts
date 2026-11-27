'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OfferCandidateFilters, OfferCandidatePage, SendCareOfferInput, StaffCareOffer } from '@care-platform/shared';
import { api } from '../api/client';

const key = (requestId: string) => ['care-offers', requestId] as const;

/** The offers sent on one request. Refetched while open: a caregiver may answer at any moment. */
export function useRequestOffers(requestId: string) {
  return useQuery({
    queryKey: key(requestId),
    queryFn: () => api.get<StaffCareOffer[]>(`/care-requests/${requestId}/offers`),
    enabled: Boolean(requestId),
    refetchInterval: 30_000,
  });
}

export function useSendOffer(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendCareOfferInput) => api.post<StaffCareOffer[]>(`/care-requests/${requestId}/offers`, input),
    onSuccess: (data) => {
      queryClient.setQueryData(key(requestId), data);
      queryClient.invalidateQueries({ queryKey: ['offer-candidates', requestId] });
    },
  });
}

export function useWithdrawOffer(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (offerId: string) => api.post<StaffCareOffer[]>(`/care-requests/${requestId}/offers/${offerId}/withdraw`, {}),
    onSuccess: (data) => queryClient.setQueryData(key(requestId), data),
  });
}

/** The offer the request's caregiver accepted, for the booking form's rates. */
export function useAcceptedOffer(requestId: string) {
  return useQuery({
    queryKey: ['care-offer-accepted', requestId],
    queryFn: () => api.get<{ offer: StaffCareOffer | null }>(`/care-requests/${requestId}/offers/accepted`),
    enabled: Boolean(requestId),
  });
}

/** Caregivers to offer a request to: filtered, scored and paged by the API (GET .../offer-candidates). */
export function useOfferCandidates(requestId: string, filters: OfferCandidateFilters, enabled = true) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    params.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ['offer-candidates', requestId, qs],
    queryFn: () => api.get<OfferCandidatePage>(`/care-requests/${requestId}/offer-candidates${qs ? `?${qs}` : ''}`),
    enabled: Boolean(requestId) && enabled,
    placeholderData: keepPreviousData,
  });
}
