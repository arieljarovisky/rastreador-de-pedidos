import { Router, Request, Response } from 'express';
import { authenticate, requireRoles, requireAgencyAdmin } from '../middleware/auth.js';
import { UserRole, OrderStatus } from '../types/index.js';
import {
  listOrdersForUser,
  getOrderById,
  createOrder,
  updateOrderStatus,
  reportOrderLocation,
  reportOrderLocationsBatch,
  canViewOrder,
  getSellerIdForOrder,
  assignOrderToSeller,
  deleteOrder,
  deleteAllOrders,
  setOrderArchived,
} from '../services/orders.service.js';
import { getDeliverySummaryForUser } from '../services/delivery-dashboard.service.js';
import { createNotification } from '../services/notifications.service.js';
import { getMercadoLibreShippingLabelPdf, extractMlOrderIdFromNotes } from '../services/mercadolibre.service.js';
import {
  syncOpenMercadoLibreOrdersInList,
  syncMercadoLibreOrderLiveStatus,
  syncFlexScansForRepartidor,
} from '../services/marketplace-import.service.js';
import { emitOrderUpdated, emitOrderLocation, emitRepartidorLocation, emitOrderDeleted } from '../realtime/io.js';
import { logRepartidorGps } from '../utils/repartidorGpsLog.js';

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
  await syncFlexScansForRepartidor(req.user!, { force: true });
  const orders = await listOrdersForUser(req.user!);
  const synced = await syncOpenMercadoLibreOrdersInList(orders);
  res.json({ synced: synced.length, orders: synced });
});

router.get('/', authenticate, async (req: Request, res: Response) => {
  if (req.user!.role === UserRole.REPARTIDOR) {
    await syncFlexScansForRepartidor(req.user!);
  }
  const orders = await listOrdersForUser(req.user!);
  const synced = await syncOpenMercadoLibreOrdersInList(orders);
  res.json(synced);
});

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

    await createNotification({
      id: `n_order_${Date.now()}`,
      userId: 'all',
      title: 'Nuevo pedido disponible',
      body: `Un nuevo pedido con id ${order.id} está listo para ser entregado en ${address}.`,
      type: 'info',
      orderId: order.id,
    });

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

  try {
    const pdf = await getMercadoLibreShippingLabelPdf(sellerId, order.externalOrderId, {
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
        const synced = await syncMercadoLibreOrderLiveStatus(sellerId, order);
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
});

router.put('/:id/status', authenticate, async (req: Request, res: Response) => {
  const { status, repartidorId, comment } = req.body;
  if (!status) {
    res.status(400).json({ error: 'El estado es requerido.' });
    return;
  }

  try {
    const order = await updateOrderStatus(req.user!, req.params.id, status as OrderStatus, repartidorId, comment);

    if (status === OrderStatus.ASSIGNED && repartidorId && req.user!.role !== UserRole.REPARTIDOR) {
      await createNotification({
        id: `n_assign_${Date.now()}`,
        userId: repartidorId,
        title: 'Pedido Asignado',
        body: `Se te ha asignado el pedido ${order.id} con entrega en ${order.address}.`,
        type: 'order_assigned',
        orderId: order.id,
      });
    }

    if (status === OrderStatus.DELIVERED) {
      const sellerId = await getSellerIdForOrder(order.id);
      if (sellerId) {
        await createNotification({
          id: `n_deliv_${Date.now()}`,
          userId: sellerId,
          title: 'Pedido Entregado',
          body: `¡El pedido ${order.id} ha sido entregado exitosamente por ${order.repartidorName}!`,
          type: 'order_delivered',
          orderId: order.id,
        });
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

router.delete('/all', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await deleteAllOrders(req.user!);
    for (const orderId of result.orderIds) {
      const sellerId = result.sellerIds.length === 1 ? result.sellerIds[0]! : null;
      emitOrderDeleted(orderId, sellerId);
    }
    res.json({ deleted: result.deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tienes permiso para eliminar todos los pedidos.' });
      return;
    }
    throw err;
  }
});

router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await deleteOrder(req.user!, req.params.id);
    emitOrderDeleted(req.params.id, result.sellerId);
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
