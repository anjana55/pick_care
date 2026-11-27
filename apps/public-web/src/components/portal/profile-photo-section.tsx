'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Clock, Trash2 } from 'lucide-react';
import { api, ApiError, fetchBlob } from '@/lib/api/client';
import { useTranslation } from '@/lib/i18n';
import { useCaregiverId } from '@/lib/hooks/use-caregiver-portal';
import { CaregiverAvatar } from '@/components/results/caregiver-avatar';

interface PhotoState {
  hasPhoto: boolean;
  photoUrl: string | null;
  photoUpdatedAt: string | null;
  pending: { uploadedAt: string | null } | null;
  rejected: { at: string; reason: string | null } | null;
}

const MAX_BYTES = 8 * 1024 * 1024;

function useBlob(path: string, enabled: boolean, version: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ['portal-photo-blob', path, version],
    queryFn: async () => URL.createObjectURL(await fetchBlob(path)),
    enabled,
    staleTime: Infinity,
  });
  useEffect(() => () => (data ? URL.revokeObjectURL(data) : undefined), [data]);
  return enabled ? data : undefined;
}

/**
 * The caregiver's own profile photo. A new photo waits for staff to approve
 * it before families see it; until then the current approved photo (if any)
 * stays on the public profile. A rejection shows here with staff's reason.
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
  const approved = useBlob(`/caregivers/${id}/photo`, Boolean(id && info?.hasPhoto), info?.photoUpdatedAt);
  const pending = useBlob(`/caregivers/${id}/photo/pending`, Boolean(id && info?.pending), info?.pending?.uploadedAt);

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
    onSuccess: done(t('portal.photo.sentForApproval')),
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
  const photo = (src: string | undefined, alt: string, dashed = false) =>
    src ? (
      // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the signed-in API
      <img
        src={src}
        alt={alt}
        className={`h-24 w-24 shrink-0 rounded-full object-cover ${dashed ? 'border-2 border-dashed border-accent' : 'border border-border'}`}
      />
    ) : (
      <CaregiverAvatar alt="" className="h-24 w-24" />
    );

  return (
    <section className="rounded-lg border border-border bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex gap-3">
          <figure className="text-center">
            {photo(info?.hasPhoto ? approved : undefined, t('portal.photo.alt'))}
            {info?.pending && <figcaption className="mt-1 text-[11px] text-ink/50">{t('portal.photo.current')}</figcaption>}
          </figure>
          {info?.pending && (
            <figure className="text-center">
              {photo(pending, t('portal.photo.pendingAlt'), true)}
              <figcaption className="mt-1 text-[11px] font-medium text-accent">{t('portal.photo.waiting')}</figcaption>
            </figure>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">{t('portal.photo.title')}</h2>
          <p className="mt-1 text-xs text-ink/60">{t('portal.photo.hint')}</p>
          {info?.pending && (
            <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-ink/70">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              {t('portal.photo.pendingNote')}
            </p>
          )}
          {info?.rejected && (
            <div role="status" className="mt-2 rounded bg-danger/5 px-3 py-2 text-xs text-danger">
              {t('portal.photo.rejected')}
              {info.rejected.reason && <span className="mt-0.5 block">{t('portal.photo.rejectedReason', { reason: info.rejected.reason })}</span>}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
            <button
              type="button"
              disabled={busy || !id}
              onClick={() => input.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-DEFAULT bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              <Camera className="h-4 w-4" aria-hidden />
              {upload.isPending ? t('common.loading') : info?.hasPhoto || info?.pending ? t('portal.photo.replace') : t('portal.photo.upload')}
            </button>
            {(info?.hasPhoto || info?.pending) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => remove.mutate()}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('portal.photo.remove')}
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
          {!error && notice && (
            <p role="status" className="mt-2 text-sm text-brand-dark">
              {notice}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
