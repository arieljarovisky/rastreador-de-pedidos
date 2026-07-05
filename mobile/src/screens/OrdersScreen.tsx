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
import { colors, roleAccents, spacing, typography } from '../theme';
import OrderCard from '../components/OrderCard';
import RepartidorMlConnectBar from '../components/RepartidorMlConnectBar';
import ConnectionBadge from '../components/ui/ConnectionBadge';
import EmptyState from '../components/ui/EmptyState';
import ListTabBar from '../components/ui/ListTabBar';
import ListTabButton from '../components/ui/ListTabButton';
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
  const accent = roleAccents.repartidor;
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
          <View style={[styles.avatar, { backgroundColor: `${accent}18`, borderColor: `${accent}44` }]}>
            <Text style={[styles.avatarText, { color: accent }]}>{initials(displayName)}</Text>
          </View>
          <View style={styles.headerText}>
            <MonoLabel color={colors.textFaint}>Repartidor</MonoLabel>
            <Text style={typography.displayTitle(20)} numberOfLines={1}>
              {displayName}
            </Text>
          </View>
        </View>
        <ConnectionBadge connected={connected} />
      </View>

      <RepartidorMlConnectBar />

      <ListTabBar>
        <ListTabButton
          active={tab === 'assigned'}
          icon="motorcycle"
          label="Mis envíos"
          count={myAssigned.length}
          color={accent}
          onPress={() => setTab('assigned')}
        />
        <ListTabButton
          active={tab === 'available'}
          icon="package"
          label="Disponibles"
          count={available.length}
          color={colors.purple}
          onPress={() => setTab('available')}
        />
      </ListTabBar>

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
          <ActivityIndicator color={accent} />
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
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon={tab === 'assigned' ? 'inbox' : 'package'}
              title={tab === 'assigned' ? 'Sin envíos asignados' : 'Nada disponible ahora'}
              message={
                tab === 'assigned'
                  ? 'Tomá un pedido de la pestaña Disponibles para empezar a repartir.'
                  : 'Cuando haya pedidos nuevos van a aparecer acá automáticamente.'
              }
              action={
                tab === 'assigned' && available.length > 0
                  ? {
                      label: `Ver ${available.length} disponible${available.length === 1 ? '' : 's'}`,
                      icon: 'package',
                      color: colors.purple,
                      onPress: () => setTab('available'),
                    }
                  : undefined
              }
            />
          }
        />
      )}
    </View>
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
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 14,
    fontWeight: '700',
  },
  headerText: { flex: 1, minWidth: 0 },
  list: { padding: spacing.lg },
  listEmpty: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBox: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.redBg,
    borderRadius: 8,
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
});
