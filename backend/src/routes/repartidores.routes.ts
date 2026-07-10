import { Router, Request, Response } from 'express';
import { authenticate, requireRoles, requireAgencyAdmin } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import { getRepartidores, getRepartidoresForSeller } from '../services/users.service.js';

const router = Router();

router.get('/', authenticate, requireRoles(UserRole.STORE_ADMIN, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN), async (req: Request, res: Response) => {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }
  const repartidores =
    req.user.role === UserRole.STORE_ADMIN
      ? await getRepartidoresForSeller(req.user.id, req.user.agencyId)
      : await getRepartidores(req.user.agencyId);
  res.json(repartidores);
});

export default router;
