'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Trash2 } from 'lucide-react';
import { api, ApiError, fetchBlob } from '@/lib/api/client';
import { useTranslation } from '@/lib/i18n';
import { useCaregiverId } from '@/lib/hooks/use-caregiver-portal';
import { CaregiverAvatar } from '@/components/results/caregiver-avatar';

interface PhotoState {
  hasPhoto: boolean;
  photoUrl: string | null;
  photoUpdatedAt: string | null;
}

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * The caregiver's own profile photo: the one families see on their public
 * profile and in search results. Previewed through the signed-in API, so it
 * shows here even while the profile is not yet listed publicly.
 */
export function ProfilePhotoSection() {
  const { t } = useTranslation();
  const id = useCaregiverId();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const { data: info } = useQuery({
    queryKey: ['portal', id, 'photo'],
    queryFn: () => api.get<PhotoState>(`/caregivers/${id}/photo/info`),
    enabled: Boolean(id),
  });
  const { data: preview } = useQuery({
    queryKey: ['portal', id, 'photo', 'file', info?.photoUpdatedAt],
    queryFn: async () => URL.createObjectURL(await fetchBlob(`/caregivers/${id}/photo`)),
    enabled: Boolean(id && info?.hasPhoto),
    staleTime: Infinity,
  });
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const done = (message: string) => (state: PhotoState) => {
    queryClient.setQueryData(['portal', id, 'photo'], state);
    setNotice(message);
    if (input.current) input.current.value = '';
  };
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post<PhotoState>(`/caregivers/${id}/photo`, form);
    },
    onSuccess: done(t('portal.photo.uploaded')),
  });
  const remove = useMutation({ mutationFn: () => api.delete<PhotoState>(`/caregivers/${id}/photo`), onSuccess: done(t('portal.photo.removed')) });

  const onPick = (file: File | undefined) => {
    setNotice(null);
    setLocalError(null);
    upload.reset();
    remove.reset();
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setLocalError(t('portal.photo.tooLarge'));
      return;
    }
    upload.mutate(file);
  };

  const failure = upload.error ?? remove.error;
  const error = localError ?? (failure ? (failure instanceof ApiError ? failure.message : t('portal.saveError')) : null);
  const busy = upload.isPending || remove.isPending;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-white p-5 sm:flex-row sm:items-center">
      {info?.hasPhoto && preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the signed-in API
        <img src={preview} alt={t('portal.photo.alt')} className="h-24 w-24 shrink-0 rounded-full border border-border object-cover" />
      ) : (
        <CaregiverAvatar alt="" className="h-24 w-24" />
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-ink">{t('portal.photo.title')}</h2>
        <p className="mt-1 text-xs text-ink/60">{t('portal.photo.hint')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
          <button
            type="button"
            disabled={busy || !id}
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-DEFAULT bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            <Camera className="h-4 w-4" aria-hidden />
            {upload.isPending ? t('common.loading') : info?.hasPhoto ? t('portal.photo.replace') : t('portal.photo.upload')}
          </button>
          {info?.hasPhoto && (
            <button type="button" disabled={busy} onClick={() => remove.mutate()} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-danger disabled:opacity-50">
              <Trash2 className="h-4 w-4" aria-hidden />
              {t('portal.photo.remove')}
            </button>
          )}
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        {!error && notice && <p role="status" className="mt-2 text-sm text-brand-dark">{notice}</p>}
      </div>
    </section>
  );
}
