import { ResultSetHeader, RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { DbUserRow, LocationPoint, PickupPoint, User, UserRole, OrderStatus } from '../types/index.js';
import { listPickupPointsForUser } from './pickup-points.service.js';
import { getAgencyDeparture, getAgencyById, updateAgencyDeparture as updateAgencyDepartureRecord } from './agencies.service.js';
import { isAgencyAdmin } from '../utils/roles.js';
import { isValidAssignmentZoneForAgency, isValidZoneForAgency } from './delivery-zones.service.js';
import { isValidEmail } from '../utils/email.js';
import { AGENCY_ML_USERNAME_PREFIX } from './agency-ml.service.js';

const USER_COLUMNS = `id, username, name, role, agency_id, password_hash, google_id, email_verified_at,
  current_lat, current_lng, location_updated_at,
  departure_address, departure_lat, departure_lng, delivery_zone`;

function departureFromRow(row: DbUserRow): LocationPoint | undefined {
  if (row.departure_address && row.departure_lat != null && row.departure_lng != null) {
    return {
      address: row.departure_address,
      lat: Number(row.departure_lat),
      lng: Number(row.departure_lng),
    };
  }
  return undefined;
}

function rowToUser(row: DbUserRow): User {
  const user: User = {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    agencyId: row.agency_id ?? null,
  };
  if (row.current_lat != null && row.current_lng != null && row.location_updated_at) {
    user.currentLocation = {
      lat: Number(row.current_lat),
      lng: Number(row.current_lng),
      timestamp: new Date(row.location_updated_at).toISOString(),
    };
  }
  const departure = departureFromRow(row);
  if (departure) {
    user.departurePoint = departure;
  }
  if (row.delivery_zone) {
    user.deliveryZone = row.delivery_zone;
  }
  return user;
}

async function enrichUser(user: User): Promise<User> {
  if (user.agencyId) {
    const agency = await getAgencyById(user.agencyId);
    if (agency) {
      user.agencyName = agency.name;
    }
  }
  if (user.role === UserRole.STORE_ADMIN) {
    user.pickupPoints = await listPickupPointsForUser(user.id);
  }
  return user;
}

export async function findUserByUsername(username: string): Promise<(DbUserRow & RowDataPacket) | null> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT ${USER_COLUMNS} FROM users WHERE LOWER(username) = LOWER(?)`,
    [username]
  );
  return rows[0] ?? null;
}

export async function findUserByGoogleId(googleId: string): Promise<(DbUserRow & RowDataPacket) | null> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT ${USER_COLUMNS} FROM users WHERE google_id = ? LIMIT 1`,
    [googleId]
  );
  return rows[0] ?? null;
}

export function isEmailVerified(row: Pick<DbUserRow, 'email_verified_at'>): boolean {
  return row.email_verified_at != null;
}

export async function getUserById(id: string): Promise<User | null> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return enrichUser(rowToUser(row));
}

export async function getRepartidores(agencyId?: string | null): Promise<User[]> {
  if (!agencyId) {
    return [];
  }
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT ${USER_COLUMNS} FROM users WHERE role = ? AND agency_id = ? ORDER BY name`,
    [UserRole.REPARTIDOR, agencyId]
  );
  return rows.map(rowToUser);
}

/** Repartidores asignados a pedidos del vendedor (sin exponer el tamaño total de la flota). */
export async function getRepartidoresForSeller(
  sellerId: string,
  agencyId: string
): Promise<User[]> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT DISTINCT u.id, u.username, u.name, u.role, u.agency_id, u.password_hash, u.current_lat, u.current_lng, u.location_updated_at,
      u.departure_address, u.departure_lat, u.departure_lng, u.delivery_zone
     FROM users u
     INNER JOIN orders o ON o.repartidor_id = u.id
     WHERE u.role = ? AND u.agency_id = ? AND o.seller_id = ? AND o.archived = 0
     ORDER BY u.name`,
    [UserRole.REPARTIDOR, agencyId, sellerId]
  );
  return rows.map(rowToUser);
}

export async function assertRepartidorInAgency(
  repartidorId: string,
  agencyId: string
): Promise<User> {
  const rep = await getRepartidorById(repartidorId);
  if (!rep || rep.agencyId !== agencyId) {
    throw new Error('NOT_FOUND');
  }
  return rep;
}

export async function updateUserLocation(
  userId: string,
  lat: number,
  lng: number,
  recordedAt?: Date
): Promise<void> {
  const now = recordedAt ?? new Date();
  await pool.query(
    'UPDATE users SET current_lat = ?, current_lng = ?, location_updated_at = ? WHERE id = ?',
    [lat, lng, now, userId]
  );
}

