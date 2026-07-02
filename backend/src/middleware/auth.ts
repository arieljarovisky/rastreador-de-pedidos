import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { JwtPayload, User, UserRole } from '../types/index.js';
import { getUserById, getRepartidorSessionToken } from '../services/users.service.js';
import { AGENCY_ADMIN_ROLES } from '../utils/roles.js';

export function signToken(userId: string, role: UserRole, sessionId?: string): string {
  const payload: JwtPayload = { userId, role };
  if (sessionId) {
    payload.sessionId = sessionId;
  }
  // Sin expiresIn: la sesión no vence por tiempo (solo al cerrar sesión o cambiar credenciales).
  return jwt.sign(payload, env.jwtSecret);
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}

export async function validateRepartidorSession(
  userId: string,
  sessionId: string | undefined
): Promise<boolean> {
  const activeSession = await getRepartidorSessionToken(userId);
  if (!activeSession) return false;
  return sessionId === activeSession;
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const payload = verifyToken(authHeader.split(' ')[1]);
  if (!payload) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const user = await getUserById(payload.userId);
  if (!user || user.role !== payload.role) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  if (user.role === UserRole.REPARTIDOR) {
    const valid = await validateRepartidorSession(user.id, payload.sessionId);
    if (!valid) {
      res.status(401).json({
        error: 'Tu sesión ya no es válida. Volvé a iniciar sesión.',
        code: 'SESSION_INVALID',
      });
      return;
    }
  }

  req.user = user;
  next();
}

export function requireAgencyAdmin() {
  return requireRoles(...AGENCY_ADMIN_ROLES);
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'No tienes permiso para esta acción.' });
      return;
    }
    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
