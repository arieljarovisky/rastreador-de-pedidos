import { randomUUID } from 'crypto';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

export async function upsertPushToken(
  userId: string,
  expoPushToken: string,
  platform?: string
): Promise<void> {
  const now = new Date();
  const [existing] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    'SELECT id FROM push_tokens WHERE expo_push_token = ? LIMIT 1',
    [expoPushToken]
  );

  if (existing[0]) {
    await pool.query(
      'UPDATE push_tokens SET user_id = ?, platform = ?, updated_at = ? WHERE id = ?',
      [userId, platform ?? null, now, existing[0].id]
    );
    return;
  }

  await pool.query(
    `INSERT INTO push_tokens (id, user_id, expo_push_token, platform, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [randomUUID(), userId, expoPushToken, platform ?? null, now, now]
  );
}

export async function removePushToken(userId: string, expoPushToken: string): Promise<void> {
  await pool.query('DELETE FROM push_tokens WHERE user_id = ? AND expo_push_token = ?', [
    userId,
    expoPushToken,
  ]);
}

export async function listPushTokensForUser(userId: string): Promise<string[]> {
  const [rows] = await pool.query<Array<{ expo_push_token: string } & RowDataPacket>>(
    'SELECT expo_push_token FROM push_tokens WHERE user_id = ?',
    [userId]
  );
  return rows.map((r) => r.expo_push_token);
}

export async function listPushTokensForAllUsers(): Promise<string[]> {
  const [rows] = await pool.query<Array<{ expo_push_token: string } & RowDataPacket>>(
    'SELECT expo_push_token FROM push_tokens'
  );
  return rows.map((r) => r.expo_push_token);
}
