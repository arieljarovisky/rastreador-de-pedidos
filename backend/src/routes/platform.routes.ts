import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePlatformOwner } from '../middleware/platform.js';
import { OrderStatus, UserRole } from '../types/index.js';
import { listPlatformAudit } from '../services/platform-audit.service.js';
import {
  archivePlatformOrder,
  createPlatformAgency,
  createPlatformPriceList,
  createPlatformUser,
  createPlatformZone,
  deletePlatformPriceList,
  deletePlatformZone,
  getPlatformAgencyDetail,
  getPlatformMetrics,
  getPlatformPriceList,
  listPlatformAgencies,
  listPlatformOrders,
  listPlatformPriceLists,
  listPlatformUsers,
  listPlatformZones,
  listSubscriptionPlans,
  resetPlatformUserPassword,
  setPlatformAgencyStatus,
  setPlatformUserDisabled,
  updatePlatformAgency,
  updatePlatformOrderStatus,
  updatePlatformPriceList,
  updatePlatformSubscription,
  updatePlatformUser,
  updatePlatformZone,
  updatePlatformZoneRates,
} from '../services/platform.service.js';
import { getOrderById } from '../services/orders.service.js';

const router = Router();

router.use(authenticate, requirePlatformOwner);

function parseLimitOffset(req: Request): { limit: number; offset: number } {
  const limit = Number(req.query.limit ?? 25);
  const offset = Number(req.query.offset ?? 0);
  return {
    limit: Number.isFinite(limit) ? limit : 25,
    offset: Number.isFinite(offset) ? offset : 0,
  };
}

function handleServiceError(res: Response, err: unknown, fallback: string): void {
  const code = err instanceof Error ? err.message : 'ERROR';
  const map: Record<string, { status: number; error: string }> = {
    NOT_FOUND: { status: 404, error: 'No encontrado.' },
    NAME_REQUIRED: { status: 400, error: 'El nombre es requerido.' },
    OWNER_NAME_REQUIRED: { status: 400, error: 'El nombre del dueño es requerido.' },
    INVALID_EMAIL: { status: 400, error: 'Email inválido.' },
    PASSWORD_SHORT: { status: 400, error: 'La contraseña debe tener al menos 6 caracteres.' },
    USERNAME_TAKEN: { status: 409, error: 'Ese usuario/email ya existe.' },
    USERNAME_SHORT: { status: 400, error: 'Usuario demasiado corto.' },
    INVALID_ROLE: { status: 400, error: 'Rol inválido.' },
    INVALID_ZONE: { status: 400, error: 'Zona inválida.' },
    PLAN_NOT_FOUND: { status: 404, error: 'Plan no encontrado.' },
    INVALID_TRIAL_DAYS: { status: 400, error: 'Días de prueba inválidos.' },
    INVALID_TRIAL_ENDS_AT: { status: 400, error: 'Fecha de fin de prueba inválida.' },
    INVALID_PERIOD_END: { status: 400, error: 'Fecha de período inválida.' },
    CANNOT_DISABLE_SELF: { status: 400, error: 'No podés deshabilitarte a vos mismo.' },
    CANNOT_DISABLE_PLATFORM_OWNER: {
      status: 400,
      error: 'No se puede deshabilitar un dueño de Posta.',
    },
    CANNOT_CHANGE_PLATFORM_OWNER_EMAIL: {
      status: 400,
      error: 'No se puede cambiar el email de un dueño de Posta.',
    },
    FORBIDDEN: { status: 403, error: 'No permitido.' },
    DEFAULT_PROTECTED: { status: 400, error: 'No se puede borrar la lista default.' },
    NAME_TAKEN: { status: 409, error: 'Ese nombre ya existe.' },
    ORDER_NOT_ARCHIVABLE: {
      status: 400,
      error: 'Solo se pueden archivar pedidos entregados o cancelados.',
    },
    REPARTIDOR_REQUIRED: { status: 400, error: 'Repartidor requerido.' },
    REPARTIDOR_NOT_FOUND: { status: 404, error: 'Repartidor no encontrado.' },
    BARRIOS_OR_BOUNDS_REQUIRED: {
      status: 400,
      error: 'Indicá barrios o coordenadas de la zona.',
    },
  };
  const mapped = map[code];
  if (mapped) {
    res.status(mapped.status).json({ error: mapped.error, code });
    return;
  }
  console.error('[platform]', err);
  res.status(500).json({ error: fallback });
}

