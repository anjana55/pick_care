// ESLint for the whole monorepo (flat config). Formatting is Prettier's job:
// eslint-config-prettier switches off every rule that would argue with it.
//
//   npm run lint          check everything
//   npm run lint -- --fix fix what can be fixed automatically
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const NEXT_APPS = ['apps/web', 'apps/public-web'];
const REACT_APPS = [...NEXT_APPS, 'apps/mobile', 'packages/shared'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.expo/**',
      '**/coverage/**',
      'apps/*/public/maplibre/**',
      'apps/api/src/database/migrations/**',
      '**/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Rules for the whole repo, tuned to how this codebase is written.
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // Unused imports and variables are already errors in every tsconfig (noUnusedLocals).
      // Parameters may be unused (callbacks, interface shapes) when they start with `_`.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
      // External JSON (providers, drivers) is typed as `any` on purpose at the edges.
      '@typescript-eslint/no-explicit-any': 'off',
      // `require()` is used where a module must load lazily or only in Node (Expo config, optional native modules).
      '@typescript-eslint/no-require-imports': 'off',
      // Non-null assertions follow checks the compiler cannot see (Drizzle results, Map lookups).
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Empty catch blocks are deliberate "best effort" (storage, cleanup) and are commented.
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // `// @ts-nocheck - why` is allowed where a file needs it, with the reason.
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-nocheck': 'allow-with-description' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // The API and Node scripts.
  {
    files: ['apps/api/**/*.ts', '**/*.mjs', '**/*.cjs', '**/*.config.{js,ts}', 'apps/*/scripts/**', 'packages/shared/scripts/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },

  // React (web, mobile, shared i18n).
  {
    files: REACT_APPS.map((dir) => `${dir}/**/*.{ts,tsx}`),
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Next.js apps.
  {
    files: NEXT_APPS.map((dir) => `${dir}/**/*.{ts,tsx,js}`),
    plugins: { '@next/next': nextPlugin },
    rules: { ...nextPlugin.configs.recommended.rules, ...nextPlugin.configs['core-web-vitals'].rules },
    settings: { next: { rootDir: NEXT_APPS } },
  },

  // Tests: Jest globals.
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/*.test.{ts,tsx}', '**/__tests__/**', '**/test/**', '**/test-utils/**', '**/jest.setup.ts'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
  },

  prettier,
);
