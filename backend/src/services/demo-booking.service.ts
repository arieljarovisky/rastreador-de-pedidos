import {
  createDemoEvent,
  isGoogleCalendarConfigured,
  queryFreeBusy,
} from './google-calendar.service.js';
import { env } from '../config/env.js';

export type DemoSlot = {
  start: string;
  end: string;
  label: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateInTimezone(dateStr: string): Date {
  const { timezone } = env.googleCalendar;
  const parts = dateStr.split('-').map(Number);
  const year = parts[0]!;
  const month = parts[1]!;
  const day = parts[2]!;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = formatter.formatToParts(probe).find((p) => p.type === 'weekday')?.value ?? '';
  if (['Sat', 'Sun'].includes(weekday)) {
    throw new DemoBookingError('INVALID_DATE', 'Solo podés agendar de lunes a viernes.');
  }
  return probe;
}

function zonedDateTimeToUtcIso(dateStr: string, hour: number, minute: number): string {
  const { timezone } = env.googleCalendar;
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];

  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimezoneOffsetMs(guess, timezone);
    const next = Date.UTC(year, month - 1, day, hour, minute, 0) - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess).toISOString();
}

function getTimezoneOffsetMs(utcMs: number, timezone: string): number {
  const date = new Date(utcMs);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - utcMs;
}

function formatSlotLabel(startIso: string, endIso: string): string {
  const { timezone } = env.googleCalendar;
  const start = new Date(startIso);
  const end = new Date(endIso);
  const fmt = new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function generateDaySlots(dateStr: string): Array<{ start: string; end: string }> {
  const { slotDurationMinutes, workdayStartHour, workdayEndHour } = env.googleCalendar;
  const slots: Array<{ start: string; end: string }> = [];
  const totalMinutes = (workdayEndHour - workdayStartHour) * 60;

  for (let offset = 0; offset + slotDurationMinutes <= totalMinutes; offset += slotDurationMinutes) {
    const startHour = workdayStartHour + Math.floor(offset / 60);
    const startMinute = offset % 60;
    const endTotal = offset + slotDurationMinutes;
    const endHour = workdayStartHour + Math.floor(endTotal / 60);
    const endMinute = endTotal % 60;

    const start = zonedDateTimeToUtcIso(dateStr, startHour, startMinute);
    const end = zonedDateTimeToUtcIso(dateStr, endHour, endMinute);
    slots.push({ start, end });
  }

  return slots;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

function isDateWithinBookingWindow(dateStr: string): boolean {
  const { timezone, bookingDaysAhead } = env.googleCalendar;
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  const todayParts = todayStr.split('-').map(Number) as [number, number, number];
  const targetParts = dateStr.split('-').map(Number) as [number, number, number];

  const todayUtc = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]);
  const targetUtc = Date.UTC(targetParts[0], targetParts[1] - 1, targetParts[2]);
  const diffDays = Math.round((targetUtc - todayUtc) / (24 * 60 * 60 * 1000));

  return diffDays >= 1 && diffDays <= bookingDaysAhead;
}

function filterPastSlots(slots: Array<{ start: string; end: string }>): Array<{ start: string; end: string }> {
  const now = Date.now();
  return slots.filter((slot) => new Date(slot.start).getTime() > now + 5 * 60 * 1000);
}

export class DemoBookingError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'DemoBookingError';
  }
}

export function assertDemoBookingConfigured(): void {
  if (!isGoogleCalendarConfigured()) {
    throw new DemoBookingError(
      'NOT_CONFIGURED',
      'El agendado de demos todavía no está disponible. Escribinos a soporte.'
    );
  }
}

export async function getAvailableDemoSlots(dateStr: string): Promise<DemoSlot[]> {
  assertDemoBookingConfigured();

  if (!DATE_RE.test(dateStr)) {
    throw new DemoBookingError('INVALID_DATE', 'Fecha inválida.');
  }
  if (!isDateWithinBookingWindow(dateStr)) {
    throw new DemoBookingError(
      'INVALID_DATE',
      `Elegí una fecha entre mañana y los próximos ${env.googleCalendar.bookingDaysAhead} días.`
    );
  }

  parseDateInTimezone(dateStr);

  let slots = generateDaySlots(dateStr);
  slots = filterPastSlots(slots);
  if (slots.length === 0) return [];

  const timeMin = slots[0]!.start;
  const timeMax = slots[slots.length - 1]!.end;
  const busy = await queryFreeBusy(timeMin, timeMax);

  return slots
    .filter((slot) => !busy.some((period) => overlaps(slot.start, slot.end, period.start, period.end)))
    .map((slot) => ({
      start: slot.start,
      end: slot.end,
      label: formatSlotLabel(slot.start, slot.end),
    }));
}

export type BookDemoInput = {
  name: string;
  email: string;
  company?: string;
  notes?: string;
  start: string;
};

export type BookDemoResult = {
  eventId: string;
  htmlLink: string;
  meetLink: string | null;
  start: string;
  end: string;
  label: string;
};

export async function bookDemo(input: BookDemoInput): Promise<BookDemoResult> {
  assertDemoBookingConfigured();

  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const start = input.start?.trim();

  if (!name || name.length < 2) {
    throw new DemoBookingError('INVALID_INPUT', 'Ingresá tu nombre.');
  }
  if (!email || !EMAIL_RE.test(email)) {
    throw new DemoBookingError('INVALID_INPUT', 'Ingresá un email válido.');
  }
  if (!start) {
    throw new DemoBookingError('INVALID_INPUT', 'Elegí un horario.');
  }

  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) {
    throw new DemoBookingError('INVALID_INPUT', 'Horario inválido.');
  }

  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.googleCalendar.timezone,
  }).format(startDate);

  const available = await getAvailableDemoSlots(dateStr);
  const slot = available.find((candidate) => candidate.start === start);
  if (!slot) {
    throw new DemoBookingError(
      'SLOT_UNAVAILABLE',
      'Ese horario ya no está disponible. Elegí otro.'
    );
  }

  const created = await createDemoEvent({
    startIso: slot.start,
    endIso: slot.end,
    attendeeName: name,
    attendeeEmail: email,
    company: input.company,
    notes: input.notes,
  });

  return {
    ...created,
    start: slot.start,
    end: slot.end,
    label: slot.label,
  };
}
