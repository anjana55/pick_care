import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { helpPhrase, helpSegments, helpTopicText, searchHelpTopics, type HelpLocale, type HelpSources, type HelpTopicDef } from '@care-platform/shared';
import { useTranslation } from '@/i18n';
import { useColors } from '@/theme';
import { PageHeader } from '@/ui/PageHeader';
import { Text } from '@/ui/Text';
import { fontFamilyFor } from '@/ui/fonts';
import { LANGUAGE_NAMES } from '@/ui/LanguagePicker';
import { Card, tint } from '@/ui/visual';
import { Callout, HelpDiagram } from '@/help/HelpDiagram';
import { useHelpSources, useHelpTopics } from '@/help/useHelp';

/**
 * The help language the reader chose inside the help, kept while the app
 * runs so the next ? opens in it too. Null: follow the app's language.
 * Choosing here never changes the app's own language.
 */
let chosenHelpLocale: HelpLocale | null = null;

function RichText({ text, sources, locale, size = 17 }: { text: string; sources: HelpSources; locale: HelpLocale; size?: number }) {
  const colors = useColors();
  return (
    <Text lang={locale} style={{ fontSize: size, lineHeight: size * 1.45, color: colors.ink }}>
      {helpSegments(sources, locale, text).map((s, i) =>
        s.kind === 'ui' ? (
          <Text key={i} lang={locale} style={{ fontWeight: '800', color: colors.deep, backgroundColor: tint(colors.brand, 0.1) }}>
            {s.text}
          </Text>
        ) : (
          s.text
        ),
      )}
    </Text>
  );
}

function TopicRow({ def, onOpen, sources, locale }: { def: HelpTopicDef; onOpen: (id: string) => void; sources: HelpSources; locale: HelpLocale }) {
  const colors = useColors();
  const text = helpTopicText(sources, locale, def);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text.title}
      accessibilityHint={text.summary}
      onPress={() => onOpen(def.id)}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text lang={locale} style={{ fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.ink }}>
          {text.title}
        </Text>
        <Text lang={locale} style={{ fontSize: 15, lineHeight: 21, color: colors.muted }}>
          {text.summary}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.muted} />
    </Pressable>
  );
}

/**
 * The help: opened by the ? in a screen's header (on that screen's topics) or
 * on one topic. Big text and big targets like the rest of the app, its own
 * language choice, a search, a picture of the screen with numbered steps.
 */
