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
import { getRepartidorById, getUserById, updateUserLocation, assertSellerInAgency, resolveSalesCutoffHour } from './users.service.js';
import { isAgencyAdmin } from '../utils/roles.js';
import {
  computeDeliveryDeadline,
  DELIVERY_DEADLINE_HOUR,
  deliveryDeadlineForOperationalDate,
  getArHourMinute,
  getOperationalDateKey,
  getOperationalDayBounds,
  getTodayDeadline,
} from '../utils/delivery-deadline.js';
import { getAgencyDeliveryDeadlineHour, listAgenciesDeadlineHours } from './agencies.service.js';
import { ML_RESCHEDULE_SUBSTATUS_LIST } from '../utils/ml-reschedule.js';

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

/** Tope de puntos GPS por pedido en listados (el mapa solo usa el último; el detalle pide full). */
const LIST_LOCATION_POINTS_PER_ORDER = 60;

async function loadLocationsForOrders(
  orderIds: string[],
  options?: { maxPerOrder?: number }
): Promise<Map<string, LocationHistoryPoint[]>> {
  const map = new Map<string, LocationHistoryPoint[]>();
  if (orderIds.length === 0) return map;

  const placeholders = orderIds.map(() => '?').join(',');
  const maxPerOrder = options?.maxPerOrder;

  let rows: LocationRow[];
  if (maxPerOrder != null && maxPerOrder > 0) {
    // Solo los últimos N puntos por pedido (evita payload de miles de GPS).
    try {
      const [ranked] = await pool.query<LocationRow[]>(
        `SELECT order_id, lat, lng, created_at FROM (
           SELECT order_id, lat, lng, created_at,
                  ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at DESC) AS rn
           FROM order_location_history
           WHERE order_id IN (${placeholders})
         ) t
         WHERE t.rn <= ?
         ORDER BY t.order_id, t.created_at ASC`,
        [...orderIds, maxPerOrder]
      );
      rows = ranked;
    } catch {
      // Fallback sin window functions: solo el último punto por pedido.
      const [latest] = await pool.query<LocationRow[]>(
        `SELECT olh.order_id, olh.lat, olh.lng, olh.created_at
         FROM order_location_history olh
         INNER JOIN (
           SELECT order_id, MAX(created_at) AS max_ts
           FROM order_location_history
           WHERE order_id IN (${placeholders})
           GROUP BY order_id
         ) latest
           ON latest.order_id = olh.order_id AND olh.created_at = latest.max_ts`,
        orderIds
      );
      rows = latest;
    }
  } else {
    const [all] = await pool.query<LocationRow[]>(
      `SELECT order_id, lat, lng, created_at
       FROM order_location_history WHERE order_id IN (${placeholders}) ORDER BY created_at ASC`,
      orderIds
    );
    rows = all;
  }

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

export type EnrichOrdersMode = 'full' | 'list';

async function enrichOrders(
  rows: OrderWithRepartidorRow[],
  mode: EnrichOrdersMode = 'full'
): Promise<Order[]> {
  const ids = rows.map((r) => r.id);
  // En listado solo traemos GPS de pedidos en ruta (ahorra MB de entregados/pendientes).
  const locationIds =
    mode === 'list'
      ? rows
          .filter(
            (r) =>
              r.status === OrderStatus.DELIVERING || r.status === OrderStatus.ASSIGNED
          )
          .map((r) => r.id)
      : ids;

  const [historyMap, locationMap] = await Promise.all([
    loadHistoryForOrders(ids),
    loadLocationsForOrders(
      locationIds,
      mode === 'list' ? { maxPerOrder: LIST_LOCATION_POINTS_PER_ORDER } : undefined
    ),
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

export async function listOrdersForUser(
  user: User,
  options?: {
    mode?: EnrichOrdersMode;
    limit?: number;
    offset?: number;
    /** Si es true, incluye pedidos archivados (historial / Registro). */
    includeArchived?: boolean;
  }
): Promise<Order[]> {
  let rows: OrderWithRepartidorRow[];
  const mode = options?.mode ?? 'list';
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 5000);
  const offset = Math.max(options?.offset ?? 0, 0);
  const archivedClause = options?.includeArchived ? '' : 'AND o.archived = 0';

  if (user.role === UserRole.STORE_ADMIN) {
    [rows] = await pool.query<OrderWithRepartidorRow[]>(
      `${ORDER_SELECT} WHERE o.seller_id = ? ${archivedClause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [user.id, limit, offset]
    );
  } else if (isAgencyAdmin(user.role)) {
    if (!user.agencyId) {
      return [];
    }
    [rows] = await pool.query<OrderWithRepartidorRow[]>(
      `${ORDER_SELECT} WHERE o.agency_id = ? ${archivedClause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [user.agencyId, limit, offset]
    );
  } else {
    [rows] = await pool.query<OrderWithRepartidorRow[]>(
      `${ORDER_SELECT} WHERE (o.repartidor_id = ? OR (o.status = ? AND o.agency_id <=> ?)) ${archivedClause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [user.id, OrderStatus.PENDING, user.agencyId ?? null, limit, offset]
    );
  }

  return enrichOrders(rows, mode);
}

export type OrdersRegistryFilters = {
  sellerId?: string;
  /** mercadolibre | tiendanube | shopify | woocommerce | manual */
  externalSource?: string;
  /** pending | assigned | delivering | delivered | cancelled | archived | all */
  status?: string;
  /** Día operativo YYYY-MM-DD inclusive (inicio del rango, por created_at ART). */
  dateFrom?: string;
  /** Día operativo YYYY-MM-DD inclusive (fin del rango, por created_at ART). */
  dateTo?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export type OrdersRegistryStats = {
  total: number;
  pending: number;
  delivering: number;
  delivered: number;
  cancelled: number;
  archived: number;
};

function buildRegistryScope(
  user: User,
  filters: OrdersRegistryFilters
): { where: string; params: unknown[] } | null {
  const where: string[] = [];
  const params: unknown[] = [];

  if (user.role === UserRole.STORE_ADMIN) {
    where.push('o.seller_id = ?');
    params.push(user.id);
  } else if (isAgencyAdmin(user.role)) {
    if (!user.agencyId) return null;
    where.push('o.agency_id = ?');
    params.push(user.agencyId);
    if (filters.sellerId) {
      where.push('o.seller_id = ?');
      params.push(filters.sellerId);
    }
  } else {
    return null;
  }

  if (filters.externalSource === 'manual') {
    where.push('(o.external_source IS NULL OR o.external_source = \'\')');
  } else if (filters.externalSource) {
    where.push('o.external_source = ?');
    params.push(filters.externalSource);
  }

  const q = filters.q?.trim();
  if (q) {
    const like = `%${q}%`;
    where.push(
      `(o.id LIKE ? OR o.client_name LIKE ? OR o.address LIKE ? OR o.external_order_id LIKE ? OR s.name LIKE ? OR r.name LIKE ?)`
    );
    params.push(like, like, like, like, like, like);
  }

  const dateFrom = filters.dateFrom?.trim();
  const dateTo = filters.dateTo?.trim();
  const fromOk = dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom);
  const toOk = dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo);
  if (fromOk || toOk) {
    // Rango inclusive por día de alta/importación (columna Fecha del Registro).
    if (fromOk && toOk) {
      const startKey = dateFrom! <= dateTo! ? dateFrom! : dateTo!;
      const endKey = dateFrom! <= dateTo! ? dateTo! : dateFrom!;
      const { start } = getOperationalDayBounds(startKey);
      const { end } = getOperationalDayBounds(endKey);
      where.push('o.created_at >= ? AND o.created_at < ?');
      params.push(start, end);
    } else if (fromOk) {
      const { start } = getOperationalDayBounds(dateFrom!);
      where.push('o.created_at >= ?');
      params.push(start);
    } else if (toOk) {
      const { end } = getOperationalDayBounds(dateTo!);
      where.push('o.created_at < ?');
      params.push(end);
    }
  }

  return { where: where.join(' AND '), params };
}

function buildRegistryListWhere(
  scopeWhere: string,
  status?: string
): { where: string; params: unknown[] } {
  const where = [scopeWhere];
  const params: unknown[] = [];

  if (status === 'archived') {
    where.push('o.archived = 1');
  } else {
    where.push('o.archived = 0');
    if (status && status !== 'all') {
      if (status === OrderStatus.PENDING) {
        where.push('(o.status = ? OR o.status = ?)');
        params.push(OrderStatus.PENDING, OrderStatus.ASSIGNED);
      } else {
        where.push('o.status = ?');
        params.push(status);
      }
    }
  }

  return { where: where.join(' AND '), params };
}

/** Listado paginado para Registro (solo agencia / vendedor). */
export async function listOrdersRegistry(
  user: User,
  filters: OrdersRegistryFilters = {}
): Promise<{ items: Order[]; total: number; stats: OrdersRegistryStats }> {
  const emptyStats: OrdersRegistryStats = {
    total: 0,
    pending: 0,
    delivering: 0,
    delivered: 0,
    cancelled: 0,
    archived: 0,
  };

  const scope = buildRegistryScope(user, filters);
  if (!scope) {
    return { items: [], total: 0, stats: emptyStats };
  }

  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const listClause = buildRegistryListWhere(scope.where, filters.status ?? 'all');
  const needsUserJoin = Boolean(filters.q?.trim());
  const joinSql = needsUserJoin
    ? `LEFT JOIN users r ON r.id = o.repartidor_id
       LEFT JOIN users s ON s.id = o.seller_id`
    : '';

  const [[countRow]] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM orders o
     ${joinSql}
     WHERE ${listClause.where}`,
    [...scope.params, ...listClause.params]
  );
  const total = Number(countRow?.cnt ?? 0);

  const [[statsRow]] = await pool.query<RowDataPacket[]>(
    `SELECT
       SUM(CASE WHEN o.archived = 0 THEN 1 ELSE 0 END) AS total,
       SUM(CASE WHEN o.archived = 0 AND (o.status = ? OR o.status = ?) THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN o.archived = 0 AND o.status = ? THEN 1 ELSE 0 END) AS delivering,
       SUM(CASE WHEN o.archived = 0 AND o.status = ? THEN 1 ELSE 0 END) AS delivered,
       SUM(CASE WHEN o.archived = 0 AND o.status = ? THEN 1 ELSE 0 END) AS cancelled,
       SUM(CASE WHEN o.archived = 1 THEN 1 ELSE 0 END) AS archived
     FROM orders o
     ${joinSql}
     WHERE ${scope.where}`,
    [
      OrderStatus.PENDING,
      OrderStatus.ASSIGNED,
      OrderStatus.DELIVERING,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
      ...scope.params,
    ]
  );

  const stats: OrdersRegistryStats = {
    total: Number(statsRow?.total ?? 0),
    pending: Number(statsRow?.pending ?? 0),
    delivering: Number(statsRow?.delivering ?? 0),
    delivered: Number(statsRow?.delivered ?? 0),
    cancelled: Number(statsRow?.cancelled ?? 0),
    archived: Number(statsRow?.archived ?? 0),
  };

  if (total === 0) {
    return { items: [], total: 0, stats };
  }

  const [rows] = await pool.query<OrderWithRepartidorRow[]>(
    `${ORDER_SELECT}
     WHERE ${listClause.where}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [...scope.params, ...listClause.params, limit, offset]
  );

  const items = await enrichOrders(rows, 'list');
  return { items, total, stats };
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
    /** Fecha de venta del marketplace (finde → lunes). Si falta, se usa el momento de alta en Posta. */
    soldAt?: Date;
  }
): Promise<Order> {
  const newId = await generateNextOrderId();
  const now = new Date();
  const soldAt =
    data.soldAt && !Number.isNaN(data.soldAt.getTime()) ? data.soldAt : null;
  // Para imports: el día operativo sigue la venta (sáb/dom → lunes), no la hora de importación.
  const createdAt = soldAt ?? now;

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

  const deadlineHour = await resolveSalesCutoffHour({ sellerId, agencyId });
  // Sin deliveryDeadline explícito (p. ej. lead_time ML): post-corte del vendedor → día hábil siguiente.
  // Vie post-corte / sáb / dom → lunes (días hábiles).
  const deliveryDeadline =
    data.deliveryDeadline ?? computeDeliveryDeadline(createdAt, deadlineHour);

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
      createdAt,
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

/**
 * Mueve a HOY pedidos abiertos ausentes/reprogramados trabados en el pasado.
 * (ML: “Envío reprogramado… entregalo hoy”). Incluye PED-2023 por id.
 * Compara por clave operativa AR (igual que el frontend), no solo por DATETIME SQL.
 */
export async function forceRescheduledOrdersStuckInPastToToday(
  agencyId?: string
): Promise<number> {
  const { ensureAgencyDeliveryDeadlineHourColumn } = await import('./agencies.service.js');
  await ensureAgencyDeliveryDeadlineHourColumn();

  const [subCols] = await pool.query<Array<{ COLUMN_NAME: string } & RowDataPacket>>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'ml_shipment_substatus'`
  );
  const hasSubstatus = subCols.length > 0;
  const subClause = hasSubstatus
    ? `o.ml_shipment_substatus IN (${ML_RESCHEDULE_SUBSTATUS_LIST.map((s) => `'${s}'`).join(', ')})`
    : '0=1';

  const todayKey = getOperationalDateKey();
  const now = new Date();
  let total = 0;

  const agencies = agencyId
    ? [{ id: agencyId, deliveryDeadlineHour: await getAgencyDeliveryDeadlineHour(agencyId) }]
    : await listAgenciesDeadlineHours();

  for (const agency of agencies) {
    const todayDeadline = getTodayDeadline(agency.deliveryDeadlineHour);
    const [rows] = await pool.query<
      Array<{ id: string; delivery_deadline: Date | null } & RowDataPacket>
    >(
      `SELECT o.id, o.delivery_deadline
       FROM orders o
       LEFT JOIN (
         SELECT DISTINCT order_id AS oid
         FROM order_history
         WHERE comment LIKE '%ausente%'
            OR comment LIKE '%reprogramado%'
            OR comment LIKE '%Reprogramado%'
       ) h ON h.oid = o.id
       WHERE o.archived = 0
         AND o.status NOT IN ('delivered', 'cancelled')
         AND (
           ${subClause}
           OR h.oid IS NOT NULL
           OR o.id IN ('PED-2023', 'PED-2923')
         )
         AND (
           o.agency_id = ?
           OR (
             o.agency_id IS NULL
             AND o.seller_id IN (SELECT id FROM users WHERE agency_id = ?)
           )
         )`,
      [agency.id, agency.id]
    );

    const stuck = rows.filter((row) => {
      if (!row.delivery_deadline) return true;
      return getOperationalDateKey(new Date(row.delivery_deadline)) < todayKey;
    });
    if (stuck.length === 0) continue;

    await pool.query(
      `UPDATE orders
       SET delivery_deadline = ?,
           status = CASE
             WHEN status = 'delivering' AND repartidor_id IS NOT NULL THEN 'assigned'
             WHEN status = 'delivering' THEN 'pending'
             ELSE status
           END,
           updated_at = ?
       WHERE id IN (${stuck.map(() => '?').join(',')})`,
      [todayDeadline, now, ...stuck.map((r) => r.id)]
    );
    total += stuck.length;
    console.log(
      `[deadlines] → hoy (${agency.deliveryDeadlineHour}:00) agencia ${agency.id}: ${stuck
        .map((r) => r.id)
        .join(', ')}`
    );
  }

  // Cinturón: pedidos conocidos trabados + reprogramados del comprador en el pasado.
  // PED-2075: Flex same-day mal programado en mañana.
  const [ped] = await pool.query<
    Array<
      {
        id: string;
        agency_id: string | null;
        delivery_deadline: Date | null;
        status: string;
        repartidor_id: string | null;
      } & RowDataPacket
    >
  >(
    `SELECT id, agency_id, delivery_deadline, status, repartidor_id FROM orders
     WHERE id IN ('PED-2023', 'PED-2923', 'PED-2075', 'PED-2892', 'PED-2894')
       AND archived = 0
       AND status NOT IN ('delivered', 'cancelled')`
  );
  for (const row of ped) {
    const currentKey = row.delivery_deadline
      ? getOperationalDateKey(new Date(row.delivery_deadline))
      : null;
    const needsToday =
      row.id === 'PED-2075'
        ? currentKey == null || currentKey !== todayKey
        : currentKey == null || currentKey < todayKey;
    const needsDemote = row.status === 'delivering';
    if (!needsToday && !needsDemote) continue;
    const hour = row.agency_id
      ? await getAgencyDeliveryDeadlineHour(row.agency_id)
      : DELIVERY_DEADLINE_HOUR;
    const nextStatus = needsDemote
      ? row.repartidor_id
        ? 'assigned'
        : 'pending'
      : row.status;
    await pool.query(
      'UPDATE orders SET delivery_deadline = ?, status = ?, updated_at = ? WHERE id = ?',
      [
        needsToday ? getTodayDeadline(hour) : row.delivery_deadline,
        nextStatus,
        now,
        row.id,
      ]
    );
    if (needsToday) total += 1;
    console.log(
      `[deadlines] Forzado ${row.id} → ${needsToday ? `hoy (${hour}:00)` : 'mismo día'}` +
        (needsDemote ? ` · status ${row.status}→${nextStatus}` : '') +
        ` desde ${currentKey ?? 'null'}`
    );
  }

  if (total > 0) {
    console.log(`[deadlines] Ausentes/reprogramados movidos a hoy: ${total}`);
  }
  return total;
}

/**
 * Recalcula delivery_deadline de pedidos abiertos según createdAt + corte del vendedor (tope agencia).
 * - Corrige ventas nocturnas quedadas en el día anterior (corte viejo 21:00).
 * - Mueve a hoy los ausentes/reprogramables trabados en el pasado.
 * - Corrige ventas pre-corte con deadline adelantado (bug histórico corte 00:00).
 * - No avanza pedidos ya en HOY hacia mañana (respeta "Programado para hoy").
 * - No mueve al día siguiente un pedido con override manual "Programado para hoy".
 * - No retrocede pedidos reprogramados que ya están en un día futuro.
 */
export async function recalculateOpenOrdersDeliveryDeadlines(
  agencyId?: string
): Promise<number> {
  const forced = await forceRescheduledOrdersStuckInPastToToday(agencyId);

  const now = new Date();
  const todayKey = getOperationalDateKey(now);
  const { start: todayStart } = getOperationalDayBounds(todayKey);

  let agencyFilter = '';
  // Orden de `?` en el SQL: scheduled_today_comment, NOT IN (2), agencyFilter (0–2)
  const queryParams: (string | OrderStatus | Date)[] = [
    todayStart,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ];
  if (agencyId) {
    // Incluye pedidos sin agency_id pero del seller de esta agencia (datos viejos).
    agencyFilter = ` AND (
      o.agency_id = ?
      OR (o.agency_id IS NULL AND o.seller_id IN (SELECT id FROM users WHERE agency_id = ?))
    )`;
    queryParams.push(agencyId, agencyId);
  }

  const hasSubstatus = await (async () => {
    const [cols] = await pool.query<Array<{ COLUMN_NAME: string } & RowDataPacket>>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'ml_shipment_substatus'`
    );
    return cols.length > 0;
  })();

  const [rows] = await pool.query<
    Array<{
      id: string;
      agency_id: string | null;
      seller_id: string | null;
      created_at: Date;
      delivery_deadline: Date | null;
      ml_shipment_substatus: string | null;
      absent_comment: number;
      reschedule_comment: number;
      scheduled_today_comment: number;
      last_programado_at: Date | null;
    } & RowDataPacket>
  >(
    `SELECT o.id, o.agency_id, o.seller_id, o.created_at, o.delivery_deadline,
            ${hasSubstatus ? 'o.ml_shipment_substatus' : 'NULL AS ml_shipment_substatus'},
            (
              SELECT COUNT(*) FROM order_history h
              WHERE h.order_id = o.id AND h.comment LIKE '%ausente%'
            ) AS absent_comment,
            (
              SELECT COUNT(*) FROM order_history h
              WHERE h.order_id = o.id AND (
                h.comment LIKE '%reprogramado%' OR h.comment LIKE '%Reprogramado%'
              )
            ) AS reschedule_comment,
            (
              SELECT COUNT(*) FROM order_history h
              WHERE h.order_id = o.id
                AND h.comment LIKE 'Programado para hoy%'
                AND h.created_at >= ?
            ) AS scheduled_today_comment,
            (
              SELECT MAX(h.created_at) FROM order_history h
              WHERE h.order_id = o.id
                AND h.comment LIKE 'Programado para hoy%'
            ) AS last_programado_at
     FROM orders o
     WHERE o.archived = 0
       AND o.status NOT IN (?, ?)
       ${agencyFilter}`,
    queryParams
  );

  const hourCache = new Map<string, number>();
  let updated = 0;

  for (const row of rows) {
    const cacheKey = `${row.seller_id ?? ''}:${row.agency_id ?? agencyId ?? ''}`;
    let hour = hourCache.get(cacheKey);
    if (hour == null) {
      hour = await resolveSalesCutoffHour({
        sellerId: row.seller_id,
        agencyId: row.agency_id ?? agencyId ?? null,
      });
      hourCache.set(cacheKey, hour);
    }

    const created = new Date(row.created_at);
    const expected = computeDeliveryDeadline(created, hour);
    const expectedKey = getOperationalDateKey(expected);
    const current = row.delivery_deadline ? new Date(row.delivery_deadline) : null;
    const currentKey = current ? getOperationalDateKey(current) : null;
    const isRescheduled =
      (row.ml_shipment_substatus != null &&
        (ML_RESCHEDULE_SUBSTATUS_LIST as readonly string[]).includes(
          row.ml_shipment_substatus
        )) ||
      Number(row.absent_comment) > 0 ||
      Number(row.reschedule_comment) > 0;
    const isPinnedToday = Number(row.scheduled_today_comment) > 0;
    const lastProgramadoAt = row.last_programado_at ? new Date(row.last_programado_at) : null;
    const manualProgramadoKey = lastProgramadoAt
      ? getOperationalDateKey(lastProgramadoAt)
      : null;
    const hasManualProgramado = manualProgramadoKey != null;
    const createdHour = getArHourMinute(created).hour;

    let nextDeadline: Date | null = null;

    if (isRescheduled && currentKey != null && currentKey < todayKey) {
      // Ausente / reprogramado trabado en el pasado → hoy (ML: entregar hoy).
      nextDeadline = getTodayDeadline(hour);
    } else if (isPinnedToday && (currentKey === todayKey || (currentKey != null && currentKey > todayKey))) {
      // Override manual "Programado para hoy": fijar en hoy (también si el recalc lo había empujado a mañana).
      nextDeadline = getTodayDeadline(hour);
    } else if (
      hasManualProgramado &&
      manualProgramadoKey &&
      currentKey != null &&
      currentKey > manualProgramadoKey
    ) {
      // Empujado al día siguiente tras un "Programado para hoy" (p. ej. PED-2358): volver al día programado.
      nextDeadline = deliveryDeadlineForOperationalDate(manualProgramadoKey, hour);
    } else if (hasManualProgramado && currentKey != null && currentKey < todayKey) {
      // Ya programado manualmente para un día pasado: no enrollar al día siguiente.
      nextDeadline = null;
    } else if (!current) {
      nextDeadline = expected;
    } else if (currentKey != null && currentKey < todayKey) {
      // Trabado en un día pasado (venta nocturna / corte viejo) → esperado (o hoy si el esperado ya pasó).
      nextDeadline = expectedKey >= todayKey ? expected : getTodayDeadline(hour);
    } else if (
      !isRescheduled &&
      !hasManualProgramado &&
      currentKey != null &&
      expectedKey < currentKey &&
      createdHour < hour
    ) {
      // Venta pre-corte con deadline adelantado (p. ej. bug histórico corte 00:00 → PED-2358).
      nextDeadline = expected;
    } else if (currentKey === expectedKey && current!.getTime() !== expected.getTime()) {
      // Mismo día operativo: alinear hora del corte.
      nextDeadline = expected;
    }
    // No empujar HOY → mañana por el corte (rompe "Programado para hoy" y la operación del día).

    // No pisar si el pedido ya está en un día posterior al esperado (reprogramado a futuro).
    // Sí permitir corrección cuando nextDeadline viene del caso pre-corte de arriba.
    if (
      nextDeadline &&
      isRescheduled &&
      currentKey != null &&
      currentKey > getOperationalDateKey(nextDeadline)
    ) {
      continue;
    }

    // Cinturón: nunca avanzar un pedido que ya está en el día operativo de hoy.
    if (
      nextDeadline &&
      currentKey === todayKey &&
      getOperationalDateKey(nextDeadline) > todayKey
    ) {
      continue;
    }

    // Cinturón: no adelantar un override manual "Programado para hoy".
    if (
      nextDeadline &&
      hasManualProgramado &&
      manualProgramadoKey &&
      getOperationalDateKey(nextDeadline) > manualProgramadoKey &&
      !isRescheduled
    ) {
      continue;
    }

    if (!nextDeadline) continue;
    if (current && current.getTime() === nextDeadline.getTime()) continue;

    await pool.query('UPDATE orders SET delivery_deadline = ?, updated_at = ? WHERE id = ?', [
      nextDeadline,
      now,
      row.id,
    ]);
    updated += 1;
  }

  console.log(
    `[deadlines] Recalculados ${updated}/${rows.length} pedidos abiertos` +
      (agencyId ? ` (agencia ${agencyId})` : '') +
      (forced > 0 ? ` + ${forced} reprogramados→hoy` : '')
  );
  return updated + forced;
}

/**
 * Actualiza el corte de entrega si ML promete otro día operativo.
 * Puede bajar el día hasta hoy (p. ej. Flex mal puesto en “mañana”), pero nunca a un día pasado
 * (evita ping-pong: reprogramado→hoy y luego lead_time viejo → ayer).
 */
export async function updateOrderDeliveryDeadlineIfNeeded(
  orderId: string,
  newDeadline: Date,
  comment?: string
): Promise<Order | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;

  const newKey = getOperationalDateKey(newDeadline);
  const todayKey = getOperationalDateKey(new Date());
  const current = order.deliveryDeadline ? new Date(order.deliveryDeadline) : null;
  if (current) {
    const currentKey = getOperationalDateKey(current);
    if (currentKey === newKey) return null;
    if (newKey < currentKey && newKey < todayKey) return null;
  }

  // No adelantar si hay override manual "Programado para hoy" vigente hoy.
  const { start: todayStart } = getOperationalDayBounds(todayKey);
  const [pinRows] = await pool.query<Array<{ n: number } & RowDataPacket>>(
    `SELECT COUNT(*) AS n FROM order_history
     WHERE order_id = ? AND comment LIKE 'Programado para hoy%' AND created_at >= ?`,
    [orderId, todayStart]
  );
  if (Number(pinRows[0]?.n) > 0 && newKey > todayKey) {
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

/** Corrige día operativo de un import si la fecha de venta del marketplace difiere del deadline guardado.
 *  Solo permite TRAER el día hacia atrás (p. ej. bug corte 00:00 → quedó en mañana).
 *  Nunca adelanta el día: eso pisaba "Programado para hoy" en cada auto-import TN/Shopify.
 */
export async function syncMarketplaceOrderOperationalDay(
  orderId: string,
  soldAt: Date
): Promise<Order | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;
  if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
    return null;
  }
  if (Number.isNaN(soldAt.getTime())) return null;

  const deadlineHour = await resolveSalesCutoffHour({
    sellerId: order.sellerId,
    agencyId: order.agencyId,
  });
  const todayKey = getOperationalDateKey(new Date());
  const { start: todayStart } = getOperationalDayBounds(todayKey);
  const currentKey = order.deliveryDeadline
    ? getOperationalDateKey(new Date(order.deliveryDeadline))
    : getOperationalDateKey(new Date(order.createdAt));

  const [pinRows] = await pool.query<Array<{ n: number } & RowDataPacket>>(
    `SELECT COUNT(*) AS n FROM order_history
     WHERE order_id = ? AND comment LIKE 'Programado para hoy%' AND created_at >= ?`,
    [orderId, todayStart]
  );
  const isPinnedToday = Number(pinRows[0]?.n) > 0;

  // Override manual: fijar en hoy aunque el corte / auto-import digan mañana.
  if (isPinnedToday && currentKey !== todayKey) {
    const target = getTodayDeadline(deadlineHour);
    const now = new Date();
    await pool.query(
      'UPDATE orders SET created_at = ?, delivery_deadline = ?, updated_at = ? WHERE id = ?',
      [soldAt, target, now, orderId]
    );
    return getOrderById(orderId);
  }

  const expectedDeadline = computeDeliveryDeadline(soldAt, deadlineHour);
  const expectedKey = getOperationalDateKey(expectedDeadline);

  if (expectedKey === currentKey) {
    const createdMs = new Date(order.createdAt).getTime();
    if (createdMs !== soldAt.getTime()) {
      await pool.query('UPDATE orders SET created_at = ?, updated_at = ? WHERE id = ?', [
        soldAt,
        new Date(),
        orderId,
      ]);
    }
    return null;
  }

  // No adelantar (rompe programación manual / operación del día).
  if (currentKey != null && expectedKey > currentKey) {
    return null;
  }

  // Pedido ya en hoy: no mover a otro día.
  if (currentKey === todayKey) {
    return null;
  }

  // Solo corrección hacia atrás (deadline adelantado respecto de la venta).
  const now = new Date();
  const nextDeadline =
    expectedKey < todayKey ? getTodayDeadline(deadlineHour) : expectedDeadline;
  await pool.query(
    'UPDATE orders SET created_at = ?, delivery_deadline = ?, updated_at = ? WHERE id = ?',
    [soldAt, nextDeadline, now, orderId]
  );
  return getOrderById(orderId);
}

/**
 * Fuerza el día operativo del pedido a hoy (p. ej. Flex “enviar hoy” quedado en mañana).
 */
export async function scheduleOrderForToday(
  user: User,
  orderId: string,
  comment = 'Programado para hoy'
): Promise<Order | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;
  const sellerId = order.sellerId ?? (await getSellerIdForOrder(orderId));
  if (!canViewOrder(user, order, sellerId)) throw new Error('FORBIDDEN');
  if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
    return order;
  }
  if (!isAgencyAdmin(user.role) && user.role !== UserRole.STORE_ADMIN) {
    throw new Error('FORBIDDEN');
  }
  if (order.externalSource === 'mercadolibre') {
    throw new Error('ML_SCHEDULE_TODAY_FORBIDDEN');
  }

  const deadlineHour = order.agencyId
    ? await getAgencyDeliveryDeadlineHour(order.agencyId)
    : DELIVERY_DEADLINE_HOUR;
  const target = getTodayDeadline(deadlineHour);
  const todayKey = getOperationalDateKey(target);
  const currentKey = order.deliveryDeadline
    ? getOperationalDateKey(new Date(order.deliveryDeadline))
    : null;
  if (currentKey === todayKey) return order;

  const now = new Date();
  await pool.query('UPDATE orders SET delivery_deadline = ?, updated_at = ? WHERE id = ?', [
    target,
    now,
    orderId,
  ]);
  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
    [orderId, order.status, user.name || user.username || user.id, comment, now]
  );
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
 * Actualiza nombre/teléfono/dirección cuando ML deja de ocultarlos (XXXXXXX → datos reales).
 * Solo completa campos enmascarados o vacíos; no pisa datos ya buenos.
 */
export async function updateOrderContactFromMercadoLibre(
  orderId: string,
  data: {
    clientName?: string;
    clientPhone?: string;
    address?: string;
    lat?: number;
    lng?: number;
  }
): Promise<Order | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;
  if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
    return order;
  }

  const isMasked = (v: string | null | undefined) => {
    const t = (v ?? '').trim();
    if (!t) return true;
    return /^X{3,}$/i.test(t) || /^\*{3,}$/.test(t);
  };
  const firstLineMasked = (addr: string) => {
    const first = addr.split(',')[0]?.trim() ?? '';
    return isMasked(first);
  };

  const nextName =
    data.clientName?.trim() && !isMasked(data.clientName) && isMasked(order.clientName)
      ? data.clientName.trim()
      : order.clientName;
  const nextPhone =
    data.clientPhone?.trim() && !isMasked(data.clientPhone) && isMasked(order.clientPhone)
      ? data.clientPhone.trim()
      : order.clientPhone ?? '';
  const addressNeedsUpdate =
    Boolean(data.address?.trim()) &&
    !isMasked(data.address) &&
    (isMasked(order.address) || firstLineMasked(order.address) || !order.address?.trim());
  const nextAddress = addressNeedsUpdate ? data.address!.trim() : order.address;
  const nextLat =
    addressNeedsUpdate && data.lat != null && Number.isFinite(data.lat) ? data.lat : order.lat;
  const nextLng =
    addressNeedsUpdate && data.lng != null && Number.isFinite(data.lng) ? data.lng : order.lng;

  if (
    nextName === order.clientName &&
    nextPhone === (order.clientPhone ?? '') &&
    nextAddress === order.address &&
    nextLat === order.lat &&
    nextLng === order.lng
  ) {
    return null;
  }

  const now = new Date();
  await pool.query(
    `UPDATE orders
     SET client_name = ?, client_phone = ?, address = ?, lat = ?, lng = ?, updated_at = ?
     WHERE id = ?`,
    [nextName, nextPhone || null, nextAddress, nextLat, nextLng, now, orderId]
  );
  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
    [
      orderId,
      order.status,
      'Mercado Libre',
      'Datos del destinatario actualizados (ya no ocultos por ML)',
      now,
    ]
  );
  return getOrderById(orderId);
}

/**
 * Reprograma un pedido ausente / con excepción ML para reintento.
 * ML pide entregar “hoy”: el deadline operativo pasa al corte de hoy
 * (o al día futuro que indique ML si es posterior a hoy).
 * No empuja más si el pedido ya está en un día futuro.
 * Si estaba “en viaje”, vuelve a asignado/pendiente para el nuevo día.
 */
export async function rescheduleOrderToNextOperationalDay(
  orderId: string,
  preferredDeadline?: Date | null,
  reason = 'Reprogramado para hoy'
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

  // Ya en un día futuro → no seguir corriendo el deadline ni spamear bitácora
  if (currentKey > todayKey) {
    // Igual sacar de “en viaje” si ML ya lo marcó reprogramado.
    if (order.status === OrderStatus.DELIVERING) {
      const demoted = order.repartidorId ? OrderStatus.ASSIGNED : OrderStatus.PENDING;
      return updateOrderStatusFromMarketplace(
        orderId,
        demoted,
        `Mercado Libre Flex: ${reason}`
      );
    }
    return null;
  }

  const deadlineHour = order.agencyId
    ? await getAgencyDeliveryDeadlineHour(order.agencyId)
    : undefined;
  // Por defecto: hoy (mensaje ML “entregalo hoy”).
  let target = getTodayDeadline(deadlineHour);
  const preferred =
    preferredDeadline && !Number.isNaN(preferredDeadline.getTime()) ? preferredDeadline : null;

  if (preferred) {
    const preferredKey = getOperationalDateKey(preferred);
    // Solo respetar preferencia ML si apunta a un día posterior a hoy.
    if (preferredKey > todayKey) {
      target = preferred;
    }
  }

  const targetKey = getOperationalDateKey(target);
  // Ya está en el día objetivo
  if (targetKey === currentKey) {
    if (order.status === OrderStatus.DELIVERING) {
      const demoted = order.repartidorId ? OrderStatus.ASSIGNED : OrderStatus.PENDING;
      return updateOrderStatusFromMarketplace(
        orderId,
        demoted,
        `Mercado Libre Flex: ${reason}`
      );
    }
    return null;
  }
  // No retroceder
  if (targetKey < currentKey) {
    return null;
  }

  const now = new Date();
  const demoted =
    order.status === OrderStatus.DELIVERING
      ? order.repartidorId
        ? OrderStatus.ASSIGNED
        : OrderStatus.PENDING
      : null;

  await pool.query(
    `UPDATE orders
     SET delivery_deadline = ?,
         status = COALESCE(?, status),
         updated_at = ?
     WHERE id = ?`,
    [target, demoted, now, orderId]
  );
  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
    [orderId, demoted ?? order.status, 'Mercado Libre', `Mercado Libre Flex: ${reason}`, now]
  );
  return getOrderById(orderId);
}

export async function updateOrderStatusFromMarketplace(
  orderId: string,
  status: OrderStatus,
  comment: string,
  updatedBy = 'Mercado Libre'
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
    [orderId, status, updatedBy, comment, now]
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
    const { accrueDriverPayOnDelivery } = await import('./driver-settlement.service.js');
    await accrueDriverPayOnDelivery(updated).catch((err) => {
      console.warn('[driver-settlement] No se pudo liquidar entrega ML:', err);
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

  const sellerId = await getSellerIdForOrder(orderId);
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
  } else if (user.role === UserRole.STORE_ADMIN) {
    if (!canViewOrder(user, order, sellerId)) throw new Error('FORBIDDEN');
    if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
      throw new Error('NOT_AVAILABLE');
    }
    if (status === OrderStatus.CANCELLED) {
      if (order.status !== OrderStatus.PENDING) throw new Error('FORBIDDEN');
    } else if (status === OrderStatus.DELIVERED) {
      // ML se sincroniza por webhook; el resto se confirma a mano.
      if (order.externalSource === 'mercadolibre') throw new Error('MANUAL_DELIVER_ML_FORBIDDEN');
    } else {
      throw new Error('FORBIDDEN');
    }
  } else if (status === OrderStatus.PENDING && isAgencyAdmin(user.role)) {
    if (!canViewOrder(user, order, sellerId)) throw new Error('FORBIDDEN');
    if (order.status !== OrderStatus.ASSIGNED) {
      throw new Error('CANNOT_UNASSIGN');
    }
    assignedRepartidorId = null;
    assignedRepartidorName = null;
  } else if (status === OrderStatus.ASSIGNED) {
    if (!canViewOrder(user, order, sellerId)) throw new Error('FORBIDDEN');
    if (!repartidorId) throw new Error('REPARTIDOR_REQUIRED');
    const rep = await getRepartidorById(repartidorId);
    if (!rep) throw new Error('REPARTIDOR_NOT_FOUND');
    if (isAgencyAdmin(user.role) && user.agencyId && rep.agencyId !== user.agencyId) {
      throw new Error('REPARTIDOR_NOT_FOUND');
    }
    assignedRepartidorId = rep.id;
    assignedRepartidorName = rep.name;
  } else if (isAgencyAdmin(user.role)) {
    if (!canViewOrder(user, order, sellerId)) throw new Error('FORBIDDEN');
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
    const { accrueDriverPayOnDelivery } = await import('./driver-settlement.service.js');
    await accrueDriverPayOnDelivery(updated).catch((err) => {
      console.warn('[driver-settlement] No se pudo liquidar entrega:', err);
    });

    if (updated.externalSource === 'tiendanube' && updated.externalOrderId && updated.sellerId) {
      const { markTiendaNubeOrderAsDelivered } = await import('./tiendanube.service.js');
      markTiendaNubeOrderAsDelivered(updated.sellerId, updated.externalOrderId).catch((err) => {
        console.warn('[tiendanube] No se pudo sincronizar entrega con Tienda Nube:', err);
      });
    }
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
    const placeholders = sorted.map(() => '(?, ?, ?, ?)').join(', ');
    const values = sorted.flatMap((p) => [orderId, p.lat, p.lng, new Date(p.timestamp)]);
    await pool.query(
      `INSERT INTO order_location_history (order_id, lat, lng, created_at) VALUES ${placeholders}`,
      values
    );
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

export async function deleteOrder(
  user: User,
  orderId: string
): Promise<{ sellerId: string | null; agencyId: string | null }> {
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
  return { sellerId: order.sellerId, agencyId: order.agencyId ?? null };
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
