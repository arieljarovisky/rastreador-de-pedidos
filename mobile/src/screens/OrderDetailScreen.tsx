import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useOrdersContext } from '../context/OrdersContext';
import { OrderStatus, STATUS_LABEL } from '../types';
import { colors, radius, spacing } from '../theme';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetail'>;

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

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={{
          latitude: order.lat,
          longitude: order.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        <Marker
          coordinate={{ latitude: order.lat, longitude: order.lng }}
          title={order.clientName}
          description={order.address}
          pinColor="#ef4444"
        />
        {driver && (
          <Marker coordinate={driver} title="Vos" pinColor="#3b82f6" />
        )}
        {trail.length > 1 && (
          <Polyline coordinates={trail} strokeColor={colors.amber} strokeWidth={4} />
        )}
      </MapView>

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

        {order.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Notas</Text>
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
  map: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    marginTop: -24,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    maxHeight: '58%',
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
