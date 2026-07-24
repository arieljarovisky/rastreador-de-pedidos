import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../../context/AuthContext';
import { useAgencyOrdersContext } from '../../context/AgencyOrdersContext';
import { api } from '../../api';
import { AgencyMercadoPagoStatus, AgencySubscriptionStatus, OrderStatus } from '../../types';
import { AgencyPalette, fonts, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import Button from '../../components/Button';
import AgencyTopBar from '../../components/agency/AgencyTopBar';
import IconLabelRow from '../../components/ui/IconLabelRow';
import { zoneLabel } from '../../config/deliveryZones';
import { AgencySettingsStackParamList } from '../../navigation/types';
import { TAB_BAR_CLEARANCE } from '../../constants/layout';
import { getOAuthRedirectUri } from '../../oauth/redirectUri';

WebBrowser.maybeCompleteAuthSession();

type Props = NativeStackScreenProps<AgencySettingsStackParamList, 'AgencySettings'>;

export default function AgencySettingsScreen({ navigation: _navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { palette: t } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const { user, token, logout } = useAuth();
  const { orders, repartidores, sellers, deliveryZones, refresh } = useAgencyOrdersContext();
  const [subscription, setSubscription] = useState<AgencySubscriptionStatus | null>(null);
  const [mpStatus, setMpStatus] = useState<AgencyMercadoPagoStatus | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [mpBusy, setMpBusy] = useState(false);

  const loadPayments = useCallback(async () => {
    if (!token) return;
    const [sub, mp] = await Promise.all([
      api.getSubscriptionStatus(token),
      api.getAgencyMercadoPagoStatus(token),
    ]);
    setSubscription(sub);
    setMpStatus(mp);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadPayments().catch(() => undefined);
    }, [loadPayments])
  );

  const paySubscription = async () => {
    if (!token) return;
    setPayBusy(true);
    try {
      const { initPoint } = await api.createSubscriptionCheckout(token);
      await Linking.openURL(initPoint);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo iniciar el pago.');
    } finally {
      setPayBusy(false);
    }
  };

  const connectMp = async () => {
    if (!token) return;
    setMpBusy(true);
    try {
      const redirectUri = getOAuthRedirectUri();
      const { url } = await api.getMercadoPagoAgencyConnectUrl(token, 'mobile', redirectUri);
      const session = await WebBrowser.openAuthSessionAsync(url, redirectUri);
      if (session.type === 'success') {
        await loadPayments();
        Alert.alert('Listo', 'Mercado Pago conectado.');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo conectar.');
    } finally {
      setMpBusy(false);
    }
  };

  const pending = orders.filter((o) => o.status === OrderStatus.PENDING).length;
  const enRoute = orders.filter((o) => o.status === OrderStatus.DELIVERING).length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AgencyTopBar agencyName={user?.agencyName ?? user?.name ?? 'Agencia'} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingBottom: TAB_BAR_CLEARANCE + spacing.xl,
        }}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => void refresh()} tintColor={t.sello} />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Equipo · {repartidores.length} repartidores</Text>
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
          <Text style={styles.sectionTitle}>Suscripción Posta</Text>
          <View style={styles.integrationCard}>
            {subscription ? (
              <>
                <Text style={styles.integrationHint}>
                  Repartidores activos: {subscription.repartidorCount}
                  {subscription.recommendedPlan
                    ? ` · Plan: ${subscription.recommendedPlan.name} (${formatArs(subscription.recommendedPlan.priceArs)}/mes)`
                    : ''}
                </Text>
                {subscription.daysRemaining != null && (
                  <Text style={styles.rowMeta}>
                    {subscription.isActive
                      ? `Vence en ${subscription.daysRemaining} día(s)`
                      : 'Suscripción vencida'}
                  </Text>
                )}
                {(!subscription.isActive || subscription.status === 'active') &&
                  subscription.postaMercadoPagoConfigured !== false && (
                    <Button
                      label={subscription.isActive ? 'Renovar suscripción' : 'Pagar suscripción'}
                      onPress={paySubscription}
                      loading={payBusy}
                      style={{ marginTop: spacing.md }}
                    />
                  )}
              </>
            ) : (
              <Text style={styles.muted}>Cargando…</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mercado Pago (cobros a vendedores)</Text>
          <View style={styles.integrationCard}>
            <Text style={styles.integrationHint}>
              {mpStatus?.connected
                ? `Conectado${mpStatus.account?.nickname ? `: ${mpStatus.account.nickname}` : ''}`
                : 'Conectá tu cuenta para que los vendedores paguen envíos desde la app.'}
            </Text>
            <Button
              label={mpStatus?.connected ? 'Reconectar Mercado Pago' : 'Conectar Mercado Pago'}
              onPress={connectMp}
              loading={mpBusy}
              disabled={!mpStatus?.configured}
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mercado Libre Flex</Text>
          <View style={styles.integrationCard}>
            <Text style={styles.integrationHint}>
              Cada repartidor debe conectar su cuenta de Mercado Libre Flex desde Perfil en la app.
              Los escaneos se hacen en la app oficial de Mercado Envíos Flex.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Flota</Text>
          {repartidores.length === 0 ? (
            <Text style={styles.muted}>Sin repartidores. Creálos desde la web de Posta.</Text>
          ) : (
            repartidores.map((rep) => (
              <View key={rep.id} style={styles.row}>
                <IconLabelRow icon="motorcycle" label={rep.name} color={t.ink} />
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
                <IconLabelRow icon="store" label={seller.name} color={t.ink} />
                <Text style={styles.rowMeta}>@{seller.username}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={styles.hint}>
          Para crear vendedores, repartidores, zonas de entrega o configurar el punto de salida, usá la web de
          Posta desde una computadora.
        </Text>

        <Button label="Cerrar sesión" variant="danger" onPress={logout} style={{ marginTop: spacing.xl, marginHorizontal: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { palette: t } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

function createStyles(t: AgencyPalette) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: t.paper },
  container: { flex: 1, backgroundColor: t.paper },
  hero: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 },
  eyebrow: {
    fontFamily: fonts.monoRegular,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: t.ink3,
    marginBottom: 8,
  },
  agencyName: {
    fontFamily: fonts.displaySemi,
    fontSize: 22,
    fontWeight: '600',
    color: t.ink,
  },
  userName: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: t.ink2,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.line,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: fonts.displaySemi,
    fontSize: 24,
    fontWeight: '600',
    color: t.ink,
  },
  statLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: t.ink3,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  section: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  sectionTitle: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: t.ink3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  integrationCard: {
    backgroundColor: t.card,
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.lg,
  },
  integrationHint: {
    color: t.ink2,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.body,
  },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: t.line,
  },
  rowMeta: { fontSize: 12, color: t.ink2, marginTop: 2, fontFamily: fonts.body },
  muted: { color: t.ink3, fontSize: 14, fontFamily: fonts.body },
  hint: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    fontSize: 13,
    color: t.ink2,
    lineHeight: 19,
    fontFamily: fonts.body,
  },
});
}
