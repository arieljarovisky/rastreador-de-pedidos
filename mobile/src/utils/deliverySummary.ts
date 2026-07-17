import { Order, OrderStatus, DeliveryDailySummary } from '../types';

export const DELIVERY_DEADLINE_HOUR = 13;
/** Límite de entrega del día (no confundir con el corte de ventas). */
export const DELIVERY_SLA_HOUR = 21;
export const DELIVERY_TIMEZONE = 'America/Argentina/Buenos_Aires';
export const DELIVERY_TIMEZONE_LABEL = 'Argentina (ART)';

interface ArDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function getArDateParts(date: Date): ArDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DELIVERY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function arLocalToUtc(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0, 0));
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: DELIVERY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(guess);

  const get = (type: string) => Number(formatted.find((p) => p.type === type)?.value ?? 0);
  const diffMinutes = (hour - get('hour')) * 60 + (minute - get('minute'));
  return new Date(guess.getTime() + diffMinutes * 60_000);
}

export function getTodayDeadlineInArgentina(date: Date = new Date()): Date {
  const { year, month, day } = getArDateParts(date);
  return arLocalToUtc(year, month, day, DELIVERY_DEADLINE_HOUR);
}

function getSlaForDate(date: Date = new Date()): Date {
  const { year, month, day } = getArDateParts(date);
  return arLocalToUtc(year, month, day, DELIVERY_SLA_HOUR);
}

export function getOperationalDateKey(date: Date = new Date()): string {
  const { year, month, day } = getArDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isTodayOrder(order: Order, dateKey: string): boolean {
  if (order.deliveryDeadline) {
    const deadlineKey = getOperationalDateKey(new Date(order.deliveryDeadline));
    return deadlineKey === dateKey;
  }
  return getOperationalDateKey(new Date(order.createdAt)) === dateKey;
}

export function getTodayOrders(
  orders: Order[],
  dateKey: string = getOperationalDateKey()
): Order[] {
  return orders.filter((o) => !o.archived && isTodayOrder(o, dateKey));
}

export function getUndeliveredTodayOrders(
  orders: Order[],
  dateKey: string = getOperationalDateKey()
): Order[] {
  return getTodayOrders(orders, dateKey).filter(
    (o) => o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELLED
  );
}

export function getDeliveredTodayOrders(
  orders: Order[],
  dateKey: string = getOperationalDateKey()
): Order[] {
  return getTodayOrders(orders, dateKey).filter((o) => o.status === OrderStatus.DELIVERED);
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

  const salesCutoffAt = getTodayDeadlineInArgentina();
  const deliverySlaAt = getSlaForDate();
  const now = Date.now();
  const todayKey = getOperationalDateKey();
  const isViewingToday = dateKey === todayKey;
  const isPastDeadline = isViewingToday
    ? now >= salesCutoffAt.getTime()
    : dateKey < todayKey;
  const isPastDeliverySla = isViewingToday
    ? now >= deliverySlaAt.getTime()
    : dateKey < todayKey;

  return {
    date: dateKey,
    deadlineHour: DELIVERY_DEADLINE_HOUR,
    deadlineAt: salesCutoffAt.toISOString(),
    total,
    delivered,
    undelivered,
    overdue: isPastDeliverySla ? undelivered : 0,
    cancelled,
    minutesUntilDeadline: isViewingToday
      ? Math.max(0, Math.floor((salesCutoffAt.getTime() - now) / 60_000))
      : 0,
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

export function formatArTime(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: DELIVERY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
