import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { isPhoneNumber, SIGNUP_PROVIDER_ORDER, type SignupOtpSent, type SignupSide, type SignupVerifyResult, type SocialProviderName, type Tokens } from '@care-platform/shared';
import { ApiError } from '@/api';
import { phoneSocialDeps, type SocialDeps } from '@/auth/social';
import { useTranslation } from '@/i18n';
import { useColors } from '@/theme';
import { Button, Field, FormError, PasswordField } from '@/ui/controls';
import { Text } from '@/ui/Text';
import { Card, IconBadge, type IconName } from '@/ui/visual';
import { CallOfficeCard } from './Agreement';
import { requestSignupCode, signupWithProvider, useSignupMethods, verifySignupCode, type ChosenSignIn } from './api';

type Open = 'whatsapp' | 'email' | null;
type ProvenNumber = Extract<SignupVerifyResult, { signedIn: false }>;

/**
 * Registering, step 1: how this person will sign in. WhatsApp (a code, here
 * and now), Google / Microsoft / Facebook (the provider's screen in the
 * phone's sign-in browser), or an email address and password - and, always
 * the 3rd choice for clients and caregivers alike, calling the office to be
 * registered by staff (left out when the office has no number). Whatever is
 * chosen is not asked again in step 2. Someone whose WhatsApp number or
 * provider account turns out to be registered already is simply signed in
 * (`onSignedIn`).
 */
