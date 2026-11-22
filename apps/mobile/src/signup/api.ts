import { useQuery } from '@tanstack/react-query';
import type {
  SignupIdentity,
  SignupMethods,
  SignupOtpSent,
  SignupResult,
  SignupSide,
  SignupVerifyResult,
  SocialProviderName,
  Tokens,
} from '@care-platform/shared';
import { api, ApiError } from '@/api';
import { bytesToBase64Url, toBase64Url, type SocialDeps } from '@/auth/social';

/**
 * The app's half of registering with the sign-in method chosen first
 * (packages/shared/src/types/signup.ts) - the same API the website uses.
 */

/** What the first screen may offer this side. A failed lookup offers email and password only. */
export function useSignupMethods(side: SignupSide) {
  return useQuery({
    queryKey: ['signup-methods', side],
    queryFn: () => api.request<SignupMethods>('/auth/signup/methods', { params: { side }, anonymous: true }),
    retry: false,
    staleTime: 60_000,
  });
}

/** How the new account will sign in, once chosen on the first screen. */
export type ChosenSignIn = { method: 'EMAIL'; email: string; password: string } | { method: SignupIdentity['method']; identity: SignupIdentity };

export const requestSignupCode = (side: SignupSide, phone: string) =>
  api.post<SignupOtpSent>('/auth/signup/whatsapp/request-otp', { side, phone }, { anonymous: true });

export const verifySignupCode = (side: SignupSide, phone: string, code: string) =>
  api.post<SignupVerifyResult>('/auth/signup/whatsapp/verify-otp', { side, phone, code }, { anonymous: true });

export const submitSignup = (side: SignupSide, body: Record<string, unknown>) =>
  api.post<SignupResult>(side === 'client' ? '/auth/signup/client' : '/auth/signup/caregiver', body, { anonymous: true });

/** What came of registering with Google, Microsoft or Facebook from the app. */
export type ProviderSignupOutcome = { identity: SignupIdentity } | { tokens: Tokens } | { canceled: true } | { error: string };

/**
 * Proves who someone is with a provider, before registering. The same round
 * trip as signing in (signInWithProvider): the phone's sign-in browser, a
 * nonce, and a PKCE challenge whose verifier never leaves the phone. Comes
 * back with a sign-up ticket - or, when that provider account has registered
 * before, with a session (they are simply signed in).
 */
export async function signupWithProvider(provider: SocialProviderName, side: SignupSide, deps: SocialDeps): Promise<ProviderSignupOutcome> {
  const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const nonce = hex(deps.randomBytes(16));
  const verifier = bytesToBase64Url(deps.randomBytes(32));
  const challenge = toBase64Url(await deps.sha256Base64(verifier));

  let url: string;
  try {
    ({ url } = await api.request<{ url: string }>(`/auth/social/${provider.toLowerCase()}/signup-url`, {
      params: { nonce, side, client: 'app', challenge },
      anonymous: true,
    }));
  } catch (err) {
    return { error: err instanceof ApiError ? 'provider_error' : 'network' };
  }

  const result = await deps.openAuthSession(url, deps.redirectUrl);
  if (result.type !== 'success' || !result.url) return { canceled: true };

  const back = new URL(result.url);
  const failure = back.searchParams.get('error');
  if (failure) return failure === 'declined' ? { canceled: true } : { error: failure };
  if (back.searchParams.get('nonce') !== nonce) return { error: 'state_mismatch' };
  const code = back.searchParams.get('code');
  if (!code) return { error: 'invalid_request' };

  try {
    // Registered before: the callback handed over a sign-in instead.
    if (back.searchParams.get('flow') === 'login') {
      return { tokens: await api.request<Tokens>('/auth/social/exchange', { method: 'POST', body: { code, verifier }, anonymous: true }) };
    }
    return { identity: await api.request<SignupIdentity>('/auth/signup/identity/exchange', { method: 'POST', body: { code, verifier }, anonymous: true }) };
  } catch {
    return { error: 'exchange_failed' };
  }
}
