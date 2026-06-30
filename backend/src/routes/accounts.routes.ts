import { Router, Request, Response } from 'express';
import { authenticate, requireRoles, requireAgencyAdmin } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import {
  createUser,
  listSellers,
  getSellerDetail,
  updateSellerPassword,
  updateSeller,
  deleteSeller,
  updateAgencyDeparture,
  getAgencyDepartureForUser,
  getUserById,
  deleteRepartidor,
  updateRepartidorZone,
  assertSellerInAgency,
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
import { updateAgencyMlFlexMode, updateAgencyMarketplaceProfile } from '../services/agencies.service.js';
import { updateSellerPreferredAgency } from '../services/marketplace.service.js';
import type { AgencyShippingService, MlFlexMode } from '../types/index.js';

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

router.get('/sellers', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }
  const sellers = await listSellers(req.user.agencyId);
  res.json(sellers);
});

router.get('/sellers/:id', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const detail = await getSellerDetail(req.params.id, req.user?.agencyId);
  if (!detail) {
    res.status(404).json({ error: 'Vendedor no encontrado.' });
    return;
  }
  res.json(detail);
});

router.put('/sellers/:id/password', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'La contraseña es requerida.' });
    return;
  }

  try {
    await updateSellerPassword(req.params.id, password, req.user?.agencyId);
    res.json({ ok: true });
  } catch (err) {
    if (handleCreateUserError(res, err)) return;
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Vendedor no encontrado.' });
      return;
    }
    throw err;
  }
});

router.put('/sellers/:id', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const { name, username } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'El nombre es obligatorio.' });
    return;
  }

  try {
    const user = await updateSeller(
      req.params.id,
      { name, username: typeof username === 'string' ? username : undefined },
      req.user?.agencyId
    );
    res.json(user);
  } catch (err) {
    if (handleCreateUserError(res, err)) return;
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Vendedor no encontrado.' });
      return;
    }
    throw err;
  }
});

router.delete('/sellers/:id', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  try {
    const result = await deleteSeller(req.params.id, req.user?.agencyId);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Vendedor no encontrado.' });
      return;
    }
    if (message === 'SELLER_HAS_ACTIVE_ORDERS') {
      res.status(409).json({
        error: 'No se puede eliminar: el vendedor tiene pedidos en ruta o asignados. Cancelá o completá esos envíos primero.',
      });
      return;
    }
    throw err;
  }
});

router.post('/sellers', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const { username, password, name, pickupLabel, pickupAddress, pickupLat, pickupLng } = req.body;
  if (!username || !password || !name) {
    res.status(400).json({ error: 'Usuario, contraseña y nombre son requeridos.' });
    return;
  }

  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }

  try {
    const user = await createUser({
      username,
      password,
      name,
      role: UserRole.STORE_ADMIN,
      agencyId: req.user.agencyId,
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
  const { username, password, name, deliveryZone } = req.body;
  if (!username || !password || !name) {
    res.status(400).json({ error: 'Usuario, contraseña y nombre son requeridos.' });
    return;
  }

  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }

  try {
    const user = await createUser({
      username,
      password,
      name,
      role: UserRole.REPARTIDOR,
      agencyId: req.user.agencyId,
      deliveryZone: deliveryZone || null,
    });
    res.status(201).json(user);
  } catch (err) {
    if (handleCreateUserError(res, err)) return;
    if (err instanceof Error && err.message === 'INVALID_ZONE') {
      res.status(400).json({ error: 'Zona de entrega inválida.' });
      return;
    }
    throw err;
  }
});

router.put('/repartidores/:id/zone', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const { deliveryZone } = req.body as { deliveryZone?: string | null };
  try {
    const user = await updateRepartidorZone(req.params.id, deliveryZone ?? null);
    res.json(user);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Repartidor no encontrado.' });
      return;
    }
    if (message === 'INVALID_ZONE') {
      res.status(400).json({ error: 'Zona de entrega inválida.' });
      return;
    }
    throw err;
  }
});

router.delete('/repartidores/:id', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  try {
    const result = await deleteRepartidor(req.params.id);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Repartidor no encontrado.' });
      return;
    }
    throw err;
  }
});

router.get('/agency/departure', authenticate, async (req: Request, res: Response) => {
  const departure = await getAgencyDepartureForUser(req.user!);
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

router.put('/agency/ml-flex-mode', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const { mlFlexMode } = req.body as { mlFlexMode?: MlFlexMode };
  if (mlFlexMode !== 'agency' && mlFlexMode !== 'repartidor') {
    res.status(400).json({ error: 'Modo inválido. Usá "agency" o "repartidor".' });
    return;
  }
  if (!req.user!.agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }

  try {
    const agency = await updateAgencyMlFlexMode(req.user!.agencyId, mlFlexMode);
    res.json({ mlFlexMode: agency.mlFlexMode });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Agencia no encontrada.' });
      return;
    }
    throw err;
  }
});

router.put('/agency/marketplace-profile', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  if (!req.user!.agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }

  const { website, instagram, city, province, shippingServices } = req.body as {
    website?: string | null;
    instagram?: string | null;
    city?: string | null;
    province?: string | null;
    shippingServices?: AgencyShippingService[];
  };

  try {
    const agency = await updateAgencyMarketplaceProfile(req.user!.agencyId, {
      website,
      instagram,
      city,
      province,
      shippingServices,
    });
    res.json({
      website: agency.website,
      instagram: agency.instagram,
      city: agency.city,
      province: agency.province,
      shippingServices: agency.shippingServices,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Agencia no encontrada.' });
      return;
    }
    throw err;
  }
});

router.put('/seller/preferred-agency', authenticate, requireRoles(UserRole.STORE_ADMIN), async (req: Request, res: Response) => {
  const { agencyId } = req.body as { agencyId?: string };
  if (!agencyId) {
    res.status(400).json({ error: 'Debés elegir una agencia.' });
    return;
  }

  try {
    const user = await updateSellerPreferredAgency(req.user!.id, agencyId);
    res.json({
      preferredAgencyId: user.preferredAgencyId,
      preferredAgencyName: user.preferredAgencyName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Vendedor no encontrado.' });
      return;
    }
    if (message === 'NOT_MARKETPLACE_SELLER') {
      res.status(400).json({ error: 'Tu cuenta ya está vinculada a una agencia fija.' });
      return;
    }
    if (message === 'AGENCY_NOT_FOUND') {
      res.status(404).json({ error: 'Agencia no encontrada.' });
      return;
    }
    throw err;
  }
});

router.get('/pickup-points', authenticate, async (req: Request, res: Response) => {
  const user = req.user!;

  if (isAgencyAdmin(user.role)) {
    if (!user.agencyId) {
      res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
      return;
    }
    const sellerId = req.query.sellerId as string | undefined;
    if (sellerId) {
      const points = await listPickupPointsForUser(sellerId);
      res.json(points);
      return;
    }
    const points = await listPickupPointsForLogistics(user.agencyId);
    res.json(points);
    return;
  }

  if (user.role === UserRole.STORE_ADMIN) {
    const points = await listPickupPointsForUser(user.id);
    res.json(points);
    return;
  }

  if (user.role === UserRole.REPARTIDOR) {
    if (!user.agencyId) {
      res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
      return;
    }
    const points = await listPickupPointsForLogistics(user.agencyId);
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
    const seller = await assertSellerInAgency(sellerId, req.user!.agencyId!);
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
