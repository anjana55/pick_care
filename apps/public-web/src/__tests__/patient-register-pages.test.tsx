import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { agreementVersion } from '@care-platform/shared';
import RegisterPage from '@/app/register/page';
import { I18nProvider } from '@/lib/i18n';
import { hardNavigate } from '@/lib/navigation';
import { rememberIdentity } from '@/lib/signup';

const get = jest.fn();
const post = jest.fn();
const applyTokens = jest.fn();

jest.mock('@/lib/navigation', () => ({ hardNavigate: jest.fn() }));
jest.mock('@/lib/api/auth-context', () => ({ useAuth: () => ({ user: null, logout: jest.fn(), applyTokens: (...a: unknown[]) => applyTokens(...a) }) }));
let officePhone: string | null = '011 234 5678';
jest.mock('@/lib/branding/provider', () => ({ useBranding: () => ({ ...jest.requireActual('@care-platform/shared').DEFAULT_BRANDING, officePhone, logoUrl: null }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
}));

const METHODS = { email: true, whatsapp: true, providers: { GOOGLE: true, MICROSOFT: false, FACEBOOK: false } };
const TREE = [{ id: 1, name: 'Western Province', districts: [{ id: 1, name: 'Colombo' }] }];
const CITIES = [{ id: 340, name: 'Dehiwala', subName: null, postcode: '10350', latitude: 6.85, longitude: 79.86 }];
const TOKENS = { accessToken: 'a', refreshToken: 'r' };

function renderPage(node: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>{node}</I18nProvider>
    </QueryClientProvider>,
  );
}

const change = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

/** Step 1 with email and password, so the details form opens. */
async function chooseEmail() {
  fireEvent.click(await screen.findByRole('button', { name: /Continue with email and password/ }));
  change(/^Email address/, 'kamala@example.com');
  change(/^Password/, 'longenough');
  change(/Confirm password/, 'longenough');
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('About you and the care you need');
}

/** Step 1 with WhatsApp: number, code, and the API's ticket. */
async function chooseWhatsapp() {
  post.mockImplementation((path: string) => {
    if (path === '/auth/signup/whatsapp/request-otp') return Promise.resolve({ phone: '+94771234567', resendAfterSeconds: 60, expiresInSeconds: 300, devOtp: '123456' });
    if (path === '/auth/signup/whatsapp/verify-otp') {
      return Promise.resolve({ signedIn: false, ticket: 'wa-ticket', expiresInSeconds: 3600, method: 'WHATSAPP', side: 'client', phone: '+94771234567', email: null, name: null });
    }
    return Promise.resolve({ signedIn: true, method: 'WHATSAPP', tokens: TOKENS });
  });
  fireEvent.click(await screen.findByRole('button', { name: /Continue with WhatsApp/ }));
  change(/WhatsApp number/, '0771234567');
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
  change(/^Code/, await screen.findByText('Development code: 123456').then(() => '123456'));
  fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
  await screen.findByText('About you and the care you need');
}

