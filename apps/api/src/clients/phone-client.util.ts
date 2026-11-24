import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID as uuid } from 'crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../database/database.module';
import { patients, users } from '../database/schema';
import { normalizePhone } from '../common/utils/phone.util';
import { assertWhatsappNumberAvailable } from '../auth/phone-accounts.util';
import { buildPatientIntake } from './patient-profile.util';
import type { PhoneClientDto } from './phone-client.dto';

export const DUPLICATE_CLIENT_MESSAGE = 'A client with this phone number or email already exists - search for them instead';

/** True for a MySQL unique-key violation (users.phone / users.email). */
export const isDuplicateEntry = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return (e?.code ?? e?.cause?.code) === 'ER_DUP_ENTRY';
};

/**
 * Creates the login account and client record for someone staff are adding
 * themselves - over the phone, at the office - rather than one who signed up
 * on the website. Shared by "Add new client" (PatientsService.create) and a
 * first-time caller on a phone request (CareRequestsService.createByStaff).
 *
 * - The phone number is mandatory and becomes their WhatsApp sign-in, already
 *   confirmed (staff are speaking to them on it), so they can sign in later
 *   with a code sent to it - no password is ever set.
 * - Email is optional. When given it must not already belong to anyone.
 * - A number or email that already belongs to anyone is refused, so staff
 *   pick the existing client instead of making a duplicate.
 * - The record starts ACTIVE: there is nothing to review, staff took the
 *   details down themselves.
 *
 * Run it inside the caller's transaction, so a failure later in the same
 * operation never leaves a half-made client behind. Concurrent inserts of the
 * same number still hit the unique index: callers map isDuplicateEntry to
 * DUPLICATE_CLIENT_MESSAGE.
 */
export async function createPhoneClient(db: Database, dto: PhoneClientDto, defaultCountryCode: string): Promise<string> {
  const phone = normalizePhone(dto.phone, defaultCountryCode);
  if (!phone) throw new BadRequestException('Enter a valid phone number');
  try {
    await assertWhatsappNumberAvailable(db, phone, defaultCountryCode);
  } catch (err) {
    if (err instanceof ConflictException) throw new ConflictException(DUPLICATE_CLIENT_MESSAGE);
    throw err;
  }
  const email = dto.email?.trim().toLowerCase() || null;
  if (email) {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (taken) throw new ConflictException(DUPLICATE_CLIENT_MESSAGE);
  }
  // Also refuses an EMAIL contact preference when no email was given.
  const intake = await buildPatientIntake(db, dto, { hasEmail: Boolean(email) });

  const userId = uuid();
  const now = new Date();
  const fullName = dto.fullName.trim();
  await db.insert(users).values({
    id: userId,
    email,
    passwordHash: null,
    phone,
    phoneVerifiedAt: now,
    fullName,
    role: 'PATIENT_GUARDIAN',
    isActive: true,
  });
  const patientId = uuid();
  await db.insert(patients).values({
    id: patientId,
    userId,
    fullName,
    phone,
    // Verbal consent, confirmed by the staff member on the form.
    consentAcceptedAt: now,
    ...intake,
    status: 'ACTIVE',
  });
  return patientId;
}
