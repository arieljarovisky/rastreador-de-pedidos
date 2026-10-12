import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database.js';
import { OrderStatus, User, UserRole } from '../types/index.js';
import {
  computeDeliveryDeadline,
  getActiveOperationalDateKey,
} from '../utils/delivery-deadline.js';
import { isAgencyAdmin } from '../utils/roles.js';
import { getAgencyDeparture } from './agencies.service.js';
import { resolveClosedDateKeys } from './closed-days.service.js';
import { geocodeAddress } from './geocode.service.js';
import { emitOrderUpdated } from '../realtime/io.js';
import {
  assertSellerInAgency,
  getUserById,
  resolveSalesCutoffHour,
  resolveWorksOnHolidays,
} from './users.service.js';
import {
  getIntegration,
  listMercadoLibreIntegrationsForAgencyScan,
  type StoreIntegration,
} from './integrations.service.js';
import {
  extractContactFromMlShipment,
  fetchMercadoLibreShipment,
  parseMercadoLibreScanCode,
  registerMercadoLibreCourierShipment,
  resolveMercadoLibreFlexFromScan,
  tryGetValidMercadoLibreIntegration,
  type MercadoLibreScanCandidate,
} from './mercadolibre.service.js';

export type DriverScanEntryStatus = 'pending' | 'delivered' | 'cancelled';

export interface DriverScanEntry {
  id: string;
  agencyId: string;
  repartidorId: string;
  repartidorName?: string;
  sellerId: string | null;
  sellerName?: string | null;
  scanCode: string;
  routeDate: string;
  status: DriverScanEntryStatus;
  note: string | null;
  clientName: string | null;
  address: string | null;
  clientPhone: string | null;
  hasPhoto: boolean;
  /** Pedido Posta creado para que la etiqueta se entregue como un envío de Mercado Libre. */
  orderId?: string | null;
  scannedAt: string;
  deliveredAt: string | null;
  alreadyRegistered: boolean;
}

interface DbDriverScanRow extends RowDataPacket {
  id: string;
  agency_id: string;
  repartidor_id: string;
  repartidor_name?: string | null;
  seller_id?: string | null;
  seller_name?: string | null;
  scan_code: string;
  route_date: string | Date;
  status: DriverScanEntryStatus;
  note: string | null;
  client_name?: string | null;
  address?: string | null;
  client_phone?: string | null;
  photo_path?: string | null;
  order_id?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  scanned_at: Date | string;
  delivered_at: Date | string | null;
}

interface MlContactInfo {
  clientName: string | null;
  address: string | null;
  clientPhone: string | null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function formatRouteDate(value: string | Date): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  // mysql2 entrega DATE como Date en medianoche UTC; usamos UTC para no correr el día.
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mapRow(row: DbDriverScanRow, alreadyRegistered = false): DriverScanEntry {
  return {
    id: row.id,
    agencyId: row.agency_id,
    repartidorId: row.repartidor_id,
    repartidorName: row.repartidor_name ?? undefined,
    sellerId: row.seller_id?.trim() ? row.seller_id.trim() : null,
    sellerName: row.seller_name?.trim() ? row.seller_name.trim() : null,
    scanCode: row.scan_code,
    routeDate: formatRouteDate(row.route_date),
    status: row.status,
    note: row.note,
    clientName: row.client_name?.trim() ? row.client_name.trim() : null,
    address: row.address?.trim() ? row.address.trim() : null,
    clientPhone: row.client_phone?.trim() ? row.client_phone.trim() : null,
    hasPhoto: Boolean(row.photo_path?.trim()),
    orderId: row.order_id?.trim() ? row.order_id.trim() : null,
    scannedAt: toIso(row.scanned_at) ?? new Date().toISOString(),
    deliveredAt: toIso(row.delivered_at),
    alreadyRegistered,
  };
}

const ENTRY_SELECT = `e.*, u.name AS repartidor_name, s.name AS seller_name`;
const ENTRY_FROM = `FROM driver_scan_entries e
  LEFT JOIN users u ON u.id = e.repartidor_id
  LEFT JOIN users s ON s.id = e.seller_id`;

async function loadEntry(id: string, alreadyRegistered = false): Promise<DriverScanEntry> {
  const [rows] = await pool.query<DbDriverScanRow[]>(
    `SELECT ${ENTRY_SELECT} ${ENTRY_FROM} WHERE e.id = ? LIMIT 1`,
    [id]
  );
  if (!rows[0]) throw new Error('NOT_FOUND');
  return mapRow(rows[0], alreadyRegistered);
}

async function resolveScanSeller(user: User, sellerId: string | undefined): Promise<string | null> {
  const trimmed = sellerId?.trim();
  if (!trimmed) return null;
  if (!user.agencyId) throw new Error('FORBIDDEN');
  const seller = await assertSellerInAgency(trimmed, user.agencyId);
  return seller.id;
}

const scanPhotoDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../uploads/driver-scans'
);

