import { fireEvent, screen } from '@testing-library/react-native';
import en from '../src/i18n/en.json';
import { longDay } from '@/ui/Calendar';

/**
 * Opens the date field labelled `field` and chooses `day` (YYYY-MM-DD) on its
 * calendar the way a person would: tap the month's name, the year, the month,
 * then the day, then "Choose this date".
 */
export async function pickDate(field: string, day: string) {
  await fireEvent.press(screen.getByRole('button', { name: field }));
  await fireEvent.press(screen.getByRole('button', { name: new RegExp(`, ${en.calendar.chooseYear}$`) }));
  await fireEvent.press(screen.getByRole('button', { name: day.slice(0, 4) }));
  const monthName = new Date(`${day.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  await fireEvent.press(screen.getByRole('button', { name: `${monthName} ${day.slice(0, 4)}` }));
  await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${longDay(day, 'en')}`) }));
  await fireEvent.press(screen.getByRole('button', { name: en.calendar.confirm }));
}
