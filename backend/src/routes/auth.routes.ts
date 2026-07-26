import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, signToken } from '../middleware/auth.js';
import {
  findUserByUsername,
  findUserByGoogleId,
  createUser,
  getUserById,
  hasRepartidorActiveSession,
  createRepartidorSession,
  clearRepartidorSession,
  isEmailVerified,
  linkGoogleId,
} from '../services/users.service.js';
import { createAgency } from '../services/agencies.service.js';
import { ensureAgencySubscription } from '../services/subscriptions.service.js';
import { UserRole } from '../types/index.js';
import { isValidEmail } from '../utils/email.js';
import { isValidCuit, normalizeCuit, formatCuit } from '../utils/cuit.js';
import { validateStrongPassword } from '../utils/password.js';
import {
  requestPasswordReset,
  resetPasswordWithToken,
} from '../services/password-reset.service.js';
import {
  sendEmailVerification,
  resendEmailVerification,
  verifyEmailWithToken,
} from '../services/email-verification.service.js';
import {
  isGoogleAuthEnabled,
  verifyGoogleIdToken,
} from '../services/google-auth.service.js';
import { env } from '../config/env.js';
import { isPlatformOwnerEmail } from '../middleware/platform.js';

const router = Router();

function wantsReplaceSession(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
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

type AgencyRegisterBody = {
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

function parseAgencyRegisterFields(body: AgencyRegisterBody) {
  const resolvedAgencyName = (body.agencyName ?? body.name)?.trim();
  const resolvedAdminName = (body.adminName ?? body.name)?.trim();
  const resolvedEmail = (body.email ?? body.username)?.trim().toLowerCase();
  return { resolvedAgencyName, resolvedAdminName, resolvedEmail };
}

function validateAgencyProfile(input: {
  agencyName?: string;
  adminName?: string;
  phone?: string;
  cuit?: string;
  city?: string;
  acceptTerms?: boolean;
}): string | null {
  if (!input.agencyName || !input.adminName || !input.phone || !input.cuit || !input.city) {
    return 'Completá todos los datos: agencia, responsable, teléfono, CUIT y ciudad.';
  }
  if (input.acceptTerms !== true) {
    return 'Debés aceptar la política de privacidad para registrarte.';
  }
  if (!isValidPhone(input.phone)) {
    return 'Ingresá un teléfono de contacto válido (mínimo 8 dígitos).';
  }
  const cuitDigits = normalizeCuit(input.cuit);
  if (!cuitDigits || !isValidCuit(input.cuit)) {
    return 'El CUIT ingresado no es válido.';
  }
  if (input.agencyName.length < 2) {
    return 'El nombre de la agencia es demasiado corto.';
  }
  if (input.city.trim().length < 2) {
    return 'Indicá la ciudad o zona de operación.';
  }
  return null;
}

router.get('/google-config', (_req: Request, res: Response) => {
  const enabled = isGoogleAuthEnabled();
  res.json({
    enabled,
    clientId: enabled ? env.googleAuth.clientId : '',
  });
});

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

  if (!row.password_hash) {
    res.status(401).json({
      error: 'Esta cuenta usa Google. Ingresá con “Continuar con Google”.',
      code: 'USE_GOOGLE_LOGIN',
    });
    return;
  }

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    return;
  }

  if (!isEmailVerified(row)) {
    res.status(403).json({
      error: 'Activá tu correo antes de ingresar. Revisá tu bandeja o reenviá el enlace.',
      code: 'EMAIL_NOT_VERIFIED',
      email: row.username,
    });
    return;
  }

  if (row.disabled_at) {
    res.status(403).json({
      error: 'Tu cuenta está deshabilitada. Contactá al soporte de Posta.',
      code: 'ACCOUNT_DISABLED',
    });
    return;
  }

  const userBefore = await getUserById(row.id);
  if (!userBefore) {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    return;
  }

  const { ensurePlatformOwnerAccount } = await import('../services/platform-owner.service.js');
  const ensured = await ensurePlatformOwnerAccount(userBefore.id);
  const user = ensured.user ?? userBefore;

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
  const body = req.body as AgencyRegisterBody;
  const { resolvedAgencyName, resolvedAdminName, resolvedEmail } = parseAgencyRegisterFields(body);
  const { password, phone, cuit, city, acceptTerms } = body;

  if (!resolvedAgencyName || !resolvedAdminName || !resolvedEmail || !password || !phone || !cuit || !city) {
    res.status(400).json({
      error:
        'Completá todos los datos: agencia, responsable, correo, teléfono, CUIT, ciudad y contraseña.',
    });
    return;
  }

  const profileError = validateAgencyProfile({
    agencyName: resolvedAgencyName,
    adminName: resolvedAdminName,
    phone,
    cuit,
    city,
    acceptTerms,
  });
  if (profileError) {
    res.status(400).json({ error: profileError });
    return;
  }

  if (!isValidEmail(resolvedEmail)) {
    res.status(400).json({ error: 'Ingresá un correo electrónico válido.' });
    return;
  }

  const passwordCheck = validateStrongPassword(password);
  if (!passwordCheck.ok) {
    res.status(400).json({ error: passwordCheck.errors.join(' ') });
    return;
  }

  const cuitDigits = normalizeCuit(cuit)!;

  try {
    const agency = await createAgency({
      name: resolvedAgencyName,
      contactEmail: resolvedEmail,
      contactPhone: normalizePhone(phone),
      cuit: formatCuit(cuitDigits),
      city: city.trim(),
    });
    await ensureAgencySubscription(agency.id);
    const user = await createUser({
      username: resolvedEmail,
      password,
      name: resolvedAdminName,
      role: UserRole.SUPER_ADMIN,
      agencyId: agency.id,
      emailVerified: false,
    });
    await sendEmailVerification(user.id);
    res.status(201).json({
      pendingVerification: true,
      email: resolvedEmail,
      message: 'Te enviamos un correo para activar tu cuenta. Revisá tu bandeja (y spam).',
    });
  } catch (err) {
    if (handleRegisterError(res, err)) return;
    throw err;
  }
});

