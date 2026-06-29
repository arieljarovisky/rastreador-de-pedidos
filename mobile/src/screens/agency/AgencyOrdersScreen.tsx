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
import { useAgencyOrdersContext } from '../../context/AgencyOrdersContext';
import { Order, OrderStatus } from '../../types';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import OrderCard from '../../components/OrderCard';
import ConnectionBadge from '../../components/ui/ConnectionBadge';
import MonoLabel from '../../components/ui/MonoLabel';
import PostaMap from '../../components/PostaMap';
import { buildSellerFleetMarkers } from '../../utils/fleetMap';
import { AgencyStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AgencyStackParamList, 'AgencyOrders'>;
type Tab = 'active' | 'pending' | 'done';

function filterOrders(orders: Order[], tab: Tab): Order[] {
  if (tab === 'pending') {
    return orders.filter(
      (o) =>
        !o.archived &&
        (o.status === OrderStatus.PENDING || o.status === OrderStatus.ASSIGNED)
    );
  }
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

export default function AgencyOrdersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { orders, repartidores, loading, refreshing, connected, refresh } =
    useAgencyOrdersContext();
  const [tab, setTab] = useState<Tab>('active');
  const [mapExpanded, setMapExpanded] = useState(true);

  const fleetMarkers = useMemo(
    () => buildSellerFleetMarkers(orders, repartidores),
    [orders, repartidores]
  );

  const data = useMemo(() => filterOrders(orders, tab), [orders, tab]);
  const activeCount = useMemo(() => filterOrders(orders, 'active').length, [orders]);
  const pendingCount = useMemo(() => filterOrders(orders, 'pending').length, [orders]);
  const doneCount = useMemo(() => filterOrders(orders, 'done').length, [orders]);
  const enRouteCount = useMemo(
    () => orders.filter((o) => o.status === OrderStatus.DELIVERING).length,
    [orders]
  );

  const renderItem = ({ item }: { item: Order }) => (
    <OrderCard
      order={item}
      showRepartidor
      showSeller
      onPress={() => navigation.navigate('AgencyOrderDetail', { orderId: item.id })}
    />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MonoLabel color={colors.blue}>Posta Agencia</MonoLabel>
          <Text style={typography.displayTitle(22)}>{user?.agencyName ?? user?.name}</Text>
          <Text style={typography.body(12, colors.textMuted)}>
            {repartidores.length} repartidores · {enRouteCount} en ruta
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => navigation.navigate('AgencyNotifications')}
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
          onPress={() => navigation.navigate('AgencyScan')}
        >
          <Text style={typography.buttonLabel('#F6F0E4')}>Escanear ML</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryAction}
          onPress={() => navigation.navigate('AgencySettings')}
        >
          <MonoLabel color={colors.textMuted}>Agencia</MonoLabel>
        </Pressable>
      </View>

      {tab !== 'done' && (
        <View style={[styles.mapSection, !mapExpanded && styles.mapSectionCollapsed]}>
          <Pressable style={styles.mapHeader} onPress={() => setMapExpanded((v) => !v)}>
            <MonoLabel color={colors.textMuted}>Mapa de flota</MonoLabel>
            <Text style={styles.mapToggle}>{mapExpanded ? 'Ocultar ▲' : 'Mostrar ▼'}</Text>
          </Pressable>
          {mapExpanded && (
            <PostaMap
              markers={fleetMarkers}
              style={styles.fleetMap}
              emptyLabel="Los repartidores aparecen cuando reportan GPS. Los puntos de color son envíos activos."
            />
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
          active={tab === 'pending'}
          label={`Despacho (${pendingCount})`}
          color={colors.blue}
          onPress={() => setTab('pending')}
        />
        <TabButton
          active={tab === 'done'}
          label={`Cerrados (${doneCount})`}
          color={colors.green}
          onPress={() => setTab('done')}
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
                  ? 'No hay envíos activos en este momento.'
                  : tab === 'pending'
                    ? 'No hay envíos pendientes de despacho.'
                    : 'No hay envíos cerrados todavía.'}
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
      style={[styles.tabBtn, active && { borderBottomColor: color, borderBottomWidth: 2 }]}
    >
      <Text style={[styles.tabLabel, active && { color, fontFamily: fonts.bodySemiBold }]}>
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
    paddingBottom: spacing.md,
  },
  headerLeft: { flex: 1, gap: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBtn: { padding: 4 },
  iconBtnText: { fontSize: 18 },
  logout: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted, letterSpacing: 0.5 },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  primaryAction: {
    flex: 1,
    backgroundColor: colors.stamp,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryAction: {
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  mapSection: { marginHorizontal: spacing.xl, marginBottom: spacing.md },
  mapSectionCollapsed: { marginBottom: spacing.sm },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  mapToggle: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted },
  fleetMap: { height: 200, borderRadius: radius.lg },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  tabBtn: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  tabLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingTop: 48, paddingHorizontal: spacing.lg },
  emptyText: { color: colors.textFaint, textAlign: 'center', fontSize: 14, lineHeight: 20 },
});
