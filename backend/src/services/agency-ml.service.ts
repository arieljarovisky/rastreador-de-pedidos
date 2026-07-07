import { randomBytes } from 'crypto';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { User, UserRole } from '../types/index.js';
import { createUser, getUserById } from './users.service.js';

export const AGENCY_ML_USERNAME_PREFIX = '__agency_ml__';

export function agencyMlBridgeUsername(agencyId: string): string {
  return `${AGENCY_ML_USERNAME_PREFIX}${agencyId}`;
}

export function isAgencyMlBridgeUsername(username: string): boolean {
  return username.startsWith(AGENCY_ML_USERNAME_PREFIX);
}

export function isAgencyMlBridgeUser(user: Pick<User, 'username'>): boolean {
  return isAgencyMlBridgeUsername(user.username);
}

export async function getAgencyMlBridgeUserId(agencyId: string): Promise<string | null> {
  const [rows] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    `SELECT id FROM users WHERE agency_id = ? AND username = ? LIMIT 1`,
    [agencyId, agencyMlBridgeUsername(agencyId)]
  );
  return rows[0]?.id ?? null;
}

export async function ensureAgencyMlBridgeUser(agencyId: string): Promise<User> {
  const existingId = await getAgencyMlBridgeUserId(agencyId);
  if (existingId) {
    const user = await getUserById(existingId);
    if (user) return user;
  }

  return createUser({
    username: agencyMlBridgeUsername(agencyId),
    password: randomBytes(24).toString('base64url'),
    name: 'Mercado Libre (agencia)',
    role: UserRole.STORE_ADMIN,
    agencyId,
  });
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
