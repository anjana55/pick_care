'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Trash2, UserRound, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import { useTranslation } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

export interface CaregiverPhotoState {
  hasPhoto: boolean;
  photoUrl: string | null;
  photoUpdatedAt: string | null;
  pending: { uploadedAt: string | null } | null;
  rejected: { at: string; reason: string | null } | null;
}

const MAX_BYTES = 8 * 1024 * 1024;

/** A photo from the signed-in API as a blob: URL, refetched when `version` changes. */
function usePhotoBlob(path: string, enabled: boolean, version: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ['photo-blob', path, version],
    queryFn: async () => URL.createObjectURL(await api.download(path)),
    enabled,
    staleTime: Infinity,
  });
  useEffect(() => () => (data ? URL.revokeObjectURL(data) : undefined), [data]);
  return enabled ? data : undefined;
}

const Round = ({ src, alt, size, dashed }: { src?: string; alt: string; size: string; dashed?: boolean }) => (
  <div className={cn('shrink-0 overflow-hidden rounded-full border bg-paper', size, dashed ? 'border-2 border-dashed border-accent' : 'border-border')}>
    {src ? (
      // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the signed-in API
      <img src={src} alt={alt} className="h-full w-full object-cover" />
    ) : (
      <div className="flex h-full w-full items-center justify-center text-ink/30" aria-label={alt}>
        <UserRound size={28} aria-hidden />
      </div>
    )}
  </div>
);

/**
 * The caregiver's profile photo on their staff record. The approved photo is
 * what the public profile and search cards show. A photo the caregiver
 * uploaded themselves waits here, beside it, for staff to approve or reject;
 * a photo staff upload is approved at once.
 */
export function CaregiverPhoto({ caregiverId, name, canEdit }: { caregiverId: string; name: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const { data: info } = useQuery({
    queryKey: ['caregiver', caregiverId, 'photo'],
    queryFn: () => api.get<CaregiverPhotoState>(`/caregivers/${caregiverId}/photo/info`),
  });
  const approvedSrc = usePhotoBlob(`/caregivers/${caregiverId}/photo`, Boolean(info?.hasPhoto), info?.photoUpdatedAt);
  const pendingSrc = usePhotoBlob(`/caregivers/${caregiverId}/photo/pending`, Boolean(info?.pending), info?.pending?.uploadedAt);

  const onDone = (state: CaregiverPhotoState) => {
    queryClient.setQueryData(['caregiver', caregiverId, 'photo'], state);
    queryClient.invalidateQueries({ queryKey: ['caregiver-photos', 'pending'] });
    queryClient.invalidateQueries({ queryKey: ['insights'] });
    setRejecting(false);
    setReason('');
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
  const approve = useMutation({ mutationFn: () => api.post<CaregiverPhotoState>(`/caregivers/${caregiverId}/photo/approve`, {}), onSuccess: onDone });
  const reject = useMutation({
    mutationFn: () => api.post<CaregiverPhotoState>(`/caregivers/${caregiverId}/photo/reject`, { reason: reason.trim() || undefined }),
    onSuccess: onDone,
  });

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

  const failed = [upload, remove, approve, reject].find((m) => m.error)?.error;
  const error = localError ?? (failed ? (failed instanceof ApiError ? failed.message : t('common.actionFailed')) : null);
  const busy = [upload, remove, approve, reject].some((m) => m.isPending);

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className={cn('flex items-start gap-3', busy && 'opacity-60')}>
        <Round
          src={info?.hasPhoto ? approvedSrc : undefined}
          alt={info?.hasPhoto ? t('caregiverPhoto.alt', { name }) : t('caregiverPhoto.none')}
          size="h-16 w-16"
        />
        {canEdit && (
          <div className="flex flex-col items-start gap-1 pt-1 print:hidden">
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-dark hover:underline disabled:opacity-50"
            >
              <Camera size={13} aria-hidden />
              {upload.isPending ? t('common.loading') : info?.hasPhoto ? t('caregiverPhoto.replace') : t('caregiverPhoto.upload')}
            </button>
            {(info?.hasPhoto || info?.pending) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => remove.mutate()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/50 hover:text-danger disabled:opacity-50"
              >
                <Trash2 size={13} aria-hidden />
                {t('caregiverPhoto.remove')}
              </button>
            )}
            {!info?.pending && <p className="max-w-[16rem] text-xs text-ink/40">{t('caregiverPhoto.hint')}</p>}
          </div>
        )}
      </div>

      {info?.pending && (
        <div className="flex items-start gap-3 rounded-lg border border-accent/40 bg-accent/5 p-3 print:hidden">
          <Round src={pendingSrc} alt={t('caregiverPhoto.pendingAlt', { name })} size="h-16 w-16" dashed />
          <div className="max-w-[18rem] space-y-2">
            <p className="text-xs font-semibold text-ink">{t('caregiverPhoto.pendingTitle')}</p>
            <p className="text-xs text-ink/60">{info.hasPhoto ? t('caregiverPhoto.pendingReplaces') : t('caregiverPhoto.pendingFirst')}</p>
            {canEdit && !rejecting && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => approve.mutate()}
                  className="inline-flex items-center gap-1 rounded bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                >
                  <Check size={13} aria-hidden />
                  {t('caregiverPhoto.approve')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRejecting(true)}
                  className="inline-flex items-center gap-1 rounded border border-border bg-white px-2.5 py-1 text-xs font-medium text-ink/70 hover:text-danger disabled:opacity-50"
                >
                  <X size={13} aria-hidden />
                  {t('caregiverPhoto.reject')}
                </button>
              </div>
            )}
            {canEdit && rejecting && (
              <div className="space-y-2">
                <label htmlFor={`reject-${caregiverId}`} className="block text-xs text-ink/70">
                  {t('caregiverPhoto.rejectReason')}
                </label>
                <input
                  id={`reject-${caregiverId}`}
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('caregiverPhoto.rejectPlaceholder')}
                  className="h-8 w-full rounded border border-border px-2 text-xs focus:border-brand focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => reject.mutate()}
                    className="rounded bg-danger px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {t('caregiverPhoto.confirmReject')}
                  </button>
                  <button type="button" onClick={() => setRejecting(false)} className="px-1 text-xs text-ink/50 hover:text-ink">
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="basis-full text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
