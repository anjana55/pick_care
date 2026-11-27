import { fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n/provider';
import { HelpProvider } from '@/help/help-context';
import { HelpPanel } from '@/components/help/help-panel';
import { HelpHint, HelpTopbarButton } from '@/components/help/help-button';
import en from '@/help/en.json';
import si from '@/help/si.json';
import appEn from '@/lib/i18n/en.json';

let mockPath = '/requests';
let mockRole = 'STAFF';
jest.mock('next/navigation', () => ({ usePathname: () => mockPath, useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/lib/api/auth-context', () => ({ useAuth: () => ({ user: { userId: 'u1', email: 'a@b.lk', role: mockRole }, loading: false }) }));

function renderHelp(extra?: React.ReactNode) {
  return render(
    <I18nProvider>
      <HelpProvider>
        <HelpTopbarButton />
        {extra}
        <HelpPanel />
      </HelpProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mockPath = '/requests';
  mockRole = 'STAFF';
});

describe('staff help', () => {
  it('opens straight on the topic for a page that has one, with its steps and the real button names', () => {
    renderHelp();
    fireEvent.click(screen.getByRole('button', { name: en.ui.title }));
    const panel = screen.getByRole('dialog', { name: en.ui.title });
    expect(within(panel).getByRole('heading', { name: en.topics['handle-request'].title })).toBeInTheDocument();
    // [[ui:requests.detail.assignToMe]] is shown as the app's own label.
    expect(within(panel).getAllByText(appEn.requests.detail.assignToMe).length).toBeGreaterThan(0);
    expect(within(panel).getByRole('heading', { name: en.ui.steps })).toBeInTheDocument();
  });

  it('lists the topics for a page that has several, then every topic', () => {
    mockPath = '/bookings/b-1';
    renderHelp();
    fireEvent.click(screen.getByRole('button', { name: en.ui.title }));
    const pageList = screen.getByRole('heading', { name: en.ui.thisPage }).parentElement!;
    for (const id of ['manage-booking', 'care-plan', 'correct-booking'] as const) {
      expect(within(pageList).getByRole('button', { name: new RegExp(en.topics[id].title) })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: en.areas.money })).toBeInTheDocument();
  });

  it('opens the topic a ? names', () => {
    renderHelp(<HelpHint topic="create-invoice" />);
    fireEvent.click(screen.getByRole('button', { name: `Help: ${en.topics['create-invoice'].title}` }));
    expect(screen.getByRole('heading', { name: en.topics['create-invoice'].title })).toBeInTheDocument();
  });

  it('switches the help to another language without changing the app', () => {
    renderHelp();
    fireEvent.click(screen.getByRole('button', { name: en.ui.title }));
    fireEvent.click(screen.getByRole('button', { name: 'සිංහල' }));
    const panel = screen.getByRole('dialog', { name: si.ui.title });
    expect(panel).toHaveAttribute('lang', 'si');
    expect(within(panel).getByRole('heading', { name: si.topics['handle-request'].title })).toBeInTheDocument();
    // The top bar stays in English.
    expect(screen.getByRole('button', { name: en.ui.title })).toBeInTheDocument();
  });

  it('finds topics by words, and goes back', () => {
    renderHelp();
    fireEvent.click(screen.getByRole('button', { name: en.ui.title }));
    fireEvent.change(screen.getByRole('searchbox', { name: en.ui.search }), { target: { value: 'payout statement' } });
    fireEvent.click(within(screen.getByRole('list', { name: en.ui.results })).getByRole('button', { name: new RegExp(en.topics['pay-caregivers'].title) }));
    expect(screen.getByRole('heading', { name: en.topics['pay-caregivers'].title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.ui.back }));
    expect(screen.getByRole('heading', { name: en.topics['handle-request'].title })).toBeInTheDocument();
  });

  it('shows admin topics only to admins', () => {
    renderHelp(<HelpHint topic="manage-users" />);
    expect(screen.queryByRole('button', { name: /manage|accounts/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.ui.title }));
    expect(screen.queryByText(en.areas.admin)).not.toBeInTheDocument();
  });

  it('closes with Escape', () => {
    renderHelp();
    fireEvent.click(screen.getByRole('button', { name: en.ui.title }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