/** Si no eligieron vendedor, usa el dueño del QR de Mercado Libre cuando está en la agencia. */
async function resolveAutomaticSeller(user: User, rawCode: string): Promise<string | null> {
  if (!user.agencyId) return null;
  const senderId = extractSenderIdFromScan(rawCode);
  if (!senderId) return null;
  try {
    const contexts = await listMercadoLibreIntegrationsForAgencyScan(user.agencyId);
    const owner = contexts.find((ctx) => ctx.integration.externalUserId === senderId);
    if (!owner) return null;
    const seller = await assertSellerInAgency(owner.integration.userId, user.agencyId);
    return seller.id;
  } catch (err) {
    if (err instanceof Error && err.message === 'SELLER_NOT_FOUND') return null;
    throw err;
  }
}

export async function attachDriverScanPhoto(
  user: User,
  entryId: string,
  image: Buffer
): Promise<DriverScanEntry> {
  assertRepartidor(user);
  await ensureDriverScanEntriesTable();
  const [rows] = await pool.query<DbDriverScanRow[]>(
    'SELECT id FROM driver_scan_entries WHERE id = ? AND repartidor_id = ? LIMIT 1',
    [entryId, user.id]
  );
  if (!rows[0]) throw new Error('NOT_FOUND');
  await mkdir(scanPhotoDir, { recursive: true });
  const filename = `${entryId}.jpg`;
  await writeFile(path.join(scanPhotoDir, filename), image);
  await pool.query('UPDATE driver_scan_entries SET photo_path = ? WHERE id = ?', [filename, entryId]);
  await ensurePhotoLabelOrder(entryId);
  return loadEntry(entryId);
}

const PHOTO_ORDER_SOURCE = 'foto';
const promotingPhotoOrders = new Map<string, Promise<string | null>>();

