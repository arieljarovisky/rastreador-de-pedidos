/** Default / fallback si la agencia no tiene corte configurado. */
export const DELIVERY_DEADLINE_HOUR = 12;
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

/** Calcula el corte de entrega para un pedido creado en `createdAt`. */
export function computeDeliveryDeadline(
  createdAt: Date = new Date(),
  deadlineHour: number = DELIVERY_DEADLINE_HOUR
): Date {
  const cutHour = normalizeDeadlineHour(deadlineHour);
  const { year, month, day, hour } = getArDateParts(createdAt);
  if (hour >= cutHour) {
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return arLocalToUtc(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      cutHour
    );
  }
  return arLocalToUtc(year, month, day, cutHour);
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

/** Próximo corte operativo (mañana o día siguiente al deadline actual). */
export function nextOperationalDeliveryDeadline(
  fromDeadlineOrNow: Date = new Date(),
  deadlineHour: number = DELIVERY_DEADLINE_HOUR
): Date {
  const todayKey = getOperationalDateKey(new Date());
  const fromKey = getOperationalDateKey(fromDeadlineOrNow);
  const baseKey = fromKey >= todayKey ? fromKey : todayKey;
  return deliveryDeadlineForOperationalDate(shiftOperationalDateKey(baseKey, 1), deadlineHour);
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
