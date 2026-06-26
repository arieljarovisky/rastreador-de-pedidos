import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { geocodeAddress } from '../services/geocode.service.js';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  const address = typeof req.query.address === 'string' ? req.query.address.trim() : '';
  if (!address) {
    res.status(400).json({ error: 'La dirección es requerida.' });
    return;
  }

  try {
    const result = await geocodeAddress(address);
    if (!result) {
      res.status(404).json({
        error: 'No se encontró esa dirección en CABA/GBA. Usá calle y altura, o una sugerencia rápida.',
      });
      return;
    }
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'GEOCODE_UNAVAILABLE') {
      res.status(503).json({ error: 'El servicio de mapas no está disponible. Intentá de nuevo.' });
      return;
    }
    throw err;
  }
});

export default router;
