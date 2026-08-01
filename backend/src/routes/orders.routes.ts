import { Router, Request, Response } from 'express';
import { authenticate, requireRoles, requireAgencyAdmin } from '../middleware/auth.js';
import { UserRole, OrderStatus, Order, User } from '../types/index.js';
import {
  listOrdersForUser,
  listOrdersRegistry,
  getOrderById,
  createOrder,
  updateOrderStatus,
  addOrderIncident,
  reportOrderLocation,
  reportOrderLocationsBatch,
  canViewOrder,
  getSellerIdForOrder,
  assignOrderToSeller,
  assignOrderToScanningRepartidor,
  deleteOrder,
  archiveAllFinishedOrders,
  setOrderArchived,
  scheduleOrderForToday,
} from '../services/orders.service.js';
import { getDeliverySummaryForUser } from '../services/delivery-dashboard.service.js';
import { createNotification } from '../services/notifications.service.js';
import { getMercadoLibreShippingLabelPdf, extractMlOrderIdFromNotes } from '../services/mercadolibre.service.js';
import { generatePostaShippingLabelPdf, POSTA_ORDER_QR_PREFIX } from '../services/shipping-label.service.js';
import { getShippingLabelBranding } from '../services/seller-branding.service.js';
import {
  syncOpenMercadoLibreOrdersInList,
  syncMercadoLibreOrderLiveStatus,
  syncFlexScansForRepartidor,
} from '../services/marketplace-import.service.js';
import { emitOrderUpdated, emitOrderLocation, emitRepartidorLocation, emitOrderDeleted } from '../realtime/io.js';
import { logRepartidorGps } from '../utils/repartidorGpsLog.js';
import { AGENCY_ADMIN_ROLES } from '../utils/roles.js';
import { pool } from '../config/database.js';
import { RowDataPacket } from 'mysql2';

function parseLimitOffset(req: Request): { limit: number; offset: number } {
  const limit = Number(req.query.limit ?? 500);
  const offset = Number(req.query.offset ?? 0);
  return {
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 5000) : 500,
    offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
  };
}

function parseIncludeArchived(req: Request): boolean {
  const raw = req.query.includeArchived;
  return raw === '1' || raw === 'true';
}

function mercadoLibreLabelErrorMessage(code: string): string {
  switch (code) {
    case 'ML_NOT_CONNECTED':
      return 'El vendedor no tiene Mercado Libre conectado.';
    case 'ML_NO_SHIPMENT':
      return 'No se encontró un envío asociado a esta orden de Mercado Libre.';
    case 'ML_ALREADY_DELIVERED':
      return 'Este envío ya fue entregado en Mercado Libre.';
    case 'ML_LABEL_NOT_READY':
      return 'La etiqueta aún no está lista para imprimir. Verificá el estado del envío en Mercado Libre.';
    case 'ML_LABEL_NOT_FOUND':
      return 'No se encontró la etiqueta de envío en Mercado Libre.';
    case 'ML_LABEL_UNAVAILABLE':
      return 'Mercado Libre rechazó la descarga. Reconectá ML en Configuración o imprimí la etiqueta desde la app de ML.';
    default:
      return 'No se pudo descargar la etiqueta de Mercado Libre.';
  }
}

const router = Router();

/** Evita apilar syncs ML/Flex por polling frecuente del mismo usuario. */
const recentBackgroundSyncByUser = new Map<string, number>();
const BACKGROUND_SYNC_COOLDOWN_MS = 25_000;

function scheduleOrdersBackgroundSync(user: User, orders: Order[]) {
  const now = Date.now();
  const last = recentBackgroundSyncByUser.get(user.id) ?? 0;
  if (now - last < BACKGROUND_SYNC_COOLDOWN_MS) return;
  recentBackgroundSyncByUser.set(user.id, now);

  void (async () => {
    try {
      if (user.role === UserRole.REPARTIDOR) {
        await syncFlexScansForRepartidor(user);
      }
      await syncOpenMercadoLibreOrdersInList(orders);
    } catch (err) {
      console.error('[orders] background sync failed', err);
    }
  })();
}

router.get('/delivery-summary', authenticate, requireRoles(
  UserRole.STORE_ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.LOGISTICS_ADMIN
), async (req: Request, res: Response) => {
  const date = typeof req.query.date === 'string' ? req.query.date : undefined;
  const summary = await getDeliverySummaryForUser(req.user!, date);
  res.json(summary);
});

