import { Order, OrderStatus, User } from '../types';
import { MapMarker } from '../components/PostaMap';
import { dedupeRepartidores } from './repartidorLocation';
import { spreadOverlappingMarkers } from './markerSpread';

const COLORS = {
  repartidor: '#5C87EB',
  delivering: '#E69A2E',
  assigned: '#9B7EDE',
  pending: '#A99B85',
};

/** Marcadores para mapa de flota del vendedor (repartidores + pedidos activos). */
export function buildSellerFleetMarkers(
  orders: Order[],
  repartidores: User[]
): MapMarker[] {
  const markers: MapMarker[] = [];

  const repsWithLocation = dedupeRepartidores(repartidores)
    .filter((rep) => rep.currentLocation)
    .map((rep) => ({
      rep,
      lat: rep.currentLocation!.lat,
      lng: rep.currentLocation!.lng,
    }));

  for (const { rep, displayLat, displayLng } of spreadOverlappingMarkers(repsWithLocation)) {
    markers.push({
      id: `rep_${rep.id}`,
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
