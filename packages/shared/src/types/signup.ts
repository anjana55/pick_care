import type { SocialProviderAvailability, SocialProviderName, Tokens } from './auth';

/**
 * Registration with the sign-in method chosen first.
 *
 * A new client or caregiver picks how they will sign in before anything
 * else - WhatsApp, Google / Microsoft / Facebook, or an email address and a
 * password - and proves it where that can be done at once (a WhatsApp code,
 * the provider's own screen). What comes back is a sign-up ticket: proof of
 * that one identity, good for one registration. The details form is then
 * sent with the ticket, so it never asks again for anything the sign-in
 * already settled (the WhatsApp number, the verified email address).
 *
 * Email and password need no ticket: they are typed on the first screen and
 * sent with the form, and the address is confirmed by the usual link.
 */

/** Which side of the platform a registration is for. */
export type SignupSide = 'client' | 'caregiver';

/** How the new account will sign in. */
export const signupMethodValues = ['WHATSAPP', 'EMAIL', 'GOOGLE', 'MICROSOFT', 'FACEBOOK'] as const;
export type SignupMethod = (typeof signupMethodValues)[number];

/** GET /auth/signup/methods?side=client|caregiver - what the first screen may offer. */
export interface SignupMethods {
  /** Always on: email and password needs nothing switched on. */
  email: boolean;
  /** WhatsApp sign-up is on for this side (Settings > WhatsApp). */
  whatsapp: boolean;
  /** Google, Microsoft and Facebook as switched on in Settings > Sign-in providers. */
  providers: SocialProviderAvailability;
}

/**
 * POST /auth/signup/whatsapp/verify-otp and POST /auth/signup/identity/exchange:
 * a proven identity, ready to be registered.
 */
export interface SignupIdentity {
  /** Send back as `signupTicket` with the details form. Single use. */
  ticket: string;
  /** Seconds until the ticket stops working (the form must be sent before then). */
  expiresInSeconds: number;
  method: Exclude<SignupMethod, 'EMAIL'>;
  side: SignupSide;
  /** The address the provider verified (Google, Microsoft, Facebook). */
  email: string | null;
  /** The WhatsApp number that was verified, as stored (E.164). */
  phone: string | null;
  /** The name the provider knows them by, to start the form with. */
  name: string | null;
}

/**
 * POST /auth/signup/whatsapp/verify-otp. A number that is already a WhatsApp
 * login on this side has registered before: rather than an error, they are
 * simply signed in.
 */
export type SignupVerifyResult = ({ signedIn: false } & SignupIdentity) | { signedIn: true; tokens: Tokens };

/** POST /auth/signup/whatsapp/request-otp. */
export interface SignupOtpSent {
  /** The number the code went to, normalised (E.164). */
  phone: string;
  resendAfterSeconds: number;
  expiresInSeconds: number;
  /** Development only (the console WhatsApp provider): the code itself. */
  devOtp?: string;
}

/**
 * POST /auth/signup/client and POST /auth/signup/caregiver.
 *
 * A WhatsApp or provider sign-up is proven already, so the account is signed
 * in at once (`tokens`). An email sign-up is not: the address is confirmed by
 * the link sent to it first (`verificationSent`).
 */
export type SignupResult =
  | {
      signedIn: true;
      tokens: Tokens;
      method: SignupMethod;
      /** Caregivers: the reference staff know them by. */
      registrationNumber?: string;
    }
  | {
      signedIn: false;
      method: 'EMAIL';
      email: string;
      verificationSent: boolean;
      registrationNumber?: string;
      /** Development only: the link that was emailed. */
      devVerificationUrl?: string;
    };

/** Providers in the order the sign-up screens show them. */
export const SIGNUP_PROVIDER_ORDER: SocialProviderName[] = ['GOOGLE', 'MICROSOFT', 'FACEBOOK'];
