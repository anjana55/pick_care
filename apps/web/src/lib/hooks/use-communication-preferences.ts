'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CommunicationPreferences, UpdateCommunicationPreferences } from '@care-platform/shared';
import { api } from '../api/client';

/** Whose preferences: a caregiver or a client (patient) record. */
export type PreferencesSubject = { kind: 'CAREGIVER'; id: string } | { kind: 'CLIENT'; id: string };

const path = (s: PreferencesSubject) => `/${s.kind === 'CAREGIVER' ? 'caregivers' : 'patients'}/${s.id}/communication-preferences`;
const key = (s: PreferencesSubject) => ['communication-preferences', s.kind, s.id];

export function useCommunicationPreferences(subject: PreferencesSubject) {
  return useQuery({ queryKey: key(subject), queryFn: () => api.get<CommunicationPreferences>(path(subject)) });
}

export function useUpdateCommunicationPreferences(subject: PreferencesSubject) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateCommunicationPreferences) => api.patch<CommunicationPreferences>(path(subject), data),
    onSuccess: (saved) => {
      qc.setQueryData(key(subject), saved);
      // The details page shows the contact method (and auto notify) too.
      qc.invalidateQueries({ queryKey: [subject.kind === 'CAREGIVER' ? 'caregiver' : 'client', subject.id] });
    },
  });
}
