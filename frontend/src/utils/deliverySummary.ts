import { Order, OrderStatus, DeliveryDailySummary } from '../types.js';

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
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Algunos engines devuelven hour=24 cerca de medianoche con hour12:false.
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
  };
}

/** Convierte una fecha/hora local Argentina a instante UTC. */
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
    hourCycle: 'h23',
  }).formatToParts(guess);

  const get = (type: string) => Number(formatted.find((p) => p.type === type)?.value ?? 0);
  const actualHour = get('hour') % 24;
  const actualMinute = get('minute');
  const diffMinutes = (hour - actualHour) * 60 + (minute - actualMinute);
  return new Date(guess.getTime() + diffMinutes * 60_000);
}

function normalizeDeadlineHour(hour?: number | null): number {
  if (hour == null || !Number.isFinite(hour)) return DELIVERY_DEADLINE_HOUR;
  const n = Math.trunc(Number(hour));
  if (n <= 0 || n > 23) return DELIVERY_DEADLINE_HOUR;
  return n;
}

/** Corte de hoy en horario Argentina. */
export function getTodayDeadlineInArgentina(
  date: Date = new Date(),
  deadlineHour: number = DELIVERY_DEADLINE_HOUR
): Date {
  const { year, month, day } = getArDateParts(date);
  return arLocalToUtc(year, month, day, normalizeDeadlineHour(deadlineHour));
}

export function parseOperationalDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

/** Corte operativo ART para una fecha YYYY-MM-DD. */
export function getDeadlineForOperationalDate(
  dateKey: string,
  deadlineHour: number = DELIVERY_DEADLINE_HOUR
): Date {
  const { year, month, day } = parseOperationalDateKey(dateKey);
  return arLocalToUtc(year, month, day, normalizeDeadlineHour(deadlineHour));
}

export function shiftOperationalDateKey(dateKey: string, days: number): string {
  const { year, month, day } = parseOperationalDateKey(dateKey);
  const noon = arLocalToUtc(year, month, day, 12);
  return getOperationalDateKey(new Date(noon.getTime() + days * 86_400_000));
}

/** 0 = domingo … 6 = sábado (calendario Argentina). */
export function getOperationalWeekday(dateKey: string): number {
  const { year, month, day } = parseOperationalDateKey(dateKey);
  const noon = arLocalToUtc(year, month, day, 12);
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: DELIVERY_TIMEZONE,
    weekday: 'short',
  }).format(noon);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

/** Domingo = no laboral. El sábado sí se opera. */
export function isWeekendOperationalDate(dateKey: string): boolean {
  return getOperationalWeekday(dateKey) === 0;
}

export function nextBusinessOperationalDateKey(dateKey: string): string {
  let key = dateKey;
  while (isWeekendOperationalDate(key)) {
    key = shiftOperationalDateKey(key, 1);
  }
  return key;
}

export function previousBusinessOperationalDateKey(dateKey: string): string {
  let key = dateKey;
  while (isWeekendOperationalDate(key)) {
    key = shiftOperationalDateKey(key, -1);
  }
  return key;
}

/**
 * Día operativo activo para paneles / datos.
 * Domingo no se trabaja → se usa el sábado anterior (misma lógica de negocio).
 * Para etiquetas “Hoy/Ayer” usar getOperationalDateKey (calendario).
 */
export function getActiveOperationalDateKey(date: Date = new Date()): string {
  return previousBusinessOperationalDateKey(getOperationalDateKey(date));
}

/** Día hábil siguiente (salta domingo). */
export function getNextOperationalDateKey(dateKey: string): string {
  return nextBusinessOperationalDateKey(shiftOperationalDateKey(dateKey, 1));
}

/**
 * Etiqueta relativa al calendario Argentina (no al día operativo rolleteado).
 * Así el domingo no muestra el sábado como “Hoy”.
 */
