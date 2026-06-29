import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAgencyOrdersContext } from '../../context/AgencyOrdersContext';
import { findZoneForPoint, zoneLabel } from '../../config/deliveryZones';
import { OrderStatus } from '../../types';
import { colors, radius, spacing } from '../../theme';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import OrderTrackingMap from '../../components/OrderTrackingMap';
import { AgencyStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AgencyStackParamList, 'AgencyOrderDetail'>;

export default function AgencyOrderDetailScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const {
    getOrder,
    repartidores,
    sellers,
    assignRepartidor,
    unassignRepartidor,
    assignSeller,
    updateStatus,
    cancelOrder,
    deleteOrder,
    archiveOrder,
  } = useAgencyOrdersContext();
  const [busy, setBusy] = useState(false);

  const order = getOrder(orderId);

  const orderZone = useMemo(
    () => (order ? findZoneForPoint(order.lat, order.lng) : null),
    [order]
  );

  const suggestedRep = useMemo(() => {
    if (!orderZone) return null;
    return repartidores.find((r) => r.deliveryZone === orderZone.id) ?? null;
  }, [orderZone, repartidores]);

  if (!order) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>Este pedido ya no está disponible.</Text>
        <Button
          label="Volver"
          variant="ghost"
          onPress={() => navigation.goBack()}
          style={{ marginTop: spacing.lg, width: 160 }}
        />
      </View>
    );
  }

  const trail = order.locationHistory.map((p) => ({
    latitude: p.lat,
    longitude: p.lng,
  }));
  const lastDriver = trail[trail.length - 1] ?? null;
  const isOpen =
    order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.CANCELLED;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo completar.');
    } finally {
      setBusy(false);
    }
  };

  const pickRepartidor = () => {
    if (repartidores.length === 0) {
      Alert.alert('Sin repartidores', 'Creá repartidores desde la web de Posta.');
      return;
    }
    const buttons = [
      ...repartidores.map((rep) => ({
        text: `${rep.name}${rep.deliveryZone ? ` (${zoneLabel(rep.deliveryZone)})` : ''}${
          suggestedRep?.id === rep.id ? ' ★' : ''
        }`,
        onPress: () => {
          void run(async () => {
            await assignRepartidor(order.id, rep.id);
          });
        },
      })),
      { text: 'Cancelar', style: 'cancel' as const },
    ];
    Alert.alert('Asignar repartidor', orderZone ? `Zona: ${orderZone.name}` : undefined, buttons);
  };

  const pickSeller = () => {
    if (sellers.length === 0) {
      Alert.alert('Sin vendedores', 'Creá vendedores desde la web de Posta.');
      return;
    }
    const buttons = [
      ...sellers.map((seller) => ({
        text: seller.name,
        onPress: () => {
          void run(async () => {
            await assignSeller(order.id, seller.id);
          });
        },
      })),
      { text: 'Cancelar', style: 'cancel' as const },
    ];
    Alert.alert('Asignar vendedor', 'Seleccioná el vendedor de este envío', buttons);
  };

  const openInMaps = () => {
    const { lat, lng } = order;
    const label = encodeURIComponent(order.clientName);
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${lat},${lng}&q=${label}`,
      android: `google.navigation:q=${lat},${lng}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    });
    if (url) Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <View style={styles.mapPane}>
        <OrderTrackingMap
          style={styles.mapFill}
          destination={{ lat: order.lat, lng: order.lng, label: order.clientName }}
          trail={order.locationHistory.map((p) => ({ lat: p.lat, lng: p.lng }))}
          driver={
            lastDriver &&
            order.repartidorId &&
            (order.status === OrderStatus.DELIVERING ||
              order.status === OrderStatus.ASSIGNED)
              ? {
                  lat: lastDriver.latitude,
                  lng: lastDriver.longitude,
                  label: order.repartidorName ?? 'Repartidor',
                }
              : null
          }
        />
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grabber} />

        <View style={styles.headerRow}>
          <Text style={styles.orderId}>{order.id}</Text>
          <StatusBadge status={order.status} />
        </View>

        <Text style={styles.client}>{order.clientName}</Text>
        <Text style={styles.address}>{order.address}</Text>

        {order.sellerName ? (
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Vendedor</Text>
            <Text style={styles.metaValue}>🏪 {order.sellerName}</Text>
          </View>
        ) : isOpen ? (
          <View style={styles.metaBox}>
            <Text style={styles.metaWarn}>Sin vendedor asignado</Text>
            <Button
              label="Asignar vendedor"
              variant="secondary"
              onPress={pickSeller}
              loading={busy}
              style={{ marginTop: spacing.sm }}
            />
          </View>
        ) : null}

        {order.repartidorName ? (
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Repartidor</Text>
            <Text style={styles.metaValue}>🏍️ {order.repartidorName}</Text>
            {order.status === OrderStatus.ASSIGNED && (
              <Button
                label="Cambiar repartidor"
                variant="ghost"
                onPress={pickRepartidor}
                loading={busy}
                style={{ marginTop: spacing.sm }}
              />
            )}
          </View>
        ) : isOpen && order.status === OrderStatus.PENDING ? (
          <View style={styles.metaBox}>
            {orderZone && (
              <Text style={styles.zoneHint}>
                Zona: {orderZone.name}
                {suggestedRep ? ` · Sugerido: ${suggestedRep.name}` : ''}
              </Text>
            )}
            <Button
              label={suggestedRep ? `Asignar ${suggestedRep.name}` : 'Asignar repartidor'}
              onPress={() =>
                suggestedRep
                  ? run(async () => { await assignRepartidor(order.id, suggestedRep.id); })
                  : pickRepartidor()
              }
              loading={busy}
            />
          </View>
        ) : null}

        {order.status === OrderStatus.ASSIGNED && order.repartidorId && (
          <Button
            label="Desasignar repartidor"
            variant="danger"
            onPress={() =>
              Alert.alert('Desasignar', '¿El envío vuelve a pendiente?', [
                { text: 'No', style: 'cancel' },
                {
                  text: 'Desasignar',
                  style: 'destructive',
                  onPress: () => run(async () => { await unassignRepartidor(order.id); }),
                },
              ])
            }
            loading={busy}
            style={{ marginTop: spacing.md }}
          />
        )}

        {order.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Notas</Text>
            <Text style={styles.notesText}>{order.notes}</Text>
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <Meta label="Teléfono" value={order.clientPhone || '—'} />
          <Meta label="Origen" value={order.externalSource ?? 'Manual'} />
        </View>

        {isOpen && (
          <View style={styles.actions}>
            <Button label="Cómo llegar" variant="secondary" onPress={openInMaps} />
            {order.status === OrderStatus.DELIVERING && (
              <Button
                label="Marcar entregado"
                variant="success"
                loading={busy}
                onPress={() =>
                  run(async () => {
                    await updateStatus(
                      order.id,
                      OrderStatus.DELIVERED,
                      'Entregado desde app de agencia'
                    );
                    navigation.goBack();
                  })
                }
              />
            )}
            <Button
              label="Cancelar envío"
              variant="danger"
              loading={busy}
              onPress={() =>
                Alert.alert('Cancelar envío', `¿Cancelar ${order.id}?`, [
                  { text: 'No', style: 'cancel' },
                  {
                    text: 'Sí, cancelar',
                    style: 'destructive',
                    onPress: () =>
                      run(async () => {
                        await cancelOrder(order.id);
                        navigation.goBack();
                      }),
                  },
                ])
              }
            />
            {order.status === OrderStatus.PENDING && (
              <Button
                label="Eliminar pedido"
                variant="ghost"
                loading={busy}
                onPress={() =>
                  Alert.alert('Eliminar', `¿Eliminar ${order.id}?`, [
                    { text: 'No', style: 'cancel' },
                    {
                      text: 'Eliminar',
                      style: 'destructive',
                      onPress: () =>
                        run(async () => {
                          await deleteOrder(order.id);
                          navigation.goBack();
                        }),
                    },
                  ])
                }
              />
            )}
          </View>
        )}

        {!isOpen && !order.archived && (
          <Button
            label="Archivar"
            variant="ghost"
            loading={busy}
            onPress={() =>
              run(async () => {
                await archiveOrder(order.id, true);
                navigation.goBack();
              })
            }
            style={{ marginTop: spacing.lg }}
          />
        )}
      </ScrollView>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaItemLabel}>{label}</Text>
      <Text style={styles.metaItemValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted },
  mapPane: { height: '38%', minHeight: 220 },
  mapFill: { flex: 1 },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    marginTop: -16,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  orderId: { fontFamily: 'SpaceMono_700Bold', fontSize: 13, color: colors.textMuted },
  client: { fontSize: 20, fontWeight: '700', color: colors.text },
  address: { fontSize: 14, color: colors.textMuted, marginTop: 4, lineHeight: 20 },
  metaBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  metaLabel: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 10,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metaValue: { fontSize: 15, color: colors.text, marginTop: 4, fontWeight: '600' },
  metaWarn: { fontSize: 13, color: colors.amber },
  zoneHint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  notesBox: { marginTop: spacing.lg },
  notesLabel: { fontSize: 11, color: colors.textFaint, textTransform: 'uppercase' },
  notesText: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg },
  metaItem: { flex: 1 },
  metaItemLabel: { fontSize: 10, color: colors.textFaint, textTransform: 'uppercase' },
  metaItemValue: { fontSize: 14, color: colors.text, marginTop: 2 },
  actions: { marginTop: spacing.xl, gap: spacing.sm },
});
