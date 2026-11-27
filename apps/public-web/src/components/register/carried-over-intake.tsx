'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWatch, type Control, type FieldErrors, type UseFormSetValue } from 'react-hook-form';
import { HeartHandshake } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { intakeDefaultsFromSearch, loadSearch, peekPendingContact } from '@/lib/care-intent';
import type { PatientIntakeValues } from '@/lib/schemas/patient-intake';
import { INTAKE_SECTION_FIELDS, type IntakeSectionKey } from '@/components/register/patient-intake-fields';
import { CareNeedSummary, useLocationLabel } from '@/components/care/care-need-summary';

/* Generic over the two sign-up forms, which both extend PatientIntakeValues
 * (same approach as PatientIntakeFields). */

/**
 * Brings what the visitor already told us into a client sign-up form:
 *
 * - answers from their last search are filled in, and every part of the
 *   intake the search fully answered is folded into a summary they confirm
 *   (with one "Edit" to unfold it) instead of a section they must re-enter;
 * - the contact method defaults to the channel they are signing up with;
 * - the caregiver they set out to contact, if any, is returned so the page can
 *   say they will be taken straight back.
 *
 * Nothing the search did not answer is guessed. Validation is unchanged: a
 * folded part that turns out to be invalid unfolds itself (onInvalid).
 */
export function useCarriedOverIntake<T extends PatientIntakeValues>({
  setValue,
  channel,
}: {
  setValue: UseFormSetValue<T>;
  channel: 'email' | 'whatsapp';
}) {
  const { t } = useTranslation();
  const [folded, setFolded] = useState<IntakeSectionKey[]>([]);
  const [answered, setAnswered] = useState<string[]>([]);
  const [carried, setCarried] = useState(false);
  const [pendingCaregiver, setPendingCaregiver] = useState<string | null>(null);

  // After mount: localStorage is not available while server rendering.
  useEffect(() => {
    setPendingCaregiver(peekPendingContact());
    const search = loadSearch();
    if (!search) return;
    const fromSearch = intakeDefaultsFromSearch(search, t);
    const defaults: Partial<PatientIntakeValues> = {
      ...fromSearch,
      preferredContactMethod: channel === 'whatsapp' ? 'WHATSAPP' : 'PHONE_CALL',
      preferredContactTime: 'ANYTIME',
    };
    for (const [name, value] of Object.entries(defaults)) {
      if (value !== undefined) setValue(name as any, value as any, { shouldDirty: false });
    }

    // Every question the search answered is kept out of sight, one by one -
    // not only whole parts - so nothing is asked twice. How to be contacted
    // has a sensible default from the sign-in they chose.
    setAnswered(Object.entries(fromSearch).filter(([, v]) => v !== undefined).map(([k]) => k));
    setFolded(['contact']);
    setCarried(true);
    // Once, on arrival - re-running on a language switch would overwrite edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unfold = useCallback(() => {
    setFolded([]);
    setAnswered([]);
  }, []);

  /** Pass as handleSubmit's second argument: shows any folded part that needs fixing. */
  const onInvalid = useCallback(
    (errors: FieldErrors<T>) => {
      const failed = Object.keys(errors);
      const hiddenFailed =
        folded.some((key) => INTAKE_SECTION_FIELDS[key].some((f) => failed.includes(f))) || answered.some((f) => failed.includes(f));
      if (hiddenFailed) unfold();
    },
    [folded, answered, unfold],
  );

  return { folded, answered, carried, unfold, onInvalid, pendingCaregiver };
}

/** The folded parts, read back from the live form values, with one way to edit them. */
export function CarriedOverSummary<T extends PatientIntakeValues>({
  control,
  folded,
  answered = [],
  onEdit,
}: {
  control: Control<T>;
  folded: readonly IntakeSectionKey[];
  /** Single questions the search answered (useCarriedOverIntake's `answered`). */
  answered?: readonly string[];
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const values = useWatch({ control }) as Partial<PatientIntakeValues>;
  const location = useLocationLabel(values.districtId ? Number(values.districtId) : null, values.cityId ? Number(values.cityId) : null);
  if (folded.length === 0 && answered.length === 0) return null;

  // A question shows here when its part was folded, or when it was answered on its own.
  const shown = (field: string, part: IntakeSectionKey) => answered.includes(field) || folded.includes(part);
  const lines: string[] = [];
  const who = [
    shown('recipientAge', 'whoNeedsCare') && values.recipientAge !== undefined ? t('careIntent.summary.age', { age: String(values.recipientAge) }) : null,
    shown('recipientGender', 'whoNeedsCare') && values.recipientGender ? t(`patientIntake.options.gender.${values.recipientGender}`) : null,
  ].filter(Boolean);
  if (who.length > 0) lines.push(who.join(' · '));
  if ((shown('districtId', 'location') || shown('cityId', 'location')) && location) lines.push(location);
  const when = [
    shown('careSchedule', 'care') && values.careSchedule && t(`patientIntake.options.careSchedule.${values.careSchedule}`),
    shown('careStart', 'care') && values.careStart && t(`patientIntake.options.careStart.${values.careStart}`),
  ].filter(Boolean);
  if (when.length > 0) lines.push(when.join(' · '));
  if (shown('preferredCaregiverGender', 'care') && values.preferredCaregiverGender && values.preferredCaregiverGender !== 'NO_PREFERENCE') {
    lines.push(t('careIntent.summary.caregiverGender', { gender: t(`patientIntake.options.caregiverGender.${values.preferredCaregiverGender}`) }));
  }
  if (shown('careNeeds', 'care') && values.careNeeds) lines.push(values.careNeeds);
  if (folded.includes('contact') && values.preferredContactMethod) {
    lines.push(
      t('careIntent.summary.contact', {
        method: t(`patientIntake.options.contactMethod.${values.preferredContactMethod}`),
        time: t(`patientIntake.options.contactTime.${values.preferredContactTime ?? 'ANYTIME'}`),
      }),
    );
  }

  return (
    <div className="border-t border-border pt-5">
      <CareNeedSummary
        title={t('careIntent.fromSearch')}
        lines={lines}
        action={
          <button type="button" onClick={onEdit} className="text-sm font-medium text-brand-dark hover:underline">
            {t('careIntent.edit')}
          </button>
        }
      />
    </div>
  );
}

/** "You're contacting caregiver #1a2b3c4d - we'll bring you straight back." */
export function PendingContactBanner({ publicId }: { publicId: string | null }) {
  const { t } = useTranslation();
  if (!publicId) return null;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-DEFAULT border border-accent/30 bg-accent-light p-3 text-sm text-ink">
      <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
      <p>{t('careIntent.pendingContact', { id: publicId.slice(0, 8) })}</p>
    </div>
  );
}
