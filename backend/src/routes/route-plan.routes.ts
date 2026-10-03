import { Router, Request, Response } from 'express';
import { requireRoles } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import { createFleetAlert, deleteFleetAlert } from '../services/route-alerts.service.js';
import { buildRoutePlan, isRoutePlanError } from '../services/route-plan.service.js';

const router = Router();

router.use(requireRoles(UserRole.REPARTIDOR));

router.post('/', async (req: Request, res: Response) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'Necesitamos tu ubicación para armar el recorrido.' });
    return;
  }

  try {
    const plan = await buildRoutePlan(req.user!, { lat, lng });
    res.json(plan);
  } catch (err) {
    if (isRoutePlanError(err)) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[route-plan]', err);
    res.status(503).json({ error: 'No se pudo armar el recorrido. Intentá de nuevo en unos segundos.' });
  }
});

router.post('/alerts', async (req: Request, res: Response) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const kind = typeof req.body?.kind === 'string' ? req.body.kind : '';
  const note = typeof req.body?.note === 'string' ? req.body.note : null;

  try {
    const alert = await createFleetAlert(req.user!, { kind, lat, lng, note });
    res.status(201).json(alert);
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'INVALID_KIND') {
      res.status(400).json({ error: 'Elegí un tipo de novedad.' });
      return;
    }
    if (code === 'INVALID_POINT') {
      res.status(400).json({ error: 'La novedad necesita una ubicación.' });
      return;
    }
    if (code === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tenés permiso para publicar una novedad.' });
      return;
    }
    throw err;
  }
});

router.delete('/alerts/:id', async (req: Request, res: Response) => {
  try {
    await deleteFleetAlert(req.user!, req.params.id);
    res.status(204).send();
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: 'Esa novedad ya no está activa.' });
      return;
    }
    if (code === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tenés permiso para borrar esta novedad.' });
      return;
    }
    throw err;
  }
});

export default router;
