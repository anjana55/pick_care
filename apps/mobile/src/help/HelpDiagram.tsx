import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  helpDiagramText,
  helpUi,
  type HelpBlock,
  type HelpButtonVariant,
  type HelpLocale,
  type HelpSources,
  type HelpText,
  type HelpTopicDef,
} from '@care-platform/shared';
import { useColors, type Colors } from '@/theme';
import { Text } from '@/ui/Text';
import { tint } from '@/ui/visual';

interface Ctx {
  sources: HelpSources;
  locale: HelpLocale;
  def: HelpTopicDef;
  colors: Colors;
}

/** A numbered marker matching a step, in the accent colour. */
export function Callout({ n, size = 22, lang }: { n: number; size?: number; lang: HelpLocale }) {
  const colors = useColors();
  return (
    <View style={[styles.callout, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent }]}>
      <Text lang={lang} style={{ color: '#FFFFFF', fontSize: size * 0.55, fontWeight: '800', lineHeight: size * 0.75 }}>
        {n}
      </Text>
    </View>
  );
}

function Words({ text, ctx, style }: { text: HelpText; ctx: Ctx; style?: object }) {
  const words = helpDiagramText(ctx.sources, ctx.locale, ctx.def, text);
  if (words === null) {
    const width = 'placeholder' in text ? { short: 40, medium: 80, long: 140 }[text.placeholder] : 80;
    return <View style={{ width, height: 7, borderRadius: 4, backgroundColor: tint(ctx.colors.ink, 0.14) }} />;
  }
  return (
    <Text lang={ctx.locale} style={[{ fontSize: 12, lineHeight: 17, color: ctx.colors.ink }, style]}>
      {words}
    </Text>
  );
}

function Marked({ callout, children, ctx, style }: { callout?: number; children: ReactNode; ctx: Ctx; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ position: 'relative' }, style]}>
      {children}
      {callout ? (
        <View style={styles.marker}>
          <Callout n={callout} size={18} lang={ctx.locale} />
        </View>
      ) : null}
    </View>
  );
}

function buttonStyle(variant: HelpButtonVariant, colors: Colors) {
  switch (variant) {
    case 'primary':
      return { box: { backgroundColor: colors.deep }, text: { color: colors.brandText } };
    case 'danger':
      return { box: { backgroundColor: colors.danger }, text: { color: colors.brandText } };
    case 'link':
      return { box: { backgroundColor: 'transparent', paddingHorizontal: 0 }, text: { color: colors.brand, textDecorationLine: 'underline' as const } };
    default:
      return { box: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, text: { color: colors.ink } };
  }
}

function Pill({ text, variant, ctx, callout }: { text: HelpText; variant: HelpButtonVariant; ctx: Ctx; callout?: number }) {
  const s = buttonStyle(variant, ctx.colors);
  return (
    <Marked callout={callout} ctx={ctx} style={{ alignSelf: 'flex-start' }}>
      <View style={[styles.pill, s.box]}>
        <Words text={text} ctx={ctx} style={[{ fontWeight: '700' }, s.text]} />
      </View>
    </Marked>
  );
}

