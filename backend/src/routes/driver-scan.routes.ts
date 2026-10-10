import { Router, Request, Response } from 'express';
import { requireRoles } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import { AGENCY_ADMIN_ROLES } from '../utils/roles.js';
import {
  createDriverScanEntry,
  listDriverScanEntries,
  listSellerAssignedScanEntries,
  listAgencyDriverScanEntries,
  updateDriverScanEntryStatus,
  updateDriverScanEntryDetails,
  deleteDriverScanEntry,
  type DriverScanEntryStatus,
} from '../services/driver-scan.service.js';
import { getActiveOperationalDateKey } from '../utils/delivery-deadline.js';
import { listSellers } from '../services/users.service.js';

const router = Router();

function parseOptionalCoord(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function parseOptionalText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return undefined;
}

/** Agencia: bitácoras personales de todos los repartidores (o uno filtrado). */
router.get(
  '/agency',
  requireRoles(...AGENCY_ADMIN_ROLES),
  async (req: Request, res: Response) => {
    try {
      const all = req.query.all === '1' || req.query.all === 'true';
      const date =
        !all &&
        typeof req.query.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
          ? req.query.date
          : undefined;
      const repartidorId =
        typeof req.query.repartidorId === 'string' ? req.query.repartidorId : undefined;
      const result = await listAgencyDriverScanEntries(req.user!, {
        date,
        all,
        repartidorId,
      });
      res.json(result);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      if (code === 'FORBIDDEN') {
        res.status(403).json({ error: 'Solo la agencia puede ver el registro de los repartidores.' });
        return;
      }
      console.error('[driver-scan] GET /agency error:', err);
      res.status(500).json({ error: 'No se pudo cargar el registro de la agencia.' });
    }
  }
);

/** Vendedores de la agencia para asociar una etiqueta al escanear (sin cuenta de ecommerce). */
router.get(
  '/sellers',
  requireRoles(UserRole.REPARTIDOR, ...AGENCY_ADMIN_ROLES),
  async (req: Request, res: Response) => {
    if (!req.user?.agencyId) {
      res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
      return;
    }
    try {
      const sellers = await listSellers(req.user.agencyId);
      res.json({
        sellers: sellers.map((seller) => ({ id: seller.id, name: seller.name })),
      });
    } catch (err) {
      console.error('[driver-scan] GET /sellers error:', err);
      res.status(500).json({ error: 'No se pudieron cargar los vendedores.' });
    }
  }
);

/** Etiquetas que los repartidores asociaron a la cuenta del vendedor. */
router.get('/assigned', requireRoles(UserRole.STORE_ADMIN), async (req: Request, res: Response) => {
  try {
    const entries = await listSellerAssignedScanEntries(req.user!);
    res.json({ entries });
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : 'ERROR';
    if (code === 'FORBIDDEN') {
      res.status(403).json({ error: 'Solo el vendedor puede ver sus etiquetas.' });
      return;
    }
    console.error('[driver-scan] GET /assigned error:', err);
    res.status(500).json({ error: 'No se pudieron cargar las etiquetas.' });
  }
});

router.get('/', requireRoles(UserRole.REPARTIDOR), async (req: Request, res: Response) => {
  try {
    const date =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : getActiveOperationalDateKey();
    const entries = await listDriverScanEntries(req.user!, { date });
    res.json({ date, entries });
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : 'ERROR';
    if (code === 'FORBIDDEN') {
      res.status(403).json({ error: 'Solo el repartidor puede ver su registro personal.' });
      return;
    }
    console.error('[driver-scan] GET / error:', err);
    res.status(500).json({ error: 'No se pudo cargar el registro del día.' });
  }
});

