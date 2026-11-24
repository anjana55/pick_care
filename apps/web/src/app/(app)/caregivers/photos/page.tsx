'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/api/auth-context';
import { useTranslation } from '@/lib/i18n/provider';
import { fmtDateTime } from '@/lib/colombo-time';
import { Card, CardContent } from '@/components/ui/card';
import { CaregiverPhoto } from '@/components/caregivers/caregiver-photo';

interface PendingPhotoItem {
  caregiverId: string;
  fullName: string;
  registrationNumber: string | null;
  uploadedAt: string | null;
  hasApprovedPhoto: boolean;
}

/**
 * Photos to approve (ADMIN + STAFF): caregivers' own profile-photo uploads,
 * oldest first. Each goes on the caregiver's public profile only once
 * approved here or on their record; rejecting tells the caregiver why.
 */
export default function PhotosToApprovePage() {
  const { t, locale } = useTranslation();
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = user?.role === 'ADMIN' || user?.role === 'STAFF';
  const { data, isLoading, isError } = useQuery({
    queryKey: ['caregiver-photos', 'pending'],
    queryFn: () => api.get<PendingPhotoItem[]>('/caregiver-photos/pending'),
    enabled: allowed,
  });

  useEffect(() => {
    if (!loading && user && !allowed) router.replace('/dashboard');
  }, [loading, user, allowed, router]);
  if (!allowed) return null;

  return (
    <div className="max-w-4xl">
      <Link href="/caregivers" className="mb-4 inline-flex items-center gap-1 text-sm text-ink/60 hover:text-ink">
        <ArrowLeft size={16} />
        {t('caregiverPhoto.queue.back')}
      </Link>
      <h1 className="text-xl font-semibold text-ink">{t('caregiverPhoto.queue.title')}</h1>
      <p className="mb-6 mt-1 text-sm text-ink/60">{t('caregiverPhoto.queue.subtitle')}</p>

      {isLoading && <p className="text-sm text-ink/50">{t('common.loading')}</p>}
      {isError && <p className="text-sm text-danger">{t('common.actionFailed')}</p>}
      {data && data.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-ink/50">{t('caregiverPhoto.queue.empty')}</CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {data?.map((p) => (
          <Card key={p.caregiverId}>
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/caregivers/${p.caregiverId}`} className="font-medium text-ink hover:underline">
                  {p.fullName}
                  {p.registrationNumber && <span className="ml-2 text-xs font-normal text-ink/50">{p.registrationNumber}</span>}
                </Link>
                {p.uploadedAt && <span className="text-xs text-ink/50">{t('caregiverPhoto.queue.uploaded', { when: fmtDateTime(p.uploadedAt, locale) })}</span>}
              </div>
              <CaregiverPhoto caregiverId={p.caregiverId} name={p.fullName} canEdit />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