function coord(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Una etiqueta fotografiada pasa a ser un pedido Posta: mismo corte de ventas
 * y mismo día de entrega que un envío de Mercado Libre, asignado al repartidor
 * que sacó la foto.
 */
export async function ensurePhotoLabelOrder(entryId: string): Promise<string | null> {
  const inflight = promotingPhotoOrders.get(entryId);
  if (inflight) return inflight;
  const job = promotePhotoLabelOrder(entryId).finally(() => {
    promotingPhotoOrders.delete(entryId);
  });
  promotingPhotoOrders.set(entryId, job);
  return job;
}

async function promotePhotoLabelOrder(entryId: string): Promise<string | null> {
  await ensureDriverScanEntriesTable();
  const [rows] = await pool.query<DbDriverScanRow[]>(
    'SELECT * FROM driver_scan_entries WHERE id = ? LIMIT 1',
    [entryId]
  );
  const row = rows[0];
  if (!row?.photo_path?.trim()) return null;
  if (row.order_id?.trim()) return row.order_id.trim();

  const repartidor = await getUserById(row.repartidor_id);
  if (!repartidor || repartidor.role !== UserRole.REPARTIDOR) return null;

  const address = row.address?.trim() ? row.address.trim().slice(0, 500) : '';
  let lat: number | null = null;
  let lng: number | null = null;
  if (address) {
    try {
      const geo = await geocodeAddress(address);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    } catch (err) {
      console.warn('[driver-scan] geocode foto:', err);
    }
  }
  const departure = lat == null || lng == null ? await getAgencyDeparture(row.agency_id) : null;
  if (lat == null || lng == null) {
    lat = departure?.lat ?? coord(row.lat);
    lng = departure?.lng ?? coord(row.lng);
  }
  if (lat == null || lng == null) {
    console.warn('[driver-scan] foto sin coordenadas', entryId);
    return null;
  }

  const scannedAt = new Date(row.scanned_at);
  const soldAt = Number.isNaN(scannedAt.getTime()) ? new Date() : scannedAt;
  const clientName = row.client_name?.trim() || 'Etiqueta sin QR';
  const orderAddress = address || departure?.address || 'Dirección en la foto de la etiqueta';

  const {
    createOrder,
    assignOrderToScanningRepartidor,
    findOrderByExternalForAgency,
    updateOrderStatus,
  } = await import('./orders.service.js');

  try {
    let order = await createOrder(repartidor, {
      clientName,
      clientPhone: row.client_phone?.trim() || undefined,
      address: orderAddress,
      lat,
      lng,
      notes: 'Etiqueta fotografiada, sin código QR.',
      sellerId: row.seller_id?.trim() || undefined,
      externalSource: PHOTO_ORDER_SOURCE,
      externalOrderId: row.id,
      soldAt,
      historyComment: 'Etiqueta sin QR. La foto es la etiqueta de envío.',
    });
    order = await assignOrderToScanningRepartidor(
      repartidor,
      order.id,
      'Asignado al repartidor que fotografió la etiqueta'
    );
    if (row.status === 'delivered' || row.status === 'cancelled') {
      order = await updateOrderStatus(
        repartidor,
        order.id,
        row.status === 'delivered' ? OrderStatus.DELIVERED : OrderStatus.CANCELLED,
        undefined,
        row.status === 'delivered' ? 'Entregado con la etiqueta foto' : 'Cancelado'
      );
    }
    await pool.query('UPDATE driver_scan_entries SET order_id = ? WHERE id = ?', [order.id, row.id]);
    emitOrderUpdated(order, order.sellerId ?? row.seller_id ?? null);
    return order.id;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ERROR';
    if (message === 'EXTERNAL_ORDER_EXISTS') {
      const existing = await findOrderByExternalForAgency(row.agency_id, PHOTO_ORDER_SOURCE, row.id);
      if (existing) {
        await pool.query('UPDATE driver_scan_entries SET order_id = ? WHERE id = ?', [
          existing.id,
          row.id,
        ]);
        return existing.id;
      }
    }
    console.warn('[driver-scan] no se pudo crear el pedido de la foto', entryId, err);
    return null;
  }
}

/** Convierte etiquetas con foto que todavía no son pedidos. Pocas por vez para no frenar el listado. */
export async function promotePendingPhotoLabels(user: User): Promise<void> {
  await ensureDriverScanEntriesTable();
  const params: unknown[] = [];
  let scope = '';
  if (isAgencyAdmin(user.role) && user.agencyId) {
    scope = 'AND agency_id = ?';
    params.push(user.agencyId);
  } else if (user.role === UserRole.STORE_ADMIN) {
    scope = 'AND seller_id = ?';
    params.push(user.id);
  } else if (user.role === UserRole.REPARTIDOR) {
    scope = 'AND repartidor_id = ?';
    params.push(user.id);
  } else {
    return;
  }
  const [rows] = await pool.query<Array<{ id: string } & DbDriverScanRow>>(
    `SELECT id FROM driver_scan_entries
     WHERE photo_path IS NOT NULL AND photo_path <> ''
       AND (order_id IS NULL OR order_id = '')
       ${scope}
     ORDER BY scanned_at DESC
     LIMIT 3`,
    params
  );
  for (const row of rows) {
    await ensurePhotoLabelOrder(row.id);
  }
}

async function syncLinkedPhotoOrder(entryId: string): Promise<void> {
  await ensureDriverScanEntriesTable();
  const [rows] = await pool.query<DbDriverScanRow[]>(
    'SELECT * FROM driver_scan_entries WHERE id = ? LIMIT 1',
    [entryId]
  );
  const row = rows[0];
  if (!row?.photo_path?.trim()) return;
  if (!row.order_id?.trim()) {
    await ensurePhotoLabelOrder(entryId);
    return;
  }

  const address = row.address?.trim() ? row.address.trim().slice(0, 500) : '';
  let lat: number | null = null;
  let lng: number | null = null;
  if (address) {
    try {
      const geo = await geocodeAddress(address);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    } catch {
      // se conserva el pin anterior
    }
  }

  const sellerId = row.seller_id?.trim() || null;
  const scannedAt = new Date(row.scanned_at);
  const soldAt = Number.isNaN(scannedAt.getTime()) ? new Date() : scannedAt;
  const deadlineHour = await resolveSalesCutoffHour({
    sellerId,
    agencyId: row.agency_id,
  });
  const worksOnHolidays = await resolveWorksOnHolidays({
    sellerId,
    agencyId: row.agency_id,
  });
  const closedDateKeys = await resolveClosedDateKeys({
    agencyId: row.agency_id,
    sellerId,
  });
  const deliveryDeadline = computeDeliveryDeadline(soldAt, deadlineHour, {
    worksOnHolidays,
    closedDateKeys,
  });

  await pool.query(
    `UPDATE orders
     SET client_name = ?,
         client_phone = ?,
         address = ?,
         seller_id = ?,
         delivery_deadline = ?,
         lat = COALESCE(?, lat),
         lng = COALESCE(?, lng),
         updated_at = ?
     WHERE id = ? AND external_source = ?`,
    [
      row.client_name?.trim() || 'Etiqueta sin QR',
      row.client_phone?.trim() || '',
      address || 'Dirección en la foto de la etiqueta',
      sellerId,
      deliveryDeadline,
      lat,
      lng,
      new Date(),
      row.order_id.trim(),
      PHOTO_ORDER_SOURCE,
    ]
  );
}

export async function getDriverScanPhotoPath(user: User, entryId: string): Promise<string> {
  await ensureDriverScanEntriesTable();
  const [rows] = await pool.query<
    Array<{ photo_path: string | null; repartidor_id: string; agency_id: string; seller_id: string | null } & RowDataPacket>
  >(
    `SELECT photo_path, repartidor_id, agency_id, seller_id
     FROM driver_scan_entries WHERE id = ? LIMIT 1`,
    [entryId]
  );
  const row = rows[0];
  if (!row?.photo_path) throw new Error('NOT_FOUND');
  const allowed =
    (user.role === UserRole.REPARTIDOR && row.repartidor_id === user.id) ||
    (isAgencyAdmin(user.role) && user.agencyId === row.agency_id) ||
    (user.role === UserRole.STORE_ADMIN && row.seller_id === user.id);
  if (!allowed) throw new Error('FORBIDDEN');
  return path.join(scanPhotoDir, path.basename(row.photo_path));
}

function assertRepartidor(user: User): asserts user is User & { agencyId: string } {
  if (user.role !== UserRole.REPARTIDOR || !user.agencyId) {
    throw new Error('FORBIDDEN');
  }
}

/**
 * Extrae un código legible/estable del payload del QR.
 * Los QR de ML Flex suelen ser JSON `{"id":"…","sender_id":…,"hash_code":"…"}`.
 */
function normalizeScanCode(raw: string): string {
  const code = raw.trim().replace(/\s+/g, ' ');
  if (!code) throw new Error('INVALID_CODE');

  if (code.startsWith('{')) {
    try {
      const parsed = JSON.parse(code) as Record<string, unknown>;
      const id = parsed.id ?? parsed.shipment_id ?? parsed.shipping_id ?? parsed.order_id;
      if (id != null && String(id).trim()) {
        return String(id).trim().slice(0, 255);
      }
    } catch {
      // seguir con el string original
    }
  }

  if (code.length > 255) return code.slice(0, 255);
  return code;
}

function isValidDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

let tableReady: Promise<void> | null = null;

/** Self-heal: crea la tabla / columnas si el migrate no corrió aún. */
export function ensureDriverScanEntriesTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS driver_scan_entries (
          id VARCHAR(36) PRIMARY KEY,
          agency_id VARCHAR(36) NOT NULL,
          repartidor_id VARCHAR(36) NOT NULL,
          seller_id VARCHAR(36) NULL,
          scan_code VARCHAR(255) NOT NULL,
          route_date DATE NOT NULL,
          status ENUM('pending', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
          note VARCHAR(500) NULL,
          client_name VARCHAR(255) NULL,
          address VARCHAR(500) NULL,
          client_phone VARCHAR(64) NULL,
          photo_path VARCHAR(255) NULL,
          scanned_at DATETIME(3) NOT NULL,
          delivered_at DATETIME(3) NULL,
          lat DECIMAL(10, 7) NULL,
          lng DECIMAL(10, 7) NULL,
          UNIQUE KEY uk_driver_scan_day_code (repartidor_id, route_date, scan_code),
          INDEX idx_driver_scan_repartidor_date (repartidor_id, route_date),
          INDEX idx_driver_scan_agency_date (agency_id, route_date),
          INDEX idx_driver_scan_seller (seller_id),
          CONSTRAINT fk_driver_scan_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_driver_scan_repartidor FOREIGN KEY (repartidor_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      const [cols] = await pool.query<Array<{ COLUMN_NAME: string } & RowDataPacket>>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'driver_scan_entries'
           AND COLUMN_NAME IN ('client_name', 'address', 'client_phone', 'seller_id', 'photo_path', 'order_id')`
      );
      const have = new Set(cols.map((c) => c.COLUMN_NAME));
      if (!have.has('client_name')) {
        await pool.query(
          'ALTER TABLE driver_scan_entries ADD COLUMN client_name VARCHAR(255) NULL AFTER note'
        );
      }
      if (!have.has('address')) {
        await pool.query(
          'ALTER TABLE driver_scan_entries ADD COLUMN address VARCHAR(500) NULL AFTER client_name'
        );
      }
      if (!have.has('client_phone')) {
        await pool.query(
          'ALTER TABLE driver_scan_entries ADD COLUMN client_phone VARCHAR(64) NULL AFTER address'
        );
      }
      if (!have.has('seller_id')) {
        await pool.query(
          'ALTER TABLE driver_scan_entries ADD COLUMN seller_id VARCHAR(36) NULL AFTER repartidor_id'
        );
        await pool.query(
          'ALTER TABLE driver_scan_entries ADD INDEX idx_driver_scan_seller (seller_id)'
        );
      }
      if (!have.has('photo_path')) {
        await pool.query(
          'ALTER TABLE driver_scan_entries ADD COLUMN photo_path VARCHAR(255) NULL AFTER client_phone'
        );
      }
      if (!have.has('order_id')) {
        await pool.query(
          'ALTER TABLE driver_scan_entries ADD COLUMN order_id VARCHAR(36) NULL AFTER photo_path'
        );
        await pool.query(
          'ALTER TABLE driver_scan_entries ADD INDEX idx_driver_scan_order (order_id)'
        );
      }
    })().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

/** `sender_id` del JSON del QR Flex (vendedor dueño del envío). */
function extractSenderIdFromScan(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed.sender_id != null && String(parsed.sender_id).trim()) {
      return String(parsed.sender_id).trim();
    }
  } catch {
    // ignore
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readContactWithIntegration(
  integration: StoreIntegration,
  candidates: MercadoLibreScanCandidate[]
): Promise<MlContactInfo | null> {
  const valid = await tryGetValidMercadoLibreIntegration(integration.userId);
  if (!valid) return null;

  const flex = await resolveMercadoLibreFlexFromScan(valid, candidates);
  if (flex?.address) {
    return {
      clientName: flex.clientName?.trim() || null,
      address: flex.address.trim(),
      clientPhone: flex.clientPhone?.trim() || null,
    };
  }

  for (const candidate of candidates) {
    if (candidate.type !== 'shipment') continue;
    try {
      const shipment = await fetchMercadoLibreShipment(valid, candidate.id, {
        quietStatuses: [403, 404],
      });
      const contact = extractContactFromMlShipment(shipment);
      if (contact?.address) {
        return {
          clientName: contact.clientName?.trim() || null,
          address: contact.address.trim(),
          clientPhone: contact.clientPhone?.trim() || null,
        };
      }
    } catch {
      // siguiente candidato
    }
  }
  return null;
}

/**
 * Intenta obtener destinatario/dirección desde ML (token repartidor + vendedores de la agencia).
 * Prioriza el `sender_id` del QR (vendedor dueño) y el token de mensajería tras courier-shipment.
 * No falla el alta personal si ML no responde o el envío no es legible.
 */
async function lookupMlContactForScan(
  user: User & { agencyId: string },
  rawCode: string
): Promise<MlContactInfo | null> {
  const candidates = parseMercadoLibreScanCode(rawCode);
  if (candidates.length === 0) return null;

  try {
    const contexts = await listMercadoLibreIntegrationsForAgencyScan(user.agencyId);
    const senderId = extractSenderIdFromScan(rawCode);
    const integrations: StoreIntegration[] = [];

    // 1) Vendedor dueño del envío (sender_id del QR), si está conectado en la agencia.
    if (senderId) {
      const owner = contexts.find((ctx) => ctx.integration.externalUserId === senderId);
      if (owner) integrations.push(owner.integration);
    }

    // 2) Token del repartidor (mensajería): registrar courier y leer.
    const repartidorMl = await getIntegration(user.id, 'mercadolibre');
    let courierRegistered = false;
    if (repartidorMl) {
      for (const candidate of candidates) {
        if (candidate.type !== 'shipment') continue;
        try {
          const reg = await registerMercadoLibreCourierShipment(repartidorMl, candidate.id);
          if (reg.ok) courierRegistered = true;
        } catch (err) {
          console.warn('[driver-scan] courier-shipment error:', err);
        }
      }
      if (!integrations.some((i) => i.userId === repartidorMl.userId)) {
        integrations.push(repartidorMl);
      }
      // Tras registrar, ML a veces demora en habilitar PII al courier.
      if (courierRegistered) await sleep(500);
    }

    // 3) Resto de vendedores de la agencia.
    for (const { integration } of contexts) {
      if (!integrations.some((i) => i.userId === integration.userId)) {
        integrations.push(integration);
      }
    }

    for (const integration of integrations) {
      const contact = await readContactWithIntegration(integration, candidates);
      if (contact?.address) {
        console.log('[driver-scan] ML contact ok', {
          viaUserId: integration.userId,
          shipmentHint: candidates.find((c) => c.type === 'shipment')?.id,
          hasName: Boolean(contact.clientName),
        });
        return contact;
      }
    }

    console.warn('[driver-scan] ML contact no disponible', {
      agencyId: user.agencyId,
      senderId,
      candidates,
      tried: integrations.map((i) => i.userId),
      courierRegistered,
    });
  } catch (err) {
    console.warn('[driver-scan] lookup ML contact failed:', err);
  }

  return null;
}

async function persistContactOnEntry(
  entryId: string,
  contact: MlContactInfo
): Promise<DbDriverScanRow | null> {
  await pool.query(
    `UPDATE driver_scan_entries
     SET client_name = ?, address = ?, client_phone = ?
     WHERE id = ?`,
    [
      contact.clientName?.slice(0, 255) ?? null,
      contact.address?.slice(0, 500) ?? null,
      contact.clientPhone?.slice(0, 64) ?? null,
      entryId,
    ]
  );
  const [rows] = await pool.query<DbDriverScanRow[]>(
    'SELECT * FROM driver_scan_entries WHERE id = ? LIMIT 1',
    [entryId]
  );
  return rows[0] ?? null;
}

export async function createDriverScanEntry(
  user: User,
  data: {
    code: string;
    note?: string;
    lat?: number;
    lng?: number;
    routeDate?: string;
    clientName?: string;
    address?: string;
    clientPhone?: string;
    sellerId?: string;
    /** Sin vendedor elegido: intenta el dueño del QR de Mercado Libre. */
    assignAutomatic?: boolean;
  }
): Promise<DriverScanEntry> {
  assertRepartidor(user);
  await ensureDriverScanEntriesTable();

  let sellerId = await resolveScanSeller(user, data.sellerId);
  if (!sellerId && data.assignAutomatic) {
    sellerId = await resolveAutomaticSeller(user, data.code);
  }
  const scanCode = normalizeScanCode(data.code);
  const routeDate =
    data.routeDate && isValidDateKey(data.routeDate) ? data.routeDate : getActiveOperationalDateKey();
  const note = data.note?.trim() ? data.note.trim().slice(0, 500) : null;
  const manualName = data.clientName?.trim() ? data.clientName.trim().slice(0, 255) : null;
  const manualAddress = data.address?.trim() ? data.address.trim().slice(0, 500) : null;
  const manualPhone = data.clientPhone?.trim() ? data.clientPhone.trim().slice(0, 64) : null;
  const now = new Date();
  const id = randomUUID();

  const [existingRows] = await pool.query<DbDriverScanRow[]>(
    `SELECT * FROM driver_scan_entries
     WHERE repartidor_id = ? AND route_date = ? AND scan_code = ?
     LIMIT 1`,
    [user.id, routeDate, scanCode]
  );
  if (existingRows[0]) {
    if (sellerId && existingRows[0].seller_id !== sellerId) {
      await pool.query('UPDATE driver_scan_entries SET seller_id = ? WHERE id = ?', [
        sellerId,
        existingRows[0].id,
      ]);
    }
    // Reescaneo: completar dirección si todavía no la tenemos.
    if (!existingRows[0].address?.trim()) {
      const contact =
        manualAddress
          ? { clientName: manualName, address: manualAddress, clientPhone: manualPhone }
          : await lookupMlContactForScan(user, data.code);
      if (contact?.address) {
        const updated = await persistContactOnEntry(existingRows[0].id, {
          clientName: contact.clientName ?? manualName,
          address: contact.address,
          clientPhone: contact.clientPhone ?? manualPhone,
        });
        if (updated) return loadEntry(updated.id, true);
      }
    }
    return loadEntry(existingRows[0].id, true);
  }

  const contact = manualAddress
    ? { clientName: manualName, address: manualAddress, clientPhone: manualPhone }
    : await lookupMlContactForScan(user, data.code);

  try {
    await pool.query<ResultSetHeader>(
      `INSERT INTO driver_scan_entries
        (id, agency_id, repartidor_id, seller_id, scan_code, route_date, status, note,
         client_name, address, client_phone, scanned_at, delivered_at, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        id,
        user.agencyId,
        user.id,
        sellerId,
        scanCode,
        routeDate,
        note,
        contact?.clientName?.slice(0, 255) ?? manualName,
        contact?.address?.slice(0, 500) ?? manualAddress,
        contact?.clientPhone?.slice(0, 64) ?? manualPhone,
        now,
        data.lat ?? null,
        data.lng ?? null,
      ]
    );
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'ER_DUP_ENTRY') {
      const [rows] = await pool.query<DbDriverScanRow[]>(
        `SELECT * FROM driver_scan_entries
         WHERE repartidor_id = ? AND route_date = ? AND scan_code = ?
         LIMIT 1`,
        [user.id, routeDate, scanCode]
      );
      if (rows[0]) return loadEntry(rows[0].id, true);
    }
    throw err;
  }

  return loadEntry(id, false);
}