router.get('/session', async (req: Request, res: Response) => {
  try {
    const { ensurePlatformOwnerAccount } = await import(
      '../services/platform-owner.service.js'
    );
    const { signToken } = await import('../middleware/auth.js');
    const result = await ensurePlatformOwnerAccount(req.user!.id);
    const user = result.user ?? req.user!;
    if (result.converted && result.user) {
      req.user = result.user;
    }
    // Si cambió el rol, emitir JWT nuevo (authenticate exige role == JWT).
    const token =
      result.converted && result.user
        ? signToken(result.user.id, result.user.role)
        : undefined;
    res.json({
      isPlatformOwner: true,
      email: user.username ?? null,
      name: user.name ?? null,
      role: user.role,
      agencyId: user.agencyId ?? null,
      user,
      converted: result.converted,
      token,
    });
  } catch (err) {
    console.error('[platform] GET /session error:', err);
    res.status(500).json({ error: 'No se pudo validar la sesión de plataforma.' });
  }
});

router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.json(await getPlatformMetrics());
  } catch (err) {
    handleServiceError(res, err, 'No se pudieron cargar las métricas.');
  }
});

router.get('/plans', async (_req: Request, res: Response) => {
  try {
    res.json(await listSubscriptionPlans());
  } catch (err) {
    handleServiceError(res, err, 'No se pudieron cargar los planes.');
  }
});

router.get('/audit', async (req: Request, res: Response) => {
  try {
    const { limit, offset } = parseLimitOffset(req);
    const agencyId =
      typeof req.query.agencyId === 'string' && req.query.agencyId.trim()
        ? req.query.agencyId.trim()
        : null;
    res.json(await listPlatformAudit({ agencyId, limit, offset }));
  } catch (err) {
    handleServiceError(res, err, 'No se pudo cargar la auditoría.');
  }
});

router.get('/agencies', async (req: Request, res: Response) => {
  try {
    const { limit, offset } = parseLimitOffset(req);
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const status =
      req.query.status === 'active' || req.query.status === 'suspended' || req.query.status === 'all'
        ? req.query.status
        : 'all';
    const subscription =
      req.query.subscription === 'trial' ||
      req.query.subscription === 'active' ||
      req.query.subscription === 'past_due' ||
      req.query.subscription === 'cancelled' ||
      req.query.subscription === 'all'
        ? req.query.subscription
        : 'all';
    res.json(await listPlatformAgencies({ q, status, subscription, limit, offset }));
  } catch (err) {
    handleServiceError(res, err, 'No se pudieron listar las agencias.');
  }
});

router.post('/agencies', async (req: Request, res: Response) => {
  try {
    const result = await createPlatformAgency(req.user!, {
      name: String(req.body?.name ?? ''),
      contactEmail: req.body?.contactEmail ?? null,
      contactPhone: req.body?.contactPhone ?? null,
      cuit: req.body?.cuit ?? null,
      city: req.body?.city ?? null,
      ownerName: String(req.body?.ownerName ?? ''),
      ownerEmail: String(req.body?.ownerEmail ?? ''),
      ownerPassword: String(req.body?.ownerPassword ?? ''),
    });
    res.status(201).json(result);
  } catch (err) {
    handleServiceError(res, err, 'No se pudo crear la agencia.');
  }
});

router.get('/agencies/:agencyId', async (req: Request, res: Response) => {
  try {
    res.json(await getPlatformAgencyDetail(req.params.agencyId));
  } catch (err) {
    handleServiceError(res, err, 'No se pudo cargar la agencia.');
  }
});

router.put('/agencies/:agencyId', async (req: Request, res: Response) => {
  try {
    const updated = await updatePlatformAgency(req.user!, req.params.agencyId, {
      name: req.body?.name,
      contactEmail: req.body?.contactEmail,
      contactPhone: req.body?.contactPhone,
      cuit: req.body?.cuit,
      city: req.body?.city,
      deliveryDeadlineHour:
        req.body?.deliveryDeadlineHour != null ? Number(req.body.deliveryDeadlineHour) : undefined,
    });
    res.json(updated);
  } catch (err) {
    handleServiceError(res, err, 'No se pudo actualizar la agencia.');
  }
});

router.post('/agencies/:agencyId/status', async (req: Request, res: Response) => {
  try {
    const status = req.body?.status;
    if (status !== 'active' && status !== 'suspended') {
      res.status(400).json({ error: 'Status inválido.' });
      return;
    }
    res.json(await setPlatformAgencyStatus(req.user!, req.params.agencyId, status));
  } catch (err) {
    handleServiceError(res, err, 'No se pudo cambiar el estado de la agencia.');
  }
});

router.put('/agencies/:agencyId/subscription', async (req: Request, res: Response) => {
  try {
    res.json(
      await updatePlatformSubscription(req.user!, req.params.agencyId, {
        status: req.body?.status,
        planId: req.body?.planId,
        trialEndsAt: req.body?.trialEndsAt,
        currentPeriodEnd: req.body?.currentPeriodEnd,
        extendTrialDays:
          req.body?.extendTrialDays != null ? Number(req.body.extendTrialDays) : undefined,
      })
    );
  } catch (err) {
    handleServiceError(res, err, 'No se pudo actualizar la suscripción.');
  }
});

