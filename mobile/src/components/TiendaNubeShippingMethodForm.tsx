import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { api } from '../api';
import { colors, spacing } from '../theme';
import Button from './Button';
import PostaInput from './ui/PostaInput';

const DEFAULT_TN_METHOD_NAME = 'Envíos en el día';
const TN_METHOD_NAME_MIN = 2;
const TN_METHOD_NAME_MAX = 40;

function normalizeTnMethodName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export default function TiendaNubeShippingMethodForm({
  token,
  enabled,
  methodName,
  onSaved,
}: {
  token: string;
  enabled: boolean;
  methodName?: string;
  onSaved: () => Promise<void>;
}) {
  const [on, setOn] = useState(enabled);
  const [name, setName] = useState(methodName || DEFAULT_TN_METHOD_NAME);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOn(enabled);
    setName(methodName || DEFAULT_TN_METHOD_NAME);
  }, [enabled, methodName]);

  const save = async () => {
    const methodNameTrimmed = normalizeTnMethodName(name);
    if (
      methodNameTrimmed.length < TN_METHOD_NAME_MIN ||
      methodNameTrimmed.length > TN_METHOD_NAME_MAX
    ) {
      Alert.alert('Nombre', 'El nombre del método tiene que tener entre 2 y 40 caracteres.');
      return;
    }
    setSaving(true);
    try {
      const saved = await api.saveTiendaNubeShippingMethod(token, {
        enabled: on,
        methodName: methodNameTrimmed,
      });
      setOn(saved.enabled);
      setName(saved.methodName);
      await onSaved();
      Alert.alert(
        'Listo',
        saved.enabled
          ? `En el checkout se ve como «${saved.methodName}». El precio cambia según el cordón.`
          : 'Tus clientes no ven este envío en el checkout.'
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
          <Text style={styles.title}>Mostrar este envío en el checkout</Text>
          <Text style={styles.hint}>
            Viene apagado. Si lo activás, tus clientes lo ven en AMBA. El precio sale del cordón
            de la dirección: CABA, 1°, 2° o 3°.
          </Text>
        </View>
        <Switch
          value={on}
          onValueChange={setOn}
          disabled={saving}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={colors.text}
          accessibilityLabel="Mostrar este envío en el checkout"
        />
      </View>
      <View>
        <Text style={styles.label}>Nombre del método</Text>
        <PostaInput
          value={name}
          onChangeText={setName}
          placeholder={DEFAULT_TN_METHOD_NAME}
          maxLength={TN_METHOD_NAME_MAX}
          editable={!saving}
          accessibilityLabel="Nombre del método de envío"
        />
        <Text style={styles.hint}>Así lo ven tus clientes en el checkout. Entre 2 y 40 caracteres.</Text>
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
  label: { color: colors.text, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
});
