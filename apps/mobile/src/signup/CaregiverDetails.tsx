import { View } from 'react-native';
import { addDays, colomboToday, isPhoneNumber } from '@care-platform/shared';
import { useTranslation } from '@/i18n';
import { useCities, useDistricts } from '@/search/api';
import { Chips, SelectField } from '@/ui/choices';
import { DateField } from '@/ui/Calendar';
import { Field } from '@/ui/controls';

/**
 * Registering a caregiver, step 2: what every caregiver sign-up asks
 * (apps/api CreateCaregiverDto's required fields), with one phone number -
 * none at all after WhatsApp, which has just verified it. The rest of the
 * profile (NIC, skills, documents) is filled in later from the caregiver's
 * own screens.
 */

const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
const CIVIL_STATUSES = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER'] as const;

export interface CaregiverForm {
  fullName: string;
  phone: string;
  permanentAddress: string;
  dateOfBirth: string | null;
  gender: (typeof GENDERS)[number] | null;
  civilStatus: (typeof CIVIL_STATUSES)[number] | null;
  emergencyContactName: string;
  emergencyContactNumber: string;
  emergencyContactRelationship: string;
  districtId: number | null;
  cityId: number | null;
}

export const startCaregiverForm = (name?: string | null): CaregiverForm => ({
  fullName: name ?? '',
  phone: '',
  permanentAddress: '',
  dateOfBirth: null,
  gender: null,
  civilStatus: null,
  emergencyContactName: '',
  emergencyContactNumber: '',
  emergencyContactRelationship: '',
  districtId: null,
  cityId: null,
});

type Field = keyof CaregiverForm;

/** What is wrong, as i18n keys - the website's wording (personalInfo.validation). */
export function caregiverProblems(f: CaregiverForm, askPhone: boolean): Partial<Record<Field, string>> {
  const v = (field: string, kind: 'required' | 'invalid') => `personalInfo.validation.${field}.${kind}`;
  const p: Partial<Record<Field, string>> = {};
  if (!f.fullName.trim()) p.fullName = v('fullName', 'required');
  else if (f.fullName.trim().length < 2) p.fullName = v('fullName', 'invalid');
  if (askPhone && !isPhoneNumber(f.phone)) p.phone = 'signup.errors.phone';
  if (!f.permanentAddress.trim()) p.permanentAddress = v('permanentAddress', 'required');
  else if (f.permanentAddress.trim().length < 5) p.permanentAddress = v('permanentAddress', 'invalid');
  if (!f.dateOfBirth) p.dateOfBirth = v('dateOfBirth', 'required');
  if (!f.gender) p.gender = v('gender', 'required');
  if (!f.civilStatus) p.civilStatus = v('civilStatus', 'required');
  if (!f.emergencyContactName.trim()) p.emergencyContactName = v('emergencyContactName', 'required');
  else if (f.emergencyContactName.trim().length < 2) p.emergencyContactName = v('emergencyContactName', 'invalid');
  if (!f.emergencyContactNumber.trim()) p.emergencyContactNumber = v('emergencyContactNumber', 'required');
  else if (!isPhoneNumber(f.emergencyContactNumber)) p.emergencyContactNumber = v('emergencyContactNumber', 'invalid');
  if (!f.emergencyContactRelationship.trim()) p.emergencyContactRelationship = v('emergencyContactRelationship', 'required');
  else if (f.emergencyContactRelationship.trim().length < 2) p.emergencyContactRelationship = v('emergencyContactRelationship', 'invalid');
  if (!f.districtId) p.districtId = v('district', 'required');
  if (!f.cityId) p.cityId = v('city', 'required');
  return p;
}

