import { RowDataPacket, ResultSetHeader } from 'mysql2';
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
import { getRepartidorById, getUserById, updateUserLocation, assertSellerInAgency } from './users.service.js';
import { isAgencyAdmin } from '../utils/roles.js';
import {
  computeDeliveryDeadline,
  getOperationalDateKey,
  nextOperationalDeliveryDeadline,
} from '../utils/delivery-deadline.js';

interface HistoryRow extends RowDataPacket {
  order_id: string;
  status: OrderStatus;
  updated_by: string;
  comment: string | null;
  lat: number | null;
  lng: number | null;
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
  seller_name: string | null;
}

async function loadHistoryForOrders(orderIds: string[]): Promise<Map<string, OrderHistoryEvent[]>> {
  const map = new Map<string, OrderHistoryEvent[]>();
  if (orderIds.length === 0) return map;

  const placeholders = orderIds.map(() => '?').join(',');
  const [rows] = await pool.query<HistoryRow[]>(
    `SELECT order_id, status, updated_by, comment, lat, lng, created_at
     FROM order_history WHERE order_id IN (${placeholders}) ORDER BY created_at ASC`,
    orderIds
  );

  for (const row of rows) {
    const list = map.get(row.order_id) ?? [];
    const event: OrderHistoryEvent = {
      status: row.status,
      timestamp: new Date(row.created_at).toISOString(),
      updatedBy: row.updated_by,
      comment: row.comment ?? undefined,
    };
    if (row.lat != null && row.lng != null) {
      event.lat = Number(row.lat);
      event.lng = Number(row.lng);
    }
    list.push(event);
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
    agencyId: row.agency_id ?? null,
    sellerId: row.seller_id ?? null,
    sellerName: row.seller_name ?? null,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    address: row.address,
    lat: Number(row.lat),
    lng: Number(row.lng),
    status: row.status,
    archived: Boolean(row.archived),
    repartidorId: row.repartidor_id,
    repartidorName: row.repartidor_name,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    deliveryDeadline: row.delivery_deadline
      ? new Date(row.delivery_deadline).toISOString()
      : undefined,
    notes: row.notes ?? undefined,
    externalSource: row.external_source ?? null,
    externalOrderId: row.external_order_id ?? null,
    shippingType: row.shipping_type ?? null,
    mlShipmentStatus: row.ml_shipment_status ?? null,
    mlShipmentSubstatus: row.ml_shipment_substatus ?? null,
    history,
    locationHistory,
  };
}

const ORDER_SELECT = `
  SELECT o.id, o.agency_id, o.seller_id, o.external_source, o.external_order_id, o.shipping_type,
         o.client_name, o.client_phone, o.address, o.lat, o.lng,
         o.status, o.archived, o.repartidor_id, o.notes, o.created_at, o.updated_at, o.delivery_deadline,
         o.ml_shipment_status, o.ml_shipment_substatus,
         r.name AS repartidor_name,
         s.name AS seller_name
  FROM orders o
  LEFT JOIN users r ON r.id = o.repartidor_id
  LEFT JOIN users s ON s.id = o.seller_id
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

function belongsToUserAgency(user: User, agencyId: string | null | undefined): boolean {
  return !!user.agencyId && user.agencyId === agencyId;
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
  } else if (isAgencyAdmin(user.role)) {
    if (!user.agencyId) {
      return [];
    }
    [rows] = await pool.query<OrderWithRepartidorRow[]>(
      `${ORDER_SELECT} WHERE o.agency_id = ? ORDER BY o.created_at DESC`,
      [user.agencyId]
    );
  } else {
    [rows] = await pool.query<OrderWithRepartidorRow[]>(
      `${ORDER_SELECT} WHERE (o.repartidor_id = ? OR (o.status = ? AND o.agency_id <=> ?)) AND o.archived = 0 ORDER BY o.created_at DESC`,
      [user.id, OrderStatus.PENDING, user.agencyId ?? null]
    );
  }

  return enrichOrders(rows);
}

export function canViewOrder(user: User, order: Order, sellerId?: string | null): boolean {
  if (isAgencyAdmin(user.role)) return belongsToUserAgency(user, order.agencyId);
  if (user.role === UserRole.STORE_ADMIN) return sellerId === user.id;
  if (user.role === UserRole.REPARTIDOR) {
    return (
      order.repartidorId === user.id ||
      (order.status === OrderStatus.PENDING && belongsToUserAgency(user, order.agencyId))
    );
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

async function generateNextOrderId(): Promise<string> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT CAST(SUBSTRING(id, 5) AS UNSIGNED) AS n
     FROM orders
     WHERE id REGEXP '^PED-[0-9]+$'
     ORDER BY n DESC
     LIMIT 1`
  );
  const lastNum = Number(rows[0]?.n ?? 2000);
  return `PED-${lastNum + 1}`;
}

