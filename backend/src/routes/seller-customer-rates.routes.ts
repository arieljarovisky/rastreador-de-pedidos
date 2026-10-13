import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import {
  getSellerCustomerShippingRates,
  parseCustomerPrice,
  saveSellerCustomerShippingRates,
} from '../services/seller-customer-rates.service.js';

const router = Router();

router.use(authenticate, requireRoles(UserRole.STORE_ADMIN));

router.get('/', async (req: Request, res: Response) => {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }
  try {
    const zones = await getSellerCustomerShippingRates(req.user.id, req.user.agencyId);
    res.json({ currency: 'ARS', zones });
  } catch (err) {
    console.error('[seller-customer-rates] get:', err);
    res.status(500).json({ error: 'No se pudieron cargar los precios para tus clientes.' });
  }
});

router.put('/', async (req: Request, res: Response) => {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }
  const raw = req.body?.zones;
  if (!Array.isArray(raw)) {
    res.status(400).json({ error: 'Enviá los precios de cada zona.' });
    return;
  }

  try {
    const zones = raw.map((item) => ({
      zoneKey: typeof item?.zoneKey === 'string' ? item.zoneKey : '',
      customerPrice: parseCustomerPrice(item?.customerPrice),
    }));
    const saved = await saveSellerCustomerShippingRates(req.user.id, req.user.agencyId, zones);
    res.json({ currency: 'ARS', zones: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'INVALID_PRICE') {
      res.status(400).json({ error: 'Cada precio tiene que ser un número mayor o igual a 0.' });
      return;
    }
    if (message === 'INVALID_ZONE') {
      res.status(400).json({ error: 'Hay una zona de precio que no corresponde.' });
      return;
    }
    console.error('[seller-customer-rates] save:', err);
    res.status(500).json({ error: 'No se pudieron guardar los precios para tus clientes.' });
  }
});

export default router;