/** The details half of POST /auth/signup/caregiver. */
export function caregiverPayload(f: CaregiverForm, askPhone: boolean) {
  return {
    fullName: f.fullName.trim(),
    ...(askPhone ? { phone: f.phone.trim() } : {}),
    permanentAddress: f.permanentAddress.trim(),
    dateOfBirth: f.dateOfBirth,
    gender: f.gender,
    civilStatus: f.civilStatus,
    emergencyContactName: f.emergencyContactName.trim(),
    emergencyContactNumber: f.emergencyContactNumber.trim(),
    emergencyContactRelationship: f.emergencyContactRelationship.trim(),
    districtId: f.districtId,
    cityId: f.cityId,
  };
}

export function CaregiverDetails({
  form,
  setForm,
  askPhone,
  problems,
}: {
  form: CaregiverForm;
  setForm: (update: (f: CaregiverForm) => CaregiverForm) => void;
  askPhone: boolean;
  problems: Partial<Record<Field, string>> | null;
}) {
  const { t, locale } = useTranslation();
  const districts = useDistricts(locale);
  const cities = useCities(form.districtId, locale);
  const set = <K extends Field>(field: K, value: CaregiverForm[K]) => setForm((f) => ({ ...f, [field]: value }));
  const err = (field: Field) => (problems?.[field] ? t(problems[field]!) : null);
  const today = colomboToday();
  // Caregivers are adults: the calendar starts 18 years back and goes back to 1940.
  const latestBirth = addDays(today, -Math.round(18 * 365.25));

  return (
    <View style={{ gap: 18 }}>
      <Field label={t('personalInfo.fields.fullName')} value={form.fullName} onChangeText={(v) => set('fullName', v)} autoComplete="name" textContentType="name" error={err('fullName')} />
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
      <DateField label={t('personalInfo.fields.dateOfBirth')} value={form.dateOfBirth} onChange={(d) => set('dateOfBirth', d)} today={today} min="1940-01-01" max={latestBirth} error={err('dateOfBirth')} />
      <Chips
        label={t('personalInfo.fields.gender')}
        choices={GENDERS.map((g) => ({ value: g, label: t(`personalInfo.options.gender.${g}`) }))}
        selected={form.gender ? [form.gender] : []}
        onToggle={(g) => set('gender', g)}
        error={err('gender')}
      />
      <Chips
        label={t('personalInfo.fields.civilStatus')}
        choices={CIVIL_STATUSES.map((c) => ({ value: c, label: t(`personalInfo.options.civilStatus.${c}`) }))}
        selected={form.civilStatus ? [form.civilStatus] : []}
        onToggle={(c) => set('civilStatus', c)}
        error={err('civilStatus')}
      />
      <Field label={t('personalInfo.fields.permanentAddress')} value={form.permanentAddress} onChangeText={(v) => set('permanentAddress', v)} multiline autoComplete="street-address" error={err('permanentAddress')} />
      <SelectField
        label={t('personalInfo.fields.district')}
        choices={(districts.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
        value={form.districtId}
        onChange={(v) => setForm((f) => ({ ...f, districtId: v, cityId: v === f.districtId ? f.cityId : null }))}
        error={err('districtId')}
      />
      <SelectField
        label={t('personalInfo.fields.city')}
        choices={(cities.data ?? []).map((c) => ({ value: c.id, label: c.subName ? `${c.name} (${c.subName})` : c.name }))}
        value={form.cityId}
        onChange={(v) => set('cityId', v)}
        disabled={form.districtId === null}
        error={err('cityId')}
      />
      <Field label={t('personalInfo.fields.emergencyContactName')} value={form.emergencyContactName} onChangeText={(v) => set('emergencyContactName', v)} error={err('emergencyContactName')} />
      <Field
        label={t('personalInfo.fields.emergencyContactNumber')}
        value={form.emergencyContactNumber}
        onChangeText={(v) => set('emergencyContactNumber', v)}
        keyboardType="phone-pad"
        error={err('emergencyContactNumber')}
      />
      <Field
        label={t('personalInfo.fields.emergencyContactRelationship')}
        value={form.emergencyContactRelationship}
        onChangeText={(v) => set('emergencyContactRelationship', v)}
        error={err('emergencyContactRelationship')}
      />
    </View>
  );
}
