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
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CompositeScreenProps } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useOrdersContext } from '../context/OrdersContext';
import { api } from '../api';
import { DriverScanEntry, Order, OrderStatus } from '../types';
import { colors, roleAccents, spacing, typography } from '../theme';
import OrderCard from '../components/OrderCard';
import RepartidorMlConnectBar from '../components/RepartidorMlConnectBar';
import ConnectionBadge from '../components/ui/ConnectionBadge';
import EmptyState from '../components/ui/EmptyState';
import ListTabBar from '../components/ui/ListTabBar';
import ListTabButton from '../components/ui/ListTabButton';
import MonoLabel from '../components/ui/MonoLabel';
import Button from '../components/Button';
import PostaIcon from '../components/icons/PostaIcons';
import { TAB_BAR_CLEARANCE } from '../constants/layout';
import { formatScanCodeLabel, stripAddressReference } from '../utils/scanCodeLabel';
import { RepartidorHomeStackParamList, RepartidorStackParamList } from '../navigation/types';

type Props = CompositeScreenProps<
  NativeStackScreenProps<RepartidorHomeStackParamList, 'Orders'>,
  NativeStackScreenProps<RepartidorStackParamList>
>;
type Tab = 'assigned' | 'available' | 'personal';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatScanTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatRouteDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  try {
    return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateKey;
  }
}

