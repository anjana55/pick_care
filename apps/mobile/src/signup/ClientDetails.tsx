import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { intakeFromSearch, isPhoneNumber, type IntakeFromSearch } from '@care-platform/shared';
import { lastSearchContext } from '@/care/last-search';
import { useTranslation } from '@/i18n';
import { useCities, useDistricts, useSkills } from '@/search/api';
import { useColors } from '@/theme';
import { Chips, SelectField } from '@/ui/choices';
import { Button, Field } from '@/ui/controls';
import { Text } from '@/ui/Text';
import { Card } from '@/ui/visual';

/**
 * Registering a client, step 2: who needs care, how to reach them, where and
 * what care - the same intake the website asks (apps/public-web
 * patient-intake.ts), without anything the sign-in or the last search
 * already settled. Answers the search gave are listed in one card, with one
 * "Edit" to change them; the description of the care is optional.
 */

const REGISTRANT_TYPES = ['SELF', 'GUARDIAN'] as const;
const RELATIONSHIPS = ['PARENT', 'SPOUSE', 'CHILD', 'SIBLING', 'OTHER_RELATIVE', 'FRIEND', 'OTHER'] as const;
const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
const CONTACT_METHODS = ['PHONE_CALL', 'WHATSAPP', 'EMAIL'] as const;
const CONTACT_TIMES = ['ANYTIME', 'MORNING', 'AFTERNOON', 'EVENING'] as const;
const CARE_SCHEDULES = ['DAY', 'NIGHT', 'LIVE_IN_24H', 'NOT_SURE'] as const;
const CARE_STARTS = ['IMMEDIATELY', 'WITHIN_WEEK', 'WITHIN_MONTH', 'JUST_EXPLORING'] as const;
const CAREGIVER_GENDERS = ['NO_PREFERENCE', 'MALE', 'FEMALE'] as const;

export interface ClientForm {
  fullName: string;
  phone: string;
  registrantType: (typeof REGISTRANT_TYPES)[number] | null;
  recipientName: string;
  recipientRelationship: (typeof RELATIONSHIPS)[number] | null;
  recipientAge: string;
  recipientGender: (typeof GENDERS)[number] | null;
  preferredContactMethod: (typeof CONTACT_METHODS)[number];
  preferredContactTime: (typeof CONTACT_TIMES)[number];
  districtId: number | null;
  cityId: number | null;
  careAddress: string;
  careNeeds: string;
  careSchedule: (typeof CARE_SCHEDULES)[number] | null;
  careStart: (typeof CARE_STARTS)[number] | null;
  preferredCaregiverGender: (typeof CAREGIVER_GENDERS)[number];
}

type Problem = keyof ClientForm;

/** What is wrong, field by field, as i18n keys. `askPhone`: false after WhatsApp. */
export function clientProblems(f: ClientForm, askPhone: boolean): Partial<Record<Problem, string>> {
  const p: Partial<Record<Problem, string>> = {};
  if (f.fullName.trim().length < 2) p.fullName = 'signup.errors.fullName';
  if (askPhone && !isPhoneNumber(f.phone)) p.phone = 'signup.errors.phone';
  if (!f.registrantType) p.registrantType = 'patientIntake.validation.registrantType';
  if (f.registrantType === 'GUARDIAN') {
    if (f.recipientName.trim().length < 2) p.recipientName = 'patientIntake.validation.recipientName';
    if (!f.recipientRelationship) p.recipientRelationship = 'patientIntake.validation.relationship';
  }
  const age = Number(f.recipientAge);
  if (!f.recipientAge.trim()) p.recipientAge = 'patientIntake.validation.age.required';
  else if (!Number.isInteger(age) || age < 0 || age > 120) p.recipientAge = 'patientIntake.validation.age.invalid';
  if (!f.recipientGender) p.recipientGender = 'patientIntake.validation.recipientGender';
  if (!f.districtId) p.districtId = 'patientIntake.validation.district';
  if (!f.cityId) p.cityId = 'patientIntake.validation.city';
  if (!f.careSchedule) p.careSchedule = 'patientIntake.validation.careSchedule';
  if (!f.careStart) p.careStart = 'patientIntake.validation.careStart';
  return p;
}

/** The intake half of POST /auth/signup/client. */
export function clientPayload(f: ClientForm, askPhone: boolean) {
  const guardian = f.registrantType === 'GUARDIAN';
  return {
    fullName: f.fullName.trim(),
    ...(askPhone ? { phone: f.phone.trim() } : {}),
    registrantType: f.registrantType,
    ...(guardian ? { recipientName: f.recipientName.trim(), recipientRelationship: f.recipientRelationship } : {}),
    recipientAge: Number(f.recipientAge),
    recipientGender: f.recipientGender,
    preferredContactMethod: f.preferredContactMethod,
    preferredContactTime: f.preferredContactTime,
    districtId: f.districtId,
    cityId: f.cityId,
    ...(f.careAddress.trim() ? { careAddress: f.careAddress.trim() } : {}),
    ...(f.careNeeds.trim() ? { careNeeds: f.careNeeds.trim() } : {}),
    careSchedule: f.careSchedule,
    careStart: f.careStart,
    preferredCaregiverGender: f.preferredCaregiverGender,
  };
}

