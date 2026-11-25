'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingCareLocation, CareLocation, CareLocationInput, CareLocationUpdate } from '@care-platform/shared';
import { api } from '@/lib/api/client';

const KEY = ['care-locations'] as const;

/** Where one booking's care happens: the place used, a suggestion from a check-in, and the client's places. */
export function useBookingCareLocation(bookingId: string) {
  return useQuery({ queryKey: [...KEY, 'booking', bookingId], queryFn: () => api.get<BookingCareLocation>(`/bookings/${bookingId}/care-location`), enabled: Boolean(bookingId) });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: KEY });
    queryClient.invalidateQueries({ queryKey: ['bookings', 'detail'] });
  };
}

export function useAddCareLocation(patientId: string) {
  const done = useInvalidate();
  return useMutation({ mutationFn: (body: CareLocationInput) => api.post<CareLocation>(`/patients/${patientId}/care-locations`, body), onSuccess: done });
}

export function useUpdateCareLocation(patientId: string) {
  const done = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: CareLocationUpdate & { id: string }) => api.patch<CareLocation>(`/patients/${patientId}/care-locations/${id}`, body),
    onSuccess: done,
  });
}

export function useRemoveCareLocation(patientId: string) {
  const done = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.delete<{ ok: true }>(`/patients/${patientId}/care-locations/${id}`), onSuccess: done });
}

/** Point the booking at one of the client's places, or back to their default (null). */
export function useSetBookingCareLocation(bookingId: string) {
  const done = useInvalidate();
  return useMutation({ mutationFn: (careLocationId: string | null) => api.put<BookingCareLocation>(`/bookings/${bookingId}/care-location`, { careLocationId }), onSuccess: done });
}