export async function createOrder(
  user: User,
  data: {
    clientName: string;
    clientPhone?: string;
    address: string;
    lat: number;
    lng: number;
    notes?: string;
    sellerId?: string;
    externalSource?: string;
    externalOrderId?: string;
    shippingType?: string;
    historyComment?: string;
    historyLat?: number;
    historyLng?: number;
    deliveryDeadline?: Date;
  }
): Promise<Order> {
  const newId = await generateNextOrderId();
  const now = new Date();
  const deliveryDeadline = data.deliveryDeadline ?? computeDeliveryDeadline(now);

  let sellerId: string | null = null;
  let agencyId: string | null = null;
  if (user.role === UserRole.STORE_ADMIN) {
    sellerId = user.id;
    const seller = await getUserById(user.id);
    agencyId = seller?.agencyId ?? null;
    if (!agencyId) {
      throw new Error('SELLER_NO_AGENCY');
    }
  } else if (isAgencyAdmin(user.role)) {
    agencyId = user.agencyId ?? null;
    if (!agencyId) {
      throw new Error('FORBIDDEN');
    }
    if (data.sellerId) {
      const seller = await assertSellerInAgency(data.sellerId, agencyId);
      sellerId = seller.id;
    }
  } else if (user.role === UserRole.REPARTIDOR) {
    agencyId = user.agencyId ?? null;
    if (!agencyId || !data.externalSource || !data.externalOrderId) {
      throw new Error('FORBIDDEN');
    }
    if (data.sellerId) {
      const seller = await assertSellerInAgency(data.sellerId, agencyId);
      sellerId = seller.id;
    }
  } else {
    throw new Error('FORBIDDEN');
  }

  if (data.externalSource && data.externalOrderId) {
    if (sellerId) {
      const existing = await findOrderByExternal(sellerId, data.externalSource, data.externalOrderId);
      if (existing) throw new Error('EXTERNAL_ORDER_EXISTS');
    } else if (agencyId) {
      const existing = await findOrderByExternalForAgency(
        agencyId,
        data.externalSource,
        data.externalOrderId
      );
      if (existing) throw new Error('EXTERNAL_ORDER_EXISTS');
    }
  }

  await pool.query(
    `INSERT INTO orders (id, agency_id, seller_id, external_source, external_order_id, shipping_type,
       client_name, client_phone, address, lat, lng, status, repartidor_id, notes, created_at, updated_at, delivery_deadline)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    [
      newId,
      agencyId,
      sellerId,
      data.externalSource ?? null,
      data.externalOrderId ?? null,
      data.shippingType ?? null,
      data.clientName,
      data.clientPhone ?? '',
      data.address,
      data.lat,
      data.lng,
      OrderStatus.PENDING,
      data.notes ?? '',
      now,
      now,
      deliveryDeadline,
    ]
  );

  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      newId,
      OrderStatus.PENDING,
      user.name,
      data.historyComment ?? (sellerId ? '' : 'Envío registrado sin vendedor asignado'),
      data.historyLat ?? null,
      data.historyLng ?? null,
      now,
    ]
  );

  const order = await getOrderById(newId);
  if (!order) throw new Error('No se pudo crear el pedido');
  return order;
}

export async function findOrderByExternal(
  sellerId: string,
  externalSource: string,
  externalOrderId: string
): Promise<Order | null> {
  const [rows] = await pool.query<OrderWithRepartidorRow[]>(
    `${ORDER_SELECT} WHERE o.seller_id = ? AND o.external_source = ? AND o.external_order_id = ? LIMIT 1`,
    [sellerId, externalSource, externalOrderId]
  );
  if (!rows[0]) return null;
  const orders = await enrichOrders([rows[0]]);
  return orders[0] ?? null;
}

export async function findOrderByExternalGlobal(
  externalSource: string,
  externalOrderId: string
): Promise<Order | null> {
  const [rows] = await pool.query<OrderWithRepartidorRow[]>(
    `${ORDER_SELECT} WHERE o.external_source = ? AND o.external_order_id = ? LIMIT 1`,
    [externalSource, externalOrderId]
  );
  if (!rows[0]) return null;
  const orders = await enrichOrders([rows[0]]);
  return orders[0] ?? null;
}

/** Busca un pedido ML por ID de envío o número de venta (en notas). */
export async function findMercadoLibreOrderByPublicRef(ref: string): Promise<Order | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8) return null;

  const candidates = [...new Set([trimmed, digits])];
  for (const candidate of candidates) {
    const byShipment = await findOrderByExternalGlobal('mercadolibre', candidate);
    if (byShipment) return byShipment;
  }

  const [rows] = await pool.query<OrderWithRepartidorRow[]>(
    `${ORDER_SELECT} WHERE o.external_source = 'mercadolibre' AND o.notes LIKE ? LIMIT 1`,
    [`%Orden #${digits}%`]
  );
  if (!rows[0]) return null;
  const orders = await enrichOrders([rows[0]]);
  return orders[0] ?? null;
}

