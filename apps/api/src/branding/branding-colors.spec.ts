import { DEFAULT_BRANDING, contrastRatio, derivePalette, makeAccessible, meetsBrandContrast, normalizeBranding, paletteCss } from '@care-platform/shared';

/**
 * The colour rules shared by Settings > Branding, the API and both web apps
 * (packages/shared branding.ts).
 */
describe('branding colours', () => {
  it('gives an untouched deployment the Pick Care palette', () => {
    expect(derivePalette(DEFAULT_BRANDING.primaryColor, DEFAULT_BRANDING.accentColor)).toEqual({
      brand: '#0F5C5C',
      brandDark: '#0C4C4C',
      brandLight: '#D6E3E3',
      accent: '#BA5942',
      accentDark: '#A44E3A',
      accentLight: '#F3E3DF',
      paper: '#F2F6F6',
      border: '#CADBDB',
    });
  });

  it('derives darker and lighter shades of a custom colour', () => {
    const p = derivePalette('#1A5FB4', '#8F3B76');
    expect(contrastRatio(p.brandDark, '#FFFFFF')).toBeGreaterThan(contrastRatio(p.brand, '#FFFFFF'));
    expect(contrastRatio(p.brandLight, '#FFFFFF')).toBeLessThan(1.5);
    expect(contrastRatio(p.paper, '#FFFFFF')).toBeLessThan(contrastRatio(p.border, '#FFFFFF'));
  });

  it('turns a too-light colour into the nearest readable shade of the same hue', () => {
    expect(meetsBrandContrast('#4FA3F7')).toBe(false);
    const fixed = makeAccessible('#4FA3F7');
    expect(meetsBrandContrast(fixed)).toBe(true);
    // Barely past the line, not black.
    expect(contrastRatio(fixed, '#FFFFFF')).toBeLessThan(5.2);
    expect(makeAccessible('#0F5C5C')).toBe('#0F5C5C');
  });

  it('writes the palette as bare channels for tailwind', () => {
    expect(paletteCss(derivePalette('#0F5C5C', '#BA5942'))).toContain('--color-brand:15 92 92');
  });

  it('treats malformed or unreadable branding from the network as the default', () => {
    expect(normalizeBranding(null)).toEqual(DEFAULT_BRANDING);
    const b = normalizeBranding({
      companyName: '  Acme  ',
      primaryColor: '#FFFF00',
      accentColor: 'red',
      defaultLocale: 'xx',
      enabledLocales: ['ta'],
      logoVersion: '../x',
    });
    expect(b).toMatchObject({
      companyName: 'Acme',
      shortName: 'AC',
      primaryColor: '#0F5C5C',
      accentColor: '#BA5942',
      defaultLocale: 'en',
      enabledLocales: ['en', 'ta'],
      logoVersion: null,
    });
  });
});
