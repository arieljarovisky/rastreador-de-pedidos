import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CompositeScreenProps, RouteProp, useFocusEffect, useRoute } from '@react-navigation/native';
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
import Button from '../components/Button';
import { TAB_BAR_CLEARANCE } from '../constants/layout';
import { RepartidorHomeStackParamList, RepartidorStackParamList } from '../navigation/types';

type Props = CompositeScreenProps<
  NativeStackScreenProps<RepartidorHomeStackParamList, 'Orders'>,
  NativeStackScreenProps<RepartidorStackParamList>
>;
type OrdersRouteProp = RouteProp<RepartidorHomeStackParamList, 'Orders'>;
type Tab = 'assigned' | 'available';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function OrdersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const route = useRoute<OrdersRouteProp>();
  const accent = roleAccents.repartidor;
  const { user } = useAuth();
  const {
    orders,
    loading,
    refreshing,
    connected,
    error,
    refresh,
    deliveringOrder,
    updateStatus,
  } = useOrdersContext();
  const [tab, setTab] = useState<Tab>('assigned');
  const [startingRoute, setStartingRoute] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (route.params?.fromScanSession) {
        setTab('assigned');
      }
    }, [route.params?.fromScanSession])
  );

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

  const readyToDeliver = useMemo(
    () => myAssigned.filter((o) => o.status === OrderStatus.ASSIGNED),
    [myAssigned]
  );

  const available = useMemo(
    () => orders.filter((o) => o.status === OrderStatus.PENDING),
    [orders]
  );

  const data = tab === 'assigned' ? myAssigned : available;
  const displayName = user?.name ?? 'Repartidor';
  const showStartRoute = tab === 'assigned' && readyToDeliver.length > 0 && !deliveringOrder;
  const showContinueRoute = tab === 'assigned' && deliveringOrder != null;

  const handleStartDelivering = () => {
    const count = readyToDeliver.length;
    Alert.alert(
      'Empezar a repartir',
      count === 1
        ? '¿Iniciar el reparto de 1 envío?'
        : `¿Iniciar el reparto de ${count} envíos? Vas a entregarlos uno por uno.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Empezar',
          onPress: () => {
            void (async () => {
              setStartingRoute(true);
              try {
                const first = readyToDeliver[0];
                await updateStatus(first.id, OrderStatus.DELIVERING, {
                  comment: 'Reparto iniciado',
                });
                navigation.navigate('OrderDetail', { orderId: first.id });
              } catch (err) {
                Alert.alert(
                  'Error',
                  err instanceof Error ? err.message : 'No se pudo iniciar el reparto.'
                );
              } finally {
                setStartingRoute(false);
              }
            })();
          },
        },
      ]
    );
  };

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

      {tab === 'assigned' && readyToDeliver.length > 0 && !deliveringOrder ? (
        <View style={styles.sessionBanner}>
          <Text style={styles.sessionBannerText}>
            {readyToDeliver.length} envío{readyToDeliver.length === 1 ? '' : 's'} listo
            {readyToDeliver.length === 1 ? '' : 's'} para salir
          </Text>
        </View>
      ) : null}

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
            {
              paddingBottom:
                TAB_BAR_CLEARANCE + spacing.lg + (showStartRoute || showContinueRoute ? 72 : 0),
            },
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
                  ? 'Escaneá etiquetas ML para cargar envíos o tomá uno de Disponibles.'
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

      {showStartRoute ? (
        <View style={[styles.routeBar, { paddingBottom: TAB_BAR_CLEARANCE + spacing.sm }]}>
          <Button
            label={`Empezar a repartir (${readyToDeliver.length})`}
            variant="amber"
            onPress={handleStartDelivering}
            loading={startingRoute}
            style={styles.routeBtn}
          />
        </View>
      ) : null}

      {showContinueRoute && deliveringOrder ? (
        <View style={[styles.routeBar, { paddingBottom: TAB_BAR_CLEARANCE + spacing.sm }]}>
          <Button
            label="Continuar reparto"
            variant="amber"
            onPress={() => navigation.navigate('OrderDetail', { orderId: deliveringOrder.id })}
            style={styles.routeBtn}
          />
        </View>
      ) : null}
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
  sessionBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: `${roleAccents.repartidor}14`,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${roleAccents.repartidor}33`,
  },
  sessionBannerText: {
    ...typography.body(13, colors.text),
    textAlign: 'center',
    fontWeight: '600',
  },
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
  routeBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  routeBtn: { width: '100%' },
});
