import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { seedDefaultZonesForAgency, ensureCordonZonesForAgency } from '../services/delivery-zones.service.js';
import { ensureAgencySubscription } from '../services/subscriptions.service.js';
import { ensureDriverScanEntriesTable } from '../services/driver-scan.service.js';
import { chargeOrderOnDelivery } from '../services/billing.service.js';
import { getOrderById } from '../services/orders.service.js';
import { OrderStatus, UserRole } from '../types/index.js';
import {
  deliveryDeadlineForOperationalDate,
  getActiveOperationalDateKey,
  getOperationalDateKey,
  getOperationalDayBounds,
  previousBusinessOperationalDateKey,
  shiftOperationalDateKey,
} from '../utils/delivery-deadline.js';
import { generatePublicTrackingCode } from '../utils/public-tracking-code.js';

const now = Date.now();
export const DEMO_AGENCY_ID = 'ag_demo';
const agencyId = DEMO_AGENCY_ID;
const DEMO_ORDER_PREFIX = 'DEMO-';
const DEPOT = { lat: -34.5885, lng: -58.4306 };

function demoOrderId(orderNum: number): string {
  return `${DEMO_ORDER_PREFIX}${orderNum}`;
}

const REPARTIDORES = [
  { id: 'u2', username: 'carlos', name: 'Carlos Gómez', password: 'carlos123', lat: -34.5901, lng: -58.4215, zone: 'zona_sur' },
  { id: 'u3', username: 'maria', name: 'María Rodríguez', password: 'maria123', lat: -34.5712, lng: -58.4412, zone: 'zona_norte' },
  { id: 'u4', username: 'juan', name: 'Juan Pérez', password: 'juan123', lat: -34.6, lng: -58.41, zone: 'zona_oeste' },
  { id: 'u12', username: 'lucia', name: 'Lucía Fernández', password: 'lucia123', lat: -34.615, lng: -58.435, zone: 'zona_centro' },
  { id: 'u13', username: 'diego', name: 'Diego Álvarez', password: 'diego123', lat: -34.555, lng: -58.46, zone: 'zona_gba' },
] as const;

const VENDORS = [
  { id: 'u1', username: 'admin', name: 'Lupo Ventas (Local)', password: 'admin123' },
  { id: 'u6', username: 'moda-norte', name: 'Moda Norte Boutique', password: 'vendor123' },
  { id: 'u7', username: 'tech-ba', name: 'TechBA Electro', password: 'vendor123' },
  { id: 'u8', username: 'hogar-shop', name: 'Hogar & Deco Shop', password: 'vendor123' },
  { id: 'u9', username: 'fitness-pro', name: 'Fitness Pro Store', password: 'vendor123' },
  { id: 'u10', username: 'gourmet-ba', name: 'Gourmet BA', password: 'vendor123' },
  { id: 'u11', username: 'pet-corner', name: 'Pet Corner', password: 'vendor123' },
] as const;

const DEMO_USERNAMES = [
  'logistica',
  'admin',
  'moda-norte',
  'tech-ba',
  'hogar-shop',
  'fitness-pro',
  'gourmet-ba',
  'pet-corner',
  'carlos',
  'maria',
  'juan',
  'lucia',
  'diego',
] as const;

const SHIPPING_TYPES = ['flex', 'express', 'standard'] as const;
const MARKETPLACES = ['shopify', 'tiendanube', 'woocommerce', null, null] as const;

