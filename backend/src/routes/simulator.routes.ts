import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { simulatorTick, listDeliveringOrders, getSellerIdForOrder } from '../services/orders.service.js';
import { createNotification } from '../services/notifications.service.js';
import { getDefaultSellerId } from '../services/users.service.js';
import { emitOrderUpdated, emitOrderLocation } from '../realtime/io.js';
import { pool } from '../config/database.js';
import { RowDataPacket } from 'mysql2';
import { OrderStatus } from '../types/index.js';

const router = Router();

router.post('/tick', authenticate, async (_req: Request, res: Response) => {
  const updatedCount = await simulatorTick();

  if (updatedCount > 0) {
    const delivering = await listDeliveringOrders();
    for (const order of delivering) {
      const sellerId = await getSellerIdForOrder(order.id);
      emitOrderUpdated(order, sellerId);
      const lastPoint = order.locationHistory[order.locationHistory.length - 1];
      if (lastPoint && order.repartidorId) {
        emitOrderLocation({
          orderId: order.id,
          sellerId,
          repartidorId: order.repartidorId,
          repartidorName: order.repartidorName,
          point: lastPoint,
        });
      }
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT o.id, r.name AS repartidor_name
       FROM orders o
       LEFT JOIN users r ON r.id = o.repartidor_id
       WHERE o.status = ? AND o.updated_at >= DATE_SUB(NOW(), INTERVAL 5 SECOND)`,
      [OrderStatus.DELIVERED]
    );

    const sellerId = await getDefaultSellerId();
    for (const row of rows) {
      await createNotification({
        id: `n_sim_deliv_${Date.now()}_${row.id}`,
        userId: sellerId,
        title: 'Pedido Entregado (Simulado)',
        body: `El repartidor ${row.repartidor_name} ha completado la entrega de ${row.id}.`,
        type: 'order_delivered',
        orderId: row.id,
      });
    }
  }

  res.json({ success: true, updatedCount });
});

export default router;
