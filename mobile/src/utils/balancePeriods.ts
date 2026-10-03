import { getOperationalDateKey } from './deliverySummary';

export type BalancePeriod = 'day' | 'week' | 'month';

export interface BalanceRange {
  dateFrom: string;
  dateTo: string;
  title: string;
  rangeLabel: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function parseKey(dateKey: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateKey.split('-').map(Number);
  return { y, m, d };
}

export function addDays(dateKey: string, days: number): string {
  const { y, m, d } = parseKey(dateKey);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function addMonths(dateKey: string, months: number): string {
  const { y, m, d } = parseKey(dateKey);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(day)}`;
}

/** 0 = lunes … 6 = domingo. */
function weekdayMonday0(dateKey: string): number {
  const { y, m, d } = parseKey(dateKey);
  const sun0 = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (sun0 + 6) % 7;
}

function monthBounds(dateKey: string): { dateFrom: string; dateTo: string } {
  const { y, m } = parseKey(dateKey);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    dateFrom: `${y}-${pad(m)}-01`,
    dateTo: `${y}-${pad(m)}-${pad(last)}`,
  };
}

function formatShort(dateKey: string, withYear = false): string {
  const { y, m, d } = parseKey(dateKey);
  const date = new Date(Date.UTC(y, m - 1, d, 15));
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: withYear ? 'numeric' : undefined,
  })
    .format(date)
    .replace('.', '');
}

function formatMonthName(dateKey: string): string {
  const { y, m, d } = parseKey(dateKey);
  const date = new Date(Date.UTC(y, m - 1, d, 15));
  const label = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function balanceRange(period: BalancePeriod, offset: number): BalanceRange {
  const today = getOperationalDateKey();

  if (period === 'day') {
    const key = addDays(today, offset);
    const title = offset === 0 ? 'Hoy' : offset === -1 ? 'Ayer' : formatShort(key, true);
    return {
      dateFrom: key,
      dateTo: key,
      title,
      rangeLabel: formatShort(key, true),
    };
  }

  if (period === 'week') {
    const anchor = addDays(today, offset * 7);
    const monday = addDays(anchor, -weekdayMonday0(anchor));
    const sunday = addDays(monday, 6);
    const title = offset === 0 ? 'Esta semana' : offset === -1 ? 'Semana anterior' : 'Semana';
    return {
      dateFrom: monday,
      dateTo: sunday,
      title,
      rangeLabel: `${formatShort(monday)} – ${formatShort(sunday, true)}`,
    };
  }

  const anchor = addMonths(today, offset);
  const bounds = monthBounds(anchor);
  const title = offset === 0 ? 'Este mes' : offset === -1 ? 'Mes anterior' : formatMonthName(bounds.dateFrom);
  return {
    ...bounds,
    title,
    rangeLabel: formatMonthName(bounds.dateFrom),
  };
}