const DEMO_ADDRESSES = [
  { address: 'Av. Callao 1500, Recoleta, CABA', lat: -34.5895, lng: -58.3974 },
  { address: 'Av. Cabildo 2200, Belgrano, CABA', lat: -34.5621, lng: -58.4565 },
  { address: 'Av. Medrano 400, Almagro, CABA', lat: -34.6162, lng: -58.4194 },
  { address: 'Alicia Moreau de Justo 1200, Puerto Madero, CABA', lat: -34.6118, lng: -58.3647 },
  { address: 'Av. Corrientes 4500, Almagro, CABA', lat: -34.6035, lng: -58.4258 },
  { address: 'Av. Rivadavia 5500, Caballito, CABA', lat: -34.6245, lng: -58.4412 },
  { address: 'Av. Santa Fe 2800, Palermo, CABA', lat: -34.5872, lng: -58.4051 },
  { address: 'Av. del Libertador 5800, Núñez, CABA', lat: -34.5489, lng: -58.4567 },
  { address: 'Av. San Juan 2200, San Cristóbal, CABA', lat: -34.6218, lng: -58.3987 },
  { address: 'Av. Córdoba 4200, Palermo, CABA', lat: -34.5956, lng: -58.4213 },
  { address: 'Av. Independencia 3100, Boedo, CABA', lat: -34.6289, lng: -58.4123 },
  { address: 'Av. Scalabrini Ortiz 1200, Villa Crespo, CABA', lat: -34.5987, lng: -58.4312 },
  { address: 'Av. Directorio 1200, Parque Chacabuco, CABA', lat: -34.6345, lng: -58.4289 },
  { address: 'Av. La Plata 800, Barracas, CABA', lat: -34.6412, lng: -58.3789 },
  { address: 'Av. Entre Ríos 1100, Constitución, CABA', lat: -34.6278, lng: -58.3845 },
  { address: 'Av. Pueyrredón 900, Balvanera, CABA', lat: -34.6089, lng: -58.4012 },
  { address: 'Av. Triunvirato 3200, Villa Urquiza, CABA', lat: -34.5712, lng: -58.4789 },
  { address: 'Av. Monroe 4500, Belgrano R, CABA', lat: -34.5567, lng: -58.4456 },
  { address: 'Av. Caseros 2500, Parque Patricios, CABA', lat: -34.6389, lng: -58.4012 },
  { address: 'Av. Jujuy 1800, Parque Centenario, CABA', lat: -34.6156, lng: -58.4345 },
] as const;

const CLIENT_NAMES = [
  'Alejandro Rossi', 'Sofía Martínez', 'Matías Fernández', 'Lucía Benítez',
  'Valentina Acosta', 'Diego Romero', 'Camila Suárez', 'Nicolás Herrera',
  'Florencia Díaz', 'Martín Castillo', 'Julieta Morales', 'Facundo Ríos',
  'Agustina Vega', 'Tomás Navarro', 'Paula Campos', 'Sebastián Luna',
  'Carolina Méndez', 'Gonzalo Paredes', 'Daniela Fuentes', 'Emilio Torres',
  'Mariana Iglesias', 'Lucas Cabrera', 'Romina Soto', 'Pablo Aguirre',
  'Andrea Blanco', 'Federico Cruz', 'Natalia Ponce', 'Hernán Salinas',
  'Gabriela Ruiz', 'Maximiliano Ortiz', 'Verónica Silva', 'Rodrigo Méndez',
  'Claudia Ramos', 'Ezequiel Vargas', 'Laura Giménez', 'Ignacio Peña',
  'Silvia Conti', 'Bruno Ferreyra', 'Patricia Molina', 'Ricardo Domínguez',
  'Elena Vidal', 'Oscar Benítez', 'Cecilia Arias', 'Hugo Delgado',
  'Mónica Reyes', 'Alberto Castro', 'Susana Núñez', 'Raúl Espinoza',
  'Graciela Peralta', 'Jorge Montoya', 'Liliana Cabral', 'Sergio Ibarra',
  'Norma Escobar', 'Walter Cáceres', 'Adriana Figueroa', 'Miguel Barrios',
] as const;

const DELIVERY_NOTES = [
  'Entregar en portería del edificio.',
  'Dejar en recepción de planta baja.',
  'Llamar antes de llegar para bajar.',
  'Entregar en mano, timbre 3A.',
  'Dejar con encargado si no hay nadie.',
  'Pedido frágil, manejar con cuidado.',
  'Cliente prefiere entrega por la tarde.',
  'Acceso por calle lateral, portón verde.',
  'Tocar timbre y esperar en la vereda.',
  'Entregar solo al titular del pedido.',
  '',
  'Departamento 8B, ascensor al fondo.',
  'Local comercial, horario 10 a 18 hs.',
] as const;

type OrderSeed = {
  id: string;
  sellerId: string;
  clientName: string;
  clientPhone: string;
  address: string;
  lat: number;
  lng: number;
  status: OrderStatus;
  repartidorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deliveryDeadline: Date;
  notes: string;
  shippingType: string;
  externalSource: string | null;
  externalOrderId: string | null;
  history: { status: OrderStatus; offset: number; by: string }[];
  locations: { lat: number; lng: number; offset: number }[];
};

async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