router.post('/flex-sync', authenticate, requireRoles(UserRole.REPARTIDOR), async (req: Request, res: Response) => {
  const synced = await syncFlexScansForRepartidor(req.user!, { force: true });
  const { limit, offset } = parseLimitOffset(req);
  const includeArchived = parseIncludeArchived(req);
  const orders = await listOrdersForUser(req.user!, { mode: 'list', limit, offset, includeArchived });
  // ML live sync en background: el listado responde ya; updates llegan por WS.
  void syncOpenMercadoLibreOrdersInList(orders).catch((err) => {
    console.error('[orders/flex-sync] background ML sync failed', err);
  });
  res.json({ synced, orders });
});

router.get('/', authenticate, async (req: Request, res: Response) => {
  const { limit, offset } = parseLimitOffset(req);
  const includeArchived = parseIncludeArchived(req);
  const orders = await listOrdersForUser(req.user!, { mode: 'list', limit, offset, includeArchived });
  res.json(orders);
  scheduleOrdersBackgroundSync(req.user!, orders);
});

/** Registro: página + COUNT + stats (sin traer todo el historial). */
router.get(
  '/registry',
  authenticate,
  requireRoles(UserRole.STORE_ADMIN, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN),
  async (req: Request, res: Response) => {
    const externalSource =
      typeof req.query.externalSource === 'string' && req.query.externalSource.trim()
        ? req.query.externalSource.trim()
        : undefined;

    if (externalSource === 'personal') {
      res.json({
        items: [],
        total: 0,
        stats: {
          total: 0,
          pending: 0,
          delivering: 0,
          delivered: 0,
          cancelled: 0,
          archived: 0,
        },
      });
      return;
    }

    const limit = Number(req.query.limit ?? 25);
    const offset = Number(req.query.offset ?? 0);
    const sellerId =
      typeof req.query.sellerId === 'string' && req.query.sellerId.trim()
        ? req.query.sellerId.trim()
        : undefined;
    const status =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? req.query.status.trim()
        : 'all';
    const dateFrom =
      typeof req.query.dateFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateFrom.trim())
        ? req.query.dateFrom.trim()
        : undefined;
    const dateTo =
      typeof req.query.dateTo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateTo.trim())
        ? req.query.dateTo.trim()
        : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;

    const result = await listOrdersRegistry(req.user!, {
      sellerId,
      externalSource,
      status,
      dateFrom,
      dateTo,
      q,
      limit: Number.isFinite(limit) ? limit : 25,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    res.json(result);
  }
);

router.post('/', authenticate, requireRoles(UserRole.STORE_ADMIN, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN), async (req: Request, res: Response) => {
  const { clientName, clientPhone, address, lat, lng, notes, sellerId } = req.body;
  if (!clientName || !address || lat === undefined || lng === undefined) {
    res.status(400).json({ error: 'Campos requeridos faltantes (clientName, address, lat, lng).' });
    return;
  }

  try {
    const order = await createOrder(req.user!, {
      clientName,
      clientPhone,
      address,
      lat: Number(lat),
      lng: Number(lng),
      notes,
      sellerId,
    });

    // Notificar solo a admins de la agencia del pedido (nunca broadcast global `all`).
    if (order.agencyId) {
      const [adminRows] = await pool.query<Array<{ id: string } & RowDataPacket>>(
        `SELECT id FROM users WHERE agency_id = ? AND role IN ('super_admin', 'logistics_admin') AND id != ?`,
        [order.agencyId, req.user!.id]
      );
      const stamp = Date.now();
      for (const admin of adminRows) {
        await createNotification({
          id: `n_order_${stamp}_${admin.id}`,
          userId: admin.id,
          title: 'Nuevo pedido disponible',
          body: `Un nuevo pedido con id ${order.id} está listo para ser entregado en ${address}.`,
          type: 'info',
          orderId: order.id,
        });
      }
    }

    const assignedSellerId = await getSellerIdForOrder(order.id);
    emitOrderUpdated(order, assignedSellerId);

    res.status(201).json(order);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'SELLER_NOT_FOUND') {
      res.status(400).json({ error: 'Vendedor no encontrado.' });
      return;
    }
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tienes permiso para crear pedidos.' });
      return;
    }
    if (message === 'SELLER_NO_AGENCY') {
      res.status(400).json({
        error:
          'Tu cuenta de vendedor no está asociada a una agencia. Pedile a tu agencia que verifique tu usuario.',
      });
      return;
    }
    throw err;
  }
});

