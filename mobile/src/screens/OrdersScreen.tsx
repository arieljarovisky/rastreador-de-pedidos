import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CompositeScreenProps } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useOrdersContext } from '../context/OrdersContext';
import { Order, OrderStatus } from '../types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import OrderCard from '../components/OrderCard';
import RepartidorMlConnectBar from '../components/RepartidorMlConnectBar';
import PostaIcon from '../components/icons/PostaIcons';
import ConnectionBadge from '../components/ui/ConnectionBadge';
import MonoLabel from '../components/ui/MonoLabel';
import { TAB_BAR_CLEARANCE } from '../constants/layout';
import { RepartidorHomeStackParamList, RepartidorStackParamList } from '../navigation/types';

type Props = CompositeScreenProps<
  NativeStackScreenProps<RepartidorHomeStackParamList, 'Orders'>,
  NativeStackScreenProps<RepartidorStackParamList>
>;
type Tab = 'assigned' | 'available';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function OrdersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { orders, loading, refreshing, connected, error, refresh } = useOrdersContext();
  const [tab, setTab] = useState<Tab>('assigned');

  const myAssigned = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.repartidorId === user?.id &&
          o.status !== OrderStatus.DELIVERED &&
          o.status !== OrderStatus.CANCELLED
      ),
    [orders, user?.id]
  );

  const available = useMemo(
    () => orders.filter((o) => o.status === OrderStatus.PENDING),
    [orders]
  );

  const data = tab === 'assigned' ? myAssigned : available;
  const displayName = user?.name ?? 'Repartidor';

  const renderItem = ({ item }: { item: Order }) => (
    <OrderCard
      order={item}
      onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
    />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(displayName)}</Text>
          </View>
          <View style={styles.headerText}>
            <MonoLabel color={colors.textFaint}>Repartidor</MonoLabel>
            <Text style={typography.displayTitle(20)} numberOfLines={1}>
              {displayName}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <ConnectionBadge connected={connected} />
        </View>
      </View>

      <RepartidorMlConnectBar />

      <View style={styles.tabs}>
        <TabButton
          active={tab === 'assigned'}
          icon="motorcycle"
          label="Mis envíos"
          count={myAssigned.length}
          color={colors.blue}
          onPress={() => setTab('assigned')}
        />
        <TabButton
          active={tab === 'available'}
          icon="package"
          label="Disponibles"
          count={available.length}
          color={colors.purple}
          onPress={() => setTab('available')}
        />
      </View>

      {error && !loading ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void refresh()} hitSlop={8}>
            <Text style={styles.retryLink}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(o) => o.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.list,
            data.length === 0 && styles.listEmpty,
            { paddingBottom: TAB_BAR_CLEARANCE + spacing.lg },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <PostaIcon
                  name={tab === 'assigned' ? 'inbox' : 'package'}
                  size={32}
                  color={colors.textFaint}
                  strokeWidth={1.5}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {tab === 'assigned' ? 'Sin envíos asignados' : 'Nada disponible ahora'}
              </Text>
              <Text style={styles.emptyText}>
                {tab === 'assigned'
                  ? 'Tomá un pedido de la pestaña Disponibles para empezar a repartir.'
                  : 'Cuando haya pedidos nuevos van a aparecer acá automáticamente.'}
              </Text>
              {tab === 'assigned' && available.length > 0 ? (
                <Pressable
                  style={styles.emptyCta}
                  onPress={() => setTab('available')}
                >
                  <PostaIcon name="package" size={16} color={colors.purple} />
                  <Text style={styles.emptyCtaText}>
                    Ver {available.length} disponible{available.length === 1 ? '' : 's'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

function TabButton({
  active,
  icon,
  label,
  count,
  color,
  onPress,
}: {
  active: boolean;
  icon: 'motorcycle' | 'package';
  label: string;
  count: number;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && { borderBottomColor: color, borderBottomWidth: 2 }]}
    >
      <View style={styles.tabInner}>
        <PostaIcon
          name={icon}
          size={16}
          color={active ? color : colors.textFaint}
          strokeWidth={1.75}
        />
        <Text
          style={[
            styles.tabLabel,
            { color: active ? color : colors.textFaint, fontFamily: active ? fonts.mono : fonts.bodyMedium },
          ]}
        >
          {label}
        </Text>
        <View style={[styles.tabBadge, active ? { backgroundColor: `${color}22`, borderColor: `${color}55` } : styles.tabBadgeIdle]}>
          <Text style={[styles.tabBadgeText, { color: active ? color : colors.textFaint }]}>{count}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.accentBg,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  tabBadge: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeIdle: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  tabBadgeText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
  },
  list: { padding: spacing.lg },
  listEmpty: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBox: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.redBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.red,
    gap: spacing.xs,
  },
  errorText: { color: colors.red, fontSize: 13, lineHeight: 18 },
  retryLink: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    alignSelf: 'flex-start',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.displaySection(16, colors.text),
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.posta,
    backgroundColor: 'rgba(155, 126, 222, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(155, 126, 222, 0.35)',
  },
  emptyCtaText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.purple,
  },
});
