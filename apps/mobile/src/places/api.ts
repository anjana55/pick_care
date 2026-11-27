import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CareLocation, CareLocationInput, CareLocationUpdate } from '@care-platform/shared';
import { api } from '@/api';
import { useClient } from '@/care/api';

/** "Where care happens": the client's places on the map (GET/POST/PATCH/DELETE /me/care-locations). */
const key = (userId: string | undefined) => ['client-care', userId ?? 'none', 'care-locations'] as const;

export function useMyPlaces() {
  const client = useClient();
  return useQuery({ queryKey: key(client?.userId), queryFn: () => api.get<CareLocation[]>('/me/care-locations'), enabled: Boolean(client) });
}

export function useSavePlace() {
  const qc = useQueryClient();
  const client = useClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CareLocationUpdate & { id?: string }) =>
      id
        ? api.patch<CareLocation>(`/me/care-locations/${encodeURIComponent(id)}`, body)
        : api.post<CareLocation>('/me/care-locations', body as CareLocationInput),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(client?.userId) }),
  });
}

export function useRemovePlace() {
  const qc = useQueryClient();
  const client = useClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/me/care-locations/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(client?.userId) }),
  });
}
