import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import en from '../src/i18n/en.json';
import { AppProviders, serveApi } from '../test-utils/app';
import { Calendar, DateField, longDay } from '@/ui/Calendar';
import { Button } from '@/ui/controls';
import { Text, scaleTextStyle } from '@/ui/Text';
import { useTranslation } from '@/i18n';

jest.mock('expo-router', () => require('../test-utils/router').expoRouterMock());

// The language a test switches to is saved on the "phone": start each test in English.
afterEach(async () => {
  await AsyncStorage.clear();
});

const sizeOf = (node: { props: { style: unknown } }) => StyleSheet.flatten(node.props.style as never).fontSize as number;

describe('text size per language', () => {
  it('scales a size and its line height, and leaves 100% alone', () => {
    expect(scaleTextStyle({ fontSize: 20, lineHeight: 30 }, 0.9)).toEqual({ fontSize: 18, lineHeight: 27 });
    expect(scaleTextStyle({}, 0.9)).toEqual({ fontSize: 12.6 });
    expect(scaleTextStyle({ fontSize: 20 }, 1)).toBeNull();
  });

  function Switcher() {
    const { setLocale } = useTranslation();
    return (
      <>
        <Text testID="sample" style={{ fontSize: 20 }}>
          Sample
        </Text>
        <Button label="si" onPress={() => void setLocale('si')} />
      </>
    );
  }

  it('follows the size set for the language in Settings > Branding', async () => {
    serveApi({ 'GET /branding': () => ({ status: 200, body: { companyName: 'CareLink', textScale: { en: 100, si: 85, ta: 90 } } }) });
    await render(
      <AppProviders>
        <Switcher />
      </AppProviders>,
    );
    expect(sizeOf(await screen.findByTestId('sample'))).toBe(20);
    await fireEvent.press(screen.getByRole('button', { name: 'si' }));
    await screen.findByTestId('sample');
    // Branding arrives, the language changes: 85% of 20.
    await new Promise((r) => setTimeout(r, 0));
    expect(sizeOf(screen.getByTestId('sample'))).toBe(17);
  });

  it('lets a long label wrap beside its icon instead of pushing the icon out', async () => {
    await render(
      <AppProviders>
        <Button icon="log-in-outline" label="සාත්තු සේවකයෙකු ලෙස ඇතුල් වන්න" onPress={() => undefined} />
      </AppProviders>,
    );
    const label = await screen.findByText('සාත්තු සේවකයෙකු ලෙස ඇතුල් වන්න');
    expect(StyleSheet.flatten(label.props.style).flexShrink).toBe(1);
  });
});

describe('choosing a year without pressing an arrow per year', () => {
  it('goes from the month name to a year, then a month, in two taps', async () => {
    const chosen: string[] = [];
    await render(
      <AppProviders>
        <Calendar value={null} onChange={(d) => chosen.push(d)} today="2026-11-22" min="1940-01-01" max="2008-11-22" />
      </AppProviders>,
    );
    // Opens on the latest allowed month.
    expect(await screen.findByText('November 2008')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: `November 2008, ${en.calendar.chooseYear}` }));
    expect(screen.getByText(en.calendar.chooseYear)).toBeTruthy();
    // Years outside the range are not offered.
    expect(screen.queryByRole('button', { name: '2009' })).toBeNull();
    expect(screen.getByRole('button', { name: '1940' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: '1962' }));
    expect(screen.getByText(en.calendar.chooseMonth)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'April 1962' }));
    expect(screen.getByText('April 1962')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${longDay('1962-04-12', 'en')}`) }));
    expect(chosen).toEqual(['1962-04-12']);
  });

  it('does not offer months past the end of the range', async () => {
    await render(
      <AppProviders>
        <Calendar value={null} onChange={() => undefined} today="2026-11-22" min="1940-01-01" max="2008-11-22" />
      </AppProviders>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: `November 2008, ${en.calendar.chooseYear}` }));
    await fireEvent.press(screen.getByRole('button', { name: '2008' }));
    expect(screen.getByRole('button', { name: 'December 2008' })).toHaveProp('accessibilityState', { selected: false, disabled: true });
    expect(screen.getByRole('button', { name: 'November 2008' })).toHaveProp('accessibilityState', { selected: true, disabled: false });
  });

  it('works inside a date field too', async () => {
    function Field() {
      const [day, setDay] = useState<string | null>(null);
      return <DateField label="Date of birth" value={day} onChange={setDay} today="2026-11-22" min="1940-01-01" max="2008-11-22" />;
    }
    await render(
      <AppProviders>
        <Field />
      </AppProviders>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Date of birth' }));
    await fireEvent.press(screen.getByRole('button', { name: `November 2008, ${en.calendar.chooseYear}` }));
    await fireEvent.press(screen.getByRole('button', { name: '1975' }));
    await fireEvent.press(screen.getByRole('button', { name: 'June 1975' }));
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${longDay('1975-06-01', 'en')}`) }));
    await fireEvent.press(screen.getByRole('button', { name: en.calendar.confirm }));
    expect(screen.getByRole('button', { name: 'Date of birth' })).toHaveProp('accessibilityValue', { text: longDay('1975-06-01', 'en') });
  });
});
