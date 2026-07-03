export const DELIVERY_DEADLINE_HOUR = 21;
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

/** Calcula el corte de entrega (21:00 AR) para un pedido creado en `createdAt`. */
export function computeDeliveryDeadline(createdAt: Date = new Date()): Date {
  const { year, month, day, hour } = getArDateParts(createdAt);
  if (hour >= DELIVERY_DEADLINE_HOUR) {
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return arLocalToUtc(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      DELIVERY_DEADLINE_HOUR
    );
  }
  return arLocalToUtc(year, month, day, DELIVERY_DEADLINE_HOUR);
}

export function getTodayDeadline(): Date {
  const { year, month, day } = getArDateParts(new Date());
  return arLocalToUtc(year, month, day, DELIVERY_DEADLINE_HOUR);
}

export function getArHourMinute(date: Date = new Date()): { hour: number; minute: number } {
  const { hour, minute } = getArDateParts(date);
  return { hour, minute };
}
