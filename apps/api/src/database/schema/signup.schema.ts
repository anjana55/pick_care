import { mysqlTable, varchar, datetime, mysqlEnum, index, uniqueIndex } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { signupMethodValues } from '@care-platform/shared';

export const signupSideEnum = ['client', 'caregiver'] as const;

/**
 * A sign-in method proven before the registration form is filled in - the
 * "pick how you will sign in first" registration (SignupService).
 *
 * A row is made when someone verifies a WhatsApp code for a number that has
 * no account, or comes back from Google / Microsoft / Facebook with an
 * identity nobody has linked. It is the proof the details form is sent
 * with: `ticket_hash` is what the form presents (the ticket itself is only
 * ever held by the browser or app), and `used_at` makes it good for one
 * registration.
 *
 * The provider round trip ends in a top-level redirect, so it cannot hand the
 * ticket over directly; it hands over a 60-second one-time code instead
 * (`code_hash`, as auth_handoff_codes), which the page trades for the ticket
 * over POST - with the app's PKCE verifier when the app started it
 * (`code_challenge`).
 *
 * Nothing secret is stored: both the ticket and the code are hashed.
 */
export const signupIdentities = mysqlTable(
  'signup_identities',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    side: mysqlEnum('side', signupSideEnum).notNull(),
    method: mysqlEnum('method', signupMethodValues).notNull(),
    // WHATSAPP: the number the code was verified on (E.164).
    phone: varchar('phone', { length: 32 }),
    // GOOGLE / MICROSOFT / FACEBOOK: the provider's stable id and the address it verified.
    providerAccountId: varchar('provider_account_id', { length: 255 }),
    providerEmail: varchar('provider_email', { length: 255 }),
    providerName: varchar('provider_name', { length: 255 }),
    ticketHash: varchar('ticket_hash', { length: 64 }),
    expiresAt: datetime('expires_at').notNull(),
    usedAt: datetime('used_at'),
    // The provider round trip's one-time code (sha256), and the app's challenge.
    codeHash: varchar('code_hash', { length: 64 }),
    codeChallenge: varchar('code_challenge', { length: 64 }),
    codeExpiresAt: datetime('code_expires_at'),
    codeUsedAt: datetime('code_used_at'),
    // The account the ticket was registered as, once it was.
    userId: varchar('user_id', { length: 36 }),
    createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    ticketIdx: uniqueIndex('signup_identities_ticket_idx').on(table.ticketHash),
    codeIdx: index('signup_identities_code_idx').on(table.codeHash),
    expiresIdx: index('signup_identities_expires_idx').on(table.expiresAt),
  }),
);

export const agreementKindEnum = ['CLIENT_SERVICE', 'CAREGIVER_SERVICE'] as const;
export type AgreementKind = (typeof agreementKindEnum)[number];

/**
 * Who accepted which version of a service agreement, and when - written at
 * registration (packages/shared/src/types/agreements.ts holds the text and
 * its version). Kept as rows rather than a column on users so a later
 * version can be accepted alongside the first without losing the record of
 * what was agreed before.
 */
export const agreementAcceptances = mysqlTable(
  'agreement_acceptances',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    kind: mysqlEnum('kind', agreementKindEnum).notNull(),
    version: varchar('version', { length: 32 }).notNull(),
    locale: varchar('locale', { length: 8 }),
    acceptedAt: datetime('accepted_at').notNull(),
    ipAddress: varchar('ip_address', { length: 64 }),
  },
  (table) => ({
    userIdx: index('agreement_acceptances_user_idx').on(table.userId),
  }),
);