function pick<T>(arr: readonly T[], index: number): T {
  return arr[index % arr.length];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function atTimeOnDay(dateKey: string, hour: number, minute = 0): Date {
  const { start } = getOperationalDayBounds(dateKey);
  return new Date(start.getTime() + (hour * 60 + minute) * 60_000);
}

function buildHistory(
  status: OrderStatus,
  repartidorName: string | null,
  ageMs: number
): { status: OrderStatus; offset: number; by: string }[] {
  const admin = 'Lupo Administración';
  const steps: OrderStatus[] = [OrderStatus.PENDING];
  if (status === OrderStatus.ASSIGNED || status === OrderStatus.DELIVERING || status === OrderStatus.DELIVERED) {
    steps.push(OrderStatus.ASSIGNED);
  }
  if (status === OrderStatus.DELIVERING || status === OrderStatus.DELIVERED) {
    steps.push(OrderStatus.DELIVERING);
  }
  if (status === OrderStatus.DELIVERED) {
    steps.push(OrderStatus.DELIVERED);
  }
  if (status === OrderStatus.CANCELLED) {
    return [
      { status: OrderStatus.PENDING, offset: -ageMs, by: admin },
      { status: OrderStatus.CANCELLED, offset: -Math.floor(ageMs * 0.3), by: admin },
    ];
  }

  return steps.map((s, i) => {
    const fraction = steps.length === 1 ? 1 : i / (steps.length - 1);
    const offset = -Math.floor(ageMs * (1 - fraction * 0.85));
    const by =
      s === OrderStatus.DELIVERING || s === OrderStatus.DELIVERED
        ? repartidorName ?? admin
        : admin;
    return { status: s, offset, by };
  });
}

function buildLocations(
  destLat: number,
  destLng: number,
  ageMs: number,
  progress: number
): { lat: number; lng: number; offset: number }[] {
  const mid = Math.min(progress, 0.4);
  return [
    { lat: DEPOT.lat, lng: DEPOT.lng, offset: -ageMs },
    {
      lat: lerp(DEPOT.lat, destLat, mid),
      lng: lerp(DEPOT.lng, destLng, mid),
      offset: -Math.floor(ageMs * 0.55),
    },
    {
      lat: lerp(DEPOT.lat, destLat, progress),
      lng: lerp(DEPOT.lng, destLng, progress),
      offset: -Math.floor(ageMs * 0.15),
    },
  ];
}

/** Mix denso para demo: ~30% pendientes, 25% asignados, 30% en viaje, 10% entregados, 5% cancelados. */
function statusForIndex(i: number): OrderStatus {
  const r = i % 20;
  if (r < 6) return OrderStatus.PENDING;
  if (r < 11) return OrderStatus.ASSIGNED;
  if (r < 17) return OrderStatus.DELIVERING;
  if (r < 19) return OrderStatus.DELIVERED;
  return OrderStatus.CANCELLED;
}

function marketplaceForIndex(i: number): { source: string | null; externalId: string | null } {
  const source = pick(MARKETPLACES, i);
  if (!source) return { source: null, externalId: null };
  const prefix = source === 'shopify' ? 'SH' : source === 'tiendanube' ? 'TN' : 'WC';
  return { source, externalId: `${prefix}-${88000 + i}` };
}

function buildOrder(params: {
  orderNum: number;
  index: number;
  dateKey: string;
  featured?: Partial<OrderSeed>;
}): OrderSeed {
  const { orderNum, index: i, dateKey, featured } = params;
  const id = demoOrderId(orderNum);
  const addr = pick(DEMO_ADDRESSES, i);
  const seller = pick(VENDORS, i);
  const status = featured?.status ?? statusForIndex(i);
  const createdAt = featured?.createdAt ?? atTimeOnDay(dateKey, 8, (i * 7) % 180);
  const ageMs = Math.max(60_000, now - createdAt.getTime());
  const repartidor =
    status === OrderStatus.PENDING || status === OrderStatus.CANCELLED
      ? null
      : pick(REPARTIDORES, i);
  const repartidorName = repartidor?.name ?? null;
  const lat = featured?.lat ?? addr.lat;
  const lng = featured?.lng ?? addr.lng;
  const market = marketplaceForIndex(i);
  const progress =
    status === OrderStatus.DELIVERED ? 1 : 0.28 + ((i % 6) * 0.07);

  return {
    id,
    sellerId: featured?.sellerId ?? seller.id,
    clientName: featured?.clientName ?? pick(CLIENT_NAMES, i),
    clientPhone: featured?.clientPhone ?? `+54 11 5555-${String(1000 + (i % 9000)).padStart(4, '0')}`,
    address: featured?.address ?? addr.address,
    lat,
    lng,
    status,
    repartidorId: featured?.repartidorId !== undefined ? featured.repartidorId : repartidor?.id ?? null,
    createdAt,
    updatedAt: new Date(now - Math.floor(ageMs * 0.12)),
    deliveryDeadline: featured?.deliveryDeadline ?? deliveryDeadlineForOperationalDate(dateKey, 13),
    notes: featured?.notes ?? pick(DELIVERY_NOTES, i),
    shippingType: featured?.shippingType ?? pick(SHIPPING_TYPES, i),
    externalSource: featured?.externalSource ?? market.source,
    externalOrderId: featured?.externalOrderId ?? market.externalId,
    history: buildHistory(status, repartidorName, ageMs),
    locations:
      status === OrderStatus.DELIVERING || status === OrderStatus.DELIVERED
        ? buildLocations(lat, lng, ageMs, progress)
        : [],
  };
}

function generateDemoOrders(): OrderSeed[] {
  const todayKey = getActiveOperationalDateKey();
  const yesterdayKey = previousBusinessOperationalDateKey(shiftOperationalDateKey(todayKey, -1));
  const orders: OrderSeed[] = [];

  const featured: Partial<OrderSeed>[] = [
    {
      id: demoOrderId(2001),
      sellerId: 'u6',
      clientName: 'Alejandro Rossi',
      clientPhone: '+54 11 5555-1234',
      address: DEMO_ADDRESSES[0].address,
      lat: DEMO_ADDRESSES[0].lat,
      lng: DEMO_ADDRESSES[0].lng,
      status: OrderStatus.DELIVERING,
      repartidorId: 'u2',
      notes: 'Entregar en portería del edificio. Tocar timbre 5B.',
      shippingType: 'flex',
    },
    {
      id: demoOrderId(2002),
      sellerId: 'u7',
      clientName: 'Sofía Martínez',
      clientPhone: '+54 11 5555-5678',
      address: DEMO_ADDRESSES[1].address,
      lat: DEMO_ADDRESSES[1].lat,
      lng: DEMO_ADDRESSES[1].lng,
      status: OrderStatus.ASSIGNED,
      repartidorId: 'u3',
      notes: 'Dejar en recepción de planta baja.',
      shippingType: 'express',
    },
    {
      id: demoOrderId(2003),
      sellerId: 'u8',
      clientName: 'Matías Fernández',
      clientPhone: '+54 11 5555-9012',
      address: DEMO_ADDRESSES[2].address,
      lat: DEMO_ADDRESSES[2].lat,
      lng: DEMO_ADDRESSES[2].lng,
      status: OrderStatus.PENDING,
      repartidorId: null,
      notes: 'Llamar antes de llegar para bajar.',
      shippingType: 'standard',
    },
    {
      id: demoOrderId(2004),
      sellerId: 'u9',
      clientName: 'Lucía Benítez',
      clientPhone: '+54 11 5555-3456',
      address: DEMO_ADDRESSES[3].address,
      lat: DEMO_ADDRESSES[3].lat,
      lng: DEMO_ADDRESSES[3].lng,
      status: OrderStatus.DELIVERED,
      repartidorId: 'u4',
      notes: 'Entregado en mano en piso 4.',
      shippingType: 'flex',
    },
  ];

  for (let i = 0; i < 60; i++) {
    const orderNum = 2001 + i;
    const id = demoOrderId(orderNum);
    orders.push(
      buildOrder({
        orderNum,
        index: i,
        dateKey: todayKey,
        featured: featured.find((f) => f.id === id),
      })
    );
  }

  for (let i = 0; i < 10; i++) {
    orders.push(
      buildOrder({
        orderNum: 1901 + i,
        index: 80 + i,
        dateKey: yesterdayKey,
        featured: {
          status: OrderStatus.DELIVERED,
          repartidorId: pick(REPARTIDORES, i).id,
          createdAt: atTimeOnDay(yesterdayKey, 9, i * 20),
          deliveryDeadline: deliveryDeadlineForOperationalDate(yesterdayKey, 13),
        },
      })
    );
  }

  return orders;
}

async function tableExists(table: string): Promise<boolean> {
  const [rows] = await pool.query<Array<{ TABLE_NAME: string } & import('mysql2').RowDataPacket>>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<Array<{ COLUMN_NAME: string } & import('mysql2').RowDataPacket>>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function bindDemoUsersToAgency(): Promise<void> {
  const placeholders = DEMO_USERNAMES.map(() => '?').join(', ');
  const [result] = await pool.query(
    `UPDATE users SET agency_id = ?
     WHERE LOWER(username) IN (${placeholders})`,
    [agencyId, ...DEMO_USERNAMES]
  );
  const affected = (result as { affectedRows?: number }).affectedRows ?? 0;
  if (affected > 0) {
    console.log(`[seed] ${affected} usuario(s) demo vinculado(s) a ${agencyId}.`);
  }
}

async function upsertLogisticaAdmin(passwordHash: string): Promise<void> {
  const departureAddress = 'Av. Santa Fe 3200, Palermo, CABA';
  const [rows] = await pool.query<Array<{ id: string } & import('mysql2').RowDataPacket>>(
    'SELECT id FROM users WHERE LOWER(username) = ? LIMIT 1',
    ['logistica']
  );
  const existingId = rows[0]?.id;
  if (existingId) {
    await pool.query(
      `UPDATE users SET password_hash = ?, name = ?, role = ?, agency_id = ?,
        departure_address = ?, departure_lat = ?, departure_lng = ?,
        email_verified_at = COALESCE(email_verified_at, NOW(3))
       WHERE id = ?`,
      [
        passwordHash,
        'Lupo Logística (Envíos)',
        UserRole.SUPER_ADMIN,
        agencyId,
        departureAddress,
        DEPOT.lat,
        DEPOT.lng,
        existingId,
      ]
    );
    return;
  }
  await pool.query(
    `INSERT INTO users (id, username, password_hash, name, role, agency_id, departure_address, departure_lat, departure_lng, email_verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
    ['u5', 'logistica', passwordHash, 'Lupo Logística (Envíos)', UserRole.SUPER_ADMIN, agencyId, departureAddress, DEPOT.lat, DEPOT.lng]
  );
}

async function markDemoUsersEmailVerified(): Promise<void> {
  const placeholders = DEMO_USERNAMES.map(() => '?').join(', ');
  const [result] = await pool.query(
    `UPDATE users
     SET email_verified_at = COALESCE(email_verified_at, NOW(3))
     WHERE LOWER(username) IN (${placeholders}) OR agency_id = ?`,
    [...DEMO_USERNAMES, agencyId]
  );
  const affected = (result as { affectedRows?: number }).affectedRows ?? 0;
  if (affected > 0) {
    console.log(`[seed] ${affected} usuario(s) demo marcados como email verificado.`);
  }
}

async function activateDemoSubscription(): Promise<void> {
  await ensureAgencySubscription(agencyId);
  if (!(await tableExists('agency_subscriptions'))) return;
  const periodEnd = new Date();
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  await pool.query(
    `UPDATE agency_subscriptions
     SET status = 'active', trial_ends_at = NULL,
         current_period_start = ?, current_period_end = ?, updated_at = ?
     WHERE agency_id = ?`,
    [new Date(now), periodEnd, new Date(now), agencyId]
  );
}

async function clearDemoAgencyOrders(): Promise<void> {
  const demoIdPattern = `${DEMO_ORDER_PREFIX}%`;
  if (await tableExists('driver_scan_entries')) {
    await pool.query(
      `DELETE FROM driver_scan_entries
       WHERE agency_id = ? OR id LIKE 'dscan_demo_%' OR order_id LIKE ?`,
      [agencyId, demoIdPattern]
    );
  }
  if (await tableExists('billing_ledger_entries')) {
    await pool.query('DELETE FROM billing_ledger_entries WHERE agency_id = ?', [agencyId]);
  }
  if (await tableExists('driver_ledger_entries')) {
    await pool.query('DELETE FROM driver_ledger_entries WHERE agency_id = ?', [agencyId]);
  }
  await pool.query(
    `DELETE olh FROM order_location_history olh
     INNER JOIN orders o ON o.id = olh.order_id
     WHERE o.id LIKE ? OR o.agency_id = ?`,
    [demoIdPattern, agencyId]
  );
  await pool.query(
    `DELETE oh FROM order_history oh
     INNER JOIN orders o ON o.id = oh.order_id
     WHERE o.id LIKE ? OR o.agency_id = ?`,
    [demoIdPattern, agencyId]
  );
  await pool.query('DELETE FROM orders WHERE id LIKE ? OR agency_id = ?', [demoIdPattern, agencyId]);

  const driverIds = REPARTIDORES.map((r) => r.id);
  if (await tableExists('repartidor_location_history') && driverIds.length > 0) {
    const placeholders = driverIds.map(() => '?').join(', ');
    await pool.query(
      `DELETE FROM repartidor_location_history WHERE user_id IN (${placeholders})`,
      driverIds
    );
  }
}

async function seedDriverScans(orders: OrderSeed[]): Promise<number> {
  await ensureDriverScanEntriesTable();
  const todayKey = getActiveOperationalDateKey();
  const scannable = orders.filter(
    (o) =>
      o.status === OrderStatus.ASSIGNED ||
      o.status === OrderStatus.DELIVERING ||
      o.status === OrderStatus.DELIVERED
  );

  let count = 0;
  for (const [i, order] of scannable.entries()) {
    if (!order.repartidorId) continue;
    const scanStatus =
      order.status === OrderStatus.DELIVERED ? 'delivered' : 'pending';
    const scannedAt = new Date(order.createdAt.getTime() + 25 * 60_000);
    const deliveredAt = scanStatus === 'delivered' ? order.updatedAt : null;
    const lastLoc = order.locations[order.locations.length - 1];
    const scanCode =
      order.externalOrderId ??
      `4400${order.id.replace(/\D/g, '').padStart(8, '0')}`;
    const routeDate = getOperationalDateKey(order.deliveryDeadline);

    await pool.query(
      `INSERT INTO driver_scan_entries
        (id, agency_id, repartidor_id, seller_id, scan_code, route_date, status, note,
         client_name, address, client_phone, order_id, scanned_at, delivered_at, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         client_name = VALUES(client_name),
         address = VALUES(address),
         order_id = VALUES(order_id),
         delivered_at = VALUES(delivered_at)`,
      [
        `dscan_demo_${order.id}`,
        agencyId,
        order.repartidorId,
        order.sellerId,
        scanCode,
        routeDate,
        scanStatus,
        order.notes || null,
        order.clientName,
        order.address,
        order.clientPhone,
        order.id,
        scannedAt,
        deliveredAt,
        lastLoc?.lat ?? order.lat,
        lastLoc?.lng ?? order.lng,
      ]
    );
    count += 1;

    if (i % 5 === 0) {
      const extraAddr = pick(DEMO_ADDRESSES, i + 3);
      const extraClient = pick(CLIENT_NAMES, i + 11);
      await pool.query(
        `INSERT INTO driver_scan_entries
          (id, agency_id, repartidor_id, seller_id, scan_code, route_date, status, note,
           client_name, address, client_phone, order_id, scanned_at, delivered_at, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NULL, ?, NULL, ?, ?)
         ON DUPLICATE KEY UPDATE client_name = VALUES(client_name), address = VALUES(address)`,
        [
          `dscan_demo_pers_${i}`,
          agencyId,
          order.repartidorId,
          pick(VENDORS, i + 2).id,
          `PERS-${44100 + i}`,
          todayKey,
          'Etiqueta ajena / bitácora personal',
          extraClient,
          extraAddr.address,
          `+54 11 5555-${String(2000 + i).padStart(4, '0')}`,
          new Date(scannedAt.getTime() + 12 * 60_000),
          extraAddr.lat,
          extraAddr.lng,
        ]
      );
      count += 1;
    }
  }

  return count;
}

async function seedDriverGpsTrails(orders: OrderSeed[]): Promise<void> {
  if (!(await tableExists('repartidor_location_history'))) return;

  for (const driver of REPARTIDORES) {
    const live = orders.find(
      (o) => o.repartidorId === driver.id && o.status === OrderStatus.DELIVERING
    );
    const trail = live?.locations?.length
      ? live.locations
      : [
          { lat: DEPOT.lat, lng: DEPOT.lng, offset: -20 * 60_000 },
          { lat: driver.lat, lng: driver.lng, offset: 0 },
        ];
    for (const point of trail) {
      await pool.query(
        'INSERT INTO repartidor_location_history (user_id, lat, lng, created_at) VALUES (?, ?, ?, ?)',
        [driver.id, point.lat, point.lng, new Date(now + point.offset)]
      );
    }

    const last = trail[trail.length - 1];
    if (last) {
      await pool.query(
        'UPDATE users SET current_lat = ?, current_lng = ?, location_updated_at = ? WHERE id = ?',
        [last.lat, last.lng, new Date(now), driver.id]
      );
    }
  }
}

export async function seedDatabase(): Promise<void> {
  await pool.query(
    `INSERT INTO agencies (id, name, departure_address, departure_lat, departure_lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), departure_address = VALUES(departure_address),
       departure_lat = VALUES(departure_lat), departure_lng = VALUES(departure_lng)`,
    [
      agencyId,
      'Lupo Logística (Envíos)',
      'Av. Santa Fe 3200, Palermo, CABA',
      DEPOT.lat,
      DEPOT.lng,
      new Date(now),
    ]
  );

  const logisticaPasswordHash = await hash('logistica123');
  await upsertLogisticaAdmin(logisticaPasswordHash);

  for (const v of VENDORS) {
    const passwordHash = await hash(v.password);
    await pool.query(
      `INSERT INTO users (id, username, password_hash, name, role, agency_id, current_lat, current_lng, location_updated_at,
        departure_address, departure_lat, departure_lng, delivery_zone, email_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NOW(3))
       ON DUPLICATE KEY UPDATE username = VALUES(username), password_hash = VALUES(password_hash), name = VALUES(name),
         role = VALUES(role), agency_id = VALUES(agency_id),
         email_verified_at = COALESCE(users.email_verified_at, NOW(3))`,
      [v.id, v.username, passwordHash, v.name, UserRole.STORE_ADMIN, agencyId]
    );
  }

  for (const u of REPARTIDORES) {
    const passwordHash = await hash(u.password);
    const locTime = new Date(now);
    await pool.query(
      `INSERT INTO users (id, username, password_hash, name, role, agency_id, current_lat, current_lng, location_updated_at,
        departure_address, departure_lat, departure_lng, delivery_zone, email_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NOW(3))
       ON DUPLICATE KEY UPDATE username = VALUES(username), password_hash = VALUES(password_hash), name = VALUES(name), role = VALUES(role),
         agency_id = VALUES(agency_id), delivery_zone = VALUES(delivery_zone),
         current_lat = VALUES(current_lat), current_lng = VALUES(current_lng),
         location_updated_at = VALUES(location_updated_at),
         email_verified_at = COALESCE(users.email_verified_at, NOW(3))`,
      [u.id, u.username, passwordHash, u.name, UserRole.REPARTIDOR, agencyId, u.lat, u.lng, locTime, u.zone]
    );
  }

  await bindDemoUsersToAgency();
  await markDemoUsersEmailVerified();
  await activateDemoSubscription();

  const pickupPoints = [
    { id: 'pp1', userId: 'u1', label: 'Depósito principal', address: 'Av. Rivadavia 4500, Caballito, CABA', lat: -34.6186, lng: -58.4352 },
    { id: 'pp2', userId: 'u1', label: 'Sucursal norte', address: 'Av. Cabildo 1500, Belgrano, CABA', lat: -34.555, lng: -58.455 },
    { id: 'pp3', userId: 'u6', label: 'Showroom Palermo', address: 'Honduras 4800, Palermo, CABA', lat: -34.5912, lng: -58.4289 },
    { id: 'pp4', userId: 'u7', label: 'Depósito tech', address: 'Av. Córdoba 5100, Villa Crespo, CABA', lat: -34.5978, lng: -58.4356 },
    { id: 'pp5', userId: 'u8', label: 'Centro de distribución', address: 'Av. San Martín 2200, Flores, CABA', lat: -34.6312, lng: -58.4456 },
    { id: 'pp6', userId: 'u9', label: 'Local Belgrano', address: 'Av. Cabildo 2800, Belgrano, CABA', lat: -34.5589, lng: -58.4612 },
    { id: 'pp7', userId: 'u10', label: 'Cocina central', address: 'Defensa 1200, San Telmo, CABA', lat: -34.6212, lng: -58.3712 },
    { id: 'pp8', userId: 'u11', label: 'Tienda mascotas', address: 'Av. Forest 1200, Colegiales, CABA', lat: -34.5789, lng: -58.4512 },
  ];

  for (const p of pickupPoints) {
    await pool.query(
      `INSERT INTO pickup_points (id, user_id, label, address, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), address = VALUES(address), lat = VALUES(lat), lng = VALUES(lng)`,
      [p.id, p.userId, p.label, p.address, p.lat, p.lng, new Date(now)]
    );
  }

  await seedDefaultZonesForAgency(agencyId);
  await ensureCordonZonesForAgency(agencyId);

  await clearDemoAgencyOrders();
  const orders = generateDemoOrders();
  const hasTrackingCode = await columnExists('orders', 'public_tracking_code');

  for (const o of orders) {
    const trackingCode =
      hasTrackingCode && o.externalSource !== 'mercadolibre' ? generatePublicTrackingCode() : null;

    if (hasTrackingCode) {
      await pool.query(
        `INSERT INTO orders (id, agency_id, seller_id, external_source, external_order_id, public_tracking_code,
           shipping_type, client_name, client_phone, address, lat, lng, status, repartidor_id, notes, created_at, updated_at, delivery_deadline)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          o.id, agencyId, o.sellerId, o.externalSource, o.externalOrderId, trackingCode,
          o.shippingType, o.clientName, o.clientPhone, o.address, o.lat, o.lng,
          o.status, o.repartidorId, o.notes, o.createdAt, o.updatedAt, o.deliveryDeadline,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO orders (id, agency_id, seller_id, external_source, external_order_id, shipping_type,
           client_name, client_phone, address, lat, lng, status, repartidor_id, notes, created_at, updated_at, delivery_deadline)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          o.id, agencyId, o.sellerId, o.externalSource, o.externalOrderId, o.shippingType,
          o.clientName, o.clientPhone, o.address, o.lat, o.lng,
          o.status, o.repartidorId, o.notes, o.createdAt, o.updatedAt, o.deliveryDeadline,
        ]
      );
    }

    for (const h of o.history) {
      await pool.query(
        `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, '', ?)`,
        [o.id, h.status, h.by, new Date(now + h.offset)]
      );
    }

    for (const loc of o.locations) {
      await pool.query(
        `INSERT INTO order_location_history (order_id, lat, lng, created_at) VALUES (?, ?, ?, ?)`,
        [o.id, loc.lat, loc.lng, new Date(now + loc.offset)]
      );
    }
  }

  await seedDriverGpsTrails(orders);
  const scanCount = await seedDriverScans(orders);

  for (const o of orders.filter((order) => order.status === OrderStatus.DELIVERED)) {
    try {
      const full = await getOrderById(o.id);
      if (full) await chargeOrderOnDelivery(full);
    } catch (err) {
      console.warn(`[seed] No se pudo facturar ${o.id}:`, err);
    }
  }

  const notifications = [
    {
      id: 'n1',
      userId: 'u5',
      title: '¡Bienvenido al sistema Lupo!',
      body: 'Nueva PWA de rastreo de pedidos activa. Repartidores, recuerden activar el GPS al iniciar un envío.',
      createdAt: new Date(now - 7200000),
      type: 'info' as const,
      orderId: null,
    },
    {
      id: 'n2',
      userId: 'u3',
      title: 'Nuevo pedido asignado',
      body: 'Se te ha asignado el pedido DEMO-2002 para Sofía Martínez (TechBA Electro).',
      createdAt: new Date(now - 1200000),
      type: 'order_assigned' as const,
      orderId: demoOrderId(2002),
    },
    {
      id: 'n3',
      userId: 'u2',
      title: 'Pedido en camino',
      body: 'DEMO-2001 de Moda Norte Boutique está en reparto hacia Recoleta.',
      createdAt: new Date(now - 1800000),
      type: 'order_assigned' as const,
      orderId: demoOrderId(2001),
    },
    {
      id: 'n4',
      userId: 'u5',
      title: 'Demo multi-vendedor activa',
      body: 'Cuenta demo lista: 7 vendedores, 5 repartidores en vivo, pedidos del día y escaneos cargados. Usuario logistica / logistica123.',
      createdAt: new Date(now - 300000),
      type: 'info' as const,
      orderId: null,
    },
  ];

  for (const n of notifications) {
    await pool.query(
      `INSERT INTO notifications (id, user_id, title, body, type, order_id, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body), user_id = VALUES(user_id)`,
      [n.id, n.userId, n.title, n.body, n.type, n.orderId, n.createdAt]
    );
  }

  console.log(
    `Seed completado: ${VENDORS.length} vendedores, ${orders.length} pedidos, ${REPARTIDORES.length} repartidores, ${scanCount} escaneos, zonas y notificaciones demo.`
  );
}
