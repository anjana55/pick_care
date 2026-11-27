'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CareOfferStatus, StaffCareOffer } from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n/provider';
import { ApiError } from '@/lib/api/client';
import { fmtDateTime } from '@/lib/colombo-time';
import { cn } from '@/lib/utils';
import { useRequestOffers, useWithdrawOffer } from '@/lib/hooks/use-care-offers';
import { OfferCandidateFinder } from '@/components/requests/offer-candidate-finder';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STATUS_STYLES: Record<CareOfferStatus, string> = {
  OFFERED: 'bg-accent-light text-accent',
  ACCEPTED: 'bg-brand-light text-brand-dark',
  DECLINED: 'bg-danger-light text-danger',
  EXPIRED: 'bg-ink/10 text-ink/70',
  WITHDRAWN: 'bg-ink/10 text-ink/70',
};
const money = (n: number) => n.toLocaleString('en-LK');

/**
 * Offers on a request: who has been offered the job and what they said, and
 * a finder to offer it to more caregivers while the request is still open.
 */
export function OffersCard({ requestId, canSend }: { requestId: string; canSend: boolean }) {
  const { t, locale } = useTranslation();
  const { data } = useRequestOffers(requestId);
  const withdraw = useWithdrawOffer(requestId);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data) return null;
  const taken = data.some((o) => o.status === 'ACCEPTED');
  if (!data.length && !canSend) return null;
  const message = (err: unknown) => (err instanceof ApiError && err.message ? err.message : t('careOffers.error'));
  const reset = () => (setOpen(false), setError(null));

  const rateText = (o: StaffCareOffer) => {
    if (o.payRate === null || !o.rateType) return t('careOffers.rateOpen');
    const unit = t(`pricing.units.${o.rateType}`);
    return o.clientRate === null
      ? t('careOffers.rateNoClient', { pay: money(o.payRate), unit })
      : t('careOffers.rate', { pay: money(o.payRate), unit, client: money(o.clientRate) });
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>{t('careOffers.title')}</CardTitle>
        <p className="mt-1 text-xs text-ink/60">{t('careOffers.hint')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.length === 0 ? (
          <p className="text-sm text-ink/60">{t('careOffers.none')}</p>
        ) : (
          <ul>
            {data.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-2 first:border-t-0">
                <div className="min-w-0 flex-1 basis-64">
                  <Link href={`/caregivers/${o.caregiver.id}`} className="text-sm font-medium text-ink hover:underline">
                    {o.caregiver.fullName}
                  </Link>
                  <span className="ml-2 text-xs text-ink/50">{o.caregiver.registrationNumber}</span>
                  <p className="text-xs text-ink/70">{rateText(o)}</p>
                  <p className="text-xs text-ink/50">
                    {o.status === 'OFFERED'
                      ? t('careOffers.until', { when: fmtDateTime(o.expiresAt, locale) })
                      : o.respondedAt
                        ? t('careOffers.answered', { when: fmtDateTime(o.respondedAt, locale) })
                        : fmtDateTime(o.expiresAt, locale)}
                    {o.sentByName && ` · ${t('careOffers.by', { name: o.sentByName })}`}
                  </p>
                  {o.note && <p className="text-xs text-ink/60">{o.note}</p>}
                </div>
                <span className={cn('rounded px-2 py-0.5 text-xs font-medium', STATUS_STYLES[o.status])}>
                  {t(`careOffers.statuses.${o.status}`)}
                  {o.declineReason && `: ${t(`careOffers.reasons.${o.declineReason}`)}`}
                </span>
                {o.status === 'OFFERED' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={withdraw.isPending}
                    onClick={() => (setError(null), withdraw.mutate(o.id, { onError: (e) => setError(message(e)) }))}
                  >
                    {t('careOffers.withdraw')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && !open && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {canSend && !taken && !open && (
          <Button size="sm" onClick={() => (setError(null), setOpen(true))}>
            {t('careOffers.send')}
          </Button>
        )}

        {canSend && !taken && open && <OfferCandidateFinder requestId={requestId} onDone={reset} />}
      </CardContent>
    </Card>
  );
}
