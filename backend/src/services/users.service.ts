import { ResultSetHeader, RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { DbUserRow, LocationPoint, PickupPoint, User, UserRole, OrderStatus } from '../types/index.js';
import { listPickupPointsForUser } from './pickup-points.service.js';
import { isAgencyAdmin } from '../utils/roles.js';
import { isValidZoneId } from '../config/delivery-zones.js';

const USER_COLUMNS = `id, username, name, role, password_hash, current_lat, current_lng, location_updated_at,
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

export async function getRepartidores(): Promise<User[]> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT ${USER_COLUMNS} FROM users WHERE role = ?`,
    [UserRole.REPARTIDOR]
  );
  return rows.map(rowToUser);
}

export async function updateUserLocation(userId: string, lat: number, lng: number): Promise<void> {
  const now = new Date();
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
  if (!existing || !isAgencyAdmin(existing.role)) {
    throw new Error('NOT_FOUND');
  }

  await pool.query(
    `UPDATE users SET departure_address = ?, departure_lat = ?, departure_lng = ? WHERE id = ?`,
    [data.address, data.lat, data.lng, userId]
  );
  const user = await getUserById(userId);
  if (!user) throw new Error('NOT_FOUND');
  return user;
}

export async function getAgencyDeparture(): Promise<LocationPoint | null> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT departure_address, departure_lat, departure_lng
     FROM users
     WHERE role IN (?, ?) AND departure_lat IS NOT NULL
     ORDER BY FIELD(role, ?, ?)
     LIMIT 1`,
    [UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN]
  );
  const row = rows[0];
  if (!row?.departure_address || row.departure_lat == null || row.departure_lng == null) {
    return null;
  }
  return {
    address: row.departure_address,
    lat: Number(row.departure_lat),
    lng: Number(row.departure_lng),
  };
}

export async function createUser(data: {
  username: string;
  password: string;
  name: string;
  role: UserRole;
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
  if (data.deliveryZone && !isValidZoneId(data.deliveryZone)) {
    throw new Error('INVALID_ZONE');
  }

  const existing = await findUserByUsername(normalizedUsername);
  if (existing) {
    throw new Error('USERNAME_TAKEN');
  }

  const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const passwordHash = await bcrypt.hash(data.password, 10);

  await pool.query(
    `INSERT INTO users (id, username, password_hash, name, role, delivery_zone) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, normalizedUsername, passwordHash, data.name.trim(), data.role, data.deliveryZone ?? null]
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
  if (deliveryZone && !isValidZoneId(deliveryZone)) {
    throw new Error('INVALID_ZONE');
  }
  await pool.query('UPDATE users SET delivery_zone = ? WHERE id = ?', [deliveryZone, repartidorId]);
  const updated = await getUserById(repartidorId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}

export async function listSellers(): Promise<User[]> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT ${USER_COLUMNS} FROM users WHERE role = ? ORDER BY name`,
    [UserRole.STORE_ADMIN]
  );
  const sellers = rows.map(rowToUser);
  return Promise.all(sellers.map((seller) => enrichUser(seller)));
}

export interface SellerStats {
  totalOrders: number;
  pendingOrders: number;
  activeOrders: number;
  deliveredOrders: number;
}

export async function getSellerDetail(
  id: string
): Promise<{ user: User; stats: SellerStats } | null> {
  const user = await getUserById(id);
  if (!user || user.role !== UserRole.STORE_ADMIN) {
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

export async function updateSellerPassword(sellerId: string, password: string): Promise<void> {
  if (password.length < 6) {
    throw new Error('PASSWORD_SHORT');
  }

  const user = await getUserById(sellerId);
  if (!user || user.role !== UserRole.STORE_ADMIN) {
    throw new Error('NOT_FOUND');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, sellerId]);
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
