import { ResultSetHeader, RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { DbUserRow, LocationPoint, PickupPoint, User, UserRole, OrderStatus } from '../types/index.js';
import { listPickupPointsForUser } from './pickup-points.service.js';
import { getAgencyDeparture, getAgencyById, updateAgencyDeparture as updateAgencyDepartureRecord } from './agencies.service.js';
import { isAgencyAdmin } from '../utils/roles.js';
import { isValidZoneForAgency } from './delivery-zones.service.js';

const USER_COLUMNS = `id, username, name, role, agency_id, password_hash, current_lat, current_lng, location_updated_at,
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
      user.agencyMlFlexMode = agency.mlFlexMode;
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
  if (agencyId) {
    const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
      `SELECT ${USER_COLUMNS} FROM users WHERE role = ? AND agency_id = ?`,
      [UserRole.REPARTIDOR, agencyId]
    );
    return rows.map(rowToUser);
  }
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT ${USER_COLUMNS} FROM users WHERE role = ?`,
    [UserRole.REPARTIDOR]
  );
  return rows.map(rowToUser);
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

export async function getRepartidorById(id: string): Promise<User | null> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ? AND role = ?`,
    [id, UserRole.REPARTIDOR]
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
  password: string;
  name: string;
  role: UserRole;
  agencyId?: string | null;
  deliveryZone?: string | null;
}): Promise<User> {
  const normalizedUsername = data.username.trim().toLowerCase();
  if (normalizedUsername.length < 3) {
    throw new Error('USERNAME_SHORT');
  }
  if (data.password.length < 6) {
    throw new Error('PASSWORD_SHORT');
  }
  if (!data.name.trim()) {
    throw new Error('NAME_REQUIRED');
  }
  if (data.deliveryZone && data.agencyId) {
    const valid = await isValidZoneForAgency(data.agencyId, data.deliveryZone);
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

  const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const passwordHash = await bcrypt.hash(data.password, 10);

  await pool.query(
    `INSERT INTO users (id, username, password_hash, name, role, agency_id, delivery_zone) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, normalizedUsername, passwordHash, data.name.trim(), data.role, data.agencyId ?? null, data.deliveryZone ?? null]
  );

  const user = await getUserById(id);
  if (!user) throw new Error('CREATE_FAILED');
  return user;
}

export async function updateRepartidorZone(
  repartidorId: string,
  deliveryZone: string | null
): Promise<User> {
  const rep = await getRepartidorById(repartidorId);
  if (!rep) {
    throw new Error('NOT_FOUND');
  }
  if (deliveryZone) {
    if (!rep.agencyId) throw new Error('INVALID_ZONE');
    const valid = await isValidZoneForAgency(rep.agencyId, deliveryZone);
    if (!valid) throw new Error('INVALID_ZONE');
  }
  await pool.query('UPDATE users SET delivery_zone = ? WHERE id = ?', [deliveryZone, repartidorId]);
  const updated = await getUserById(repartidorId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}

export async function listSellers(agencyId: string): Promise<User[]> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT ${USER_COLUMNS} FROM users WHERE role = ? AND agency_id = ? ORDER BY name`,
    [UserRole.STORE_ADMIN, agencyId]
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

export async function deleteRepartidor(id: string): Promise<{ finalizedOrders: number }> {
  const repartidor = await getRepartidorById(id);
  if (!repartidor) {
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
