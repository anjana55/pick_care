'use client';

import { Menu } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/provider';
import { LanguageToggle } from '@/components/layout/language-toggle';
import { AccountMenu } from '@/components/layout/account-menu';
import { QuickSearch } from '@/components/layout/quick-search';
import { StaffBell } from '@/components/layout/staff-bell';
import { HelpTopbarButton } from '@/components/help/help-button';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation();

  return (
    // Sticky: it holds the language switch, the account menu and (below md) the
    // only navigation trigger, so it has to stay reachable while a long list
    // scrolls past.
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenu}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-ink/60 hover:bg-paper hover:text-ink md:hidden"
          aria-label={t('nav.openMenu')}
        >
          <Menu size={18} />
        </button>
        {/* No link out to the public site here: following it signed staff out
            and dropped them on the website's home page mid-task. The signed-out
            pages (AuthHeader) keep theirs. */}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <QuickSearch />
        <LanguageToggle />
        <HelpTopbarButton />
        <StaffBell />
        <AccountMenu />
      </div>
    </header>
  );
}
