import { Order, OrderStatus, User, UserLocation } from '../types';
import { readLiveLocation, resolveRepartidorLocation } from './liveFleet';

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

  const rep = repartidores.find(
    (r) => r.id === order.repartidorId || r.username === order.repartidorId
  );
  const live = rep
    ? resolveRepartidorLocation(rep)
    : readLiveLocation(order.repartidorId);
  if (live) return live;

  const last = order.locationHistory[order.locationHistory.length - 1];
  return last ?? null;
}
