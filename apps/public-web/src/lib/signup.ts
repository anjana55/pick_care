'use client';

import { useQuery } from '@tanstack/react-query';
import type { SignupIdentity, SignupMethods, SignupSide } from '@care-platform/shared';
import { api } from '@/lib/api/client';

/**
 * The website's half of registration with the sign-in method chosen first
 * (packages/shared/src/types/signup.ts): what the first screen offers, the
 * provider round trip, and the proven identity carried to the details form.
 */

/** What the first screen may offer this side. A failed lookup offers email and password only. */
export function useSignupMethods(side: SignupSide) {
  return useQuery({
    queryKey: ['signup-methods', side],
    queryFn: () => api.get<SignupMethods>('/auth/signup/methods', { side }),
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * How the new account will sign in, once chosen on the first screen: a proven
 * identity (WhatsApp, a provider) or the email and password typed there.
 */
export type ChosenSignIn = { method: 'EMAIL'; email: string; password: string } | { method: SignupIdentity['method']; identity: SignupIdentity };

/**
 * Where a proven identity waits while the provider round trip reloads the
 * page, per side. sessionStorage: per tab, gone with it, and the ticket only
 * lasts an hour anyway.
 */
const IDENTITY_KEY = (side: SignupSide) => `care-signup-identity-${side}`;

export function rememberIdentity(identity: SignupIdentity) {
  try {
    window.sessionStorage.setItem(IDENTITY_KEY(identity.side), JSON.stringify({ identity, until: Date.now() + identity.expiresInSeconds * 1000 }));
  } catch {
    // Storage blocked: they will be asked to choose again.
  }
}

export function takeRememberedIdentity(side: SignupSide): SignupIdentity | null {
  try {
    const raw = window.sessionStorage.getItem(IDENTITY_KEY(side));
    if (!raw) return null;
    const stored = JSON.parse(raw) as { identity?: SignupIdentity; until?: number };
    if (!stored.identity || typeof stored.until !== 'number' || stored.until < Date.now() || stored.identity.side !== side) return null;
    return stored.identity;
  } catch {
    return null;
  }
}

export function forgetIdentity(side: SignupSide) {
  try {
    window.sessionStorage.removeItem(IDENTITY_KEY(side));
  } catch {
    // ignore
  }
}

/** Where each side's registration form lives - the provider callback comes back to it. */
export const SIGNUP_PAGE: Record<SignupSide, string> = { client: '/register', caregiver: '/caregiver/signup' };
