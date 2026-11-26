import { BadRequestException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { toColombo, type AgentRunResult } from '@care-platform/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { agentDecisions, bookingShifts, bookings, caregivers, locationPoints, locationShares, patients, shiftCheckins } from '../database/schema';
import { AutomationService, type ActionExecutor } from '../automation/automation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CheckInService } from './check-in.service';
import { LiveCareAgentService, type VisitProposal } from './live-care-agent.service';
import { flagReason } from './live-care-rules';
import { presenceSteps, type PresenceFlagKind } from './presence-rules';
import { firstName } from './location-shares.service';

const ASK = 'live_care.check_presence' as const;
const FLAG = 'live_care.flag_visit' as const;

const ASK_TEXT = {
  en: { title: 'Still with {name}?', body: 'Your phone shows you away from the home. If you have gone out for the client (pharmacy, hospital), open the app and say so.' },
  si: { title: 'තවමත් {name} සමඟද?', body: 'ඔබ නිවසින් පිටත සිටින බව ඔබගේ දුරකථනය පෙන්වයි. ඔබ සේවාලාභියා වෙනුවෙන් පිටතට ගොස් ඇත්නම් (ෆාමසිය, රෝහල), යෙදුම විවෘත කර එය කියන්න.' },
  ta: { title: 'இன்னும் {name} உடன் இருக்கிறீர்களா?', body: 'நீங்கள் வீட்டுக்கு வெளியே இருப்பதாக உங்கள் தொலைபேசி காட்டுகிறது. வாடிக்கையாளருக்காக வெளியே சென்றிருந்தால் (மருந்தகம், மருத்துவமனை), செயலியைத் திறந்து அதைச் சொல்லுங்கள்.' },
} as const;

/**
 * The live-care agent's part for location checks during a visit (GPS
 * tracking C). Every pass, for each checked-in visit with checks running (or
 * turned off by the caregiver), it runs the presence rules and:
 * - asks the caregiver "Still with …?" (live_care.check_presence, tier 1);
 * - tells staff through the agent's usual flag (live_care.flag_visit, tier 0),
 *   once per visit and kind.
 * It never changes a shift, pay or an invoice, and never tells the client.
 */
@Injectable()
export class PresenceAgentService implements OnModuleInit {
  private readonly logger = new Logger(PresenceAgentService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly automation: AutomationService,
    private readonly liveCare: LiveCareAgentService,
    private readonly checkIns: CheckInService,
    private readonly notices: NotificationsService,
  ) {}

  onModuleInit() {
    this.automation.registerExecutor(ASK, this.ask);
    this.liveCare.registerPart((now, only) => this.sweep(now, only));
  }

  async sweep(now = new Date(), only?: string[]): Promise<Pick<AgentRunResult, 'considered' | 'decided' | 'scored' | 'leftToStaff'>> {
    const run = { considered: 0, decided: 0, scored: 0, leftToStaff: 0 };
    const settings = await this.checkIns.settings();
    if (!settings.enabled || !settings.liveEnabled || !settings.presenceEnabled) return run;
    if ((await this.automation.gate(FLAG)).mode === 'MANUAL') return run;

    // Visits with checks running, or stopped by the caregiver while still checked in.
    const rows = await this.db
      .select({
        share: locationShares,
        reference: bookings.reference,
        startsAt: bookingShifts.startsAt,
        registration: caregivers.registrationNumber,
        clientName: patients.fullName,
        checkedOutAt: shiftCheckins.checkedOutAt,
      })
      .from(locationShares)
      .innerJoin(bookingShifts, eq(locationShares.shiftId, bookingShifts.id))
      .innerJoin(bookings, eq(locationShares.bookingId, bookings.id))
      .innerJoin(patients, eq(bookings.patientId, patients.id))
      .innerJoin(caregivers, eq(locationShares.caregiverId, caregivers.id))
      .innerJoin(shiftCheckins, eq(shiftCheckins.shiftId, bookingShifts.id))
      .where(
        and(
          eq(locationShares.kind, 'ON_SHIFT'),
          isNotNull(shiftCheckins.checkedInAt),
          isNull(shiftCheckins.checkedOutAt),
          eq(bookingShifts.status, 'SCHEDULED'),
          or(isNull(locationShares.endedAt), and(eq(locationShares.endReason, 'STOPPED'), gte(locationShares.endedAt, new Date(now.getTime() - 12 * 3_600_000)))),
          only ? inArray(locationShares.shiftId, only) : undefined,
        ),
      )
      .limit(500);
    if (!rows.length) return run;

    // Only the newest share of each visit counts.
    const newest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const seen = newest.get(r.share.shiftId);
      const later = !seen || +new Date(seen.share.startedAt) < +new Date(r.share.startedAt) || (+new Date(seen.share.startedAt) === +new Date(r.share.startedAt) && !r.share.endedAt);
      if (later) newest.set(r.share.shiftId, r);
    }
    const visits = [...newest.values()];
    // The latest open share of a shift wins over a stopped one: a fresh share after "share from this phone" is not "stopped".
    const openShift = new Set(rows.filter((r) => !r.share.endedAt).map((r) => r.share.shiftId));

    const done = await this.taken(visits.map((v) => v.share.bookingId), now);
    const points = await this.db
      .select({ shareId: locationPoints.shareId, at: locationPoints.at, inside: locationPoints.inside, mocked: locationPoints.mocked })
      .from(locationPoints)
      .where(inArray(locationPoints.shareId, visits.map((v) => v.share.id)))
      .orderBy(asc(locationPoints.at));

    for (const v of visits) {
      if (v.share.endedAt && openShift.has(v.share.shiftId)) continue;
      const mine = points.filter((p) => p.shareId === v.share.id);
      const steps = presenceSteps(
        {
          everyMinutes: v.share.everyMinutes ?? settings.presenceEveryMinutes,
          startedAt: v.share.startedAt,
          endedAt: v.share.endedAt,
          endReason: v.share.endReason,
          checkedOutAt: v.checkedOutAt,
          lastAt: v.share.lastAt,
          points: mine,
          askedAt: v.share.awayAskedAt,
          reply: v.share.awayReply,
          repliedAt: v.share.awayRepliedAt,
        },
        settings,
        now,
      );
      const seen = done.get(v.share.shiftId) ?? new Set<string>();
      for (const step of steps) {
        const firstAway = step.step === 'ask' ? step.since : '';
        const key = step.step === 'ask' ? `${v.share.shiftId}|ask|${firstAway}` : `${v.share.shiftId}|${step.kind}`;
        if (seen.has(key)) continue;
        run.considered++;
        try {
          const ref = { caseType: 'BOOKING' as const, caseId: v.share.bookingId };
          const time = toColombo(v.startsAt).time;
          const base: VisitProposal = {
            bookingId: v.share.bookingId,
            bookingReference: v.reference,
            shiftId: v.share.shiftId,
            caregiverId: v.share.caregiverId,
            caregiverRegistration: v.registration,
            startsAt: new Date(v.startsAt).toISOString(),
          };
          const decision =
            step.step === 'ask'
              ? await this.automation.decide({
                  action: ASK,
                  case: ref,
                  reason: `Ask ${v.registration} whether they are still with ${firstName(v.clientName)}: their phone's last ${step.awayChecks} location check${step.awayChecks === 1 ? ' was' : 's were'} away from the home during the ${time} visit`,
                  proposal: { ...base, shareId: v.share.id, clientFirstName: firstName(v.clientName), awaySince: firstAway },
                  dedupeKey: key,
                })
              : await this.automation.decide({
                  action: FLAG,
                  case: ref,
                  reason: flagReason(step.kind as PresenceFlagKind, { minutes: step.minutes }, v.registration, time),
                  proposal: { ...base, kind: step.kind, minutes: step.minutes },
                  dedupeKey: key,
                });
          if (!decision.decisionId) continue;
          if (decision.outcome === 'EXECUTE') {
            const result = await this.automation.execute(decision.decisionId);
            if (!result.ok) {
              this.logger.warn(`Presence: ${step.step} on ${v.reference} failed - ${result.error}`);
              continue;
            }
            if (step.step === 'flag') run.leftToStaff++;
          }
          run.decided++;
        } catch (err) {
          this.logger.warn(`Presence: ${v.reference} skipped - ${(err as Error).message}`);
        }
      }
    }
    return run;
  }

  /** What this part has already decided on these bookings: dedupe keys by shift. */
  private async taken(bookingIds: string[], now: Date): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>();
    if (!bookingIds.length) return out;
    const rows = await this.db
      .select({ action: agentDecisions.action, proposal: agentDecisions.proposal })
      .from(agentDecisions)
      .where(and(inArray(agentDecisions.action, [ASK, FLAG]), eq(agentDecisions.caseType, 'BOOKING'), inArray(agentDecisions.caseId, [...new Set(bookingIds)]), gte(agentDecisions.createdAt, new Date(now.getTime() - 3 * 86_400_000))));
    for (const r of rows) {
      const p = r.proposal as (VisitProposal & { awaySince?: string }) | null;
      if (!p?.shiftId) continue;
      const set = out.get(p.shiftId) ?? new Set<string>();
      set.add(r.action === ASK ? `${p.shiftId}|ask|${p.awaySince ?? ''}` : `${p.shiftId}|${p.kind}`);
      out.set(p.shiftId, set);
    }
    return out;
  }

  /** "Still with …?": bell and push to the caregiver, and the time is kept so an unanswered question can lead to staff. */
  private readonly ask: ActionExecutor = async (decision) => {
    const p = decision.proposal as (VisitProposal & { shareId?: string; clientFirstName?: string }) | null;
    if (!p?.shareId || !p.caregiverId) throw new BadRequestException('This proposal has no visit');
    const [cg] = await this.db.select({ userId: caregivers.userId }).from(caregivers).where(eq(caregivers.id, p.caregiverId)).limit(1);
    const now = new Date();
    await this.db.update(locationShares).set({ awayAskedAt: now }).where(eq(locationShares.id, p.shareId));
    const name = p.clientFirstName || 'the client';
    if (cg?.userId) this.notices.notify([cg.userId], (lang) => ({ title: ASK_TEXT[lang].title.replace('{name}', name), body: ASK_TEXT[lang].body }), '/shifts', `presence ask ${p.shiftId}`);
    await this.automation.setHandoverNote(
      { caseType: 'BOOKING', caseId: p.bookingId },
      { done: `Asked ${p.caregiverRegistration} whether they are still with the client`, waiting: 'The caregiver to answer in the app', next: 'If they do not, and the next check is still away, staff are told' },
    );
    return { askedAt: now.toISOString() };
  };
}