router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const order = await getOrderById(req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Pedido no encontrado.' });
    return;
  }

  const sellerId = await getSellerIdForOrder(order.id);
  if (!canViewOrder(req.user!, order, sellerId ?? undefined)) {
    res.status(403).json({ error: 'No tienes permiso para ver este pedido.' });
    return;
  }

  res.json(order);
});

/** Descarga el PDF oficial de ML y responde; comparte el manejo de errores entre ambas rutas de etiqueta. */
async function sendMercadoLibreLabel(
  res: Response,
  order: Order,
  sellerId: string
): Promise<void> {
  try {
    const pdf = await getMercadoLibreShippingLabelPdf(sellerId, order.externalOrderId!, {
      alternateRef: extractMlOrderIdFromNotes(order.notes),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="etiqueta-ml-${order.externalOrderId}.pdf"`
    );
    res.send(pdf);
  } catch (err) {
    const code = err instanceof Error ? err.message : 'ML_LABEL_UNAVAILABLE';
    if (code === 'ML_ALREADY_DELIVERED' || code === 'ML_LABEL_NOT_READY') {
      try {
        const synced = await syncMercadoLibreOrderLiveStatus(null, order);
        if (synced.status !== order.status) {
          emitOrderUpdated(synced, sellerId);
        }
        if (synced.status === OrderStatus.DELIVERED) {
          res.status(409).json({
            error:
              'Este envío ya fue entregado en Mercado Libre. El estado se actualizó en Posta.',
            code: 'ML_ALREADY_DELIVERED',
            order: synced,
          });
          return;
        }
      } catch {
        // seguir con el mensaje de etiqueta
      }
    }
    const status = code === 'ML_NOT_CONNECTED' ? 400 : code === 'ML_ALREADY_DELIVERED' ? 409 : 502;
    res.status(status).json({ error: mercadoLibreLabelErrorMessage(code) });
  }
}

router.get('/:id/mercadolibre-label', authenticate, async (req: Request, res: Response) => {
  const order = await getOrderById(req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Pedido no encontrado.' });
    return;
  }

  const sellerId = await getSellerIdForOrder(order.id);
  if (!canViewOrder(req.user!, order, sellerId ?? undefined)) {
    res.status(403).json({ error: 'No tienes permiso para ver este pedido.' });
    return;
  }

  if (order.externalSource !== 'mercadolibre' || !order.externalOrderId) {
    res.status(400).json({ error: 'Este pedido no proviene de Mercado Libre.' });
    return;
  }

  if (!sellerId) {
    res.status(400).json({ error: 'El pedido no tiene un vendedor asociado con integración de Mercado Libre.' });
    return;
  }

  await sendMercadoLibreLabel(res, order, sellerId);
});

/** Ruta agnóstica de canal: etiqueta oficial de ML si corresponde, o etiqueta propia de Posta (con QR) para el resto. */
router.get('/:id/shipping-label', authenticate, async (req: Request, res: Response) => {
  const order = await getOrderById(req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Pedido no encontrado.' });
    return;
  }

  const sellerId = await getSellerIdForOrder(order.id);
  if (!canViewOrder(req.user!, order, sellerId ?? undefined)) {
    res.status(403).json({ error: 'No tienes permiso para ver este pedido.' });
    return;
  }

  if (order.externalSource === 'mercadolibre' && order.externalOrderId) {
    if (!sellerId) {
      res.status(400).json({ error: 'El pedido no tiene un vendedor asociado con integración de Mercado Libre.' });
      return;
    }
    await sendMercadoLibreLabel(res, order, sellerId);
    return;
  }

  const branding = await getShippingLabelBranding(sellerId);
  const pdf = await generatePostaShippingLabelPdf(order, branding);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="etiqueta-${order.id}.pdf"`);
  res.send(pdf);
});

/** Escaneo de la etiqueta propia de Posta: reclama el pedido para el repartidor que escanea. */
router.post(
  '/scan',
  authenticate,
  requireRoles(...AGENCY_ADMIN_ROLES, UserRole.REPARTIDOR),
  async (req: Request, res: Response) => {
    const { code } = req.body as { code?: string };
    const trimmed = typeof code === 'string' ? code.trim() : '';
    if (!trimmed) {
      res.status(400).json({ error: 'Escaneá o ingresá el código de la etiqueta.' });
      return;
    }
    if (!trimmed.startsWith(POSTA_ORDER_QR_PREFIX)) {
      res.status(400).json({ error: 'El código escaneado no corresponde a una etiqueta de Posta.' });
      return;
    }
    const orderId = trimmed.slice(POSTA_ORDER_QR_PREFIX.length).trim();
    if (!orderId) {
      res.status(400).json({ error: 'El código escaneado no es válido.' });
      return;
    }

    try {
      const order = await getOrderById(orderId);
      if (!order) {
        res.status(404).json({ error: 'Pedido no encontrado.' });
        return;
      }
      const sellerId = await getSellerIdForOrder(order.id);
      if (!canViewOrder(req.user!, order, sellerId ?? undefined)) {
        res.status(403).json({ error: 'No tenés permiso para ver este pedido.' });
        return;
      }

      const previousRepartidorId = order.repartidorId;
      const updated = await assignOrderToScanningRepartidor(
        req.user!,
        order.id,
        'Asignado por escaneo de etiqueta'
      );

      const newlyAssigned =
        req.user!.role === UserRole.REPARTIDOR &&
        updated.repartidorId === req.user!.id &&
        updated.repartidorId !== previousRepartidorId;

      if (newlyAssigned) {
        emitOrderUpdated(updated, sellerId);
        await createNotification({
          id: `n_scan_assign_${Date.now()}_${updated.id}`,
          userId: req.user!.id,
          title: 'Pedido asignado',
          body: `Se te asignó el envío ${updated.id} (${updated.clientName}) por escaneo de etiqueta.`,
          type: 'order_assigned',
          orderId: updated.id,
        });
      }

      res.json({ order: updated, alreadyAssigned: !newlyAssigned });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'NOT_FOUND') {
        res.status(404).json({ error: 'Pedido no encontrado.' });
        return;
      }
      if (message === 'NOT_AVAILABLE') {
        res.status(400).json({ error: 'Este pedido no pertenece a tu agencia.' });
        return;
      }
      console.error('[orders/scan] error:', err);
      res.status(502).json({ error: 'No se pudo procesar el escaneo. Intentá de nuevo.' });
    }
  }
);

