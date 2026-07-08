import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import {
  exchangeMercadoPagoCode,
  refreshMercadoPagoToken,
  type MpTokenResponse,
} from './mercadopago.service.js';

export interface AgencyMercadoPagoAccount {
  agencyId: string;
  mpUserId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  publicKey: string | null;
  nickname: string | null;
  connectedAt: string;
}

interface MpAccountRow extends RowDataPacket {
  agency_id: string;
  mp_user_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: Date | null;
  public_key: string | null;
  nickname: string | null;
  connected_at: Date;
}

function rowToAccount(row: MpAccountRow): AgencyMercadoPagoAccount {
  return {
    agencyId: row.agency_id,
    mpUserId: row.mp_user_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at).toISOString() : null,
    publicKey: row.public_key,
    nickname: row.nickname,
    connectedAt: new Date(row.connected_at).toISOString(),
  };
}

function tokenExpiresAt(expiresIn?: number): Date | null {
  if (!expiresIn) return null;
  return new Date(Date.now() + expiresIn * 1000);
}

export async function getAgencyMercadoPagoAccount(
  agencyId: string
): Promise<AgencyMercadoPagoAccount | null> {
  const [rows] = await pool.query<MpAccountRow[]>(
    'SELECT * FROM agency_mercadopago_accounts WHERE agency_id = ? LIMIT 1',
    [agencyId]
  );
  return rows[0] ? rowToAccount(rows[0]) : null;
}

export async function upsertAgencyMercadoPagoAccount(
  agencyId: string,
  token: MpTokenResponse,
  nickname?: string | null
): Promise<AgencyMercadoPagoAccount> {
  const now = new Date();
  const expires = tokenExpiresAt(token.expires_in);
  const mpUserId = String(token.user_id ?? '');
  await pool.query(
    `INSERT INTO agency_mercadopago_accounts
      (agency_id, mp_user_id, access_token, refresh_token, token_expires_at, public_key, nickname, connected_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      mp_user_id = VALUES(mp_user_id),
      access_token = VALUES(access_token),
      refresh_token = VALUES(refresh_token),
      token_expires_at = VALUES(token_expires_at),
      public_key = VALUES(public_key),
      nickname = COALESCE(VALUES(nickname), nickname),
      updated_at = VALUES(updated_at)`,
    [
      agencyId,
      mpUserId,
      token.access_token,
      token.refresh_token ?? null,
      expires,
      token.public_key ?? null,
      nickname ?? null,
      now,
      now,
    ]
  );
  const account = await getAgencyMercadoPagoAccount(agencyId);
  if (!account) throw new Error('MP_SAVE_FAILED');
  return account;
}

export async function connectAgencyMercadoPago(
  agencyId: string,
  code: string
): Promise<AgencyMercadoPagoAccount> {
  const token = await exchangeMercadoPagoCode(code);
  return upsertAgencyMercadoPagoAccount(agencyId, token);
}

export async function disconnectAgencyMercadoPago(agencyId: string): Promise<void> {
  await pool.query('DELETE FROM agency_mercadopago_accounts WHERE agency_id = ?', [agencyId]);
}

export async function getValidAgencyMercadoPagoToken(agencyId: string): Promise<string> {
  const account = await getAgencyMercadoPagoAccount(agencyId);
  if (!account) throw new Error('MP_NOT_CONNECTED');

  const expires = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : null;
  const needsRefresh = expires && expires - Date.now() < 5 * 60 * 1000;

  if (!needsRefresh || !account.refreshToken) return account.accessToken;

  const refreshed = await refreshMercadoPagoToken(account.refreshToken);
  const updated = await upsertAgencyMercadoPagoAccount(agencyId, refreshed, account.nickname);
  return updated.accessToken;
}

export function agencyMpStatusPublic(account: AgencyMercadoPagoAccount | null) {
  if (!account) return null;
  return {
    mpUserId: account.mpUserId,
    nickname: account.nickname,
    connectedAt: account.connectedAt,
  };
}
