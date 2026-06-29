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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useSellerOrdersContext } from '../../context/SellerOrdersContext';
import { OrderStatus, STATUS_LABEL } from '../../types';
import { colors, radius, spacing } from '../../theme';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import OrderTrackingMap from '../../components/OrderTrackingMap';
import { SellerStackParamList } from '../../navigation/types';
import { api } from '../../api';

type Props = NativeStackScreenProps<SellerStackParamList, 'SellerOrderDetail'>;

export default function SellerOrderDetailScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { getOrder, cancelOrder, deleteOrder, archiveOrder } = useSellerOrdersContext();
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

  const trail = order.locationHistory.map((p) => ({
    latitude: p.lat,
    longitude: p.lng,
  }));
  const lastDriver = trail[trail.length - 1] ?? null;
  const isActive =
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

  const handleCancel = () => {
    Alert.alert('Cancelar envío', `¿Cancelar ${order.id}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: () => run(async () => { await cancelOrder(order.id); }),
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Eliminar envío', `¿Eliminar ${order.id}? Solo aplica a pendientes.`, [
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
    ]);
  };

  const handleArchive = (archived: boolean) => {
    run(async () => {
      await archiveOrder(order.id, archived);
      if (archived) navigation.goBack();
    });
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

  const openMlLabel = async () => {
    if (!token) return;
    try {
      const res = await fetch(api.mercadoLibreLabelUrl(order.id), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? 'No se pudo obtener la etiqueta.'
        );
      }
      Alert.alert(
        'Etiqueta ML',
        'La etiqueta se descargó correctamente. Para imprimirla, usá la web de Posta desde una computadora.'
      );
    } catch (err) {
      Alert.alert(
        'Etiqueta no disponible',
        err instanceof Error ? err.message : 'Intentá de nuevo más tarde.'
      );
    }
  };

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
          driver={
            lastDriver &&
            order.repartidorId &&
            (order.status === OrderStatus.DELIVERING || order.status === OrderStatus.ASSIGNED)
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

        {order.repartidorName ? (
          <View style={styles.repBox}>
            <Text style={styles.repLabel}>Repartidor</Text>
            <Text style={styles.repName}>🏍️ {order.repartidorName}</Text>
          </View>
        ) : isActive ? (
          <View style={styles.repBox}>
            <Text style={styles.repPending}>Esperando asignación de logística</Text>
          </View>
        ) : null}

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

        {order.history.length > 0 && (
          <View style={styles.historyBox}>
            <Text style={styles.historyTitle}>Bitácora</Text>
            {[...order.history].reverse().slice(0, 6).map((event, index) => (
              <View key={`${event.timestamp}-${index}`} style={styles.historyItem}>
                <Text style={styles.historyComment}>
                  {event.comment?.trim() || STATUS_LABEL[event.status]}
                </Text>
                <Text style={styles.historyMeta}>
                  {new Date(event.timestamp).toLocaleString()} · {event.updatedBy}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <Button label="🧭 Ver en mapas" variant="ghost" onPress={openInMaps} />

          {order.externalSource === 'mercadolibre' && (
            <Button label="🏷️ Etiqueta ML" variant="ghost" onPress={openMlLabel} />
          )}

          {order.status === OrderStatus.PENDING && (
            <>
              <Button
                label="Cancelar envío"
                variant="danger"
                onPress={handleCancel}
                loading={busy}
              />
              <Button label="Eliminar" variant="ghost" onPress={handleDelete} loading={busy} />
            </>
          )}

          {isActive && order.status !== OrderStatus.PENDING && (
            <Button
              label="Cancelar envío"
              variant="danger"
              onPress={handleCancel}
              loading={busy}
            />
          )}

          {(order.status === OrderStatus.DELIVERED ||
            order.status === OrderStatus.CANCELLED) &&
            !order.archived && (
              <Button
                label="Archivar"
                variant="ghost"
                onPress={() => handleArchive(true)}
                loading={busy}
              />
            )}

          {order.archived && (
            <Button
              label="Desarchivar"
              variant="ghost"
              onPress={() => handleArchive(false)}
              loading={busy}
            />
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
  repBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.accentBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  repLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  repName: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  repPending: { color: colors.textMuted, fontSize: 13 },
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
    marginBottom: 4,
  },
  metaValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
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
    marginBottom: spacing.sm,
  },
  historyItem: {
    paddingVertical: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  historyComment: { color: colors.text, fontSize: 12, lineHeight: 17 },
  historyMeta: { color: colors.textFaint, fontSize: 10, marginTop: 2 },
  actions: { marginTop: spacing.xl, gap: spacing.md },
});