router.post('/google', async (req: Request, res: Response) => {
  if (!isGoogleAuthEnabled()) {
    res.status(503).json({ error: 'El ingreso con Google no está configurado.' });
    return;
  }

  const {
    idToken,
    mode,
    replaceSession,
    agencyName,
    adminName,
    phone,
    cuit,
    city,
    acceptTerms,
    name,
  } = req.body as {
    idToken?: string;
    mode?: string;
    replaceSession?: unknown;
    agencyName?: string;
    adminName?: string;
    phone?: string;
    cuit?: string;
    city?: string;
    acceptTerms?: boolean;
    name?: string;
  };

  if (!idToken || typeof idToken !== 'string') {
    res.status(400).json({ error: 'Falta el token de Google.' });
    return;
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(idToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'GOOGLE_EMAIL_NOT_VERIFIED') {
      res.status(400).json({ error: 'Tu cuenta de Google no tiene el correo verificado.' });
      return;
    }
    if (message === 'GOOGLE_AUTH_NOT_CONFIGURED') {
      res.status(503).json({ error: 'El ingreso con Google no está configurado.' });
      return;
    }
    res.status(401).json({ error: 'No se pudo validar la cuenta de Google.' });
    return;
  }

  const authMode = mode === 'register' ? 'register' : 'login';

  if (authMode === 'register') {
    const resolvedAgencyName = (agencyName ?? name)?.trim();
    const resolvedAdminName = (adminName || identity.name || name || '').trim();
    const profileError = validateAgencyProfile({
      agencyName: resolvedAgencyName,
      adminName: resolvedAdminName || undefined,
      phone,
      cuit,
      city,
      acceptTerms,
    });
    if (profileError) {
      res.status(400).json({ error: profileError });
      return;
    }

    const existingByGoogle = await findUserByGoogleId(identity.googleId);
    if (existingByGoogle) {
      res.status(409).json({ error: 'Esta cuenta de Google ya está registrada. Ingresá desde Ingresar.' });
      return;
    }

    const existingByEmail = await findUserByUsername(identity.email);
    if (existingByEmail) {
      res.status(409).json({
        error: 'Ese correo ya tiene una cuenta. Ingresá con Google o con tu contraseña.',
      });
      return;
    }

    const cuitDigits = normalizeCuit(cuit!)!;
    try {
      const agency = await createAgency({
        name: resolvedAgencyName!,
        contactEmail: identity.email,
        contactPhone: normalizePhone(phone!),
        cuit: formatCuit(cuitDigits),
        city: city!.trim(),
      });
      await ensureAgencySubscription(agency.id);
      const user = await createUser({
        username: identity.email,
        name: resolvedAdminName,
        role: UserRole.SUPER_ADMIN,
        agencyId: agency.id,
        googleId: identity.googleId,
        emailVerified: true,
      });
      const fullUser = await getUserById(user.id);
      const token = signToken(user.id, user.role);
      res.status(201).json({ user: fullUser ?? user, token });
    } catch (err) {
      if (handleRegisterError(res, err)) return;
      throw err;
    }
    return;
  }

  // Login
  let row = await findUserByGoogleId(identity.googleId);
  if (!row) {
    row = await findUserByUsername(identity.email);
    if (row) {
      if (row.google_id && row.google_id !== identity.googleId) {
        res.status(409).json({ error: 'Ese correo ya está vinculado a otra cuenta de Google.' });
        return;
      }
      // Mismo email: vincular Google y marcar verificado (Google ya validó el correo)
      if (!row.google_id) {
        await linkGoogleId(row.id, identity.googleId);
      }
    }
  }

  if (!row) {
    // Dueño de Posta (allowlist): cuenta global sin agencia.
    if (isPlatformOwnerEmail(identity.email)) {
      try {
        const created = await createUser({
          username: identity.email,
          name: (identity.name || 'Dueño Posta').trim() || 'Dueño Posta',
          role: UserRole.PLATFORM_OWNER,
          agencyId: null,
          googleId: identity.googleId,
          emailVerified: true,
        });
        row = await findUserByUsername(created.username);
      } catch (err) {
        console.error('[auth] platform owner bootstrap failed:', err);
        if (handleRegisterError(res, err)) return;
        const message = err instanceof Error ? err.message : '';
        if (message === 'PLATFORM_OWNER_NO_AGENCY') {
          res.status(500).json({ error: 'Error interno al crear el dueño de Posta.' });
          return;
        }
        res.status(500).json({
          error: 'No se pudo crear la cuenta del dueño de Posta. Revisá los logs del servidor.',
        });
        return;
      }
    }
  }

  if (!row) {
    res.status(404).json({
      error:
        env.platformOwnerEmails.length > 0
          ? 'No hay una cuenta con este Google. Si sos el dueño de Posta, usá exactamente el email de PLATFORM_OWNER_EMAILS desde Ingresar.'
          : 'No hay una cuenta con este Google. Registrá tu agencia primero.',
      code: 'GOOGLE_ACCOUNT_NOT_FOUND',
    });
    return;
  }

  // Refetch after possible link / bootstrap
  row = (await findUserByGoogleId(identity.googleId)) ?? (await findUserByUsername(identity.email));
  if (!row) {
    res.status(404).json({
      error: 'No hay una cuenta con este Google. Registrá tu agencia primero.',
      code: 'GOOGLE_ACCOUNT_NOT_FOUND',
    });
    return;
  }

  if (!isEmailVerified(row)) {
    await linkGoogleId(row.id, identity.googleId);
  }

  const userBefore = await getUserById(row.id);
  if (!userBefore) {
    res.status(401).json({ error: 'No se pudo iniciar sesión con Google.' });
    return;
  }

  const { ensurePlatformOwnerAccount } = await import('../services/platform-owner.service.js');
  const ensured = await ensurePlatformOwnerAccount(userBefore.id);
  const user = ensured.user ?? userBefore;

  if (user.disabledAt) {
    res.status(403).json({
      error: 'Tu cuenta está deshabilitada. Contactá al soporte de Posta.',
      code: 'ACCOUNT_DISABLED',
    });
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

router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json(req.user);
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  if (!email.trim()) {
    res.status(400).json({ error: 'Ingresá el correo de la cuenta.' });
    return;
  }

  try {
    const result = await requestPasswordReset(email);
    res.json(result);
  } catch (err) {
    console.error('[auth] forgot-password:', err);
    res.json({
      message:
        'Si ese correo está registrado, te enviamos un enlace para restablecer la contraseña.',
    });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!token.trim() || !password) {
    res.status(400).json({ error: 'Token y nueva contraseña son requeridos.' });
    return;
  }

  try {
    await resetPasswordWithToken(token, password);
    res.json({ message: 'Contraseña actualizada. Ya podés iniciar sesión.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'WEAK_PASSWORD') {
      res.status(400).json({
        error: 'La contraseña debe tener al menos 8 caracteres, una letra y un número.',
      });
      return;
    }
    if (message === 'EXPIRED_TOKEN') {
      res.status(400).json({
        error: 'El enlace expiró. Pedí uno nuevo desde “Olvidé mi contraseña”.',
      });
      return;
    }
    if (message === 'INVALID_TOKEN') {
      res.status(400).json({
        error: 'El enlace no es válido o ya fue usado. Pedí uno nuevo.',
      });
      return;
    }
    throw err;
  }
});

router.post('/verify-email', async (req: Request, res: Response) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  if (!token.trim()) {
    res.status(400).json({ error: 'Falta el enlace de activación.' });
    return;
  }

  try {
    const user = await verifyEmailWithToken(token);
    const jwt = signToken(user.id, user.role);
    res.json({
      user,
      token: jwt,
      message: 'Cuenta activada. Ya podés usar el panel.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'EXPIRED_TOKEN') {
      res.status(400).json({
        error: 'El enlace expiró. Pedí uno nuevo desde el registro o el login.',
        code: 'EXPIRED_TOKEN',
      });
      return;
    }
    if (message === 'INVALID_TOKEN') {
      res.status(400).json({
        error: 'El enlace no es válido o ya fue usado.',
        code: 'INVALID_TOKEN',
      });
      return;
    }
    throw err;
  }
});

router.post('/resend-verification', async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  if (!email.trim()) {
    res.status(400).json({ error: 'Ingresá el correo de la cuenta.' });
    return;
  }

  try {
    const result = await resendEmailVerification(email);
    res.json(result);
  } catch (err) {
    console.error('[auth] resend-verification:', err);
    res.json({
      message: 'Si ese correo tiene una cuenta pendiente, te enviamos un enlace de activación.',
    });
  }
});

export default router;