router.post(
  '/:id/schedule-today',
  authenticate,
  requireRoles(UserRole.STORE_ADMIN, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN),
  async (req: Request, res: Response) => {
    try {
      const order = await scheduleOrderForToday(req.user!, req.params.id);
      if (!order) {
        res.status(404).json({ error: 'Pedido no encontrado.' });
        return;
      }
      const sellerId = await getSellerIdForOrder(order.id);
      emitOrderUpdated(order, sellerId);
      res.json(order);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'FORBIDDEN') {
        res.status(403).json({ error: 'No tenés permiso para reprogramar este pedido.' });
        return;
      }
      if (message === 'ML_SCHEDULE_TODAY_FORBIDDEN') {
        res.status(400).json({
          error: 'Los envíos de Mercado Libre no se pueden programar para hoy.',
        });
        return;
      }
      console.error('[orders] schedule-today', err);
      res.status(500).json({ error: 'No se pudo programar el pedido para hoy.' });
    }
  }
);

router.put('/:id/status', authenticate, async (req: Request, res: Response) => {
  const { status, repartidorId, comment } = req.body;
  if (!status) {
    res.status(400).json({ error: 'El estado es requerido.' });
    return;
  }

  try {
    const order = await updateOrderStatus(req.user!, req.params.id, status as OrderStatus, repartidorId, comment);

    if (status === OrderStatus.ASSIGNED && repartidorId && req.user!.role !== UserRole.REPARTIDOR) {
      try {
        await createNotification({
          id: `n_assign_${Date.now()}`,
          userId: repartidorId,
          title: 'Pedido Asignado',
          body: `Se te ha asignado el pedido ${order.id} con entrega en ${order.address}.`,
          type: 'order_assigned',
          orderId: order.id,
        });
      } catch (notifErr) {
        console.warn('[orders] No se pudo notificar asignación:', notifErr);
      }
    }

    if (status === OrderStatus.DELIVERED) {
      const sellerId = await getSellerIdForOrder(order.id);
      if (sellerId) {
        try {
          const byWhom = order.repartidorName?.trim() || req.user!.name;
          await createNotification({
            id: `n_deliv_${Date.now()}`,
            userId: sellerId,
            title: 'Pedido Entregado',
            body: `¡El pedido ${order.id} ha sido entregado exitosamente por ${byWhom}!`,
            type: 'order_delivered',
            orderId: order.id,
          });
        } catch (notifErr) {
          console.warn('[orders] No se pudo notificar entrega:', notifErr);
        }
      }
    }

    const sellerId = await getSellerIdForOrder(order.id);
    emitOrderUpdated(order, sellerId);

    res.json(order);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }
    if (message === 'NOT_AVAILABLE') {
      res.status(400).json({ error: 'Este pedido ya no está disponible.' });
      return;
    }
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'Este pedido no está asignado a ti.' });
      return;
    }
    if (message === 'MANUAL_DELIVER_ML_FORBIDDEN') {
      res.status(400).json({
        error:
          'Los envíos de Mercado Libre se marcan como entregados automáticamente. No se pueden confirmar a mano.',
      });
      return;
    }
    if (message === 'REPARTIDOR_REQUIRED') {
      res.status(400).json({ error: 'Debe especificar el repartidorId.' });
      return;
    }
    if (message === 'REPARTIDOR_NOT_FOUND') {
      res.status(400).json({ error: 'Repartidor no encontrado.' });
      return;
    }
    if (message === 'ALREADY_DELIVERING') {
      res.status(400).json({ error: 'Ya tenés un viaje en curso. Finalizalo antes de iniciar otro.' });
      return;
    }
    if (message === 'CANNOT_UNASSIGN') {
      res.status(400).json({
        error: 'Solo se puede desasignar repartidor en pedidos asignados que aún no salieron a ruta.',
      });
      return;
    }
    throw err;
  }
});

