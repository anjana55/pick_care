import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { agreementVersion, DEFAULT_BRANDING } from '@care-platform/shared';
import CaregiverSignupPage from '@/app/caregiver/signup/page';
import { ProviderChoices } from '@/components/caregivers/provider-choices';
import { I18nProvider } from '@/lib/i18n';
import { hardNavigate } from '@/lib/navigation';
import { rememberIdentity } from '@/lib/signup';

jest.mock('@/lib/navigation', () => ({ hardNavigate: jest.fn() }));

/**
 * Caregiver registration: the sign-in method first, then one form with one
 * phone number (none at all after WhatsApp, which has just verified it), the
 * service agreement - and, for anyone who would rather not, the office's
 * number to call.
 */

const get = jest.fn();
const post = jest.fn();
const applyTokens = jest.fn();
let officePhone: string | null = '011 234 5678';

jest.mock('@/lib/api/auth-context', () => ({ useAuth: () => ({ user: null, logout: jest.fn(), applyTokens: (...a: unknown[]) => applyTokens(...a) }) }));
jest.mock('@/lib/branding/provider', () => ({
  useBranding: () => ({ ...jest.requireActual('@care-platform/shared').DEFAULT_BRANDING, officePhone, logoUrl: null }),
}));
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
}));

const TREE = [
  {
    id: 1,
    name: 'Western Province',
    districts: [
      { id: 1, name: 'Colombo' },
      { id: 2, name: 'Gampaha' },
    ],
  },
];

function renderPage(node: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>{node}</I18nProvider>
    </QueryClientProvider>,
  );
}

const change = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function fillDetails() {
  await screen.findByRole('option', { name: 'Colombo' });
  change(/Full name/, 'Nadeesha Silva');
  change(/Permanent address/, '12 Temple Road, Colombo');
  change(/Date of birth/, '1990-04-12');
  change(/^Gender/, 'FEMALE');
  change(/Civil status/, 'SINGLE');
  change(/Emergency contact name/, 'Kamal Silva');
  change(/Emergency contact number/, '0712345678');
  change(/contact relationship/, 'Brother');
  change(/District/, '1');
  await screen.findByRole('option', { name: /Colombo 03/ });
  change(/City/, '10');
  fireEvent.click(screen.getByLabelText(/I consent to my personal and health information/));
  fireEvent.click(screen.getByLabelText(/agree to the caregiver service agreement/));
}

beforeEach(() => {
  window.sessionStorage.clear();
  officePhone = '011 234 5678';
  get.mockReset();
  post.mockReset();
  applyTokens.mockReset();
  (hardNavigate as jest.Mock).mockReset();
  get.mockImplementation((path: string) => {
    if (path === '/auth/signup/methods') return Promise.resolve({ email: true, whatsapp: true, providers: { GOOGLE: true, MICROSOFT: true, FACEBOOK: false } });
    if (path.startsWith('/public/meta/locations/tree')) return Promise.resolve(TREE);
    if (path.includes('/cities')) return Promise.resolve([{ id: 10, name: 'Colombo 03', subName: 'Modara', postcode: '00300' }]);
    return Promise.resolve(null);
  });
});

