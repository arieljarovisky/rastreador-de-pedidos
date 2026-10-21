import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { api } from '../api';
import { colors, spacing } from '../theme';
import Button from './Button';

export default function TiendaNubeShippingMethodForm({
  token,
  enabled,
  onSaved,
}: {
  token: string;
  enabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const [on, setOn] = useState(enabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOn(enabled);
  }, [enabled]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveTiendaNubeShippingMethod(token, { enabled: on });
      setOn(saved.enabled);
      await onSaved();
      Alert.alert(
        'Listo',
        saved.enabled
          ? 'En el checkout se ve como «Envíos en el día». El precio cambia según el cordón.'
          : 'Tus clientes no ven Envíos en el día en el checkout.'
      );
    } catch (err) {
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'No se pudo guardar el método de envío.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.title}>Mostrar Envíos en el día en el checkout</Text>
          <Text style={styles.hint}>
            Viene apagado. Si lo activás, tus clientes lo ven en AMBA como «Envíos en el día». El
            precio sale del cordón de la dirección: CABA, 1°, 2° o 3°.
          </Text>
        </View>
        <Switch
          value={on}
          onValueChange={setOn}
          disabled={saving}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={colors.text}
          accessibilityLabel="Mostrar Envíos en el día en el checkout"
        />
      </View>
      <Button
        label="Guardar método"
        onPress={() => void save()}
        loading={saving}
        style={{ marginTop: spacing.sm }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
});
