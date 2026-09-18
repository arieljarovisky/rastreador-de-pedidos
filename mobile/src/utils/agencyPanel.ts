import { Order, OrderStatus } from '../types';
import {
  getActiveOperationalDateKey,
  getDeliveredTodayOrders,
  getOrderDeliverySla,
  getTodayOrders,
  getUndeliveredTodayOrders,
} from './deliverySummary';

export type AgencyFlowKey = 'almacen' | 'despacho' | 'ruta';
export type AgencyUrgency = 'late' | 'soon' | 'ok' | 'flat';

const CLOSED: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED];

export function isClosedOrder(order: Order): boolean {
  return CLOSED.includes(order.status);
}

export function flowKeyForOrder(order: Order): AgencyFlowKey | null {
  if (order.status === OrderStatus.PENDING) return 'almacen';
  if (order.status === OrderStatus.ASSIGNED) return 'despacho';
  if (order.status === OrderStatus.DELIVERING) return 'ruta';
  return null;
}

/** Minutos hasta el SLA de entrega 21 hs (negativo = vencido). */
export function minutesUntilDeadline(order: Order, now = Date.now()): number | null {
  if (isClosedOrder(order)) return null;
  const sla = getOrderDeliverySla(order);
  return Math.floor((sla.getTime() - now) / 60_000);
}

export function isLateOrder(order: Order, now = Date.now()): boolean {
  const mins = minutesUntilDeadline(order, now);
  return mins != null && mins < 0;
}

export function isSoonOrder(order: Order, now = Date.now()): boolean {
  const mins = minutesUntilDeadline(order, now);
  return mins != null && mins >= 0 && mins <= 60;
}

export function urgencyForOrder(order: Order, now = Date.now()): AgencyUrgency {
  if (order.status === OrderStatus.CANCELLED) return 'late';
  if (order.status === OrderStatus.DELIVERED) {
    const deliveredAt = order.history
      .filter((h) => h.status === OrderStatus.DELIVERED)
      .map((h) => new Date(h.timestamp).getTime())
      .sort((a, b) => b - a)[0];
    if (deliveredAt && deliveredAt > getOrderDeliverySla(order).getTime()) return 'soon';
    return 'ok';
  }
  if (isLateOrder(order, now)) return 'late';
  if (isSoonOrder(order, now)) return 'soon';
  return 'ok';
}

export function plazoLabel(order: Order, now = Date.now()): string {
  if (order.status === OrderStatus.CANCELLED) return 'Devuelto';
  if (order.status === OrderStatus.DELIVERED) {
    const deliveredEvt = [...order.history]
      .reverse()
      .find((h) => h.status === OrderStatus.DELIVERED);
    const hora = deliveredEvt
      ? new Intl.DateTimeFormat('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(deliveredEvt.timestamp))
      : '';
    const late =
      deliveredEvt &&
      new Date(deliveredEvt.timestamp).getTime() > getOrderDeliverySla(order).getTime();
    return `Entregado ${hora}${late ? ' · fuera de plazo' : ''}`.trim();
  }
  const mins = minutesUntilDeadline(order, now);
  if (mins == null) {
    if (order.status === OrderStatus.PENDING) return 'En almacén';
    if (order.status === OrderStatus.ASSIGNED) return 'En despacho';
    if (order.status === OrderStatus.DELIVERING) return 'En ruta';
    return 'Pendiente';
  }
  if (mins < 0) {
    const ago = -mins;
    return ago >= 60
      ? `Vencido hace ${Math.floor(ago / 60)} h`
      : `Vencido hace ${ago} min`;
  }
  if (mins <= 60) return `Vence en ${mins} min`;
  return `Vence en ${Math.floor(mins / 60)} h`;
}

export function channelLabel(order: Order): string {
  if (order.externalSource === 'tiendanube') return 'Tiendanube';
  if (order.externalSource === 'mercadolibre') return 'Mercado Libre';
  if (order.externalSource === 'shopify') return 'Shopify';
  if (order.externalSource === 'woocommerce') return 'WooCommerce';
  return order.sellerName ?? 'Directo';
}

export function shortOrderCode(order: Order): string {
  return order.externalOrderId?.slice(-6) || order.id.slice(-6).toUpperCase();
}

export interface AgencyPanelCounts {
  delivered: number;
  pending: number;
  total: number;
  late: number;
  inCourse: number;
  sinAsignar: number;
  almacen: number;
  despacho: number;
  ruta: number;
}

export function computeAgencyPanelCounts(orders: Order[]): AgencyPanelCounts {
  const dateKey = getActiveOperationalDateKey();
  const undelivered = getUndeliveredTodayOrders(orders, dateKey);
  const delivered = getDeliveredTodayOrders(orders, dateKey).length;
  const late = undelivered.filter((o) => isLateOrder(o)).length;
  const sinAsignar = undelivered.filter((o) => !o.repartidorId).length;

  return {
    delivered,
    pending: undelivered.length,
    total: delivered + undelivered.length,
    late,
    inCourse: Math.max(0, undelivered.length - late),
    sinAsignar,
    almacen: undelivered.filter((o) => o.status === OrderStatus.PENDING).length,
    despacho: undelivered.filter((o) => o.status === OrderStatus.ASSIGNED).length,
    ruta: undelivered.filter((o) => o.status === OrderStatus.DELIVERING).length,
  };
}

export function todayOpenOrders(orders: Order[]): Order[] {
  return getUndeliveredTodayOrders(orders);
}

export function todayAllOrders(orders: Order[]): Order[] {
  return getTodayOrders(orders);
}
