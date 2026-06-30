import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSellerOrdersContext } from '../../context/SellerOrdersContext';
import { colors, radius, spacing, typography } from '../../theme';
import Button from '../../components/Button';
import MonoLabel from '../../components/ui/MonoLabel';
import PostaInput from '../../components/ui/PostaInput';
import { SellerStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';

type Props = NativeStackScreenProps<SellerStackParamList, 'CreateOrder'>;

export default function CreateOrderScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { createOrder } = useSellerOrdersContext();
  const isMarketplaceSeller = Boolean(user?.isMarketplaceSeller || !user?.agencyId);

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleGeocode = async () => {
    if (!token || !address.trim()) {
      Alert.alert('Dirección requerida', 'Ingresá calle y altura antes de ubicar en el mapa.');
      return;
    }
    setGeocoding(true);
    try {
      const result = await api.geocodeAddress(token, address);
      setLat(result.lat);
      setLng(result.lng);
      setAddress(result.displayName);
    } catch (err) {
      Alert.alert('Sin ubicación', err instanceof Error ? err.message : 'No se pudo geocodificar.');
    } finally {
      setGeocoding(false);
    }
  };

  const handleSubmit = async () => {
    if (!clientName.trim() || !address.trim()) {
      Alert.alert('Datos incompletos', 'Completá nombre del cliente y dirección.');
      return;
    }
    if (lat == null || lng == null) {
      Alert.alert('Ubicación pendiente', 'Usá "Ubicar en mapa" para confirmar la dirección.');
      return;
    }
    if (isMarketplaceSeller && !user?.preferredAgencyId) {
      Alert.alert(
        'Agencia requerida',
        'Elegí una agencia de logística en Configuración antes de crear envíos.'
      );
      return;
    }
    setSubmitting(true);
    try {
      const order = await createOrder({
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim() || undefined,
        address: address.trim(),
        lat,
        lng,
        notes: notes.trim() || undefined,
      });
      navigation.replace('SellerOrderDetail', { orderId: order.id });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo crear el envío.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[typography.body(13, colors.textMuted), styles.hint]}>
          {isMarketplaceSeller
            ? user?.preferredAgencyName
              ? `El envío se enviará a ${user.preferredAgencyName}.`
              : 'Elegí una agencia en Configuración antes de cargar envíos.'
            : 'Cargá un envío manual. La agencia lo asignará a un repartidor cuando esté listo.'}
        </Text>

        <Field label="Cliente *">
          <PostaInput
            value={clientName}
            onChangeText={setClientName}
            placeholder="Nombre y apellido"
          />
        </Field>

        <Field label="Teléfono">
          <PostaInput
            value={clientPhone}
            onChangeText={setClientPhone}
            placeholder="Opcional"
            keyboardType="phone-pad"
          />
        </Field>

        <Field label="Dirección de entrega *">
          <PostaInput
            value={address}
            onChangeText={(v) => {
              setAddress(v);
              setLat(null);
              setLng(null);
            }}
            placeholder="Calle, altura, barrio"
          />
          <Button
            label={lat != null ? 'Ubicación confirmada' : 'Ubicar en mapa'}
            variant={lat != null ? 'success' : 'secondary'}
            onPress={handleGeocode}
            loading={geocoding}
            style={{ marginTop: spacing.sm }}
          />
        </Field>

        <Field label="Notas">
          <PostaInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Instrucciones para el repartidor"
            multiline
            style={styles.textArea}
          />
        </Field>

        <Button
          label="Crear envío"
          onPress={handleSubmit}
          loading={submitting}
          disabled={!clientName.trim() || !address.trim()}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <MonoLabel color={colors.textMuted} style={styles.fieldLabel}>
        {label}
      </MonoLabel>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl },
  hint: {
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
  field: { marginBottom: spacing.lg },
  fieldLabel: { marginBottom: spacing.sm },
  textArea: { minHeight: 90, paddingTop: spacing.md, textAlignVertical: 'top' },
});