export function MethodStep({
  side,
  onChosen,
  onSignedIn,
  deps: given,
}: {
  side: SignupSide;
  onChosen: (chosen: ChosenSignIn) => void;
  onSignedIn: (tokens: Tokens) => void;
  /** Tests pass stand-ins for the sign-in browser; null hides the provider buttons. */
  deps?: SocialDeps | null;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const methods = useSignupMethods(side);
  const deps = useMemo(() => (given === undefined ? phoneSocialDeps() : given), [given]);
  const [open, setOpen] = useState<Open>(null);
  const [pending, setPending] = useState<SocialProviderName | null>(null);
  const [error, setError] = useState<string | null>(null);

  const whatsappOn = Boolean(methods.data?.whatsapp);
  const providers = deps ? SIGNUP_PROVIDER_ORDER.filter((p) => methods.data?.providers?.[p]) : [];
  // With nothing else switched on, email is the only way: open it straight away.
  const emailOpen = open === 'email' || (!methods.isPending && !whatsappOn && providers.length === 0);

  const startProvider = async (provider: SocialProviderName) => {
    if (!deps) return;
    setPending(provider);
    setError(null);
    try {
      const outcome = await signupWithProvider(provider, side, deps);
      if ('identity' in outcome) onChosen({ method: outcome.identity.method, identity: outcome.identity });
      else if ('tokens' in outcome) onSignedIn(outcome.tokens);
      else if ('error' in outcome) setError(t(outcome.error === 'email_taken' ? 'signup.errors.alreadyRegistered' : 'signup.errors.providerFailed'));
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
          {t('signup.chooseTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{t('signup.chooseSubtitle')}</Text>
      </View>

      {withCallOffice([
        whatsappOn ? (
          <Choice key="whatsapp" icon="logo-whatsapp" title={t('signup.whatsapp')} hint={t('signup.whatsappHint')} open={open === 'whatsapp'} onOpen={() => (setOpen('whatsapp'), setError(null))}>
            <WhatsappCode side={side} onIdentity={(identity) => onChosen({ method: 'WHATSAPP', identity })} onSignedIn={onSignedIn} />
          </Choice>
        ) : null,
        providers.length ? (
          <View key="providers" style={{ gap: 14 }}>
            {providers.map((provider) => (
              <Button
                key={provider}
                variant="secondary"
                label={t(`signup.providers.${provider}`)}
                busy={pending === provider}
                disabled={pending !== null}
                onPress={() => void startProvider(provider)}
              />
            ))}
          </View>
        ) : null,
        <Choice key="email" icon="mail-outline" title={t('signup.email')} hint={t('signup.emailHint')} open={emailOpen} onOpen={() => (setOpen('email'), setError(null))}>
          <EmailPassword onDone={(email, password) => onChosen({ method: 'EMAIL', email, password })} />
        </Choice>,
      ])}

      <FormError message={error} />
    </View>
  );
}

/**
 * The choices in order with "Call the office to register" 3rd: after
 * WhatsApp and the Google / Microsoft / Facebook buttons (one choice
 * together), before email - or as near 3rd as the choices switched on allow.
 */
function withCallOffice(choices: (React.ReactElement | null)[]) {
  const shown = choices.filter((c): c is React.ReactElement => c !== null);
  shown.splice(Math.min(2, shown.length), 0, <CallOfficeCard key="call-office" />);
  return shown;
}

function Choice({ icon, title, hint, open, onOpen, children }: { icon: IconName; title: string; hint: string; open: boolean; onOpen: () => void; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Card style={{ padding: 0, borderWidth: open ? 2 : 1, borderColor: open ? colors.brand : colors.border }}>
      <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={hint} accessibilityState={{ expanded: open }} onPress={onOpen} style={styles.choiceHead}>
        <IconBadge name={icon} tone="brand" size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>{title}</Text>
          <Text style={{ fontSize: 15, lineHeight: 21, color: colors.muted }}>{hint}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={24} color={colors.muted} />
      </Pressable>
      {open ? <View style={styles.choiceBody}>{children}</View> : null}
    </Card>
  );
}

function WhatsappCode({ side, onIdentity, onSignedIn }: { side: SignupSide; onIdentity: (identity: ProvenNumber) => void; onSignedIn: (tokens: Tokens) => void }) {
  const { t } = useTranslation();
  const colors = useColors();
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
      const res = await requestSignupCode(side, phone.trim());
      setSent(res);
      setWait(res.resendAfterSeconds);
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : t('signup.errors.sendFailed'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await verifySignupCode(side, phone.trim(), code.trim());
      if (res.signedIn) onSignedIn(res.tokens);
      else onIdentity(res);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'already_registered') setError(t('signup.errors.alreadyRegistered'));
      else setError(err instanceof ApiError && err.message ? err.message : t('signup.errors.badCode'));
    } finally {
      setBusy(false);
    }
  };

  if (!sent) {
    return (
      <View style={{ gap: 14 }}>
        <Field label={t('signup.whatsappNumber')} hint={t('signup.whatsappNumberHint')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
        <FormError message={error} />
        <Button label={t('signup.sendCode')} onPress={() => void send()} busy={busy} disabled={!isPhoneNumber(phone, 7)} />
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ fontSize: 17, lineHeight: 25, color: colors.ink }}>{t('signup.codeSentTo', { phone: sent.phone })}</Text>
      {sent.devOtp ? <Text style={{ color: colors.muted }}>{t('signup.devCode', { code: sent.devOtp })}</Text> : null}
      <Field
        label={t('signup.code')}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={8}
      />
      <FormError message={error} />
      <Button label={t('signup.verify')} onPress={() => void verify()} busy={busy} disabled={code.length < 4} />
      <Button variant="link" label={wait > 0 ? t('signup.resendIn', { seconds: wait }) : t('signup.resend')} onPress={() => void send()} disabled={wait > 0 || busy} />
      <Button variant="link" label={t('signup.changeNumber')} onPress={() => (setSent(null), setCode(''), setError(null))} />
    </View>
  );
}

function EmailPassword({ onDone }: { onDone: (email: string, password: string) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [checked, setChecked] = useState(false);
  const emailError = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : t('signup.errors.email');
  const passwordError = password.length >= 8 ? null : t('signup.errors.password');
  const confirmError = password === confirm ? null : t('signup.errors.passwordMismatch');
  return (
    <View style={{ gap: 14 }}>
      <Field
        label={t('signup.emailLabel')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        error={checked ? emailError : null}
      />
      <PasswordField label={t('signup.passwordLabel')} hint={t('signup.passwordHint')} value={password} onChangeText={setPassword} autoComplete="new-password" textContentType="newPassword" error={checked ? passwordError : null} />
      <PasswordField label={t('signup.confirmPassword')} value={confirm} onChangeText={setConfirm} autoComplete="new-password" textContentType="newPassword" error={checked ? confirmError : null} />
      <Button
        label={t('signup.continue')}
        onPress={() => {
          setChecked(true);
          if (!emailError && !passwordError && !confirmError) onDone(email.trim().toLowerCase(), password);
        }}
      />
    </View>
  );
}

/** "You'll sign in with WhatsApp: +9477... - Change", at the top of step 2. */
export function ChosenSummary({ chosen, onChange }: { chosen: ChosenSignIn; onChange: () => void }) {
  const { t } = useTranslation();
  const colors = useColors();
  const value = chosen.method === 'EMAIL' ? chosen.email : chosen.method === 'WHATSAPP' ? (chosen.identity.phone ?? '') : (chosen.identity.email ?? '');
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="checkmark-circle" size={26} color={colors.brand} />
        <Text style={{ flex: 1, fontSize: 16, lineHeight: 23, color: colors.ink }}>{t(`signup.chosen.${chosen.method}`, { value })}</Text>
      </View>
      <Button variant="link" label={t('signup.change')} onPress={onChange} />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 32, fontWeight: '800' },
  subtitle: { fontSize: 16, lineHeight: 23 },
  choiceHead: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, minHeight: 72 },
  choiceBody: { paddingHorizontal: 16, paddingBottom: 16 },
});
