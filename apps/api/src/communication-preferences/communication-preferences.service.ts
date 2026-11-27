import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { CommunicationPreferences, UpdateCommunicationPreferences } from '@care-platform/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { caregivers, deviceTokens, patients, users } from '../database/schema';
import { AuditService } from '../audit/audit.service';

export type Subject = { kind: 'CAREGIVER'; caregiverId: string } | { kind: 'CLIENT'; patientId: string };

interface Loaded {
  kind: Subject['kind'];
  personId: string;
  userId: string | null;
  email: string | null;
  phone: string | null;
  preferredContactMethod: CommunicationPreferences['preferredContactMethod'];
  preferredContactTime: CommunicationPreferences['preferredContactTime'];
  pushEnabled: boolean;
  reminderMessagesEnabled: boolean;
  autoNotifyRequests: boolean;
}

export const EMAIL_NEEDS_ADDRESS = 'Email cannot be the preferred contact method for an account without an email address';
export const WHATSAPP_NEEDS_PHONE = 'WhatsApp cannot be the preferred contact method without a phone number';
export const NO_ACCOUNT = 'This caregiver has no sign-in account yet, so app and reminder settings do not apply. Only the contact method can be changed';

/**
 * Communication preferences for one client or caregiver: how we contact them
 * (preferred_contact_method / _time on their caregiver or patient row) and
 * the two account switches on users (push, optional reminder messages).
 *
 * Read and written by staff from the details pages and by the person
 * themselves (/me). Every change is written to the audit log with what it
 * was before, so "I never asked to stop WhatsApp" can be answered.
 */
