import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, signToken } from '../middleware/auth.js';
import { findUserByUsername, createUser, getUserById } from '../services/users.service.js';
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

  const token = signToken(user.id, user.role);
  res.json({ user, token });
});

router.post('/register/agency', async (req: Request, res: Response) => {
  const { username, password, name, city, province } = req.body;
  if (!username || !password || !name) {
    res.status(400).json({ error: 'Usuario, contraseña y nombre de la agencia son requeridos.' });
    return;
  }

  try {
    const agency = await createAgency({
      name: name.trim(),
      city: city?.trim(),
      province: province?.trim(),
    });
    const user = await createUser({
      username,
      password,
      name,
      role: UserRole.SUPER_ADMIN,
      agencyId: agency.id,
      city: city?.trim(),
      province: province?.trim(),
    });
    const fullUser = await getUserById(user.id);
    const token = signToken(user.id, user.role);
    res.status(201).json({ user: fullUser ?? user, token });
  } catch (err) {
    if (handleRegisterError(res, err)) return;
    throw err;
  }
});

router.post('/register/seller', async (req: Request, res: Response) => {
  const { username, password, name, city, province } = req.body;
  if (!username || !password || !name) {
    res.status(400).json({ error: 'Usuario, contraseña y nombre del vendedor son requeridos.' });
    return;
  }

  try {
    const user = await createUser({
      username,
      password,
      name: name.trim(),
      role: UserRole.STORE_ADMIN,
      marketplaceSeller: true,
      city: city?.trim(),
      province: province?.trim(),
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
