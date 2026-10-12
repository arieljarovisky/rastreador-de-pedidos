import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from './Button';
import PostaInput from './ui/PostaInput';
import { colors, radius, spacing, typography } from '../theme';

export interface DeliveryReceipt {
  firstName: string;
  lastName: string;
  dni: string;
}

const NAME_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s'.-]{1,79}$/;

export function parseDeliveryReceipt(input: DeliveryReceipt): DeliveryReceipt | null {
  const firstName = input.firstName.trim().replace(/\s+/g, ' ');
  const lastName = input.lastName.trim().replace(/\s+/g, ' ');
  const dni = input.dni.replace(/\D/g, '');
  if (!NAME_RE.test(firstName) || !NAME_RE.test(lastName)) return null;
  if (!/^\d{7,8}$/.test(dni)) return null;
  return { firstName, lastName, dni };
}

interface Props {
  visible: boolean;
  orderId: string;
  onClose: () => void;
  onConfirm: (receipt: DeliveryReceipt) => Promise<void>;
}

export default function DeliveryReceiptSheet({ visible, orderId, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFirstName('');
    setLastName('');
    setDni('');
    setError('');
    setBusy(false);
  }, [visible]);

  const submit = async () => {
    const parsed = parseDeliveryReceipt({ firstName, lastName, dni });
    if (!parsed) {
      setError('Completá nombre, apellido y un DNI de 7 u 8 números.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar la entrega.');
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.dismiss} onPress={busy ? undefined : onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.grabber} />
          <Text style={typography.displayTitle(20)}>Quién recibe</Text>
          <Text style={[typography.body(14, colors.textMuted), styles.lead]}>
            Para entregar {orderId} cargá los datos de la persona que recibe el paquete.
          </Text>
          <Text style={styles.label}>Nombre</Text>
          <PostaInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Nombre"
            autoCapitalize="words"
            autoCorrect={false}
            editable={!busy}
          />
          <Text style={styles.label}>Apellido</Text>
          <PostaInput
            value={lastName}
            onChangeText={setLastName}
            placeholder="Apellido"
            autoCapitalize="words"
            autoCorrect={false}
            editable={!busy}
          />
          <Text style={styles.label}>DNI</Text>
          <PostaInput
            value={dni}
            onChangeText={(value) => setDni(value.replace(/\D/g, '').slice(0, 8))}
            placeholder="12345678"
            keyboardType="number-pad"
            maxLength={8}
            editable={!busy}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Button label="Cancelar" variant="ghost" onPress={onClose} disabled={busy} style={styles.half} />
            <Button label="Entregar" variant="success" onPress={() => void submit()} loading={busy} style={styles.half} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSoft,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  lead: { marginBottom: spacing.sm },
  label: {
    ...typography.monoLabel(colors.textFaint),
    marginTop: spacing.xs,
  },
  error: { color: colors.red, fontSize: 13, marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  half: { flex: 1 },
});
