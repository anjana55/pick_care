import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { CARE_LOCATIONS_MAX, CARE_LOCATION_LABEL_MAX, type CareLocation, type GeoPoint } from '@care-platform/shared';
import { ApiError } from '@/api';
import { useAuth } from '@/auth/AuthProvider';
import { useTranslation } from '@/i18n';
import { useColors } from '@/theme';
import { Button, Field, FormError } from '@/ui/controls';
import { PageHeader } from '@/ui/PageHeader';
import { Text } from '@/ui/Text';
import { phonePosition, type Position } from '@/caregiver/position';
import { PinMap } from '@/places/PinMap';
import { useMyPlaces, useRemovePlace, useSavePlace } from '@/places/api';

type Editing = { id?: string; start: GeoPoint | null; point: GeoPoint | null; zoomedIn: boolean; label: string; goTo: GeoPoint | null };

/**
 * "Where care happens", as on the website: the client puts a pin on the home
 * (and any other house they have care at). The caregiver's check-in is
 * compared with it; caregivers never see it. Made for people who don't use
 * maps much: "Use where I am" when they are at the house, otherwise move the
 * map until the pin sits on it - one finger, nothing small to grab.
 */
export default function CarePlacesScreen({ locate = phonePosition }: { locate?: () => Promise<Position> }) {
  const { t } = useTranslation();
  const colors = useColors();
  const { user } = useAuth();
  const places = useMyPlaces();
  const save = useSavePlace();
  const remove = useRemovePlace();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!user || user.role !== 'PATIENT_GUARDIAN') return <Redirect href="/" />;
  const error = save.error instanceof ApiError && save.error.message ? save.error.message : save.error || remove.error ? t('places.saveError') : null;

  const edit = (p?: CareLocation) => {
    save.reset();
    setNotice(null);
    setEditing(p ? { id: p.id, start: p, point: p, zoomedIn: true, label: p.label, goTo: null } : { start: null, point: null, zoomedIn: false, label: '', goTo: null });
  };
  const here = async () => {
    if (!editing) return;
    setLocating(true);
    setNotice(null);
    const p = await locate();
    setLocating(false);
    if (p.latitude === undefined || p.longitude === undefined) return setNotice(t('places.noLocation'));
    const point = { latitude: p.latitude, longitude: p.longitude };
    setEditing({ ...editing, point, zoomedIn: true, goTo: point });
  };
  const submit = () => {
    if (!editing?.point) return;
    save.mutate({ id: editing.id, ...editing.point, label: editing.label.trim() || undefined }, { onSuccess: () => setEditing(null) });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title={t('places.title')} subtitle={t('places.intro')} />
      <ScrollView contentContainerStyle={styles.page}>
        {editing ? (
          <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>{editing.id ? t('places.moveTitle') : t('places.addTitle')}</Text>
            <Text style={{ fontSize: 15, lineHeight: 22, color: colors.muted }}>{t('places.howTo')}</Text>
            <Button variant="secondary" label={locating ? t('common.loading') : t('places.useWhereIAm')} busy={locating} onPress={() => void here()} />
            <PinMap start={editing.start} goTo={editing.goTo} onMove={(point, zoomedIn) => setEditing((e) => (e ? { ...e, point, zoomedIn } : e))} />
            {editing.point && !editing.zoomedIn ? <Text style={{ fontSize: 14, color: colors.danger }}>{t('places.zoomIn')}</Text> : null}
            <Field label={t('places.label')} value={editing.label} placeholder={t('places.labelPlaceholder')} maxLength={CARE_LOCATION_LABEL_MAX} onChangeText={(label) => setEditing({ ...editing, label })} />
            <FormError message={notice ?? error} />
            <Button label={t('places.save')} busy={save.isPending} disabled={!editing.point || !editing.zoomedIn} onPress={submit} />
            <Button variant="secondary" label={t('common.cancel')} onPress={() => setEditing(null)} />
          </View>
        ) : null}

        {!editing && places.data && places.data.length === 0 ? (
          <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 15, lineHeight: 22, color: colors.ink }}>{t('places.empty')}</Text>
            <Button label={t('places.addFirst')} onPress={() => edit()} />
          </View>
        ) : null}

        {!editing
          ? (places.data ?? []).map((p) => (
              <View key={p.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>{p.label}</Text>
                {p.isDefault ? <Text style={{ fontSize: 14, color: colors.brand }}>{t('places.default')}</Text> : null}
                <PinMap start={p} height={160} />
                <Button variant="secondary" label={t('places.move')} onPress={() => edit(p)} />
                {!p.isDefault ? <Button variant="secondary" label={t('places.makeDefault')} onPress={() => save.mutate({ id: p.id, isDefault: true })} /> : null}
                <Button
                  variant="link"
                  label={t('places.remove')}
                  onPress={() =>
                    Alert.alert(t('places.removeConfirm', { name: p.label }), undefined, [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('places.remove'), style: 'destructive', onPress: () => remove.mutate(p.id) },
                    ])
                  }
                />
              </View>
            ))
          : null}

        {!editing && places.data && places.data.length > 0 && places.data.length < CARE_LOCATIONS_MAX ? (
          <Button variant="secondary" label={t('places.addAnother')} onPress={() => edit()} />
        ) : null}
        {!editing ? <FormError message={error} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
});
