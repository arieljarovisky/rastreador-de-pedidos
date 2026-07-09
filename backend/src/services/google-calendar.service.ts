import { google, calendar_v3 } from 'googleapis';
import { env } from '../config/env.js';

type CalendarAuth = calendar_v3.Calendar;

let calendarClient: CalendarAuth | null = null;

function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, '\n');
}

export function isGoogleCalendarConfigured(): boolean {
  const { serviceAccountEmail, serviceAccountPrivateKey, refreshToken, calendarId } = env.googleCalendar;
  const hasServiceAccount = Boolean(serviceAccountEmail && serviceAccountPrivateKey);
  const hasOAuth = Boolean(env.googleCalendar.clientId && env.googleCalendar.clientSecret && refreshToken);
  return Boolean(calendarId && (hasServiceAccount || hasOAuth));
}

function getCalendarClient(): CalendarAuth {
  if (calendarClient) return calendarClient;

  const { serviceAccountEmail, serviceAccountPrivateKey, clientId, clientSecret, refreshToken } =
    env.googleCalendar;

  if (serviceAccountEmail && serviceAccountPrivateKey) {
    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: normalizePrivateKey(serviceAccountPrivateKey),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    calendarClient = google.calendar({ version: 'v3', auth });
    return calendarClient;
  }

  if (clientId && clientSecret && refreshToken) {
    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    calendarClient = google.calendar({ version: 'v3', auth });
    return calendarClient;
  }

  throw new Error('Google Calendar no está configurado');
}

export async function queryFreeBusy(
  timeMin: string,
  timeMax: string
): Promise<Array<{ start: string; end: string }>> {
  const calendar = getCalendarClient();
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: env.googleCalendar.timezone,
      items: [{ id: env.googleCalendar.calendarId }],
    },
  });

  const calendarBusy = response.data.calendars?.[env.googleCalendar.calendarId]?.busy ?? [];
  return calendarBusy
    .filter((slot): slot is { start: string; end: string } => Boolean(slot.start && slot.end))
    .map((slot) => ({ start: slot.start!, end: slot.end! }));
}

export type CreateDemoEventInput = {
  startIso: string;
  endIso: string;
  attendeeName: string;
  attendeeEmail: string;
  company?: string;
  notes?: string;
};

export type CreateDemoEventResult = {
  eventId: string;
  htmlLink: string;
  meetLink: string | null;
};

export async function createDemoEvent(input: CreateDemoEventInput): Promise<CreateDemoEventResult> {
  const calendar = getCalendarClient();
  const requestId = `posta-demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const companyLine = input.company?.trim() ? `\nEmpresa: ${input.company.trim()}` : '';
  const notesLine = input.notes?.trim() ? `\nNotas: ${input.notes.trim()}` : '';

  const response = await calendar.events.insert({
    calendarId: env.googleCalendar.calendarId,
    conferenceDataVersion: 1,
    sendUpdates: 'all',
    requestBody: {
      summary: `Demo Posta — ${input.attendeeName}`,
      description:
        `Demo de 30 minutos de Posta (logística en tiempo real).${companyLine}${notesLine}\n\n` +
        `Contacto: ${input.attendeeName} <${input.attendeeEmail}>`,
      start: {
        dateTime: input.startIso,
        timeZone: env.googleCalendar.timezone,
      },
      end: {
        dateTime: input.endIso,
        timeZone: env.googleCalendar.timezone,
      },
      attendees: [{ email: input.attendeeEmail, displayName: input.attendeeName }],
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    },
  });

  const event = response.data;
  const meetLink =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri ??
    null;

  if (!event.id || !event.htmlLink) {
    throw new Error('Google Calendar no devolvió el evento creado');
  }

  return {
    eventId: event.id,
    htmlLink: event.htmlLink,
    meetLink,
  };
}
