import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { useAuth } from '../../context/AuthContext';
import { useAgencyOrdersContext } from '../../context/AgencyOrdersContext';
import { api } from '../../api';
import { AgencyMercadoLibreCourierStatus, OrderStatus } from '../../types';
import { colors, radius, spacing } from '../../theme';
import Button from '../../components/Button';
import { zoneLabel } from '../../config/deliveryZones';
import { AgencyStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AgencyStackParamList, 'AgencySettings'>;

export default function AgencySettingsScreen({ navigation: _navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, token, logout } = useAuth();
  const { orders, repartidores, sellers, deliveryZones } = useAgencyOrdersContext();

  const [courierStatus, setCourierStatus] = useState<AgencyMercadoLibreCourierStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [courierBusy, setCourierBusy] = useState(false);

  const pending = orders.filter((o) => o.status === OrderStatus.PENDING).length;
  const enRoute = orders.filter((o) => o.status === OrderStatus.DELIVERING).length;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const status = await api.getAgencyCourierStatus(token);
      setCourierStatus(status.mercadolibreCourier);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo cargar la integración.');
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

  const connectCourier = async () => {
    if (!token) return;
    setCourierBusy(true);
    try {
      const { url } = await api.getIntegrationConnectUrl(token, 'mercadolibre');
      await Linking.openURL(url);
      Alert.alert(
        'Continuá en el navegador',
        'Completá la autorización con la cuenta de mensajería de Mercado Libre Flex y volvé a esta pantalla. Deslizá hacia abajo para actualizar el estado.'
      );
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo abrir la conexión.');
    } finally {
      setCourierBusy(false);
    }
  };

  const disconnectCourier = () => {
    if (!token) return;
    Alert.alert('Desconectar', '¿Desconectar la cuenta de mensajería Mercado Libre Flex?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar',
        style: 'destructive',
        onPress: async () => {
          setCourierBusy(true);
          try {
            await api.disconnectIntegration(token, 'mercadolibre');
            await load();
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo desconectar.');
          } finally {
            setCourierBusy(false);
          }
        },
      },
    ]);
  };

  if (loading && !courierStatus) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.agencyName}>{user?.agencyName ?? 'Tu agencia'}</Text>
        <Text style={styles.userName}>{user?.name}</Text>
      </View>

      <View style={styles.statsRow}>
        <Stat label="Pendientes" value={String(pending)} />
        <Stat label="En ruta" value={String(enRoute)} />
        <Stat label="Repartidores" value={String(repartidores.length)} />
        <Stat label="Vendedores" value={String(sellers.length)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mensajería Mercado Libre Flex</Text>
        <View style={styles.integrationCard}>
          <View style={styles.integrationHeader}>
            <Text style={styles.integrationLabel}>Cuenta de mensajería</Text>
            <Text
              style={[
                styles.badge,
                courierStatus?.connected ? styles.badgeOk : styles.badgeOff,
              ]}
            >
              {courierStatus?.connected ? 'Conectado' : 'Sin conectar'}
            </Text>
          </View>
          {!courierStatus?.configured ? (
            <Text style={styles.warn}>
              Mercado Libre no está configurado en el servidor de Posta.
            </Text>
          ) : (
            <Text style={styles.integrationHint}>
              Al escanear etiquetas, Posta informa el envío a Mercado Libre Flex automáticamente.
              Usá la cuenta de negocio de tu mensajería registrada en ML.
            </Text>
          )}
          {courierStatus?.connected && courierStatus.account?.nickname ? (
            <Text style={styles.rowMeta}>Cuenta: {courierStatus.account.nickname}</Text>
          ) : null}
          <View style={styles.integrationActions}>
            {courierStatus?.connected ? (
              <Pressable
                style={styles.linkBtnDanger}
                onPress={disconnectCourier}
                disabled={courierBusy}
              >
                <Text style={styles.linkBtnDangerText}>{courierBusy ? '…' : 'Desconectar'}</Text>
              </Pressable>
            ) : (
              <Button
                label="Conectar mensajería ML"
                onPress={connectCourier}
                loading={courierBusy}
                disabled={!courierStatus?.configured}
                style={{ flex: 1 }}
              />
            )}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Flota</Text>
        {repartidores.length === 0 ? (
          <Text style={styles.muted}>Sin repartidores. Creálos desde la web de Posta.</Text>
        ) : (
          repartidores.map((rep) => (
            <View key={rep.id} style={styles.row}>
              <Text style={styles.rowName}>🏍️ {rep.name}</Text>
              <Text style={styles.rowMeta}>
                {rep.deliveryZone ? zoneLabel(deliveryZones, rep.deliveryZone) : 'Sin zona'}
                {rep.currentLocation ? ' · GPS activo' : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vendedores</Text>
        {sellers.length === 0 ? (
          <Text style={styles.muted}>Sin vendedores registrados.</Text>
        ) : (
          sellers.map((seller) => (
            <View key={seller.id} style={styles.row}>
              <Text style={styles.rowName}>🏪 {seller.name}</Text>
              <Text style={styles.rowMeta}>@{seller.username}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.hint}>
        Para crear vendedores, repartidores, zonas de entrega o configurar el punto de salida, usá la web de Posta
        desde una computadora.
      </Text>

      <Button label="Cerrar sesión" variant="danger" onPress={logout} style={{ marginTop: spacing.xl }} />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { padding: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  agencyName: { fontSize: 22, fontWeight: '700', color: colors.text },
  userName: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '700', color: colors.text },
  statLabel: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 10,
    color: colors.textFaint,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  section: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  sectionTitle: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 11,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  integrationCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  integrationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  integrationLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  badgeOk: { color: colors.green, backgroundColor: colors.greenBg },
  badgeOff: { color: colors.textMuted, backgroundColor: colors.surfaceAlt },
  warn: { color: colors.amber, fontSize: 12, marginBottom: spacing.sm },
  integrationHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  integrationActions: { flexDirection: 'row', marginTop: spacing.md },
  linkBtnDanger: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  linkBtnDangerText: { color: colors.red, fontWeight: '600', fontSize: 13 },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowName: { fontSize: 15, color: colors.text, fontWeight: '600' },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  muted: { color: colors.textFaint, fontSize: 14 },
  hint: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
});