export async function appendRepartidorLocationHistory(
  userId: string,
  lat: number,
  lng: number,
  recordedAt?: Date
): Promise<void> {
  const now = recordedAt ?? new Date();
  await pool.query(
    'INSERT INTO repartidor_location_history (user_id, lat, lng, created_at) VALUES (?, ?, ?, ?)',
    [userId, lat, lng, now]
  );
}

export async function getRepartidorById(id: string): Promise<User | null> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ? AND role = ?`,
    [id, UserRole.REPARTIDOR]
  );
  const row = rows[0];
  return row ? rowToUser(row) : null;
}

/** Repartidor Posta vinculado a una cuenta ML (external_user_id) dentro de la agencia. */
export async function getRepartidorByMercadoLibreUserId(
  mlUserId: string | number,
  agencyId: string | null
): Promise<User | null> {
  if (!agencyId) return null;
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT u.id, u.username, u.name, u.role, u.agency_id, u.password_hash, u.current_lat, u.current_lng,
            u.location_updated_at, u.departure_address, u.departure_lat, u.departure_lng, u.delivery_zone
     FROM users u
     INNER JOIN store_integrations si ON si.user_id = u.id
     WHERE si.platform = 'mercadolibre'
       AND si.external_user_id = ?
       AND u.role = ?
       AND u.agency_id = ?
     LIMIT 1`,
    [String(mlUserId), UserRole.REPARTIDOR, agencyId]
  );
  const row = rows[0];
  return row ? rowToUser(row) : null;
}

export async function getDefaultSellerId(): Promise<string> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM users WHERE role = ? LIMIT 1`,
    [UserRole.STORE_ADMIN]
  );
  return rows[0]?.id ?? 'u1';
}

export async function updateAgencyDeparture(
  userId: string,
  data: { address: string; lat: number; lng: number }
): Promise<User> {
  const existing = await getUserById(userId);
  if (!existing || !isAgencyAdmin(existing.role) || !existing.agencyId) {
    throw new Error('NOT_FOUND');
  }

  await updateAgencyDepartureRecord(existing.agencyId, data);
  const departure = await getAgencyDeparture(existing.agencyId);
  const user = await getUserById(userId);
  if (!user) throw new Error('NOT_FOUND');
  if (departure) {
    user.departurePoint = departure;
  }
  return user;
}

export async function getAgencyDepartureForUser(user: User): Promise<LocationPoint | null> {
  if (user.agencyId) {
    return getAgencyDeparture(user.agencyId);
  }
  return null;
}

export async function createUser(data: {
  username: string;
  password?: string | null;
  name: string;
  role: UserRole;
  agencyId?: string | null;
  deliveryZone?: string | null;
  googleId?: string | null;
  /** Por defecto true (altas internas). El self-signup de agencia pasa false. */
  emailVerified?: boolean;
}): Promise<User> {
  const normalizedUsername = data.username.trim().toLowerCase();
  if (data.role === UserRole.REPARTIDOR && !isValidEmail(normalizedUsername)) {
    throw new Error('INVALID_EMAIL');
  }
  if (
    (data.role === UserRole.SUPER_ADMIN || data.role === UserRole.LOGISTICS_ADMIN) &&
    !isValidEmail(normalizedUsername)
  ) {
    throw new Error('INVALID_EMAIL');
  }
  if (normalizedUsername.length < 3) {
    throw new Error('USERNAME_SHORT');
  }

  const hasPassword = Boolean(data.password);
  const hasGoogle = Boolean(data.googleId);
  if (!hasPassword && !hasGoogle) {
    throw new Error('PASSWORD_SHORT');
  }
  if (hasPassword && data.password && data.password.length < 6) {
    throw new Error('PASSWORD_SHORT');
  }
  if (!data.name.trim()) {
    throw new Error('NAME_REQUIRED');
  }
  if (data.deliveryZone && data.agencyId) {
    const valid =
      data.role === UserRole.REPARTIDOR
        ? await isValidAssignmentZoneForAgency(data.agencyId, data.deliveryZone)
        : await isValidZoneForAgency(data.agencyId, data.deliveryZone);
    if (!valid) throw new Error('INVALID_ZONE');
  } else if (data.deliveryZone) {
    throw new Error('INVALID_ZONE');
  }

  if (data.role === UserRole.STORE_ADMIN && !data.agencyId) {
    throw new Error('AGENCY_REQUIRED');
  }
  if (
    (data.role === UserRole.SUPER_ADMIN ||
      data.role === UserRole.LOGISTICS_ADMIN ||
      data.role === UserRole.REPARTIDOR) &&
    !data.agencyId
  ) {
    throw new Error('AGENCY_REQUIRED');
  }

  const existing = await findUserByUsername(normalizedUsername);
  if (existing) {
    throw new Error('USERNAME_TAKEN');
  }

  if (data.googleId) {
    const byGoogle = await findUserByGoogleId(data.googleId);
    if (byGoogle) {
      throw new Error('USERNAME_TAKEN');
    }
  }

  const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const passwordHash = hasPassword && data.password ? await bcrypt.hash(data.password, 10) : null;
  const emailVerifiedAt = data.emailVerified === false ? null : new Date();

  await pool.query(
    `INSERT INTO users (id, username, password_hash, google_id, email_verified_at, name, role, agency_id, delivery_zone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      normalizedUsername,
      passwordHash,
      data.googleId ?? null,
      emailVerifiedAt,
      data.name.trim(),
      data.role,
      data.agencyId ?? null,
      data.deliveryZone ?? null,
    ]
  );

  const user = await getUserById(id);
  if (!user) throw new Error('CREATE_FAILED');
  return user;
}

