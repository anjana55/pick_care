'use client';

import { agreementText } from '@care-platform/shared';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { AgreementBody } from '@/components/signup/agreement';
import { useTranslation } from '@/lib/i18n';
import { useBranding } from '@/lib/branding/provider';

/** The client service agreement in full - linked from the registration form. */
export default function ClientAgreementPage() {
  const { locale } = useTranslation();
  const { companyName } = useBranding();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="mb-4 text-2xl font-bold text-ink">{agreementText('client', locale, companyName).title}</h1>
        <AgreementBody side="client" headingLevel="h2" />
      </main>
      <SiteFooter />
    </div>
  );
}
