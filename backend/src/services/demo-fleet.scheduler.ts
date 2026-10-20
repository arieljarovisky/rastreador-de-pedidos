import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
const DEMO_AGENCY_ID = 'ag_demo';
import { emitOrderLocation, emitOrderUpdated, emitRepartidorLocation } from '../realtime/io.js';
import { chargeOrderOnDelivery } from './billing.service.js';
import { getOrderById } from './orders.service.js';
import { appendRepartidorLocationHistory, getUserById, updateUserLocation } from './users.service.js';
import { OrderStatus } from '../types/index.js';

const TICK_MS = 3_000;
const START_DELAY_MS = 6_000;
const STEP_RATIO = 0.12;
const MIN_STEP_M = 35;
const MAX_STEP_M = 140;
const ARRIVE_M = 85;
const ARRIVE_EPS = 0.00085;
const MIN_DELIVERING_PER_DRIVER = 2;
const MIN_ASSIGNED = 8;
const MIN_PENDING = 10;
const HISTORY_PRUNE_EVERY = 40;
const OSRM_TIMEOUT_MS = 3_500;

type LatLng = { lat: number; lng: number };

type DriverNav = {
  orderId: string;
  destLat: number;
  destLng: number;
  route: LatLng[];
};

type DemoOrderRow = {
  id: string;
  seller_id: string | null;
  lat: number;
  lng: number;
  status: OrderStatus;
  repartidor_id: string | null;
  client_name: string;
} & RowDataPacket;

type DriverRow = {
  id: string;
  name: string;
  current_lat: number | null;
  current_lng: number | null;
} & RowDataPacket;

const navByDriver = new Map<string, DriverNav>();

function hypotDeg(a: LatLng, b: LatLng): number {
  return Math.hypot(b.lat - a.lat, b.lng - a.lng);
}

function metersBetween(a: LatLng, b: LatLng): number {
  const r = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestIndex(route: LatLng[], point: LatLng, fromIdx = 0): number {
  let best = fromIdx;
  let bestD = Infinity;
  for (let i = fromIdx; i < route.length; i++) {
    const d = hypotDeg(route[i]!, point);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function remainingMeters(route: LatLng[], from: LatLng): number {
  if (route.length === 0) return 0;
  const start = nearestIndex(route, from);
  let total = metersBetween(from, route[start]!);
  for (let i = start; i < route.length - 1; i++) {
    total += metersBetween(route[i]!, route[i + 1]!);
  }
  return total;
}

function walkRoute(route: LatLng[], from: LatLng, meters: number): LatLng {
  if (route.length === 0) return from;
  const start = nearestIndex(route, from);
  let left = meters;
  let cursor = from;
  for (let i = start; i < route.length; i++) {
    const next = route[i]!;
    const seg = metersBetween(cursor, next);
    if (seg < 1e-3) {
      cursor = next;
      continue;
    }
    if (seg >= left || i === route.length - 1) {
      const t = Math.min(1, left / seg);
      return {
        lat: cursor.lat + (next.lat - cursor.lat) * t,
        lng: cursor.lng + (next.lng - cursor.lng) * t,
      };
    }
    left -= seg;
    cursor = next;
  }
  return route[route.length - 1]!;
}

async function fetchOsrmRoute(from: LatLng, to: LatLng): Promise<LatLng[]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(OSRM_TIMEOUT_MS) });
    if (!res.ok) throw new Error('osrm');
    const data = (await res.json()) as {
      code?: string;
      routes?: { geometry?: { coordinates?: [number, number][] } }[];
    };
    const coords = data.routes?.[0]?.geometry?.coordinates;
    if (data.code === 'Ok' && coords && coords.length >= 2) {
      return coords.map(([lng, lat]) => ({ lat, lng }));
    }
  } catch {
    // fallback: línea directa si OSRM no responde
  }
  return [from, to];
}

async function routeForDriver(driverId: string, from: LatLng, order: DemoOrderRow): Promise<LatLng[]> {
  const destLat = Number(order.lat);
  const destLng = Number(order.lng);
  const prev = navByDriver.get(driverId);
  if (
    prev &&
    prev.orderId === order.id &&
    Math.abs(prev.destLat - destLat) < 1e-5 &&
    Math.abs(prev.destLng - destLng) < 1e-5 &&
    prev.route.length >= 2
  ) {
    return prev.route;
  }
  const route = await fetchOsrmRoute(from, { lat: destLat, lng: destLng });
  navByDriver.set(driverId, { orderId: order.id, destLat, destLng, route });
  return route;
}

let inFlight = false;
let ticks = 0;
let loggedReady = false;

async function agencyExists(): Promise<boolean> {
  const [rows] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    'SELECT id FROM agencies WHERE id = ? LIMIT 1',
    [DEMO_AGENCY_ID]
  );
  return Boolean(rows[0]);
}

