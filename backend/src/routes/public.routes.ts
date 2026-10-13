import { Router, Request, Response } from 'express';
import { getPublicTrackingByRef } from '../services/public-tracking.service.js';
import { isPublicTrackingSource } from '../services/orders.service.js';
import {
  bookDemo,
  DemoBookingError,
  getAvailableDemoSlots,
} from '../services/demo-booking.service.js';
import { isGoogleCalendarConfigured } from '../services/google-calendar.service.js';

const router = Router();

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX;
}

function normalizeRef(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^#/, '');
  if (!trimmed || trimmed.length < 3 || trimmed.length > 32) return null;
  // Códigos Posta (PST…) o números de pedido/envío de marketplaces.
  if (!/\d/.test(trimmed) && !/^PST/i.test(trimmed)) return null;
  return trimmed;
}

function normalizeSource(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim().toLowerCase();
  if (!value || value === 'all') return undefined;
  return isPublicTrackingSource(value) ? value : undefined;
}

router.get('/track', async (req: Request, res: Response) => {
  const ip = clientKey(req);
  if (isRateLimited(ip)) {
    res.status(429).json({
      error: 'RATE_LIMIT',
      message: 'Demasiadas consultas. Esperá un minuto e intentá de nuevo.',
    });
    return;
  }

  const ref = normalizeRef(req.query.ref);
  if (!ref) {
    res.status(400).json({
      error: 'INVALID_REF',
      message:
        'Ingresá tu código Posta (PST…) o el número de pedido/envío.',
    });
    return;
  }

  const sourceRaw = typeof req.query.source === 'string' ? req.query.source.trim().toLowerCase() : '';
  if (sourceRaw && sourceRaw !== 'all' && !isPublicTrackingSource(sourceRaw)) {
    res.status(400).json({
      error: 'INVALID_SOURCE',
      message: 'La tienda indicada no es válida.',
    });
    return;
  }

  const source = normalizeSource(req.query.source);

  try {
    const result = await getPublicTrackingByRef(ref, { source });
    if (result.status === 'ambiguous') {
      res.status(409).json({
        error: 'AMBIGUOUS_REF',
        message:
          'Encontramos más de un envío con ese número. Usá el código Posta (PST…) o el número completo que figura en el correo de compra.',
      });
      return;
    }
    if (result.status === 'not_found') {
      res.status(404).json({
        error: 'NOT_FOUND',
        message:
          'No encontramos un envío con ese número. Verificá el código Posta (PST…) o el ID de tu pedido en el correo de compra.',
      });
      return;
    }
    res.json(result.tracking);
  } catch (err) {
    console.error('[public/track]', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'No pudimos consultar el seguimiento. Intentá de nuevo en unos minutos.',
    });
  }
});

router.get('/demo/status', (_req: Request, res: Response) => {
  res.json({
    configured: isGoogleCalendarConfigured(),
    durationMinutes: 30,
  });
});

router.get('/demo/slots', async (req: Request, res: Response) => {
  const ip = clientKey(req);
  if (isRateLimited(ip)) {
    res.status(429).json({
      error: 'RATE_LIMIT',
      message: 'Demasiadas consultas. Esperá un minuto e intentá de nuevo.',
    });
    return;
  }

  const date = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  if (!date) {
    res.status(400).json({
      error: 'INVALID_DATE',
      message: 'Elegí una fecha para ver horarios disponibles.',
    });
    return;
  }

  try {
    const slots = await getAvailableDemoSlots(date);
    res.json({ date, slots });
  } catch (err) {
    if (err instanceof DemoBookingError) {
      res.status(400).json({ error: err.code, message: err.message });
      return;
    }
    console.error('[public/demo/slots]', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'No pudimos cargar los horarios. Intentá de nuevo en unos minutos.',
    });
  }
});

router.post('/demo/book', async (req: Request, res: Response) => {
  const ip = clientKey(req);
  if (isRateLimited(ip)) {
    res.status(429).json({
      error: 'RATE_LIMIT',
      message: 'Demasiadas consultas. Esperá un minuto e intentá de nuevo.',
    });
    return;
  }

  const body = req.body as {
    name?: unknown;
    email?: unknown;
    company?: unknown;
    notes?: unknown;
    start?: unknown;
  };

  try {
    const result = await bookDemo({
      name: typeof body.name === 'string' ? body.name : '',
      email: typeof body.email === 'string' ? body.email : '',
      company: typeof body.company === 'string' ? body.company : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      start: typeof body.start === 'string' ? body.start : '',
    });
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof DemoBookingError) {
      const status = err.code === 'SLOT_UNAVAILABLE' ? 409 : 400;
      res.status(status).json({ error: err.code, message: err.message });
      return;
    }
    console.error('[public/demo/book]', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'No pudimos agendar la demo. Intentá de nuevo en unos minutos.',
    });
  }
});

export default router;
