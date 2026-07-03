import React, { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Order, OrderStatus, User } from '../types';
import { colors, fonts, radius, spacing } from '../theme';
import DashboardHeader from './ui/DashboardHeader';
import DeliverySummaryCard from './DeliverySummaryCard';
import OrderCard from './OrderCard';
import PostaIcon from './icons/PostaIcons';
import {
  computeDeliverySummaryFromOrders,
  getDeliveredTodayOrders,
  getUndeliveredTodayOrders,
} from '../utils/deliverySummary';

interface Props {
  eyebrow: string;
  title: string;
  subtitle?: string;
  connected: boolean;
  accentColor?: string;
  orders: Order[];
  repartidores?: User[];
  isAgency?: boolean;
  loading?: boolean;
  refreshing?: boolean;
  unreadNotifs?: number;
  onRefresh?: () => void;
  onNotifications?: () => void;
  onLogout?: () => void;
  onOrderPress: (orderId: string) => void;
  onGoToOrders?: () => void;
}

export default function DeliveryDashboardPanel({
  eyebrow,
  title,
  subtitle,
  connected,
  accentColor = colors.accent,
  orders,
  repartidores = [],
  isAgency = false,
  loading,
  refreshing,
  unreadNotifs = 0,
  onRefresh,
  onNotifications,
  onLogout,
  onOrderPress,
  onGoToOrders,
}: Props) {
  const insets = useSafeAreaInsets();
  const summary = useMemo(() => computeDeliverySummaryFromOrders(orders), [orders]);
  const undelivered = useMemo(() => getUndeliveredTodayOrders(orders), [orders]);
  const delivered = useMemo(() => getDeliveredTodayOrders(orders), [orders]);

  const statusBreakdown = useMemo(
    () => ({
      pending: undelivered.filter((o) => o.status === OrderStatus.PENDING).length,
      assigned: undelivered.filter((o) => o.status === OrderStatus.ASSIGNED).length,
      delivering: undelivered.filter((o) => o.status === OrderStatus.DELIVERING).length,
    }),
    [undelivered]
  );

  const sellerRows = useMemo(() => {
    if (!isAgency) return [];
    const map = new Map<string, { name: string; undelivered: number; delivered: number }>();
    for (const order of orders) {
      if (!order.sellerId) continue;
      const u = getUndeliveredTodayOrders([order]).length > 0;
      const d = getDeliveredTodayOrders([order]).length > 0;
      if (!u && !d) continue;
      const row = map.get(order.sellerId) ?? {
        name: order.sellerName ?? 'Vendedor',
        undelivered: 0,
        delivered: 0,
      };
      if (u) row.undelivered += 1;
      if (d) row.delivered += 1;
      map.set(order.sellerId, row);
    }
    return [...map.values()].sort((a, b) => b.undelivered - a.undelivered);
  }, [orders, isAgency]);

  const gpsCount = repartidores.filter((r) => r.currentLocation).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <DashboardHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        connected={connected}
        accentColor={accentColor}
        notificationCount={unreadNotifs}
        onNotifications={onNotifications}
        onLogout={onLogout ?? (() => undefined)}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl * 2 }]}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={accentColor} />
          ) : undefined
        }
      >
        <DeliverySummaryCard orders={orders} />

        <View style={styles.kpiRow}>
          <MiniKpi label="En ruta" value={statusBreakdown.delivering} color={colors.amber} />
          <MiniKpi label="Despacho" value={statusBreakdown.pending + statusBreakdown.assigned} color={colors.blue} />
          {isAgency ? (
            <MiniKpi label="GPS" value={gpsCount} suffix={`/${repartidores.length}`} color={colors.green} />
          ) : (
            <MiniKpi label="Total hoy" value={summary.total} color={colors.textMuted} />
          )}
        </View>

        {onGoToOrders ? (
          <Pressable style={styles.cta} onPress={onGoToOrders}>
            <View style={styles.ctaLeft}>
              <PostaIcon name="motorcycle" size={16} color={colors.accent} />
              <Text style={styles.ctaText}>Ver mapa y pedidos en vivo</Text>
            </View>
            <PostaIcon name="chevronRight" size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}

        <SectionHeader title="Sin entregar hoy" count={undelivered.length} color={colors.amber} />
        {undelivered.length === 0 ? (
          <Text style={styles.empty}>No hay pedidos pendientes de entrega hoy.</Text>
        ) : (
          undelivered.slice(0, 8).map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              showRepartidor
              showSeller={isAgency}
              onPress={() => onOrderPress(order.id)}
            />
          ))
        )}

        <SectionHeader title="Entregados hoy" count={delivered.length} color={colors.green} />
        {delivered.length === 0 ? (
          <Text style={styles.empty}>Todavía no hay entregas registradas hoy.</Text>
        ) : (
          delivered.slice(0, 5).map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              showRepartidor
              showSeller={isAgency}
              onPress={() => onOrderPress(order.id)}
            />
          ))
        )}

        {isAgency && sellerRows.length > 0 ? (
          <View style={styles.sellerBlock}>
            <SectionHeader title="Por vendedor" count={sellerRows.length} color={colors.blue} />
            {sellerRows.map((row) => (
              <View key={row.name} style={styles.sellerRow}>
                <Text style={styles.sellerName} numberOfLines={1}>
                  {row.name}
                </Text>
                <View style={styles.sellerStats}>
                  <Text style={styles.sellerOk}>{row.delivered} ok</Text>
                  <Text style={row.undelivered > 0 ? styles.sellerPending : styles.sellerZero}>
                    {row.undelivered} pend.
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {loading ? <Text style={styles.loading}>Actualizando...</Text> : null}
      </ScrollView>
    </View>
  );
}

function SectionHeader({
  title,
  count,
  color,
}: {
  title: string;
  count: number;
  color: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
      <Text style={styles.sectionCount}>{count}</Text>
    </View>
  );
}

function MiniKpi({
  label,
  value,
  suffix,
  color,
}: {
  label: string;
  value: number;
  suffix?: string;
  color: string;
}) {
  return (
    <View style={styles.miniKpi}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={[styles.miniValue, { color }]}>
        {value}
        {suffix ? <Text style={styles.miniSuffix}>{suffix}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xl },
  kpiRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  miniKpi: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  miniLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  miniValue: {
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  miniSuffix: {
    fontSize: 10,
    color: colors.textMuted,
  },
  cta: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  ctaLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ctaText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '700',
  },
  empty: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    color: colors.textFaint,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  sellerBlock: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  sellerName: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.text,
    marginRight: spacing.sm,
  },
  sellerStats: { flexDirection: 'row', gap: spacing.md },
  sellerOk: { fontFamily: fonts.mono, fontSize: 11, color: colors.green, fontWeight: '700' },
  sellerPending: { fontFamily: fonts.mono, fontSize: 11, color: colors.amber, fontWeight: '700' },
  sellerZero: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
  loading: {
    textAlign: 'center',
    color: colors.textFaint,
    fontSize: 12,
    marginTop: spacing.md,
  },
});