export async function findOrderByExternalForAgency(
  agencyId: string,
  externalSource: string,
  externalOrderId: string
): Promise<Order | null> {
  const [rows] = await pool.query<OrderWithRepartidorRow[]>(
    `${ORDER_SELECT} WHERE o.agency_id = ? AND o.external_source = ? AND o.external_order_id = ? LIMIT 1`,
    [agencyId, externalSource, externalOrderId]
  );
  if (!rows[0]) return null;
  const orders = await enrichOrders([rows[0]]);
  return orders[0] ?? null;
}

/** Pedidos ML Flex abiertos de la agencia (para re-chequear assignment del courier). */
export async function listOpenMercadoLibreOrdersForAgency(
  agencyId: string,
  limit = 40
): Promise<Order[]> {
  const [rows] = await pool.query<OrderWithRepartidorRow[]>(
    `${ORDER_SELECT}
     WHERE o.agency_id = ?
       AND o.external_source = 'mercadolibre'
       AND o.external_order_id IS NOT NULL
       AND o.archived = 0
       AND o.status IN (?, ?, ?)
     ORDER BY o.updated_at DESC
     LIMIT ?`,
    [agencyId, OrderStatus.PENDING, OrderStatus.ASSIGNED, OrderStatus.DELIVERING, limit]
  );
  return enrichOrders(rows);
}

export function assertOrderAccessibleForLabelScan(user: User, order: Order): void {
  if (isAgencyAdmin(user.role) || user.role === UserRole.REPARTIDOR) {
    if (!belongsToUserAgency(user, order.agencyId)) {
      throw new Error('NOT_FOUND');
    }
    return;
  }
  throw new Error('FORBIDDEN');
}

