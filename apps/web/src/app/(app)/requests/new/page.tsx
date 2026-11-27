'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, UserPlus, Users } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/provider';
import { useAuth } from '@/lib/api/auth-context';
import { ApiError } from '@/lib/api/client';
import { useCreatePhoneRequest } from '@/lib/hooks/use-care-requests';
import { useClient } from '@/lib/hooks/use-clients';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, Select, Textarea } from '@/components/ui/input';
import { EMPTY_NEW_CLIENT, NewClientFields, missingNewClientFields, toPhoneClientInput, type NewClientDraft } from '@/components/clients/new-client-fields';
import { StatusBadge } from '@/components/ui/badge';
import { ClientPicker } from '@/components/requests/client-picker';
import { CaregiverPicker, type PickedCaregiver } from '@/components/requests/caregiver-picker';
import { cn } from '@/lib/utils';
import type { Client } from '@/lib/api/types';
import { careTypeValues, type CareType } from '@care-platform/shared';

const LANGUAGES = ['en', 'si', 'ta'] as const;

/**
 * Take a request down during a phone call: who is calling (an existing client,
 * or a first-time caller added here), which caregiver they asked about - if
 * any; staff can match later - and what they asked for. The request then sits
 * in the queue like one sent from the website, and the caller gets the same
 * confirmation and updates.
 */
// useSearchParams needs a Suspense boundary for the static build.
export default function NewPhoneRequestRoute() {
  return (
    <Suspense>
      <NewPhoneRequestPage />
    </Suspense>
  );
}

function NewPhoneRequestPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const create = useCreatePhoneRequest();

  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [client, setClient] = useState<Client | null>(null);
  const [caller, setCaller] = useState<NewClientDraft>(EMPTY_NEW_CLIENT);
  const [caregiver, setCaregiver] = useState<PickedCaregiver | null>(null);
  const [message, setMessage] = useState('');
  const [careType, setCareType] = useState<CareType | ''>('');
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]>('en');

  useEffect(() => {
    if (authLoading) return;
    if (user && user.role !== 'ADMIN' && user.role !== 'STAFF') router.replace('/dashboard');
  }, [authLoading, user, router]);

  // Started from a client's record: that client is already chosen.
  const presetId = params.get('patientId') ?? undefined;
  const { data: preset } = useClient(presetId);
  useEffect(() => {
    if (preset) setClient(preset);
  }, [preset]);

  const missing = mode === 'new' ? missingNewClientFields(caller) : client ? [] : ['client'];
  const ready = missing.length === 0;

  const submit = () => {
    if (!ready) return;
    create.mutate(
      {
        ...(mode === 'existing' ? { patientId: client!.id } : { newClient: toPhoneClientInput(caller) }),
        ...(caregiver ? { caregiverId: caregiver.id } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
        ...(careType ? { careType } : {}),
        language,
      },
      { onSuccess: (detail) => router.push(`/requests/${detail.id}`) },
    );
  };

  if (authLoading || !user || (user.role !== 'ADMIN' && user.role !== 'STAFF')) {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-ink/50">{t('common.loading')}</div>;
  }

  return (
    <div className="max-w-3xl">
      <Link href="/requests" className="mb-4 inline-flex items-center gap-1 text-sm text-ink/60 hover:text-ink">
        <ChevronLeft size={16} />
        {t('requests.back')}
      </Link>
      <h1 className="text-xl font-semibold text-ink">{t('requests.new.title')}</h1>
      <p className="mb-6 mt-1 text-sm text-ink/60">{t('requests.new.subtitle')}</p>

      <div className="space-y-4">
        {/* 1. Caller -------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>{t('requests.new.callerTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 inline-flex rounded border border-border p-0.5" role="tablist">
              {(
                [
                  ['existing', Users, 'requests.new.existingClient'],
                  ['new', UserPlus, 'requests.new.newCaller'],
                ] as const
              ).map(([key, Icon, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={mode === key}
                  onClick={() => setMode(key)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                    mode === key ? 'bg-brand text-white' : 'text-ink/70 hover:bg-paper',
                  )}
                >
                  <Icon size={15} aria-hidden />
                  {t(label)}
                </button>
              ))}
            </div>

            {mode === 'existing' &&
              (client ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-paper px-3 py-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{client.fullName}</span>
                      <StatusBadge status={client.status} label={t(`clients.status.${client.status}`)} />
                    </div>
                    <div className="text-xs text-ink/50">
                      {[client.phone || client.accountPhone, client.email, client.recipientName && t('requests.forRecipient', { name: client.recipientName })]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setClient(null)}>
                    {t('requests.new.changeClient')}
                  </Button>
                </div>
              ) : (
                <>
                  <ClientPicker onPick={setClient} />
                  <p className="mt-2 text-xs text-ink/50">{t('requests.new.searchFirstHint')}</p>
                </>
              ))}

            {mode === 'new' && <NewClientFields value={caller} onChange={setCaller} audience="caller" />}
          </CardContent>
        </Card>

        {/* 2. Caregiver ----------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>{t('requests.new.caregiverTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {caregiver ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-paper px-3 py-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{caregiver.fullName}</span>
                    <StatusBadge status={caregiver.status} label={t(`caregivers.status.${caregiver.status}`)} />
                  </div>
                  <div className="text-xs tabular-nums text-ink/50">{caregiver.registrationNumber}</div>
                  {caregiver.status !== 'ACTIVE' && <p className="mt-1 text-xs text-accent">{t('requests.new.notListedWarning')}</p>}
                </div>
                <Button size="sm" variant="secondary" onClick={() => setCaregiver(null)}>
                  {t('requests.new.matchLater')}
                </Button>
              </div>
            ) : (
              <>
                <p className="mb-2 text-sm text-ink/60">{t('requests.new.caregiverHint')}</p>
                <CaregiverPicker onPick={setCaregiver} />
              </>
            )}
          </CardContent>
        </Card>

        {/* 3. The request ---------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>{t('requests.new.requestTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="careType">{t('requests.detail.careType')}</Label>
              <Select id="careType" value={careType} onChange={(e) => setCareType(e.target.value as CareType | '')}>
                <option value="">{t('requests.new.careTypeNotSaid')}</option>
                {careTypeValues.map((type) => (
                  <option key={type} value={type}>
                    {t(`careTypes.${type}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="message">{t('requests.detail.phoneMessage')}</Label>
              <Textarea
                id="message"
                rows={3}
                maxLength={1000}
                placeholder={t('requests.new.messagePlaceholder')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="language" required>
                {t('requests.new.language')}
              </Label>
              <Select id="language" value={language} onChange={(e) => setLanguage(e.target.value as (typeof LANGUAGES)[number])}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {t(`requests.detail.language.${l}`)}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-ink/50">{t('requests.new.languageHint')}</p>
            </div>
          </CardContent>
        </Card>

        {create.isError && (
          <p role="alert" className="text-sm text-danger">
            {create.error instanceof ApiError ? create.error.message : t('requests.detail.saveFailed')}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} disabled={!ready || create.isPending}>
            {create.isPending ? t('common.loading') : t('requests.new.submit')}
          </Button>
          {!ready && (
            <span className="text-sm text-ink/50">
              {missing.includes('client') ? t('requests.new.needClient') : t('requests.new.needFields', { count: missing.length })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
