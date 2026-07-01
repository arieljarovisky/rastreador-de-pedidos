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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import { IntegrationsStatus, MarketplacePlatform, PickupPoint } from '../../types';
import { colors, radius, spacing } from '../../theme';
import Button from '../../components/Button';
import { SellerStackParamList } from '../../navigation/types';
import { connectMarketplace, oauthErrorMessage } from '../../oauth/connectMarketplace';

type Props = NativeStackScreenProps<SellerStackParamList, 'SellerSettings'>;

export default function SellerSettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [status, setStatus] = useState<IntegrationsStatus | null>(null);
  const [pickups, setPickups] = useState<PickupPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPlatform, setBusyPlatform] = useState<MarketplacePlatform | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [integrations, points] = await Promise.all([
        api.getIntegrationsStatus(token),
        api.getPickupPoints(token),
      ]);
      setStatus(integrations);
      setPickups(points);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo cargar.');
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

  const connect = async (platform: MarketplacePlatform) => {
    if (!token) return;
    setBusyPlatform(platform);
    try {
      const { result, message } = await connectMarketplace(token, platform);
      if (result === 'connected') {
        await load();
        Alert.alert('Listo', `${platformLabel(platform)} conectado correctamente.`);
      } else if (result === 'error') {
        Alert.alert('Error', oauthErrorMessage(platform, message));
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo abrir la conexión.');
    } finally {
      setBusyPlatform(null);
    }
  };

  const disconnect = (platform: MarketplacePlatform) => {
    if (!token) return;
    Alert.alert('Desconectar', `¿Desconectar ${platformLabel(platform)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar',
        style: 'destructive',
        onPress: async () => {
          setBusyPlatform(platform);
          try {
            await api.disconnectIntegration(token, platform);
            await load();
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo desconectar.');
          } finally {
            setBusyPlatform(null);
          }
        },
      },
    ]);
  };

  if (loading && !status) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + spacing.xl },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
      }
    >
      <Section title="Cuenta">
        <Text style={styles.rowText}>{user?.name}</Text>
        <Text style={styles.rowSub}>@{user?.username}</Text>
        {user?.agencyName ? (
          <Text style={styles.rowSub}>Agencia: {user.agencyName}</Text>
        ) : null}
      </Section>

      <Section title="Marketplaces">
        <IntegrationRow
          label="Mercado Libre"
          configured={status?.mercadolibre.configured ?? false}
          connected={status?.mercadolibre.connected ?? false}
          account={status?.mercadolibre.account ?? null}
          busy={busyPlatform === 'mercadolibre'}
          onConnect={() => connect('mercadolibre')}
          onDisconnect={() => disconnect('mercadolibre')}
          onImport={() => navigation.navigate('ImportShipments', { platform: 'mercadolibre' })}
        />
        <IntegrationRow
          label="Tienda Nube"
          configured={status?.tiendanube.configured ?? false}
          connected={status?.tiendanube.connected ?? false}
          account={status?.tiendanube.account ?? null}
          busy={busyPlatform === 'tiendanube'}
          onConnect={() => connect('tiendanube')}
          onDisconnect={() => disconnect('tiendanube')}
          onImport={() => navigation.navigate('ImportShipments', { platform: 'tiendanube' })}
        />
      </Section>

      <Section title="Puntos de colecta">
        {pickups.length === 0 ? (
          <Text style={styles.empty}>No tenés puntos de colecta cargados.</Text>
        ) : (
          pickups.map((p) => (
            <View key={p.id} style={styles.pickupCard}>
              <Text style={styles.pickupLabel}>{p.label}</Text>
              <Text style={styles.pickupAddress}>{p.address}</Text>
            </View>
          ))
        )}
        <Text style={styles.pickupHint}>
          Para editar puntos de colecta usá la web de Posta (Configuración).
        </Text>
      </Section>

      <Button
        label="Ver notificaciones"
        variant="ghost"
        onPress={() => navigation.navigate('Notifications')}
        style={{ marginTop: spacing.md }}
      />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function IntegrationRow({
  label,
  configured,
  connected,
  account,
  busy,
  onConnect,
  onDisconnect,
  onImport,
}: {
  label: string;
  configured: boolean;
  connected: boolean;
  account: IntegrationsStatus['mercadolibre']['account'];
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onImport: () => void;
}) {
  return (
    <View style={styles.integrationCard}>
      <View style={styles.integrationHeader}>
        <Text style={styles.integrationLabel}>{label}</Text>
        <Text style={[styles.badge, connected ? styles.badgeOk : styles.badgeOff]}>
          {connected ? 'Conectado' : 'Sin conectar'}
        </Text>
      </View>
      {!configured && (
        <Text style={styles.warn}>No configurado en el servidor de Posta.</Text>
      )}
      {connected && account?.nickname ? (
        <Text style={styles.rowSub}>Cuenta: {account.nickname}</Text>
      ) : null}
      <View style={styles.integrationActions}>
        {connected ? (
          <>
            <Pressable style={styles.linkBtn} onPress={onImport}>
              <Text style={styles.linkBtnText}>Importar envíos</Text>
            </Pressable>
            <Pressable style={styles.linkBtnDanger} onPress={onDisconnect} disabled={busy}>
              <Text style={styles.linkBtnDangerText}>{busy ? '…' : 'Desconectar'}</Text>
            </Pressable>
          </>
        ) : (
          <Button
            label="Conectar"
            onPress={onConnect}
            loading={busy}
            disabled={!configured}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </View>
  );
}

function platformLabel(platform: MarketplacePlatform): string {
  return platform === 'mercadolibre' ? 'Mercado Libre' : 'Tienda Nube';
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { padding: spacing.xl },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  rowText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rowSub: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  integrationCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
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
  integrationActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  linkBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  linkBtnText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  linkBtnDanger: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  linkBtnDangerText: { color: colors.red, fontWeight: '600', fontSize: 13 },
  pickupCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pickupLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  pickupAddress: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  pickupHint: { color: colors.textFaint, fontSize: 11, marginTop: spacing.sm, lineHeight: 16 },
  empty: { color: colors.textMuted, fontSize: 13 },
});