router.post('/', requireRoles(UserRole.REPARTIDOR), async (req: Request, res: Response) => {
  const { code, note, lat, lng, routeDate, clientName, address, clientPhone, sellerId } = req.body as {
    code?: string;
    note?: string;
    lat?: unknown;
    lng?: unknown;
    routeDate?: string;
    clientName?: unknown;
    address?: unknown;
    clientPhone?: unknown;
    sellerId?: unknown;
  };

  if (!code?.trim()) {
    res.status(400).json({ error: 'Escaneá o ingresá el código del paquete.', code: 'INVALID_CODE' });
    return;
  }

  try {
    const entry = await createDriverScanEntry(req.user!, {
      code,
      note,
      lat: parseOptionalCoord(lat),
      lng: parseOptionalCoord(lng),
      routeDate,
      clientName: parseOptionalText(clientName),
      address: parseOptionalText(address),
      clientPhone: parseOptionalText(clientPhone),
      sellerId: parseOptionalText(sellerId),
    });
    res.status(entry.alreadyRegistered ? 200 : 201).json(entry);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ERROR';
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'Solo el repartidor puede registrar paquetes personales.' });
      return;
    }
    if (message === 'SELLER_NOT_FOUND') {
      res.status(400).json({ error: 'Ese vendedor no pertenece a tu agencia.', code: 'SELLER_NOT_FOUND' });
      return;
    }
    if (message === 'INVALID_CODE') {
      res.status(400).json({ error: 'El código escaneado no es válido.', code: 'INVALID_CODE' });
      return;
    }
    console.error('[driver-scan] POST / error:', err);
    res.status(500).json({ error: 'No se pudo registrar el paquete.' });
  }
});

router.put('/:id/details', requireRoles(UserRole.REPARTIDOR), async (req: Request, res: Response) => {
  const { clientName, address, clientPhone, sellerId } = req.body as {
    clientName?: unknown;
    address?: unknown;
    clientPhone?: unknown;
    sellerId?: unknown;
  };

  try {
    const entry = await updateDriverScanEntryDetails(req.user!, req.params.id, {
      clientName: parseOptionalText(clientName),
      address: parseOptionalText(address),
      clientPhone: parseOptionalText(clientPhone),
      sellerId: parseOptionalText(sellerId),
    });
    res.json(entry);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ERROR';
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tenés permiso para actualizar este registro.' });
      return;
    }
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Registro no encontrado.' });
      return;
    }
    if (message === 'INVALID_ADDRESS') {
      res.status(400).json({ error: 'Ingresá la dirección del destinatario.', code: 'INVALID_ADDRESS' });
      return;
    }
    if (message === 'SELLER_NOT_FOUND') {
      res.status(400).json({ error: 'Ese vendedor no pertenece a tu agencia.', code: 'SELLER_NOT_FOUND' });
      return;
    }
    console.error('[driver-scan] PUT /:id/details error:', err);
    res.status(500).json({ error: 'No se pudo actualizar el registro.' });
  }
});

router.put(
  '/:id/status',
  requireRoles(UserRole.REPARTIDOR, ...AGENCY_ADMIN_ROLES),
  async (req: Request, res: Response) => {
  const { status } = req.body as { status?: DriverScanEntryStatus };
  if (!status || !['pending', 'delivered', 'cancelled'].includes(status)) {
    res.status(400).json({ error: 'Estado inválido.', code: 'INVALID_STATUS' });
    return;
  }

  try {
    const entry = await updateDriverScanEntryStatus(req.user!, req.params.id, status);
    res.json(entry);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ERROR';
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tenés permiso para actualizar este registro.' });
      return;
    }
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Registro no encontrado.' });
      return;
    }
    if (message === 'INVALID_STATUS') {
      res.status(400).json({ error: 'Estado inválido.', code: 'INVALID_STATUS' });
      return;
    }
    console.error('[driver-scan] PUT /:id/status error:', err);
    res.status(500).json({ error: 'No se pudo actualizar el registro.' });
  }
});

router.delete(
  '/:id',
  requireRoles(UserRole.REPARTIDOR, ...AGENCY_ADMIN_ROLES),
  async (req: Request, res: Response) => {
    try {
      await deleteDriverScanEntry(req.user!, req.params.id);
      res.status(204).send();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ERROR';
      if (message === 'FORBIDDEN') {
        res.status(403).json({ error: 'No tenés permiso para eliminar este registro.' });
        return;
      }
      if (message === 'NOT_FOUND') {
        res.status(404).json({ error: 'Registro no encontrado.' });
        return;
      }
      console.error('[driver-scan] DELETE /:id error:', err);
      res.status(500).json({ error: 'No se pudo eliminar el registro.' });
    }
  }
);

export default router;
