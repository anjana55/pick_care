import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, type ScrollViewInstance } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { agreementVersion, type IntakeFromSearch, type SignupResult, type SignupSide, type Tokens } from '@care-platform/shared';
import { ApiError } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { afterSignIn, sideFrom } from '@/auth/sides';
import { useTranslation } from '@/i18n';
import { useColors } from '@/theme';
import { Button, FormError, Screen } from '@/ui/controls';
import { Text } from '@/ui/Text';
import { Card } from '@/ui/visual';
import { submitSignup, type ChosenSignIn } from '@/signup/api';
import { ChosenSummary, MethodStep } from '@/signup/MethodStep';
import { AgreementBox, TickBox } from '@/signup/Agreement';
import { ClientDetails, clientPayload, clientProblems, startClientForm, useIntakeFromLastSearch, type ClientForm } from '@/signup/ClientDetails';
import { CaregiverDetails, caregiverPayload, caregiverProblems, startCaregiverForm, type CaregiverForm } from '@/signup/CaregiverDetails';

/**
 * Registering in the app, for clients and caregivers - no more sending them
 * to the website. Two steps:
 *
 * 1. How they will sign in: WhatsApp, Google / Microsoft / Facebook, or email
 *    and password (MethodStep). Someone who turns out to be registered
 *    already is signed in there and then.
 * 2. Their details, without anything step 1 or their last search already
 *    settled, plus the service agreement.
 *
 * WhatsApp and provider sign-ups finish signed in; email confirms the
 * address by the link sent to it. Clients and caregivers who would rather not
 * type can call the office from step 1.
 *
 * Every way here is an explicit "I'm new" (Create an account, Get started),
 * so this screen does not ask again whether they have an account. Anyone who
 * has one after all is caught anyway: a WhatsApp number or provider account
 * that is already registered signs them straight in.
 */