router.get('/agencies/:agencyId/users', async (req: Request, res: Response) => {
  try {
    const role =
      typeof req.query.role === 'string' && Object.values(UserRole).includes(req.query.role as UserRole)
        ? (req.query.role as UserRole)
        : undefined;
    res.json(await listPlatformUsers(req.params.agencyId, role));
  } catch (err) {
    handleServiceError(res, err, 'No se pudieron listar los usuarios.');
  }
});

router.post('/agencies/:agencyId/users', async (req: Request, res: Response) => {
  try {
    const role = req.body?.role as UserRole;
    const user = await createPlatformUser(req.user!, req.params.agencyId, {
      name: String(req.body?.name ?? ''),
      username: String(req.body?.username ?? ''),
      password: String(req.body?.password ?? ''),
      role,
      deliveryZone: req.body?.deliveryZone ?? null,
    });
    res.status(201).json(user);
  } catch (err) {
    handleServiceError(res, err, 'No se pudo crear el usuario.');
  }
});

router.put('/agencies/:agencyId/users/:userId', async (req: Request, res: Response) => {
  try {
    res.json(
      await updatePlatformUser(req.user!, req.params.agencyId, req.params.userId, {
        name: req.body?.name,
        username: req.body?.username,
        deliveryZone: req.body?.deliveryZone,
      })
    );
  } catch (err) {
    handleServiceError(res, err, 'No se pudo actualizar el usuario.');
  }
});

router.post('/agencies/:agencyId/users/:userId/password', async (req: Request, res: Response) => {
  try {
    await resetPlatformUserPassword(
      req.user!,
      req.params.agencyId,
      req.params.userId,
      String(req.body?.password ?? '')
    );
    res.status(204).send();
  } catch (err) {
    handleServiceError(res, err, 'No se pudo resetear la contraseña.');
  }
});

router.post('/agencies/:agencyId/users/:userId/disabled', async (req: Request, res: Response) => {
  try {
    const disabled = Boolean(req.body?.disabled);
    res.json(
      await setPlatformUserDisabled(req.user!, req.params.agencyId, req.params.userId, disabled)
    );
  } catch (err) {
    handleServiceError(res, err, 'No se pudo cambiar el estado del usuario.');
  }
});

router.get('/orders', async (req: Request, res: Response) => {
  try {
    const { limit, offset } = parseLimitOffset(req);
    const agencyId =
      typeof req.query.agencyId === 'string' && req.query.agencyId.trim()
        ? req.query.agencyId.trim()
        : undefined;
    const status =
      typeof req.query.status === 'string' &&
      Object.values(OrderStatus).includes(req.query.status as OrderStatus)
        ? (req.query.status as OrderStatus)
        : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const archived =
      req.query.archived === '1' || req.query.archived === 'true'
        ? true
        : req.query.archived === '0' || req.query.archived === 'false'
          ? false
          : undefined;
    res.json(await listPlatformOrders({ agencyId, status, q, archived, limit, offset }));
  } catch (err) {
    handleServiceError(res, err, 'No se pudieron listar los pedidos.');
  }
});

router.get('/orders/:orderId', async (req: Request, res: Response) => {
  try {
    const order = await getOrderById(req.params.orderId);
    if (!order) {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }
    res.json(order);
  } catch (err) {
    handleServiceError(res, err, 'No se pudo cargar el pedido.');
  }
});

router.put('/orders/:orderId/status', async (req: Request, res: Response) => {
  try {
    const status = req.body?.status as OrderStatus;
    if (!Object.values(OrderStatus).includes(status)) {
      res.status(400).json({ error: 'Estado inválido.' });
      return;
    }
    res.json(
      await updatePlatformOrderStatus(
        req.user!,
        req.params.orderId,
        status,
        typeof req.body?.repartidorId === 'string' ? req.body.repartidorId : undefined,
        typeof req.body?.comment === 'string' ? req.body.comment : undefined
      )
    );
  } catch (err) {
    handleServiceError(res, err, 'No se pudo actualizar el pedido.');
  }
});

router.put('/orders/:orderId/archive', async (req: Request, res: Response) => {
  try {
    res.json(
      await archivePlatformOrder(req.user!, req.params.orderId, Boolean(req.body?.archived))
    );
  } catch (err) {
    handleServiceError(res, err, 'No se pudo archivar el pedido.');
  }
});

router.get('/agencies/:agencyId/zones', async (req: Request, res: Response) => {
  try {
    res.json(await listPlatformZones(req.params.agencyId));
  } catch (err) {
    handleServiceError(res, err, 'No se pudieron listar las zonas.');
  }
});

