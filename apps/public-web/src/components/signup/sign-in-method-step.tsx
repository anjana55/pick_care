'use client';

import { useEffect, useState } from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import {
  SIGNUP_PROVIDER_ORDER,
  isPhoneNumber,
  type SignupOtpSent,
  type SignupSide,
  type SignupVerifyResult,
  type SocialProviderName,
} from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n';
import { api, ApiError, type Tokens } from '@/lib/api/client';
import { useAuth } from '@/lib/api/auth-context';
import { hardNavigate } from '@/lib/navigation';
import { takeReturnTo } from '@/lib/return-to';
import { LOGIN_NONCE_KEY } from '@/components/caregivers/social-login-buttons';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { useSignupMethods, type ChosenSignIn } from '@/lib/signup';

function makeNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Where a person who turns out to have an account already goes once signed in. */
export const HOME_OF: Record<SignupSide, () => string> = {
  client: () => takeReturnTo('/'),
  caregiver: () => '/caregiver/dashboard',
};

type Open = 'whatsapp' | 'email' | null;

/**
 * The first step of registering: how this person will sign in. WhatsApp
 * (a code, here and now), Google / Microsoft / Facebook (the provider's own
 * screen, back to this page), or an email address and password (typed here,
 * confirmed by email after the form). Whatever is chosen is not asked again
 * on the details form.
 *
 * Someone who turns out to be registered already - their WhatsApp number or
 * provider account is a login on this side - is simply signed in. There is
 * no "already have an account?" here: they chose to register to get here,
 * and the header's Sign in is always there.
 */
