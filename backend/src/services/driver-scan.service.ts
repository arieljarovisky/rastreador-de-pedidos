import { randomUUID } from 'crypto';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database.js';
import { User, UserRole } from '../types/index.js';
import { getOperationalDateKey } from '../utils/delivery-deadline.js';
import { isAgencyAdmin } from '../utils/roles.js';
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
  scanCode: string;
  routeDate: string;
  status: DriverScanEntryStatus;
  note: string | null;
  clientName: string | null;
  address: string | null;
  clientPhone: string | null;
  scannedAt: string;
  deliveredAt: string | null;
  alreadyRegistered: boolean;
}

interface DbDriverScanRow extends RowDataPacket {
  id: string;
  agency_id: string;
  repartidor_id: string;
  repartidor_name?: string | null;
  scan_code: string;
  route_date: string | Date;
  status: DriverScanEntryStatus;
  note: string | null;
  client_name?: string | null;
  address?: string | null;
  client_phone?: string | null;
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
    scanCode: row.scan_code,
    routeDate: formatRouteDate(row.route_date),
    status: row.status,
    note: row.note,
    clientName: row.client_name?.trim() ? row.client_name.trim() : null,
    address: row.address?.trim() ? row.address.trim() : null,
    clientPhone: row.client_phone?.trim() ? row.client_phone.trim() : null,
    scannedAt: toIso(row.scanned_at) ?? new Date().toISOString(),
    deliveredAt: toIso(row.delivered_at),
    alreadyRegistered,
  };
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
          scan_code VARCHAR(255) NOT NULL,
          route_date DATE NOT NULL,
          status ENUM('pending', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
          note VARCHAR(500) NULL,
          client_name VARCHAR(255) NULL,
          address VARCHAR(500) NULL,
          client_phone VARCHAR(64) NULL,
          scanned_at DATETIME(3) NOT NULL,
          delivered_at DATETIME(3) NULL,
          lat DECIMAL(10, 7) NULL,
          lng DECIMAL(10, 7) NULL,
          UNIQUE KEY uk_driver_scan_day_code (repartidor_id, route_date, scan_code),
          INDEX idx_driver_scan_repartidor_date (repartidor_id, route_date),
          INDEX idx_driver_scan_agency_date (agency_id, route_date),
          CONSTRAINT fk_driver_scan_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_driver_scan_repartidor FOREIGN KEY (repartidor_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      const [cols] = await pool.query<Array<{ COLUMN_NAME: string } & RowDataPacket>>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'driver_scan_entries'
           AND COLUMN_NAME IN ('client_name', 'address', 'client_phone')`
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
  }
): Promise<DriverScanEntry> {
  assertRepartidor(user);
  await ensureDriverScanEntriesTable();

  const scanCode = normalizeScanCode(data.code);
  const routeDate =
    data.routeDate && isValidDateKey(data.routeDate) ? data.routeDate : getOperationalDateKey();
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
        if (updated) return mapRow(updated, true);
      }
    }
    return mapRow(existingRows[0], true);
  }

  const contact = manualAddress
    ? { clientName: manualName, address: manualAddress, clientPhone: manualPhone }
    : await lookupMlContactForScan(user, data.code);

  try {
    await pool.query<ResultSetHeader>(
      `INSERT INTO driver_scan_entries
        (id, agency_id, repartidor_id, scan_code, route_date, status, note,
         client_name, address, client_phone, scanned_at, delivered_at, lat, lng)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        id,
        user.agencyId,
        user.id,
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
      if (rows[0]) return mapRow(rows[0], true);
    }
    throw err;
  }

  const [rows] = await pool.query<DbDriverScanRow[]>(
    'SELECT * FROM driver_scan_entries WHERE id = ? LIMIT 1',
    [id]
  );
  if (!rows[0]) throw new Error('NOT_FOUND');
  return mapRow(rows[0], false);
}

export async function listDriverScanEntries(
  user: User,
  options?: { date?: string }
): Promise<DriverScanEntry[]> {
  assertRepartidor(user);
  await ensureDriverScanEntriesTable();

  const routeDate =
    options?.date && isValidDateKey(options.date) ? options.date : getOperationalDateKey();

  const [rows] = await pool.query<DbDriverScanRow[]>(
    `SELECT * FROM driver_scan_entries
     WHERE repartidor_id = ? AND route_date = ?
     ORDER BY scanned_at DESC`,
    [user.id, routeDate]
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
      options?.date && isValidDateKey(options.date) ? options.date : getOperationalDateKey();
    dateFilter = ' AND e.route_date = ?';
    params.push(routeDate);
  }

  let repartidorFilter = '';
  if (options?.repartidorId?.trim()) {
    repartidorFilter = ' AND e.repartidor_id = ?';
    params.push(options.repartidorId.trim());
  }

  const [rows] = await pool.query<DbDriverScanRow[]>(
    `SELECT e.*, u.name AS repartidor_name
     FROM driver_scan_entries e
     LEFT JOIN users u ON u.id = e.repartidor_id
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

  const [updated] = await pool.query<DbDriverScanRow[]>(
    'SELECT * FROM driver_scan_entries WHERE id = ? LIMIT 1',
    [entryId]
  );
  if (!updated[0]) throw new Error('NOT_FOUND');
  return mapRow(updated[0]);
}

/** Completa o corrige destinatario/dirección de un registro personal (p. ej. leídos de la etiqueta). */
export async function updateDriverScanEntryDetails(
  user: User,
  entryId: string,
  data: { clientName?: string; address?: string; clientPhone?: string }
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

  await pool.query(
    `UPDATE driver_scan_entries
     SET client_name = ?, address = ?, client_phone = ?
     WHERE id = ? AND repartidor_id = ?`,
    [clientName, address, clientPhone, entryId, user.id]
  );

  const [updated] = await pool.query<DbDriverScanRow[]>(
    'SELECT * FROM driver_scan_entries WHERE id = ? LIMIT 1',
    [entryId]
  );
  if (!updated[0]) throw new Error('NOT_FOUND');
  return mapRow(updated[0]);
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