function Block({ block, ctx }: { block: HelpBlock; ctx: Ctx }) {
  const { colors } = ctx;
  switch (block.kind) {
    case 'title':
      return (
        <Marked callout={block.callout} ctx={ctx}>
          <Words text={block.text} ctx={ctx} style={{ fontSize: 14, fontWeight: '800' }} />
        </Marked>
      );
    case 'text':
      return (
        <Marked callout={block.callout} ctx={ctx} style={{ gap: 4 }}>
          {block.text ? <Words text={block.text} ctx={ctx} style={{ color: colors.muted }} /> : null}
          {Array.from({ length: block.lines ?? (block.text ? 0 : 2) }, (_, i) => (
            <View key={i} style={{ height: 6, width: i % 2 ? '66%' : '100%', borderRadius: 3, backgroundColor: tint(colors.ink, 0.1) }} />
          ))}
        </Marked>
      );
    case 'button':
      return <Pill text={block.text} variant={block.variant ?? 'primary'} ctx={ctx} callout={block.callout} />;
    case 'buttons':
      return (
        <Marked callout={block.callout} ctx={ctx} style={styles.wrap}>
          {block.items.map((b, i) => (
            <Pill key={i} text={b.text} variant={b.variant ?? 'secondary'} ctx={ctx} callout={b.callout} />
          ))}
        </Marked>
      );
    case 'field':
    case 'search':
      return (
        <Marked callout={block.callout} ctx={ctx} style={{ gap: 3 }}>
          {block.kind === 'field' ? <Words text={block.text} ctx={ctx} style={{ fontSize: 11, fontWeight: '700', color: colors.muted }} /> : null}
          <View style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {block.kind === 'search' ? (
              <Words text={block.text} ctx={ctx} style={{ color: colors.muted }} />
            ) : block.value ? (
              <Words text={block.value} ctx={ctx} />
            ) : (
              <View style={{ width: 70, height: 6, borderRadius: 3, backgroundColor: tint(colors.ink, 0.1) }} />
            )}
            {block.kind === 'field' && block.select ? <Text style={{ color: colors.muted, fontSize: 11 }}>▾</Text> : null}
          </View>
        </Marked>
      );
    case 'tabs':
      return (
        <Marked callout={block.callout} ctx={ctx} style={[styles.wrap, { borderRadius: 18, backgroundColor: tint(colors.ink, 0.06), padding: 3 }]}>
          {block.items.map((t, i) => {
            const on = i === (block.active ?? 0);
            return (
              <View key={i} style={[styles.tab, on && { backgroundColor: colors.surface }]}>
                <Words text={t} ctx={ctx} style={{ fontWeight: on ? '800' : '600', color: on ? colors.ink : colors.muted }} />
              </View>
            );
          })}
        </Marked>
      );
    case 'list':
      return (
        <Marked callout={block.callout} ctx={ctx} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 0 }]}>
          {Array.from({ length: block.rows }, (_, i) => (
            <View key={i} style={[styles.listRow, { borderBottomColor: colors.border }, i === block.rows - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: tint(colors.ink, 0.1) }} />
              {block.badge && i === 0 ? (
                <View style={[styles.badge, { backgroundColor: tint(colors.danger, 0.12) }]}>
                  <Words text={block.badge} ctx={ctx} style={{ fontSize: 10, color: colors.danger, fontWeight: '700' }} />
                </View>
              ) : (
                <View style={{ width: 34, height: 6, borderRadius: 3, backgroundColor: tint(colors.ink, 0.1) }} />
              )}
            </View>
          ))}
        </Marked>
      );
    case 'card':
      return (
        <Marked
          callout={block.callout}
          ctx={ctx}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: block.highlight ? colors.brand : tint(colors.ink, 0.08), gap: 8 }]}
        >
          {block.title ? <Words text={block.title} ctx={ctx} style={{ fontSize: 13, fontWeight: '800' }} /> : null}
          {block.children.map((b, i) => (
            <Block key={i} block={b} ctx={ctx} />
          ))}
        </Marked>
      );
    case 'row':
      return (
        <Marked callout={block.callout} ctx={ctx} style={[styles.wrap, { alignItems: 'flex-start' }]}>
          {block.children.map((b, i) => (
            <View key={i} style={{ flexGrow: 1, flexBasis: 100, minWidth: 0 }}>
              <Block block={b} ctx={ctx} />
            </View>
          ))}
        </Marked>
      );
    case 'checklist':
      return (
        <Marked callout={block.callout} ctx={ctx} style={{ gap: 5 }}>
          {block.items.map((item, i) => {
            const c = item.state === 'done' ? colors.brand : item.state === 'notDone' ? colors.danger : colors.border;
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.check, { borderColor: c, backgroundColor: item.state === 'open' ? colors.surface : c }]}>
                  <Text style={{ color: '#FFFFFF', fontSize: 9, lineHeight: 12 }}>{item.state === 'done' ? '✓' : item.state === 'notDone' ? '✕' : ''}</Text>
                </View>
                <Words text={item.text} ctx={ctx} />
              </View>
            );
          })}
        </Marked>
      );
    case 'stars':
      return (
        <Marked callout={block.callout} ctx={ctx} style={{ alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 18, letterSpacing: 2, color: colors.accent }}>
            {'★'.repeat(block.filled)}
            <Text style={{ color: tint(colors.ink, 0.18) }}>{'★'.repeat(5 - block.filled)}</Text>
          </Text>
        </Marked>
      );
    case 'badge':
      return (
        <Marked callout={block.callout} ctx={ctx} style={{ alignSelf: 'flex-start' }}>
          <View
            style={[
              styles.badge,
              {
                backgroundColor:
                  block.tone === 'accent' ? tint(colors.accent, 0.14) : block.tone === 'muted' ? tint(colors.ink, 0.06) : tint(colors.brand, 0.12),
              },
            ]}
          >
            <Words
              text={block.text}
              ctx={ctx}
              style={{ fontSize: 11, fontWeight: '700', color: block.tone === 'accent' ? colors.accent : block.tone === 'muted' ? colors.muted : colors.brand }}
            />
          </View>
        </Marked>
      );
    case 'map':
      return (
        <Marked callout={block.callout} ctx={ctx}>
          <View style={[styles.map, { backgroundColor: tint(colors.brand, 0.12), borderColor: colors.border }]}>
            <View style={[styles.dot, { left: '30%', top: '30%', backgroundColor: colors.accent }]} />
            <View style={[styles.dot, { left: '65%', top: '55%', backgroundColor: colors.brand }]} />
          </View>
        </Marked>
      );
  }
}

