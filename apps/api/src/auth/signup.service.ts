import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID as uuid } from 'crypto';
import {
  agreementVersion,
  type SignupIdentity,
  type SignupMethods,
  type SignupOtpSent,
  type SignupResult,
  type SignupSide,
  type SignupVerifyResult,
} from '@care-platform/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { agreementAcceptances, caregivers, patients, signupIdentities, socialAccounts, users, type SocialProvider } from '../database/schema';
import { AuthService } from './auth.service';
import { SocialProviderRegistry } from './social/social-provider';
import { SIGNUP_TICKET_TTL_MS, matchesChallenge } from './social-auth.service';
import { WhatsappSettingsService, type ResolvedWhatsappSettings } from '../whatsapp/whatsapp-settings.service';
import { WhatsappOtpService } from '../whatsapp/whatsapp-otp.service';
import { WhatsappProviderService } from '../whatsapp/whatsapp-provider.service';
import { normalizePhone } from '../common/utils/phone.util';
import { assertNoWhatsappLoginForPhone, assertWhatsappNumberAvailable, purgeUnverifiedPhoneAccount } from './phone-accounts.util';
import { buildPatientIntake } from '../clients/patient-profile.util';
import { assertUniqueContactFields, generateRegistrationNumber, selfRegisteredCaregiverValues } from '../caregivers/caregiver-creation.util';
import { resolveLocationRefs } from '../common/utils/location.util';
import { generateUniquePublicId } from '../caregivers/caregiver-ref.util';
import type { SignupCaregiverDto, SignupClientDto } from './dto/signup.dto';

const ROLE_OF: Record<SignupSide, 'CAREGIVER' | 'PATIENT_GUARDIAN'> = { client: 'PATIENT_GUARDIAN', caregiver: 'CAREGIVER' };
const AGREEMENT_KIND = { client: 'CLIENT_SERVICE', caregiver: 'CAREGIVER_SERVICE' } as const;

// One message for every way a code can fail - see WhatsappOtpService.verify.
const BAD_CODE = 'This code is invalid or has expired. Request a new one and try again.';
const TICKET_GONE = 'Your sign-in has expired. Choose how to sign in again.';
const EXCHANGE_GONE = 'This sign-in link has expired. Please try again.';
const ALREADY_REGISTERED = 'An account with this phone number already exists - sign in instead';

/**
 * A refusal the sign-up screens act on, not just show: a stable `code` next
 * to the message (same shape as SocialLinkError).
 */
export class SignupError extends HttpException {
  constructor(
    readonly code: 'ticket_expired' | 'agreement_changed' | 'already_registered',
    message: string,
    status: HttpStatus,
  ) {
    super({ code, message, statusCode: status }, status);
  }
}

/** What a registration was proven with - a ticket's identity, or an email and password. */
type ResolvedIdentity =
  | { method: 'WHATSAPP'; ticketId: string; phone: string }
  | { method: SocialProvider; ticketId: string; email: string; accountId: string }
  | { method: 'EMAIL'; email: string; password: string };

