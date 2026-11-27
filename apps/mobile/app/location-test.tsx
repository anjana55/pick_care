import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/theme';
import { Button, FormError } from '@/ui/controls';
import { PageHeader } from '@/ui/PageHeader';
import { Text } from '@/ui/Text';
import { locationTestAvailable } from '@/location/test-mode';
import { summarise, toCsv, type TestSummary, type TrackKind, type TrackSession } from '@/location/session';
import { clearPoints, currentSession, isTracking, readPoints, startTracking, stopTracking, type StartResult } from '@/location/tracker';

/**
 * Location test mode (GPS tracking, B0) - internal builds only, English only.
 *
 * Runs the same tracking code "On my way" and the checks during a visit will
 * use, but keeps the points on the phone with the battery level at each one,
 * so a tester can answer: does it keep running with the screen off and the
 * app in the background, with only "while using the app" permission, and what
 * does it cost the battery? Results are shared as text and CSV.
 */

const LAST_KEY = 'location.test.last';
const TESTS: { label: string; kind: TrackKind; everyMinutes?: number; hours: number; hint: string }[] = [
  {
    label: 'Trip: every 30 s, up to 1 hour',
    kind: 'TRIP',
    hours: 1,
    hint: 'Start before leaving, lock the phone, travel about 45 minutes (bus, tuk-tuk or car), stop on arrival.',
  },
  {
    label: 'Visit: every 30 min, up to 9 hours',
    kind: 'SHIFT',
    everyMinutes: 30,
    hours: 9,
    hint: 'Start at the beginning of a working day, use the phone normally, stop after 8 hours.',
  },
  { label: 'Visit: every 5 min, up to 2 hours', kind: 'SHIFT', everyMinutes: 5, hours: 2, hint: 'A quick check that points keep coming with the screen off.' },
];

const START_MESSAGES: Record<Exclude<StartResult, 'started'>, string> = {
  denied: 'Location permission was refused. Allow it ("While using the app") in the phone\'s settings and try again.',
  unavailable:
    'This build cannot track in the background. It needs a new development or preview build with expo-task-manager and the background location setting.',
};

export default function LocationTestScreen() {
  const colors = useColors();
  const [session, setSession] = useState<TrackSession | null>(null);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const [choice, setChoice] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const live = await currentSession();
    const last = live ?? (JSON.parse((await AsyncStorage.getItem(LAST_KEY)) ?? 'null') as TrackSession | null);
    setSession(last);
    setRunning(Boolean(live) && (await isTracking()));
    setSummary(last ? summarise(last, await readPoints(last.id), Date.now()) : null);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (!locationTestAvailable()) return <Redirect href="/" />;

  const start = async () => {
    setBusy(true);
    setError(null);
    const test = TESTS[choice];
    const now = Date.now();
    const next: TrackSession = {
      id: `test-${now.toString(36)}`,
      kind: test.kind,
      everyMinutes: test.everyMinutes,
      startedAt: now,
      endsBy: now + test.hours * 3_600_000,
      sink: 'TEST',
      notification: { title: 'Location test running', body: 'Pick Care is recording a location test. Open the app to stop it.' },
    };
    if (session) await clearPoints(session.id);
    const result = await startTracking(next);
    if (result === 'started') await AsyncStorage.setItem(LAST_KEY, JSON.stringify(next));
    else setError(START_MESSAGES[result]);
    setBusy(false);
    await refresh();
  };

  const stop = async () => {
    await stopTracking();
    if (session) await AsyncStorage.setItem(LAST_KEY, JSON.stringify({ ...session, endsBy: Math.min(session.endsBy, Date.now()) }));
    await refresh();
  };

  const share = async () => {
    if (!session || !summary) return;
    const points = await readPoints(session.id);
    const head = [
      `Pick Care location test - ${Platform.OS} ${String(Platform.Version)}`,
      `Test: ${session.kind === 'TRIP' ? 'trip, every 30 s' : `visit, every ${session.everyMinutes} min`}`,
      `Started: ${new Date(session.startedAt).toLocaleString()}`,
      ...lines(summary),
    ].join('\n');
    await Share.share({ message: `${head}\n\n${toCsv(points)}` });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Location test" subtitle="Internal builds only. Checks that tracking keeps running in the background, and what it costs the battery." />
      <ScrollView contentContainerStyle={styles.page}>
        {!running ? (
          <View style={{ gap: 8 }}>
            {TESTS.map((test, i) => (
              <Pressable
                key={test.label}
                accessibilityRole="radio"
                accessibilityState={{ selected: choice === i }}
                onPress={() => setChoice(i)}
                style={[styles.option, { borderColor: choice === i ? colors.brand : colors.border, backgroundColor: colors.surface }]}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{test.label}</Text>
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{test.hint}</Text>
              </Pressable>
            ))}
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>
              Before starting: charge above 80%, close other navigation apps, and allow location "While using the app" only - not "Allow all the time". Don't
              swipe the app away during the test (that is a separate check).
            </Text>
            <FormError message={error} />
            <Button label="Start test" busy={busy} onPress={() => void start()} />
          </View>
        ) : (
          <Button label="Stop test" variant="secondary" onPress={() => void stop()} />
        )}

        {session && summary ? (
          <View style={[styles.option, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{running ? 'Running' : 'Last test'}</Text>
            {lines(summary).map((line) => (
              <Text key={line} style={{ fontSize: 15, color: colors.ink }}>
                {line}
              </Text>
            ))}
            <Button label="Share results" variant="secondary" onPress={() => void share()} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function lines(s: TestSummary): string[] {
  return [
    `Ran for: ${s.minutes} min`,
    `Points: ${s.points}`,
    `Gaps (over twice the wanted time): ${s.gaps}; longest ${s.longestGapMinutes} min`,
    `Battery: ${s.batteryStart ?? '?'}% → ${s.batteryNow ?? '?'}%${s.batteryPerHour !== null ? ` (${s.batteryPerHour}% an hour)` : ''}`,
    `Typical accuracy: ${s.medianAccuracyM !== null ? `${s.medianAccuracyM} m` : '-'}`,
    `Simulated positions: ${s.mocked}`,
  ];
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  option: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
});
