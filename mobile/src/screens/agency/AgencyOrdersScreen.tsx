import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CompositeScreenProps } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useAgencyOrdersContext } from '../../context/AgencyOrdersContext';
import { Order, OrderStatus } from '../../types';
import { colors, fonts, radius, roleAccents, spacing } from '../../theme';
import AgencyTopBar from '../../components/agency/AgencyTopBar';
import AgencyOrderStub from '../../components/agency/AgencyOrderStub';
import PostaIcon from '../../components/icons/PostaIcons';
import { TAB_BAR_CLEARANCE } from '../../constants/layout';
import { api } from '../../api';
import {
  channelLabel,
  isClosedOrder,
  isLateOrder,
  shortOrderCode,
} from '../../utils/agencyPanel';
import {
  getOperationalDateKey,
  getTodayOrders,
} from '../../utils/deliverySummary';
import { AgencyOrdersStackParamList, AgencyStackParamList } from '../../navigation/types';

type Props = CompositeScreenProps<
  NativeStackScreenProps<AgencyOrdersStackParamList, 'AgencyOrders'>,
  NativeStackScreenProps<AgencyStackParamList>
>;

type Period = 'hoy' | 'ayer' | '7d' | 'todos';
type FilterKey =
  | 'todos'
  | 'vencidos'
  | 'sinasignar'
  | 'almacen'
  | 'despacho'
  | 'ruta'
  | 'entregado'
  | 'devuelto';

const accent = roleAccents.agency;

function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function orderDateKey(order: Order): string {
  if (order.deliveryDeadline) {
    return getOperationalDateKey(new Date(order.deliveryDeadline));
  }
  return getOperationalDateKey(new Date(order.createdAt));
}

function matchesFilter(order: Order, filter: FilterKey): boolean {
  if (filter === 'todos') return true;
  if (filter === 'vencidos') return isLateOrder(order);
  if (filter === 'sinasignar') return !isClosedOrder(order) && !order.repartidorId;
  if (filter === 'almacen') return order.status === OrderStatus.PENDING;
  if (filter === 'despacho') return order.status === OrderStatus.ASSIGNED;
  if (filter === 'ruta') return order.status === OrderStatus.DELIVERING;
  if (filter === 'entregado') return order.status === OrderStatus.DELIVERED;
  if (filter === 'devuelto') return order.status === OrderStatus.CANCELLED;
  return true;
}

