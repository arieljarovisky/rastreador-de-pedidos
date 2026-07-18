/** Default / fallback si la agencia no tiene corte configurado (alineado al corte Flex ML típico 13:00). */
export const DELIVERY_DEADLINE_HOUR = 13;
/** Hora límite de entrega del día operativo (Flex “antes de las 21 hs”). Distinta del corte de ventas. */
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

/** Normaliza hora de corte a entero 0–23. */
export function normalizeDeadlineHour(hour?: number | null): number {
  if (hour == null || !Number.isFinite(hour)) return DELIVERY_DEADLINE_HOUR;
  const n = Math.trunc(Number(hour));
  if (n < 0 || n > 23) return DELIVERY_DEADLINE_HOUR;
  return n;
}

/** Fecha operativa YYYY-MM-DD en horario Argentina. */
export function getOperationalDateKey(date: Date = new Date()): string {
  const { year, month, day } = getArDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
  const actualHour = get('hour');
  const actualMinute = get('minute');
  const diffMinutes = (hour - actualHour) * 60 + (minute - actualMinute);
  return new Date(guess.getTime() + diffMinutes * 60_000);
}

export function getOperationalDayBounds(dateKey: string): { start: Date; end: Date } {
  const [year, month, day] = dateKey.split('-').map(Number);
  const start = arLocalToUtc(year, month, day, 0, 0);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const end = arLocalToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0);
  return { start, end };
}

/** Calcula el corte de entrega para un pedido creado en `createdAt`.
 *  Vie post-corte / sáb / dom → lunes (días hábiles). Flex con lead_time ML no usa esta ruta.
 */
export function computeDeliveryDeadline(
  createdAt: Date = new Date(),
  deadlineHour: number = DELIVERY_DEADLINE_HOUR
): Date {
  const cutHour = normalizeDeadlineHour(deadlineHour);
  const { year, month, day, hour } = getArDateParts(createdAt);
  let dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (hour >= cutHour) {
    dateKey = shiftOperationalDateKey(dateKey, 1);
  }
  return deliveryDeadlineForBusinessDate(dateKey, cutHour);
}

export function getTodayDeadline(deadlineHour: number = DELIVERY_DEADLINE_HOUR): Date {
  const cutHour = normalizeDeadlineHour(deadlineHour);
  const { year, month, day } = getArDateParts(new Date());
  return arLocalToUtc(year, month, day, cutHour);
}

/** Corte operativo para un día YYYY-MM-DD. */
export function deliveryDeadlineForOperationalDate(
  dateKey: string,
  deadlineHour: number = DELIVERY_DEADLINE_HOUR
): Date {
  const cutHour = normalizeDeadlineHour(deadlineHour);
  const [year, month, day] = dateKey.split('-').map(Number);
  return arLocalToUtc(year, month, day, cutHour);
}

/** Suma días a una clave operativa YYYY-MM-DD (zona AR). */
export function shiftOperationalDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const noon = arLocalToUtc(year, month, day, 12);
  return getOperationalDateKey(new Date(noon.getTime() + days * 86_400_000));
}

/** 0 = domingo … 6 = sábado (calendario Argentina). */
export function getOperationalWeekday(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
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

export function isWeekendOperationalDate(dateKey: string): boolean {
  const wd = getOperationalWeekday(dateKey);
  return wd === 0 || wd === 6;
}

/** Si cae sáb/dom, avanza al lunes. */
export function nextBusinessOperationalDateKey(dateKey: string): string {
  let key = dateKey;
  while (isWeekendOperationalDate(key)) {
    key = shiftOperationalDateKey(key, 1);
  }
  return key;
}

/** Corte del día hábil (salta finde al lunes). */
export function deliveryDeadlineForBusinessDate(
  dateKey: string,
  deadlineHour: number = DELIVERY_DEADLINE_HOUR
): Date {
  return deliveryDeadlineForOperationalDate(
    nextBusinessOperationalDateKey(dateKey),
    deadlineHour
  );
}

/** Próximo corte operativo en día hábil (salta sáb/dom). */
export function nextOperationalDeliveryDeadline(
  fromDeadlineOrNow: Date = new Date(),
  deadlineHour: number = DELIVERY_DEADLINE_HOUR
): Date {
  const todayKey = getOperationalDateKey(new Date());
  const fromKey = getOperationalDateKey(fromDeadlineOrNow);
  const baseKey = fromKey >= todayKey ? fromKey : todayKey;
  return deliveryDeadlineForBusinessDate(shiftOperationalDateKey(baseKey, 1), deadlineHour);
}

/** Convierte una fecha ISO (p. ej. ML) al corte operativo de ese día calendario. */
export function deliveryDeadlineFromIsoDate(
  isoDate: string,
  deadlineHour: number = DELIVERY_DEADLINE_HOUR
): Date | null {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return deliveryDeadlineForOperationalDate(getOperationalDateKey(parsed), deadlineHour);
}

export function getArHourMinute(date: Date = new Date()): { hour: number; minute: number } {
  const { hour, minute } = getArDateParts(date);
  return { hour, minute };
}

export function formatDeadlineHourLabel(deadlineHour: number = DELIVERY_DEADLINE_HOUR): string {
  return `${String(normalizeDeadlineHour(deadlineHour)).padStart(2, '0')}:00`;
}
