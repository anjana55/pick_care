'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/provider';
import { useAuth } from '@/lib/api/auth-context';
import { ApiError } from '@/lib/api/client';
import { useCreateClient } from '@/lib/hooks/use-clients';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EMPTY_NEW_CLIENT, NewClientFields, missingNewClientFields, toPhoneClientInput, type NewClientDraft } from '@/components/clients/new-client-fields';

/**
 * "Add new client" - for people who reach the office by phone (or in person)
 * rather than signing up on the website. Phone number is required (it is how
 * staff reach them and becomes their WhatsApp sign-in); email is optional.
 *
 * The record is created ACTIVE, since staff took the details down themselves,
 * and the page then opens the new client's record. Staff and admin only, like
 * the rest of the Clients module (@Roles on PatientsController).
 */
export default function NewClientPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const create = useCreateClient();
  const [draft, setDraft] = useState<NewClientDraft>(EMPTY_NEW_CLIENT);

  useEffect(() => {
    if (authLoading) return;
    if (user && user.role !== 'ADMIN' && user.role !== 'STAFF') router.replace('/dashboard');
  }, [authLoading, user, router]);

  if (authLoading || !user || (user.role !== 'ADMIN' && user.role !== 'STAFF')) {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-ink/50">{t('common.loading')}</div>;
  }

  const missing = missingNewClientFields(draft);
  const ready = missing.length === 0;

  const submit = () => {
    if (!ready || create.isPending) return;
    create.mutate(toPhoneClientInput(draft), { onSuccess: (client) => router.push(`/clients/${client.id}`) });
  };

  return (
    <div className="max-w-3xl">
      <Link href="/clients" className="mb-4 inline-flex items-center gap-1 text-sm text-ink/60 hover:text-ink">
        <ChevronLeft size={16} />
        {t('clients.back')}
      </Link>
      <h1 className="text-xl font-semibold text-ink">{t('clients.new.title')}</h1>
      <p className="mb-6 mt-1 text-sm text-ink/60">{t('clients.new.subtitle')}</p>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t('clients.new.detailsTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <NewClientFields value={draft} onChange={setDraft} audience="client" />
          </CardContent>
        </Card>

        {create.isError && (
          <p role="alert" className="text-sm text-danger">
            {create.error instanceof ApiError ? create.error.message : t('clients.new.saveFailed')}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!ready || create.isPending}>
            {create.isPending ? t('common.loading') : t('clients.new.submit')}
          </Button>
          <Link href="/clients">
            <Button type="button" variant="secondary">
              {t('common.cancel')}
            </Button>
          </Link>
          {!ready && <span className="text-sm text-ink/50">{t('requests.new.needFields', { count: missing.length })}</span>}
        </div>
      </form>
    </div>
  );
}
