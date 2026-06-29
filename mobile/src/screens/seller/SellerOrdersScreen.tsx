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
import { useAuth } from '../../context/AuthContext';
import { useSellerOrdersContext } from '../../context/SellerOrdersContext';
import { Order, OrderStatus } from '../../types';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import OrderCard from '../../components/OrderCard';
import ConnectionBadge from '../../components/ui/ConnectionBadge';
import MonoLabel from '../../components/ui/MonoLabel';
import PostaMap from '../../components/PostaMap';
import { buildSellerFleetMarkers } from '../../utils/fleetMap';
import { SellerStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<SellerStackParamList, 'SellerOrders'>;
type Tab = 'active' | 'done' | 'archived';

function filterOrders(orders: Order[], tab: Tab): Order[] {
  if (tab === 'archived') return orders.filter((o) => o.archived);
  if (tab === 'done') {
    return orders.filter(
      (o) =>
        !o.archived &&
        (o.status === OrderStatus.DELIVERED || o.status === OrderStatus.CANCELLED)
    );
  }
  return orders.filter(
    (o) =>
      !o.archived &&
      o.status !== OrderStatus.DELIVERED &&
      o.status !== OrderStatus.CANCELLED
  );
}

export default function SellerOrdersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { orders, repartidores, loading, refreshing, connected, refresh } =
    useSellerOrdersContext();
  const [tab, setTab] = useState<Tab>('active');
  const [mapExpanded, setMapExpanded] = useState(true);

  const fleetMarkers = useMemo(
    () => buildSellerFleetMarkers(orders, repartidores),
    [orders, repartidores]
  );

  const data = useMemo(() => filterOrders(orders, tab), [orders, tab]);
  const activeCount = useMemo(() => filterOrders(orders, 'active').length, [orders]);
  const doneCount = useMemo(() => filterOrders(orders, 'done').length, [orders]);
  const archivedCount = useMemo(() => filterOrders(orders, 'archived').length, [orders]);

  const renderItem = ({ item }: { item: Order }) => (
    <OrderCard
      order={item}
      showRepartidor
      onPress={() => navigation.navigate('SellerOrderDetail', { orderId: item.id })}
    />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MonoLabel color={colors.stamp}>Posta Ventas</MonoLabel>
          <Text style={typography.displayTitle(22)}>{user?.name ?? 'Vendedor'}</Text>
          {user?.agencyName ? (
            <Text style={typography.body(12, colors.textMuted)}>{user.agencyName}</Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => navigation.navigate('Notifications')}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <Text style={styles.iconBtnText}>🔔</Text>
          </Pressable>
          <ConnectionBadge connected={connected} />
          <Pressable onPress={logout} hitSlop={8}>
            <Text style={styles.logout}>Salir</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          style={styles.primaryAction}
          onPress={() => navigation.navigate('CreateOrder')}
        >
          <Text style={typography.buttonLabel('#F6F0E4')}>Nuevo envío</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryAction}
          onPress={() => navigation.navigate('SellerSettings')}
        >
          <MonoLabel color={colors.textMuted}>Config</MonoLabel>
        </Pressable>
      </View>

      {tab === 'active' && (
        <View style={[styles.mapSection, !mapExpanded && styles.mapSectionCollapsed]}>
          <Pressable style={styles.mapHeader} onPress={() => setMapExpanded((v) => !v)}>
            <MonoLabel color={colors.textMuted}>Mapa en vivo</MonoLabel>
            <Text style={styles.mapToggle}>{mapExpanded ? 'Ocultar ▲' : 'Mostrar ▼'}</Text>
          </Pressable>
          {mapExpanded && (
            <PostaMap
              markers={fleetMarkers}
              style={styles.fleetMap}
              emptyLabel="Los repartidores aparecen acá cuando reportan GPS. Los puntos rojos/ámbar son tus envíos activos."
            />
          )}
          {mapExpanded && (
            <View style={styles.legend}>
              <Text style={styles.legendItem}>🔵 Repartidor</Text>
              <Text style={styles.legendItem}>🟠 En viaje</Text>
              <Text style={styles.legendItem}>🔴 Destino</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.tabs}>
        <TabButton
          active={tab === 'active'}
          label={`Activos (${activeCount})`}
          color={colors.accent}
          onPress={() => setTab('active')}
        />
        <TabButton
          active={tab === 'done'}
          label={`Finalizados (${doneCount})`}
          color={colors.green}
          onPress={() => setTab('done')}
        />
        <TabButton
          active={tab === 'archived'}
          label={`Archivados (${archivedCount})`}
          color={colors.textMuted}
          onPress={() => setTab('archived')}
        />
      </View>

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
            { paddingBottom: insets.bottom + spacing.xl },
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
              <Text style={styles.emptyText}>
                {tab === 'active'
                  ? 'No tenés envíos activos. Creá uno o importá desde Mercado Libre.'
                  : tab === 'done'
                    ? 'Todavía no hay envíos finalizados.'
                    : 'No hay envíos archivados.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function TabButton({
  active,
  label,
  color,
  onPress,
}: {
  active: boolean;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && { borderBottomColor: color, borderBottomWidth: 2 }]}
    >
      <Text
        style={[
          styles.tabLabel,
          {
            color: active ? color : colors.textFaint,
            fontFamily: active ? fonts.mono : fonts.bodyMedium,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerLeft: { flex: 1, minWidth: 0 },
  headerRight: { alignItems: 'flex-end', gap: 8 },
  iconBtn: { padding: 4 },
  iconBtnText: { fontSize: 18 },
  logout: {
    fontFamily: fonts.bodySemiBold,
    color: colors.red,
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.stamp,
    borderRadius: radius.posta,
    paddingVertical: spacing.md,
  },
  secondaryAction: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.posta,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  mapSection: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.posta,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  mapSectionCollapsed: {
    marginBottom: spacing.sm,
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  mapToggle: {
    ...typography.body(11, colors.accent),
    fontFamily: fonts.bodySemiBold,
  },
  fleetMap: {
    height: 220,
    flex: undefined,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  legendItem: {
    ...typography.body(10, colors.textMuted),
  },
  tabs: {
    flexDirection: 'row',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  tab: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  tabLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  list: { padding: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingTop: 80, paddingHorizontal: spacing.xl },
  emptyText: {
    color: colors.textFaint,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
});
