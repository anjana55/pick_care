'use client';

import { useMemo } from 'react';
import { isPhoneNumber } from '@care-platform/shared';
import { useTranslation } from '@/lib/i18n/provider';
import { useCities, useLocationTree } from '@/lib/hooks/use-caregivers';
import { Input, Label, RequiredLegend, Select, Textarea } from '@/components/ui/input';
import type { PhoneClientInput } from '@/lib/api/types';

const RELATIONSHIPS = ['PARENT', 'SPOUSE', 'CHILD', 'SIBLING', 'OTHER_RELATIVE', 'FRIEND', 'OTHER'] as const;
const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
const METHODS = ['PHONE_CALL', 'WHATSAPP', 'EMAIL'] as const;
const TIMES = ['ANYTIME', 'MORNING', 'AFTERNOON', 'EVENING'] as const;
const SCHEDULES = ['DAY', 'NIGHT', 'LIVE_IN_24H', 'NOT_SURE'] as const;
const STARTS = ['IMMEDIATELY', 'WITHIN_WEEK', 'WITHIN_MONTH', 'JUST_EXPLORING'] as const;
const CAREGIVER_GENDERS = ['NO_PREFERENCE', 'MALE', 'FEMALE'] as const;

/** The form state for a client staff add themselves (phone caller, walk-in). */
export type NewClientDraft = {
  fullName: string;
  phone: string;
  email: string;
  registrantType: 'SELF' | 'GUARDIAN';
  recipientName: string;
  recipientRelationship: string;
  recipientAge: string;
  recipientGender: string;
  alternatePhone: string;
  preferredContactMethod: string;
  preferredContactTime: string;
  districtId: string;
  cityId: string;
  careAddress: string;
  careNeeds: string;
  careSchedule: string;
  careStart: string;
  preferredCaregiverGender: string;
  consentConfirmed: boolean;
};

