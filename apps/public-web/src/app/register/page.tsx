'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { agreementVersion, isPhoneNumber, type SignupResult } from '@care-platform/shared';
import { CheckCircle2, MessageCircle, Heart, Send } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { HeroBanner } from '@/components/register/hero-banner';
import { api, ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/api/auth-context';
import { hardNavigate } from '@/lib/navigation';
import { FieldError, Input, Label, RequiredLegend } from '@/components/ui/input';
import { PatientIntakeFields } from '@/components/register/patient-intake-fields';
import { useLocationTree } from '@/lib/hooks/use-public-search';
import { UNSET_ID } from '@/lib/schemas/personal-info';
import { guardianFieldsCheck, makePatientIntakeSchema, toIntakePayload } from '@/lib/schemas/patient-intake';
import { CarriedOverSummary, PendingContactBanner, useCarriedOverIntake } from '@/components/register/carried-over-intake';
import { ChosenSignInSummary, HOME_OF, SignInMethodStep } from '@/components/signup/sign-in-method-step';
import { AgreementCheckbox } from '@/components/signup/agreement';
import { forgetIdentity, takeRememberedIdentity, type ChosenSignIn } from '@/lib/signup';

function makeRegisterSchema(t: (key: string) => string, opts: { askPhone: boolean; hasEmail: boolean }) {
  return makePatientIntakeSchema(t, { allowEmailContact: opts.hasEmail })
    .extend({
      fullName: z.string().trim().min(2, t('register.validation.fullName')),
      // Not asked after WhatsApp: the verified number is the contact number.
      phone: opts.askPhone
        ? z.string().trim().min(1, t('register.validation.phoneRequired')).refine((v) => isPhoneNumber(v), t('register.validation.phone'))
        : z.string().optional(),
      // Checked in the object rather than in a .refine() after it, so the
      // messages show with every other missing answer, not only once the rest is right.
      consentAccepted: z.boolean().refine((v) => v === true, t('register.validation.consentRequired')),
      agreementAccepted: z.boolean().refine((v) => v === true, t('signup.agreement.required')),
    })
    .superRefine(guardianFieldsCheck(t));
}

/**
 * Client registration, in two steps: first how they will sign in (WhatsApp,
 * Google / Microsoft / Facebook, or email and password), then one form about
 * them and the care they need - without anything the sign-in or their search
 * already told us. WhatsApp and provider sign-ups end signed in; an email
 * sign-up confirms the address by link.
 */
export default function RegisterPage() {
  const { t, locale } = useTranslation();
  const { applyTokens } = useAuth();
  const formRef = useRef<HTMLDivElement>(null);
  const { data: locationTree, isError: locationsUnavailable } = useLocationTree(locale);
  const [chosen, setChosen] = useState<ChosenSignIn | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailResult, setEmailResult] = useState<Extract<SignupResult, { signedIn: false }> | null>(null);

  // Back from Google / Microsoft / Facebook: the proven identity is waiting.
  useEffect(() => {
    const identity = takeRememberedIdentity('client');
    if (identity) setChosen({ method: identity.method, identity });
  }, []);

  const askPhone = chosen?.method !== 'WHATSAPP';
  const hasEmail = Boolean(chosen && chosen.method !== 'WHATSAPP');
  const registerSchema = makeRegisterSchema(t, { askPhone, hasEmail });
  type RegisterValues = z.infer<typeof registerSchema>;

  const {
    register,
    control,
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      preferredContactTime: 'ANYTIME',
      preferredCaregiverGender: 'NO_PREFERENCE',
      districtId: UNSET_ID,
      cityId: UNSET_ID,
      consentAccepted: false,
      agreementAccepted: false,
    },
  });

  const carried = useCarriedOverIntake({ setValue, channel: chosen?.method === 'WHATSAPP' ? 'whatsapp' : 'email' });
  const focused = carried.carried || Boolean(carried.pendingCaregiver) || chosen !== null;

  // Starting the form from the sign-in: the name a provider knows, and
  // contact on WhatsApp when that is how they signed in.
  useEffect(() => {
    if (!chosen) return;
    if (chosen.method !== 'EMAIL' && chosen.identity.name) setValue('fullName', chosen.identity.name);
    setValue('preferredContactMethod', chosen.method === 'WHATSAPP' ? 'WHATSAPP' : 'PHONE_CALL');
  }, [chosen, setValue]);

  const choose = (next: ChosenSignIn) => {
    setServerError(null);
    setChosen(next);
    formRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  };

  const startOver = () => {
    forgetIdentity('client');
    setChosen(null);
  };

  const onSubmit = async (values: RegisterValues) => {
    if (!chosen) return;
    setServerError(null);
    try {
      const res = await api.post<SignupResult>('/auth/signup/client', {
        fullName: values.fullName,
        ...(askPhone ? { phone: values.phone } : {}),
        ...(chosen.method === 'EMAIL' ? { email: chosen.email, password: chosen.password } : { signupTicket: chosen.identity.ticket }),
        consentAccepted: values.consentAccepted,
        agreementAccepted: values.agreementAccepted,
        agreementVersion: agreementVersion('client'),
        ...toIntakePayload(values),
      });
      forgetIdentity('client');
      if (res.signedIn) {
        applyTokens(res.tokens);
        hardNavigate(HOME_OF.client());
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
        setServerError(err instanceof ApiError ? err.message : t('signup.errors.generic'));
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {!focused && (
          <>
            {/* Hero - a full banner, headline and a direct CTA down to the signup, per the one-page brief. */}
            <section className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-10 sm:grid-cols-2 sm:py-16">
              <div className="text-center sm:text-left">
                <h1 className="text-3xl font-bold text-ink sm:text-4xl">{t('register.heroTitle')}</h1>
                <p className="mx-auto mt-3 max-w-md text-ink/60 sm:mx-0">{t('register.heroSubtitle')}</p>
                <button
                  type="button"
                  onClick={() => formRef.current?.scrollIntoView?.({ behavior: 'smooth' })}
                  className="mt-6 inline-flex items-center rounded-DEFAULT bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  {t('register.heroCta')}
                </button>
              </div>
              <HeroBanner alt={t('register.heroImageAlt')} />
            </section>

            <section className="bg-brand-light/40 py-10">
              <div className="mx-auto grid max-w-4xl gap-6 px-4 sm:grid-cols-3">
                <Benefit icon={<MessageCircle className="mx-auto mb-2 h-7 w-7 text-brand" aria-hidden />} title={t('register.benefit1Title')} body={t('register.benefit1Body')} />
                <Benefit icon={<Heart className="mx-auto mb-2 h-7 w-7 text-brand" aria-hidden />} title={t('register.benefit2Title')} body={t('register.benefit2Body')} />
                <Benefit icon={<Send className="mx-auto mb-2 h-7 w-7 text-brand" aria-hidden />} title={t('register.benefit3Title')} body={t('register.benefit3Body')} />
              </div>
            </section>
          </>
        )}

        <section ref={formRef} className={focused ? 'mx-auto max-w-xl px-4 py-8' : 'mx-auto max-w-xl px-4 py-12'}>
          {emailResult ? (
            <div className="rounded-lg border border-border bg-white p-8 text-center">
              <CheckCircle2 size={40} className="mx-auto mb-4 text-brand" />
              <h2 className="mb-2 text-lg font-semibold text-ink">{t('signup.checkEmailTitle')}</h2>
              <p className="mb-4 text-sm text-ink/60">{t('signup.checkEmailBody', { email: emailResult.email })}</p>
              {carried.pendingCaregiver && <p className="mb-4 text-sm text-ink/70">{t('careIntent.verifyThenBack')}</p>}
              {emailResult.devVerificationUrl && (
                <div className="mb-4 rounded border border-dashed border-accent bg-accent-light p-3 text-left">
                  <p className="mb-2 text-xs font-medium text-accent">{t('signup.devLink')}</p>
                  <Link href={emailResult.devVerificationUrl.replace(/^https?:\/\/[^/]+/, '')} className="break-all text-xs text-brand-dark underline">
                    {emailResult.devVerificationUrl}
                  </Link>
                </div>
              )}
              <Link href="/" className="text-sm font-medium text-brand-dark hover:underline">
                {t('register.backHome')}
              </Link>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-white p-6 sm:p-8">
              <PendingContactBanner publicId={carried.pendingCaregiver} />
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/50">{t('signup.stepOf', { step: chosen ? 2 : 1, total: 2 })}</p>

              {!chosen ? (
                <>
                  {serverError && (
                    <p role="alert" className="mb-4 text-sm text-danger">
                      {serverError}
                    </p>
                  )}
                  <SignInMethodStep side="client" onChosen={choose} />
                </>
              ) : (
                <>
                  <ChosenSignInSummary chosen={chosen} onChange={startOver} />
                  <h2 className="text-lg font-semibold text-ink">{t('signup.detailsTitleClient')}</h2>
                  <p className="mt-1 text-sm text-ink/60">{carried.carried ? t('signup.detailsSubtitle') : t('register.formSubtitle')}</p>

                  <form onSubmit={handleSubmit(onSubmit, carried.onInvalid)} className="mt-6 space-y-4">
                    <RequiredLegend label={t('common.requiredField')} />
                    <div>
                      <Label htmlFor="fullName" required>
                        {t('register.fullName')}
                      </Label>
                      <Input id="fullName" autoComplete="name" {...register('fullName')} />
                      <FieldError message={errors.fullName?.message} />
                    </div>

                    {askPhone && (
                      <div>
                        <Label htmlFor="phone" required>
                          {t('register.phone')}
                        </Label>
                        <Input id="phone" type="tel" autoComplete="tel" {...register('phone')} />
                        <p className="mt-1 text-xs text-ink/50">{t('patientIntake.phoneHint')}</p>
                        <FieldError message={errors.phone?.message} />
                      </div>
                    )}

                    <PatientIntakeFields
                      register={register}
                      control={control}
                      setValue={setValue}
                      errors={errors}
                      locationTree={locationTree}
                      locationsUnavailable={locationsUnavailable}
                      allowEmailContact={hasEmail}
                      hiddenSections={carried.folded}
                      hiddenFields={carried.answered}
                    />

                    <CarriedOverSummary control={control} folded={carried.folded} answered={carried.answered} onEdit={carried.unfold} />

                    <div className="space-y-3 border-t border-border pt-5">
                      <label className="flex items-start gap-2 text-sm text-ink">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand" {...register('consentAccepted')} />
                        <span>{t('register.consentLabel')}</span>
                      </label>
                      <FieldError message={errors.consentAccepted?.message} />
                      <AgreementCheckbox
                        side="client"
                        checked={Boolean(watch('agreementAccepted'))}
                        onChange={(v) => setValue('agreementAccepted', v, { shouldValidate: true })}
                        error={errors.agreementAccepted?.message}
                      />
                    </div>

                    {serverError && (
                      <p role="alert" className="text-sm text-danger">
                        {serverError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full rounded-DEFAULT bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                    >
                      {isSubmitting ? t('signup.creating') : t('signup.submit')}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Benefit({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="text-center">
      {icon}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-ink/60">{body}</p>
    </div>
  );
}
