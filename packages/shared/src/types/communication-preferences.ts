import type { ContactMethod } from './caregivers';

/**
 * How a client or caregiver wants to hear from us. One card on the staff
 * details pages, the same settings on the website (Account > Notifications)
 * and in the app (Me > Notifications).
 *
 * - `preferredContactMethod` decides the *written* channel for every notice:
 *   WhatsApp when chosen and WhatsApp updates are on, otherwise email, then
 *   WhatsApp (chooseClientChannel). PHONE_CALL means staff phone them; written
 *   notices still go by email or WhatsApp so nothing important is lost.
 * - `pushEnabled` turns app push notifications off. The bell still keeps
 *   every notice, so nothing disappears.
 * - `reminderMessagesEnabled` turns off the *optional* WhatsApp/email
 *   messages: reminders that repeat something already sent (rating reminder,
 *   rejected-document reminder) and staff announcements by WhatsApp. They
 *   still show in the bell and as a push.
 *
 * Never switched off by any of these: the first notice about a booking,
 * shift, invoice, payout or document, and every payment reminder. Those
 * always go by the written channel above.
 */
export interface CommunicationPreferences {
  preferredContactMethod: ContactMethod | null;
  /** Clients only (patients.preferred_contact_time); always null for caregivers. */
  preferredContactTime: ContactTime | null;
  pushEnabled: boolean;
  reminderMessagesEnabled: boolean;
  /**
   * False for a client staff added over the phone who has never signed in:
   * there is no app or account to push to, so only the contact method and
   * time apply. The toggles are shown read-only.
   */
  hasAccount: boolean;
  /** What the person can be reached on, so screens can explain a disabled choice. */
  hasEmail: boolean;
  hasPhone: boolean;
  /** Phones with the app signed in right now. */
  appDevices: number;
}

export const contactTimeValues = ['ANYTIME', 'MORNING', 'AFTERNOON', 'EVENING'] as const;
export type ContactTime = (typeof contactTimeValues)[number];

export type UpdateCommunicationPreferences = Partial<Pick<CommunicationPreferences, 'preferredContactMethod' | 'preferredContactTime' | 'pushEnabled' | 'reminderMessagesEnabled'>>;

/** Defaults for an account with no choices saved: everything on. */
export const DEFAULT_PUSH_ENABLED = true;
export const DEFAULT_REMINDER_MESSAGES_ENABLED = true;
