'use client';

import { useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/provider';

/**
 * The caregiver's own area moved to the public site at /caregiver/dashboard.
 *
 * Staff sign-in refuses caregiver accounts (POST /auth/login with
 * portal 'staff'), so a caregiver only reaches /staff/me from an old link or
 * a session from before the portals were split. Tombstone, like the sibling
 * /register and /login/whatsapp pages: a hard navigation, because the
 * destination is served by another container.
 */
export default function CaregiverAreaRedirect() {
  const { t } = useTranslation();

  useEffect(() => {
    window.location.replace('/caregiver/dashboard');
  }, []);

  return (
    <div role="status" className="flex min-h-screen items-center justify-center text-sm text-ink/50">
      {t('common.loading')}
    </div>
  );
}
