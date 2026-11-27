'use client';

import { useEffect, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { contactMethodValues, contactTimeValues, type CommunicationPreferences, type UpdateCommunicationPreferences } from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n/provider';
import { ApiError } from '@/lib/api/client';
import { useCommunicationPreferences, useUpdateCommunicationPreferences, type PreferencesSubject } from '@/lib/hooks/use-communication-preferences';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label, Select } from '@/components/ui/input';

/**
 * "Communication preferences" on a caregiver's and a client's details page:
 * how we reach them, whether the app pushes to them, and whether optional
 * reminders also go by WhatsApp/email. Read at a glance; Edit opens the
 * choices in place. The same settings the person changes themselves on the
 * website and in the app; every change is in the audit log.
 */
export function CommunicationPreferencesCard({ subject, canEdit }: { subject: PreferencesSubject; canEdit: boolean }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useCommunicationPreferences(subject);
  const update = useUpdateCommunicationPreferences(subject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<UpdateCommunicationPreferences>({});

  useEffect(() => {
    if (editing && data) {
      setDraft({
        preferredContactMethod: data.preferredContactMethod,
        preferredContactTime: data.preferredContactTime,
        pushEnabled: data.pushEnabled,
        reminderMessagesEnabled: data.reminderMessagesEnabled,
      });
    }
  }, [editing, data]);

  const isClient = subject.kind === 'CLIENT';
  const error = update.error ? (update.error instanceof ApiError ? update.error.message : t('common.actionFailed')) : null;

  const save = () => {
    if (!data) return;
    const changed: UpdateCommunicationPreferences = {};
    (Object.keys(draft) as (keyof UpdateCommunicationPreferences)[]).forEach((k) => {
      if (draft[k] !== data[k]) (changed as Record<string, unknown>)[k] = draft[k];
    });
    if (!Object.keys(changed).length) return setEditing(false);
    update.mutate(changed, { onSuccess: () => setEditing(false) });
  };

  const methodLabel = (m: string | null | undefined) => (m ? t(`personalInfo.options.contactMethod.${m}`) : t('commsPrefs.notSet'));
  const timeLabel = (v: string | null | undefined) => (v ? t(`clients.options.contactTime.${v}`) : t('commsPrefs.notSet'));
  const onOff = (v: boolean) => (v ? t('commsPrefs.on') : t('commsPrefs.off'));

  return (
    <Card className="mt-5">
      <CardContent className="py-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <MessageSquareText className="h-4 w-4 text-brand" aria-hidden />
            {t('commsPrefs.title')}
          </h4>
          {canEdit && data && !editing && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
              {t('common.edit')}
            </Button>
          )}
        </div>

        {isLoading && <p className="text-sm text-ink/60">{t('common.loading')}</p>}
        {isError && <p className="text-sm text-danger">{t('common.actionFailed')}</p>}

        {data && !editing && <Summary data={data} isClient={isClient} methodLabel={methodLabel} timeLabel={timeLabel} onOff={onOff} />}

        {data && editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="cp-method">{t('commsPrefs.method')}</Label>
                <Select
                  id="cp-method"
                  value={draft.preferredContactMethod ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, preferredContactMethod: (e.target.value || null) as UpdateCommunicationPreferences['preferredContactMethod'] }))
                  }
                >
                  <option value="">{t('commsPrefs.notSet')}</option>
                  {contactMethodValues.map((m) => (
                    <option key={m} value={m} disabled={(m === 'EMAIL' && !data.hasEmail) || (m === 'WHATSAPP' && !data.hasPhone)}>
                      {methodLabel(m)}
                      {m === 'EMAIL' && !data.hasEmail ? ` (${t('commsPrefs.noEmail')})` : ''}
                    </option>
                  ))}
                </Select>
                {draft.preferredContactMethod === 'PHONE_CALL' && <p className="mt-1 text-xs text-ink/60">{t('commsPrefs.phoneCallHint')}</p>}
              </div>
              {isClient && (
                <div>
                  <Label htmlFor="cp-time">{t('commsPrefs.time')}</Label>
                  <Select
                    id="cp-time"
                    value={draft.preferredContactTime ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, preferredContactTime: (e.target.value || null) as UpdateCommunicationPreferences['preferredContactTime'] }))
                    }
                  >
                    <option value="">{t('commsPrefs.notSet')}</option>
                    {contactTimeValues.map((v) => (
                      <option key={v} value={v}>
                        {timeLabel(v)}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>

            <Toggle
              label={t('commsPrefs.push')}
              help={t('commsPrefs.pushHelp')}
              checked={Boolean(draft.pushEnabled)}
              disabled={!data.hasAccount}
              onChange={(v) => setDraft((d) => ({ ...d, pushEnabled: v }))}
            />
            <Toggle
              label={t('commsPrefs.reminders')}
              help={t('commsPrefs.remindersHelp')}
              checked={Boolean(draft.reminderMessagesEnabled)}
              disabled={!data.hasAccount}
              onChange={(v) => setDraft((d) => ({ ...d, reminderMessagesEnabled: v }))}
            />
            {!data.hasAccount && <p className="text-xs text-ink/60">{t('commsPrefs.noAccount')}</p>}
            <p className="text-xs text-ink/60">{t('commsPrefs.alwaysSent')}</p>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={update.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="button" onClick={save} disabled={update.isPending}>
                {update.isPending ? t('common.loading') : t('common.save')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Summary({
  data,
  isClient,
  methodLabel,
  timeLabel,
  onOff,
}: {
  data: CommunicationPreferences;
  isClient: boolean;
  methodLabel: (m: string | null) => string;
  timeLabel: (v: string | null) => string;
  onOff: (v: boolean) => string;
}) {
  const { t } = useTranslation();
  const rows: [string, string][] = [[t('commsPrefs.method'), methodLabel(data.preferredContactMethod)]];
  if (isClient) rows.push([t('commsPrefs.time'), timeLabel(data.preferredContactTime)]);
  rows.push([t('commsPrefs.push'), `${onOff(data.pushEnabled)} · ${t('commsPrefs.devices', { count: data.appDevices })}`]);
  rows.push([t('commsPrefs.reminders'), onOff(data.reminderMessagesEnabled)]);
  return (
    <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-ink/60">{label}</dt>
          <dd className="text-sm text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Toggle({
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
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-ink/60">{help}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-brand focus:ring-brand"
      />
    </label>
  );
}
