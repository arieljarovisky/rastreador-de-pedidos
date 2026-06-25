import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import { createUser, listSellers } from '../services/users.service.js';

const router = Router();

router.get('/sellers', authenticate, requireRoles(UserRole.LOGISTICS_ADMIN), async (_req: Request, res: Response) => {
  const sellers = await listSellers();
  res.json(sellers);
});

router.post('/sellers', authenticate, requireRoles(UserRole.LOGISTICS_ADMIN), async (req: Request, res: Response) => {
  const { username, password, name } = req.body;
  if (!username || !password || !name) {
    res.status(400).json({ error: 'Usuario, contraseña y nombre son requeridos.' });
    return;
  }

  try {
    const user = await createUser({
      username,
      password,
      name,
      role: UserRole.STORE_ADMIN,
    });
    res.status(201).json(user);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'USERNAME_TAKEN') {
      res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
      return;
    }
    if (message === 'USERNAME_SHORT') {
      res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres.' });
      return;
    }
    if (message === 'PASSWORD_SHORT') {
      res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }
    if (message === 'NAME_REQUIRED') {
      res.status(400).json({ error: 'El nombre es obligatorio.' });
      return;
    }
    throw err;
  }
});

export default router;