beforeEach(() => {
  officePhone = '011 234 5678';
  window.localStorage.clear();
  window.sessionStorage.clear();
  get.mockReset();
  post.mockReset();
  applyTokens.mockReset();
  (hardNavigate as jest.Mock).mockReset();
  get.mockImplementation((path: string) => {
    if (path === '/auth/signup/methods') return Promise.resolve(METHODS);
    if (path.startsWith('/public/meta/locations/tree')) return Promise.resolve(TREE);
    if (path.startsWith('/public/meta/locations/cities')) return Promise.resolve(CITIES);
    if (path === '/auth/social/google/signup-url') return Promise.resolve({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
    return Promise.resolve(null);
  });
});

describe('client registration asks how they will sign in first', () => {
  it('offers WhatsApp, the switched-on providers, and email - without asking again whether they have an account', async () => {
    renderPage(<RegisterPage />);
    expect(await screen.findByText('How would you like to sign in?')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Continue with WhatsApp/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Microsoft' })).toBeNull();
    expect(screen.getByRole('button', { name: /Continue with email and password/ })).toBeInTheDocument();
    expect(screen.queryByText('Already have an account?')).toBeNull();
    // No details yet: they come after the sign-in is chosen.
    expect(screen.queryByText('Who needs care?')).toBeNull();
  });

  it('starts the provider sign-up with a nonce kept for the way back', async () => {
    renderPage(<RegisterPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1'));
    const [, params] = get.mock.calls.find(([p]) => p === '/auth/social/google/signup-url')!;
    expect(params).toEqual({ nonce: window.sessionStorage.getItem('care-caregiver-social-login-nonce'), side: 'client' });
  });

  it('after WhatsApp, does not ask for the phone number again, and ends signed in', async () => {
    renderPage(<RegisterPage />);
    await chooseWhatsapp();
    expect(screen.getByText("You'll sign in with WhatsApp: +94771234567")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Phone number/)).toBeNull();
    // No email address, so email is not a way to be contacted.
    const method = screen.getByLabelText(/Preferred contact method/) as HTMLSelectElement;
    expect(Array.from(method.options).map((o) => o.value)).not.toContain('EMAIL');
    expect(method.value).toBe('WHATSAPP');

    change(/Full name/, 'Kamala Perera');
    fireEvent.click(screen.getByLabelText('I need care myself'));
    change(/Your age/, '70');
    change(/Your gender/, 'FEMALE');
    change(/District/, '1');
    await screen.findByRole('option', { name: 'Dehiwala' });
    change(/City/, '340');
    change(/When is care needed/, 'DAY');
    change(/When should care start/, 'WITHIN_WEEK');
    fireEvent.click(screen.getByLabelText(/data processing consent/));
    fireEvent.click(screen.getByLabelText(/agree to the client service agreement/));
    fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/signup/client', expect.anything()));
    const body = post.mock.calls.find(([p]) => p === '/auth/signup/client')![1];
    expect(body).toMatchObject({ fullName: 'Kamala Perera', signupTicket: 'wa-ticket', agreementAccepted: true, agreementVersion: agreementVersion('client') });
    expect(body).not.toHaveProperty('phone');
    expect(body).not.toHaveProperty('password');
    // The description of the care is optional and was left blank.
    expect(body.careNeeds).toBeUndefined();
    await waitFor(() => expect(applyTokens).toHaveBeenCalledWith(TOKENS));
    expect(hardNavigate).toHaveBeenCalledWith('/');
  });

  it('after email and password, asks for a phone number and says to check the inbox', async () => {
    post.mockResolvedValue({ signedIn: false, method: 'EMAIL', email: 'kamala@example.com', verificationSent: true });
    renderPage(<RegisterPage />);
    await chooseEmail();
    expect(screen.getByLabelText(/^Phone number/)).toBeInTheDocument();
    // Asked once, on step 1 - not again here.
    expect(screen.queryByLabelText(/^Password/)).toBeNull();
  });

  it('does not submit an incomplete form, and needs the service agreement', async () => {
    renderPage(<RegisterPage />);
    await chooseEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(await screen.findByText('Please choose who needs care')).toBeInTheDocument();
    expect(screen.getByText('Please choose a district')).toBeInTheDocument();
    expect(screen.getByText('Please read and accept the service agreement to continue')).toBeInTheDocument();
    // Describing the care is optional now.
    expect(screen.queryByText('Please describe the care needed')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the agreement text on request', async () => {
    renderPage(<RegisterPage />);
    await chooseEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Read the agreement' }));
    expect(screen.getByText('Bookings and payment')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open it on its own page' })).toHaveAttribute('href', '/agreements/client');
  });

  it('picks up an identity proven by Google, with the name it knows', async () => {
    rememberIdentity({ ticket: 'g-ticket', expiresInSeconds: 3600, method: 'GOOGLE', side: 'client', email: 'nimali@example.com', phone: null, name: 'Nimali Perera' });
    renderPage(<RegisterPage />);
    expect(await screen.findByText("You'll sign in with Google: nimali@example.com")).toBeInTheDocument();
    await waitFor(() => expect((screen.getByLabelText(/Full name/) as HTMLInputElement).value).toBe('Nimali Perera'));
    expect(screen.getByLabelText(/^Phone number/)).toBeInTheDocument();
  });

  it('goes back to choosing when the ticket has expired', async () => {
    const { ApiError } = jest.requireActual('@/lib/api/client');
    rememberIdentity({ ticket: 'old', expiresInSeconds: 3600, method: 'GOOGLE', side: 'client', email: 'x@example.com', phone: null, name: 'Old Ticket' });
    post.mockRejectedValue(new ApiError(401, 'expired', 'ticket_expired'));
    renderPage(<RegisterPage />);
    await screen.findByText(/You'll sign in with Google/);
    await screen.findByRole('option', { name: 'Colombo' });
    change(/^Phone number/, '0771234567');
    fireEvent.click(screen.getByLabelText('I need care myself'));
    change(/Your age/, '70');
    change(/Your gender/, 'FEMALE');
    change(/District/, '1');
    await screen.findByRole('option', { name: 'Dehiwala' });
    change(/City/, '340');
    change(/When is care needed/, 'DAY');
    change(/When should care start/, 'WITHIN_WEEK');
    fireEvent.click(screen.getByLabelText(/data processing consent/));
    fireEvent.click(screen.getByLabelText(/agree to the client service agreement/));
    fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(await screen.findByText('Your sign-in step has expired. Please choose how to sign in again.')).toBeInTheDocument();
    expect(screen.getByText('How would you like to sign in?')).toBeInTheDocument();
  });
});

describe('client registration: calling the office instead', () => {
  it('is the 3rd choice: after WhatsApp and the providers, before email - and dials the office', async () => {
    renderPage(<RegisterPage />);
    const whatsapp = await screen.findByRole('button', { name: /Continue with WhatsApp/ });
    const google = screen.getByRole('button', { name: 'Continue with Google' });
    const call = screen.getByRole('link', { name: /Call 011 234 5678/ });
    const email = screen.getByRole('button', { name: /Continue with email and password/ });
    expect(call).toHaveAttribute('href', 'tel:0112345678');
    const after = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(whatsapp, google)).toBe(true);
    expect(after(google, call)).toBe(true);
    expect(after(call, email)).toBe(true);
  });

  it('is left out when the office has no number', async () => {
    officePhone = null;
    renderPage(<RegisterPage />);
    await screen.findByRole('button', { name: /Continue with WhatsApp/ });
    expect(screen.queryByText('Prefer to register by phone?')).toBeNull();
  });
});

describe('client registration after a search asks nothing twice', () => {
  const PUBLIC_ID = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    window.localStorage.setItem(
      'care-platform-last-search',
      JSON.stringify({
        at: Date.now(),
        request: {
          patient: { age: 78, gender: 'FEMALE', medicalConditions: ['diabetes'] },
          location: { districtId: 1, cityId: 340 },
          shift: 'NIGHT',
          caregiverGenderPreference: 'FEMALE',
          desiredStartDate: new Date().toISOString().slice(0, 10),
        },
        skillNames: ['Dementia care'],
      }),
    );
    window.localStorage.setItem('care-platform-pending-contact', JSON.stringify({ publicId: PUBLIC_ID, at: Date.now() }));
  });

  it('hides every question the search answered - age and gender included - and lists them instead', async () => {
    renderPage(<RegisterPage />);
    expect(await screen.findByText(/You're contacting caregiver #11111111/)).toBeInTheDocument();
    expect(screen.queryByText('Find and hire the right caregiver for your family')).toBeNull();
    await chooseEmail();

    // Who is registering is still asked; the age and gender the search gave are not.
    expect(screen.getByText('Who needs care?')).toBeVisible();
    expect(screen.getByLabelText(/Your age/)).not.toBeVisible();
    expect(screen.getByLabelText(/Your gender/)).not.toBeVisible();
    expect(screen.getByText('Where is care needed?')).not.toBeVisible();
    expect(screen.getByText('What care is needed?')).not.toBeVisible();
    expect(screen.getByText('How should we contact you?')).not.toBeVisible();
    expect(await screen.findByText('Dehiwala, Colombo')).toBeInTheDocument();
    expect(screen.getByText('Age 78 · Female')).toBeInTheDocument();
    expect(screen.getByText('Caregiver preference: Female')).toBeInTheDocument();
  });

  it('submits the carried-over answers with only name, phone and "who" typed in', async () => {
    post.mockResolvedValue({ signedIn: false, method: 'EMAIL', email: 'kamala@example.com', verificationSent: true });
    renderPage(<RegisterPage />);
    await chooseEmail();
    await screen.findByText('Dehiwala, Colombo');

    change(/Full name/, 'Kamala Perera');
    change(/^Phone number/, '0771234567');
    fireEvent.click(screen.getByLabelText('I need care myself'));
    fireEvent.click(screen.getByLabelText(/data processing consent/));
    fireEvent.click(screen.getByLabelText(/agree to the client service agreement/));
    fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe('/auth/signup/client');
    expect(post.mock.calls[0][1]).toMatchObject({
      email: 'kamala@example.com',
      password: 'longenough',
      phone: '0771234567',
      registrantType: 'SELF',
      recipientAge: 78,
      recipientGender: 'FEMALE',
      districtId: 1,
      cityId: 340,
      careSchedule: 'NIGHT',
      careStart: 'IMMEDIATELY',
      preferredCaregiverGender: 'FEMALE',
      preferredContactMethod: 'PHONE_CALL',
      preferredContactTime: 'ANYTIME',
      careNeeds: 'Help needed with: Dementia care\nHealth conditions: diabetes',
    });
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText(/we'll take you back to the caregiver you chose/)).toBeInTheDocument();
  });

  it('unfolds everything for editing', async () => {
    renderPage(<RegisterPage />);
    await chooseEmail();
    await screen.findByText('Dehiwala, Colombo');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('Where is care needed?')).toBeVisible();
    expect(screen.getByLabelText(/Your age/)).toBeVisible();
    expect((screen.getByLabelText(/Describe the care needed/) as HTMLTextAreaElement).value).toContain('Dementia care');
  });

  it('defaults a WhatsApp sign-up to being contacted on WhatsApp', async () => {
    renderPage(<RegisterPage />);
    await chooseWhatsapp();
    expect(await screen.findByText('WhatsApp · Any time')).toBeInTheDocument();
  });
});