router.post('/:id/incidencias', authenticate, async (req: Request, res: Response) => {
  const { comment } = req.body;
  if (!comment || typeof comment !== 'string' || !comment.trim()) {
    res.status(400).json({ error: 'El comentario de la incidencia es requerido.' });
    return;
  }

  try {
    const order = await addOrderIncident(req.user!, req.params.id, comment);
    const sellerId = await getSellerIdForOrder(order.id);
    emitOrderUpdated(order, sellerId);
    res.json(order);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tenés permiso para registrar incidencias en este pedido.' });
      return;
    }
    if (message === 'COMMENT_REQUIRED') {
      res.status(400).json({ error: 'El comentario de la incidencia es requerido.' });
      return;
    }
    throw err;
  }
});

router.put('/:id/seller', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const { sellerId } = req.body;
  if (!sellerId) {
    res.status(400).json({ error: 'Debe especificar el sellerId del vendedor.' });
    return;
  }

  try {
    const order = await assignOrderToSeller(req.user!, req.params.id, sellerId);
    emitOrderUpdated(order, sellerId);
    res.json(order);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }
    if (message === 'ORDER_NOT_PENDING') {
      res.status(400).json({ error: 'Solo se puede asignar vendedor en pedidos pendientes.' });
      return;
    }
    if (message === 'SELLER_NOT_FOUND') {
      res.status(400).json({ error: 'Vendedor no encontrado.' });
      return;
    }
    throw err;
  }
});

router.put('/archive-finished', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await archiveAllFinishedOrders(req.user!);
    for (const orderId of result.orderIds) {
      const order = await getOrderById(orderId);
      if (!order) continue;
      const sellerId = await getSellerIdForOrder(order.id);
      emitOrderUpdated(order, sellerId);
    }
    res.json({ archived: result.archived });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tienes permiso para archivar envíos.' });
      return;
    }
    throw err;
  }
});

router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await deleteOrder(req.user!, req.params.id);
    emitOrderDeleted(req.params.id, result.sellerId, result.agencyId);
    res.status(204).send();
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tienes permiso para eliminar este pedido.' });
      return;
    }
    if (message === 'ORDER_NOT_DELETABLE') {
      res.status(409).json({
        error: 'Solo se pueden eliminar pedidos pendientes. Cancelalos primero si ya están en curso.',
      });
      return;
    }
    throw err;
  }
});

