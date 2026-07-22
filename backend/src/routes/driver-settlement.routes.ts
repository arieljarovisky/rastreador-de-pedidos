import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import {
  getDriverSettlementSummary,
  listDriverLedger,
  getAgencyDefaultDriverPayRates,
  listAgencyZoneDriverPayRates,
  updateAgencyDefaultDriverPayRates,
  recordDriverPayment,
} from '../services/driver-settlement.service.js';

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
  requireRoles(UserRole.REPARTIDOR, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const defaults = currentMonthRange();
      const dateFrom = parseDateQuery(req.query.dateFrom, defaults.dateFrom);
      const dateTo = parseDateQuery(req.query.dateTo, defaults.dateTo);
      const repartidorId = typeof req.query.repartidorId === 'string' ? req.query.repartidorId : undefined;
      const summary = await getDriverSettlementSummary(req.user!, { dateFrom, dateTo, repartidorId });
      res.json(summary);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      if (code === 'FORBIDDEN' || code === 'NO_AGENCY') {
        res.status(403).json({ error: 'No tenés permiso para ver esta liquidación.' });
        return;
      }
      res.status(500).json({ error: 'No se pudo cargar el resumen de liquidación.' });
      console.error('[driver-settlement] GET /summary error:', err);
    }
  }
);

router.get(
  '/ledger',
  authenticate,
  requireRoles(UserRole.REPARTIDOR, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const defaults = currentMonthRange();
      const dateFrom = parseDateQuery(req.query.dateFrom, defaults.dateFrom);
      const dateTo = parseDateQuery(req.query.dateTo, defaults.dateTo);
      const repartidorId = typeof req.query.repartidorId === 'string' ? req.query.repartidorId : undefined;
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
      const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
      const entries = await listDriverLedger(req.user!, { dateFrom, dateTo, repartidorId, limit, offset });
      res.json(entries);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      if (code === 'FORBIDDEN' || code === 'NO_AGENCY') {
        res.status(403).json({ error: 'No tenés permiso para ver estos movimientos.' });
        return;
      }
      res.status(500).json({ error: 'No se pudo cargar el historial.' });
      console.error('[driver-settlement] GET /ledger error:', err);
    }
  }
);

router.get(
  '/rates',
  authenticate,
  requireRoles(UserRole.REPARTIDOR, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN),
  async (req: Request, res: Response) => {
    if (!req.user?.agencyId) {
      res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
      return;
    }
    const [zoneRates, defaultRates] = await Promise.all([
      listAgencyZoneDriverPayRates(req.user.agencyId),
      getAgencyDefaultDriverPayRates(req.user.agencyId),
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
      const rates = await updateAgencyDefaultDriverPayRates(req.user!, { flex, express, standard });
      res.json(rates);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      if (code === 'FORBIDDEN') {
        res.status(403).json({ error: 'No tenés permiso para editar pagos a repartidores.' });
        return;
      }
      if (code === 'INVALID_RATES') {
        res.status(400).json({ error: 'Los montos deben ser números positivos.' });
        return;
      }
      res.status(500).json({ error: 'No se pudieron guardar los pagos.' });
    }
  }
);

router.post(
  '/payments',
  authenticate,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const { repartidorId, amount, description } = req.body as {
        repartidorId?: string;
        amount?: number;
        description?: string;
      };
      if (!repartidorId || amount === undefined) {
        res.status(400).json({ error: 'repartidorId y amount son requeridos.' });
        return;
      }
      const entry = await recordDriverPayment(req.user!, {
        repartidorId,
        amount: Number(amount),
        description,
      });
      res.status(201).json(entry);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      if (code === 'FORBIDDEN') {
        res.status(403).json({ error: 'No tenés permiso para registrar liquidaciones.' });
        return;
      }
      if (code === 'DRIVER_NOT_FOUND') {
        res.status(404).json({ error: 'Repartidor no encontrado en tu agencia.' });
        return;
      }
      if (code === 'INVALID_PAYMENT') {
        res.status(400).json({ error: 'Monto de liquidación inválido.' });
        return;
      }
      res.status(500).json({ error: 'No se pudo registrar la liquidación.' });
    }
  }
);

export default router;
