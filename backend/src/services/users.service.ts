import { RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { DbUserRow, User, UserRole } from '../types/index.js';

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
  return user;
}

export async function findUserByUsername(username: string): Promise<(DbUserRow & RowDataPacket) | null> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    'SELECT id, username, name, role, password_hash, current_lat, current_lng, location_updated_at FROM users WHERE LOWER(username) = LOWER(?)',
    [username]
  );
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    'SELECT id, username, name, role, password_hash, current_lat, current_lng, location_updated_at FROM users WHERE id = ?',
    [id]
  );
  const row = rows[0];
  return row ? rowToUser(row) : null;
}

export async function getRepartidores(): Promise<User[]> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT id, username, name, role, password_hash, current_lat, current_lng, location_updated_at
     FROM users WHERE role = ?`,
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
    `SELECT id, username, name, role, password_hash, current_lat, current_lng, location_updated_at
     FROM users WHERE id = ? AND role = ?`,
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

export async function createUser(data: {
  username: string;
  password: string;
  name: string;
  role: UserRole;
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

  const existing = await findUserByUsername(normalizedUsername);
  if (existing) {
    throw new Error('USERNAME_TAKEN');
  }

  const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const passwordHash = await bcrypt.hash(data.password, 10);

  await pool.query(
    `INSERT INTO users (id, username, password_hash, name, role) VALUES (?, ?, ?, ?, ?)`,
    [id, normalizedUsername, passwordHash, data.name.trim(), data.role]
  );

  const user = await getUserById(id);
  if (!user) throw new Error('CREATE_FAILED');
  return user;
}

export async function listSellers(): Promise<User[]> {
  const [rows] = await pool.query<(DbUserRow & RowDataPacket)[]>(
    `SELECT id, username, name, role, password_hash, current_lat, current_lng, location_updated_at
     FROM users WHERE role = ? ORDER BY name`,
    [UserRole.STORE_ADMIN]
  );
  return rows.map(rowToUser);
}
