import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { User } from '../types/index.js';

export function isPlatformOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return env.platformOwnerEmails.includes(normalized);
}

export function isPlatformOwnerUser(user: Pick<User, 'username'> | null | undefined): boolean {
  return isPlatformOwnerEmail(user?.username);
}

/** Debe usarse después de `authenticate`. */
export function requirePlatformOwner(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }
  if (!isPlatformOwnerUser(req.user)) {
    res.status(403).json({
      error: 'Solo el dueño de Posta puede acceder a este panel.',
      code: 'PLATFORM_OWNER_REQUIRED',
    });
    return;
  }
  next();
}
