import type { PresenceReply } from '@care-platform/shared';

/**
 * Location checks during a visit (GPS tracking C), as rules apart from the
 * database so they can be tested on their own. The live-care agent runs them
 * every two minutes for each checked-in visit with an ON_SHIFT share.
 *
 * - AWAY: the last N checks (the admin's "away after") were all outside the
 *   home's circle. First the caregiver is asked "Still with …?"; if they
 *   answer, that is noted and nobody is bothered. If they don't, and the
 *   next check is still away, staff are told.
 * - NO_LOCATION: no check for "silent after" intervals. Staff only, softly:
 *   phones die, signal drops, iOS stops the app when it is swiped away.
 * - SIMULATED: the phone said a position was simulated.
 * - STOPPED: the caregiver turned the checks off while checked in.
 *
 * Nothing here changes hours, pay or an invoice, or marks a visit missed.
 */

export type PresenceFlagKind = 'AWAY_DURING_VISIT' | 'NO_LOCATION_DURING_VISIT' | 'SIMULATED_LOCATION' | 'LOCATION_STOPPED';

export interface PresenceVisit {
  everyMinutes: number;
  startedAt: Date | string;
  /** When the share closed, and why; null while open. */
  endedAt: Date | string | null;
  endReason: string | null;
  checkedOutAt: Date | string | null;
  /** The latest check, if any. */
  lastAt: Date | string | null;
  /** The checks, oldest first. `inside` is null without a place on the map. */
  points: { at: Date | string; inside: boolean | null; mocked: boolean }[];
  askedAt: Date | string | null;
  reply: PresenceReply | null;
  repliedAt: Date | string | null;
}

export interface PresenceSettings {
  presenceAwayPoints: number;
  presenceSilentMultiplier: number;
}

/** `since`: the first check of this spell away (ISO), which also tells one spell from the next. */
export type PresenceStep = { step: 'ask'; awayChecks: number; since: string } | { step: 'flag'; kind: PresenceFlagKind; minutes: number };

const ms = (d: Date | string) => new Date(d).getTime();
const mins = (from: number, to: number) => Math.max(0, Math.round((to - from) / 60_000));

/** Every step that applies now; the agent drops those it has already taken for this visit. */
export function presenceSteps(v: PresenceVisit, settings: PresenceSettings, now: Date): PresenceStep[] {
  const t = now.getTime();
  const steps: PresenceStep[] = [];
  const checkedIn = !v.checkedOutAt;

  // Turned off by the caregiver while still checked in.
  if (v.endedAt && v.endReason === 'STOPPED' && checkedIn) steps.push({ step: 'flag', kind: 'LOCATION_STOPPED', minutes: mins(ms(v.endedAt), t) });

  if (v.points.some((p) => p.mocked)) steps.push({ step: 'flag', kind: 'SIMULATED_LOCATION', minutes: 0 });

  // The rest only while the checks are running and the caregiver is checked in.
  if (v.endedAt || !checkedIn) return steps;

  const every = v.everyMinutes * 60_000;
  const lastHeard = v.lastAt ? ms(v.lastAt) : ms(v.startedAt);
  if (t - lastHeard > every * settings.presenceSilentMultiplier) steps.push({ step: 'flag', kind: 'NO_LOCATION_DURING_VISIT', minutes: mins(lastHeard, t) });

  // Away: the last N checks all outside the circle. The spell starts at the first of the checks away in a row.
  const n = Math.max(1, settings.presenceAwayPoints);
  let run = 0;
  for (let i = v.points.length - 1; i >= 0 && v.points[i].inside === false; i--) run++;
  if (run >= n) {
    const since = ms(v.points[v.points.length - run].at);
    if (!v.askedAt || ms(v.askedAt) < since) {
      // Not asked about this spell yet.
      steps.push({ step: 'ask', awayChecks: run, since: new Date(since).toISOString() });
    } else {
      const answered = v.repliedAt && ms(v.repliedAt) >= ms(v.askedAt);
      const stillAwayAfterAsking = ms(v.points[v.points.length - 1].at) > ms(v.askedAt);
      if (!answered && stillAwayAfterAsking) steps.push({ step: 'flag', kind: 'AWAY_DURING_VISIT', minutes: mins(since, t) });
    }
  }
  return steps;
}

export function presenceReason(kind: PresenceFlagKind, minutes: number, who: string, startTime: string): string {
  if (kind === 'AWAY_DURING_VISIT') return `${who} seems to have left the home during the ${startTime} visit ${minutes} min ago, and did not answer "Still with the client?"`;
  if (kind === 'NO_LOCATION_DURING_VISIT') return `No location from ${who}'s phone for ${minutes} min during the ${startTime} visit`;
  if (kind === 'SIMULATED_LOCATION') return `${who}'s phone said its position was simulated during the ${startTime} visit`;
  return `${who} turned off the location checks during the ${startTime} visit, ${minutes} min ago`;
}

export const PRESENCE_NEXT: Record<PresenceFlagKind, string> = {
  AWAY_DURING_VISIT: 'Staff to phone the caregiver, then the client if needed',
  NO_LOCATION_DURING_VISIT: 'Nothing unless something else looks wrong: the phone may be off or without signal',
  SIMULATED_LOCATION: "Staff to check with the client that the visit is happening, and talk to the caregiver",
  LOCATION_STOPPED: 'Staff to check with the caregiver; turning the checks off is allowed',
};

export const PRESENCE_SUBJECT: Record<PresenceFlagKind, string> = {
  AWAY_DURING_VISIT: 'Caregiver away during a visit',
  NO_LOCATION_DURING_VISIT: 'No location during a visit',
  SIMULATED_LOCATION: 'Simulated location during a visit',
  LOCATION_STOPPED: 'Location checks turned off during a visit',
};
