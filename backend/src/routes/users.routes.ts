import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import { updateUserLocation } from '../services/users.service.js';

const router = Router();

router.post('/location', authenticate, requireRoles(UserRole.REPARTIDOR), async (req: Request, res: Response) => {
  const { lat, lng } = req.body;
  if (lat === undefined || lng === undefined) {
    res.status(400).json({ error: 'Latitud y longitud son requeridas.' });
    return;
  }

  await updateUserLocation(req.user!.id, Number(lat), Number(lng));
  res.json({ success: true });
});

export default router;
