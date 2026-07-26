import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

export type PlatformAuditAction =
  | 'create'
  | 'update'
  | 'suspend'
  | 'reactivate'
  | 'disable'
  | 'enable'
  | 'password_reset'
  | 'subscription_update'
  | 'cancel'
  | 'archive'
  | 'delete';

export interface PlatformAuditEntry {
  id: number;
  actorUserId: string;
  actorEmail: string;
  agencyId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  summary: string;
  createdAt: string;
}

export async function recordPlatformAudit(input: {
  actorUserId: string;
  actorEmail: string;
  agencyId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: PlatformAuditAction | string;
  summary: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO platform_audit_log
      (actor_user_id, actor_email, agency_id, entity_type, entity_id, action, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.actorUserId,
      input.actorEmail.trim().toLowerCase(),
      input.agencyId ?? null,
      input.entityType,
      input.entityId ?? null,
      input.action,
      input.summary.slice(0, 500),
      new Date(),
    ]
  );
}

export async function listPlatformAudit(params: {
  agencyId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ items: PlatformAuditEntry[]; total: number }> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const where: string[] = [];
  const values: unknown[] = [];
  if (params.agencyId) {
    where.push('agency_id = ?');
    values.push(params.agencyId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [countRows] = await pool.query<Array<{ cnt: number } & RowDataPacket>>(
    `SELECT COUNT(*) AS cnt FROM platform_audit_log ${whereSql}`,
    values
  );
  const [rows] = await pool.query<
    Array<{
      id: number;
      actor_user_id: string;
      actor_email: string;
      agency_id: string | null;
      entity_type: string;
      entity_id: string | null;
      action: string;
      summary: string;
      created_at: Date;
    } & RowDataPacket>
  >(
    `SELECT id, actor_user_id, actor_email, agency_id, entity_type, entity_id, action, summary, created_at
     FROM platform_audit_log
     ${whereSql}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  return {
    total: Number(countRows[0]?.cnt ?? 0),
    items: rows.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorEmail: row.actor_email,
      agencyId: row.agency_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      summary: row.summary,
      createdAt: new Date(row.created_at).toISOString(),
    })),
  };
}
