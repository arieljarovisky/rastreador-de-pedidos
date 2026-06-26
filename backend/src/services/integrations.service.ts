import { randomUUID } from 'crypto';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

export type IntegrationPlatform = 'mercadolibre' | 'tiendanube';

export interface StoreIntegration {
  id: string;
  userId: string;
  platform: IntegrationPlatform;
  externalUserId: string | null;
  externalStoreId: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  metadata: Record<string, unknown> | null;
  connectedAt: string;
  updatedAt: string;
}

interface IntegrationRow extends RowDataPacket {
  id: string;
  user_id: string;
  platform: IntegrationPlatform;
  external_user_id: string | null;
  external_store_id: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: Date | null;
  metadata: string | Record<string, unknown> | null;
  connected_at: Date;
  updated_at: Date;
}

function rowToIntegration(row: IntegrationRow): StoreIntegration {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata) {
    metadata =
      typeof row.metadata === 'string'
        ? (JSON.parse(row.metadata) as Record<string, unknown>)
        : row.metadata;
  }
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    externalUserId: row.external_user_id,
    externalStoreId: row.external_store_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at).toISOString() : null,
    metadata,
    connectedAt: new Date(row.connected_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listIntegrationsForUser(userId: string): Promise<StoreIntegration[]> {
  const [rows] = await pool.query<IntegrationRow[]>(
    'SELECT * FROM store_integrations WHERE user_id = ? ORDER BY platform',
    [userId]
  );
  return rows.map(rowToIntegration);
}

export async function getIntegration(
  userId: string,
  platform: IntegrationPlatform
): Promise<StoreIntegration | null> {
  const [rows] = await pool.query<IntegrationRow[]>(
    'SELECT * FROM store_integrations WHERE user_id = ? AND platform = ? LIMIT 1',
    [userId, platform]
  );
  return rows[0] ? rowToIntegration(rows[0]) : null;
}

export async function upsertIntegration(data: {
  userId: string;
  platform: IntegrationPlatform;
  externalUserId?: string | null;
  externalStoreId?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}): Promise<StoreIntegration> {
  const now = new Date();
  const existing = await getIntegration(data.userId, data.platform);

  if (existing) {
    await pool.query(
      `UPDATE store_integrations
       SET external_user_id = ?, external_store_id = ?, access_token = ?, refresh_token = ?,
           token_expires_at = ?, metadata = ?, updated_at = ?
       WHERE id = ?`,
      [
        data.externalUserId ?? existing.externalUserId,
        data.externalStoreId ?? existing.externalStoreId,
        data.accessToken,
        data.refreshToken ?? existing.refreshToken,
        data.tokenExpiresAt ?? null,
        data.metadata ? JSON.stringify(data.metadata) : existing.metadata ? JSON.stringify(existing.metadata) : null,
        now,
        existing.id,
      ]
    );
    const updated = await getIntegration(data.userId, data.platform);
    if (!updated) throw new Error('INTEGRATION_SAVE_FAILED');
    return updated;
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO store_integrations
     (id, user_id, platform, external_user_id, external_store_id, access_token, refresh_token,
      token_expires_at, metadata, connected_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.userId,
      data.platform,
      data.externalUserId ?? null,
      data.externalStoreId ?? null,
      data.accessToken,
      data.refreshToken ?? null,
      data.tokenExpiresAt ?? null,
      data.metadata ? JSON.stringify(data.metadata) : null,
      now,
      now,
    ]
  );

  const created = await getIntegration(data.userId, data.platform);
  if (!created) throw new Error('INTEGRATION_SAVE_FAILED');
  return created;
}

export async function deleteIntegration(userId: string, platform: IntegrationPlatform): Promise<void> {
  await pool.query('DELETE FROM store_integrations WHERE user_id = ? AND platform = ?', [userId, platform]);
}

export function integrationStatusPublic(integration: StoreIntegration): {
  platform: IntegrationPlatform;
  connected: boolean;
  externalUserId: string | null;
  externalStoreId: string | null;
  nickname: string | null;
  connectedAt: string;
} {
  const nickname =
    typeof integration.metadata?.nickname === 'string'
      ? integration.metadata.nickname
      : typeof integration.metadata?.storeName === 'string'
        ? integration.metadata.storeName
        : null;

  return {
    platform: integration.platform,
    connected: true,
    externalUserId: integration.externalUserId,
    externalStoreId: integration.externalStoreId,
    nickname,
    connectedAt: integration.connectedAt,
  };
}