export default function Register() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const { signIn } = useAuth();
  const { role, returnTo } = useLocalSearchParams<{ role?: string; returnTo?: string }>();
  const side: SignupSide = sideFrom(role);
  const scroll = useRef<ScrollViewInstance>(null);

  const fromSearch = useIntakeFromLastSearch();
  const [chosen, setChosen] = useState<ChosenSignIn | null>(null);
  const [clientForm, setClientForm] = useState<ClientForm>(() => startClientForm({ whatsapp: false, fromSearch: {} }));
  const [caregiverForm, setCaregiverForm] = useState<CaregiverForm>(() => startCaregiverForm());
  const [answered, setAnswered] = useState<ReadonlySet<keyof IntakeFromSearch>>(new Set());
  const [consent, setConsent] = useState(false);
  const [agreement, setAgreement] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailDone, setEmailDone] = useState<Extract<SignupResult, { signedIn: false }> | null>(null);

  const askPhone = chosen?.method !== 'WHATSAPP';
  const hasEmail = Boolean(chosen && chosen.method !== 'WHATSAPP');
  const problems = useMemo(
    () => (side === 'client' ? clientProblems(clientForm, askPhone) : caregiverProblems(caregiverForm, askPhone)),
    [side, clientForm, caregiverForm, askPhone],
  );

  const finishSignedIn = async (tokens: Tokens) => {
    const user = await signIn(tokens);
    if (!user) {
      setError(t('signup.errors.generic'));
      return;
    }
    router.replace(afterSignIn(user, returnTo) as never);
  };

  /** Step 1 done: start the form from what the sign-in and the search already said. */
  const choose = (next: ChosenSignIn) => {
    setError(null);
    setChosen(next);
    const name = next.method === 'EMAIL' ? null : next.identity.name;
    if (side === 'client') {
      setClientForm(startClientForm({ name, whatsapp: next.method === 'WHATSAPP', fromSearch }));
      setAnswered(
        new Set(
          Object.entries(fromSearch)
            .filter(([, v]) => v !== undefined)
            .map(([k]) => k as keyof IntakeFromSearch),
        ),
      );
    } else {
      setCaregiverForm(startCaregiverForm(name));
    }
    scroll.current?.scrollTo?.({ y: 0, animated: false });
  };

  const startOver = () => {
    setChosen(null);
    setChecked(false);
  };

  const submit = async () => {
    if (!chosen) return;
    setChecked(true);
    setError(null);
    if (Object.keys(problems).length || !consent || !agreement) return;
    setBusy(true);
    try {
      const details = side === 'client' ? clientPayload(clientForm, askPhone) : caregiverPayload(caregiverForm, askPhone);
      const res = await submitSignup(side, {
        ...details,
        ...(chosen.method === 'EMAIL' ? { email: chosen.email, password: chosen.password } : { signupTicket: chosen.identity.ticket }),
        consentAccepted: true,
        agreementAccepted: true,
        agreementVersion: agreementVersion(side),
      });
      if (res.signedIn) await finishSignedIn(res.tokens);
      else setEmailDone(res);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ticket_expired') {
        startOver();
        setError(t('signup.errors.ticketExpired'));
      } else if (err instanceof ApiError && err.code === 'agreement_changed') {
        setError(t('signup.errors.agreementChanged'));
      } else {
        setError(err instanceof ApiError && err.message ? err.message : t('signup.errors.generic'));
      }
    } finally {
      setBusy(false);
    }
  };

  const title = side === 'caregiver' ? t('signup.join.title') : t('signup.createAccount');

  if (emailDone) {
    return (
      <Screen title={title}>
        <ScrollView contentContainerStyle={styles.body}>
          <Card style={{ gap: 12, alignItems: 'center' }}>
            <Ionicons name="mail-open-outline" size={56} color={colors.brand} />
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink, textAlign: 'center' }]}>
              {t('signup.checkEmailTitle')}
            </Text>
            <Text style={{ fontSize: 17, lineHeight: 25, color: colors.ink, textAlign: 'center' }}>
              {t('signup.checkEmailBody', { email: emailDone.email })}
            </Text>
            {emailDone.registrationNumber ? (
              <Text style={{ color: colors.muted }}>{t('signup.regNumber', { number: emailDone.registrationNumber })}</Text>
            ) : null}
          </Card>
          <Button
            label={t('signup.signIn')}
            onPress={() => router.replace({ pathname: '/sign-in', params: { role: side, ...(returnTo ? { returnTo } : {}) } })}
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen title={title} subtitle={t('signup.stepOf', { step: chosen ? 2 : 1, total: 2 })}>
      <ScrollView ref={scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!chosen ? (
          <>
            <FormError message={error} />
            <MethodStep side={side} onChosen={choose} onSignedIn={(tokens) => void finishSignedIn(tokens)} />
          </>
        ) : (
          <>
            <ChosenSummary chosen={chosen} onChange={startOver} />
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
              {side === 'client' ? t('signup.detailsTitleClient') : t('signup.detailsTitleCaregiver')}
            </Text>
            {side === 'client' && answered.size ? (
              <Text style={{ fontSize: 16, lineHeight: 23, color: colors.muted }}>{t('signup.detailsSubtitle')}</Text>
            ) : null}

            {side === 'client' ? (
              <ClientDetails
                form={clientForm}
                setForm={setClientForm}
                askPhone={askPhone}
                hasEmail={hasEmail}
                answered={answered}
                problems={checked ? problems : null}
              />
            ) : (
              <CaregiverDetails form={caregiverForm} setForm={setCaregiverForm} askPhone={askPhone} problems={checked ? problems : null} />
            )}

            <TickBox
              label={side === 'client' ? t('signup.consentClient') : t('signup.consentCaregiver')}
              checked={consent}
              onChange={setConsent}
              error={checked && !consent ? t('signup.errors.consent') : null}
            />
            <AgreementBox side={side} checked={agreement} onChange={setAgreement} error={checked && !agreement ? t('signup.agreement.required') : null} />

            <FormError message={error} />
            <Button label={busy ? t('signup.creating') : t('signup.submit')} onPress={() => void submit()} busy={busy} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 20, paddingBottom: 40, gap: 18 },
  heading: { fontSize: 22, lineHeight: 30, fontWeight: '800' },
});
