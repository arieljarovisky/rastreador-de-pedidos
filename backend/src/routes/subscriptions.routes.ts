import { Router, Request, Response } from 'express';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.js';
import {
  createSubscriptionCheckout,
  getAgencySubscriptionStatus,
  listSubscriptionPlans,
} from '../services/subscriptions.service.js';
import { isPostaMercadoPagoConfigured } from '../services/mercadopago.service.js';

const router = Router();

router.get('/plans', authenticate, requireAgencyAdmin(), async (_req: Request, res: Response) => {
  const plans = await listSubscriptionPlans();
  res.json(plans);
});

router.get('/status', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Sin agencia asociada.' });
    return;
  }
  try {
    const status = await getAgencySubscriptionStatus(req.user.agencyId);
    res.json({
      ...status,
      postaMercadoPagoConfigured: isPostaMercadoPagoConfigured(),
    });
  } catch (err) {
    console.error('[subscriptions] GET /status error:', err);
    res.status(500).json({ error: 'No se pudo cargar la suscripción.' });
  }
});

router.post('/checkout', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Sin agencia asociada.' });
    return;
  }
  try {
    const payerEmail =
      typeof req.body?.payerEmail === 'string'
        ? req.body.payerEmail
        : req.user.username.includes('@')
          ? req.user.username
          : undefined;
    const checkout = await createSubscriptionCheckout(req.user.agencyId, payerEmail);
    res.json(checkout);
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : 'ERROR';
    if (code === 'POSTA_MP_NOT_CONFIGURED') {
      res.status(503).json({
        error: 'Los pagos de suscripción no están configurados en el servidor (POSTA_MP_ACCESS_TOKEN).',
      });
      return;
    }
    console.error('[subscriptions] POST /checkout error:', err);
    res.status(500).json({ error: 'No se pudo iniciar el pago de suscripción.' });
  }
});

export default router;
