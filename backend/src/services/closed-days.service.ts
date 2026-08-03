import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { User, UserRole } from '../types/index.js';
import { isAgencyAdmin } from '../utils/roles.js';

export interface ClosedDay {
  dateKey: string;
  note: string | null;
  /** null = cierre de toda la agencia; id = solo ese vendedor */
  sellerId: string | null;
  scope: 'agency' | 'seller';
}

let tableReady: Promise<void> | null = null;

export async function ensureOperationalClosedDaysTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS operational_closed_days (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          agency_id VARCHAR(64) NOT NULL,
          seller_id VARCHAR(64) NOT NULL DEFAULT '',
          date_key CHAR(10) NOT NULL,
          note VARCHAR(255) NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          UNIQUE KEY uq_closed_day (agency_id, seller_id, date_key),
          KEY idx_closed_agency_date (agency_id, date_key),
          KEY idx_closed_seller_date (seller_id, date_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  await tableReady;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidClosedDateKey(dateKey: string): boolean {
  if (!DATE_KEY_RE.test(dateKey)) return false;
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

function rowToClosedDay(row: {
  date_key: string;
  note: string | null;
  seller_id: string | null;
}): ClosedDay {
  const sellerId = row.seller_id && row.seller_id.length > 0 ? row.seller_id : null;
  return {
    dateKey: row.date_key,
    note: row.note,
    sellerId,
    scope: sellerId ? 'seller' : 'agency',
  };
}

/** Fechas cerradas efectivas para un contexto (agencia + vendedor). */
export async function listEffectiveClosedDateKeys(opts: {
  agencyId: string;
  sellerId?: string | null;
  fromKey?: string;
  toKey?: string;
}): Promise<string[]> {
  await ensureOperationalClosedDaysTable();
  const params: unknown[] = [opts.agencyId];
  let sql = `
    SELECT DISTINCT date_key
    FROM operational_closed_days
    WHERE agency_id = ?
      AND (seller_id = '' ${opts.sellerId ? 'OR seller_id = ?' : ''})
  `;
  if (opts.sellerId) params.push(opts.sellerId);
  if (opts.fromKey) {
    sql += ' AND date_key >= ?';
    params.push(opts.fromKey);
  }
  if (opts.toKey) {
    sql += ' AND date_key <= ?';
    params.push(opts.toKey);
  }
  sql += ' ORDER BY date_key ASC';
  const [rows] = await pool.query<Array<{ date_key: string } & RowDataPacket>>(sql, params);
  return rows.map((r) => r.date_key);
}

/** Listado editable: agencia ve cierres de agencia; vendedor ve los suyos. */
export async function listClosedDaysForUser(
  user: User,
  opts?: { fromKey?: string; toKey?: string }
): Promise<ClosedDay[]> {
  await ensureOperationalClosedDaysTable();
  if (!user.agencyId) return [];

  const params: unknown[] = [user.agencyId];
  let sql = `
    SELECT date_key, note, seller_id
    FROM operational_closed_days
    WHERE agency_id = ?
  `;

  if (user.role === UserRole.STORE_ADMIN) {
    sql += ' AND seller_id = ?';
    params.push(user.id);
  } else if (isAgencyAdmin(user.role)) {
    sql += " AND seller_id = ''";
  } else {
    return [];
  }

  if (opts?.fromKey) {
    sql += ' AND date_key >= ?';
    params.push(opts.fromKey);
  }
  if (opts?.toKey) {
    sql += ' AND date_key <= ?';
    params.push(opts.toKey);
  }
  sql += ' ORDER BY date_key ASC';

  const [rows] = await pool.query<
    Array<{ date_key: string; note: string | null; seller_id: string | null } & RowDataPacket>
  >(sql, params);
  return rows.map(rowToClosedDay);
}

export async function addClosedDay(
  user: User,
  dateKey: string,
  note?: string | null
): Promise<ClosedDay> {
  await ensureOperationalClosedDaysTable();
  if (!user.agencyId) throw new Error('NO_AGENCY');
  if (!isValidClosedDateKey(dateKey)) throw new Error('INVALID_DATE');

  const trimmedNote = note?.trim() ? note.trim().slice(0, 255) : null;
  let sellerId = '';

  if (user.role === UserRole.STORE_ADMIN) {
    sellerId = user.id;
  } else if (!isAgencyAdmin(user.role)) {
    throw new Error('FORBIDDEN');
  }

  await pool.query(
    `INSERT INTO operational_closed_days (agency_id, seller_id, date_key, note)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE note = VALUES(note)`,
    [user.agencyId, sellerId, dateKey, trimmedNote]
  );

  return {
    dateKey,
    note: trimmedNote,
    sellerId: sellerId || null,
    scope: sellerId ? 'seller' : 'agency',
  };
}

export async function removeClosedDay(user: User, dateKey: string): Promise<void> {
  await ensureOperationalClosedDaysTable();
  if (!user.agencyId) throw new Error('NO_AGENCY');
  if (!isValidClosedDateKey(dateKey)) throw new Error('INVALID_DATE');

  if (user.role === UserRole.STORE_ADMIN) {
    await pool.query(
      `DELETE FROM operational_closed_days
       WHERE agency_id = ? AND seller_id = ? AND date_key = ?`,
      [user.agencyId, user.id, dateKey]
    );
    return;
  }

  if (!isAgencyAdmin(user.role)) throw new Error('FORBIDDEN');

  await pool.query(
    `DELETE FROM operational_closed_days
     WHERE agency_id = ? AND seller_id = '' AND date_key = ?`,
    [user.agencyId, dateKey]
  );
}

/** Cache helper para resolución de plazos. */
export async function resolveClosedDateKeys(opts: {
  agencyId?: string | null;
  sellerId?: string | null;
}): Promise<string[]> {
  if (!opts.agencyId) return [];
  return listEffectiveClosedDateKeys({
    agencyId: opts.agencyId,
    sellerId: opts.sellerId,
  });
}
