import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { RepartidorMercadoLibreStatus } from '../types';
import { colors, radius, spacing } from '../theme';
import Button from './Button';
import { connectMarketplace, oauthErrorMessage } from '../oauth/connectMarketplace';

export default function RepartidorMlConnectBar() {
  const { token, user } = useAuth();
  const [status, setStatus] = useState<RepartidorMercadoLibreStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setStatus(await api.getRepartidorMlStatus(token));
    } catch {
      setStatus(null);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const showSection =
    status?.mlFlexMode === 'repartidor' || user?.agencyMlFlexMode === 'repartidor';

  if (!showSection) return null;

  const connect = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const { result, message } = await connectMarketplace(token, 'mercadolibre');
      if (result === 'connected') {
        await load();
        Alert.alert('Listo', 'Mercado Libre conectado correctamente.');
      } else if (result === 'error') {
        Alert.alert('Error', oauthErrorMessage('mercadolibre', message));
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo abrir la conexión.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    if (!token) return;
    Alert.alert('Desconectar', '¿Desconectar tu cuenta de Mercado Libre Flex?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.disconnectIntegration(token, 'mercadolibre');
            await load();
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo desconectar.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Mercado Libre Flex</Text>
      {!status?.mercadolibre.configured ? (
        <Text style={styles.warn}>ML no está configurado en el servidor de Posta.</Text>
      ) : status.mercadolibre.connected ? (
        <View style={styles.row}>
          <Text style={styles.ok}>
            Conectado como {status.mercadolibre.account?.nickname ?? 'ML'}
          </Text>
          <Pressable onPress={disconnect} disabled={busy}>
            <Text style={styles.danger}>{busy ? '…' : 'Desconectar'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.row}>
          <Text style={styles.muted}>Sin conectar — los escaneos no se informan a ML</Text>
          <Button
            label="Conectar ML"
            onPress={connect}
            loading={busy}
            disabled={!status.mercadolibre.configured}
            style={styles.btn}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  row: { gap: spacing.sm },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  warn: { color: colors.amber, fontSize: 12 },
  ok: { color: colors.green, fontSize: 12, fontWeight: '600' },
  danger: { color: colors.red, fontWeight: '600', fontSize: 12 },
  btn: { alignSelf: 'flex-start' },
});