router.post('/agencies/:agencyId/zones', async (req: Request, res: Response) => {
  try {
    const zone = await createPlatformZone(req.user!, req.params.agencyId, {
      name: req.body?.name,
      color: req.body?.color,
      south: req.body?.south != null ? Number(req.body.south) : undefined,
      west: req.body?.west != null ? Number(req.body.west) : undefined,
      north: req.body?.north != null ? Number(req.body.north) : undefined,
      east: req.body?.east != null ? Number(req.body.east) : undefined,
      barrios: Array.isArray(req.body?.barrios) ? req.body.barrios : undefined,
    });
    res.status(201).json(zone);
  } catch (err) {
    handleServiceError(res, err, 'No se pudo crear la zona.');
  }
});

router.put('/agencies/:agencyId/zones/:zoneId', async (req: Request, res: Response) => {
  try {
    res.json(
      await updatePlatformZone(req.user!, req.params.agencyId, req.params.zoneId, {
        name: req.body?.name,
        color: req.body?.color,
        south: req.body?.south != null ? Number(req.body.south) : undefined,
        west: req.body?.west != null ? Number(req.body.west) : undefined,
        north: req.body?.north != null ? Number(req.body.north) : undefined,
        east: req.body?.east != null ? Number(req.body.east) : undefined,
        barrios: Array.isArray(req.body?.barrios) ? req.body.barrios : undefined,
      })
    );
  } catch (err) {
    handleServiceError(res, err, 'No se pudo actualizar la zona.');
  }
});

router.put('/agencies/:agencyId/zones/:zoneId/rates', async (req: Request, res: Response) => {
  try {
    res.json(
      await updatePlatformZoneRates(req.user!, req.params.agencyId, req.params.zoneId, {
        flex: req.body?.flex != null ? Number(req.body.flex) : req.body?.shippingRates?.flex,
        express:
          req.body?.express != null ? Number(req.body.express) : req.body?.shippingRates?.express,
        standard:
          req.body?.standard != null
            ? Number(req.body.standard)
            : req.body?.shippingRates?.standard,
        driverFlex:
          req.body?.driverFlex != null
            ? Number(req.body.driverFlex)
            : req.body?.driverPayRates?.flex,
        driverExpress:
          req.body?.driverExpress != null
            ? Number(req.body.driverExpress)
            : req.body?.driverPayRates?.express,
        driverStandard:
          req.body?.driverStandard != null
            ? Number(req.body.driverStandard)
            : req.body?.driverPayRates?.standard,
      })
    );
  } catch (err) {
    handleServiceError(res, err, 'No se pudieron actualizar las tarifas.');
  }
});

router.delete('/agencies/:agencyId/zones/:zoneId', async (req: Request, res: Response) => {
  try {
    await deletePlatformZone(req.user!, req.params.agencyId, req.params.zoneId);
    res.status(204).send();
  } catch (err) {
    handleServiceError(res, err, 'No se pudo eliminar la zona.');
  }
});

router.get('/agencies/:agencyId/price-lists', async (req: Request, res: Response) => {
  try {
    res.json(await listPlatformPriceLists(req.params.agencyId));
  } catch (err) {
    handleServiceError(res, err, 'No se pudieron listar las listas de precios.');
  }
});

router.get('/agencies/:agencyId/price-lists/:listId', async (req: Request, res: Response) => {
  try {
    res.json(await getPlatformPriceList(req.params.agencyId, req.params.listId));
  } catch (err) {
    handleServiceError(res, err, 'No se pudo cargar la lista de precios.');
  }
});

router.post('/agencies/:agencyId/price-lists', async (req: Request, res: Response) => {
  try {
    const list = await createPlatformPriceList(req.user!, req.params.agencyId, {
      name: String(req.body?.name ?? ''),
      cloneFromId: req.body?.cloneFromId ?? null,
    });
    res.status(201).json(list);
  } catch (err) {
    handleServiceError(res, err, 'No se pudo crear la lista de precios.');
  }
});

router.put('/agencies/:agencyId/price-lists/:listId', async (req: Request, res: Response) => {
  try {
    res.json(
      await updatePlatformPriceList(req.user!, req.params.agencyId, req.params.listId, {
        name: req.body?.name,
        outsideShipping: req.body?.outsideShipping,
        outsideDriverPay: req.body?.outsideDriverPay,
        zoneRates: req.body?.zoneRates,
      })
    );
  } catch (err) {
    handleServiceError(res, err, 'No se pudo actualizar la lista de precios.');
  }
});

router.delete('/agencies/:agencyId/price-lists/:listId', async (req: Request, res: Response) => {
  try {
    await deletePlatformPriceList(req.user!, req.params.agencyId, req.params.listId);
    res.status(204).send();
  } catch (err) {
    handleServiceError(res, err, 'No se pudo eliminar la lista de precios.');
  }
});

export default router;