export const EMPTY_NEW_CLIENT: NewClientDraft = {
  fullName: '',
  phone: '',
  email: '',
  registrantType: 'GUARDIAN',
  recipientName: '',
  recipientRelationship: '',
  recipientAge: '',
  recipientGender: '',
  alternatePhone: '',
  preferredContactMethod: 'PHONE_CALL',
  preferredContactTime: 'ANYTIME',
  districtId: '',
  cityId: '',
  careAddress: '',
  careNeeds: '',
  careSchedule: '',
  careStart: '',
  preferredCaregiverGender: 'NO_PREFERENCE',
  consentConfirmed: false,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What the form still needs before it can be sent, so the button can say so.
 * Mirrors PhoneClientDto / PatientProfileDto on the API: phone is mandatory,
 * email is optional (checked only when typed), the care description optional.
 */
export function missingNewClientFields(c: NewClientDraft): string[] {
  const missing: string[] = [];
  if (c.fullName.trim().length < 2) missing.push('fullName');
  if (!isPhoneNumber(c.phone)) missing.push('phone');
  if (c.email.trim() && !EMAIL_RE.test(c.email.trim())) missing.push('email');
  if (c.alternatePhone.trim() && !isPhoneNumber(c.alternatePhone)) missing.push('alternatePhone');
  if (c.registrantType === 'GUARDIAN') {
    if (c.recipientName.trim().length < 2) missing.push('recipientName');
    if (!c.recipientRelationship) missing.push('recipientRelationship');
  }
  if (c.recipientAge === '') missing.push('recipientAge');
  if (!c.recipientGender) missing.push('recipientGender');
  if (!c.districtId || !c.cityId) missing.push('location');
  if (!c.careSchedule) missing.push('careSchedule');
  if (!c.careStart) missing.push('careStart');
  if (!c.consentConfirmed) missing.push('consent');
  return missing;
}

export function toPhoneClientInput(c: NewClientDraft): PhoneClientInput {
  const guardian = c.registrantType === 'GUARDIAN';
  const opt = (v: string) => v.trim() || undefined;
  const email = opt(c.email);
  return {
    fullName: c.fullName.trim(),
    phone: c.phone.trim(),
    email,
    consentConfirmed: c.consentConfirmed,
    registrantType: c.registrantType,
    recipientName: guardian ? c.recipientName.trim() : undefined,
    recipientRelationship: guardian ? c.recipientRelationship : undefined,
    recipientAge: Number(c.recipientAge),
    recipientGender: c.recipientGender,
    alternatePhone: opt(c.alternatePhone),
    // An email preference needs an address: fall back if the email was cleared after picking it.
    preferredContactMethod: c.preferredContactMethod === 'EMAIL' && !email ? 'PHONE_CALL' : c.preferredContactMethod,
    preferredContactTime: c.preferredContactTime,
    districtId: Number(c.districtId),
    cityId: Number(c.cityId),
    careAddress: opt(c.careAddress),
    careNeeds: opt(c.careNeeds),
    careSchedule: c.careSchedule,
    careStart: c.careStart,
    preferredCaregiverGender: c.preferredCaregiverGender,
  };
}

/**
 * The details of a client staff add themselves: who they are and how to reach
 * them, who needs care, and where and when. Used by "Add new client"
 * (/clients/new) and for a first-time caller on a phone request
 * (/requests/new). `audience` only changes the wording of the name and
 * consent lines - "caller" on a phone request, "client" elsewhere.
 */
export function NewClientFields({
  value,
  onChange,
  audience = 'client',
}: {
  value: NewClientDraft;
  onChange: (next: NewClientDraft) => void;
  audience?: 'caller' | 'client';
}) {
  const { t, locale } = useTranslation();
  const caller = value;

  const { data: tree } = useLocationTree(locale);
  const districts = useMemo(() => (tree ?? []).flatMap((p) => p.districts).sort((a, b) => a.name.localeCompare(b.name, locale)), [tree, locale]);
  const { data: cities = [] } = useCities(caller.districtId ? Number(caller.districtId) : null, locale);

  const set = <K extends keyof NewClientDraft>(key: K, v: NewClientDraft[K]) => onChange({ ...caller, [key]: v });
  const opt = (group: string, v: string) => t(`clients.options.${group}.${v}`);
  const wording = audience === 'caller' ? 'requests.new' : 'clients.new';
  const hasEmail = Boolean(caller.email.trim());

  return (
    <div className="space-y-5">
      <RequiredLegend label={t('common.requiredField')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="fullName" required>
            {t(`${wording}.fullName`)}
          </Label>
          <Input id="fullName" autoComplete="off" value={caller.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="phone" required>
            {t('requests.new.phone')}
          </Label>
          <Input id="phone" type="tel" autoComplete="off" placeholder="0771234567" value={caller.phone} onChange={(e) => set('phone', e.target.value)} />
          <p className="mt-1 text-xs text-ink/50">{t('requests.new.phoneHint')}</p>
        </div>
        <div>
          <Label htmlFor="email">{t('requests.new.email')}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="off"
            value={caller.email}
            onChange={(e) => {
              const email = e.target.value;
              // Clearing the email takes an email contact preference with it.
              onChange({
                ...caller,
                email,
                preferredContactMethod: !email.trim() && caller.preferredContactMethod === 'EMAIL' ? 'PHONE_CALL' : caller.preferredContactMethod,
              });
            }}
          />
          <p className="mt-1 text-xs text-ink/50">{t('clients.new.emailHint')}</p>
        </div>
        <div>
          <Label htmlFor="alternatePhone">{t('requests.new.alternatePhone')}</Label>
          <Input id="alternatePhone" type="tel" autoComplete="off" value={caller.alternatePhone} onChange={(e) => set('alternatePhone', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="preferredContactMethod" required>
            {t('requests.detail.preferredContact')}
          </Label>
          <Select id="preferredContactMethod" value={caller.preferredContactMethod} onChange={(e) => set('preferredContactMethod', e.target.value)}>
            {METHODS.filter((m) => m !== 'EMAIL' || hasEmail).map((m) => (
              <option key={m} value={m}>
                {opt('contactMethod', m)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="preferredContactTime">{t('requests.new.contactTime')}</Label>
          <Select id="preferredContactTime" value={caller.preferredContactTime} onChange={(e) => set('preferredContactTime', e.target.value)}>
            {TIMES.map((v) => (
              <option key={v} value={v}>
                {opt('contactTime', v)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <fieldset className="border-t border-border pt-4">
        <legend className="mb-2 text-sm font-semibold text-ink">{t('requests.new.whoNeedsCare')}</legend>
        <div className="mb-3 flex flex-wrap gap-4 text-sm">
          {(['GUARDIAN', 'SELF'] as const).map((v) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name="registrantType" checked={caller.registrantType === v} onChange={() => set('registrantType', v)} />
              {t(`requests.new.registrant.${v}`)}
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {caller.registrantType === 'GUARDIAN' && (
            <>
              <div>
                <Label htmlFor="recipientName" required>
                  {t('requests.new.recipientName')}
                </Label>
                <Input id="recipientName" value={caller.recipientName} onChange={(e) => set('recipientName', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="recipientRelationship" required>
                  {t('requests.new.relationship')}
                </Label>
                <Select id="recipientRelationship" value={caller.recipientRelationship} onChange={(e) => set('recipientRelationship', e.target.value)}>
                  <option value="">—</option>
                  {RELATIONSHIPS.map((v) => (
                    <option key={v} value={v}>
                      {opt('relationship', v)}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}
          <div>
            <Label htmlFor="recipientAge" required>
              {t('requests.new.age')}
            </Label>
            <Input id="recipientAge" type="number" min={0} max={120} value={caller.recipientAge} onChange={(e) => set('recipientAge', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="recipientGender" required>
              {t('requests.new.gender')}
            </Label>
            <Select id="recipientGender" value={caller.recipientGender} onChange={(e) => set('recipientGender', e.target.value)}>
              <option value="">—</option>
              {GENDERS.map((v) => (
                <option key={v} value={v}>
                  {opt('gender', v)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </fieldset>

      <fieldset className="border-t border-border pt-4">
        <legend className="mb-2 text-sm font-semibold text-ink">{t('requests.new.careTitle')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="districtId" required>
              {t('personalInfo.fields.district')}
            </Label>
            <Select id="districtId" value={caller.districtId} onChange={(e) => onChange({ ...caller, districtId: e.target.value, cityId: '' })}>
              <option value="">—</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="cityId" required>
              {t('requests.new.city')}
            </Label>
            <Select id="cityId" value={caller.cityId} disabled={!caller.districtId} onChange={(e) => set('cityId', e.target.value)}>
              <option value="">—</option>
              {[...cities]
                .sort((a, b) => a.name.localeCompare(b.name, locale))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="careAddress">{t('requests.detail.careAddress')}</Label>
            <Input id="careAddress" value={caller.careAddress} onChange={(e) => set('careAddress', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="careNeeds">{t('requests.detail.careNeeds')}</Label>
            <Textarea id="careNeeds" rows={3} maxLength={1000} value={caller.careNeeds} onChange={(e) => set('careNeeds', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="careSchedule" required>
              {t('requests.detail.schedule')}
            </Label>
            <Select id="careSchedule" value={caller.careSchedule} onChange={(e) => set('careSchedule', e.target.value)}>
              <option value="">—</option>
              {SCHEDULES.map((v) => (
                <option key={v} value={v}>
                  {opt('careSchedule', v)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="careStart" required>
              {t('requests.new.start')}
            </Label>
            <Select id="careStart" value={caller.careStart} onChange={(e) => set('careStart', e.target.value)}>
              <option value="">—</option>
              {STARTS.map((v) => (
                <option key={v} value={v}>
                  {opt('careStart', v)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="preferredCaregiverGender">{t('requests.detail.genderPreference')}</Label>
            <Select id="preferredCaregiverGender" value={caller.preferredCaregiverGender} onChange={(e) => set('preferredCaregiverGender', e.target.value)}>
              {CAREGIVER_GENDERS.map((v) => (
                <option key={v} value={v}>
                  {opt('caregiverGender', v)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </fieldset>

      <label className="flex items-start gap-3 rounded border border-border bg-paper p-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={caller.consentConfirmed} onChange={(e) => set('consentConfirmed', e.target.checked)} />
        <span>
          <span className="font-medium text-ink">{t(`${wording}.consent`)}</span>
          <span className="block text-xs text-ink/60">{t(`${wording}.consentHint`)}</span>
        </span>
      </label>
    </div>
  );
}