/** Registra un escaneo de etiqueta ML en la bitácora del pedido (primer alta o re-escaneo). */
export async function recordMercadoLibreLabelScan(
  user: User,
  orderId: string,
  externalOrderId: string,
  options?: { isFirstImport?: boolean; sellerName?: string; lat?: number; lng?: number }
): Promise<Order> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error('NOT_FOUND');

  assertOrderAccessibleForLabelScan(user, order);

  const now = new Date();
  const comment = options?.isFirstImport
    ? options.sellerName
      ? `Etiqueta ML #${externalOrderId} escaneada en colecta (${options.sellerName})`
      : `Etiqueta ML #${externalOrderId} escaneada — pedido registrado`
    : `Etiqueta ML #${externalOrderId} re-escaneada`;

  const lat = options?.lat ?? null;
  const lng = options?.lng ?? null;

  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orderId, order.status, user.name, comment, lat, lng, now]
  );
  await pool.query('UPDATE orders SET updated_at = ? WHERE id = ?', [now, orderId]);

  const refreshed = await getOrderById(orderId);
  if (!refreshed) throw new Error('NOT_FOUND');
  return refreshed;
}

/** Registra un evento de ML en la bitácora sin cambiar el estado del pedido. */
export async function appendOrderMarketplaceComment(
  orderId: string,
  comment: string
): Promise<Order | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;

  const now = new Date();
  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
    [orderId, order.status, 'Mercado Libre', comment, now]
  );
  await pool.query('UPDATE orders SET updated_at = ? WHERE id = ?', [now, orderId]);
  return getOrderById(orderId);
}

