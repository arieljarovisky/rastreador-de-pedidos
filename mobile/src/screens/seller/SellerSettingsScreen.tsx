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
import { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import { IntegrationsStatus, MarketplacePlatform, PickupPoint } from '../../types';
import { colors, radius, spacing } from '../../theme';
import Button from '../../components/Button';
import PostaInput from '../../components/ui/PostaInput';
import MarketplaceSourceLogo from '../../components/MarketplaceSourceLogo';
import { TAB_BAR_CLEARANCE } from '../../constants/layout';
import { SellerSettingsStackParamList, SellerStackParamList } from '../../navigation/types';
import {
  PLATFORM_LABELS,
  connectMarketplace,
  connectShopify,
  oauthErrorMessage,
} from '../../oauth/connectMarketplace';

type Props = CompositeScreenProps<
  NativeStackScreenProps<SellerSettingsStackParamList, 'SellerSettings'>,
  NativeStackScreenProps<SellerStackParamList>
>;

export default function SellerSettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [status, setStatus] = useState<IntegrationsStatus | null>(null);
  const [pickups, setPickups] = useState<PickupPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPlatform, setBusyPlatform] = useState<MarketplacePlatform | null>(null);
  const [shopifyShop, setShopifyShop] = useState('');
  const [wooStoreUrl, setWooStoreUrl] = useState('');
  const [wooConsumerKey, setWooConsumerKey] = useState('');
  const [wooConsumerSecret, setWooConsumerSecret] = useState('');

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

  const connect = async (platform: MarketplacePlatform, shop?: string) => {
    if (!token) return;
    setBusyPlatform(platform);
    try {
      const { result, message } =
        platform === 'shopify'
          ? await connectShopify(token, shop ?? shopifyShop)
          : await connectMarketplace(token, platform);
      if (result === 'connected') {
        await load();
        Alert.alert('Listo', `${PLATFORM_LABELS[platform]} conectado correctamente.`);
      } else if (result === 'error') {
        Alert.alert('Error', oauthErrorMessage(platform, message));
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo abrir la conexión.');
    } finally {
      setBusyPlatform(null);
    }
  };

  const connectWoo = async () => {
    if (!token) return;
    if (!wooStoreUrl.trim() || !wooConsumerKey.trim() || !wooConsumerSecret.trim()) {
      Alert.alert('Datos incompletos', 'Completá la URL de la tienda, Consumer Key y Consumer Secret.');
      return;
    }
    setBusyPlatform('woocommerce');
    try {
      await api.connectWooCommerce(token, {
        storeUrl: wooStoreUrl.trim(),
        consumerKey: wooConsumerKey.trim(),
        consumerSecret: wooConsumerSecret.trim(),
      });
      setWooStoreUrl('');
      setWooConsumerKey('');
      setWooConsumerSecret('');
      await load();
      Alert.alert('Listo', 'WooCommerce conectado correctamente.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo conectar WooCommerce.');
    } finally {
      setBusyPlatform(null);
    }
  };

  const disconnect = (platform: MarketplacePlatform) => {
    if (!token) return;
    Alert.alert('Desconectar', `¿Desconectar ${PLATFORM_LABELS[platform]}?`, [
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
        { paddingTop: insets.top + spacing.lg, paddingBottom: TAB_BAR_CLEARANCE + spacing.xl },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
      }
      keyboardShouldPersistTaps="handled"
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
          platform="mercadolibre"
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
          platform="tiendanube"
          configured={status?.tiendanube.configured ?? false}
          connected={status?.tiendanube.connected ?? false}
          account={status?.tiendanube.account ?? null}
          busy={busyPlatform === 'tiendanube'}
          onConnect={() => connect('tiendanube')}
          onDisconnect={() => disconnect('tiendanube')}
          onImport={() => navigation.navigate('ImportShipments', { platform: 'tiendanube' })}
        />
        <IntegrationRow
          label="Shopify"
          platform="shopify"
          configured={status?.shopify?.configured ?? false}
          connected={status?.shopify?.connected ?? false}
          account={status?.shopify?.account ?? null}
          busy={busyPlatform === 'shopify'}
          onConnect={() => connect('shopify', shopifyShop)}
          onDisconnect={() => disconnect('shopify')}
          onImport={() => navigation.navigate('ImportShipments', { platform: 'shopify' })}
          connectExtra={
            <PostaInput
              value={shopifyShop}
              onChangeText={setShopifyShop}
              placeholder="mi-tienda.myshopify.com"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.field}
            />
          }
        />
        <IntegrationRow
          label="WooCommerce"
          platform="woocommerce"
          configured={status?.woocommerce?.configured ?? true}
          connected={status?.woocommerce?.connected ?? false}
          account={status?.woocommerce?.account ?? null}
          busy={busyPlatform === 'woocommerce'}
          onConnect={connectWoo}
          onDisconnect={() => disconnect('woocommerce')}
          onImport={() => navigation.navigate('ImportShipments', { platform: 'woocommerce' })}
          connectExtra={
            <View style={styles.wooFields}>
              <PostaInput
                value={wooStoreUrl}
                onChangeText={setWooStoreUrl}
                placeholder="https://mitienda.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.field}
              />
              <PostaInput
                value={wooConsumerKey}
                onChangeText={setWooConsumerKey}
                placeholder="ck_…"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.field}
              />
              <PostaInput
                value={wooConsumerSecret}
                onChangeText={setWooConsumerSecret}
                placeholder="cs_…"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={styles.field}
              />
            </View>
          }
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
      <Button
        label="Cuenta de envíos"
        variant="ghost"
        onPress={() => navigation.navigate('SellerShippingAccount')}
        style={{ marginTop: spacing.sm }}
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
  platform,
  configured,
  connected,
  account,
  busy,
  onConnect,
  onDisconnect,
  onImport,
  connectExtra,
}: {
  label: string;
  platform: MarketplacePlatform;
  configured: boolean;
  connected: boolean;
  account: IntegrationsStatus['mercadolibre']['account'];
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onImport: () => void;
  connectExtra?: React.ReactNode;
}) {
  return (
    <View style={styles.integrationCard}>
      <View style={styles.integrationHeader}>
        <View style={styles.integrationTitle}>
          <MarketplaceSourceLogo source={platform} size={18} />
          <Text style={styles.integrationLabel}>{label}</Text>
        </View>
        <Text style={[styles.badge, connected ? styles.badgeOk : styles.badgeOff]}>
          {connected ? 'Conectado' : 'Sin conectar'}
        </Text>
      </View>
      {!configured && (
        <Text style={styles.warn}>No configurado en el servidor de Posta.</Text>
      )}
      {connected && (account?.nickname || account?.storeName) ? (
        <Text style={styles.rowSub}>Cuenta: {account.nickname || account.storeName}</Text>
      ) : null}
      <View style={styles.integrationActions}>
        {connected ? (
          <>
            <Pressable style={styles.linkBtn} onPress={onImport}>
              <Text style={styles.linkBtnText}>Importar envíos</Text>
            </Pressable>
            {platform === 'mercadolibre' ? (
              <Pressable style={styles.linkBtn} onPress={onConnect} disabled={busy}>
                <Text style={styles.linkBtnText}>{busy ? '…' : 'Autorizar de nuevo'}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.linkBtnDanger} onPress={onDisconnect} disabled={busy}>
              <Text style={styles.linkBtnDangerText}>{busy ? '…' : 'Desconectar'}</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.connectBlock}>
            {connectExtra}
            <Button
              label="Conectar"
              onPress={onConnect}
              loading={busy}
              disabled={!configured}
              style={{ flex: 1 }}
            />
          </View>
        )}
      </View>
    </View>
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
  integrationTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    paddingRight: spacing.sm,
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
  connectBlock: { flex: 1, gap: spacing.sm },
  wooFields: { gap: spacing.sm },
  field: { height: 44, fontSize: 14 },
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