export default function HelpScreen() {
  const params = useLocalSearchParams<{ topic?: string; from?: string }>();
  const router = useRouter();
  const colors = useColors();
  const { locale: appLocale, availableLocales } = useTranslation();
  const sources = useHelpSources();
  const { all, forPath } = useHelpTopics(params.from);
  const [locale, setLocaleState] = useState<HelpLocale>(chosenHelpLocale ?? appLocale);
  const [stack, setStack] = useState<(string | null)[]>([
    params.topic && all.some((t) => t.id === params.topic) ? params.topic : forPath.length === 1 ? forPath[0].id : null,
  ]);
  const [query, setQuery] = useState('');
  const scroll = useRef<ScrollViewInstance>(null);
  const p = (k: string) => helpPhrase(sources, locale, `ui.${k}`);

  const topicId = stack[stack.length - 1];
  const topic = topicId ? all.find((t) => t.id === topicId) : undefined;
  const results = useMemo(() => (query.trim() ? searchHelpTopics(sources, locale, all, query) : []), [sources, locale, all, query]);

  const setLocale = (l: HelpLocale) => {
    chosenHelpLocale = l;
    setLocaleState(l);
  };
  const open = (id: string | null) => {
    setQuery('');
    setStack((s) => [...s, id]);
    scroll.current?.scrollTo?.({ y: 0, animated: false });
  };
  const back = () => {
    if (query) return setQuery('');
    if (stack.length > 1) return setStack((s) => s.slice(0, -1));
    if (router.canGoBack?.()) router.back();
    else router.replace('/');
  };

  const areas = [...new Set(all.map((t) => t.area))];
  const offered = availableLocales.length ? availableLocales : (['en', 'si', 'ta'] as HelpLocale[]);

  const body = () => {
    if (query.trim()) {
      return results.length ? (
        <View style={{ gap: 10 }}>
          {results.map((d) => (
            <TopicRow key={d.id} def={d} onOpen={open} sources={sources} locale={locale} />
          ))}
        </View>
      ) : (
        <Text lang={locale} style={{ fontSize: 17, lineHeight: 24, color: colors.muted }}>
          {p('noResults')}
        </Text>
      );
    }
    if (topic) {
      const text = helpTopicText(sources, locale, topic);
      const callouts = JSON.stringify(topic.diagram ?? {});
      const related = (topic.related ?? []).map((id) => all.find((t) => t.id === id)).filter((d): d is HelpTopicDef => Boolean(d));
      return (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 6 }}>
            <Text lang={locale} accessibilityRole="header" style={{ fontSize: 24, lineHeight: 31, fontWeight: '800', color: colors.ink }}>
              {text.title}
            </Text>
            <Text lang={locale} style={{ fontSize: 17, lineHeight: 24, color: colors.muted }}>
              {text.summary}
            </Text>
          </View>
          <HelpDiagram def={topic} sources={sources} locale={locale} label={p('picture')} />
          <View style={{ gap: 12 }}>
            <Text lang={locale} accessibilityRole="header" style={styles.section}>
              {p('steps')}
            </Text>
            {text.steps.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                {callouts.includes(`"callout":${i + 1}`) ? (
                  <Callout n={i + 1} size={30} lang={locale} />
                ) : (
                  <View style={[styles.number, { backgroundColor: tint(colors.ink, 0.08) }]}>
                    <Text lang={locale} style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>
                      {i + 1}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <RichText text={s} sources={sources} locale={locale} />
                </View>
              </View>
            ))}
          </View>
          {text.tips.length ? (
            <Card style={{ gap: 8, backgroundColor: tint(colors.accent, 0.08) }}>
              <Text lang={locale} accessibilityRole="header" style={styles.section}>
                {p('tips')}
              </Text>
              {text.tips.map((tip, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={{ fontSize: 17, color: colors.accent }}>•</Text>
                  <View style={{ flex: 1 }}>
                    <RichText text={tip} sources={sources} locale={locale} size={16} />
                  </View>
                </View>
              ))}
            </Card>
          ) : null}
          {related.length ? (
            <View style={{ gap: 10 }}>
              <Text lang={locale} accessibilityRole="header" style={styles.section}>
                {p('related')}
              </Text>
              {related.map((d) => (
                <TopicRow key={d.id} def={d} onOpen={open} sources={sources} locale={locale} />
              ))}
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => open(null)}
            style={[styles.allButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Ionicons name="list" size={22} color={colors.deep} />
            <Text lang={locale} style={{ fontSize: 18, fontWeight: '700', color: colors.deep }}>
              {p('allTopics')}
            </Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={{ gap: 22 }}>
        {forPath.length ? (
          <View style={{ gap: 10 }}>
            <Text lang={locale} accessibilityRole="header" style={styles.section}>
              {p('thisScreen')}
            </Text>
            {forPath.map((d) => (
              <TopicRow key={d.id} def={d} onOpen={open} sources={sources} locale={locale} />
            ))}
          </View>
        ) : null}
        {areas.map((area) => (
          <View key={area} style={{ gap: 10 }}>
            <Text lang={locale} accessibilityRole="header" style={[styles.section, { color: colors.muted }]}>
              {helpPhrase(sources, locale, `areas.${area}`)}
            </Text>
            {all
              .filter((t) => t.area === area)
              .map((d) => (
                <TopicRow key={d.id} def={d} onOpen={open} sources={sources} locale={locale} />
              ))}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title={p('title')} onBack={back} help={false}>
        {offered.length > 1 ? (
          <View accessibilityRole="radiogroup" accessibilityLabel={p('language')} style={styles.languages}>
            {offered.map((code) => {
              const selected = code === locale;
              return (
                <Pressable
                  key={code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setLocale(code)}
                  style={[styles.chip, { borderColor: colors.surface, backgroundColor: selected ? colors.surface : 'rgba(0, 0, 0, 0.14)' }]}
                >
                  <Text lang={code} style={{ fontSize: 16, fontWeight: selected ? '800' : '600', color: selected ? colors.deep : colors.brandText }}>
                    {LANGUAGE_NAMES[code]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </PageHeader>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="search" size={20} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={p('search')}
              accessibilityLabel={p('search')}
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              style={{ flex: 1, fontSize: 18, minHeight: 48, color: colors.ink, fontFamily: fontFamilyFor(locale, false) }}
            />
          </View>
          {body()}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  languages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, borderRadius: 22, borderWidth: 2, paddingHorizontal: 16, justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 16, minHeight: 64 },
  section: { fontSize: 19, lineHeight: 25, fontWeight: '800' },
  number: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  allButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, borderWidth: 1, borderRadius: 16 },
});