/** Actualiza el corte de entrega si ML promete otro día operativo. */
export async function updateOrderDeliveryDeadlineIfNeeded(
  orderId: string,
  newDeadline: Date,
  comment?: string
): Promise<Order | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;

  const current = order.deliveryDeadline ? new Date(order.deliveryDeadline) : null;
  if (current && getOperationalDateKey(current) === getOperationalDateKey(newDeadline)) {
    return null;
  }

  const now = new Date();
  await pool.query('UPDATE orders SET delivery_deadline = ?, updated_at = ? WHERE id = ?', [
    newDeadline,
    now,
    orderId,
  ]);
  if (comment) {
    await pool.query(
      `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
      [orderId, order.status, 'Mercado Libre', comment, now]
    );
  }
  return getOrderById(orderId);
}

/** Persiste el último status/substatus de envío ML Flex en el pedido. */
export async function updateOrderMlShipmentMeta(
  orderId: string,
  mlStatus: string | null | undefined,
  mlSubstatus: string | null | undefined
): Promise<Order | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;

  const status = mlStatus?.trim().toLowerCase() || null;
  const substatus = mlSubstatus?.trim().toLowerCase() || null;
  if (
    (order.mlShipmentStatus ?? null) === status &&
    (order.mlShipmentSubstatus ?? null) === substatus
  ) {
    return order;
  }

  const now = new Date();
  await pool.query(
    'UPDATE orders SET ml_shipment_status = ?, ml_shipment_substatus = ?, updated_at = ? WHERE id = ?',
    [status, substatus, now, orderId]
  );
  return getOrderById(orderId);
}

/**
 * Pasa el pedido al siguiente día operativo (o al deadline ML si es más tarde).
 * Usado cuando el comprador estuvo ausente / hay que reprogramar.
 * No vuelve a empujar si el pedido ya está en un día futuro.
 */
export async function rescheduleOrderToNextOperationalDay(
  orderId: string,
  preferredDeadline?: Date | null,
  reason = 'Reprogramado para el día siguiente'
): Promise<Order | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;
  if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
    return order;
  }

  const todayKey = getOperationalDateKey(new Date());
  const base = order.deliveryDeadline
    ? new Date(order.deliveryDeadline)
    : new Date(order.createdAt);
  const currentKey = getOperationalDateKey(base);

  // Ya reprogramado a un día futuro → no seguir corriendo el deadline ni spamear bitácora
  if (currentKey > todayKey) {
    return null;
  }

  const fallback = nextOperationalDeliveryDeadline(new Date());
  const preferred =
    preferredDeadline && !Number.isNaN(preferredDeadline.getTime()) ? preferredDeadline : null;

  let target = fallback;
  if (preferred) {
    const preferredKey = getOperationalDateKey(preferred);
    const fallbackKey = getOperationalDateKey(fallback);
    if (preferredKey >= fallbackKey) {
      target = preferred;
    }
  }

  // Si el target no mueve el día, no escribir nada
  if (getOperationalDateKey(target) <= currentKey) {
    return null;
  }

  return updateOrderDeliveryDeadlineIfNeeded(orderId, target, `Mercado Libre Flex: ${reason}`);
}

export async function updateOrderStatusFromMarketplace(
  orderId: string,
  status: OrderStatus,
  comment: string
): Promise<Order | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;

  if (order.status === status) return order;
  if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
    return order;
  }

  const now = new Date();
  await pool.query('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', [
    status,
    now,
    orderId,
  ]);

  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
    [orderId, status, 'Mercado Libre', comment, now]
  );

  return getOrderById(orderId);
}

/** Asigna un pedido pendiente al repartidor que escaneó en Flex (webhook ML). */
export async function assignOrderToRepartidorFromMarketplace(
  orderId: string,
  repartidorId: string,
  comment: string
): Promise<Order | null> {
  const repartidor = await getRepartidorById(repartidorId);
  if (!repartidor) return null;
  try {
    return await assignOrderToScanningRepartidor(repartidor, orderId, comment);
  } catch {
    return getOrderById(orderId);
  }
}

/**
 * Asigna (o reasigna) un pedido al repartidor que escaneó en Mercado Envíos Flex.
 * Varios repartidores pueden escanear la misma etiqueta; gana el último escaneo.
 */
export async function assignOrderToScanningRepartidor(
  repartidor: User,
  orderId: string,
  comment = 'Asignado por escaneo de etiqueta ML'
): Promise<Order> {
  if (repartidor.role !== UserRole.REPARTIDOR) {
    const existing = await getOrderById(orderId);
    if (!existing) throw new Error('NOT_FOUND');
    return existing;
  }

  const order = await getOrderById(orderId);
  if (!order) throw new Error('NOT_FOUND');
  if (!belongsToUserAgency(repartidor, order.agencyId)) throw new Error('NOT_AVAILABLE');

  if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
    return order;
  }

  if (order.repartidorId === repartidor.id) {
    return order;
  }

  if (
    order.status !== OrderStatus.PENDING &&
    order.status !== OrderStatus.ASSIGNED &&
    order.status !== OrderStatus.DELIVERING
  ) {
    return order;
  }

  const now = new Date();
  await pool.query(
    'UPDATE orders SET status = ?, repartidor_id = ?, updated_at = ? WHERE id = ?',
    [OrderStatus.ASSIGNED, repartidor.id, now, orderId]
  );
  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
    [orderId, OrderStatus.ASSIGNED, repartidor.name, comment, now]
  );

  const updated = await getOrderById(orderId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}

/** Aplica estado y repartidor sincronizados desde Mercado Libre (importación / webhook). */
export async function applyMercadoLibreSyncState(
  orderId: string,
  options: {
    status: OrderStatus;
    repartidorId?: string | null;
    comment: string;
  }
): Promise<Order | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;
  if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
    return order;
  }

  let repartidorId = order.repartidorId;
  if (options.repartidorId) {
    const repartidor = await getRepartidorById(options.repartidorId);
    if (repartidor && repartidor.agencyId === order.agencyId) {
      repartidorId = options.repartidorId;
    }
  }

  const statusChanged = order.status !== options.status;
  const repartidorChanged = order.repartidorId !== repartidorId;
  if (!statusChanged && !repartidorChanged) {
    return order;
  }

  const now = new Date();
  await pool.query(
    'UPDATE orders SET status = ?, repartidor_id = ?, updated_at = ? WHERE id = ?',
    [options.status, repartidorId, now, orderId]
  );
  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
    [orderId, options.status, 'Mercado Libre', options.comment, now]
  );

  const updated = await getOrderById(orderId);
  if (
    updated &&
    statusChanged &&
    options.status === OrderStatus.DELIVERED
  ) {
    const { chargeOrderOnDelivery } = await import('./billing.service.js');
    await chargeOrderOnDelivery(updated).catch((err) => {
      console.warn('[billing] No se pudo facturar envío ML entregado:', err);
    });
  }

  return updated;
}

export async function assignOrderToSeller(
  user: User,
  orderId: string,
  sellerId: string
): Promise<Order> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) {
    throw new Error('FORBIDDEN');
  }

  const order = await getOrderById(orderId);
  if (!order) throw new Error('NOT_FOUND');
  if (!belongsToUserAgency(user, order.agencyId)) {
    throw new Error('NOT_FOUND');
  }
  if (order.status !== OrderStatus.PENDING) {
    throw new Error('ORDER_NOT_PENDING');
  }

  const seller = await assertSellerInAgency(sellerId, user.agencyId);

  const now = new Date();
  await pool.query('UPDATE orders SET seller_id = ?, agency_id = ?, updated_at = ? WHERE id = ?', [
    sellerId,
    seller.agencyId,
    now,
    orderId,
  ]);

  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
    [orderId, OrderStatus.PENDING, user.name, `Asignado al vendedor ${seller.name}`, now]
  );

  const updated = await getOrderById(orderId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
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
      if (!belongsToUserAgency(user, order.agencyId)) throw new Error('NOT_AVAILABLE');
      assignedRepartidorId = user.id;
      assignedRepartidorName = user.name;
    } else if (order.repartidorId !== user.id) {
      throw new Error('FORBIDDEN');
    }
  } else if (status === OrderStatus.PENDING && isAgencyAdmin(user.role)) {
    if (order.status !== OrderStatus.ASSIGNED) {
      throw new Error('CANNOT_UNASSIGN');
    }
    assignedRepartidorId = null;
    assignedRepartidorName = null;
  } else if (status === OrderStatus.ASSIGNED) {
    if (!repartidorId) throw new Error('REPARTIDOR_REQUIRED');
    const rep = await getRepartidorById(repartidorId);
    if (!rep) throw new Error('REPARTIDOR_NOT_FOUND');
    if (isAgencyAdmin(user.role) && user.agencyId && rep.agencyId !== user.agencyId) {
      throw new Error('REPARTIDOR_NOT_FOUND');
    }
    assignedRepartidorId = rep.id;
    assignedRepartidorName = rep.name;
  }

  if (
    user.role === UserRole.REPARTIDOR &&
    status === OrderStatus.DELIVERING &&
    assignedRepartidorId
  ) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM orders
       WHERE repartidor_id = ? AND status = ? AND id <> ?
       LIMIT 1`,
      [assignedRepartidorId, OrderStatus.DELIVERING, orderId]
    );
    if (rows.length > 0) {
      throw new Error('ALREADY_DELIVERING');
    }
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
    // Solo registrar punto inicial si el repartidor ya tiene GPS real (nunca usar el hub)
    if (assignedRepartidorId) {
      const rep = await getUserById(assignedRepartidorId);
      if (rep?.currentLocation) {
        await pool.query(
          `INSERT INTO order_location_history (order_id, lat, lng, created_at) VALUES (?, ?, ?, ?)`,
          [orderId, rep.currentLocation.lat, rep.currentLocation.lng, now]
        );
      }
    }
  }

  const updated = await getOrderById(orderId);
  if (!updated) throw new Error('NOT_FOUND');

  if (status === OrderStatus.DELIVERED) {
    const { chargeOrderOnDelivery } = await import('./billing.service.js');
    await chargeOrderOnDelivery(updated).catch((err) => {
      console.warn('[billing] No se pudo facturar envío entregado:', err);
    });
  }

  return {
    ...updated,
    repartidorId: assignedRepartidorId,
    repartidorName: assignedRepartidorName,
  };
}

