import { LOCATION_POINTS_BATCH_MAX, type LocationPointInput, type PointsAccepted } from '@care-platform/shared';
import { config } from '@/config';
import type { TrackPoint, TrackSession } from './session';

/**
 * Sends a SERVER session's points to the API (POST /location-shares/:id/points),
 * oldest first, in batches. Points stay on the phone until the API has them,
 * so a trip with no signal loses nothing. The upload token, not the sign-in,
 * goes with them: it works with the phone locked and the session expired.
 *
 * The API answers whether the share is still open; once it is not (checked
 * in, the shift ended, stopped from another phone) the phone stops tracking.
 */

export interface OutboxDeps {
  read: (sessionId: string) => Promise<TrackPoint[]>;
  forget: (sessionId: string, upTo: number) => Promise<void>;
  stop: () => Promise<void>;
  fetch?: typeof fetch;
}

export type FlushResult = 'sent' | 'nothing' | 'offline' | 'closed';

export async function flushOutbox(session: TrackSession | null, deps: OutboxDeps): Promise<FlushResult> {
  if (!session || session.sink !== 'SERVER' || !session.uploadToken) return 'nothing';
  const doFetch = deps.fetch ?? fetch;
  const points = (await deps.read(session.id)).sort((a, b) => a.at - b.at);
  if (!points.length) return 'nothing';
  for (let i = 0; i < points.length; i += LOCATION_POINTS_BATCH_MAX) {
    const batch = points.slice(i, i + LOCATION_POINTS_BATCH_MAX);
    const body: { points: LocationPointInput[] } = {
      points: batch.map((p) => ({ at: new Date(p.at).toISOString(), latitude: p.latitude, longitude: p.longitude, accuracyM: p.accuracyM, speed: p.speed, mocked: p.mocked })),
    };
    let res: Response;
    try {
      res = await doFetch(`${config.apiUrl}/location-shares/${encodeURIComponent(session.id)}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Share-Token': session.uploadToken },
        body: JSON.stringify(body),
      });
    } catch {
      return 'offline';
    }
    // The share is gone or the token no longer counts: nothing more will be taken.
    if (res.status === 401 || res.status === 404) {
      await deps.forget(session.id, Number.MAX_SAFE_INTEGER);
      await deps.stop();
      return 'closed';
    }
    if (!res.ok) return 'offline';
    await deps.forget(session.id, batch[batch.length - 1].at);
    const answer = (await res.json().catch(() => null)) as PointsAccepted | null;
    if (answer && answer.open === false) {
      await deps.forget(session.id, Number.MAX_SAFE_INTEGER);
      await deps.stop();
      return 'closed';
    }
  }
  return 'sent';
}
