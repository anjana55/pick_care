import { presenceSlots } from '@care-platform/shared';
import { presenceSteps, type PresenceVisit } from './presence-rules';

const T0 = Date.parse('2026-11-26T03:00:00.000Z');
const MIN = 60_000;
const at = (m: number) => new Date(T0 + m * MIN);
const settings = { presenceAwayPoints: 2, presenceSilentMultiplier: 2 };
const visit = (over: Partial<PresenceVisit> = {}): PresenceVisit => ({
  everyMinutes: 30,
  startedAt: at(0),
  endedAt: null,
  endReason: null,
  checkedOutAt: null,
  lastAt: at(60),
  points: [
    { at: at(0), inside: true, mocked: false },
    { at: at(30), inside: true, mocked: false },
    { at: at(60), inside: true, mocked: false },
  ],
  askedAt: null,
  reply: null,
  repliedAt: null,
  ...over,
});
const away = (minutes: number[]) => minutes.map((m) => ({ at: at(m), inside: false, mocked: false }));

describe('location checks during a visit', () => {
  it('says nothing while the checks keep coming from the home', () => {
    expect(presenceSteps(visit(), settings, at(70))).toEqual([]);
  });

  it('asks "Still with …?" after the admin\'s number of checks away, not after one', () => {
    const one = visit({ points: [...visit().points, ...away([90])], lastAt: at(90) });
    expect(presenceSteps(one, settings, at(95))).toEqual([]);
    const two = visit({ points: [...visit().points, ...away([90, 120])], lastAt: at(120) });
    expect(presenceSteps(two, settings, at(121))).toEqual([{ step: 'ask', awayChecks: 2, since: at(90).toISOString() }]);
    // With "away after 1", the same two checks away are one spell, from the first.
    expect(presenceSteps(two, { ...settings, presenceAwayPoints: 1 }, at(121))).toEqual([{ step: 'ask', awayChecks: 2, since: at(90).toISOString() }]);
  });

  it('tells staff only when the question went unanswered and the next check is still away', () => {
    const asked = { points: [...visit().points, ...away([90, 120])], lastAt: at(120), askedAt: at(122) };
    // Asked, no newer check yet: wait.
    expect(presenceSteps(visit(asked), settings, at(140))).toEqual([]);
    // The next check is away too, and no answer: staff.
    const later = visit({ ...asked, points: [...asked.points, ...away([150])], lastAt: at(150) });
    expect(presenceSteps(later, settings, at(151))).toEqual([{ step: 'flag', kind: 'AWAY_DURING_VISIT', minutes: 61 }]);
    // Answered ("gone out for the client"): nobody is told.
    expect(presenceSteps(visit({ ...asked, points: later.points, lastAt: at(150), reply: 'OUT_FOR_CLIENT', repliedAt: at(125) }), settings, at(151))).toEqual(
      [],
    );
    // Back at the home: nothing.
    expect(
      presenceSteps(visit({ ...asked, points: [...asked.points, { at: at(150), inside: true, mocked: false }], lastAt: at(150) }), settings, at(151)),
    ).toEqual([]);
  });

  it('asks again about a new spell away after coming back', () => {
    const points = [...visit().points, ...away([90, 120]), { at: at(150), inside: true, mocked: false }, ...away([180, 210])];
    expect(presenceSteps(visit({ points, lastAt: at(210), askedAt: at(122) }), settings, at(211))).toEqual([
      { step: 'ask', awayChecks: 2, since: at(180).toISOString() },
    ]);
  });

  it('cannot tell away from home without a place on the map', () => {
    const points = [
      { at: at(90), inside: null, mocked: false },
      { at: at(120), inside: null, mocked: false },
    ];
    expect(presenceSteps(visit({ points, lastAt: at(120) }), settings, at(121))).toEqual([]);
  });

  it('points out a phone gone quiet for twice the interval', () => {
    expect(presenceSteps(visit(), settings, at(119))).toEqual([]);
    expect(presenceSteps(visit(), settings, at(121))).toEqual([{ step: 'flag', kind: 'NO_LOCATION_DURING_VISIT', minutes: 61 }]);
    // With no check at all since check-in.
    expect(presenceSteps(visit({ points: [], lastAt: null }), settings, at(61))).toEqual([{ step: 'flag', kind: 'NO_LOCATION_DURING_VISIT', minutes: 61 }]);
  });

  it('points out a simulated position, and checks turned off while still checked in', () => {
    const mocked = visit({ points: [...visit().points, { at: at(90), inside: true, mocked: true }], lastAt: at(90) });
    expect(presenceSteps(mocked, settings, at(91))).toEqual([{ step: 'flag', kind: 'SIMULATED_LOCATION', minutes: 0 }]);
    expect(presenceSteps(visit({ endedAt: at(65), endReason: 'STOPPED' }), settings, at(80))).toEqual([
      { step: 'flag', kind: 'LOCATION_STOPPED', minutes: 15 },
    ]);
    // Ended by check-out or the shift: nothing.
    expect(presenceSteps(visit({ endedAt: at(65), endReason: 'CHECKED_OUT', checkedOutAt: at(65) }), settings, at(200))).toEqual([]);
    expect(presenceSteps(visit({ endedAt: at(65), endReason: 'STOPPED', checkedOutAt: at(66) }), settings, at(200))).toEqual([]);
  });
});

describe('the dot strip', () => {
  const every = 30 * MIN;
  it('gives one dot per finished interval: home, away, nothing, or unknown without a place', () => {
    const points = [
      { at: T0 + 1 * MIN, inside: true },
      { at: T0 + 31 * MIN, inside: false },
      { at: T0 + 91 * MIN, inside: null },
    ];
    expect(presenceSlots(T0, T0 + 120 * MIN, every, points)).toEqual(['IN', 'AWAY', 'NONE', 'UNKNOWN']);
    // The interval under way counts only once it is over.
    expect(presenceSlots(T0, T0 + 45 * MIN, every, points)).toEqual(['IN']);
  });
});