/** Registra una incidencia en la bitácora sin cambiar el estado del pedido. */
export async function addOrderIncident(
  user: User,
  orderId: string,
  comment: string
): Promise<Order> {
  const trimmed = comment.trim();
  if (!trimmed) throw new Error('COMMENT_REQUIRED');

  const order = await getOrderById(orderId);
  if (!order) throw new Error('NOT_FOUND');

  const sellerId = await getSellerIdForOrder(orderId);
  if (!canViewOrder(user, order, sellerId)) throw new Error('FORBIDDEN');
  if (user.role === UserRole.REPARTIDOR && order.repartidorId !== user.id) {
    throw new Error('FORBIDDEN');
  }

  const now = new Date();
  const incidentComment = `INCIDENCIA: ${trimmed}`;

  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
    [orderId, order.status, user.name, incidentComment, now]
  );
  await pool.query('UPDATE orders SET updated_at = ? WHERE id = ?', [now, orderId]);

  const updated = await getOrderById(orderId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}

export async function reportOrderLocation(
  user: User,
  orderId: string,
  lat: number,
  lng: number,
  recordedAt?: string
): Promise<{
  success: boolean;
  orderStatus: OrderStatus;
  orderId: string;
  sellerId: string | null;
  point: LocationHistoryPoint;
}> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error('NOT_FOUND');
  if (order.repartidorId !== user.id) throw new Error('FORBIDDEN');

  const when = recordedAt ? new Date(recordedAt) : new Date();
  const timestamp = when.toISOString();
  await updateUserLocation(user.id, lat, lng, when);

  const point: LocationHistoryPoint = { lat, lng, timestamp };

  if (order.status === OrderStatus.DELIVERING) {
    await pool.query(
      `INSERT INTO order_location_history (order_id, lat, lng, created_at) VALUES (?, ?, ?, ?)`,
      [orderId, lat, lng, when]
    );
    await pool.query('UPDATE orders SET updated_at = ? WHERE id = ?', [when, orderId]);
  }

  const sellerId = await getSellerIdForOrder(orderId);

  return {
    success: true,
    orderStatus: order.status,
    orderId,
    sellerId,
    point,
  };
}