export async function listDriverScanEntries(
  user: User,
  options?: { date?: string }
): Promise<DriverScanEntry[]> {
  assertRepartidor(user);
  await ensureDriverScanEntriesTable();

  const routeDate =
    options?.date && isValidDateKey(options.date) ? options.date : getActiveOperationalDateKey();

  const [rows] = await pool.query<DbDriverScanRow[]>(
    `SELECT ${ENTRY_SELECT} ${ENTRY_FROM}
     WHERE e.repartidor_id = ? AND e.route_date = ?
     ORDER BY e.scanned_at DESC`,
    [user.id, routeDate]
  );
  return rows.map((row) => mapRow(row));
}

/** Etiquetas que un repartidor asoció a este vendedor (sin cuenta de ecommerce). */
export async function listSellerAssignedScanEntries(user: User): Promise<DriverScanEntry[]> {
  if (user.role !== UserRole.STORE_ADMIN) throw new Error('FORBIDDEN');
  await ensureDriverScanEntriesTable();

  const [rows] = await pool.query<DbDriverScanRow[]>(
    `SELECT ${ENTRY_SELECT} ${ENTRY_FROM}
     WHERE e.seller_id = ?
     ORDER BY e.scanned_at DESC
     LIMIT 300`,
    [user.id]
  );
  return rows.map((row) => mapRow(row));
}

