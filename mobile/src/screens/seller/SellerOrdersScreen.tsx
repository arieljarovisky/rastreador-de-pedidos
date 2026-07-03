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
import PostaIcon from '../../components/icons/PostaIcons';
import DashboardHeader from '../../components/ui/DashboardHeader';
import EmptyState from '../../components/ui/EmptyState';
import ListTabButton from '../../components/ui/ListTabButton';
import MapLegendItem from '../../components/ui/MapLegendItem';
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
      <DashboardHeader
        eyebrow="Posta Ventas"
        title={user?.name ?? 'Vendedor'}
        subtitle={user?.agencyName ?? undefined}
        connected={connected}
        accentColor={colors.stamp}
        onNotifications={() => navigation.navigate('Notifications')}
        onLogout={logout}
      />

      <View style={styles.actionsRow}>
        <Pressable
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          onPress={() => navigation.navigate('CreateOrder')}
        >
          <PostaIcon name="plus" size={16} color="#F6F0E4" strokeWidth={2} />
          <Text style={typography.buttonLabel('#F6F0E4')}>Nuevo envío</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
          onPress={() => navigation.navigate('SellerSettings')}
        >
          <PostaIcon name="settings" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      {tab === 'active' && (
        <View style={[styles.mapSection, !mapExpanded && styles.mapSectionCollapsed]}>
          <Pressable style={styles.mapHeader} onPress={() => setMapExpanded((v) => !v)}>
            <View style={styles.mapTitleRow}>
              <PostaIcon name="live" size={14} color={colors.green} />
              <Text style={styles.mapTitle}>Mapa en vivo</Text>
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
              emptyLabel="Los repartidores aparecen acá cuando reportan GPS. Los puntos de color son tus envíos activos."
            />
          )}
          {mapExpanded && (
            <View style={styles.legend}>
              <MapLegendItem color={colors.blue} label="Repartidor" />
              <MapLegendItem color={colors.amber} label="En viaje" />
              <MapLegendItem color={colors.stamp} label="Destino" />
            </View>
          )}
        </View>
      )}

      <View style={styles.tabs}>
        <ListTabButton
          active={tab === 'active'}
          icon="package"
          label="Activos"
          count={activeCount}
          color={colors.accent}
          onPress={() => setTab('active')}
        />
        <ListTabButton
          active={tab === 'done'}
          icon="checkCircle"
          label="Finalizados"
          count={doneCount}
          color={colors.green}
          onPress={() => setTab('done')}
        />
        <ListTabButton
          active={tab === 'archived'}
          icon="inbox"
          label="Archivados"
          count={archivedCount}
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
                icon="package"
                title="Sin envíos activos"
                message="Creá un envío manual o importá desde Mercado Libre / Tienda Nube."
              />
            ) : tab === 'done' ? (
              <EmptyState
                icon="checkCircle"
                title="Sin envíos finalizados"
                message="Los pedidos entregados o cancelados van a aparecer acá."
              />
            ) : (
              <EmptyState
                icon="inbox"
                title="Sin archivados"
                message="Archivá envíos cerrados para mantener la lista ordenada."
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
  fleetMap: { height: 220, flex: undefined },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xs,
  },
  list: { padding: spacing.lg },
  listEmpty: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
