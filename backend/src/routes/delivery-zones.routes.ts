import { Router, Request, Response } from 'express';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.js';
import {
  listZonesForAgency,
  createZone,
  updateZone,
  deleteZone,
} from '../services/delivery-zones.service.js';

const router = Router();

function requireAgencyId(req: Request, res: Response): string | null {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return null;
  }
  return req.user.agencyId;
}

router.get('/', authenticate, async (req: Request, res: Response) => {
  const agencyId = requireAgencyId(req, res);
  if (!agencyId) return;

  const zones = await listZonesForAgency(agencyId);
  res.json(zones);
});

router.post('/', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const agencyId = requireAgencyId(req, res);
  if (!agencyId) return;

  const { name, color, south, west, north, east } = req.body;
  if (!name || south === undefined || west === undefined || north === undefined || east === undefined) {
    res.status(400).json({ error: 'Nombre y límites (sur, oeste, norte, este) son requeridos.' });
    return;
  }

  try {
    const zone = await createZone(agencyId, {
      name,
      color,
      south: Number(south),
      west: Number(west),
      north: Number(north),
      east: Number(east),
    });
    res.status(201).json(zone);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NAME_REQUIRED') {
      res.status(400).json({ error: 'El nombre es obligatorio.' });
      return;
    }
    if (message === 'INVALID_BOUNDS') {
      res.status(400).json({ error: 'Los límites geográficos no son válidos (sur < norte, oeste < este).' });
      return;
    }
    if (message === 'INVALID_COLOR') {
      res.status(400).json({ error: 'El color debe ser un código hexadecimal (#RRGGBB).' });
      return;
    }
    throw err;
  }
});

router.put('/:id', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const agencyId = requireAgencyId(req, res);
  if (!agencyId) return;

  const { name, color, south, west, north, east } = req.body;

  try {
    const zone = await updateZone(agencyId, req.params.id, {
      name: typeof name === 'string' ? name : undefined,
      color: typeof color === 'string' ? color : undefined,
      south: south !== undefined ? Number(south) : undefined,
      west: west !== undefined ? Number(west) : undefined,
      north: north !== undefined ? Number(north) : undefined,
      east: east !== undefined ? Number(east) : undefined,
    });
    res.json(zone);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Zona no encontrada.' });
      return;
    }
    if (message === 'NAME_REQUIRED') {
      res.status(400).json({ error: 'El nombre es obligatorio.' });
      return;
    }
    if (message === 'INVALID_BOUNDS') {
      res.status(400).json({ error: 'Los límites geográficos no son válidos.' });
      return;
    }
    if (message === 'INVALID_COLOR') {
      res.status(400).json({ error: 'El color debe ser un código hexadecimal (#RRGGBB).' });
      return;
    }
    throw err;
  }
});

router.delete('/:id', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const agencyId = requireAgencyId(req, res);
  if (!agencyId) return;

  try {
    await deleteZone(agencyId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Zona no encontrada.' });
      return;
    }
    if (message === 'ZONE_IN_USE') {
      res.status(409).json({
        error: 'No se puede eliminar: hay repartidores asignados a esta zona. Reasignálos primero.',
      });
      return;
    }
    throw err;
  }
});

export default router;
