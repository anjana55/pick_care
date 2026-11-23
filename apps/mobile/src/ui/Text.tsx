import { StyleSheet, Text as RNText, type TextProps } from 'react-native';
import { useTranslation } from '@/i18n';
import { useTextScale } from '@/branding/BrandingProvider';
import { fontFamilyFor } from './fonts';

/** React Native's size for text that sets none. */
const DEFAULT_FONT_SIZE = 14;

/** A style's sizes multiplied for the language (Settings > Branding > text size). */
export function scaleTextStyle(flat: { fontSize?: number; lineHeight?: number }, scale: number) {
  if (scale === 1) return null;
  return {
    fontSize: Math.round((flat.fontSize ?? DEFAULT_FONT_SIZE) * scale * 10) / 10,
    ...(flat.lineHeight ? { lineHeight: Math.round(flat.lineHeight * scale * 10) / 10 } : {}),
  };
}

const BOLD = new Set(['bold', '600', '700', '800', '900']);

/**
 * Text in the reader's language and its font. Use this instead of React
 * Native's Text, so Sinhala and Tamil always get the bundled Noto fonts at the
 * right weight, at the size set for that language (Sinhala and Tamil
 * letters need more room than English). `lang` overrides the reading
 * language - for a language's own name in the language picker.
 */
export function Text({ style, lang, ...props }: TextProps & { lang?: 'en' | 'si' | 'ta' }) {
  const { locale } = useTranslation();
  const flat = StyleSheet.flatten(style) ?? {};
  const bold = BOLD.has(String(flat.fontWeight ?? ''));
  const fontFamily = fontFamilyFor(lang ?? locale, bold);
  const scaled = scaleTextStyle(flat, useTextScale(lang ?? locale));
  // With a per-weight font file the weight is in the family: drop fontWeight so
  // Android doesn't synthesise a second, smudged bold on top of it.
  return <RNText {...props} style={[style, fontFamily ? { fontFamily, fontWeight: 'normal' } : null, scaled]} />;
}
