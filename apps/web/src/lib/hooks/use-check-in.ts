'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { CheckInSettings, StaffCheckIn, StaffCheckInInput, StaffLiveShare, StaffPresenceDetail, TodayVisits } from '@care-platform/shared';
import { api } from '@/lib/api/client';

const KEY = ['visits'] as const;
type AdminCheckInSettings = CheckInSettings & { updatedAt: string };

/** Today's roster with where every visit stands. Refreshed every minute: "late" depends on the clock. */
export function useTodayVisits(enabled = true) {
  return useQuery({ queryKey: [...KEY, 'today'], queryFn: () => api.get<TodayVisits>('/visits/today'), enabled, refetchInterval: 60_000 });
}

/** Record a check-in or a check-out on a caregiver's behalf. */
export function useRecordVisit(shiftId: string, what: 'check-in' | 'check-out') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StaffCheckInInput) => api.post<StaffCheckIn>(`/visits/${shiftId}/${what}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ['bookings', 'detail'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
    },
  });
}

/** Staff: the caregiver who said they cannot make a shift can after all (waiting cover offers are withdrawn). */
export function useClearCantMake(shiftId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ ok: true }>(`/visits/${shiftId}/cant-make`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ['bookings', 'detail'] });
    },
  });
}

export function useCheckInSettings() {
  return useQuery({ queryKey: [...KEY, 'settings'], queryFn: () => api.get<AdminCheckInSettings>('/settings/check-in') });
}

export function useUpdateCheckInSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CheckInSettings>) => api.patch<AdminCheckInSettings>('/settings/check-in', body),
    onSuccess: (data) => {
      queryClient.setQueryData([...KEY, 'settings'], data);
      queryClient.invalidateQueries({ queryKey: [...KEY, 'today'] });
    },
  });
}

/**
 * Everyone sharing their location right now (GPS tracking B), looked at again
 * every 20 seconds while the map is open. The first look says it is an
 * opening (?opened=1), which the API writes to the audit log.
 */
export function useLiveVisits(enabled: boolean) {
  const opened = useRef(false);
  useEffect(() => {
    if (!enabled) opened.current = false;
  }, [enabled]);
  return useQuery({
    queryKey: ['visits', 'live'],
    queryFn: () => {
      const first = !opened.current;
      opened.current = true;
      return api.get<StaffLiveShare[]>('/visits/live', first ? { opened: '1' } : undefined);
    },
    enabled,
    refetchInterval: 20_000,
    gcTime: 0,
  });
}

/** The checks during one visit, with their points, for the map behind the dot strip (GPS tracking C). Audited by the API. */
export function useVisitPresence(shiftId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['visits', 'presence', shiftId],
    queryFn: () => api.get<StaffPresenceDetail | null>(`/visits/${shiftId}/presence`),
    enabled,
    staleTime: 60_000,
  });
}
