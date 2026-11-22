import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_BRANDING } from '@care-platform/shared';
import { BrandingProvider } from '@/lib/branding/provider';
import { useTranslation } from '@/lib/i18n';

/** The page's base size follows the text size set for the reading language (Settings > Branding). */

function Switch() {
  const { setLocale } = useTranslation();
  return (
    <button type="button" onClick={() => setLocale('si')}>
      සිංහල
    </button>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.style.fontSize = '';
  global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as never;
});

it('leaves English at the normal size and makes Sinhala the size set for it', async () => {
  const branding = { ...DEFAULT_BRANDING, textScale: { en: 100, si: 85, ta: 90 } };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BrandingProvider initial={branding}>
        <Switch />
      </BrandingProvider>
    </QueryClientProvider>,
  );
  expect(document.documentElement.style.fontSize).toBe('');
  await act(async () => screen.getByRole('button', { name: 'සිංහල' }).click());
  expect(document.documentElement.style.fontSize).toBe('85%');
});
