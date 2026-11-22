import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SocialCallback } from '@/components/social/social-callback';
import { I18nProvider } from '@/lib/i18n';
import { hardNavigate } from '@/lib/navigation';
import { takeRememberedIdentity } from '@/lib/signup';

/** The provider coming back to a registration that has not been filled in yet (`flow=identify`). */

jest.mock('@/lib/navigation', () => ({ hardNavigate: jest.fn() }));
const post = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));
jest.mock('@/lib/api/auth-context', () => ({ useAuth: () => ({ applyTokens: jest.fn() }) }));
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  api: { get: jest.fn(), post: (...a: unknown[]) => post(...a) },
}));

const show = (side: 'client' | 'caregiver') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <SocialCallback side={side} />
      </I18nProvider>
    </QueryClientProvider>,
  );

const IDENTITY = { ticket: 't', expiresInSeconds: 3600, method: 'GOOGLE', side: 'caregiver', email: 'a@example.com', phone: null, name: 'A' };

beforeEach(() => {
  post.mockReset();
  jest.mocked(hardNavigate).mockReset();
  window.sessionStorage.clear();
});

it('trades the code for the ticket and goes back to the form', async () => {
  window.sessionStorage.setItem('care-caregiver-social-login-nonce', 'nonce-1');
  search = 'flow=identify&code=abc123&nonce=nonce-1';
  post.mockResolvedValue(IDENTITY);
  show('caregiver');
  await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/caregiver/signup'));
  expect(post).toHaveBeenCalledWith('/auth/signup/identity/exchange', { code: 'abc123' });
  expect(takeRememberedIdentity('caregiver')).toEqual(IDENTITY);
});

it('refuses a callback this tab did not start', async () => {
  window.sessionStorage.setItem('care-caregiver-social-login-nonce', 'mine');
  search = 'flow=identify&code=abc123&nonce=someone-elses';
  show('client');
  expect(await screen.findByRole('link', { name: 'Back to registration' })).toHaveAttribute('href', '/register');
  expect(post).not.toHaveBeenCalled();
});

it('sends someone whose address already has an account to sign in', async () => {
  search = 'flow=identify&error=email_taken';
  show('client');
  expect(await screen.findByText(/An account with that email address already exists/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
});
