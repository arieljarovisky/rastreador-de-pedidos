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
import PostaIcon from '../../components/icons/PostaIcons';
import DashboardHeader from '../../components/ui/DashboardHeader';
import EmptyState from '../../components/ui/EmptyState';
import ListTabButton from '../../components/ui/ListTabButton';
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
      <DashboardHeader
        eyebrow="Posta Agencia"
        title={user?.agencyName ?? user?.name ?? 'Agencia'}
        subtitle={`${repartidores.length} repartidores · ${enRouteCount} en ruta`}
        connected={connected}
        accentColor={colors.blue}
        onNotifications={() => navigation.navigate('AgencyNotifications')}
        onLogout={logout}
      />

      <View style={styles.actionsRow}>
        <Pressable
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          onPress={() => navigation.navigate('AgencyScan')}
        >
          <PostaIcon name="scan" size={16} color="#F6F0E4" strokeWidth={2} />
          <Text style={typography.buttonLabel('#F6F0E4')}>Escanear ML</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
          onPress={() => navigation.navigate('AgencySettings')}
        >
          <PostaIcon name="settings" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      {tab !== 'done' && (
        <View style={[styles.mapSection, !mapExpanded && styles.mapSectionCollapsed]}>
          <Pressable style={styles.mapHeader} onPress={() => setMapExpanded((v) => !v)}>
            <View style={styles.mapTitleRow}>
              <PostaIcon name="live" size={14} color={colors.green} />
              <Text style={styles.mapTitle}>Mapa de flota</Text>
            </View>
            <View style={styles.mapToggleRow}>
              <Text style={styles.mapToggle}>{mapExpanded ? 'Ocultar' : 'Mostrar'}</Text>
              <PostaIcon
                name={mapExpanded ? 'chevronUp' : 'chevronDown'}
                size={14}
                color={colors.accent}
              />
            </View>
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
        <ListTabButton
          active={tab === 'active'}
          icon="motorcycle"
          label="Activos"
          count={activeCount}
          color={colors.accent}
          onPress={() => setTab('active')}
        />
        <ListTabButton
          active={tab === 'pending'}
          icon="package"
          label="Despacho"
          count={pendingCount}
          color={colors.blue}
          onPress={() => setTab('pending')}
        />
        <ListTabButton
          active={tab === 'done'}
          icon="checkCircle"
          label="Cerrados"
          count={doneCount}
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
            data.length === 0 && styles.listEmpty,
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
            tab === 'active' ? (
              <EmptyState
                icon="motorcycle"
                title="Sin envíos activos"
                message="Cuando haya pedidos en curso los vas a ver acá con seguimiento en vivo."
              />
            ) : tab === 'pending' ? (
              <EmptyState
                icon="package"
                title="Sin pendientes de despacho"
                message="Los pedidos por asignar o listos para salir aparecen en esta pestaña."
              />
            ) : (
              <EmptyState
                icon="checkCircle"
                title="Sin envíos cerrados"
                message="Entregas y cancelaciones finalizadas se listan acá."
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.stamp,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  secondaryAction: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  pressed: { opacity: 0.88 },
  mapSection: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  mapSectionCollapsed: { marginBottom: spacing.sm },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  mapTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mapTitle: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  mapToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mapToggle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.accent,
  },
  fleetMap: { height: 200 },
  tabs: {
    flexDirection: 'row',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  listEmpty: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