export async function listAgencyDriverScanEntries(
  user: User,
  options?: { date?: string; all?: boolean; repartidorId?: string }
): Promise<{ date: string | null; entries: DriverScanEntry[] }> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) {
    throw new Error('FORBIDDEN');
  }
  await ensureDriverScanEntriesTable();

  const params: unknown[] = [user.agencyId];
  let dateFilter = '';
  let routeDate: string | null = null;

  if (!options?.all) {
    routeDate =
      options?.date && isValidDateKey(options.date) ? options.date : getActiveOperationalDateKey();
    dateFilter = ' AND e.route_date = ?';
    params.push(routeDate);
  }

  let repartidorFilter = '';
  if (options?.repartidorId?.trim()) {
    repartidorFilter = ' AND e.repartidor_id = ?';
    params.push(options.repartidorId.trim());
  }

  const [rows] = await pool.query<DbDriverScanRow[]>(
    `SELECT ${ENTRY_SELECT} ${ENTRY_FROM}
     WHERE e.agency_id = ?${dateFilter}${repartidorFilter}
     ORDER BY e.scanned_at DESC
     LIMIT 5000`,
    params
  );

  return {
    date: routeDate,
    entries: rows.map((row) => mapRow(row)),
  };
}

export async function updateDriverScanEntryStatus(
  user: User,
  entryId: string,
  status: DriverScanEntryStatus
): Promise<DriverScanEntry> {
  await ensureDriverScanEntriesTable();

  if (!['pending', 'delivered', 'cancelled'].includes(status)) {
    throw new Error('INVALID_STATUS');
  }

  let existing: DbDriverScanRow | undefined;
  if (user.role === UserRole.REPARTIDOR) {
    assertRepartidor(user);
    const [rows] = await pool.query<DbDriverScanRow[]>(
      'SELECT * FROM driver_scan_entries WHERE id = ? AND repartidor_id = ? LIMIT 1',
      [entryId, user.id]
    );
    existing = rows[0];
  } else if (isAgencyAdmin(user.role) && user.agencyId) {
    const [rows] = await pool.query<DbDriverScanRow[]>(
      'SELECT * FROM driver_scan_entries WHERE id = ? AND agency_id = ? LIMIT 1',
      [entryId, user.agencyId]
    );
    existing = rows[0];
  } else {
    throw new Error('FORBIDDEN');
  }

  if (!existing) throw new Error('NOT_FOUND');

  const now = new Date();
  const deliveredAt = status === 'delivered' ? now : null;

  await pool.query(
    `UPDATE driver_scan_entries
     SET status = ?, delivered_at = ?
     WHERE id = ?`,
    [status, deliveredAt, entryId]
  );

  const orderId = existing.order_id?.trim();
  if (orderId && (status === 'delivered' || status === 'cancelled')) {
    try {
      const actor =
        user.role === UserRole.REPARTIDOR ? user : await getUserById(existing.repartidor_id);
      if (actor) {
        const { updateOrderStatus } = await import('./orders.service.js');
        const order = await updateOrderStatus(
          actor,
          orderId,
          status === 'delivered' ? OrderStatus.DELIVERED : OrderStatus.CANCELLED,
          undefined,
          status === 'delivered' ? 'Entregado con la etiqueta foto' : 'Cancelado'
        );
        emitOrderUpdated(order, order.sellerId ?? existing.seller_id ?? null);
      }
    } catch (err) {
      console.warn('[driver-scan] no se pudo actualizar el pedido de la foto', err);
    }
  }

  return loadEntry(entryId);
}

