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

const router = Router();

function userResponse(user: Awaited<ReturnType<typeof getUserById>>) {
  if (!user) return null;
  return user;
}

function handleRegisterError(res: Response, err: unknown): boolean {
  const message = err instanceof Error ? err.message : '';
  if (message === 'USERNAME_TAKEN') {
    res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
    return true;
  }
  if (message === 'USERNAME_SHORT') {
    res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres.' });
    return true;
  }
  if (message === 'PASSWORD_SHORT') {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    return true;
  }
  if (message === 'NAME_REQUIRED') {
    res.status(400).json({ error: 'El nombre es obligatorio.' });
    return true;
  }
  return false;
}

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
    return;
  }

  const row = await findUserByUsername(username);
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
    const hasSession = await hasRepartidorActiveSession(user.id);
    if (hasSession) {
      res.status(409).json({
        error:
          'Ya tenés una sesión activa en otro dispositivo. Cerrá sesión allí antes de ingresar.',
        code: 'SESSION_ALREADY_ACTIVE',
      });
      return;
    }

    const sessionId = await createRepartidorSession(user.id);
    const token = signToken(user.id, user.role, sessionId);
    res.json({ user, token });
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
  const { username, password, name } = req.body;
  if (!username || !password || !name) {
    res.status(400).json({ error: 'Usuario, contraseña y nombre de la agencia son requeridos.' });
    return;
  }

  try {
    const agency = await createAgency({ name: name.trim() });
    const user = await createUser({
      username,
      password,
      name,
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
