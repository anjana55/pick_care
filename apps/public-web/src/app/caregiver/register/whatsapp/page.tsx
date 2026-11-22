import { redirect } from 'next/navigation';

/**
 * Kept only so old links and bookmarks still land somewhere useful.
 *
 * Registration now starts by choosing how to sign in - WhatsApp is one of the
 * choices - on the one registration page, so this separate route has nothing
 * left to do.
 */
export default function LegacyRegisterPage() {
  redirect('/caregiver/signup');
}
