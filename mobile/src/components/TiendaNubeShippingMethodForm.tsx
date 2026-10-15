import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { api } from '../api';
import { colors, spacing } from '../theme';
import Button from './Button';
import PostaInput from './ui/PostaInput';

export default function TiendaNubeShippingMethodForm({
  token,
  enabled,
  methodName,
  onSaved,
}: {
  token: string;
  enabled: boolean;
  methodName: string;
  onSaved: () => Promise<void>;
}) {
  const [on, setOn] = useState(enabled);
  const [name, setName] = useState(methodName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOn(enabled);
    setName(methodName);
  }, [enabled, methodName]);

  const save = async () => {
    const methodNameTrimmed = name.trim().replace(/\s+/g, ' ');
    if (methodNameTrimmed.length < 2 || methodNameTrimmed.length > 40) {
      Alert.alert('Nombre', 'El nombre del método tiene que tener entre 2 y 40 caracteres.');
      return;
    }
    setSaving(true);
    try {
      const saved = await api.saveTiendaNubeShippingMethod(token, {
        enabled: on,
        methodName: methodNameTrimmed,
      });
      setName(saved.methodName);
      setOn(saved.enabled);
      await onSaved();
      Alert.alert(
        'Listo',
        saved.enabled
          ? `En el checkout se ve como «${saved.methodName}».`
          : 'Tus clientes no ven el envío Posta en el checkout.'
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
          <Text style={styles.title}>Mostrar envío Posta en el checkout</Text>
          <Text style={styles.hint}>
            Viene apagado. Si lo activás, tus clientes lo ven en AMBA con el nombre que elijas.
          </Text>
        </View>
        <Switch
          value={on}
          onValueChange={setOn}
          disabled={saving}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={colors.text}
          accessibilityLabel="Mostrar envío Posta en el checkout"
        />
      </View>
      <Text style={styles.label}>Nombre del método de envío</Text>
      <PostaInput
        value={name}
        onChangeText={setName}
        placeholder="Posta Express"
        maxLength={40}
        autoCorrect={false}
        style={styles.field}
      />
      <Button
        label="Guardar método"
        onPress={() => void save()}
        loading={saving}
        disabled={name.trim().length < 2}
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
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: spacing.xs },
  field: { height: 44, fontSize: 15 },
});
