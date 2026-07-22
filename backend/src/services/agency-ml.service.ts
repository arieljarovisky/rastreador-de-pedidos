import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { User, UserRole } from '../types/index.js';
import { getUserById } from './users.service.js';

/** Usuarios bridge legacy (`__agency_ml__…`); ya no se crean nuevas conexiones de agencia a ML. */
export const AGENCY_ML_USERNAME_PREFIX = '__agency_ml__';

export function isAgencyMlBridgeUsername(username: string): boolean {
  return username.startsWith(AGENCY_ML_USERNAME_PREFIX);
}

export function isAgencyMlBridgeUser(user: Pick<User, 'username'>): boolean {
  return isAgencyMlBridgeUsername(user.username);
}

export async function getAgencyOperatorForImport(agencyId: string): Promise<User | null> {
  const [rows] = await pool.query<
    Array<{ id: string } & RowDataPacket>
  >(
    `SELECT id FROM users
     WHERE agency_id = ? AND role IN (?, ?)
     ORDER BY CASE role WHEN ? THEN 0 WHEN ? THEN 1 ELSE 2 END
     LIMIT 1`,
    [agencyId, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN]
  );
  const id = rows[0]?.id;
  if (!id) return null;
  return getUserById(id);
}
