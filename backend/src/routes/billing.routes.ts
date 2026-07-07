import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import {
  getBillingSummary,
  listBillingLedger,
  getAgencyShippingRates,
  updateAgencyShippingRates,
  recordBillingPayment,
} from '../services/billing.service.js';

const router = Router();

function parseDateQuery(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function currentMonthRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    dateFrom: `${y}-${m}-01`,
    dateTo: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

router.get(
  '/summary',
  authenticate,
  requireRoles(UserRole.STORE_ADMIN, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const defaults = currentMonthRange();
      const dateFrom = parseDateQuery(req.query.dateFrom, defaults.dateFrom);
      const dateTo = parseDateQuery(req.query.dateTo, defaults.dateTo);
      const sellerId = typeof req.query.sellerId === 'string' ? req.query.sellerId : undefined;
      const summary = await getBillingSummary(req.user!, { dateFrom, dateTo, sellerId });
      res.json(summary);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      if (code === 'FORBIDDEN') {
        res.status(403).json({ error: 'No tenés permiso para ver esta cuenta.' });
        return;
      }
      if (code === 'NO_AGENCY') {
        res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
        return;
      }
      res.status(500).json({ error: 'No se pudo cargar el resumen de cuenta.' });
    }
  }
);

router.get(
  '/ledger',
  authenticate,
  requireRoles(UserRole.STORE_ADMIN, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const defaults = currentMonthRange();
      const dateFrom = parseDateQuery(req.query.dateFrom, defaults.dateFrom);
      const dateTo = parseDateQuery(req.query.dateTo, defaults.dateTo);
      const sellerId = typeof req.query.sellerId === 'string' ? req.query.sellerId : undefined;
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
      const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
      const entries = await listBillingLedger(req.user!, { dateFrom, dateTo, sellerId, limit, offset });
      res.json(entries);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      if (code === 'FORBIDDEN' || code === 'NO_AGENCY') {
        res.status(403).json({ error: 'No tenés permiso para ver estos movimientos.' });
        return;
      }
      res.status(500).json({ error: 'No se pudo cargar el historial.' });
    }
  }
);

router.get(
  '/rates',
  authenticate,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN),
  async (req: Request, res: Response) => {
    if (!req.user?.agencyId) {
      res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
      return;
    }
    const rates = await getAgencyShippingRates(req.user.agencyId);
    res.json(rates);
  }
);

router.put(
  '/rates',
  authenticate,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const { flex, express, standard } = req.body as {
        flex?: number;
        express?: number;
        standard?: number;
      };
      const rates = await updateAgencyShippingRates(req.user!, { flex, express, standard });
      res.json(rates);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      if (code === 'FORBIDDEN') {
        res.status(403).json({ error: 'No tenés permiso para editar tarifas.' });
        return;
      }
      res.status(500).json({ error: 'No se pudieron guardar las tarifas.' });
    }
  }
);

router.post(
  '/payments',
  authenticate,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const { sellerId, amount, description } = req.body as {
        sellerId?: string;
        amount?: number;
        description?: string;
      };
      if (!sellerId || amount === undefined) {
        res.status(400).json({ error: 'sellerId y amount son requeridos.' });
        return;
      }
      const entry = await recordBillingPayment(req.user!, { sellerId, amount: Number(amount), description });
      res.status(201).json(entry);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      if (code === 'FORBIDDEN') {
        res.status(403).json({ error: 'No tenés permiso para registrar pagos.' });
        return;
      }
      if (code === 'SELLER_NOT_FOUND') {
        res.status(404).json({ error: 'Vendedor no encontrado en tu agencia.' });
        return;
      }
      if (code === 'INVALID_PAYMENT') {
        res.status(400).json({ error: 'Monto de pago inválido.' });
        return;
      }
      res.status(500).json({ error: 'No se pudo registrar el pago.' });
    }
  }
);

export default router;
