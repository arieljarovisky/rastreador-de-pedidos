import { Router, Request, Response } from 'express';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.js';
import {
  assignSellerPriceList,
  createPriceList,
  deletePriceList,
  ensureDefaultPriceListForAgency,
  getPriceList,
  listPriceLists,
  listSellersPriceListAssignments,
  updatePriceList,
} from '../services/price-lists.service.js';

const router = Router();

router.get('/', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }
  await ensureDefaultPriceListForAgency(req.user.agencyId);
  const lists = await listPriceLists(req.user.agencyId);
  res.json({ lists });
});

router.get('/sellers', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }
  await ensureDefaultPriceListForAgency(req.user.agencyId);
  const assignments = await listSellersPriceListAssignments(req.user.agencyId);
  res.json({ assignments });
});

router.get('/:id', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }
  const list = await getPriceList(req.user.agencyId, req.params.id);
  if (!list) {
    res.status(404).json({ error: 'Lista no encontrada.' });
    return;
  }
  res.json(list);
});

router.post('/', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  try {
    const list = await createPriceList(req.user!, {
      name: typeof req.body?.name === 'string' ? req.body.name : '',
      cloneFromId: typeof req.body?.cloneFromId === 'string' ? req.body.cloneFromId : null,
    });
    res.status(201).json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NAME_REQUIRED') {
      res.status(400).json({ error: 'Ingresá un nombre para la lista.' });
      return;
    }
    if (message === 'NAME_TAKEN') {
      res.status(409).json({ error: 'Ya existe una lista con ese nombre.' });
      return;
    }
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tenés permiso.' });
      return;
    }
    throw err;
  }
});

router.put('/:id', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  try {
    const list = await updatePriceList(req.user!, req.params.id, {
      name: typeof req.body?.name === 'string' ? req.body.name : undefined,
      outsideShipping: req.body?.outsideShipping,
      outsideDriverPay: req.body?.outsideDriverPay,
      zoneRates: Array.isArray(req.body?.zoneRates) ? req.body.zoneRates : undefined,
    });
    res.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Lista no encontrada.' });
      return;
    }
    if (message === 'NAME_REQUIRED') {
      res.status(400).json({ error: 'Ingresá un nombre para la lista.' });
      return;
    }
    if (message === 'NAME_TAKEN') {
      res.status(409).json({ error: 'Ya existe una lista con ese nombre.' });
      return;
    }
    if (message === 'INVALID_RATES') {
      res.status(400).json({ error: 'Los montos tienen que ser números válidos (0 o más).' });
      return;
    }
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tenés permiso.' });
      return;
    }
    throw err;
  }
});

router.delete('/:id', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  try {
    await deletePriceList(req.user!, req.params.id);
    res.status(204).send();
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Lista no encontrada.' });
      return;
    }
    if (message === 'DEFAULT_PROTECTED') {
      res.status(400).json({ error: 'No se puede eliminar la lista general (default).' });
      return;
    }
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tenés permiso.' });
      return;
    }
    throw err;
  }
});

router.put(
  '/sellers/:sellerId',
  authenticate,
  requireAgencyAdmin(),
  async (req: Request, res: Response) => {
    try {
      const priceListId =
        req.body?.priceListId === null || req.body?.priceListId === ''
          ? null
          : typeof req.body?.priceListId === 'string'
            ? req.body.priceListId
            : null;
      await assignSellerPriceList(req.user!, req.params.sellerId, priceListId);
      res.json({ ok: true, priceListId });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'SELLER_NOT_FOUND') {
        res.status(404).json({ error: 'Vendedor no encontrado.' });
        return;
      }
      if (message === 'NOT_FOUND') {
        res.status(404).json({ error: 'Lista no encontrada.' });
        return;
      }
      if (message === 'FORBIDDEN') {
        res.status(403).json({ error: 'No tenés permiso.' });
        return;
      }
      throw err;
    }
  }
);

export default router;
