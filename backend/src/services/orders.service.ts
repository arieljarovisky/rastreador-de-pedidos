import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import {
  AppNotification,
  DbOrderRow,
  Order,
  OrderHistoryEvent,
  LocationHistoryPoint,
  OrderStatus,
  User,
  UserRole,
} from '../types/index.js';
import { getRepartidorById, getUserById, updateUserLocation, getDefaultSellerId } from './users.service.js';

interface HistoryRow extends RowDataPacket {
  order_id: string;
  status: OrderStatus;
  updated_by: string;
  comment: string | null;
  created_at: Date;
}

interface LocationRow extends RowDataPacket {
  order_id: string;
  lat: number;
  lng: number;
  created_at: Date;
}

interface OrderWithRepartidorRow extends DbOrderRow, RowDataPacket {
  repartidor_name: string | null;
}

async function loadHistoryForOrders(orderIds: string[]): Promise<Map<string, OrderHistoryEvent[]>> {
  const map = new Map<string, OrderHistoryEvent[]>();
  if (orderIds.length === 0) return map;

  const placeholders = orderIds.map(() => '?').join(',');
  const [rows] = await pool.query<HistoryRow[]>(
    `SELECT order_id, status, updated_by, comment, created_at
     FROM order_history WHERE order_id IN (${placeholders}) ORDER BY created_at ASC`,
    orderIds
  );

  for (const row of rows) {
    const list = map.get(row.order_id) ?? [];
    list.push({
      status: row.status,
      timestamp: new Date(row.created_at).toISOString(),
      updatedBy: row.updated_by,
      comment: row.comment ?? undefined,
    });
    map.set(row.order_id, list);
  }
  return map;
}

async function loadLocationsForOrders(orderIds: string[]): Promise<Map<string, LocationHistoryPoint[]>> {
  const map = new Map<string, LocationHistoryPoint[]>();
  if (orderIds.length === 0) return map;

  const placeholders = orderIds.map(() => '?').join(',');
  const [rows] = await pool.query<LocationRow[]>(
    `SELECT order_id, lat, lng, created_at
     FROM order_location_history WHERE order_id IN (${placeholders}) ORDER BY created_at ASC`,
    orderIds
  );

  for (const row of rows) {
    const list = map.get(row.order_id) ?? [];
    list.push({
      lat: Number(row.lat),
      lng: Number(row.lng),
      timestamp: new Date(row.created_at).toISOString(),
    });
    map.set(row.order_id, list);
  }
  return map;
}

function rowToOrder(
  row: OrderWithRepartidorRow,
  history: OrderHistoryEvent[],
  locationHistory: LocationHistoryPoint[]
): Order {
  return {
    id: row.id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    address: row.address,
    lat: Number(row.lat),
    lng: Number(row.lng),
    status: row.status,
    repartidorId: row.repartidor_id,
    repartidorName: row.repartidor_name,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    notes: row.notes ?? undefined,
    history,
    locationHistory,
  };
}

const ORDER_SELECT = `
  SELECT o.id, o.seller_id, o.client_name, o.client_phone, o.address, o.lat, o.lng,
         o.status, o.repartidor_id, o.notes, o.created_at, o.updated_at,
         r.name AS repartidor_name
  FROM orders o
  LEFT JOIN users r ON r.id = o.repartidor_id
`;

async function enrichOrders(rows: OrderWithRepartidorRow[]): Promise<Order[]> {
  const ids = rows.map((r) => r.id);
  const [historyMap, locationMap] = await Promise.all([
    loadHistoryForOrders(ids),
    loadLocationsForOrders(ids),
  ]);
  return rows.map((row) =>
    rowToOrder(row, historyMap.get(row.id) ?? [], locationMap.get(row.id) ?? [])
  );
}

export async function getOrderById(id: string): Promise<Order | null> {
  const [rows] = await pool.query<OrderWithRepartidorRow[]>(
    `${ORDER_SELECT} WHERE o.id = ?`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  const orders = await enrichOrders([row]);
  return orders[0] ?? null;
}

export async function listOrdersForUser(user: User): Promise<Order[]> {
  let rows: OrderWithRepartidorRow[];

  if (user.role === UserRole.STORE_ADMIN) {
    [rows] = await pool.query<OrderWithRepartidorRow[]>(
      `${ORDER_SELECT} WHERE o.seller_id = ? ORDER BY o.created_at DESC`,
      [user.id]
    );
  } else if (user.role === UserRole.LOGISTICS_ADMIN) {
    [rows] = await pool.query<OrderWithRepartidorRow[]>(
      `${ORDER_SELECT} ORDER BY o.created_at DESC`
    );
  } else {
    [rows] = await pool.query<OrderWithRepartidorRow[]>(
      `${ORDER_SELECT} WHERE o.repartidor_id = ? OR o.status = ? ORDER BY o.created_at DESC`,
      [user.id, OrderStatus.PENDING]
    );
  }

  return enrichOrders(rows);
}

export function canViewOrder(user: User, order: Order, sellerId?: string): boolean {
  if (user.role === UserRole.LOGISTICS_ADMIN) return true;
  if (user.role === UserRole.STORE_ADMIN) return sellerId === user.id;
  if (user.role === UserRole.REPARTIDOR) {
    return order.repartidorId === user.id || order.status === OrderStatus.PENDING;
  }
  return false;
}

export async function getSellerIdForOrder(orderId: string): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT seller_id FROM orders WHERE id = ?',
    [orderId]
  );
  return rows[0]?.seller_id ?? null;
}