const DEMO_DRIVER_FILTER = `(id LIKE 'demo_%' OR id IN ('u2', 'u3', 'u4', 'u12', 'u13'))`;

async function loadDrivers(): Promise<DriverRow[]> {
  const [rows] = await pool.query<DriverRow[]>(
    `SELECT id, name, current_lat, current_lng
     FROM users
     WHERE agency_id = ? AND role = 'repartidor' AND ${DEMO_DRIVER_FILTER}
     ORDER BY name`,
    [DEMO_AGENCY_ID]
  );
  return rows;
}

async function loadAgencyOrders(): Promise<DemoOrderRow[]> {
  const [rows] = await pool.query<DemoOrderRow[]>(
    `SELECT id, seller_id, lat, lng, status, repartidor_id, client_name
     FROM orders
     WHERE agency_id = ? AND archived = 0 AND id LIKE 'DEMO-%'`,
    [DEMO_AGENCY_ID]
  );
  return rows;
}

async function emitLiveOrder(
  orderId: string,
  point: { lat: number; lng: number },
  repartidorId: string,
  repartidorName: string
): Promise<void> {
  const order = await getOrderById(orderId);
  if (!order) return;
  const stamped = {
    lat: point.lat,
    lng: point.lng,
    timestamp: new Date().toISOString(),
  };
  emitOrderUpdated(order, order.sellerId);
  emitOrderLocation({
    orderId,
    sellerId: order.sellerId,
    repartidorId,
    repartidorName,
    agencyId: order.agencyId,
    point: stamped,
  });
}

async function emitDriver(repartidorId: string): Promise<void> {
  const user = await getUserById(repartidorId);
  if (user) emitRepartidorLocation(user);
}

