import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { AppNotification } from '../types/index.js';

interface NotificationRow extends RowDataPacket {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: AppNotification['type'];
  order_id: string | null;
  is_read: number;
  created_at: Date;
}

function rowToNotification(row: NotificationRow): AppNotification {
  const notif: AppNotification = {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    read: row.is_read === 1,
    type: row.type,
  };
  if (row.order_id) notif.orderId = row.order_id;
  return notif;
}

export async function listNotificationsForUser(userId: string): Promise<AppNotification[]> {
  const [rows] = await pool.query<NotificationRow[]>(
    `SELECT id, user_id, title, body, type, order_id, is_read, created_at
     FROM notifications WHERE user_id = 'all' OR user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(rowToNotification);
}

export async function markAllReadForUser(userId: string): Promise<void> {
  await pool.query(
    `UPDATE notifications SET is_read = 1 WHERE user_id = 'all' OR user_id = ?`,
    [userId]
  );
}

export async function createNotification(data: {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: AppNotification['type'];
  orderId?: string;
}): Promise<void> {
  const now = new Date();
  await pool.query(
    `INSERT INTO notifications (id, user_id, title, body, type, order_id, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [data.id, data.userId, data.title, data.body, data.type, data.orderId ?? null, now]
  );
}
