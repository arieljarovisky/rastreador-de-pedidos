import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from './Button';
import PostaInput from './ui/PostaInput';
import { DELIVERY_INCIDENTS } from '../config/deliveryIncidents';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  visible: boolean;
  hasPhone: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (incidentId: string, note: string) => Promise<void>;
}

export default function FailedDeliverySheet({ visible, hasPhone, busy, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const [incidentId, setIncidentId] = useState(DELIVERY_INCIDENTS[0].id);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setIncidentId(DELIVERY_INCIDENTS[0].id);
    setNote('');
    setError('');
  }, [visible]);

  const submit = async () => {
    setError('');
    try {
      await onConfirm(incidentId, note);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la incidencia.');
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
          <Text style={typography.displayTitle(20)}>No se pudo entregar</Text>
          <Text style={[typography.body(14, colors.textMuted), styles.lead]}>
            Elegí el motivo. Queda en el pedido
            {hasPhone ? ' y se abre WhatsApp para avisarle al cliente.' : '. Este pedido no tiene teléfono para WhatsApp.'}
          </Text>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {DELIVERY_INCIDENTS.map((incident) => {
              const selected = incident.id === incidentId;
              return (
                <Pressable
                  key={incident.id}
                  onPress={() => setIncidentId(incident.id)}
                  disabled={busy}
                  style={[styles.option, selected && styles.optionOn]}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextOn]}>{incident.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.label}>Detalle opcional</Text>
          <PostaInput
            value={note}
            onChangeText={setNote}
            placeholder="Ej: el portero no dejó pasar"
            editable={!busy}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Button label="Cancelar" variant="ghost" onPress={onClose} disabled={busy} style={styles.half} />
            <Button
              label={hasPhone ? 'WhatsApp' : 'Registrar'}
              variant="danger"
              onPress={() => void submit()}
              loading={busy}
              style={styles.half}
            />
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
    maxHeight: '88%',
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
  lead: { marginBottom: spacing.xs },
  list: { maxHeight: 280 },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.posta,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  optionOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentBg,
  },
  optionText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  optionTextOn: { color: colors.accent },
  label: {
    ...typography.monoLabel(colors.textFaint),
    marginTop: spacing.xs,
  },
  error: { color: colors.red, fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  half: { flex: 1 },
});
