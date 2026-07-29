import { randomUUID } from 'crypto';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database.js';
import { User, UserRole } from '../types/index.js';
import { getOperationalDateKey } from '../utils/delivery-deadline.js';
import { isAgencyAdmin } from '../utils/roles.js';

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
  scanned_at: Date | string;
  delivered_at: Date | string | null;
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

/** Self-heal: crea la tabla si el migrate no corrió aún. */
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
    })().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

export async function createDriverScanEntry(
  user: User,
  data: { code: string; note?: string; lat?: number; lng?: number; routeDate?: string }
): Promise<DriverScanEntry> {
  assertRepartidor(user);
  await ensureDriverScanEntriesTable();

  const scanCode = normalizeScanCode(data.code);
  const routeDate =
    data.routeDate && isValidDateKey(data.routeDate) ? data.routeDate : getOperationalDateKey();
  const note = data.note?.trim() ? data.note.trim().slice(0, 500) : null;
  const now = new Date();
  const id = randomUUID();

  const [existingRows] = await pool.query<DbDriverScanRow[]>(
    `SELECT * FROM driver_scan_entries
     WHERE repartidor_id = ? AND route_date = ? AND scan_code = ?
     LIMIT 1`,
    [user.id, routeDate, scanCode]
  );
  if (existingRows[0]) {
    return mapRow(existingRows[0], true);
  }

  try {
    await pool.query<ResultSetHeader>(
      `INSERT INTO driver_scan_entries
        (id, agency_id, repartidor_id, scan_code, route_date, status, note, scanned_at, delivered_at, lat, lng)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NULL, ?, ?)`,
      [
        id,
        user.agencyId,
        user.id,
        scanCode,
        routeDate,
        note,
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
  options?: { date?: string; repartidorId?: string }
): Promise<{ date: string; entries: DriverScanEntry[] }> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) {
    throw new Error('FORBIDDEN');
  }
  await ensureDriverScanEntriesTable();

  const routeDate =
    options?.date && isValidDateKey(options.date) ? options.date : getOperationalDateKey();

  const params: unknown[] = [user.agencyId, routeDate];
  let repartidorFilter = '';
  if (options?.repartidorId?.trim()) {
    repartidorFilter = ' AND e.repartidor_id = ?';
    params.push(options.repartidorId.trim());
  }

  const [rows] = await pool.query<DbDriverScanRow[]>(
    `SELECT e.*, u.name AS repartidor_name
     FROM driver_scan_entries e
     LEFT JOIN users u ON u.id = e.repartidor_id
     WHERE e.agency_id = ? AND e.route_date = ?${repartidorFilter}
     ORDER BY e.scanned_at DESC`,
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
  assertRepartidor(user);
  await ensureDriverScanEntriesTable();

  if (!['pending', 'delivered', 'cancelled'].includes(status)) {
    throw new Error('INVALID_STATUS');
  }

  const [rows] = await pool.query<DbDriverScanRow[]>(
    'SELECT * FROM driver_scan_entries WHERE id = ? AND repartidor_id = ? LIMIT 1',
    [entryId, user.id]
  );
  const existing = rows[0];
  if (!existing) throw new Error('NOT_FOUND');

  const now = new Date();
  const deliveredAt = status === 'delivered' ? now : null;

  await pool.query(
    `UPDATE driver_scan_entries
     SET status = ?, delivered_at = ?
     WHERE id = ? AND repartidor_id = ?`,
    [status, deliveredAt, entryId, user.id]
  );

  const [updated] = await pool.query<DbDriverScanRow[]>(
    'SELECT * FROM driver_scan_entries WHERE id = ? LIMIT 1',
    [entryId]
  );
  if (!updated[0]) throw new Error('NOT_FOUND');
  return mapRow(updated[0]);
}
