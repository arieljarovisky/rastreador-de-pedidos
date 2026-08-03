import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
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
  clearRepartidorSessionForAgency,
  assertSellerInAgency,
  resolveSalesCutoffHour,
  resolveWorksOnHolidays,
  getSellerConfiguredDeadlineHour,
  getSellerConfiguredWorksOnHolidays,
  updateOwnSellerDeliveryDeadlineHour,
  updateOwnSellerWorksOnHolidays,
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
import {
  getAgencyDeliveryDeadlineHour,
  getAgencyWorksOnHolidays,
  updateAgencyDeliveryDeadlineHour,
  updateAgencyWorksOnHolidays,
} from '../services/agencies.service.js';
import { recalculateOpenOrdersDeliveryDeadlines } from '../services/orders.service.js';
import { DELIVERY_DEADLINE_HOUR, getActiveOperationalDateKey } from '../utils/delivery-deadline.js';
import {
  getSellerBrandingSummary,
  getSellerLogo,
  saveSellerLogo,
  deleteSellerLogo,
  updateSellerLabelFont,
  MAX_LOGO_BYTES,
} from '../services/seller-branding.service.js';

const router = Router();

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES },
  fileFilter(_req, file, cb) {
    if (file.mimetype !== 'image/png' && file.mimetype !== 'image/jpeg') {
      cb(new Error('INVALID_LOGO_MIME'));
      return;
    }
    cb(null, true);
  },
});

/** Evita recalcular en cada poll. Versión fuerza reintento tras redeploy. */
const DEADLINE_RECALC_VERSION = 'v12';
const deadlineRecalcByAgencyDay = new Map<string, string>();

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
  if (message === 'INVALID_EMAIL') {
    res.status(400).json({ error: 'El usuario del repartidor debe ser un correo electrónico válido.' });
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
  const { name, username, deliveryDeadlineHour } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'El nombre es obligatorio.' });
    return;
  }

  try {
    const user = await updateSeller(
      req.params.id,
      {
        name,
        username: typeof username === 'string' ? username : undefined,
        deliveryDeadlineHour:
          deliveryDeadlineHour === null
            ? null
            : deliveryDeadlineHour === undefined
              ? undefined
              : Number(deliveryDeadlineHour),
      },
      req.user?.agencyId
    );
    if (req.user?.agencyId && deliveryDeadlineHour !== undefined) {
      const { recalculateOpenOrdersDeliveryDeadlines } = await import(
        '../services/orders.service.js'
      );
      await recalculateOpenOrdersDeliveryDeadlines(req.user.agencyId);
    }
    res.json(user);
  } catch (err) {
    if (handleCreateUserError(res, err)) return;
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Vendedor no encontrado.' });
      return;
    }
    if (message === 'INVALID_DEADLINE_HOUR') {
      res.status(400).json({ error: 'La hora de corte debe ser un número entre 0 y 23.' });
      return;
    }
    if (message === 'DEADLINE_ABOVE_AGENCY') {
      res.status(400).json({
        error: 'El corte del vendedor no puede ser posterior al corte de la agencia.',
      });
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
  const { username, password, name, pickupLabel, pickupAddress, pickupLat, pickupLng, deliveryDeadlineHour } =
    req.body;
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
      deliveryDeadlineHour:
        deliveryDeadlineHour === null || deliveryDeadlineHour === undefined || deliveryDeadlineHour === ''
          ? null
          : Number(deliveryDeadlineHour),
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
    const message = err instanceof Error ? err.message : '';
    if (message === 'INVALID_DEADLINE_HOUR') {
      res.status(400).json({ error: 'La hora de corte debe ser un número entre 0 y 23.' });
      return;
    }
    if (message === 'DEADLINE_ABOVE_AGENCY') {
      res.status(400).json({
        error: 'El corte del vendedor no puede ser posterior al corte de la agencia.',
      });
      return;
    }
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

router.post('/logistics-admins', authenticate, requireRoles(UserRole.SUPER_ADMIN), async (req: Request, res: Response) => {
  const { username, password, name } = req.body;
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
      role: UserRole.LOGISTICS_ADMIN,
      agencyId: req.user.agencyId,
    });
    const enriched = await getUserById(user.id);
    res.status(201).json(enriched ?? user);
  } catch (err) {
    if (handleCreateUserError(res, err)) return;
    throw err;
  }
});

