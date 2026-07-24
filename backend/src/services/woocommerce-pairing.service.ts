import { randomBytes } from 'crypto';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';

const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I

interface PairingRow extends RowDataPacket {
  code: string;
  user_id: string;
  expires_at: Date;
  used_at: Date | null;
}

export interface WooPairingCodeResult {
  code: string;
  expiresAt: string;
  pluginDownloadUrl: string;
}

export function getWooCommercePluginDownloadUrl(): string {
  const base = env.frontendUrl.replace(/\/$/, '');
  return `${base}/downloads/posta-woocommerce.zip`;
}

function generateReadableCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function normalizePairingCode(input: string): string {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== 8) return '';
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

export async function createWooCommercePairingCode(userId: string): Promise<WooPairingCodeResult> {
  await pool.query(
    `UPDATE woocommerce_pairing_codes
     SET used_at = UTC_TIMESTAMP(3)
     WHERE user_id = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP(3)`,
    [userId]
  );

  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  let code = generateReadableCode();
  let attempts = 0;

  while (attempts < 5) {
    try {
      await pool.query(
        `INSERT INTO woocommerce_pairing_codes (code, user_id, expires_at, used_at, created_at)
         VALUES (?, ?, ?, NULL, UTC_TIMESTAMP(3))`,
        [code, userId, expiresAt]
      );
      return {
        code,
        expiresAt: expiresAt.toISOString(),
        pluginDownloadUrl: getWooCommercePluginDownloadUrl(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!message.includes('Duplicate') && !message.includes('ER_DUP_ENTRY')) throw err;
      code = generateReadableCode();
      attempts += 1;
    }
  }

  throw new Error('WOO_PAIRING_CODE_CREATE_FAILED');
}

/** Consume un código (one-shot). Devuelve userId del vendedor. */
export async function consumeWooCommercePairingCode(rawCode: string): Promise<string> {
  const code = normalizePairingCode(rawCode);
  if (!code) throw new Error('WOO_PAIRING_INVALID');

  const [rows] = await pool.query<PairingRow[]>(
    `SELECT code, user_id, expires_at, used_at
     FROM woocommerce_pairing_codes
     WHERE code = ?
     LIMIT 1`,
    [code]
  );
  const row = rows[0];
  if (!row) throw new Error('WOO_PAIRING_INVALID');
  if (row.used_at) throw new Error('WOO_PAIRING_USED');
  if (new Date(row.expires_at).getTime() < Date.now()) throw new Error('WOO_PAIRING_EXPIRED');

  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE woocommerce_pairing_codes
     SET used_at = UTC_TIMESTAMP(3)
     WHERE code = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP(3)`,
    [code]
  );
  if (result.affectedRows !== 1) throw new Error('WOO_PAIRING_USED');

  return row.user_id;
}

export function signWooCommercePluginToken(userId: string): string {
  return jwt.sign({ userId, purpose: 'woocommerce_plugin' }, env.jwtSecret);
}

export function verifyWooCommercePluginToken(token: string): string {
  const payload = jwt.verify(token, env.jwtSecret) as {
    userId?: string;
    purpose?: string;
  };
  if (!payload.userId || payload.purpose !== 'woocommerce_plugin') {
    throw new Error('WOO_PLUGIN_TOKEN_INVALID');
  }
  return payload.userId;
}
