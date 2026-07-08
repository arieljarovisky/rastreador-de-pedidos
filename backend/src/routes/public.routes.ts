import { Router, Request, Response } from 'express';
import { getPublicTrackingByMercadoLibreRef } from '../services/public-tracking.service.js';

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
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 20) return null;
  return trimmed;
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
      message: 'Ingresá un número de venta o envío de Mercado Libre (mínimo 8 dígitos).',
    });
    return;
  }

  try {
    const tracking = await getPublicTrackingByMercadoLibreRef(ref);
    if (!tracking) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message:
          'No encontramos un envío con ese número. Verificá el ID de tu venta o envío en Mercado Libre.',
      });
      return;
    }
    res.json(tracking);
  } catch (err) {
    console.error('[public/track]', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'No pudimos consultar el seguimiento. Intentá de nuevo en unos minutos.',
    });
  }
});

export default router;
