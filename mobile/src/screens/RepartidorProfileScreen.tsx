import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { RepartidorMercadoLibreStatus } from '../types';
import { colors, radius, spacing } from '../theme';
import Button from '../components/Button';
import { RepartidorStackParamList } from '../navigation/types';
import { connectMarketplace, oauthErrorMessage } from '../oauth/connectMarketplace';

type Props = NativeStackScreenProps<RepartidorStackParamList, 'RepartidorProfile'>;

export default function RepartidorProfileScreen(_props: Props) {
  const insets = useSafeAreaInsets();
  const { user, token, logout } = useAuth();
  const [status, setStatus] = useState<RepartidorMercadoLibreStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setStatus(await api.getRepartidorMlStatus(token));
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo cargar el perfil.');
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

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

  const showMlSection =
    status?.mlFlexMode === 'repartidor' || user?.agencyMlFlexMode === 'repartidor';

  if (loading && !status) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.xl }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
      }
    >
      <Text style={styles.name}>{user?.name}</Text>
      <Text style={styles.sub}>@{user?.username}</Text>
      {user?.agencyName ? <Text style={styles.sub}>Agencia: {user.agencyName}</Text> : null}

      {showMlSection ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mercado Libre Flex</Text>
          <Text style={styles.hint}>
            Conectá tu cuenta para que tus escaneos se informen a Mercado Libre.
          </Text>
          {!status?.mercadolibre.configured ? (
            <Text style={styles.warn}>ML no está configurado en el servidor de Posta.</Text>
          ) : status.mercadolibre.connected ? (
            <>
              <Text style={styles.ok}>
                Conectado como {status.mercadolibre.account?.nickname ?? 'ML'}
              </Text>
              <Pressable onPress={disconnect} disabled={busy}>
                <Text style={styles.danger}>{busy ? '…' : 'Desconectar'}</Text>
              </Pressable>
            </>
          ) : (
            <Button
              label="Conectar mi cuenta ML"
              onPress={connect}
              loading={busy}
              disabled={!status?.mercadolibre.configured}
            />
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.hint}>
            Tu agencia usa una cuenta de mensajería centralizada. No necesitás conectar Mercado Libre
            en tu perfil.
          </Text>
        </View>
      )}

      <Button label="Cerrar sesión" variant="danger" onPress={logout} style={{ marginTop: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { padding: spacing.xl },
  name: { fontSize: 22, fontWeight: '700', color: colors.text },
  sub: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  card: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  warn: { color: colors.amber, fontSize: 12, marginTop: spacing.sm },
  ok: { color: colors.green, fontSize: 13, marginTop: spacing.sm, fontWeight: '600' },
  danger: { color: colors.red, fontWeight: '600', marginTop: spacing.md, fontSize: 13 },
});
