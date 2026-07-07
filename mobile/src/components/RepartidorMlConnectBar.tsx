import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { RepartidorMercadoLibreStatus } from '../types';
import { colors, fonts, radius, spacing } from '../theme';
import Button from './Button';
import PostaIcon from './icons/PostaIcons';
import { connectMarketplace, oauthErrorMessage } from '../oauth/connectMarketplace';

export default function RepartidorMlConnectBar() {
  const { token } = useAuth();
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

  if (!token) return null;

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

  const connected = Boolean(status?.mercadolibre.connected);
  const nickname = status?.mercadolibre.account?.nickname ?? 'ML';

  return (
    <View style={[styles.wrap, connected ? styles.wrapConnected : styles.wrapIdle]}>
      <View style={styles.topRow}>
        <View style={styles.titleRow}>
          <View style={[styles.statusDot, connected ? styles.dotOn : styles.dotOff]} />
          <Text style={styles.label}>Mercado Libre Flex</Text>
        </View>
        <PostaIcon name={connected ? 'link' : 'unlink'} size={16} color={connected ? colors.green : colors.textFaint} />
      </View>

      {!status?.mercadolibre.configured ? (
        <Text style={styles.warn}>ML no está configurado en el servidor de Posta.</Text>
      ) : connected ? (
        <View style={styles.connectedRow}>
          <Text style={styles.ok} numberOfLines={1}>
            Conectado como {nickname}
          </Text>
          <Pressable onPress={disconnect} disabled={busy} style={styles.disconnectBtn}>
            <PostaIcon name="unlink" size={14} color={colors.red} />
            <Text style={styles.danger}>{busy ? '…' : 'Desconectar'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.disconnectedRow}>
          <Text style={styles.muted}>Sin conectar — Flex no podrá sincronizar tus envíos con Posta</Text>
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
    marginBottom: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  wrapConnected: {
    backgroundColor: colors.greenBg,
    borderColor: colors.greenBorder,
  },
  wrapIdle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotOn: { backgroundColor: colors.green },
  dotOff: { backgroundColor: colors.textFaint },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  connectedRow: {
    gap: spacing.sm,
  },
  disconnectedRow: {
    gap: spacing.sm,
  },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  warn: { color: colors.amber, fontSize: 12 },
  ok: { color: colors.green, fontSize: 13, fontWeight: '600' },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  danger: { color: colors.red, fontWeight: '600', fontSize: 12 },
  btn: { alignSelf: 'flex-start' },
});
