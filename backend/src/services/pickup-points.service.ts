import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { PickupPoint, User, UserRole } from '../types/index.js';
import { isAgencyAdmin } from '../utils/roles.js';

interface PickupRow extends RowDataPacket {
  id: string;
  user_id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  created_at: Date;
  seller_name?: string | null;
}

function rowToPickupPoint(row: PickupRow): PickupPoint {
  return {
    id: row.id,
    userId: row.user_id,
    sellerName: row.seller_name ?? undefined,
    label: row.label,
    address: row.address,
    lat: Number(row.lat),
    lng: Number(row.lng),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listPickupPointsForUser(userId: string): Promise<PickupPoint[]> {
  const [rows] = await pool.query<PickupRow[]>(
    `SELECT id, user_id, label, address, lat, lng, created_at
     FROM pickup_points WHERE user_id = ? ORDER BY created_at ASC`,
    [userId]
  );
  return rows.map(rowToPickupPoint);
}

export async function listPickupPointsForLogistics(): Promise<PickupPoint[]> {
  const [rows] = await pool.query<PickupRow[]>(
    `SELECT p.id, p.user_id, p.label, p.address, p.lat, p.lng, p.created_at, u.name AS seller_name
     FROM pickup_points p
     INNER JOIN users u ON u.id = p.user_id
     WHERE u.role = ?
     ORDER BY u.name ASC, p.created_at ASC`,
    [UserRole.STORE_ADMIN]
  );
  return rows.map(rowToPickupPoint);
}

export async function getPickupPointById(id: string): Promise<PickupPoint | null> {
  const [rows] = await pool.query<PickupRow[]>(
    `SELECT p.id, p.user_id, p.label, p.address, p.lat, p.lng, p.created_at, u.name AS seller_name
     FROM pickup_points p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.id = ?`,
    [id]
  );
  const row = rows[0];
  return row ? rowToPickupPoint(row) : null;
}

export async function createPickupPoint(
  ownerUserId: string,
  data: { label?: string; address: string; lat: number; lng: number }
): Promise<PickupPoint> {
  const id = `pp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const now = new Date();
  await pool.query(
    `INSERT INTO pickup_points (id, user_id, label, address, lat, lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, ownerUserId, data.label?.trim() || 'Punto de colecta', data.address, data.lat, data.lng, now]
  );
  const point = await getPickupPointById(id);
  if (!point) throw new Error('CREATE_FAILED');
  return point;
}

export async function updatePickupPoint(
  id: string,
  data: { label?: string; address?: string; lat?: number; lng?: number }
): Promise<PickupPoint> {
  const existing = await getPickupPointById(id);
  if (!existing) throw new Error('NOT_FOUND');

  await pool.query(
    `UPDATE pickup_points SET label = ?, address = ?, lat = ?, lng = ? WHERE id = ?`,
    [
      data.label?.trim() ?? existing.label,
      data.address ?? existing.address,
      data.lat ?? existing.lat,
      data.lng ?? existing.lng,
      id,
    ]
  );

  const updated = await getPickupPointById(id);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}

export async function deletePickupPoint(id: string): Promise<void> {
  const [result] = await pool.query<ResultSetHeader>('DELETE FROM pickup_points WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    throw new Error('NOT_FOUND');
  }
}

export function canManagePickupPoint(user: User, point: PickupPoint): boolean {
  if (isAgencyAdmin(user.role)) return true;
  if (user.role === UserRole.STORE_ADMIN) return point.userId === user.id;
  return false;
}
