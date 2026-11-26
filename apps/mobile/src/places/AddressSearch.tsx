import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ADDRESS_SEARCH_MIN_LENGTH, type AddressMatch, type AddressSearchResult } from '@care-platform/shared';
import { api } from '@/api';
import { useTranslation } from '@/i18n';
import { useColors } from '@/theme';
import { Field } from '@/ui/controls';
import { Text } from '@/ui/Text';

/**
 * "Find the address" above the pin map: type the house number and street, a
 * landmark or the town; tap a match and the map moves there. Then the person
 * moves the map until the pin sits on the house, as before. Big rows, one tap.
 */
export function AddressSearch({ onPick }: { onPick: (m: AddressMatch) => void }) {
  const { t, locale } = useTranslation();
  const colors = useColors();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<AddressMatch[] | null>(null);
  const [partial, setPartial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<AddressMatch | null>(null);
  const seq = useRef(0);

  // Search when typing pauses; only the latest answer counts.
  useEffect(() => {
    const q = term.trim();
    if (q.length < ADDRESS_SEARCH_MIN_LENGTH || (picked && q === picked.label)) {
      setResults(null);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      setFailed(false);
      try {
        const r = await api.get<AddressSearchResult>('/geo/address-search', { q, locale });
        if (mine !== seq.current) return;
        setResults(r.results);
        setPartial(r.mapSearchUnavailable);
      } catch {
        if (mine === seq.current) setFailed(true);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [term, picked, locale]);

  const choose = (m: AddressMatch) => {
    setPicked(m);
    setTerm(m.label);
    setResults(null);
    onPick(m);
  };

  const status = busy ? t('addressSearch.searching') : failed ? t('addressSearch.error') : picked ? t(`addressSearch.next.${picked.precision}`) : null;
  return (
    <View style={{ gap: 6 }}>
      <Field
        label={t('addressSearch.label')}
        value={term}
        placeholder={t('addressSearch.placeholder')}
        onChangeText={(v) => (setTerm(v), setPicked(null))}
        autoCorrect={false}
        returnKeyType="search"
      />
      {status ? (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, lineHeight: 21, color: failed ? colors.danger : colors.muted }}>
          {status}
        </Text>
      ) : null}
      {results ? (
        <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {results.length === 0 ? <Text style={[styles.row, { color: colors.muted, fontSize: 15 }]}>{t('addressSearch.noMatches')}</Text> : null}
          {results.map((m, i) => (
            <Pressable
              key={`${m.source}-${m.latitude}-${m.longitude}-${m.label}`}
              accessibilityRole="button"
              accessibilityLabel={`${m.label}${m.detail ? `, ${m.detail}` : ''}. ${t(`addressSearch.precision.${m.precision}`)}`}
              onPress={() => choose(m)}
              style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: colors.ink }}>{m.label}</Text>
                {m.detail ? <Text style={{ fontSize: 14, color: colors.muted }}>{m.detail}</Text> : null}
              </View>
              <Text style={{ fontSize: 13, color: colors.muted }}>{t(`addressSearch.precision.${m.precision}`)}</Text>
            </Pressable>
          ))}
          {partial ? <Text style={[styles.row, { fontSize: 13, color: colors.muted }]}>{t('addressSearch.mapSearchUnavailable')}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10 },
});
