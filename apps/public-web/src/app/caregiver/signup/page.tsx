'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { agreementVersion, isPhoneNumber, type SignupResult } from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n';
import { api, ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/api/auth-context';
import { hardNavigate } from '@/lib/navigation';
import { Button } from '@/components/ui/button';
import { Input, Label, FieldError, RequiredLegend } from '@/components/ui/input';
import { PersonalInfoFields } from '@/components/caregivers/personal-info-fields';
import { CaregiverRegisterHeader, CaregiverRegisterShell } from '@/components/caregivers/caregiver-register-layout';
import { makePersonalInfoSchema, requiredFieldsOf } from '@/lib/schemas/personal-info';
import { useLocationTree } from '@/lib/hooks/use-public-search';
import { ChosenSignInSummary, HOME_OF, SignInMethodStep } from '@/components/signup/sign-in-method-step';
import { AgreementCheckbox } from '@/components/signup/agreement';
import { forgetIdentity, takeRememberedIdentity, type ChosenSignIn } from '@/lib/signup';

/** `primaryPhone` is omitted because this page asks for `phone` once (or not at all, after WhatsApp). */
const OMIT = new Set(['primaryPhone']);

function makeSchema(t: (key: string) => string, askPhone: boolean) {
  return makePersonalInfoSchema(t)
    .omit({ primaryPhone: true })
    .extend({
      phone: askPhone
        ? z.string().trim().min(1, t('caregiverSignup.validation.phoneRequired')).refine((v) => isPhoneNumber(v), t('caregiverSignup.validation.phoneInvalid'))
        : z.string().optional(),
      // Checked in the object rather than in a .refine() after it, so the
      // messages show with every other missing answer, not only once the rest is right.
      consentAccepted: z.boolean().refine((v) => v === true, t('caregiverRegister.validation.consentRequired')),
      agreementAccepted: z.boolean().refine((v) => v === true, t('signup.agreement.required')),
    });
}

/**
 * Caregiver registration, in two steps: how they will sign in (WhatsApp,
 * Google / Microsoft / Facebook, or email and password), then their details -
 * without the phone number when WhatsApp has just verified it. Anyone who
 * would rather not fill in a form can call the office instead.
 */
export default function CaregiverSignupPage() {
  const { t, locale } = useTranslation();
  const { applyTokens } = useAuth();
  const { data: locationTree, isError: locationsUnavailable } = useLocationTree(locale);
  const [chosen, setChosen] = useState<ChosenSignIn | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailResult, setEmailResult] = useState<Extract<SignupResult, { signedIn: false }> | null>(null);

  useEffect(() => {
    const identity = takeRememberedIdentity('caregiver');
    if (identity) setChosen({ method: identity.method, identity });
  }, []);

  const askPhone = chosen?.method !== 'WHATSAPP';
  const schema = makeSchema(t, askPhone);
  const requiredFields = requiredFieldsOf(makePersonalInfoSchema(t).omit({ primaryPhone: true }));
  type Values = z.infer<typeof schema>;

  const {
    register,
    control,
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { consentAccepted: false, agreementAccepted: false } });

  useEffect(() => {
    if (chosen && chosen.method !== 'EMAIL' && chosen.identity.name) setValue('fullName', chosen.identity.name);
  }, [chosen, setValue]);

  const startOver = () => {
    forgetIdentity('caregiver');
    setChosen(null);
  };

  const onSubmit = async (values: Values) => {
    if (!chosen) return;
    setServerError(null);
    // Blanks are dropped rather than sent: an untouched optional field is ''.
    const { consentAccepted, agreementAccepted, phone, ...details } = values;
    const cleaned = Object.fromEntries(Object.entries(details).filter(([, v]) => v !== '' && v !== undefined && !(typeof v === 'number' && Number.isNaN(v))));
    try {
      const res = await api.post<SignupResult>('/auth/signup/caregiver', {
        ...cleaned,
        ...(askPhone ? { phone } : {}),
        ...(chosen.method === 'EMAIL' ? { email: chosen.email, password: chosen.password } : { signupTicket: chosen.identity.ticket }),
        consentAccepted,
        agreementAccepted,
        agreementVersion: agreementVersion('caregiver'),
      });
      forgetIdentity('caregiver');
      if (res.signedIn) {
        applyTokens(res.tokens);
        hardNavigate(HOME_OF.caregiver());
      } else {
        setEmailResult(res);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ticket_expired') {
        startOver();
        setServerError(t('signup.errors.ticketExpired'));
      } else if (err instanceof ApiError && err.code === 'agreement_changed') {
        setServerError(t('signup.errors.agreementChanged'));
      } else {
        setServerError(err instanceof ApiError ? err.message : t('caregiverSignup.error'));
      }
    }
  };

  if (emailResult) {
    return (
      <CaregiverRegisterShell narrow>
        <div className="rounded-lg border border-border bg-white p-6 text-center">
          <h1 className="mb-1 text-lg font-semibold text-ink">{t('signup.checkEmailTitle')}</h1>
          <p className="mb-2 text-sm text-ink/60">{t('signup.checkEmailBody', { email: emailResult.email })}</p>
          {emailResult.registrationNumber && <p className="mb-4 text-xs text-ink/50">{t('signup.regNumber', { number: emailResult.registrationNumber })}</p>}
          {emailResult.devVerificationUrl && (
            <div className="mb-4 rounded border border-dashed border-accent bg-accent-light p-3 text-left">
              <p className="mb-2 text-xs font-medium text-accent">{t('signup.devLink')}</p>
              <Link href={emailResult.devVerificationUrl.replace(/^https?:\/\/[^/]+/, '')} className="break-all text-xs text-brand-dark underline">
                {emailResult.devVerificationUrl}
              </Link>
            </div>
          )}
          <Link href="/caregiver/login" className="text-sm font-medium text-brand-dark hover:underline">
            {t('caregiverSignup.goToSignIn')}
          </Link>
        </div>
      </CaregiverRegisterShell>
    );
  }

  if (!chosen) {
    return (
      <CaregiverRegisterShell narrow>
        <CaregiverRegisterHeader title={t('signup.join.title')} subtitle={t('signup.join.subtitle')} />
        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-white p-6">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/50">{t('signup.stepOf', { step: 1, total: 2 })}</p>
            {serverError && (
              <p role="alert" className="mb-4 text-sm text-danger">
                {serverError}
              </p>
            )}
            <SignInMethodStep side="caregiver" onChosen={(next) => (setServerError(null), setChosen(next))} />
          </div>
        </div>
      </CaregiverRegisterShell>
    );
  }

  return (
    <CaregiverRegisterShell>
      <CaregiverRegisterHeader title={t('caregiverSignup.title')} subtitle={t('signup.stepOf', { step: 2, total: 2 })} />

      <form onSubmit={handleSubmit(onSubmit)} className="rounded-lg border border-border bg-white p-6">
        <ChosenSignInSummary chosen={chosen} onChange={startOver} />
        <RequiredLegend label={t('common.requiredField')} />

        {askPhone && (
          <div className="mb-6">
            <Label htmlFor="phone" required>{t('caregiverSignup.phone')}</Label>
            <Input id="phone" type="tel" inputMode="tel" placeholder="0771234567" {...register('phone')} />
            <p className="mt-1 text-xs text-ink/50">{t('caregiverSignup.phoneHint')}</p>
            <FieldError message={errors.phone?.message as string | undefined} />
          </div>
        )}

        <h2 className="mb-3 text-sm font-semibold text-ink">{t('caregiverRegister.personalSection')}</h2>
        <PersonalInfoFields
          register={register as any}
          control={control as any}
          setValue={setValue as any}
          errors={errors as any}
          locationTree={locationTree ?? []}
          locationsUnavailable={locationsUnavailable}
          requiredFields={requiredFields}
          omitFields={OMIT}
        />

        <div className="mt-6 space-y-3">
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand" {...register('consentAccepted')} />
            <span>
              <span aria-hidden="true" className="text-danger">*</span> {t('caregiverRegister.consentLabel')}
            </span>
          </label>
          <FieldError message={errors.consentAccepted?.message as string | undefined} />
          <AgreementCheckbox
            side="caregiver"
            checked={Boolean(watch('agreementAccepted'))}
            onChange={(v) => setValue('agreementAccepted', v, { shouldValidate: true })}
            error={errors.agreementAccepted?.message as string | undefined}
          />
        </div>

        {serverError && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {serverError}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('signup.creating') : t('signup.submit')}
          </Button>
        </div>
      </form>
    </CaregiverRegisterShell>
  );
}
