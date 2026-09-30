import { Order, OrderStatus, User } from '../types';
import { MapMarker } from '../components/PostaMap';
import { dedupeRepartidores, repartidorMarkerKey } from './repartidorLocation';
import { resolveRepartidorLocation } from './liveFleet';
import { isStaleLocation } from './locationFreshness';
import { spreadOverlappingMarkers } from './markerSpread';

const COLORS = {
  repartidor: '#5C87EB',
  delivering: '#E69A2E',
  assigned: '#9B7EDE',
  pending: '#A99B85',
};

/** Marcadores para mapa de flota del vendedor (repartidores asignados + pedidos activos). */
export function buildSellerFleetMarkers(
  orders: Order[],
  repartidores: User[],
  now = Date.now()
): MapMarker[] {
  const markers: MapMarker[] = [];

  const assignedRepIds = new Set(
    orders
      .filter((o) => !o.archived && o.repartidorId)
      .map((o) => o.repartidorId as string)
  );

  const repsWithLocation = dedupeRepartidores(repartidores).flatMap((rep) => {
    if (!assignedRepIds.has(rep.id)) return [];
    const loc = resolveRepartidorLocation(rep);
    if (!loc || isStaleLocation(loc.timestamp, now)) return [];
    return [{ rep, lat: loc.lat, lng: loc.lng }];
  });

  for (const { rep, displayLat, displayLng } of spreadOverlappingMarkers(repsWithLocation)) {
    markers.push({
      id: `rep_${repartidorMarkerKey(rep)}`,
      lat: displayLat,
      lng: displayLng,
      color: COLORS.repartidor,
      label: rep.name,
      animated: true,
    });
  }

  for (const order of orders) {
    if (
      order.archived ||
      order.status === OrderStatus.DELIVERED ||
      order.status === OrderStatus.CANCELLED
    ) {
      continue;
    }
    const color =
      order.status === OrderStatus.DELIVERING
        ? COLORS.delivering
        : order.status === OrderStatus.ASSIGNED
          ? COLORS.assigned
          : COLORS.pending;
    markers.push({
      id: `order_${order.id}`,
      lat: order.lat,
      lng: order.lng,
      color,
      label: `${order.id} · ${order.clientName}`,
    });
  }

  return markers;
}
