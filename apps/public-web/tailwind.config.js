/** @type {import('tailwindcss').Config} */
// NOTE: this file is duplicated verbatim in apps/web (the staff portal).
// Change both together, or the two apps drift apart visually.
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      // White-label palette. The brand, accent, page and hairline colours are
      // CSS variables set from Settings > Branding (see `paletteCss` in
      // packages/shared branding.ts and the root layout), held as bare "R G B"
      // channels so opacity modifiers such as `border-brand/30` keep working.
      //
      // The fallbacks below - and the values an untouched deployment gets - are
      // the Pick Care palette: deep teal primary #0F5C5C and terracotta accent
      // #BA5942, with the other shades derived by `derivePalette`. Settings >
      // Branding refuses colours that fail WCAG AA with white text.
      colors: {
        paper: 'rgb(var(--color-paper, 242 246 246) / <alpha-value>)', // #F2F6F6, 9.72:1 with ink
        ink: '#374046', //    10.58:1 on white
        border: 'rgb(var(--color-border, 202 219 219) / <alpha-value>)', // #CADBDB, decorative hairline
        brand: {
          DEFAULT: 'rgb(var(--color-brand, 15 92 92) / <alpha-value>)', // #0F5C5C teal, 7.76:1 with white text
          dark: 'rgb(var(--color-brand-dark, 12 76 76) / <alpha-value>)', // #0C4C4C, 9.75:1
          light: 'rgb(var(--color-brand-light, 214 227 227) / <alpha-value>)', // #D6E3E3, tint behind brand content
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent, 186 89 66) / <alpha-value>)', // #BA5942 terracotta, 4.57:1 with white text
          dark: 'rgb(var(--color-accent-dark, 164 78 58) / <alpha-value>)', // #A44E3A, 5.63:1
          light: 'rgb(var(--color-accent-light, 243 227 223) / <alpha-value>)', // #F3E3DF, tint behind accent content
        },
        danger: {
          DEFAULT: '#A6402F', // 6.18:1 with white text
          light: '#F3DDD8',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        sinhala: ['var(--font-noto-si)', 'sans-serif'],
        tamil: ['var(--font-noto-ta)', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '6px',
        lg: '10px',
      },
      // Focus rings are used on every interactive control across both apps, so
      // they take the brand colour unless a component overrides them.
      ringColor: {
        DEFAULT: 'rgb(var(--color-brand, 15 92 92) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