router.put('/:id/archive', authenticate, async (req: Request, res: Response) => {
  const { archived } = req.body;
  if (typeof archived !== 'boolean') {
    res.status(400).json({ error: 'El campo archived (boolean) es requerido.' });
    return;
  }

  try {
    const order = await setOrderArchived(req.user!, req.params.id, archived);
    const sellerId = await getSellerIdForOrder(order.id);
    emitOrderUpdated(order, sellerId);
    res.json(order);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tienes permiso para archivar este pedido.' });
      return;
    }
    if (message === 'ORDER_NOT_ARCHIVABLE') {
      res.status(409).json({
        error: 'Solo se pueden archivar pedidos entregados o cancelados.',
      });
      return;
    }
    throw err;
  }
});

router.post('/:id/location', authenticate, requireRoles(UserRole.REPARTIDOR), async (req: Request, res: Response) => {
  const { lat, lng, timestamp } = req.body;
  const user = req.user!;
  const orderId = req.params.id;
  const clientTs = typeof timestamp === 'string' ? timestamp : null;

  if (lat === undefined || lng === undefined) {
    logRepartidorGps('order_rejected', user, { orderId, reason: 'missing_coords' });
    res.status(400).json({ error: 'Latitud y longitud son requeridas.' });
    return;
  }

  try {
    const result = await reportOrderLocation(
      user,
      orderId,
      Number(lat),
      Number(lng),
      typeof timestamp === 'string' ? timestamp : undefined
    );

    emitOrderLocation({
      orderId: result.orderId,
      sellerId: result.sellerId,
      repartidorId: user.id,
      repartidorName: user.name,
      point: result.point,
    });

    emitRepartidorLocation({
      ...user,
      currentLocation: result.point,
    });

    logRepartidorGps('order_ok', user, {
      orderId: result.orderId,
      orderStatus: result.orderStatus,
      lat: Number(lat),
      lng: Number(lng),
      clientTimestamp: clientTs,
      savedAt: result.point.timestamp,
    });

    res.json({ success: result.success, orderStatus: result.orderStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    logRepartidorGps('order_error', user, {
      orderId,
      lat: Number(lat),
      lng: Number(lng),
      clientTimestamp: clientTs,
      error: message || String(err),
    });
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'Este pedido no está asignado a ti.' });
      return;
    }
    throw err;
  }
});

router.post('/:id/locations/batch', authenticate, requireRoles(UserRole.REPARTIDOR), async (req: Request, res: Response) => {
  const { points } = req.body;
  const user = req.user!;
  const orderId = req.params.id;

  if (!Array.isArray(points) || points.length === 0) {
    logRepartidorGps('batch_rejected', user, { orderId, reason: 'empty_points' });
    res.status(400).json({ error: 'Se requiere un arreglo de puntos.' });
    return;
  }

  const normalized = points
    .filter(
      (p: unknown): p is { lat: number; lng: number; timestamp: string } =>
        typeof p === 'object' &&
        p !== null &&
        'lat' in p &&
        'lng' in p &&
        'timestamp' in p &&
        typeof (p as { timestamp: unknown }).timestamp === 'string'
    )
    .map((p) => ({
      lat: Number(p.lat),
      lng: Number(p.lng),
      timestamp: p.timestamp,
    }));

  if (normalized.length === 0) {
    logRepartidorGps('batch_rejected', user, { orderId, reason: 'invalid_points' });
    res.status(400).json({ error: 'Ningún punto válido en el lote.' });
    return;
  }

  try {
    const result = await reportOrderLocationsBatch(user, orderId, normalized);

    emitOrderLocation({
      orderId: result.orderId,
      sellerId: result.sellerId,
      repartidorId: user.id,
      repartidorName: user.name,
      point: result.point,
    });

    emitRepartidorLocation({
      ...user,
      currentLocation: result.point,
    });

    logRepartidorGps('batch_ok', user, {
      orderId: result.orderId,
      orderStatus: result.orderStatus,
      pointsReceived: points.length,
      pointsSynced: result.points.length,
      lastLat: result.point.lat,
      lastLng: result.point.lng,
      savedAt: result.point.timestamp,
    });

    res.json({
      success: result.success,
      orderStatus: result.orderStatus,
      synced: result.points.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    logRepartidorGps('batch_error', user, {
      orderId,
      pointsReceived: points.length,
      error: message || String(err),
    });
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'Este pedido no está asignado a ti.' });
      return;
    }
    throw err;
  }
});

export default router;