export function formatOperationalDateLabel(dateKey: string, now: Date = new Date()): string {
  const calendarToday = getOperationalDateKey(now);
  if (dateKey === calendarToday) return 'Hoy';
  if (dateKey === shiftOperationalDateKey(calendarToday, -1)) return 'Ayer';
  if (dateKey === getNextOperationalDateKey(getActiveOperationalDateKey(now))) return 'Mañana';
  const { year, month, day } = parseOperationalDateKey(dateKey);
  const label = new Intl.DateTimeFormat('es-AR', {
    timeZone: DELIVERY_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(arLocalToUtc(year, month, day, 12));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** True si el calendario es domingo y el panel está en el sábado operativo. */
export function isRolledBackWeekendOperationalDay(
  dateKey: string,
  now: Date = new Date()
): boolean {
  const calendarToday = getOperationalDateKey(now);
  if (!isWeekendOperationalDate(calendarToday)) return false;
  return dateKey === getActiveOperationalDateKey(now);
}

export function formatOperationalDateShort(dateKey: string): string {
  const { year, month, day } = parseOperationalDateKey(dateKey);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: DELIVERY_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(arLocalToUtc(year, month, day, 12));
}

export function formatOperationalWeekday(dateKey: string): string {
  const { year, month, day } = parseOperationalDateKey(dateKey);
  const label = new Intl.DateTimeFormat('es-AR', {
    timeZone: DELIVERY_TIMEZONE,
    weekday: 'long',
  }).format(arLocalToUtc(year, month, day, 12));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function toOperationalDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getOperationalMonthKey(dateKey: string): string {
  const { year, month } = parseOperationalDateKey(dateKey);
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function shiftOperationalMonthKey(monthKey: string, deltaMonths: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  let m = month + deltaMonths;
  let y = year;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function daysInOperationalMonth(year: number, month: number): number {
  for (let day = 31; day >= 28; day -= 1) {
    if (getArDateParts(arLocalToUtc(year, month, day, 12)).month === month) return day;
  }
  return 28;
}

function getWeekdayMondayFirst(year: number, month: number, day: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DELIVERY_TIMEZONE,
    weekday: 'short',
  }).formatToParts(arLocalToUtc(year, month, day, 12));
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const map: Record<string, number> = { Sun: 6, Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 };
  return map[wd] ?? 0;
}

export function buildOperationalMonthGrid(monthKey: string): (string | null)[] {
  const [year, month] = monthKey.split('-').map(Number);
  const totalDays = daysInOperationalMonth(year, month);
  const offset = getWeekdayMondayFirst(year, month, 1);
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(toOperationalDateKey(year, month, day));
  }
  return cells;
}

export function formatOperationalMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const label = new Intl.DateTimeFormat('es-AR', {
    timeZone: DELIVERY_TIMEZONE,
    month: 'long',
    year: 'numeric',
  }).format(arLocalToUtc(year, month, 15, 12));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function getOperationalDateKey(date: Date = new Date()): string {
  const { year, month, day } = getArDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isTodayOrder(order: Order, dateKey: string): boolean {
  // Solo el día operativo de entrega (deliveryDeadline). No mezclar con createdAt:
  // un pedido dado de alta el sábado post-corte con corte→lunes no debe aparecer en el sábado.
  const operationalKey = order.deliveryDeadline
    ? getOperationalDateKey(new Date(order.deliveryDeadline))
    : getOperationalDateKey(new Date(order.createdAt));
  return operationalKey === dateKey;
}

export function getTodayOrders(
  orders: Order[],
  dateKey: string = getActiveOperationalDateKey()
): Order[] {
  return orders.filter((o) => !o.archived && isTodayOrder(o, dateKey));
}

export function getUndeliveredTodayOrders(
  orders: Order[],
  dateKey: string = getActiveOperationalDateKey()
): Order[] {
  return getTodayOrders(orders, dateKey).filter(
    (o) => o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELLED
  );
}

export function getDeliveredTodayOrders(
  orders: Order[],
  dateKey: string = getActiveOperationalDateKey()
): Order[] {
  return getTodayOrders(orders, dateKey).filter((o) => o.status === OrderStatus.DELIVERED);
}

/** Instantáneo en que el pedido pasó a entregado (historial o updatedAt). */
export function getOrderDeliveredAt(order: Order): Date | null {
  const deliveredEvents = order.history.filter((e) => e.status === OrderStatus.DELIVERED);
  if (deliveredEvents.length > 0) {
    return new Date(deliveredEvents[deliveredEvents.length - 1]!.timestamp);
  }
  if (order.status === OrderStatus.DELIVERED) {
    return new Date(order.updatedAt);
  }
  return null;
}

export function getOrderDeadline(order: Order, forDateKey?: string): Date {
  // Límite de entrega del día (21 hs), no el corte de ventas stampado en deliveryDeadline.
  const dateKey =
    forDateKey ??
    (order.deliveryDeadline
      ? getOperationalDateKey(new Date(order.deliveryDeadline))
      : getOperationalDateKey(new Date(order.createdAt)));
  return getDeadlineForOperationalDate(dateKey, DELIVERY_SLA_HOUR);
}

/** Tarde = entregado después de las 21:00 ART del día operativo indicado. */
export function wasDeliveredAfterDeadline(order: Order, forDateKey?: string): boolean {
  if (order.status !== OrderStatus.DELIVERED) return false;
  const deliveredAt = getOrderDeliveredAt(order);
  if (!deliveredAt) return false;
  return deliveredAt.getTime() > getOrderDeadline(order, forDateKey).getTime();
}

export function getDeliveredLateTodayOrders(
  orders: Order[],
  dateKey: string = getActiveOperationalDateKey()
): Order[] {
  return getDeliveredTodayOrders(orders, dateKey).filter((o) =>
    wasDeliveredAfterDeadline(o, dateKey)
  );
}

export function computeDeliverySummaryFromOrders(
  orders: Order[],
  dateKey: string = getActiveOperationalDateKey(),
  deadlineHour: number = DELIVERY_DEADLINE_HOUR
): DeliveryDailySummary {
  const cutHour = normalizeDeadlineHour(deadlineHour);
  const todayOrders = orders.filter((o) => !o.archived && isTodayOrder(o, dateKey));
  const deliveredToday = todayOrders.filter((o) => o.status === OrderStatus.DELIVERED);
  const delivered = deliveredToday.length;
  const deliveredLate = deliveredToday.filter((o) => wasDeliveredAfterDeadline(o, dateKey)).length;
  const cancelled = todayOrders.filter((o) => o.status === OrderStatus.CANCELLED).length;
  const undelivered = todayOrders.filter(
    (o) => o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELLED
  ).length;
  const total = todayOrders.length;

  const todayKey = getActiveOperationalDateKey();
  const salesCutoffAt = getDeadlineForOperationalDate(dateKey, cutHour);
  const deliverySlaAt = getDeadlineForOperationalDate(dateKey, DELIVERY_SLA_HOUR);
  const now = Date.now();
  const isViewingToday = dateKey === todayKey;
  // "Corte vencido" = pasó el corte de ventas (nuevos pedidos → día hábil siguiente).
  const isPastDeadline = isViewingToday
    ? now >= salesCutoffAt.getTime()
    : dateKey < todayKey;
  // "Fuera de plazo" = sin entregar después del límite de entrega (21 hs), o día pasado.
  const isPastDeliverySla = isViewingToday
    ? now >= deliverySlaAt.getTime()
    : dateKey < todayKey;

  return {
    date: dateKey,
    deadlineHour: cutHour,
    deadlineAt: salesCutoffAt.toISOString(),
    total,
    delivered,
    undelivered,
    overdue: isPastDeliverySla ? undelivered : 0,
    deliveredLate,
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
