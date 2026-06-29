import { Router, Request, Response } from 'express';
import { authenticate, requireRoles, requireAgencyAdmin } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import { getRepartidores } from '../services/users.service.js';

const router = Router();

router.get('/', authenticate, requireRoles(UserRole.STORE_ADMIN, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN), async (req: Request, res: Response) => {
  const repartidores = await getRepartidores(req.user?.agencyId);
  res.json(repartidores);
});

export default router;