export async function linkGoogleId(userId: string, googleId: string): Promise<void> {
  await pool.query(
    `UPDATE users
     SET google_id = ?, email_verified_at = COALESCE(email_verified_at, NOW(3))
     WHERE id = ?`,
    [googleId, userId]
  );
}

export async function updateRepartidorZone(
  repartidorId: string,
  deliveryZone: string | null,
  agencyId?: string | null
): Promise<User> {
  const rep = await getRepartidorById(repartidorId);
  if (!rep) {
    throw new Error('NOT_FOUND');
  }
  if (agencyId && rep.agencyId !== agencyId) {
    throw new Error('NOT_FOUND');
  }
  if (deliveryZone) {
    if (!rep.agencyId) throw new Error('INVALID_ZONE');
    const valid = await isValidAssignmentZoneForAgency(rep.agencyId, deliveryZone);
    if (!valid) throw new Error('INVALID_ZONE');
  }
  await pool.query('UPDATE users SET delivery_zone = ? WHERE id = ?', [deliveryZone, repartidorId]);
  const updated = await getUserById(repartidorId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}

export async function listSellers(agencyId: string): Promise<User[]> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT ${USER_COLUMNS} FROM users
     WHERE role = ? AND agency_id = ? AND username NOT LIKE ?
     ORDER BY name`,
    [UserRole.STORE_ADMIN, agencyId, `${AGENCY_ML_USERNAME_PREFIX}%`]
  );
  const sellers = rows.map(rowToUser);
  return Promise.all(sellers.map((seller) => enrichUser(seller)));
}

export async function assertSellerInAgency(sellerId: string, agencyId: string): Promise<User> {
  const seller = await getUserById(sellerId);
  if (!seller || seller.role !== UserRole.STORE_ADMIN || seller.agencyId !== agencyId) {
    throw new Error('SELLER_NOT_FOUND');
  }
  return seller;
}

export interface SellerStats {
  totalOrders: number;
  pendingOrders: number;
  activeOrders: number;
  deliveredOrders: number;
}

export async function getSellerDetail(
  id: string,
  agencyId?: string | null
): Promise<{ user: User; stats: SellerStats } | null> {
  const user = await getUserById(id);
  if (!user || user.role !== UserRole.STORE_ADMIN) {
    return null;
  }
  if (agencyId && user.agencyId !== agencyId) {
    return null;
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      COUNT(*) AS total,
      SUM(status = ?) AS pending,
      SUM(status IN (?, ?)) AS active,
      SUM(status = ?) AS delivered
     FROM orders WHERE seller_id = ?`,
    [OrderStatus.PENDING, OrderStatus.ASSIGNED, OrderStatus.DELIVERING, OrderStatus.DELIVERED, id]
  );
  const row = rows[0] ?? {};

  return {
    user,
    stats: {
      totalOrders: Number(row.total) || 0,
      pendingOrders: Number(row.pending) || 0,
      activeOrders: Number(row.active) || 0,
      deliveredOrders: Number(row.delivered) || 0,
    },
  };
}

export async function updateSellerPassword(
  sellerId: string,
  password: string,
  agencyId?: string | null
): Promise<void> {
  if (password.length < 6) {
    throw new Error('PASSWORD_SHORT');
  }

  const user = await getUserById(sellerId);
  if (!user || user.role !== UserRole.STORE_ADMIN) {
    throw new Error('NOT_FOUND');
  }
  if (agencyId && user.agencyId !== agencyId) {
    throw new Error('NOT_FOUND');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, sellerId]);
}

