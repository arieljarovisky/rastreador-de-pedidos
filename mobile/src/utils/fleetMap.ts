import { Order, OrderStatus, User } from '../types';
import { MapMarker } from '../components/PostaMap';

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

  for (const rep of repartidores) {
    if (!rep.currentLocation) continue;
    markers.push({
      lat: rep.currentLocation.lat,
      lng: rep.currentLocation.lng,
      color: COLORS.repartidor,
      label: `🏍️ ${rep.name}`,
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
      lat: order.lat,
      lng: order.lng,
      color,
      label: `${order.id} · ${order.clientName}`,
    });
  }

  return markers;
}
