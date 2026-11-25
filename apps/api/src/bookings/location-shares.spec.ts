import { etaFrom } from '@care-platform/shared';
import { firstName } from './location-shares.service';

// 10:00 and 08:00 in Colombo (UTC+5:30).
const midMorning = new Date('2026-11-25T04:30:00.000Z');
const rushHour = new Date('2026-11-25T02:30:00.000Z');

describe('the ETA a client sees', () => {
  it('says nothing without a distance, and "arriving" inside the home\'s circle', () => {
    expect(etaFrom(null, midMorning, 300)).toEqual({ minutes: null, arriving: false, distanceM: null });
    expect(etaFrom(250, midMorning, 300)).toEqual({ minutes: 0, arriving: true, distanceM: 250 });
  });

  it('allows for roads and the time of day, rounding to whole minutes, then to 5 above 15', () => {
    // 3 km x 1.4 = 4.2 km at 25 km/h: about 10 min; at 15 km/h in the morning rush: about 17, so 15.
    expect(etaFrom(3000, midMorning, 300).minutes).toBe(10);
    expect(etaFrom(3000, rushHour, 300).minutes).toBe(15);
    expect(etaFrom(400, midMorning, 300).minutes).toBe(1);
    expect(etaFrom(20_000, midMorning, 300).minutes).toBe(65);
  });
});

describe('how the client knows their caregiver', () => {
  it('uses the first name only', () => {
    expect(firstName('  Nimal  Perera ')).toBe('Nimal');
    expect(firstName(null)).toBe('Your caregiver');
  });
});
