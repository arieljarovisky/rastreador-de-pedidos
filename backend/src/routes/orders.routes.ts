import { Router, Request, Response } from 'express';
import { authenticate, requireRoles, requireAgencyAdmin } from '../middleware/auth.js';
import { UserRole, OrderStatus } from '../types/index.js';
import {
  listOrdersForUser,
  getOrderById,
  createOrder,
  updateOrderStatus,
  reportOrderLocation,
  canViewOrder,
  getSellerIdForOrder,
  assignOrderToSeller,
  deleteOrder,
  setOrderArchived,
} from '../services/orders.service.js';
import { createNotification } from '../services/notifications.service.js';
import { emitOrderUpdated, emitOrderLocation, emitRepartidorLocation, emitOrderDeleted } from '../realtime/io.js';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  const orders = await listOrdersForUser(req.user!);
  res.json(orders);
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
  const { lat, lng } = req.body;
  if (lat === undefined || lng === undefined) {
    res.status(400).json({ error: 'Latitud y longitud son requeridas.' });
    return;
  }

  try {
    const result = await reportOrderLocation(req.user!, req.params.id, Number(lat), Number(lng));

    emitOrderLocation({
      orderId: result.orderId,
      sellerId: result.sellerId,
      repartidorId: req.user!.id,
      repartidorName: req.user!.name,
      point: result.point,
    });

    emitRepartidorLocation({
      ...req.user!,
      currentLocation: result.point,
    });

    res.json({ success: result.success, orderStatus: result.orderStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
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
