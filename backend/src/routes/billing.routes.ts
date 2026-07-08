import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import {
  getBillingSummary,
  listBillingLedger,
  getAgencyDefaultShippingRates,
  listAgencyZoneShippingRates,
  updateAgencyDefaultShippingRates,
  recordBillingPayment,
} from '../services/billing.service.js';
import {
  createSellerBillingCheckout,
  getSellerOutstandingBalance,
  isAgencyMpConnectedForSeller,
} from '../services/billing-payment.service.js';

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
      console.error('[billing] GET /summary error:', err);
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
      console.error('[billing] GET /ledger error:', err);
    }
  }
);

router.get(
  '/rates',
  authenticate,
  requireRoles(UserRole.STORE_ADMIN, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN),
  async (req: Request, res: Response) => {
    if (!req.user?.agencyId) {
      res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
      return;
    }
    const [zoneRates, defaultRates] = await Promise.all([
      listAgencyZoneShippingRates(req.user.agencyId),
      getAgencyDefaultShippingRates(req.user.agencyId),
    ]);
    res.json({ zoneRates, defaultRates });
  }
);

router.put(
  '/rates/default',
  authenticate,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const { flex, express, standard } = req.body as {
        flex?: number;
        express?: number;
        standard?: number;
      };
      const rates = await updateAgencyDefaultShippingRates(req.user!, { flex, express, standard });
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

router.get(
  '/payment-options',
  authenticate,
  requireRoles(UserRole.STORE_ADMIN),
  async (req: Request, res: Response) => {
    if (!req.user?.agencyId) {
      res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
      return;
    }
    const [balance, mpConnected] = await Promise.all([
      getSellerOutstandingBalance(req.user.agencyId, req.user.id),
      isAgencyMpConnectedForSeller(req.user.agencyId),
    ]);
    res.json({ balance, mercadoPagoAvailable: mpConnected });
  }
);

router.post(
  '/payments/checkout',
  authenticate,
  requireRoles(UserRole.STORE_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const amount =
        typeof req.body?.amount === 'number'
          ? req.body.amount
          : typeof req.body?.amount === 'string'
            ? Number(req.body.amount)
            : undefined;
      const checkout = await createSellerBillingCheckout(req.user!, { amount });
      res.json(checkout);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      if (code === 'FORBIDDEN') {
        res.status(403).json({ error: 'No tenés permiso para pagar.' });
        return;
      }
      if (code === 'AGENCY_MP_NOT_CONNECTED') {
        res.status(400).json({
          error: 'Tu agencia aún no conectó Mercado Pago. Pedile que lo configure en Ajustes.',
        });
        return;
      }
      if (code === 'NO_BALANCE') {
        res.status(400).json({ error: 'No tenés saldo pendiente por pagar.' });
        return;
      }
      if (code === 'AMOUNT_EXCEEDS_BALANCE') {
        res.status(400).json({ error: 'El monto supera tu saldo pendiente.' });
        return;
      }
      res.status(500).json({ error: 'No se pudo iniciar el pago.' });
      console.error('[billing] POST /payments/checkout error:', err);
    }
  }
);

export default router;
