import { createHash, randomBytes } from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { isValidEmail } from '../utils/email.js';
import { findUserByUsername, getUserById } from './users.service.js';
import { sendMail } from './mail.service.js';
import { User } from '../types/index.js';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const GENERIC_OK =
  'Si ese correo tiene una cuenta pendiente, te enviamos un enlace de activación.';

interface VerifyTokenRow extends RowDataPacket {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function buildVerifyUrl(token: string): string {
  const base = env.frontendUrl.replace(/\/$/, '');
  return `${base}/app?verifyToken=${encodeURIComponent(token)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendEmailVerification(userId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user || !isValidEmail(user.username)) {
    return;
  }

  const [rows] = await pool.query<
    Array<{ email_verified_at: Date | null } & RowDataPacket>
  >('SELECT email_verified_at FROM users WHERE id = ? LIMIT 1', [userId]);
  if (rows[0]?.email_verified_at) {
    return;
  }

  await pool.query(
    `UPDATE email_verification_tokens
     SET used_at = COALESCE(used_at, NOW(3))
     WHERE user_id = ? AND used_at IS NULL`,
    [userId]
  );

  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const id = `evt${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await pool.query(
    `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [id, userId, tokenHash, expiresAt]
  );

  const verifyUrl = buildVerifyUrl(token);
  const html = `
    <p>Hola${user.name ? ` ${escapeHtml(user.name)}` : ''},</p>
    <p>Confirmá tu correo para activar tu cuenta de agencia en Posta.</p>
    <p><a href="${verifyUrl}">Activar cuenta</a></p>
    <p>El enlace vence en 24 horas. Si no creaste esta cuenta, ignorá este correo.</p>
    <p style="color:#666;font-size:12px;">Si el botón no funciona, copiá esta URL:<br>${escapeHtml(verifyUrl)}</p>
  `;

  try {
    const result = await sendMail({
      to: user.username,
      subject: 'Activá tu cuenta — Posta',
      html,
      text: `Activá tu cuenta en Posta:\n\n${verifyUrl}\n\nEl enlace vence en 24 horas.`,
    });
    if (!result.sent) {
      console.info(`[email-verification] Link de desarrollo para ${user.username}: ${verifyUrl}`);
    }
  } catch (err) {
    console.error('[email-verification] No se pudo enviar el correo:', err);
  }
}

export async function resendEmailVerification(emailRaw: string): Promise<{ message: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { message: GENERIC_OK };
  }

  const user = await findUserByUsername(email);
  if (!user) {
    return { message: GENERIC_OK };
  }

  if (user.email_verified_at) {
    return { message: GENERIC_OK };
  }

  await sendEmailVerification(user.id);
  return { message: GENERIC_OK };
}

export async function verifyEmailWithToken(tokenRaw: string): Promise<User> {
  const token = tokenRaw.trim();
  if (!token || token.length < 32) {
    throw new Error('INVALID_TOKEN');
  }

  const tokenHash = hashToken(token);
  const [rows] = await pool.query<VerifyTokenRow[]>(
    `SELECT id, user_id, token_hash, expires_at, used_at
     FROM email_verification_tokens
     WHERE token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );

  const row = rows[0];
  if (!row || row.used_at) {
    throw new Error('INVALID_TOKEN');
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error('EXPIRED_TOKEN');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [updateResult] = await connection.query<ResultSetHeader>(
      `UPDATE email_verification_tokens
       SET used_at = NOW(3)
       WHERE id = ? AND used_at IS NULL`,
      [row.id]
    );
    if (updateResult.affectedRows === 0) {
      throw new Error('INVALID_TOKEN');
    }

    await connection.query(
      `UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW(3)) WHERE id = ?`,
      [row.user_id]
    );

    await connection.query(
      `UPDATE email_verification_tokens
       SET used_at = NOW(3)
       WHERE user_id = ? AND used_at IS NULL AND id <> ?`,
      [row.user_id, row.id]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  const user = await getUserById(row.user_id);
  if (!user) {
    throw new Error('INVALID_TOKEN');
  }
  return user;
}
