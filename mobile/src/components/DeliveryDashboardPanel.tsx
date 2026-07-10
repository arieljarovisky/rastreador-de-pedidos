import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Order, OrderStatus, User } from '../types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { TAB_BAR_CLEARANCE } from '../constants/layout';
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

const PREVIEW_UNDELIVERED = 5;
const PREVIEW_DELIVERED = 3;

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

  const [showDelivered, setShowDelivered] = useState(false);
  const [showSellers, setShowSellers] = useState(false);

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
  const undeliveredPreview = undelivered.slice(0, PREVIEW_UNDELIVERED);
  const deliveredPreview = delivered.slice(0, PREVIEW_DELIVERED);

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
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: TAB_BAR_CLEARANCE + insets.bottom + spacing.lg },
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={accentColor} />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
      >
        <DeliverySummaryCard orders={orders} accentColor={accentColor} />

        <View style={styles.kpiRow}>
          <MiniKpi
            icon="motorcycle"
            label="En ruta"
            value={statusBreakdown.delivering}
            color={colors.amber}
          />
          <MiniKpi
            icon="package"
            label="Despacho"
            value={statusBreakdown.pending + statusBreakdown.assigned}
            color={accentColor}
          />
          {isAgency ? (
            <MiniKpi
              icon="live"
              label="GPS activo"
              value={gpsCount}
              suffix={`/${repartidores.length}`}
              color={colors.green}
            />
          ) : (
            <MiniKpi icon="inbox" label="Total hoy" value={summary.total} color={colors.textMuted} />
          )}
        </View>

        {onGoToOrders ? (
          <Pressable
            style={({ pressed }) => [styles.cta, { borderColor: `${accentColor}44` }, pressed && styles.pressed]}
            onPress={onGoToOrders}
          >
            <View style={[styles.ctaIcon, { backgroundColor: `${accentColor}18` }]}>
              <PostaIcon name="motorcycle" size={18} color={accentColor} />
            </View>
            <View style={styles.ctaTextWrap}>
              <Text style={styles.ctaTitle}>Mapa y pedidos en vivo</Text>
              <Text style={styles.ctaSub}>
                {undelivered.length} pendiente{undelivered.length === 1 ? '' : 's'}
                {isAgency
                  ? ` · ${repartidores.length} repartidor${repartidores.length === 1 ? '' : 'es'}`
                  : ''}
              </Text>
            </View>
            <PostaIcon name="chevronRight" size={16} color={accentColor} />
          </Pressable>
        ) : null}

        <CollapsibleSection
          title="Sin entregar hoy"
          count={undelivered.length}
          color={colors.amber}
          expanded
          onToggle={() => undefined}
          hideToggle
        >
          {undelivered.length === 0 ? (
            <View style={styles.emptyBox}>
              <PostaIcon name="checkCircle" size={24} color={colors.green} strokeWidth={1.5} />
              <Text style={styles.emptyText}>¡Todo entregado por hoy!</Text>
            </View>
          ) : (
            <>
              {undeliveredPreview.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  showRepartidor
                  showSeller={isAgency}
                  onPress={() => onOrderPress(order.id)}
                />
              ))}
              {undelivered.length > PREVIEW_UNDELIVERED && onGoToOrders ? (
                <Pressable style={styles.seeAll} onPress={onGoToOrders}>
                  <Text style={[styles.seeAllText, { color: accentColor }]}>
                    Ver los {undelivered.length} pendientes
                  </Text>
                  <PostaIcon name="chevronRight" size={14} color={accentColor} />
                </Pressable>
              ) : null}
            </>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Entregados hoy"
          count={delivered.length}
          color={colors.green}
          expanded={showDelivered}
          onToggle={() => setShowDelivered((v) => !v)}
        >
          {delivered.length === 0 ? (
            <Text style={styles.emptyInline}>Todavía no hay entregas registradas hoy.</Text>
          ) : showDelivered ? (
            <>
              {deliveredPreview.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  showRepartidor
                  showSeller={isAgency}
                  onPress={() => onOrderPress(order.id)}
                />
              ))}
              {delivered.length > PREVIEW_DELIVERED && onGoToOrders ? (
                <Pressable style={styles.seeAll} onPress={onGoToOrders}>
                  <Text style={[styles.seeAllText, { color: colors.green }]}>
                    Ver los {delivered.length} entregados
                  </Text>
                  <PostaIcon name="chevronRight" size={14} color={colors.green} />
                </Pressable>
              ) : null}
            </>
          ) : null}
        </CollapsibleSection>

        {isAgency && sellerRows.length > 0 ? (
          <CollapsibleSection
            title="Por vendedor"
            count={sellerRows.length}
            color={accentColor}
            expanded={showSellers}
            onToggle={() => setShowSellers((v) => !v)}
          >
            {showSellers ? (
              <View style={styles.sellerBlock}>
                {sellerRows.map((row) => (
                  <View key={row.name} style={styles.sellerRow}>
                    <View style={styles.sellerLeft}>
                      <View style={styles.sellerAvatar}>
                        <Text style={styles.sellerAvatarText}>{row.name.slice(0, 2).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.sellerName} numberOfLines={1}>
                        {row.name}
                      </Text>
                    </View>
                    <View style={styles.sellerStats}>
                      <View style={[styles.statPill, styles.statPillOk]}>
                        <Text style={styles.statPillTextOk}>{row.delivered} ok</Text>
                      </View>
                      <View
                        style={[
                          styles.statPill,
                          row.undelivered > 0 ? styles.statPillWarn : styles.statPillZero,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statPillText,
                            row.undelivered > 0 ? styles.statPillTextWarn : styles.statPillTextZero,
                          ]}
                        >
                          {row.undelivered} pend.
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </CollapsibleSection>
        ) : null}

        {loading ? <Text style={styles.loading}>Actualizando…</Text> : null}
      </ScrollView>
    </View>
  );
}

function CollapsibleSection({
  title,
  count,
  color,
  expanded,
  onToggle,
  hideToggle,
  children,
}: {
  title: string;
  count: number;
  color: string;
  expanded: boolean;
  onToggle: () => void;
  hideToggle?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Pressable
        onPress={hideToggle ? undefined : onToggle}
        style={styles.sectionHeader}
        disabled={hideToggle}
      >
        <View style={styles.sectionLeft}>
          <View style={[styles.sectionDot, { backgroundColor: color }]} />
          <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
        </View>
        <View style={styles.sectionRight}>
          <View style={[styles.countBadge, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
            <Text style={[styles.sectionCount, { color }]}>{count}</Text>
          </View>
          {!hideToggle ? (
            <PostaIcon
              name={expanded ? 'chevronUp' : 'chevronDown'}
              size={16}
              color={colors.textMuted}
            />
          ) : null}
        </View>
      </Pressable>
      {expanded ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function MiniKpi({
  icon,
  label,
  value,
  suffix,
  color,
}: {
  icon: 'motorcycle' | 'package' | 'live' | 'inbox';
  label: string;
  value: number;
  suffix?: string;
  color: string;
}) {
  return (
    <View style={styles.miniKpi}>
      <PostaIcon name={icon} size={14} color={color} strokeWidth={1.75} />
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
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: 3,
  },
  miniLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.textMuted,
    textAlign: 'center',
  },
  miniValue: {
    fontFamily: fonts.mono,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 1,
  },
  miniSuffix: {
    fontSize: 10,
    color: colors.textMuted,
  },
  cta: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  ctaIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTextWrap: { flex: 1 },
  ctaTitle: {
    ...typography.bodyMedium(14, colors.text),
  },
  ctaSub: {
    ...typography.body(12, colors.textMuted),
    marginTop: 2,
  },
  pressed: { opacity: 0.88 },
  section: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  sectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countBadge: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCount: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionBody: {
    marginTop: spacing.xs,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    ...typography.bodyMedium(14, colors.green),
  },
  emptyInline: {
    color: colors.textFaint,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.md,
  },
  seeAllText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
  sellerBlock: {
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
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  sellerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginRight: spacing.sm,
  },
  sellerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerAvatarText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  sellerName: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.text,
  },
  sellerStats: { flexDirection: 'row', gap: spacing.xs },
  statPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statPillOk: {
    backgroundColor: colors.greenBg,
    borderColor: colors.greenBorder,
  },
  statPillWarn: {
    backgroundColor: colors.amberBg,
    borderColor: `${colors.amber}44`,
  },
  statPillZero: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  statPillTextOk: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.green,
  },
  statPillText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
  },
  statPillTextWarn: { color: colors.amber },
  statPillTextZero: { color: colors.textMuted },
  loading: {
    textAlign: 'center',
    color: colors.textFaint,
    fontSize: 12,
    marginTop: spacing.md,
  },
});