export async function reportOrderLocationsBatch(
  user: User,
  orderId: string,
  points: { lat: number; lng: number; timestamp: string }[]
): Promise<{
  success: boolean;
  orderStatus: OrderStatus;
  orderId: string;
  sellerId: string | null;
  point: LocationHistoryPoint;
  points: LocationHistoryPoint[];
}> {
  if (points.length === 0) throw new Error('EMPTY');

  const order = await getOrderById(orderId);
  if (!order) throw new Error('NOT_FOUND');
  if (order.repartidorId !== user.id) throw new Error('FORBIDDEN');

  const sorted = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const last = sorted[sorted.length - 1];
  const lastWhen = new Date(last.timestamp);

  await updateUserLocation(user.id, last.lat, last.lng, lastWhen);

  const historyPoints: LocationHistoryPoint[] = sorted.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    timestamp: new Date(p.timestamp).toISOString(),
  }));

  if (order.status === OrderStatus.DELIVERING) {
    for (const p of sorted) {
      await pool.query(
        `INSERT INTO order_location_history (order_id, lat, lng, created_at) VALUES (?, ?, ?, ?)`,
        [orderId, p.lat, p.lng, new Date(p.timestamp)]
      );
    }
    await pool.query('UPDATE orders SET updated_at = ? WHERE id = ?', [lastWhen, orderId]);
  }

  const sellerId = await getSellerIdForOrder(orderId);
  const point: LocationHistoryPoint = {
    lat: last.lat,
    lng: last.lng,
    timestamp: lastWhen.toISOString(),
  };

  return {
    success: true,
    orderStatus: order.status,
    orderId,
    sellerId,
    point,
    points: historyPoints,
  };
}

