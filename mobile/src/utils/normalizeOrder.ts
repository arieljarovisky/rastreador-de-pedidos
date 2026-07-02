import { Order } from '../types';

/** Evita crashes si el backend/socket omite arrays opcionales. */
export function normalizeOrder(order: Order): Order {
  return {
    ...order,
    history: Array.isArray(order.history) ? order.history : [],
    locationHistory: Array.isArray(order.locationHistory) ? order.locationHistory : [],
  };
}

export function normalizeOrders(orders: Order[]): Order[] {
  return orders.map(normalizeOrder);
}