export default function OrdersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const accent = roleAccents.repartidor;
  const { user, token } = useAuth();
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
  const [personalEntries, setPersonalEntries] = useState<DriverScanEntry[]>([]);
  const [personalDate, setPersonalDate] = useState<string>('');
  const [personalLoading, setPersonalLoading] = useState(false);
  const [personalRefreshing, setPersonalRefreshing] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [updatingEntryId, setUpdatingEntryId] = useState<string | null>(null);

  const loadPersonal = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!token) return;
      if (opts?.soft) setPersonalRefreshing(true);
      else setPersonalLoading(true);
      setPersonalError(null);
      try {
        const result = await api.getDriverScanEntries(token);
        setPersonalEntries(result.entries);
        setPersonalDate(result.date);
      } catch (err) {
        setPersonalError(err instanceof Error ? err.message : 'No se pudo cargar el registro.');
      } finally {
        setPersonalLoading(false);
        setPersonalRefreshing(false);
      }
    },
    [token]
  );

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void loadPersonal({ soft: true });
    }, [refresh, loadPersonal])
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

  const personalPending = useMemo(
    () => personalEntries.filter((e) => e.status === 'pending').length,
    [personalEntries]
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

  const handlePersonalStatus = (
    entry: DriverScanEntry,
    status: 'delivered' | 'cancelled' | 'pending'
  ) => {
    if (!token) return;
    void (async () => {
      setUpdatingEntryId(entry.id);
      try {
        const updated = await api.updateDriverScanEntryStatus(token, entry.id, status);
        setPersonalEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      } catch (err) {
        Alert.alert(
          'Registro',
          err instanceof Error ? err.message : 'No se pudo actualizar el paquete.'
        );
      } finally {
        setUpdatingEntryId(null);
      }
    })();
  };

  const promptPersonalAddress = (entry: DriverScanEntry) => {
    if (!token) return;
    const prompt = (Alert as { prompt?: typeof Alert.prompt }).prompt;
    if (typeof prompt === 'function') {
      prompt(
        'Dirección de la etiqueta',
        'El QR no trae la calle. Escribí la dirección impresa.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Guardar',
            onPress: (value?: string) => {
              const address = value?.trim();
              if (!address) {
                Alert.alert('Dirección', 'Ingresá una dirección.');
                return;
              }
              void (async () => {
                setUpdatingEntryId(entry.id);
                try {
                  const updated = await api.updateDriverScanEntryDetails(token, entry.id, {
                    address,
                  });
                  setPersonalEntries((prev) =>
                    prev.map((e) => (e.id === updated.id ? updated : e))
                  );
                } catch (err) {
                  Alert.alert(
                    'Dirección',
                    err instanceof Error ? err.message : 'No se pudo guardar.'
                  );
                } finally {
                  setUpdatingEntryId(null);
                }
              })();
            },
          },
        ],
        'plain-text',
        entry.address ?? ''
      );
      return;
    }
    Alert.alert(
      'Dirección',
      'En este dispositivo abrí de nuevo el escáner: al registrar el paquete te va a pedir la dirección de la etiqueta.'
    );
  };

  const renderItem = ({ item }: { item: Order }) => (
    <OrderCard
      order={item}
      onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
    />
  );

  const renderPersonalItem = ({ item }: { item: DriverScanEntry }) => {
    const isPending = item.status === 'pending';
    const busy = updatingEntryId === item.id;
    const statusLabel =
      item.status === 'delivered'
        ? 'Entregado'
        : item.status === 'cancelled'
          ? 'Cancelado'
          : 'Pendiente';
    const statusColor =
      item.status === 'delivered'
        ? colors.green ?? '#4caf50'
        : item.status === 'cancelled'
          ? colors.red
          : accent;

    return (
      <View style={styles.personalCard}>
        <View style={styles.personalCardTop}>
          <View style={styles.personalCardText}>
            <Text style={styles.personalCode} numberOfLines={1}>
              {item.clientName?.trim() || 'Sin nombre'}
            </Text>
            <Text style={styles.personalScanCode} numberOfLines={1}>
              {formatScanCodeLabel(item.scanCode)}
            </Text>
            {item.address?.trim() ? (
              <Text style={styles.personalAddress} numberOfLines={2}>
                {stripAddressReference(item.address.trim())}
              </Text>
            ) : (
              <Pressable onPress={() => promptPersonalAddress(item)} hitSlop={8}>
                <Text style={styles.personalAddressMissing}>+ Agregar dirección de la etiqueta</Text>
              </Pressable>
            )}
            <Text style={styles.personalMeta}>
              Escaneado {formatScanTime(item.scannedAt)}
              {item.deliveredAt ? ` · Entregado ${formatScanTime(item.deliveredAt)}` : ''}
            </Text>
          </View>
          <View
            style={[
              styles.personalBadge,
              { borderColor: `${statusColor}55`, backgroundColor: `${statusColor}18` },
            ]}
          >
            <Text style={[styles.personalBadgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        {busy ? (
          <ActivityIndicator color={accent} style={{ marginTop: spacing.sm }} />
        ) : (
          <View style={styles.personalActions}>
            {isPending ? (
              <>
                <Pressable
                  style={[
                    styles.personalActionBtn,
                    { backgroundColor: `${colors.green ?? '#4caf50'}22` },
                  ]}
                  onPress={() => handlePersonalStatus(item, 'delivered')}
                >
                  <Text style={[styles.personalActionText, { color: colors.green ?? '#4caf50' }]}>
                    Entregado
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.personalActionBtn, { backgroundColor: `${colors.red}18` }]}
                  onPress={() => handlePersonalStatus(item, 'cancelled')}
                >
                  <Text style={[styles.personalActionText, { color: colors.red }]}>Cancelar</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={[styles.personalActionBtn, { backgroundColor: `${accent}18` }]}
                onPress={() => handlePersonalStatus(item, 'pending')}
              >
                <Text style={[styles.personalActionText, { color: accent }]}>Reabrir</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  };

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
        <View style={styles.headerRight}>
          <Pressable
            style={[styles.scanBtn, { backgroundColor: `${accent}18`, borderColor: `${accent}44` }]}
            onPress={() => navigation.navigate('ScanLabel')}
            hitSlop={8}
          >
            <PostaIcon name="scan" size={20} color={accent} />
          </Pressable>
          <ConnectionBadge connected={connected} />
        </View>
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
        <ListTabButton
          active={tab === 'personal'}
          icon="tag"
          label="Registro"
          count={personalPending}
          color={colors.blue ?? accent}
          onPress={() => setTab('personal')}
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

      {tab === 'personal' && personalDate ? (
        <View style={styles.sessionBanner}>
          <Text style={styles.sessionBannerText}>
            {formatRouteDateLabel(personalDate)} · {personalEntries.length} paquete
            {personalEntries.length === 1 ? '' : 's'} · {personalPending} pendiente
            {personalPending === 1 ? '' : 's'}
          </Text>
        </View>
      ) : null}

      {tab !== 'personal' && error && !loading ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void refresh()} hitSlop={8}>
            <Text style={styles.retryLink}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {tab === 'personal' && personalError && !personalLoading ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{personalError}</Text>
          <Pressable onPress={() => void loadPersonal()} hitSlop={8}>
            <Text style={styles.retryLink}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {tab === 'personal' ? (
        personalLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={accent} />
          </View>
        ) : (
          <FlatList
            data={personalEntries}
            keyExtractor={(e) => e.id}
            renderItem={renderPersonalItem}
            contentContainerStyle={[
              styles.list,
              personalEntries.length === 0 && styles.listEmpty,
              { paddingBottom: TAB_BAR_CLEARANCE + spacing.lg },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={personalRefreshing}
                onRefresh={() => void loadPersonal({ soft: true })}
                tintColor={accent}
              />
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                icon="tag"
                title="Sin paquetes en tu registro"
                message="Escaneá etiquetas que no estén vinculadas a tu cuenta. Quedan en tu bitácora del día."
                action={{
                  label: 'Escanear etiqueta',
                  icon: 'scan',
                  color: accent,
                  onPress: () => navigation.navigate('ScanLabel'),
                }}
              />
            }
          />
        )
      ) : loading ? (
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
                  ? 'Escaneá la etiqueta del paquete para sumarlo a tus envíos, o tomá uno de Disponibles.'
                  : 'Cuando haya pedidos nuevos van a aparecer acá automáticamente.'
              }
              action={
                tab === 'assigned'
                  ? {
                      label: 'Escanear etiqueta',
                      icon: 'scan',
                      color: accent,
                      onPress: () => navigation.navigate('ScanLabel'),
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scanBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  personalCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  personalCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  personalCardText: { flex: 1, minWidth: 0, gap: 4 },
  personalCode: {
    ...typography.body(14, colors.text),
    fontWeight: '700',
  },
  personalScanCode: {
    ...typography.body(12, colors.textFaint),
    fontFamily: 'SpaceMono_700Bold',
    fontWeight: '700',
  },
  personalAddress: {
    ...typography.body(13, colors.text),
  },
  personalAddressMissing: {
    ...typography.body(13, roleAccents.repartidor),
    fontWeight: '600',
  },
  personalMeta: {
    ...typography.body(12, colors.textFaint),
  },
  personalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  personalBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  personalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  personalActionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  personalActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
