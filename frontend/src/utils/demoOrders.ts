import { Order, OrderStatus, User, UserRole, isAgencyAdmin } from '../types.js';

const LEGACY_DEMO_USER_IDS = new Set([
  'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11', 'u12', 'u13',
]);
const LEGACY_DEMO_DRIVER_IDS = new Set(['u2', 'u3', 'u4', 'u12', 'u13']);

export function userSeesDemoOrders(user: { id: string } | null | undefined): boolean {
  if (!user) return false;
  return user.id.startsWith('demo_') || LEGACY_DEMO_USER_IDS.has(user.id);
}

export function isDemoOrderId(id: string): boolean {
  return /^DEMO-/i.test(id);
}

export function isDemoDriverId(id: string): boolean {
  return id.startsWith('demo_driver_') || LEGACY_DEMO_DRIVER_IDS.has(id);
}

/** Pedidos de otra agencia o de la flota demo no entran al panel de una cuenta real. */
export function orderVisibleToUser(order: Order, user: User | null | undefined): boolean {
  if (!user) return false;
  if (isDemoOrderId(order.id) && !userSeesDemoOrders(user)) return false;

  if (user.role === UserRole.STORE_ADMIN) return order.sellerId === user.id;

  if (user.role === UserRole.REPARTIDOR) {
    if (order.repartidorId === user.id) return true;
    return (
      order.status === OrderStatus.PENDING &&
      (!order.agencyId || !user.agencyId || order.agencyId === user.agencyId)
    );
  }

  if (isAgencyAdmin(user.role)) {
    if (order.agencyId && user.agencyId && order.agencyId !== user.agencyId) return false;
    return true;
  }

  return !order.agencyId || !user.agencyId || order.agencyId === user.agencyId;
}