/**
 * Registration with the sign-in method chosen first, for clients and
 * caregivers alike (see packages/shared/src/types/signup.ts).
 *
 * The person picks WhatsApp, a provider, or email and password before the
 * details form. WhatsApp and providers are proven straight away and turned
 * into a single-use ticket (signup_identities); the details form is then sent
 * with it and creates the account already signed in. Email and password are
 * sent with the form, and the address is confirmed by the usual link.
 *
 * Alongside the older routes (register-patient, register-caregiver/unified,
 * the WhatsApp register-* routes), which keep working for app versions that
 * still use them.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly authService: AuthService,
    private readonly registry: SocialProviderRegistry,
    private readonly whatsappSettings: WhatsappSettingsService,
    private readonly otp: WhatsappOtpService,
    private readonly whatsappProvider: WhatsappProviderService,
  ) {}

  /** What the first screen may offer this side. */
  async methods(side: SignupSide): Promise<SignupMethods> {
    const s = await this.whatsappSettings.getResolved();
    return { email: true, whatsapp: this.whatsappSignupOn(s, side), providers: await this.registry.available() };
  }

  // --- WhatsApp -------------------------------------------------------------

  /**
   * Sends a code to a number for a new sign-up. Nothing about whether the
   * number has an account is said here - that is settled once the code
   * proves the number is theirs (verifyOtp).
   */
  async requestOtp(side: SignupSide, rawPhone: string): Promise<SignupOtpSent> {
    const s = await this.requireWhatsapp(side);
    const phone = this.whatsappPhone(rawPhone, s);
    const base = { phone, resendAfterSeconds: s.otpResendCooldownSeconds, expiresInSeconds: s.otpTtlSeconds };

    const issued = await this.otp.issue(phone, 'REGISTER', s);
    if (!issued.issued) {
      throw new HttpException(
        { message: 'Please wait a little before asking for another code.', retryAfterSeconds: issued.retryAfterSeconds },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      await this.whatsappProvider.sendOtp(s, phone, issued.code);
    } catch (err) {
      this.logger.error(`Sign-up OTP delivery failed: ${(err as Error).message}`);
      throw new BadRequestException('We could not send the WhatsApp code just now. Please try again.');
    }
    return { ...base, ...(this.whatsappProvider.isDevConsole(s) ? { devOtp: issued.code } : {}) };
  }

  /**
   * The code proves the number. A number that is already this side's
   * WhatsApp login has registered before, so they are signed in; one that
   * belongs to any other account is refused; anything else becomes a ticket.
   */
  async verifyOtp(side: SignupSide, rawPhone: string, code: string): Promise<SignupVerifyResult> {
    const s = await this.requireWhatsapp(side);
    const phone = this.whatsappPhone(rawPhone, s);
    if (!(await this.otp.verify(phone, 'REGISTER', code))) throw new UnauthorizedException(BAD_CODE);

    const [existing] = await this.db.select().from(users).where(eq(users.phone, phone)).limit(1);
    // Only while WhatsApp sign-in itself is on: switching it off in Settings
    // must not leave this as a way round it.
    if (existing && existing.phoneVerifiedAt && existing.isActive && existing.role === ROLE_OF[side] && s.loginEnabled) {
      return { signedIn: true, tokens: await this.authService.startSession(existing) };
    }

    await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as Database;
      // The owner of the number has just proven it, so an abandoned sign-up
      // that never verified it no longer holds it.
      await purgeUnverifiedPhoneAccount(txDb, phone);
      await this.assertPhoneFree(txDb, phone, s.defaultCountryCode);
    });

    const ticket = this.newSecret();
    await this.db.insert(signupIdentities).values({
      id: uuid(),
      side,
      method: 'WHATSAPP',
      phone,
      ticketHash: this.hash(ticket),
      expiresAt: new Date(Date.now() + SIGNUP_TICKET_TTL_MS),
    });
    return { signedIn: false, ...this.identityView({ side, method: 'WHATSAPP', phone, email: null, name: null }, ticket) };
  }

  // --- Google / Microsoft / Facebook ---------------------------------------

  /**
   * The provider callback's one-time code -> the ticket. From the app, only
   * with the verifier behind the challenge it started with.
   */
  async exchangeIdentityCode(code: string, verifier?: string): Promise<SignupIdentity> {
    const [row] = await this.db
      .select()
      .from(signupIdentities)
      .where(and(eq(signupIdentities.codeHash, this.hash(code)), isNull(signupIdentities.codeUsedAt)))
      .limit(1);
    if (!row || !row.codeExpiresAt || row.codeExpiresAt < new Date()) throw new UnauthorizedException(EXCHANGE_GONE);
    // Spent on the first attempt either way, so a wrong verifier can't be retried.
    await this.db.update(signupIdentities).set({ codeUsedAt: new Date() }).where(eq(signupIdentities.id, row.id));
    if (row.codeChallenge && !matchesChallenge(verifier, row.codeChallenge)) throw new UnauthorizedException(EXCHANGE_GONE);

    const ticket = this.newSecret();
    await this.db
      .update(signupIdentities)
      .set({ ticketHash: this.hash(ticket) })
      .where(eq(signupIdentities.id, row.id));
    return this.identityView({ side: row.side, method: row.method as SocialProvider, phone: null, email: row.providerEmail, name: row.providerName }, ticket);
  }

  // --- Registration ---------------------------------------------------------

  async registerClient(dto: SignupClientDto, meta: { ip?: string; locale?: string }): Promise<SignupResult & { userId: string }> {
    this.assertAgreement('client', dto.agreementVersion);
    const identity = await this.resolveIdentity('client', dto);
    const countryCode = await this.whatsappSettings.getDefaultCountryCode();

    // The contact number: the one WhatsApp verified, or the one typed.
    const phone = identity.method === 'WHATSAPP' ? identity.phone : dto.phone?.trim();
    if (!phone) throw new BadRequestException('Phone number is required');
    const email = identity.method === 'WHATSAPP' ? null : identity.email;
    if (email) await this.assertEmailFree(email);
    if (identity.method !== 'WHATSAPP') await assertNoWhatsappLoginForPhone(this.db, normalizePhone(phone, countryCode));
    const passwordHash = identity.method === 'EMAIL' ? await bcrypt.hash(identity.password, 12) : null;

    const userId = await this.withDuplicateGuard(() =>
      this.db.transaction(async (tx) => {
        const txDb = tx as unknown as Database;
        if (identity.method !== 'EMAIL') await this.spendTicket(txDb, identity.ticketId);
        if (identity.method === 'WHATSAPP') {
          await purgeUnverifiedPhoneAccount(txDb, phone);
          await this.assertPhoneFree(txDb, phone, countryCode);
        }
        const intake = await buildPatientIntake(txDb, dto, { hasEmail: Boolean(email) });

        const id = uuid();
        await tx.insert(users).values({
          id,
          email,
          passwordHash,
          // users.phone is a WhatsApp login, so only a WhatsApp sign-up sets it.
          phone: identity.method === 'WHATSAPP' ? phone : null,
          phoneVerifiedAt: identity.method === 'WHATSAPP' ? new Date() : null,
          fullName: dto.fullName.trim(),
          role: 'PATIENT_GUARDIAN',
          isActive: true,
          // A provider has verified its address; an email sign-up confirms by link.
          emailVerifiedAt: identity.method === 'EMAIL' || identity.method === 'WHATSAPP' ? null : new Date(),
        });
        await tx.insert(patients).values({
          id: uuid(),
          userId: id,
          fullName: dto.fullName.trim(),
          phone,
          consentAcceptedAt: new Date(),
          ...intake,
          // Every self-registered client starts unreviewed; staff promote it to ACTIVE.
          status: 'PENDING_REVIEW',
        });
        await this.linkProvider(txDb, id, identity);
        await this.recordAgreement(txDb, id, 'client', meta);
        if (identity.method !== 'EMAIL') await tx.update(signupIdentities).set({ userId: id }).where(eq(signupIdentities.id, identity.ticketId));
        return id;
      }),
    );

    return { userId, ...(await this.finish(userId, identity)) };
  }

  async registerCaregiver(dto: SignupCaregiverDto, meta: { ip?: string; locale?: string }): Promise<SignupResult & { userId: string; caregiverId: string }> {
    this.assertAgreement('caregiver', dto.agreementVersion);
    const identity = await this.resolveIdentity('caregiver', dto);
    const countryCode = await this.whatsappSettings.getDefaultCountryCode();

    // One number, written to users.phone and caregivers.primaryPhone as the
    // unified sign-up does: the verified WhatsApp number, or the one typed.
    const phone = identity.method === 'WHATSAPP' ? identity.phone : normalizePhone(dto.phone ?? '', countryCode);
    if (!phone) throw new BadRequestException(dto.phone ? 'Enter a valid phone number' : 'Phone number is required');
    const email = identity.method === 'WHATSAPP' ? null : identity.email;
    if (email) await this.assertEmailFree(email);
    const passwordHash = identity.method === 'EMAIL' ? await bcrypt.hash(identity.password, 12) : null;

    const {
      phone: _phone,
      email: _email,
      password: _password,
      signupTicket: _ticket,
      consentAccepted: _consent,
      agreementAccepted: _agreement,
      agreementVersion: _version,
      ...rest
    } = dto;
    const fields = { ...rest, primaryPhone: phone };

    const result = await this.withDuplicateGuard(() =>
      this.db.transaction(async (tx) => {
        const txDb = tx as unknown as Database;
        if (identity.method !== 'EMAIL') await this.spendTicket(txDb, identity.ticketId);
        await purgeUnverifiedPhoneAccount(txDb, phone);
        await this.assertPhoneFree(txDb, phone, countryCode);
        await assertUniqueContactFields(txDb, fields);
        const location = await resolveLocationRefs(txDb, fields);

        const userId = uuid();
        await tx.insert(users).values({
          id: userId,
          email,
          passwordHash,
          phone,
          phoneVerifiedAt: identity.method === 'WHATSAPP' ? new Date() : null,
          fullName: fields.fullName,
          role: 'CAREGIVER',
          isActive: true,
          emailVerifiedAt: identity.method === 'EMAIL' || identity.method === 'WHATSAPP' ? null : new Date(),
        });
        const caregiverId = uuid();
        const registrationNumber = await generateRegistrationNumber(txDb);
        await tx
          .insert(caregivers)
          .values(
            selfRegisteredCaregiverValues({ id: caregiverId, publicId: await generateUniquePublicId(txDb), userId, registrationNumber, fields, location }),
          );
        await this.linkProvider(txDb, userId, identity);
        await this.recordAgreement(txDb, userId, 'caregiver', meta);
        if (identity.method !== 'EMAIL') await tx.update(signupIdentities).set({ userId }).where(eq(signupIdentities.id, identity.ticketId));
        return { userId, caregiverId, registrationNumber };
      }),
    );

    const finished = await this.finish(result.userId, identity);
    return { ...finished, registrationNumber: result.registrationNumber, userId: result.userId, caregiverId: result.caregiverId };
  }

  // --- helpers --------------------------------------------------------------

  private assertAgreement(side: SignupSide, accepted: string) {
    if (accepted !== agreementVersion(side)) {
      throw new SignupError('agreement_changed', 'The service agreement has been updated. Please read it again and accept it.', HttpStatus.CONFLICT);
    }
  }

  /** The ticket's identity (checked, not yet spent), or the email and password typed. */
  private async resolveIdentity(side: SignupSide, dto: { signupTicket?: string; email?: string; password?: string }): Promise<ResolvedIdentity> {
    if (dto.signupTicket) {
      const [row] = await this.db
        .select()
        .from(signupIdentities)
        .where(
          and(
            eq(signupIdentities.ticketHash, this.hash(dto.signupTicket)),
            eq(signupIdentities.side, side),
            isNull(signupIdentities.usedAt),
            gt(signupIdentities.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!row) throw new SignupError('ticket_expired', TICKET_GONE, HttpStatus.UNAUTHORIZED);
      if (row.method === 'WHATSAPP' && row.phone) return { method: 'WHATSAPP', ticketId: row.id, phone: row.phone };
      if (row.method !== 'EMAIL' && row.providerAccountId && row.providerEmail) {
        return { method: row.method as SocialProvider, ticketId: row.id, email: row.providerEmail, accountId: row.providerAccountId };
      }
      throw new SignupError('ticket_expired', TICKET_GONE, HttpStatus.UNAUTHORIZED);
    }
    const email = dto.email?.trim().toLowerCase();
    if (!email) throw new BadRequestException('Email is required');
    if (!dto.password) throw new BadRequestException('Password is required');
    return { method: 'EMAIL', email, password: dto.password };
  }

  /** Once only: a second registration with the same ticket (another tab, a retry) is refused. */
  private async spendTicket(db: Database, ticketId: string) {
    const [result] = await db
      .update(signupIdentities)
      .set({ usedAt: new Date() })
      .where(and(eq(signupIdentities.id, ticketId), isNull(signupIdentities.usedAt)));
    if (!(result as { affectedRows?: number }).affectedRows) throw new SignupError('ticket_expired', TICKET_GONE, HttpStatus.UNAUTHORIZED);
  }

  private async linkProvider(db: Database, userId: string, identity: ResolvedIdentity) {
    if (identity.method === 'EMAIL' || identity.method === 'WHATSAPP') return;
    await db.insert(socialAccounts).values({
      id: uuid(),
      userId,
      provider: identity.method,
      providerAccountId: identity.accountId,
      providerEmail: identity.email,
    });
  }

  private async recordAgreement(db: Database, userId: string, side: SignupSide, meta: { ip?: string; locale?: string }) {
    await db.insert(agreementAcceptances).values({
      id: uuid(),
      userId,
      kind: AGREEMENT_KIND[side],
      version: agreementVersion(side),
      locale: meta.locale?.slice(0, 8) ?? null,
      acceptedAt: new Date(),
      ipAddress: meta.ip?.slice(0, 64) ?? null,
    });
  }

  /** Signed in at once when the sign-in is proven; otherwise the confirmation email. */
  private async finish(userId: string, identity: ResolvedIdentity): Promise<SignupResult> {
    if (identity.method === 'EMAIL') {
      const url = await this.authService.issueVerificationLink(userId);
      return {
        signedIn: false,
        method: 'EMAIL',
        email: identity.email,
        verificationSent: url !== null,
        ...(url && this.config.get<string>('NODE_ENV') !== 'production' ? { devVerificationUrl: url } : {}),
      };
    }
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return { signedIn: true, method: identity.method, tokens: await this.authService.startSession(user) };
  }

  private async assertEmailFree(email: string) {
    const [taken] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (taken) throw new ConflictException('An account with this email already exists');
  }

  /** The three-table phone check, worded for a sign-up rather than for WhatsApp. */
  private async assertPhoneFree(db: Database, phone: string, countryCode: string) {
    try {
      await assertWhatsappNumberAvailable(db, phone, countryCode);
    } catch (err) {
      if (err instanceof ConflictException) throw new SignupError('already_registered', ALREADY_REGISTERED, HttpStatus.CONFLICT);
      throw err;
    }
  }

  private whatsappSignupOn(s: ResolvedWhatsappSettings, side: SignupSide) {
    const roleOn = side === 'caregiver' ? s.caregiverEnabled : s.customerEnabled;
    return s.enabled && s.registrationEnabled && roleOn;
  }

  private async requireWhatsapp(side: SignupSide) {
    const s = await this.whatsappSettings.getResolved();
    if (!this.whatsappSignupOn(s, side)) throw new ForbiddenException('WhatsApp sign-in is not available right now');
    return s;
  }

  private whatsappPhone(raw: string, s: ResolvedWhatsappSettings) {
    const phone = normalizePhone(raw, s.defaultCountryCode);
    if (!phone) throw new BadRequestException('Enter a valid WhatsApp number, including the country code if it is not a local number');
    return phone;
  }

  private identityView(
    v: { side: SignupSide; method: SignupIdentity['method']; phone: string | null; email: string | null; name: string | null },
    ticket: string,
  ): SignupIdentity {
    return { ticket, expiresInSeconds: Math.floor(SIGNUP_TICKET_TTL_MS / 1000), ...v };
  }

  private newSecret() {
    return randomBytes(32).toString('hex');
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Two sign-ups racing past the pre-checks; the unique indexes settle it. */
  private async withDuplicateGuard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if (e.code === 'ER_DUP_ENTRY' || e.cause?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('An account with these details already exists - sign in instead');
      }
      throw err;
    }
  }
}
