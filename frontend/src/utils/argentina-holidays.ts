/**
 * Feriados nacionales Argentina (Ley 27.399) + días no laborables con fines turísticos.
 * Inamovibles y Carnaval/Viernes Santo se calculan; trasladables usan art. 6;
 * los puentes turísticos se cargan por año cuando salen en el Boletín Oficial.
 */

export type ArgentinaHolidayKind = 'inamovible' | 'trasladable' | 'turistico';

export interface ArgentinaHoliday {
  dateKey: string;
  name: string;
  kind: ArgentinaHolidayKind;
}

/** Puentes / días no laborables turísticos (art. 7) publicados en BO. */
const TURISMO_BY_YEAR: Record<number, Array<{ month: number; day: number; name?: string }>> = {
  // Res. 164/2025 — Jefatura de Gabinete
  2026: [
    { month: 3, day: 23 },
    { month: 7, day: 10 },
    { month: 12, day: 7 },
  ],
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Domingo de Pascua (algoritmo gregoriano Anónimo). */
export function easterSundayParts(year: number): { year: number; month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function shiftYmd(
  year: number,
  month: number,
  day: number,
  deltaDays: number
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/** 0 = domingo … 6 = sábado (UTC noon del Y-M-D civil). */
function weekdaySun0(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

/**
 * Art. 6 Ley 27.399: martes/miércoles → lunes anterior; jueves/viernes → lunes siguiente.
 * Lunes/sábado/domingo: se mantiene la fecha.
 */
function applyTrasladable(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const wd = weekdaySun0(year, month, day);
  if (wd === 2 || wd === 3) {
    // martes (2) → -1; miércoles (3) → -2
    return shiftYmd(year, month, day, -(wd - 1));
  }
  if (wd === 4 || wd === 5) {
    // jueves (4) → +4; viernes (5) → +3
    return shiftYmd(year, month, day, 8 - wd);
  }
  return { year, month, day };
}

const FIXED_INAMOVIBLES: Array<{ month: number; day: number; name: string }> = [
  { month: 1, day: 1, name: 'Año Nuevo' },
  { month: 3, day: 24, name: 'Día Nacional de la Memoria por la Verdad y la Justicia' },
  { month: 4, day: 2, name: 'Día del Veterano y de los Caídos en la Guerra de Malvinas' },
  { month: 5, day: 1, name: 'Día del Trabajo' },
  { month: 5, day: 25, name: 'Día de la Revolución de Mayo' },
  { month: 6, day: 20, name: 'Paso a la Inmortalidad del General Manuel Belgrano' },
  { month: 7, day: 9, name: 'Día de la Independencia' },
  { month: 12, day: 8, name: 'Día de la Inmaculada Concepción de María' },
  { month: 12, day: 25, name: 'Navidad' },
];

const TRASLADABLES: Array<{ month: number; day: number; name: string }> = [
  { month: 6, day: 17, name: 'Paso a la Inmortalidad del General Martín Miguel de Güemes' },
  { month: 8, day: 17, name: 'Paso a la Inmortalidad del General José de San Martín' },
  { month: 10, day: 12, name: 'Día del Respeto a la Diversidad Cultural' },
  { month: 11, day: 20, name: 'Día de la Soberanía Nacional' },
];

const holidayCache = new Map<number, Map<string, ArgentinaHoliday>>();

function buildYearHolidays(year: number): Map<string, ArgentinaHoliday> {
  const map = new Map<string, ArgentinaHoliday>();
  const add = (dateKey: string, name: string, kind: ArgentinaHolidayKind) => {
    // Si coinciden (p. ej. puente + feriado), priorizar el nombre ya cargado salvo turismo.
    if (!map.has(dateKey) || kind !== 'turistico') {
      map.set(dateKey, { dateKey, name, kind });
    }
  };

  for (const h of FIXED_INAMOVIBLES) {
    add(toDateKey(year, h.month, h.day), h.name, 'inamovible');
  }

  const easter = easterSundayParts(year);
  const carnivalMon = shiftYmd(easter.year, easter.month, easter.day, -48);
  const carnivalTue = shiftYmd(easter.year, easter.month, easter.day, -47);
  const goodFriday = shiftYmd(easter.year, easter.month, easter.day, -2);
  add(toDateKey(carnivalMon.year, carnivalMon.month, carnivalMon.day), 'Carnaval', 'inamovible');
  add(toDateKey(carnivalTue.year, carnivalTue.month, carnivalTue.day), 'Carnaval', 'inamovible');
  add(toDateKey(goodFriday.year, goodFriday.month, goodFriday.day), 'Viernes Santo', 'inamovible');

  for (const h of TRASLADABLES) {
    const moved = applyTrasladable(year, h.month, h.day);
    const dateKey = toDateKey(moved.year, moved.month, moved.day);
    const movedFromOrigin =
      moved.month !== h.month || moved.day !== h.day
        ? `${h.name} (trasladado)`
        : h.name;
    add(dateKey, movedFromOrigin, 'trasladable');
  }

  for (const t of TURISMO_BY_YEAR[year] ?? []) {
    add(
      toDateKey(year, t.month, t.day),
      t.name ?? 'Día no laborable con fines turísticos',
      'turistico'
    );
  }

  return map;
}

function holidaysForYear(year: number): Map<string, ArgentinaHoliday> {
  let cached = holidayCache.get(year);
  if (!cached) {
    cached = buildYearHolidays(year);
    holidayCache.set(year, cached);
  }
  return cached;
}

export function getArgentinaHoliday(dateKey: string): ArgentinaHoliday | null {
  const year = Number(dateKey.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return holidaysForYear(year).get(dateKey) ?? null;
}

export function isArgentinaHoliday(dateKey: string): boolean {
  return getArgentinaHoliday(dateKey) != null;
}

export function getArgentinaHolidayName(dateKey: string): string | null {
  return getArgentinaHoliday(dateKey)?.name ?? null;
}

export function listArgentinaHolidays(year: number): ArgentinaHoliday[] {
  return [...holidaysForYear(year).values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}
