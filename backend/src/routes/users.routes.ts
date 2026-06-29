import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import { getUserById, updateUserLocation } from '../services/users.service.js';
import { emitRepartidorLocation } from '../realtime/io.js';

const router = Router();

router.post('/location', authenticate, requireRoles(UserRole.REPARTIDOR), async (req: Request, res: Response) => {
  const { lat, lng, timestamp } = req.body;
  if (lat === undefined || lng === undefined) {
    res.status(400).json({ error: 'Latitud y longitud son requeridas.' });
    return;
  }

  const recordedAt = typeof timestamp === 'string' ? new Date(timestamp) : undefined;
  await updateUserLocation(req.user!.id, Number(lat), Number(lng), recordedAt);
  const updated = await getUserById(req.user!.id);
  if (updated) {
    emitRepartidorLocation(updated);
  }
  res.json({ success: true });
});

export default router;