export default function AgencyOrdersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<AgencyOrdersStackParamList, 'AgencyOrders'>>();
  const { user, token } = useAuth();
  const { orders, refreshing, refresh } = useAgencyOrdersContext();
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [period, setPeriod] = useState<Period>('hoy');
  const [filter, setFilter] = useState<FilterKey>(
    (route.params?.filter as FilterKey) || 'todos'
  );
  const [query, setQuery] = useState('');

  const loadNotifs = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getNotifications(token);
      setUnreadNotifs(data.filter((n) => !n.read).length);
    } catch {
      // ignore
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void loadNotifs();
      const incoming = route.params?.filter as FilterKey | undefined;
      if (incoming) {
        setFilter(incoming);
        setPeriod('hoy');
      }
    }, [loadNotifs, route.params?.filter])
  );

  const todayKey = getOperationalDateKey();

  const inPeriod = useMemo(() => {
    const open = orders.filter((o) => !o.archived);
    if (period === 'hoy') return getTodayOrders(open, todayKey);
    if (period === 'ayer') return getTodayOrders(open, shiftDateKey(todayKey, -1));
    if (period === '7d') {
      const from = shiftDateKey(todayKey, -6);
      return open.filter((o) => {
        const k = orderDateKey(o);
        return k >= from && k <= todayKey;
      });
    }
    return open;
  }, [orders, period, todayKey]);

  const chipDefs = useMemo(() => {
    const late = inPeriod.filter((o) => isLateOrder(o)).length;
    const sin = inPeriod.filter((o) => !isClosedOrder(o) && !o.repartidorId).length;
    const defs: { key: FilterKey; label: string; count: number }[] = [
      { key: 'todos', label: 'Todos', count: inPeriod.length },
    ];
    if (late) defs.push({ key: 'vencidos', label: 'Vencidos', count: late });
    if (sin) defs.push({ key: 'sinasignar', label: 'Sin asignar', count: sin });
    const byStatus: [FilterKey, string, OrderStatus][] = [
      ['almacen', 'Almacén', OrderStatus.PENDING],
      ['despacho', 'Despacho', OrderStatus.ASSIGNED],
      ['ruta', 'En ruta', OrderStatus.DELIVERING],
      ['entregado', 'Entregadas', OrderStatus.DELIVERED],
      ['devuelto', 'Devueltas', OrderStatus.CANCELLED],
    ];
    for (const [key, label, status] of byStatus) {
      const count = inPeriod.filter((o) => o.status === status).length;
      if (count) defs.push({ key, label, count });
    }
    return defs;
  }, [inPeriod]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inPeriod
      .filter((o) => matchesFilter(o, filter))
      .filter((o) => {
        if (!q) return true;
        const hay = `${o.clientName} ${shortOrderCode(o)} ${o.address} ${channelLabel(o)} ${o.sellerName ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const aLate = isLateOrder(a) ? 0 : 1;
        const bLate = isLateOrder(b) ? 0 : 1;
        if (aLate !== bLate) return aLate - bLate;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [inPeriod, filter, query]);

  const deliveredCount = inPeriod.filter((o) => o.status === OrderStatus.DELIVERED).length;
  const cancelledCount = inPeriod.filter((o) => o.status === OrderStatus.CANCELLED).length;
  const lateCount = inPeriod.filter((o) => isLateOrder(o)).length;
  const sinCount = inPeriod.filter((o) => !isClosedOrder(o) && !o.repartidorId).length;

  const summaryDetail =
    deliveredCount || cancelledCount
      ? `${deliveredCount} entregadas · ${cancelledCount} devueltas`
      : `${lateCount} vencidos · ${sinCount} sin asignar`;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AgencyTopBar
        agencyName={user?.agencyName ?? user?.name ?? 'Agencia'}
        notificationCount={unreadNotifs}
        onNotifications={() => navigation.navigate('AgencyNotifications')}
      />

      <FlatList
        data={visible}
        keyExtractor={(o) => o.id}
        renderItem={({ item }) => (
          <AgencyOrderStub
            order={item}
            onPress={() => navigation.navigate('AgencyOrderDetail', { orderId: item.id })}
          />
        )}
        contentContainerStyle={[
          styles.list,
          visible.length === 0 && styles.listEmpty,
          { paddingBottom: TAB_BAR_CLEARANCE + insets.bottom + spacing.lg },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />
        }
        ListHeaderComponent={
          <View>
            <Text style={styles.eyebrow}>Período</Text>
            <View style={styles.dates}>
              {(
                [
                  ['hoy', 'Hoy'],
                  ['ayer', 'Ayer'],
                  ['7d', '7 días'],
                  ['todos', 'Todos'],
                ] as const
              ).map(([key, label]) => {
                const on = period === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      setPeriod(key);
                      setFilter('todos');
                    }}
                    style={[
                      styles.dateBtn,
                      on && { backgroundColor: `${accent}18`, borderColor: `${accent}55` },
                    ]}
                  >
                    <Text style={[styles.dateBtnText, on && { color: accent }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.search}>
              <PostaIcon name="search" size={16} color={colors.textFaint} strokeWidth={1.8} />
              <TextInput
                style={styles.searchInput}
                placeholder="Cliente, código, zona o vendedor"
                placeholderTextColor={colors.textFaint}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.chips}>
              {chipDefs.map((chip) => {
                const on = filter === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => setFilter(chip.key)}
                    style={[
                      styles.chip,
                      on && { backgroundColor: `${accent}18`, borderColor: `${accent}55` },
                    ]}
                  >
                    <Text style={[styles.chipText, on && { color: accent }]}>
                      {chip.label} · {chip.count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.summary}>
              <Text style={styles.summaryBold}>{visible.length} pedidos</Text>
              {` · ${summaryDetail}`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No hay pedidos acá</Text>
            <Text style={styles.emptyBody}>
              Probá con otro filtro o buscá por nombre de cliente.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  listEmpty: { flexGrow: 1 },
  eyebrow: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginBottom: spacing.sm,
  },
  dates: { flexDirection: 'row', gap: 6, marginBottom: spacing.md },
  dateBtn: {
    flex: 1,
    height: 36,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBtnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: spacing.md,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  summary: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  summaryBold: {
    fontFamily: fonts.bodySemiBold,
    fontWeight: '600',
    color: colors.text,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 52,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontFamily: fonts.displaySemi,
    fontWeight: '600',
    fontSize: 16,
    color: colors.text,
    marginBottom: 5,
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
