import React, { useState } from 'react';
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
import { useAuth } from '../context/AuthContext';
import { useOrdersContext } from '../context/OrdersContext';
import { OrderStatus, STATUS_LABEL } from '../types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import MonoLabel from '../components/ui/MonoLabel';
import OrderTrackingMap from '../components/OrderTrackingMap';
import { RepartidorStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RepartidorStackParamList, 'OrderDetail'>;

export default function OrderDetailScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getOrder, updateStatus, coords, permissionDenied, deliveringOrder } =
    useOrdersContext();
  const [busy, setBusy] = useState(false);

  const order = getOrder(orderId);

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

  const isMine = order.repartidorId === user?.id;
  const trail = order.locationHistory.map((p) => ({
    latitude: p.lat,
    longitude: p.lng,
  }));
  const driver = coords
    ? { latitude: coords.lat, longitude: coords.lng }
    : trail[trail.length - 1] ?? null;

  const run = async (
    status: OrderStatus,
    opts: { repartidorId?: string; comment?: string }
  ) => {
    setBusy(true);
    try {
      await updateStatus(order.id, status, opts);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo actualizar.');
    } finally {
      setBusy(false);
    }
  };

  const handleTake = () => {
    // Bloquear tomar un nuevo pedido si ya hay uno en viaje
    if (deliveringOrder && deliveringOrder.id !== order.id) {
      Alert.alert(
        'Tenés un envío en curso',
        `Terminá la entrega de ${deliveringOrder.id} antes de tomar otro.`
      );
      return;
    }
    run(OrderStatus.ASSIGNED, {
      repartidorId: user?.id,
      comment: `Pedido tomado por ${user?.name}`,
    });
  };

  const handleStart = () =>
    run(OrderStatus.DELIVERING, { comment: 'Viaje iniciado' });

  const handleDeliver = () =>
    Alert.alert('Confirmar entrega', `¿Marcar ${order.id} como entregado?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Entregar',
        style: 'default',
        onPress: () =>
          run(OrderStatus.DELIVERED, { comment: 'Entregado en destino' }).then(() =>
            navigation.goBack()
          ),
      },
    ]);

  const callClient = () => {
    if (!order.clientPhone) return;
    Linking.openURL(`tel:${order.clientPhone}`);
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

  const driverPoint = driver
    ? { lat: driver.latitude, lng: driver.longitude, label: isMine ? 'Vos' : 'Repartidor' }
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.mapPane}>
        <OrderTrackingMap
          style={styles.mapFill}
          destination={{
            lat: order.lat,
            lng: order.lng,
            label: order.clientName,
          }}
          trail={order.locationHistory.map((p) => ({ lat: p.lat, lng: p.lng }))}
          driver={driverPoint}
        />
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grabber} />

        <View style={styles.headerRow}>
          <MonoLabel color={colors.textFaint}>ID: {order.id}</MonoLabel>
          <StatusBadge status={order.status} />
        </View>

        <Text style={typography.displayTitle(22)}>{order.clientName}</Text>
        <Text style={typography.body(14, colors.textMuted)}>{order.address}</Text>

        {order.notes ? (
          <View style={styles.notesBox}>
            <MonoLabel color={colors.textFaint}>Notas</MonoLabel>
            <Text style={styles.notesText}>{order.notes}</Text>
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <Meta label="Teléfono" value={order.clientPhone || '—'} />
          <Meta
            label="Origen"
            value={order.externalSource ?? 'Manual'}
          />
        </View>

        {order.sellerName ? (
          <View style={styles.sellerRow}>
            <MonoLabel color={colors.textFaint}>Vendedor</MonoLabel>
            <Text style={styles.sellerName}>🛒 {order.sellerName}</Text>
          </View>
        ) : null}

        {order.history.length > 0 && (
          <View style={styles.historyBox}>
            <MonoLabel color={colors.textFaint}>Bitácora del pedido</MonoLabel>
            {[...order.history].reverse().map((event, index) => (
              <View key={`${event.timestamp}-${index}`} style={styles.historyItem}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyStatus}>
                    {STATUS_LABEL[event.status] ?? event.status}
                  </Text>
                  <Text style={styles.historyTime}>
                    {new Date(event.timestamp).toLocaleString()}
                  </Text>
                </View>
                <Text style={styles.historyComment}>
                  {event.comment?.trim() || 'Cambio de estado'}
                </Text>
                <Text style={styles.historyBy}>Por: {event.updatedBy}</Text>
                {event.lat != null && event.lng != null && (
                  <Pressable
                    onPress={() =>
                      Linking.openURL(
                        `https://www.google.com/maps?q=${event.lat},${event.lng}`
                      )
                    }
                  >
                    <Text style={styles.historyMapLink}>📍 Ver ubicación del escaneo</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}

        {order.status === OrderStatus.DELIVERING && isMine && (
          <View style={styles.gpsBanner}>
            <View style={[styles.dot, { backgroundColor: colors.amber }]} />
            <Text style={styles.gpsText}>
              {permissionDenied
                ? 'GPS sin permiso: activá la ubicación para enviar el seguimiento.'
                : 'Enviando tu ubicación en vivo al cliente…'}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <View style={styles.row}>
            <Button
              label="📞 Llamar"
              variant="ghost"
              onPress={callClient}
              disabled={!order.clientPhone}
              style={styles.half}
            />
            <Button
              label="🧭 Cómo llegar"
              variant="ghost"
              onPress={openInMaps}
              style={styles.half}
            />
          </View>

          {order.status === OrderStatus.PENDING && (
            <Button label="Tomar pedido" onPress={handleTake} loading={busy} />
          )}

          {order.status === OrderStatus.ASSIGNED && isMine && (
            <Button
              label="Iniciar viaje"
              variant="amber"
              onPress={handleStart}
              loading={busy}
            />
          )}

          {order.status === OrderStatus.DELIVERING && isMine && (
            <Button
              label="Marcar entregado"
              variant="success"
              onPress={handleDeliver}
              loading={busy}
            />
          )}

          {order.status === OrderStatus.DELIVERED && (
            <Text style={styles.doneText}>✓ Pedido entregado</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.meta}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted, fontSize: 15 },
  mapPane: {
    height: 260,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  mapFill: { flex: 1 },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSoft,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  orderId: {
    color: colors.textFaint,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  client: { color: colors.text, fontSize: 22, fontWeight: '800' },
  address: { color: colors.textMuted, fontSize: 14, marginTop: 2, lineHeight: 20 },
  notesBox: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  notesLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  notesText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  meta: {
    flex: 1,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  metaLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metaValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sellerRow: {
    marginTop: spacing.lg,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  sellerLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sellerName: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  historyBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  historyTitle: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  historyItem: {
    paddingVertical: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  historyStatus: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  historyTime: {
    color: colors.textFaint,
    fontSize: 10,
    flexShrink: 1,
    textAlign: 'right',
  },
  historyComment: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  historyBy: {
    color: colors.textFaint,
    fontSize: 10,
    marginTop: 4,
  },
  historyMapLink: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  gpsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.amberBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  gpsText: { color: colors.amber, fontSize: 12, flex: 1, lineHeight: 17 },
  actions: { marginTop: spacing.xl, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  doneText: {
    color: colors.green,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
