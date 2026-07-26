import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { isPlatformOwnerEmail } from '../middleware/platform.js';
import { UserRole } from '../types/index.js';
import { getUserById } from './users.service.js';

/**
 * Si el email está en PLATFORM_OWNER_EMAILS, la cuenta pasa a platform_owner
 * sin agencia (deja de operar como dueño de agencia).
 */
export async function ensurePlatformOwnerAccount(userId: string): Promise<{
  converted: boolean;
  user: Awaited<ReturnType<typeof getUserById>>;
}> {
  const user = await getUserById(userId);
  if (!user) return { converted: false, user: null };
  if (!isPlatformOwnerEmail(user.username)) {
    return { converted: false, user };
  }
  if (user.role === UserRole.PLATFORM_OWNER && !user.agencyId) {
    return { converted: false, user };
  }

  await pool.query(
    `UPDATE users SET role = ?, agency_id = NULL, delivery_zone = NULL WHERE id = ?`,
    [UserRole.PLATFORM_OWNER, userId]
  );

  const updated = await getUserById(userId);
  console.log(
    `[platform] Cuenta ${user.username} convertida a platform_owner (antes role=${user.role}, agency=${user.agencyId})`
  );
  return { converted: true, user: updated };
}

export function platformOwnerEmailsConfigured(): boolean {
  return env.platformOwnerEmails.length > 0;
}
