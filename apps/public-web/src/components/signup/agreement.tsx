'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Phone } from 'lucide-react';
import { agreementText, agreementVersion, type SignupSide } from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n';
import { useBranding } from '@/lib/branding/provider';
import { FieldError } from '@/components/ui/input';

/** A service agreement in full, in the reader's language. */
export function AgreementBody({ side, headingLevel = 'h3' }: { side: SignupSide; headingLevel?: 'h2' | 'h3' }) {
  const { t, locale } = useTranslation();
  const { companyName } = useBranding();
  const text = agreementText(side, locale, companyName);
  const Heading = headingLevel;
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink/80">
      <p>{text.intro}</p>
      {text.sections.map((section) => (
        <section key={section.heading}>
          <Heading className="font-semibold text-ink">{section.heading}</Heading>
          <p className="mt-0.5">{section.body}</p>
        </section>
      ))}
      <p className="text-xs text-ink/50">{t('signup.agreement.version', { version: agreementVersion(side) })}</p>
    </div>
  );
}

/**
 * The service agreement tick box on a registration form, with the full text
 * a click away (inline, or on its own page). `checked` / `onChange` rather
 * than react-hook-form so both registration pages can use it as they are.
 */
export function AgreementCheckbox({
  side,
  checked,
  onChange,
  error,
}: {
  side: SignupSide;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}) {
  const { t, locale } = useTranslation();
  const { companyName } = useBranding();
  const [open, setOpen] = useState(false);
  const text = agreementText(side, locale, companyName);

  return (
    <div className="rounded-DEFAULT border border-border p-3">
      <p className="text-sm font-semibold text-ink">{text.title}</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="font-medium text-brand-dark hover:underline">
          {open ? t('signup.agreement.hide') : t('signup.agreement.read')}
        </button>
        <Link href={`/agreements/${side}`} target="_blank" className="text-ink/60 underline hover:text-ink">
          {t('signup.agreement.openPage')}
        </Link>
      </div>
      {open && (
        <div className="mt-3 max-h-72 overflow-y-auto rounded border border-border bg-paper p-3">
          <AgreementBody side={side} />
        </div>
      )}
      <label className="mt-3 flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          <span aria-hidden="true" className="text-danger">
            *
          </span>{' '}
          {text.acceptLabel}
        </span>
      </label>
      <FieldError message={error} />
    </div>
  );
}

/**
 * "Prefer to register by phone? Call our office" - for clients and caregivers
 * who would rather not fill in a form. One big button that dials; the 3rd
 * choice in SignInMethodStep. Nothing at all when Settings > Branding has no
 * office number.
 */
export function CallOfficeCard({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { officePhone } = useBranding();
  if (!officePhone) return null;
  const dial = `tel:${officePhone.replace(/[^\d+]/g, '')}`;
  return (
    <div className={compact ? '' : 'rounded-lg border-2 border-accent/40 bg-accent-light p-5'}>
      {!compact && (
        <>
          <h2 className="text-base font-semibold text-ink">{t('signup.callOffice.title')}</h2>
          <p className="mt-1 text-sm text-ink/70">{t('signup.callOffice.body')}</p>
        </>
      )}
      <a
        href={dial}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-DEFAULT bg-accent px-4 py-3 text-base font-semibold text-white hover:opacity-90"
      >
        <Phone className="h-5 w-5" aria-hidden />
        {t('signup.callOffice.cta', { phone: officePhone })}
      </a>
    </div>
  );
}
