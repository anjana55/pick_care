'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CommunicationPreferences, UpdateCommunicationPreferences } from '@care-platform/shared';
import { api } from '../api/client';
import { useBellUser } from './use-notifications';

/** The signed-in client's or caregiver's own communication preferences. */
export function useMyCommunicationPreferences() {
  const user = useBellUser();
  return useQuery({
    queryKey: ['communication-preferences', user?.userId ?? null],
    queryFn: () => api.get<CommunicationPreferences>('/me/communication-preferences'),
    enabled: Boolean(user),
  });
}

export function useUpdateMyCommunicationPreferences() {
  const user = useBellUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateCommunicationPreferences) => api.patch<CommunicationPreferences>('/me/communication-preferences', data),
    onSuccess: (saved) => qc.setQueryData(['communication-preferences', user?.userId ?? null], saved),
  });
}
