'use client';

import { contactMethodValues, contactTimeValues, type CommunicationPreferences, type UpdateCommunicationPreferences } from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n';
import { ApiError } from '@/lib/api/client';
import { useMyCommunicationPreferences, useUpdateMyCommunicationPreferences } from '@/lib/hooks/use-communication-preferences';
import { useBellUser } from '@/lib/hooks/use-notifications';

/**
 * "How we contact you", under the notifications list. Each choice saves as
 * soon as it is tapped (no separate Save button to miss), with large targets
 * and plain words. Staff see and can change the same settings.
 */
export function CommunicationPreferencesSection() {
  const { t } = useTranslation();
  const user = useBellUser();
  const { data, isLoading, isError } = useMyCommunicationPreferences();
  const update = useUpdateMyCommunicationPreferences();
  if (!user) return null;

  const save = (patch: UpdateCommunicationPreferences) => update.mutate(patch);
  const error = update.error ? (update.error instanceof ApiError ? update.error.message : t('commsPrefs.saveError')) : null;
  const isClient = user.role === 'PATIENT_GUARDIAN';

  return (
    <section aria-labelledby="comms-heading" className="rounded-lg border border-border bg-white p-4">
      <h2 id="comms-heading" className="text-lg font-semibold text-ink">
        {t('commsPrefs.title')}
      </h2>
      <p className="mb-4 text-sm text-ink/70">{t('commsPrefs.intro')}</p>
      {isLoading && <p className="text-sm text-ink/60">{t('common.loading')}</p>}
      {isError && <p className="text-sm text-red-700">{t('commsPrefs.loadError')}</p>}
      {data && (
        <div className="space-y-5">
          <Choices
            legend={t('commsPrefs.method')}
            name="contact-method"
            value={data.preferredContactMethod}
            options={contactMethodValues.map((m) => ({
              value: m,
              label: t(`personalInfo.options.contactMethod.${m}`),
              disabled: (m === 'EMAIL' && !data.hasEmail) || (m === 'WHATSAPP' && !data.hasPhone),
              note: m === 'EMAIL' && !data.hasEmail ? t('commsPrefs.noEmail') : undefined,
            }))}
            onChange={(v) => save({ preferredContactMethod: v as CommunicationPreferences['preferredContactMethod'] })}
            disabled={update.isPending}
          />
          {data.preferredContactMethod === 'PHONE_CALL' && <p className="-mt-3 text-sm text-ink/70">{t('commsPrefs.phoneCallHint')}</p>}
          {isClient && (
            <Choices
              legend={t('commsPrefs.time')}
              name="contact-time"
              value={data.preferredContactTime}
              options={contactTimeValues.map((v) => ({ value: v, label: t(`patientIntake.options.contactTime.${v}`) }))}
              onChange={(v) => save({ preferredContactTime: v as CommunicationPreferences['preferredContactTime'] })}
              disabled={update.isPending}
            />
          )}
          <Switch
            label={t('commsPrefs.push')}
            help={t('commsPrefs.pushHelp')}
            checked={data.pushEnabled}
            disabled={update.isPending}
            onChange={(v) => save({ pushEnabled: v })}
          />
          <Switch
            label={t('commsPrefs.reminders')}
            help={t('commsPrefs.remindersHelp')}
            checked={data.reminderMessagesEnabled}
            disabled={update.isPending}
            onChange={(v) => save({ reminderMessagesEnabled: v })}
          />
          <p className="text-sm text-ink/70">{t('commsPrefs.alwaysSent')}</p>
          <p aria-live="polite" className="text-sm">
            {error ? <span className="text-red-700">{error}</span> : update.isSuccess ? <span className="text-green-700">{t('commsPrefs.saved')}</span> : null}
          </p>
        </div>
      )}
    </section>
  );
}

function Choices({
  legend,
  name,
  value,
  options,
  onChange,
  disabled,
}: {
  legend: string;
  name: string;
  value: string | null;
  options: { value: string; label: string; disabled?: boolean; note?: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-4 text-base ${value === o.value ? 'border-brand bg-brand/10 font-semibold text-ink' : 'border-border text-ink'} ${o.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={disabled || o.disabled}
              onChange={() => onChange(o.value)}
              className="h-5 w-5"
            />
            {o.label}
            {o.note && <span className="text-xs font-normal text-ink/60">({o.note})</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Switch({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-base font-semibold text-ink">{label}</span>
        <span className="block text-sm text-ink/70">{help}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-6 w-6 shrink-0"
      />
    </label>
  );
}