/**
 * The topic's screen, drawn from topics.ts in the brand's colours and the
 * help's language, with numbered markers matching the steps. Read by screen
 * readers as one short description: the steps say everything it shows.
 */
export function HelpDiagram({ def, sources, locale, label }: { def: HelpTopicDef; sources: HelpSources; locale: HelpLocale; label: string }) {
  const colors = useColors();
  const d = def.diagram;
  if (!d) return null;
  const ctx: Ctx = { sources, locale, def, colors };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.phone, { borderColor: tint(colors.ink, 0.15), backgroundColor: colors.background }]}
    >
      <View style={[styles.band, { backgroundColor: colors.brand }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={[styles.navDot, { backgroundColor: colors.surface }]} />
          <View style={[styles.navDot, { backgroundColor: colors.surface }]} />
        </View>
        {d.heading ? <Words text={d.heading} ctx={ctx} style={{ color: colors.brandText, fontSize: 15, fontWeight: '800', lineHeight: 20 }} /> : null}
      </View>
      <View style={{ padding: 12, gap: 10 }}>
        {d.blocks.map((b, i) => (
          <Block key={i} block={b} ctx={ctx} />
        ))}
      </View>
      {d.tabs?.length ? (
        <View style={[styles.tabBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          {d.tabs.map((key, i) => (
            <Text
              key={key}
              lang={locale}
              numberOfLines={1}
              style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: i === d.tab ? '800' : '500', color: i === d.tab ? colors.brand : colors.muted }}
            >
              {helpUi(sources, locale, key)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  phone: { borderWidth: 2, borderRadius: 22, overflow: 'hidden' },
  band: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 8, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  navDot: { width: 44, height: 14, borderRadius: 7, opacity: 0.9 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 8, paddingHorizontal: 4, gap: 4 },
  callout: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  marker: { position: 'absolute', right: -6, top: -8 },
  pill: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  input: { minHeight: 30, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { borderWidth: 1, borderRadius: 12, padding: 10 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  check: { width: 15, height: 15, borderRadius: 3, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  map: { height: 70, borderRadius: 10, borderWidth: 1 },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#FFFFFF' },
});