export async function listDeliveringOrders(): Promise<Order[]> {
  const [rows] = await pool.query<OrderWithRepartidorRow[]>(
    `${ORDER_SELECT} WHERE o.status = ? ORDER BY o.updated_at DESC`,
    [OrderStatus.DELIVERING]
  );
  return enrichOrders(rows);
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
    let lastPoint: LocationHistoryPoint | null =
      order.locationHistory.length > 0
        ? order.locationHistory[order.locationHistory.length - 1]
        : null;

    if (!lastPoint && order.repartidorId) {
      const rep = await getUserById(order.repartidorId);
      if (rep?.currentLocation) {
        lastPoint = rep.currentLocation;
      }
    }

    if (!lastPoint) continue;

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

export async function deleteOrder(user: User, orderId: string): Promise<{ sellerId: string | null }> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error('NOT_FOUND');

  if (isAgencyAdmin(user.role)) {
    if (!belongsToUserAgency(user, order.agencyId)) throw new Error('FORBIDDEN');
  } else if (user.role === UserRole.STORE_ADMIN) {
    if (order.sellerId !== user.id) throw new Error('FORBIDDEN');
    if (order.status !== OrderStatus.PENDING) throw new Error('ORDER_NOT_DELETABLE');
  } else {
    throw new Error('FORBIDDEN');
  }

  await pool.query('DELETE FROM orders WHERE id = ?', [orderId]);
  return { sellerId: order.sellerId };
}

export async function archiveAllFinishedOrders(
  user: User
): Promise<{ archived: number; orderIds: string[] }> {
  const now = new Date();

  if (user.role === UserRole.STORE_ADMIN) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM orders
       WHERE seller_id = ? AND archived = 0 AND status IN (?, ?)`,
      [user.id, OrderStatus.DELIVERED, OrderStatus.CANCELLED]
    );
    const orderIds = rows.map((r) => String(r.id));
    if (orderIds.length === 0) {
      return { archived: 0, orderIds: [] };
    }
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE orders SET archived = 1, updated_at = ?
       WHERE seller_id = ? AND archived = 0 AND status IN (?, ?)`,
      [now, user.id, OrderStatus.DELIVERED, OrderStatus.CANCELLED]
    );
    return { archived: result.affectedRows, orderIds };
  }

  if (isAgencyAdmin(user.role)) {
    if (!user.agencyId) throw new Error('FORBIDDEN');
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM orders
       WHERE agency_id = ? AND archived = 0 AND status IN (?, ?)`,
      [user.agencyId, OrderStatus.DELIVERED, OrderStatus.CANCELLED]
    );
    const orderIds = rows.map((r) => String(r.id));
    if (orderIds.length === 0) {
      return { archived: 0, orderIds: [] };
    }
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE orders SET archived = 1, updated_at = ?
       WHERE agency_id = ? AND archived = 0 AND status IN (?, ?)`,
      [now, user.agencyId, OrderStatus.DELIVERED, OrderStatus.CANCELLED]
    );
    return { archived: result.affectedRows, orderIds };
  }

  throw new Error('FORBIDDEN');
}

export async function setOrderArchived(
  user: User,
  orderId: string,
  archived: boolean
): Promise<Order> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error('NOT_FOUND');

  if (isAgencyAdmin(user.role)) {
    if (!belongsToUserAgency(user, order.agencyId)) throw new Error('FORBIDDEN');
  } else if (user.role === UserRole.STORE_ADMIN) {
    if (order.sellerId !== user.id) throw new Error('FORBIDDEN');
  } else {
    throw new Error('FORBIDDEN');
  }

  if (archived) {
    if (order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.CANCELLED) {
      throw new Error('ORDER_NOT_ARCHIVABLE');
    }
  }

  const now = new Date();
  await pool.query('UPDATE orders SET archived = ?, updated_at = ? WHERE id = ?', [
    archived ? 1 : 0,
    now,
    orderId,
  ]);

  const updated = await getOrderById(orderId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}