/** A fresh form, started from the sign-in (name, contact channel) and the last search. */
export function startClientForm(opts: { name?: string | null; whatsapp: boolean; fromSearch: IntakeFromSearch }): ClientForm {
  const s = opts.fromSearch;
  return {
    fullName: opts.name ?? '',
    phone: '',
    registrantType: null,
    recipientName: '',
    recipientRelationship: null,
    recipientAge: s.recipientAge !== undefined ? String(s.recipientAge) : '',
    recipientGender: s.recipientGender ?? null,
    preferredContactMethod: opts.whatsapp ? 'WHATSAPP' : 'PHONE_CALL',
    preferredContactTime: 'ANYTIME',
    districtId: s.districtId ?? null,
    cityId: s.cityId ?? null,
    careAddress: '',
    careNeeds: s.careNeeds ?? '',
    careSchedule: s.careSchedule ?? null,
    careStart: s.careStart ?? null,
    preferredCaregiverGender: s.preferredCaregiverGender ?? 'NO_PREFERENCE',
  };
}

/** The last search, read into intake answers (with the picked skills by name, as staff need them). */
export function useIntakeFromLastSearch(): IntakeFromSearch {
  const { t, locale } = useTranslation();
  const skills = useSkills(locale);
  return useMemo(() => {
    const context = lastSearchContext();
    if (!context) return {};
    const ids = [...(context.request.mandatorySkillIds ?? []), ...(context.request.optionalSkillIds ?? [])];
    const names = ids.map((id) => skills.data?.find((s) => s.id === id)?.name).filter((n): n is string => Boolean(n));
    return intakeFromSearch(
      { ...context, ...(names.length ? { skillNames: names } : {}) },
      { help: (list) => t('careIntent.needs.help', { list }), conditions: (list) => t('careIntent.needs.conditions', { list }) },
    );
  }, [skills.data, t]);
}

