'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Trash2, UserRound } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import { useTranslation } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

export interface CaregiverPhotoState {
  hasPhoto: boolean;
  photoUrl: string | null;
  photoUpdatedAt: string | null;
}

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * The caregiver's profile photo, beside their name on the staff record. It is
 * the photo the public profile and search cards show. Staff can upload or
 * remove it (the API re-encodes every upload and drops location data); others
 * who can see the record see it read-only.
 *
 * Loaded through the signed-in API (not the public URL), so staff see it
 * whatever the caregiver's status - the public copy only exists while they
 * are listed.
 */
export function CaregiverPhoto({ caregiverId, name, canEdit }: { caregiverId: string; name: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const { data: info } = useQuery({
    queryKey: ['caregiver', caregiverId, 'photo'],
    queryFn: () => api.get<CaregiverPhotoState>(`/caregivers/${caregiverId}/photo/info`),
  });
  const { data: src } = useQuery({
    queryKey: ['caregiver', caregiverId, 'photo', 'file', info?.photoUpdatedAt],
    queryFn: async () => URL.createObjectURL(await api.download(`/caregivers/${caregiverId}/photo`)),
    enabled: Boolean(info?.hasPhoto),
    staleTime: Infinity,
  });
  useEffect(() => () => (src ? URL.revokeObjectURL(src) : undefined), [src]);

  const onDone = (state: CaregiverPhotoState) => {
    queryClient.setQueryData(['caregiver', caregiverId, 'photo'], state);
    if (input.current) input.current.value = '';
  };
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<CaregiverPhotoState>(`/caregivers/${caregiverId}/photo`, form);
    },
    onSuccess: onDone,
  });
  const remove = useMutation({ mutationFn: () => api.delete<CaregiverPhotoState>(`/caregivers/${caregiverId}/photo`), onSuccess: onDone });

  const onPick = (file: File | undefined) => {
    setLocalError(null);
    upload.reset();
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setLocalError(t('caregiverPhoto.tooLarge'));
      return;
    }
    upload.mutate(file);
  };

  const error = localError ?? [upload.error, remove.error].map((e) => (e ? (e instanceof ApiError ? e.message : t('common.actionFailed')) : null)).find(Boolean);
  const busy = upload.isPending || remove.isPending;
  const shown = info?.hasPhoto ? src : null;

  return (
    <div className="flex items-start gap-3">
      <div className={cn('relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-paper', busy && 'opacity-60')}>
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the signed-in API
          <img src={shown} alt={t('caregiverPhoto.alt', { name })} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink/30" aria-label={t('caregiverPhoto.none')}>
            <UserRound size={30} aria-hidden />
          </div>
        )}
      </div>
      {canEdit && (
        <div className="flex flex-col items-start gap-1 pt-1 print:hidden">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-dark hover:underline disabled:opacity-50">
            <Camera size={13} aria-hidden />
            {upload.isPending ? t('common.loading') : info?.hasPhoto ? t('caregiverPhoto.replace') : t('caregiverPhoto.upload')}
          </button>
          {info?.hasPhoto && (
            <button type="button" disabled={busy} onClick={() => remove.mutate()} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/50 hover:text-danger disabled:opacity-50">
              <Trash2 size={13} aria-hidden />
              {t('caregiverPhoto.remove')}
            </button>
          )}
          {error ? <p role="alert" className="max-w-[16rem] text-xs text-danger">{error}</p> : <p className="max-w-[16rem] text-xs text-ink/40">{t('caregiverPhoto.hint')}</p>}
        </div>
      )}
    </div>
  );
}