describe('caregiver registration', () => {
  it('starts with the sign-in choice and the office number to call', async () => {
    renderPage(<CaregiverSignupPage />);
    expect(await screen.findByText('How would you like to sign in?')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Continue with WhatsApp/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Microsoft' })).toBeInTheDocument();
    expect(screen.queryByText('Already have an account?')).toBeNull();
    expect(screen.getByText('Prefer to register by phone?')).toBeInTheDocument();
    const call = screen.getByRole('link', { name: /Call 011 234 5678/ });
    expect(call).toHaveAttribute('href', 'tel:0112345678');
    // The 3rd choice: after WhatsApp and the providers, before email.
    const after = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(screen.getByRole('button', { name: 'Continue with Microsoft' }), call)).toBe(true);
    expect(after(call, screen.getByRole('button', { name: /Continue with email and password/ }))).toBe(true);
  });

  it('shows no call button when the office has no number set', async () => {
    officePhone = null;
    renderPage(<CaregiverSignupPage />);
    await screen.findByText('How would you like to sign in?');
    expect(screen.queryByText('Prefer to register by phone?')).toBeNull();
  });

  it('after WhatsApp, never asks for a phone number and ends signed in', async () => {
    post.mockImplementation((path: string) => {
      if (path === '/auth/signup/whatsapp/request-otp') return Promise.resolve({ phone: '+94771234567', resendAfterSeconds: 60, expiresInSeconds: 300 });
      if (path === '/auth/signup/whatsapp/verify-otp') {
        return Promise.resolve({
          signedIn: false,
          ticket: 'wa',
          expiresInSeconds: 3600,
          method: 'WHATSAPP',
          side: 'caregiver',
          phone: '+94771234567',
          email: null,
          name: null,
        });
      }
      return Promise.resolve({ signedIn: true, method: 'WHATSAPP', tokens: { accessToken: 'a', refreshToken: 'r' }, registrationNumber: 'CG-1' });
    });
    renderPage(<CaregiverSignupPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Continue with WhatsApp/ }));
    change(/WhatsApp number/, '0771234567');
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    change(await screen.findByLabelText(/^Code/).then(() => /^Code/), '123456');
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await screen.findByText("You'll sign in with WhatsApp: +94771234567");
    // One number, and WhatsApp has it: neither the phone nor the primary phone is asked.
    expect(screen.queryByLabelText(/^Phone number/)).toBeNull();
    expect(screen.queryByLabelText(/Primary phone/)).toBeNull();
    expect(screen.queryByLabelText(/Password/)).toBeNull();

    await fillDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/signup/caregiver', expect.anything()));
    const body = post.mock.calls.find(([p]) => p === '/auth/signup/caregiver')![1];
    expect(body).toMatchObject({ signupTicket: 'wa', fullName: 'Nadeesha Silva', agreementAccepted: true, agreementVersion: agreementVersion('caregiver') });
    expect(body).not.toHaveProperty('phone');
    expect(body).not.toHaveProperty('primaryPhone');
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/caregiver/dashboard'));
  });

  it('after email and password, asks for the phone number once and says to check the inbox', async () => {
    post.mockResolvedValue({ signedIn: false, method: 'EMAIL', email: 'nadeesha@example.com', verificationSent: true, registrationNumber: 'CG-2026-0001' });
    renderPage(<CaregiverSignupPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Continue with email and password/ }));
    change(/^Email address/, 'nadeesha@example.com');
    change(/^Password/, 'longenough');
    change(/Confirm password/, 'longenough');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findAllByLabelText(/^Phone number/)).toHaveLength(1);
    change(/^Phone number/, '0771234567');
    await fillDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({ phone: '0771234567', email: 'nadeesha@example.com', password: 'longenough' });
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText('Your registration number: CG-2026-0001')).toBeInTheDocument();
  });

  it('does not submit without the service agreement', async () => {
    rememberIdentity({ ticket: 'g', expiresInSeconds: 3600, method: 'GOOGLE', side: 'caregiver', email: 'n@example.com', phone: null, name: 'Nadeesha Silva' });
    renderPage(<CaregiverSignupPage />);
    await screen.findByText("You'll sign in with Google: n@example.com");
    fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(await screen.findByText('Please read and accept the service agreement to continue')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('the provider choice screen (finishing a saved registration)', () => {
  it('still offers the configured providers', () => {
    renderPage(<ProviderChoices pendingToken="t" providers={{ GOOGLE: true, MICROSOFT: false, FACEBOOK: false }} expiresInSeconds={900} />);
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue with microsoft/i })).toBeNull();
  });
});

void DEFAULT_BRANDING;