async function setOrderStatus(
  order: DemoOrderRow,
  status: OrderStatus,
  repartidorId: string | null,
  comment: string,
  by: string
): Promise<void> {
  const now = new Date();
  await pool.query(
    'UPDATE orders SET status = ?, repartidor_id = ?, updated_at = ? WHERE id = ?',
    [status, repartidorId, now, order.id]
  );
  await pool.query(
    `INSERT INTO order_history (order_id, status, updated_by, comment, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [order.id, status, by, comment, now]
  );

  if (status === OrderStatus.DELIVERED) {
    try {
      const full = await getOrderById(order.id);
      if (full) await chargeOrderOnDelivery(full);
    } catch {
      // la facturación no debe frenar la demo
    }
    await pool.query(
      `UPDATE driver_scan_entries
       SET status = 'delivered', delivered_at = ?
       WHERE order_id = ? AND agency_id = ?`,
      [now, order.id, DEMO_AGENCY_ID]
    ).catch(() => undefined);
  }

  const updated = await getOrderById(order.id);
  if (updated) emitOrderUpdated(updated, updated.sellerId);
}

async function recycleDelivered(orders: DemoOrderRow[]): Promise<void> {
  const pending = orders.filter((o) => o.status === OrderStatus.PENDING).length;
  const assigned = orders.filter((o) => o.status === OrderStatus.ASSIGNED).length;
  if (pending >= MIN_PENDING && assigned >= MIN_ASSIGNED) return;

  const delivered = orders
    .filter((o) => o.status === OrderStatus.DELIVERED)
    .sort((a, b) => a.id.localeCompare(b.id));
  const keep = 6;
  const extras = delivered.slice(0, Math.max(0, delivered.length - keep));
  const needPending = Math.max(0, MIN_PENDING - pending);
  const needAssigned = Math.max(0, MIN_ASSIGNED - assigned);
  const take = extras.slice(0, needPending + needAssigned);

  for (const [i, order] of take.entries()) {
    const toAssigned = i < needAssigned;
    await pool.query('DELETE FROM order_location_history WHERE order_id = ?', [order.id]);
    await setOrderStatus(
      order,
      toAssigned ? OrderStatus.ASSIGNED : OrderStatus.PENDING,
      toAssigned ? order.repartidor_id : null,
      'Reingresado para la demo en vivo',
      'Simulador demo'
    );
  }
}

async function ensureDriverWorkload(
  driver: DriverRow,
  orders: DemoOrderRow[]
): Promise<DemoOrderRow[]> {
  let mine = orders.filter(
    (o) => o.repartidor_id === driver.id && o.status === OrderStatus.DELIVERING
  );
  if (mine.length >= MIN_DELIVERING_PER_DRIVER) return mine;

  const assigned = orders.filter(
    (o) =>
      o.status === OrderStatus.ASSIGNED &&
      (o.repartidor_id === driver.id || o.repartidor_id == null)
  );
  const pending = orders.filter((o) => o.status === OrderStatus.PENDING);
  const poolToPromote = [...assigned, ...pending];

  while (mine.length < MIN_DELIVERING_PER_DRIVER && poolToPromote.length > 0) {
    const next = poolToPromote.shift()!;
    await setOrderStatus(
      next,
      OrderStatus.DELIVERING,
      driver.id,
      'En camino (demo en vivo)',
      driver.name
    );
    next.status = OrderStatus.DELIVERING;
    next.repartidor_id = driver.id;
    mine.push(next);
  }

  return mine;
}

async function moveDriver(driver: DriverRow, targets: DemoOrderRow[]): Promise<void> {
  if (targets.length === 0) return;

  const current = {
    lat: driver.current_lat != null ? Number(driver.current_lat) : -34.5885,
    lng: driver.current_lng != null ? Number(driver.current_lng) : -58.4306,
  };

  const withDist = targets.map((order) => {
    const dest = { lat: Number(order.lat), lng: Number(order.lng) };
    return { order, dest, dist: hypotDeg(current, dest) };
  });
  withDist.sort((a, b) => a.dist - b.dist);
  const focus = withDist[0]!;
  const from = current;
  const route = await routeForDriver(driver.id, from, focus.order);
  const remaining = remainingMeters(route, from);

  if (hypotDeg(from, focus.dest) < ARRIVE_EPS || remaining < ARRIVE_M) {
    navByDriver.delete(driver.id);
    await setOrderStatus(
      focus.order,
      OrderStatus.DELIVERED,
      driver.id,
      'Entregado (demo en vivo)',
      driver.name
    );
    return;
  }

  const stepM = Math.min(MAX_STEP_M, Math.max(MIN_STEP_M, remaining * STEP_RATIO));
  const next = walkRoute(route, from, stepM);
  const now = new Date();

  await pool.query(
    'INSERT INTO order_location_history (order_id, lat, lng, created_at) VALUES (?, ?, ?, ?)',
    [focus.order.id, next.lat, next.lng, now]
  );
  await pool.query('UPDATE orders SET updated_at = ? WHERE id = ?', [now, focus.order.id]);
  await updateUserLocation(driver.id, next.lat, next.lng, now);
  await appendRepartidorLocationHistory(driver.id, next.lat, next.lng, now);
  await emitLiveOrder(focus.order.id, next, driver.id, driver.name);
  await emitDriver(driver.id);
}

async function pruneOldHistory(): Promise<void> {
  await pool.query(
    `DELETE olh FROM order_location_history olh
     INNER JOIN orders o ON o.id = olh.order_id
     WHERE o.agency_id = ? AND o.id LIKE 'DEMO-%' AND olh.created_at < DATE_SUB(NOW(), INTERVAL 3 HOUR)`,
    [DEMO_AGENCY_ID]
  );
  await pool.query(
    `DELETE rlh FROM repartidor_location_history rlh
     INNER JOIN users u ON u.id = rlh.user_id
     WHERE u.agency_id = ? AND (u.id LIKE 'demo_%' OR u.id IN ('u2', 'u3', 'u4', 'u12', 'u13'))
       AND rlh.created_at < DATE_SUB(NOW(), INTERVAL 3 HOUR)`,
    [DEMO_AGENCY_ID]
  );
}

async function demoFleetTick(): Promise<void> {
  if (!(await agencyExists())) return;

  const drivers = await loadDrivers();
  if (drivers.length === 0) return;

  if (!loggedReady) {
    loggedReady = true;
    console.log(
      `[demo-fleet] Flota en vivo: ${drivers.length} repartidores en ${DEMO_AGENCY_ID}`
    );
  }

  const orders = await loadAgencyOrders();
  await recycleDelivered(orders);
  const fresh = await loadAgencyOrders();

  for (const driver of drivers) {
    const mine = await ensureDriverWorkload(driver, fresh);
    await moveDriver(driver, mine);
  }

  ticks += 1;
  if (ticks % HISTORY_PRUNE_EVERY === 0) {
    await pruneOldHistory();
  }
}

export function startDemoFleetScheduler(): void {
  if (!env.demoFleet) {
    console.log('[demo-fleet] Desactivado (DEMO_FLEET=false)');
    return;
  }

  setTimeout(() => {
    void demoFleetTick().catch((err) => {
      console.warn('[demo-fleet] primer tick:', err instanceof Error ? err.message : err);
    });
    setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void demoFleetTick()
        .catch((err) => {
          console.warn('[demo-fleet] tick:', err instanceof Error ? err.message : err);
        })
        .finally(() => {
          inFlight = false;
        });
    }, TICK_MS);
  }, START_DELAY_MS);

  console.log(
    `[demo-fleet] Simulador GPS demo activo (cada ${TICK_MS / 1000}s, solo ${DEMO_AGENCY_ID})`
  );
}