export function ClientDetails({
  form,
  setForm,
  askPhone,
  hasEmail,
  answered,
  problems,
}: {
  form: ClientForm;
  setForm: (update: (f: ClientForm) => ClientForm) => void;
  askPhone: boolean;
  hasEmail: boolean;
  /** Questions the search answered: listed in a card instead of asked. */
  answered: ReadonlySet<keyof IntakeFromSearch>;
  problems: Partial<Record<Problem, string>> | null;
}) {
  const { t, locale } = useTranslation();
  const colors = useColors();
  const [editing, setEditing] = useState(false);
  const districts = useDistricts(locale);
  const cities = useCities(form.districtId, locale);
  const set = <K extends keyof ClientForm>(field: K, value: ClientForm[K]) => setForm((f) => ({ ...f, [field]: value }));
  const err = (field: Problem) => (problems?.[field] ? t(problems[field]!) : null);
  // A question is asked unless the search answered it - or they chose to edit those answers.
  const ask = (field: keyof IntakeFromSearch) => editing || !answered.has(field) || Boolean(problems?.[field as Problem]);
  const guardian = form.registrantType === 'GUARDIAN';
  const options = <V extends string>(group: string, values: readonly V[]) => values.map((v) => ({ value: v, label: t(`patientIntake.options.${group}.${v}`) }));

  const summary = [
    !ask('recipientAge') || !ask('recipientGender')
      ? [
          form.recipientAge && t('careIntent.summary.age', { age: form.recipientAge }),
          form.recipientGender && t(`patientIntake.options.gender.${form.recipientGender}`),
        ]
          .filter(Boolean)
          .join(' · ')
      : null,
    !ask('cityId')
      ? [cities.data?.find((c) => c.id === form.cityId)?.name, districts.data?.find((d) => d.id === form.districtId)?.name].filter(Boolean).join(', ')
      : null,
    !ask('careSchedule') || !ask('careStart')
      ? [
          form.careSchedule && t(`patientIntake.options.careSchedule.${form.careSchedule}`),
          form.careStart && t(`patientIntake.options.careStart.${form.careStart}`),
        ]
          .filter(Boolean)
          .join(' · ')
      : null,
    !ask('preferredCaregiverGender') && form.preferredCaregiverGender !== 'NO_PREFERENCE'
      ? t('careIntent.summary.caregiverGender', { gender: t(`patientIntake.options.caregiverGender.${form.preferredCaregiverGender}`) })
      : null,
    !ask('careNeeds') ? form.careNeeds : null,
  ].filter((l): l is string => Boolean(l));

  return (
    <View style={{ gap: 18 }}>
      <Field
        label={t('signup.fullName')}
        value={form.fullName}
        onChangeText={(v) => set('fullName', v)}
        autoComplete="name"
        textContentType="name"
        error={err('fullName')}
      />
      {askPhone ? (
        <Field
          label={t('signup.phone')}
          hint={t('signup.phoneHint')}
          value={form.phone}
          onChangeText={(v) => set('phone', v)}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          error={err('phone')}
        />
      ) : null}

      {summary.length ? (
        <Card style={{ gap: 6 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{t('careIntent.fromSearch')}</Text>
          {summary.map((line) => (
            <Text key={line} style={{ fontSize: 15, lineHeight: 22, color: colors.ink }}>
              {line}
            </Text>
          ))}
          <Button variant="link" label={t('careIntent.edit')} onPress={() => setEditing(true)} />
        </Card>
      ) : null}

      <Chips
        label={t('patientIntake.sections.whoNeedsCare')}
        layout="tiles"
        choices={REGISTRANT_TYPES.map((v) => ({
          value: v,
          label: t(`patientIntake.options.registrantType.${v}`),
          icon: v === 'SELF' ? 'person-outline' : 'people-outline',
        }))}
        selected={form.registrantType ? [form.registrantType] : []}
        onToggle={(v) => set('registrantType', v)}
        error={err('registrantType')}
      />
      {guardian ? (
        <>
          <Field
            label={t('patientIntake.fields.recipientName')}
            value={form.recipientName}
            onChangeText={(v) => set('recipientName', v)}
            error={err('recipientName')}
          />
          <Chips
            label={t('patientIntake.fields.relationship')}
            choices={options('relationship', RELATIONSHIPS)}
            selected={form.recipientRelationship ? [form.recipientRelationship] : []}
            onToggle={(v) => set('recipientRelationship', v)}
            error={err('recipientRelationship')}
          />
        </>
      ) : null}
      {ask('recipientAge') ? (
        <Field
          label={t(guardian ? 'patientIntake.fields.recipientAge' : 'patientIntake.fields.yourAge')}
          value={form.recipientAge}
          onChangeText={(v) => set('recipientAge', v.replace(/\D/g, '').slice(0, 3))}
          keyboardType="number-pad"
          error={err('recipientAge')}
        />
      ) : null}
      {ask('recipientGender') ? (
        <Chips
          label={t(guardian ? 'patientIntake.fields.recipientGender' : 'patientIntake.fields.yourGender')}
          choices={options('gender', GENDERS)}
          selected={form.recipientGender ? [form.recipientGender] : []}
          onToggle={(v) => set('recipientGender', v)}
          error={err('recipientGender')}
        />
      ) : null}

      {ask('districtId') || ask('cityId') ? (
        <>
          <SelectField
            label={t('patientIntake.fields.district')}
            choices={(districts.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
            value={form.districtId}
            onChange={(v) => setForm((f) => ({ ...f, districtId: v, cityId: v === f.districtId ? f.cityId : null }))}
            error={err('districtId')}
          />
          <SelectField
            label={t('patientIntake.fields.city')}
            choices={(cities.data ?? []).map((c) => ({ value: c.id, label: c.subName ? `${c.name} (${c.subName})` : c.name }))}
            value={form.cityId}
            onChange={(v) => set('cityId', v)}
            disabled={form.districtId === null}
            error={err('cityId')}
          />
        </>
      ) : null}
      <Field
        label={t('patientIntake.fields.careAddress')}
        value={form.careAddress}
        onChangeText={(v) => set('careAddress', v)}
        multiline
        autoComplete="street-address"
      />

      {ask('careSchedule') ? (
        <Chips
          label={t('patientIntake.fields.careSchedule')}
          choices={options('careSchedule', CARE_SCHEDULES)}
          selected={form.careSchedule ? [form.careSchedule] : []}
          onToggle={(v) => set('careSchedule', v)}
          error={err('careSchedule')}
        />
      ) : null}
      {ask('careStart') ? (
        <Chips
          label={t('patientIntake.fields.careStart')}
          choices={options('careStart', CARE_STARTS)}
          selected={form.careStart ? [form.careStart] : []}
          onToggle={(v) => set('careStart', v)}
          error={err('careStart')}
        />
      ) : null}
      {ask('preferredCaregiverGender') ? (
        <Chips
          label={t('patientIntake.fields.caregiverGender')}
          choices={options('caregiverGender', CAREGIVER_GENDERS)}
          selected={[form.preferredCaregiverGender]}
          onToggle={(v) => set('preferredCaregiverGender', v)}
        />
      ) : null}
      {ask('careNeeds') ? (
        <Field
          label={t('patientIntake.fields.careNeeds')}
          placeholder={t('patientIntake.careNeedsPlaceholder')}
          value={form.careNeeds}
          onChangeText={(v) => set('careNeeds', v.slice(0, 1000))}
          multiline
        />
      ) : null}

      <Chips
        label={t('patientIntake.fields.contactMethod')}
        choices={options('contactMethod', hasEmail ? CONTACT_METHODS : CONTACT_METHODS.filter((m) => m !== 'EMAIL'))}
        selected={[form.preferredContactMethod]}
        onToggle={(v) => set('preferredContactMethod', v)}
      />
      <Chips
        label={t('patientIntake.fields.contactTime')}
        choices={options('contactTime', CONTACT_TIMES)}
        selected={[form.preferredContactTime]}
        onToggle={(v) => set('preferredContactTime', v)}
      />
    </View>
  );
}
