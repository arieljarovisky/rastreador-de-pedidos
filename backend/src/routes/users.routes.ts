import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import { getUserById, updateUserLocation, appendRepartidorLocationHistory } from '../services/users.service.js';
import { emitRepartidorLocation } from '../realtime/io.js';
import { logRepartidorGps } from '../utils/repartidorGpsLog.js';

const router = Router();

router.post('/location', authenticate, requireRoles(UserRole.REPARTIDOR), async (req: Request, res: Response) => {
  const { lat, lng, timestamp } = req.body;
  const user = req.user!;

  if (lat === undefined || lng === undefined) {
    logRepartidorGps('fleet_rejected', user, { reason: 'missing_coords' });
    res.status(400).json({ error: 'Latitud y longitud son requeridas.' });
    return;
  }

  const recordedAt = typeof timestamp === 'string' ? new Date(timestamp) : undefined;
  const clientTs = typeof timestamp === 'string' ? timestamp : null;

  try {
    await updateUserLocation(user.id, Number(lat), Number(lng), recordedAt);
    try {
      await appendRepartidorLocationHistory(user.id, Number(lat), Number(lng), recordedAt);
    } catch (err) {
      console.warn('[users/location] No se pudo guardar historial de flota:', err);
    }

    const updated = await getUserById(user.id);
    if (updated) {
      emitRepartidorLocation(updated);
    }

    logRepartidorGps('fleet_ok', user, {
      lat: Number(lat),
      lng: Number(lng),
      clientTimestamp: clientTs,
      savedAt: updated?.currentLocation?.timestamp ?? new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    logRepartidorGps('fleet_error', user, {
      lat: Number(lat),
      lng: Number(lng),
      clientTimestamp: clientTs,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
});

export default router;