router.put('/repartidores/:id/zone', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const { deliveryZone } = req.body as { deliveryZone?: string | null };
  try {
    const user = await updateRepartidorZone(
      req.params.id,
      deliveryZone ?? null,
      req.user?.agencyId
    );
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

router.post(
  '/repartidores/:id/clear-session',
  authenticate,
  requireAgencyAdmin(),
  async (req: Request, res: Response) => {
    try {
      await clearRepartidorSessionForAgency(req.params.id, req.user?.agencyId);
      res.status(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'NOT_FOUND') {
        res.status(404).json({ error: 'Repartidor no encontrado.' });
        return;
      }
      throw err;
    }
  }
);

router.delete('/repartidores/:id', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  try {
    const result = await deleteRepartidor(req.params.id, req.user?.agencyId);
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

router.get('/agency/delivery-deadline', authenticate, async (req: Request, res: Response) => {
  const user = req.user!;
  const agencyId = user.agencyId;
  if (!agencyId) {
    res.json({
      hour: DELIVERY_DEADLINE_HOUR,
      agencyMaxHour: DELIVERY_DEADLINE_HOUR,
      sellerHour: null,
      worksOnHolidays: false,
      agencyWorksOnHolidays: false,
      sellerWorksOnHolidays: null,
      recalculated: 0,
    });
    return;
  }

  const agencyMaxHour = await getAgencyDeliveryDeadlineHour(agencyId);
  const agencyWorksOnHolidays = await getAgencyWorksOnHolidays(agencyId);
  let sellerHour: number | null = null;
  let sellerWorksOnHolidays: boolean | null = null;
  let hour = agencyMaxHour;
  let worksOnHolidays = agencyWorksOnHolidays;

  if (user.role === UserRole.STORE_ADMIN) {
    sellerHour = await getSellerConfiguredDeadlineHour(user.id);
    sellerWorksOnHolidays = await getSellerConfiguredWorksOnHolidays(user.id);
    hour = await resolveSalesCutoffHour({ sellerId: user.id, agencyId });
    worksOnHolidays = await resolveWorksOnHolidays({ sellerId: user.id, agencyId });
  }

  const dayKey = `${DEADLINE_RECALC_VERSION}:${getActiveOperationalDateKey(undefined, { worksOnHolidays })}`;
  let recalculated = 0;
  if (deadlineRecalcByAgencyDay.get(agencyId) !== dayKey) {
    deadlineRecalcByAgencyDay.set(agencyId, dayKey);
    recalculated = await recalculateOpenOrdersDeliveryDeadlines(agencyId);
  }

  res.json({
    hour,
    agencyMaxHour,
    sellerHour,
    worksOnHolidays,
    agencyWorksOnHolidays,
    sellerWorksOnHolidays,
    recalculated,
  });
});

router.post('/agency/delivery-deadline/recalculate', authenticate, async (req: Request, res: Response) => {
  const agencyId = req.user!.agencyId;
  if (!agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }
  const agencyMaxHour = await getAgencyDeliveryDeadlineHour(agencyId);
  const hour =
    req.user!.role === UserRole.STORE_ADMIN
      ? await resolveSalesCutoffHour({ sellerId: req.user!.id, agencyId })
      : agencyMaxHour;
  const sellerHour =
    req.user!.role === UserRole.STORE_ADMIN
      ? await getSellerConfiguredDeadlineHour(req.user!.id)
      : null;
  const recalculated = await recalculateOpenOrdersDeliveryDeadlines(agencyId);
  deadlineRecalcByAgencyDay.set(agencyId, `${DEADLINE_RECALC_VERSION}:${getActiveOperationalDateKey()}`);
  res.json({ hour, agencyMaxHour, sellerHour, recalculated });
});

router.put('/agency/delivery-deadline', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const agencyId = req.user!.agencyId;
  if (!agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }
  const hour = Number(req.body?.hour);
  try {
    const saved = await updateAgencyDeliveryDeadlineHour(agencyId, hour);
    const recalculated = await recalculateOpenOrdersDeliveryDeadlines(agencyId);
    res.json({ hour: saved, agencyMaxHour: saved, sellerHour: null, recalculated });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'INVALID_HOUR') {
      res.status(400).json({ error: 'La hora de corte debe ser un número entre 0 y 23.' });
      return;
    }
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Agencia no encontrada.' });
      return;
    }
    throw err;
  }
});

/** Agencia: opera o no en feriados nacionales / puentes. */
router.put('/agency/works-on-holidays', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const agencyId = req.user!.agencyId;
  if (!agencyId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una agencia.' });
    return;
  }
  const raw = req.body?.worksOnHolidays;
  if (typeof raw !== 'boolean') {
    res.status(400).json({ error: 'Indicá si la agencia trabaja en feriados (true/false).' });
    return;
  }
  try {
    const agencyWorksOnHolidays = await updateAgencyWorksOnHolidays(agencyId, raw);
    const recalculated = await recalculateOpenOrdersDeliveryDeadlines(agencyId);
    res.json({
      worksOnHolidays: agencyWorksOnHolidays,
      agencyWorksOnHolidays,
      sellerWorksOnHolidays: null,
      recalculated,
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

/** Vendedor: actualiza su propio corte (≤ máximo de la agencia). null = heredar agencia. */
router.put(
  '/seller/delivery-deadline',
  authenticate,
  requireRoles(UserRole.STORE_ADMIN),
  async (req: Request, res: Response) => {
    const raw = req.body?.hour;
    const hour =
      raw === null || raw === undefined || raw === ''
        ? null
        : Number(raw);

    try {
      const result = await updateOwnSellerDeliveryDeadlineHour(req.user!, hour);
      const recalculated = req.user!.agencyId
        ? await recalculateOpenOrdersDeliveryDeadlines(req.user!.agencyId)
        : 0;
      res.json({ ...result, recalculated });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'FORBIDDEN') {
        res.status(403).json({ error: 'Solo un vendedor puede cambiar su propio corte.' });
        return;
      }
      if (message === 'SELLER_NO_AGENCY') {
        res.status(400).json({
          error:
            'Tu cuenta no está asociada a una agencia. Pedile a tu agencia que verifique tu usuario.',
        });
        return;
      }
      if (message === 'INVALID_DEADLINE_HOUR') {
        res.status(400).json({ error: 'La hora de corte debe ser un número entre 0 y 23.' });
        return;
      }
      if (message === 'DEADLINE_ABOVE_AGENCY') {
        res.status(400).json({
          error: 'El corte del vendedor no puede ser posterior al corte de la agencia.',
        });
        return;
      }
      throw err;
    }
  }
);

/** Vendedor: trabaja feriados (null = heredar; true solo si la agencia también). */
router.put(
  '/seller/works-on-holidays',
  authenticate,
  requireRoles(UserRole.STORE_ADMIN),
  async (req: Request, res: Response) => {
    const raw = req.body?.worksOnHolidays;
    const worksOnHolidays =
      raw === null || raw === undefined || raw === ''
        ? null
        : Boolean(raw);

    try {
      const result = await updateOwnSellerWorksOnHolidays(req.user!, worksOnHolidays);
      const recalculated = req.user!.agencyId
        ? await recalculateOpenOrdersDeliveryDeadlines(req.user!.agencyId)
        : 0;
      res.json({ ...result, recalculated });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'FORBIDDEN') {
        res.status(403).json({ error: 'Solo un vendedor puede cambiar esta preferencia.' });
        return;
      }
      if (message === 'SELLER_NO_AGENCY') {
        res.status(400).json({
          error:
            'Tu cuenta no está asociada a una agencia. Pedile a tu agencia que verifique tu usuario.',
        });
        return;
      }
      if (message === 'HOLIDAYS_ABOVE_AGENCY') {
        res.status(400).json({
          error: 'Tu agencia no opera en feriados. No podés activarlo por tu cuenta.',
        });
        return;
      }
      throw err;
    }
  }
);

/** Vendedor: config actual de branding de etiqueta (sin el blob). */
router.get('/seller/branding', authenticate, requireRoles(UserRole.STORE_ADMIN), async (req: Request, res: Response) => {
  res.json(await getSellerBrandingSummary(req.user!.id));
});

/** Vendedor: descarga el logo crudo (para preview con <img> vía blob + Authorization header). */
router.get(
  '/seller/branding/logo',
  authenticate,
  requireRoles(UserRole.STORE_ADMIN),
  async (req: Request, res: Response) => {
    const logo = await getSellerLogo(req.user!.id);
    if (!logo) {
      res.status(404).json({ error: 'No hay logo cargado.' });
      return;
    }
    res.setHeader('Content-Type', logo.mime);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.send(logo.data);
  }
);

/** Vendedor: sube/reemplaza su logo. */
router.put(
  '/seller/branding/logo',
  authenticate,
  requireRoles(UserRole.STORE_ADMIN),
  (req: Request, res: Response, next: NextFunction) => {
    logoUpload.single('logo')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'El logo no puede pesar más de 2 MB.' });
        return;
      }
      if (err instanceof Error && err.message === 'INVALID_LOGO_MIME') {
        res.status(400).json({ error: 'Formato no soportado. Subí una imagen PNG o JPG.' });
        return;
      }
      if (err) {
        next(err);
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Adjuntá una imagen para el logo.' });
      return;
    }
    await saveSellerLogo(req.user!.id, req.file.buffer, req.file.mimetype);
    res.json(await getSellerBrandingSummary(req.user!.id));
  }
);

/** Vendedor: quita su logo (vuelve al encabezado de texto "Posta"). */
router.delete(
  '/seller/branding/logo',
  authenticate,
  requireRoles(UserRole.STORE_ADMIN),
  async (req: Request, res: Response) => {
    await deleteSellerLogo(req.user!.id);
    res.json({ hasLogo: false });
  }
);

/** Vendedor: cambia la tipografía de su etiqueta. */
router.put(
  '/seller/branding/font',
  authenticate,
  requireRoles(UserRole.STORE_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const labelFont = await updateSellerLabelFont(req.user!.id, req.body?.font);
      res.json({ labelFont });
    } catch (err) {
      if (err instanceof Error && err.message === 'INVALID_FONT') {
        res.status(400).json({ error: 'Tipografía no soportada.' });
        return;
      }
      throw err;
    }
  }
);

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
