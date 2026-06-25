import { Router, Request, Response } from 'express';
import { authenticate, requireRoles, requireAgencyAdmin } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import {
  createUser,
  listSellers,
  updateAgencyDeparture,
  getAgencyDeparture,
  getUserById,
} from '../services/users.service.js';
import {
  listPickupPointsForUser,
  listPickupPointsForLogistics,
  createPickupPoint,
  updatePickupPoint,
  deletePickupPoint,
  getPickupPointById,
  canManagePickupPoint,
} from '../services/pickup-points.service.js';
import { isAgencyAdmin } from '../utils/roles.js';

const router = Router();

function handleCreateUserError(res: Response, err: unknown): boolean {
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

router.get('/sellers', authenticate, requireAgencyAdmin(), async (_req: Request, res: Response) => {
  const sellers = await listSellers();
  res.json(sellers);
});

router.post('/sellers', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const { username, password, name, pickupLabel, pickupAddress, pickupLat, pickupLng } = req.body;
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

    if (pickupAddress && pickupLat !== undefined && pickupLng !== undefined) {
      await createPickupPoint(user.id, {
        label: pickupLabel,
        address: pickupAddress,
        lat: Number(pickupLat),
        lng: Number(pickupLng),
      });
    }

    const enriched = await getUserById(user.id);
    res.status(201).json(enriched ?? user);
  } catch (err) {
    if (handleCreateUserError(res, err)) return;
    throw err;
  }
});

router.post('/repartidores', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
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
      role: UserRole.REPARTIDOR,
    });
    res.status(201).json(user);
  } catch (err) {
    if (handleCreateUserError(res, err)) return;
    throw err;
  }
});

router.get('/agency/departure', authenticate, async (_req: Request, res: Response) => {
  const departure = await getAgencyDeparture();
  res.json(departure);
});

router.put('/agency/departure', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const { address, lat, lng } = req.body;
  if (!address || lat === undefined || lng === undefined) {
    res.status(400).json({ error: 'Dirección, lat y lng son requeridos.' });
    return;
  }

  try {
    const user = await updateAgencyDeparture(req.user!.id, {
      address,
      lat: Number(lat),
      lng: Number(lng),
    });
    res.json(user.departurePoint ?? null);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Agencia no encontrada.' });
      return;
    }
    throw err;
  }
});

router.get('/pickup-points', authenticate, async (req: Request, res: Response) => {
  const user = req.user!;

  if (isAgencyAdmin(user.role)) {
    const sellerId = req.query.sellerId as string | undefined;
    if (sellerId) {
      const points = await listPickupPointsForUser(sellerId);
      res.json(points);
      return;
    }
    const points = await listPickupPointsForLogistics();
    res.json(points);
    return;
  }

  if (user.role === UserRole.STORE_ADMIN) {
    const points = await listPickupPointsForUser(user.id);
    res.json(points);
    return;
  }

  res.status(403).json({ error: 'No tienes permiso para ver puntos de colecta.' });
});

router.post('/pickup-points', authenticate, requireRoles(UserRole.STORE_ADMIN, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN), async (req: Request, res: Response) => {
  const { label, address, lat, lng, sellerId } = req.body;
  if (!address || lat === undefined || lng === undefined) {
    res.status(400).json({ error: 'Dirección, lat y lng son requeridos.' });
    return;
  }

  let ownerId = req.user!.id;
  if (isAgencyAdmin(req.user!.role)) {
    if (!sellerId) {
      res.status(400).json({ error: 'Debe indicar el sellerId del vendedor.' });
      return;
    }
    const seller = await getUserById(sellerId);
    if (!seller || seller.role !== UserRole.STORE_ADMIN) {
      res.status(400).json({ error: 'Vendedor no encontrado.' });
      return;
    }
    ownerId = sellerId;
  }

  const point = await createPickupPoint(ownerId, {
    label,
    address,
    lat: Number(lat),
    lng: Number(lng),
  });
  res.status(201).json(point);
});

router.put('/pickup-points/:id', authenticate, requireRoles(UserRole.STORE_ADMIN, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN), async (req: Request, res: Response) => {
  const point = await getPickupPointById(req.params.id);
  if (!point) {
    res.status(404).json({ error: 'Punto de colecta no encontrado.' });
    return;
  }
  if (!canManagePickupPoint(req.user!, point)) {
    res.status(403).json({ error: 'No tienes permiso para editar este punto.' });
    return;
  }

  const { label, address, lat, lng } = req.body;
  const updated = await updatePickupPoint(point.id, {
    label,
    address,
    lat: lat !== undefined ? Number(lat) : undefined,
    lng: lng !== undefined ? Number(lng) : undefined,
  });
  res.json(updated);
});

router.delete('/pickup-points/:id', authenticate, requireRoles(UserRole.STORE_ADMIN, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN), async (req: Request, res: Response) => {
  const point = await getPickupPointById(req.params.id);
  if (!point) {
    res.status(404).json({ error: 'Punto de colecta no encontrado.' });
    return;
  }
  if (!canManagePickupPoint(req.user!, point)) {
    res.status(403).json({ error: 'No tienes permiso para eliminar este punto.' });
    return;
  }

  try {
    await deletePickupPoint(point.id);
    res.status(204).send();
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Punto de colecta no encontrado.' });
      return;
    }
    throw err;
  }
});

export default router;