export function SignInMethodStep({ side, onChosen }: { side: SignupSide; onChosen: (chosen: ChosenSignIn) => void }) {
  const { t } = useTranslation();
  const { applyTokens } = useAuth();
  const { data: methods } = useSignupMethods(side);
  const [open, setOpen] = useState<Open>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<SocialProviderName | null>(null);

  const providers = SIGNUP_PROVIDER_ORDER.filter((p) => methods?.providers?.[p]);
  const whatsappOn = Boolean(methods?.whatsapp);

  const signedIn = (tokens: Tokens) => {
    applyTokens(tokens);
    hardNavigate(HOME_OF[side]());
  };

  const startProvider = async (provider: SocialProviderName) => {
    setPending(provider);
    setError(null);
    try {
      const nonce = makeNonce();
      window.sessionStorage.setItem(LOGIN_NONCE_KEY, nonce);
      const { url } = await api.get<{ url: string }>(`/auth/social/${provider.toLowerCase()}/signup-url`, { nonce, side });
      hardNavigate(url);
    } catch (err) {
      setPending(null);
      setError(err instanceof ApiError ? err.message : t('signup.errors.providerFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">{t('signup.chooseTitle')}</h2>
        <p className="mt-1 text-sm text-ink/60">{t('signup.chooseSubtitle')}</p>
      </div>

      {whatsappOn && (
        <MethodCard
          icon={<MessageCircle className="h-5 w-5 text-brand" aria-hidden />}
          title={t('signup.whatsapp')}
          hint={t('signup.whatsappHint')}
          open={open === 'whatsapp'}
          onOpen={() => (setOpen('whatsapp'), setError(null))}
        >
          <WhatsappVerify side={side} onIdentity={(identity) => onChosen({ method: 'WHATSAPP', identity })} onSignedIn={signedIn} />
        </MethodCard>
      )}

      {providers.length > 0 && (
        <div className="grid gap-2">
          {providers.map((provider) => (
            <button
              key={provider}
              type="button"
              onClick={() => startProvider(provider)}
              disabled={pending !== null}
              className="flex min-h-11 items-center justify-center gap-2 rounded border border-border bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === provider ? t('common.loading') : t(`signup.providers.${provider}`)}
            </button>
          ))}
        </div>
      )}

      <MethodCard
        icon={<Mail className="h-5 w-5 text-brand" aria-hidden />}
        title={t('signup.email')}
        hint={t('signup.emailHint')}
        open={open === 'email' || (!whatsappOn && providers.length === 0)}
        onOpen={() => (setOpen('email'), setError(null))}
      >
        <EmailPassword onDone={(email, password) => onChosen({ method: 'EMAIL', email, password })} />
      </MethodCard>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

    </div>
  );
}

function MethodCard({
  icon,
  title,
  hint,
  open,
  onOpen,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  open: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-white">
      <button type="button" onClick={onOpen} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="mt-0.5">{icon}</span>
        <span>
          <span className="block text-sm font-semibold text-ink">{title}</span>
          <span className="block text-xs text-ink/60">{hint}</span>
        </span>
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}

/** A WhatsApp number, then the code sent to it. */
function WhatsappVerify({
  side,
  onIdentity,
  onSignedIn,
}: {
  side: SignupSide;
  onIdentity: (identity: Extract<SignupVerifyResult, { signedIn: false }>) => void;
  onSignedIn: (tokens: Tokens) => void;
}) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState<SignupOtpSent | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<SignupOtpSent>('/auth/signup/whatsapp/request-otp', { side, phone: phone.trim() });
      setSent(res);
      setWait(res.resendAfterSeconds);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('signup.errors.sendFailed'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<SignupVerifyResult>('/auth/signup/whatsapp/verify-otp', { side, phone: phone.trim(), code: code.trim() });
      if (res.signedIn) onSignedIn(res.tokens);
      else onIdentity(res);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'already_registered') setError(t('signup.errors.alreadyRegistered'));
      else setError(err instanceof ApiError ? err.message : t('signup.errors.badCode'));
    } finally {
      setBusy(false);
    }
  };

  if (!sent) {
    return (
      <div className="space-y-3">
        <div>
          <Label htmlFor="signup-whatsapp">{t('signup.whatsappNumber')}</Label>
          <Input id="signup-whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="0771234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <p className="mt-1 text-xs text-ink/50">{t('signup.whatsappNumberHint')}</p>
        </div>
        <FieldError message={error ?? undefined} />
        <Button type="button" className="w-full" onClick={send} disabled={busy || !isPhoneNumber(phone, 7)}>
          {busy ? t('common.loading') : t('signup.sendCode')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink">{t('signup.codeSentTo', { phone: sent.phone })}</p>
      {sent.devOtp && <p className="text-xs text-ink/50">{t('signup.devCode', { code: sent.devOtp })}</p>}
      <div>
        <Label htmlFor="signup-code">{t('signup.code')}</Label>
        <Input
          id="signup-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </div>
      <FieldError message={error ?? undefined} />
      <Button type="button" className="w-full" onClick={verify} disabled={busy || code.length < 4}>
        {busy ? t('common.loading') : t('signup.verify')}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <button type="button" className="font-medium text-brand-dark hover:underline disabled:text-ink/40 disabled:no-underline" onClick={send} disabled={wait > 0 || busy}>
          {wait > 0 ? t('signup.resendIn', { seconds: wait }) : t('signup.resend')}
        </button>
        <button type="button" className="text-ink/60 underline" onClick={() => (setSent(null), setCode(''), setError(null))}>
          {t('signup.changeNumber')}
        </button>
      </div>
    </div>
  );
}

/** Email and password, checked here; the address is confirmed by email after the form. */
function EmailPassword({ onDone }: { onDone: (email: string, password: string) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [checked, setChecked] = useState(false);

  const emailError = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? t('signup.errors.email') : undefined;
  const passwordError = password.length < 8 ? t('signup.errors.password') : undefined;
  const confirmError = password !== confirm ? t('signup.errors.passwordMismatch') : undefined;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setChecked(true);
        if (!emailError && !passwordError && !confirmError) onDone(email.trim().toLowerCase(), password);
      }}
    >
      <div>
        <Label htmlFor="signup-email" required>{t('signup.emailLabel')}</Label>
        <Input id="signup-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <FieldError message={checked ? emailError : undefined} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="signup-password" required>{t('signup.passwordLabel')}</Label>
          <PasswordInput id="signup-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="mt-1 text-xs text-ink/50">{t('signup.passwordHint')}</p>
          <FieldError message={checked ? passwordError : undefined} />
        </div>
        <div>
          <Label htmlFor="signup-confirm" required>{t('signup.confirmPassword')}</Label>
          <PasswordInput id="signup-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <FieldError message={checked ? confirmError : undefined} />
        </div>
      </div>
      <Button type="submit" className="w-full">
        {t('signup.continue')}
      </Button>
    </form>
  );
}

/** "You'll sign in with WhatsApp: +9477... - Change", at the top of the details form. */
export function ChosenSignInSummary({ chosen, onChange }: { chosen: ChosenSignIn; onChange: () => void }) {
  const { t } = useTranslation();
  const value =
    chosen.method === 'EMAIL' ? chosen.email : chosen.method === 'WHATSAPP' ? (chosen.identity.phone ?? '') : (chosen.identity.email ?? '');
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-DEFAULT border border-brand/30 bg-brand-light/40 p-3 text-sm text-ink">
      <span>{t(`signup.chosen.${chosen.method}`, { value })}</span>
      <button type="button" onClick={onChange} className="font-medium text-brand-dark hover:underline">
        {t('signup.change')}
      </button>
    </div>
  );
}
