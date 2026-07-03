import { Order, OrderStatus, DeliveryDailySummary } from '../types';

export const DELIVERY_DEADLINE_HOUR = 21;

export function getOperationalDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}

function isTodayOrder(order: Order, dateKey: string): boolean {
  if (order.deliveryDeadline) {
    const deadlineKey = getOperationalDateKey(new Date(order.deliveryDeadline));
    return deadlineKey === dateKey;
  }
  return getOperationalDateKey(new Date(order.createdAt)) === dateKey;
}

export function computeDeliverySummaryFromOrders(
  orders: Order[],
  dateKey: string = getOperationalDateKey()
): DeliveryDailySummary {
  const todayOrders = orders.filter((o) => !o.archived && isTodayOrder(o, dateKey));
  const delivered = todayOrders.filter((o) => o.status === OrderStatus.DELIVERED).length;
  const cancelled = todayOrders.filter((o) => o.status === OrderStatus.CANCELLED).length;
  const undelivered = todayOrders.filter(
    (o) => o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELLED
  ).length;
  const total = todayOrders.length;

  const deadlineAt = new Date();
  deadlineAt.setHours(DELIVERY_DEADLINE_HOUR, 0, 0, 0);
  const now = Date.now();
  const isPastDeadline = now >= deadlineAt.getTime();

  return {
    date: dateKey,
    deadlineHour: DELIVERY_DEADLINE_HOUR,
    deadlineAt: deadlineAt.toISOString(),
    total,
    delivered,
    undelivered,
    overdue: isPastDeadline ? undelivered : 0,
    cancelled,
    minutesUntilDeadline: Math.max(0, Math.floor((deadlineAt.getTime() - now) / 60_000)),
    isPastDeadline,
  };
}

export function formatMinutesUntilDeadline(minutes: number): string {
  if (minutes <= 0) return 'Corte vencido';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}
