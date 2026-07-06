import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, signToken } from '../middleware/auth.js';
import {
  findUserByUsername,
  createUser,
  getUserById,
  hasRepartidorActiveSession,
  createRepartidorSession,
  clearRepartidorSession,
} from '../services/users.service.js';
import { createAgency } from '../services/agencies.service.js';
import { UserRole } from '../types/index.js';
import { isValidEmail } from '../utils/email.js';
import { isValidCuit, normalizeCuit, formatCuit } from '../utils/cuit.js';
import { validateStrongPassword } from '../utils/password.js';

const router = Router();

function wantsReplaceSession(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function userResponse(user: Awaited<ReturnType<typeof getUserById>>) {
  if (!user) return null;
  return user;
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, '').slice(0, 20);
}

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

function handleRegisterError(res: Response, err: unknown): boolean {
  const message = err instanceof Error ? err.message : '';
  if (message === 'USERNAME_TAKEN') {
    res.status(409).json({ error: 'Ese correo ya está registrado.' });
    return true;
  }
  if (message === 'USERNAME_SHORT') {
    res.status(400).json({ error: 'El correo debe tener al menos 3 caracteres.' });
    return true;
  }
  if (message === 'INVALID_EMAIL') {
    res.status(400).json({ error: 'Ingresá un correo electrónico válido.' });
    return true;
  }
  if (message === 'PASSWORD_SHORT') {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    return true;
  }
  if (message === 'WEAK_PASSWORD') {
    res.status(400).json({
      error: 'La contraseña debe tener al menos 8 caracteres, una letra y un número.',
    });
    return true;
  }
  if (message === 'NAME_REQUIRED') {
    res.status(400).json({ error: 'El nombre es obligatorio.' });
    return true;
  }
  return false;
}

router.post('/login', async (req: Request, res: Response) => {
  const { username, password, replaceSession } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
    return;
  }

  const row = await findUserByUsername(String(username).trim());
  if (!row) {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    return;
  }

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    return;
  }

  const user = await getUserById(row.id);
  if (!user) {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    return;
  }

  if (user.role === UserRole.REPARTIDOR) {
    const forceReplace = wantsReplaceSession(replaceSession);

    if (forceReplace) {
      await clearRepartidorSession(user.id);
    } else {
      const hasSession = await hasRepartidorActiveSession(user.id);
      if (hasSession) {
        res.status(409).json({
          error:
            'Ya tenés una sesión activa en otro dispositivo. Podés cerrarla desde acá para ingresar en este celular.',
          code: 'SESSION_ALREADY_ACTIVE',
        });
        return;
      }
    }

    try {
      const sessionId = await createRepartidorSession(user.id);
      const token = signToken(user.id, user.role, sessionId);
      res.json({ user, token });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'SESSION_CREATE_FAILED') {
        res.status(500).json({
          error: 'No se pudo iniciar sesión. Contactá a soporte de Posta.',
          code: 'SESSION_CREATE_FAILED',
        });
        return;
      }
      throw err;
    }
    return;
  }

  const token = signToken(user.id, user.role);
  res.json({ user, token });
});

router.post('/logout', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role === UserRole.REPARTIDOR) {
    await clearRepartidorSession(req.user.id);
  }
  res.status(204).send();
});

router.post('/register/agency', async (req: Request, res: Response) => {
  const {
    agencyName,
    adminName,
    email,
    password,
    phone,
    cuit,
    city,
    acceptTerms,
    /** Compatibilidad con clientes anteriores */
    name,
    username,
  } = req.body as {
    agencyName?: string;
    adminName?: string;
    email?: string;
    password?: string;
    phone?: string;
    cuit?: string;
    city?: string;
    acceptTerms?: boolean;
    name?: string;
    username?: string;
  };

  const resolvedAgencyName = (agencyName ?? name)?.trim();
  const resolvedAdminName = (adminName ?? name)?.trim();
  const resolvedEmail = (email ?? username)?.trim().toLowerCase();

  if (!resolvedAgencyName || !resolvedAdminName || !resolvedEmail || !password || !phone || !cuit || !city) {
    res.status(400).json({
      error:
        'Completá todos los datos: agencia, responsable, correo, teléfono, CUIT, ciudad y contraseña.',
    });
    return;
  }

  if (acceptTerms !== true) {
    res.status(400).json({ error: 'Debés aceptar la política de privacidad para registrarte.' });
    return;
  }

  if (!isValidEmail(resolvedEmail)) {
    res.status(400).json({ error: 'Ingresá un correo electrónico válido.' });
    return;
  }

  if (!isValidPhone(phone)) {
    res.status(400).json({ error: 'Ingresá un teléfono de contacto válido (mínimo 8 dígitos).' });
    return;
  }

  const cuitDigits = normalizeCuit(cuit);
  if (!cuitDigits || !isValidCuit(cuit)) {
    res.status(400).json({ error: 'El CUIT ingresado no es válido.' });
    return;
  }

  if (resolvedAgencyName.length < 2) {
    res.status(400).json({ error: 'El nombre de la agencia es demasiado corto.' });
    return;
  }

  if (city.trim().length < 2) {
    res.status(400).json({ error: 'Indicá la ciudad o zona de operación.' });
    return;
  }

  const passwordCheck = validateStrongPassword(password);
  if (!passwordCheck.ok) {
    res.status(400).json({ error: passwordCheck.errors.join(' ') });
    return;
  }

  try {
    const agency = await createAgency({
      name: resolvedAgencyName,
      contactEmail: resolvedEmail,
      contactPhone: normalizePhone(phone),
      cuit: formatCuit(cuitDigits),
      city: city.trim(),
    });
    const user = await createUser({
      username: resolvedEmail,
      password,
      name: resolvedAdminName,
      role: UserRole.SUPER_ADMIN,
      agencyId: agency.id,
    });
    const fullUser = await getUserById(user.id);
    const token = signToken(user.id, user.role);
    res.status(201).json({ user: fullUser ?? user, token });
  } catch (err) {
    if (handleRegisterError(res, err)) return;
    throw err;
  }
});

router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json(req.user);
});

export default router;