export async function updateSeller(
  sellerId: string,
  data: { name: string; username?: string },
  agencyId?: string | null
): Promise<User> {
  const user = await getUserById(sellerId);
  if (!user || user.role !== UserRole.STORE_ADMIN) {
    throw new Error('NOT_FOUND');
  }
  if (agencyId && user.agencyId !== agencyId) {
    throw new Error('NOT_FOUND');
  }

  const name = data.name.trim();
  if (!name) {
    throw new Error('NAME_REQUIRED');
  }

  let username = user.username;
  if (data.username !== undefined) {
    const normalizedUsername = data.username.trim().toLowerCase();
    if (normalizedUsername.length < 3) {
      throw new Error('USERNAME_SHORT');
    }
    if (normalizedUsername !== user.username.toLowerCase()) {
      const existing = await findUserByUsername(normalizedUsername);
      if (existing && existing.id !== sellerId) {
        throw new Error('USERNAME_TAKEN');
      }
      username = normalizedUsername;
    }
  }

  await pool.query('UPDATE users SET name = ?, username = ? WHERE id = ?', [name, username, sellerId]);
  const updated = await getUserById(sellerId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}

export async function deleteSeller(
  sellerId: string,
  agencyId?: string | null
): Promise<{ unlinkedOrders: number }> {
  const seller = await getUserById(sellerId);
  if (!seller || seller.role !== UserRole.STORE_ADMIN) {
    throw new Error('NOT_FOUND');
  }
  if (agencyId && seller.agencyId !== agencyId) {
    throw new Error('NOT_FOUND');
  }

  const [activeRows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM orders
     WHERE seller_id = ? AND status IN (?, ?)`,
    [sellerId, OrderStatus.ASSIGNED, OrderStatus.DELIVERING]
  );
  if (activeRows.length > 0) {
    throw new Error('SELLER_HAS_ACTIVE_ORDERS');
  }

  const [unlinkResult] = await pool.query<ResultSetHeader>(
    'UPDATE orders SET seller_id = NULL WHERE seller_id = ?',
    [sellerId]
  );

  await pool.query('DELETE FROM notifications WHERE user_id = ?', [sellerId]);

  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM users WHERE id = ? AND role = ?',
    [sellerId, UserRole.STORE_ADMIN]
  );
  if (result.affectedRows === 0) {
    throw new Error('NOT_FOUND');
  }

  return { unlinkedOrders: unlinkResult.affectedRows };
}

export async function deleteRepartidor(
  id: string,
  agencyId?: string | null
): Promise<{ finalizedOrders: number }> {
  const repartidor = await getRepartidorById(id);
  if (!repartidor) {
    throw new Error('NOT_FOUND');
  }
  if (agencyId && repartidor.agencyId !== agencyId) {
    throw new Error('NOT_FOUND');
  }

  const now = new Date();
  const [activeRows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM orders
     WHERE repartidor_id = ? AND status IN (?, ?)`,
    [id, OrderStatus.ASSIGNED, OrderStatus.DELIVERING]
  );

  for (const row of activeRows) {
    await pool.query(
      'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?',
      [OrderStatus.DELIVERED, now, row.id]
    );
    await pool.query(
      `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, ?, ?)`,
      [
        row.id,
        OrderStatus.DELIVERED,
        'Sistema',
        `Viaje finalizado automáticamente al eliminar al repartidor ${repartidor.name}`,
        now,
      ]
    );
  }

  await pool.query('UPDATE orders SET repartidor_id = NULL WHERE repartidor_id = ?', [id]);
  await pool.query('DELETE FROM notifications WHERE user_id = ?', [id]);

  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM users WHERE id = ? AND role = ?',
    [id, UserRole.REPARTIDOR]
  );
  if (result.affectedRows === 0) {
    throw new Error('NOT_FOUND');
  }

  return { finalizedOrders: activeRows.length };
}

export function userToApiResponse(user: User): User {
  return user;
}

export async function getRepartidorSessionToken(userId: string): Promise<string | null> {
  const [rows] = await pool.query<Array<{ session_token: string | null } & RowDataPacket>>(
    'SELECT session_token FROM users WHERE id = ? AND role = ?',
    [userId, UserRole.REPARTIDOR]
  );
  return rows[0]?.session_token ?? null;
}

export async function hasRepartidorActiveSession(userId: string): Promise<boolean> {
  const token = await getRepartidorSessionToken(userId);
  return typeof token === 'string' && token.length > 0;
}

export async function createRepartidorSession(userId: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE users SET session_token = ? WHERE id = ? AND role = ?',
    [sessionId, userId, UserRole.REPARTIDOR]
  );
  if (result.affectedRows === 0) {
    throw new Error('SESSION_CREATE_FAILED');
  }
  return sessionId;
}

export async function clearRepartidorSession(userId: string): Promise<void> {
  await pool.query('UPDATE users SET session_token = NULL WHERE id = ? AND role = ?', [
    userId,
    UserRole.REPARTIDOR,
  ]);
}

export async function clearRepartidorSessionForAgency(
  repartidorId: string,
  agencyId: string | null | undefined
): Promise<void> {
  const rep = await getRepartidorById(repartidorId);
  if (!rep) {
    throw new Error('NOT_FOUND');
  }
  if (agencyId && rep.agencyId !== agencyId) {
    throw new Error('NOT_FOUND');
  }
  await clearRepartidorSession(repartidorId);
}
