import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/index.js';
import { isAgencySubscriptionActive } from '../services/subscriptions.service.js';

export async function requireAgencySubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;
  if (!user?.agencyId) {
    next();
    return;
  }
  if (user.role !== UserRole.LOGISTICS_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    next();
    return;
  }

  const active = await isAgencySubscriptionActive(user.agencyId);
  if (!active) {
    res.status(402).json({
      error: 'Tu suscripción a Posta venció. Renová el plan para seguir operando.',
      code: 'SUBSCRIPTION_REQUIRED',
    });
    return;
  }
  next();
}
