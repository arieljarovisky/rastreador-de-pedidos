import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, signToken } from '../middleware/auth.js';
import { findUserByUsername } from '../services/users.service.js';

const router = Router();

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

  const user = {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    ...(row.current_lat != null && row.current_lng != null && row.location_updated_at
      ? {
          currentLocation: {
            lat: Number(row.current_lat),
            lng: Number(row.current_lng),
            timestamp: new Date(row.location_updated_at).toISOString(),
          },
        }
      : {}),
  };

  const token = signToken(user.id, user.role);
  res.json({ user, token });
});

router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json(req.user);
});

export default router;
