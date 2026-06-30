import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listAgenciesForSeller, getAgencyPublicProfile } from '../services/marketplace.service.js';
import type { AgencyShippingServiceType } from '../types/index.js';

const router = Router();

router.get('/agencies', authenticate, async (req: Request, res: Response) => {
  const province = typeof req.query.province === 'string' ? req.query.province : undefined;
  const serviceType = typeof req.query.serviceType === 'string'
    ? (req.query.serviceType as AgencyShippingServiceType)
    : undefined;

  const agencies = await listAgenciesForSeller({ province, serviceType });
  res.json(agencies);
});

router.get('/agencies/:id', authenticate, async (req: Request, res: Response) => {
  const agency = await getAgencyPublicProfile(req.params.id);
  if (!agency) {
    res.status(404).json({ error: 'Agencia no encontrada.' });
    return;
  }
  res.json(agency);
});

export default router;