/** Completa o corrige destinatario/dirección de un registro personal (p. ej. leídos de la etiqueta). */
export async function updateDriverScanEntryDetails(
  user: User,
  entryId: string,
  data: { clientName?: string; address?: string; clientPhone?: string; sellerId?: string }
): Promise<DriverScanEntry> {
  assertRepartidor(user);
  await ensureDriverScanEntriesTable();

  const [rows] = await pool.query<DbDriverScanRow[]>(
    'SELECT * FROM driver_scan_entries WHERE id = ? AND repartidor_id = ? LIMIT 1',
    [entryId, user.id]
  );
  if (!rows[0]) throw new Error('NOT_FOUND');

  const clientName =
    data.clientName !== undefined
      ? data.clientName.trim()
        ? data.clientName.trim().slice(0, 255)
        : null
      : rows[0].client_name ?? null;
  const address =
    data.address !== undefined
      ? data.address.trim()
        ? data.address.trim().slice(0, 500)
        : null
      : rows[0].address ?? null;
  const clientPhone =
    data.clientPhone !== undefined
      ? data.clientPhone.trim()
        ? data.clientPhone.trim().slice(0, 64)
        : null
      : rows[0].client_phone ?? null;

  if (data.address !== undefined && !address) {
    throw new Error('INVALID_ADDRESS');
  }

  const sellerId =
    data.sellerId !== undefined ? await resolveScanSeller(user, data.sellerId) : rows[0].seller_id ?? null;

  await pool.query(
    `UPDATE driver_scan_entries
     SET client_name = ?, address = ?, client_phone = ?, seller_id = ?
     WHERE id = ? AND repartidor_id = ?`,
    [clientName, address, clientPhone, sellerId, entryId, user.id]
  );

  await syncLinkedPhotoOrder(entryId);
  return loadEntry(entryId);
}

/** Elimina un registro personal: el repartidor el propio, la agencia cualquiera de su flota. */
export async function deleteDriverScanEntry(user: User, entryId: string): Promise<void> {
  await ensureDriverScanEntriesTable();

  if (user.role === UserRole.REPARTIDOR) {
    assertRepartidor(user);
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM driver_scan_entries WHERE id = ? AND repartidor_id = ?',
      [entryId, user.id]
    );
    if (result.affectedRows === 0) throw new Error('NOT_FOUND');
    return;
  }

  if (isAgencyAdmin(user.role) && user.agencyId) {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM driver_scan_entries WHERE id = ? AND agency_id = ?',
      [entryId, user.agencyId]
    );
    if (result.affectedRows === 0) throw new Error('NOT_FOUND');
    return;
  }

  throw new Error('FORBIDDEN');
}
