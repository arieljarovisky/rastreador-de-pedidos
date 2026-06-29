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
import { useAuth } from '../context/AuthContext';
import { useOrdersContext } from '../context/OrdersContext';
import { Order, OrderStatus } from '../types';
import { colors, radius, spacing } from '../theme';
import OrderCard from '../components/OrderCard';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Orders'>;
type Tab = 'assigned' | 'available';

export default function OrdersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { orders, loading, refreshing, connected, refresh } = useOrdersContext();
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

  const renderItem = ({ item }: { item: Order }) => (
    <OrderCard
      order={item}
      onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
    />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola,</Text>
          <Text style={styles.name}>{user?.name ?? 'Repartidor'}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.connRow}>
            <View
              style={[
                styles.dot,
                { backgroundColor: connected ? colors.green : colors.red },
              ]}
            />
            <Text style={styles.connText}>
              {connected ? 'En vivo' : 'Sin conexión'}
            </Text>
          </View>
          <Pressable onPress={logout} hitSlop={8}>
            <Text style={styles.logout}>Salir</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.tabs}>
        <TabButton
          active={tab === 'assigned'}
          label={`🏍️  Mis Envíos (${myAssigned.length})`}
          color={colors.blue}
          onPress={() => setTab('assigned')}
        />
        <TabButton
          active={tab === 'available'}
          label={`📦  Disponibles (${available.length})`}
          color={colors.purple}
          onPress={() => setTab('available')}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.blue} />
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
              tintColor={colors.blue}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {tab === 'assigned'
                  ? 'No tenés envíos asignados. Mirá la pestaña Disponibles para tomar uno.'
                  : 'No hay pedidos disponibles por ahora.'}
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
      style={[
        styles.tab,
        active && { borderBottomColor: color, borderBottomWidth: 2 },
      ]}
    >
      <Text style={[styles.tabLabel, { color: active ? color : colors.textFaint }]}>
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
    paddingBottom: spacing.lg,
  },
  greeting: { color: colors.textFaint, fontSize: 13 },
  name: { color: colors.text, fontSize: 22, fontWeight: '800' },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  connRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  connText: { color: colors.textMuted, fontSize: 11 },
  logout: { color: colors.red, fontSize: 13, fontWeight: '600' },
  tabs: {
    flexDirection: 'row',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  tab: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  tabLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
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