export async function createOrder(
  user: User,
  data: { clientName: string; clientPhone?: string; address: string; lat: number; lng: number; notes?: string }
): Promise<Order> {
  const [countRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM orders');
  const count = Number(countRows[0]?.cnt ?? 0);
  const newId = `PED-${2000 + count + 1}`;
  const now = new Date();
  const sellerId = user.role === UserRole.STORE_ADMIN ? user.id : await getDefaultSellerId();

  await pool.query(
    `INSERT INTO orders (id, seller_id, client_name, client_phone, address, lat, lng, status, repartidor_id, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    [
      newId,
      sellerId,
      data.clientName,
      data.clientPhone ?? '',
      data.address,
      data.lat,
      data.lng,
      OrderStatus.PENDING,
      data.notes ?? '',
      now,
      now,
    ]
  );

  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
    [newId, OrderStatus.PENDING, user.name, '', now]
  );

  const order = await getOrderById(newId);
  if (!order) throw new Error('No se pudo crear el pedido');
  return order;
}

export async function updateOrderStatus(
  user: User,
  orderId: string,
  status: OrderStatus,
  repartidorId?: string,
  comment?: string
): Promise<Order> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error('NOT_FOUND');

  const now = new Date();
  let assignedRepartidorId = order.repartidorId;
  let assignedRepartidorName = order.repartidorName;

  if (user.role === UserRole.REPARTIDOR) {
    if (status === OrderStatus.ASSIGNED) {
      if (order.status !== OrderStatus.PENDING) throw new Error('NOT_AVAILABLE');
      assignedRepartidorId = user.id;
      assignedRepartidorName = user.name;
    } else if (order.repartidorId !== user.id) {
      throw new Error('FORBIDDEN');
    }
  } else if (status === OrderStatus.ASSIGNED) {
    if (!repartidorId) throw new Error('REPARTIDOR_REQUIRED');
    const rep = await getRepartidorById(repartidorId);
    if (!rep) throw new Error('REPARTIDOR_NOT_FOUND');
    assignedRepartidorId = rep.id;
    assignedRepartidorName = rep.name;
  }

  await pool.query(
    'UPDATE orders SET status = ?, repartidor_id = ?, updated_at = ? WHERE id = ?',
    [status, assignedRepartidorId, now, orderId]
  );

  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
    [orderId, status, user.name, comment ?? '', now]
  );

  if (status === OrderStatus.DELIVERING) {
    await pool.query('DELETE FROM order_location_history WHERE order_id = ?', [orderId]);
    let lat = -34.5885;
    let lng = -58.4306;
    if (assignedRepartidorId) {
      const rep = await getUserById(assignedRepartidorId);
      if (rep?.currentLocation) {
        lat = rep.currentLocation.lat;
        lng = rep.currentLocation.lng;
      }
    }
    await pool.query(
      `INSERT INTO order_location_history (order_id, lat, lng, created_at) VALUES (?, ?, ?, ?)`,
      [orderId, lat, lng, now]
    );
  }

  const updated = await getOrderById(orderId);
  if (!updated) throw new Error('NOT_FOUND');

  return {
    ...updated,
    repartidorId: assignedRepartidorId,
    repartidorName: assignedRepartidorName,
  };
}

export async function reportOrderLocation(
  user: User,
  orderId: string,
  lat: number,
  lng: number
): Promise<{ success: boolean; orderStatus: OrderStatus }> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error('NOT_FOUND');
  if (order.repartidorId !== user.id) throw new Error('FORBIDDEN');

  const now = new Date();
  await updateUserLocation(user.id, lat, lng);

  if (order.status === OrderStatus.DELIVERING) {
    await pool.query(
      `INSERT INTO order_location_history (order_id, lat, lng, created_at) VALUES (?, ?, ?, ?)`,
      [orderId, lat, lng, now]
    );
    await pool.query('UPDATE orders SET updated_at = ? WHERE id = ?', [now, orderId]);
  }

  return { success: true, orderStatus: order.status };
}

export async function simulatorTick(): Promise<number> {
  const [rows] = await pool.query<OrderWithRepartidorRow[]>(
    `${ORDER_SELECT} WHERE o.status = ? AND o.repartidor_id IS NOT NULL`,
    [OrderStatus.DELIVERING]
  );
  const orders = await enrichOrders(rows);
  let updatedCount = 0;
  const now = new Date();
  const nowStr = now.toISOString();

  for (const order of orders) {
    const lastPoint =
      order.locationHistory.length > 0
        ? order.locationHistory[order.locationHistory.length - 1]
        : { lat: -34.5885, lng: -58.4306, timestamp: nowStr };

    const deltaLat = order.lat - lastPoint.lat;
    const deltaLng = order.lng - lastPoint.lng;
    const distance = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng);

    if (distance < 0.001) {
      await pool.query('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', [
        OrderStatus.DELIVERED,
        now,
        order.id,
      ]);
      await pool.query(
        `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
        [order.id, OrderStatus.DELIVERED, order.repartidorName ?? 'Sistema Simulador', 'Entregado (Simulación automatizada)', now]
      );
      updatedCount++;
    } else {
      const stepRatio = 0.15;
      const nextLat = lastPoint.lat + deltaLat * stepRatio;
      const nextLng = lastPoint.lng + deltaLng * stepRatio;

      await pool.query(
        `INSERT INTO order_location_history (order_id, lat, lng, created_at) VALUES (?, ?, ?, ?)`,
        [order.id, nextLat, nextLng, now]
      );
      await pool.query('UPDATE orders SET updated_at = ? WHERE id = ?', [now, order.id]);

      if (order.repartidorId) {
        await updateUserLocation(order.repartidorId, nextLat, nextLng);
      }
      updatedCount++;
    }
  }

  return updatedCount;
}

export async function countOrders(): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM orders');
  return Number(rows[0]?.cnt ?? 0);
}
