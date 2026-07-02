import { Order, OrderStatus, User, UserLocation } from '../types';

/** Posición en vivo del repartidor: GPS de flota > último punto del trail. */
export function getLiveDriverPosition(
  order: Order,
  repartidores: User[] = []
): UserLocation | null {
  if (!order.repartidorId) return null;
  if (
    order.status !== OrderStatus.DELIVERING &&
    order.status !== OrderStatus.ASSIGNED
  ) {
    return null;
  }

  const rep = repartidores.find((r) => r.id === order.repartidorId);
  if (rep?.currentLocation) return rep.currentLocation;

  const last = order.locationHistory[order.locationHistory.length - 1];
  return last ?? null;
}
