import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/index.js';
import { isAgencySubscriptionActive } from '../services/subscriptions.service.js';
import { getAgencyById } from '../services/agencies.service.js';
import { isPlatformOwnerUser } from './platform.js';

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
  // Dueño de Posta no se bloquea por suscripción de la agencia desde la que opera.
  if (isPlatformOwnerUser(user)) {
    next();
    return;
  }
  if (user.role !== UserRole.LOGISTICS_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    next();
    return;
  }

  const agency = await getAgencyById(user.agencyId);
  if (agency?.status === 'suspended') {
    res.status(403).json({
      error: 'Esta agencia está suspendida. Contactá al soporte de Posta.',
      code: 'AGENCY_SUSPENDED',
    });
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