@Injectable()
export class CommunicationPreferencesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** The subject for a signed-in client or caregiver. */
  async subjectForUser(userId: string, role: string): Promise<Subject> {
    if (role === 'CAREGIVER') {
      const [c] = await this.db.select({ id: caregivers.id }).from(caregivers).where(eq(caregivers.userId, userId)).limit(1);
      if (!c) throw new NotFoundException('Caregiver profile not found');
      return { kind: 'CAREGIVER', caregiverId: c.id };
    }
    const [p] = await this.db.select({ id: patients.id }).from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!p) throw new NotFoundException('Client profile not found');
    return { kind: 'CLIENT', patientId: p.id };
  }

  async get(subject: Subject): Promise<CommunicationPreferences> {
    return this.view(await this.load(subject));
  }

  async update(
    subject: Subject,
    dto: UpdateCommunicationPreferences,
    actor: { userId: string; self: boolean; ip?: string | null },
  ): Promise<CommunicationPreferences> {
    const before = await this.load(subject);
    const method = dto.preferredContactMethod !== undefined ? dto.preferredContactMethod : before.preferredContactMethod;

    if (dto.preferredContactMethod !== undefined && dto.preferredContactMethod !== before.preferredContactMethod) {
      if (method === 'EMAIL' && !before.email) throw new BadRequestException(EMAIL_NEEDS_ADDRESS);
      if (method === 'WHATSAPP' && !before.phone) throw new BadRequestException(WHATSAPP_NEEDS_PHONE);
    }
    const touchesAccount = dto.pushEnabled !== undefined || dto.reminderMessagesEnabled !== undefined;
    if (touchesAccount && !before.userId) throw new BadRequestException(NO_ACCOUNT);
    if (dto.preferredContactTime !== undefined && before.kind === 'CAREGIVER' && dto.preferredContactTime !== null) {
      throw new BadRequestException('Preferred contact time is kept for clients only');
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const note = (key: string, from: unknown, to: unknown) => {
      if (to !== undefined && from !== to) changes[key] = { from, to };
    };
    note('preferredContactMethod', before.preferredContactMethod, dto.preferredContactMethod);
    if (before.kind === 'CLIENT') note('preferredContactTime', before.preferredContactTime, dto.preferredContactTime);
    note('pushEnabled', before.pushEnabled, dto.pushEnabled);
    note('reminderMessagesEnabled', before.reminderMessagesEnabled, dto.reminderMessagesEnabled);
    if (!Object.keys(changes).length) return this.view(before);

    // Same rule as the caregiver edit form: auto notify needs a written channel.
    const autoNotifyOff = before.kind === 'CAREGIVER' && method === 'PHONE_CALL' && before.autoNotifyRequests;
    if (autoNotifyOff) changes.autoNotifyRequests = { from: true, to: false };

    await this.db.transaction(async (tx) => {
      if ('preferredContactMethod' in changes || autoNotifyOff || 'preferredContactTime' in changes) {
        if (before.kind === 'CAREGIVER') {
          const set: Partial<typeof caregivers.$inferInsert> = {};
          if ('preferredContactMethod' in changes) set.preferredContactMethod = method;
          if (autoNotifyOff) set.autoNotifyRequests = false;
          await tx.update(caregivers).set(set).where(eq(caregivers.id, before.personId));
        } else {
          const set: Partial<typeof patients.$inferInsert> = { updatedAt: new Date() };
          if ('preferredContactMethod' in changes) set.preferredContactMethod = method;
          if ('preferredContactTime' in changes) set.preferredContactTime = dto.preferredContactTime ?? null;
          await tx.update(patients).set(set).where(eq(patients.id, before.personId));
        }
      }
      if (before.userId && ('pushEnabled' in changes || 'reminderMessagesEnabled' in changes)) {
        const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
        if ('pushEnabled' in changes) set.pushEnabled = dto.pushEnabled;
        if ('reminderMessagesEnabled' in changes) set.reminderMessagesEnabled = dto.reminderMessagesEnabled;
        await tx.update(users).set(set).where(eq(users.id, before.userId));
      }
    });

    await this.audit.record({
      userId: actor.userId,
      action: actor.self ? 'UPDATE_OWN_COMMUNICATION_PREFERENCES' : 'UPDATE_COMMUNICATION_PREFERENCES',
      entityType: before.kind === 'CAREGIVER' ? 'Caregiver' : 'Patient',
      entityId: before.personId,
      metadata: { changes },
      ipAddress: actor.ip ?? null,
    });
    return this.get(subject);
  }

  private async load(subject: Subject): Promise<Loaded> {
    const account = {
      userId: users.id,
      email: users.email,
      accountPhone: users.phone,
      pushEnabled: users.pushEnabled,
      reminderMessagesEnabled: users.reminderMessagesEnabled,
    };
    if (subject.kind === 'CAREGIVER') {
      const [r] = await this.db
        .select({
          personId: caregivers.id,
          phone: caregivers.primaryPhone,
          preferredContactMethod: caregivers.preferredContactMethod,
          autoNotifyRequests: caregivers.autoNotifyRequests,
          ...account,
        })
        .from(caregivers)
        .leftJoin(users, eq(users.id, caregivers.userId))
        .where(and(eq(caregivers.id, subject.caregiverId), isNull(caregivers.deletedAt)))
        .limit(1);
      if (!r) throw new NotFoundException('Caregiver not found');
      return {
        kind: 'CAREGIVER',
        personId: r.personId,
        userId: r.userId ?? null,
        email: r.email ?? null,
        phone: r.accountPhone ?? r.phone ?? null,
        preferredContactMethod: r.preferredContactMethod ?? null,
        preferredContactTime: null,
        pushEnabled: r.pushEnabled ?? true,
        reminderMessagesEnabled: r.reminderMessagesEnabled ?? true,
        autoNotifyRequests: r.autoNotifyRequests,
      };
    }
    const [r] = await this.db
      .select({
        personId: patients.id,
        phone: patients.phone,
        preferredContactMethod: patients.preferredContactMethod,
        preferredContactTime: patients.preferredContactTime,
        ...account,
      })
      .from(patients)
      .leftJoin(users, eq(users.id, patients.userId))
      .where(eq(patients.id, subject.patientId))
      .limit(1);
    if (!r) throw new NotFoundException('Client not found');
    return {
      kind: 'CLIENT',
      personId: r.personId,
      userId: r.userId ?? null,
      email: r.email ?? null,
      phone: r.accountPhone ?? r.phone ?? null,
      preferredContactMethod: r.preferredContactMethod ?? null,
      preferredContactTime: r.preferredContactTime ?? null,
      pushEnabled: r.pushEnabled ?? true,
      reminderMessagesEnabled: r.reminderMessagesEnabled ?? true,
      autoNotifyRequests: false,
    };
  }

  private async view(l: Loaded): Promise<CommunicationPreferences> {
    let appDevices = 0;
    if (l.userId) {
      const [d] = await this.db
        .select({ n: count() })
        .from(deviceTokens)
        .where(and(eq(deviceTokens.userId, l.userId), isNull(deviceTokens.revokedAt)));
      appDevices = Number(d?.n ?? 0);
    }
    return {
      preferredContactMethod: l.preferredContactMethod,
      preferredContactTime: l.preferredContactTime,
      pushEnabled: l.pushEnabled,
      reminderMessagesEnabled: l.reminderMessagesEnabled,
      hasAccount: Boolean(l.userId),
      hasEmail: Boolean(l.email),
      hasPhone: Boolean(l.phone),
      appDevices,
    };
  }
}
