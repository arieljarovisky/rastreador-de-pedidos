import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { isValidEmail } from '../utils/email.js';
import { validateStrongPassword } from '../utils/password.js';
import { findUserByUsername } from './users.service.js';
import { sendMail } from './mail.service.js';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora
const GENERIC_OK =
  'Si ese correo está registrado, te enviamos un enlace para restablecer la contraseña.';

interface ResetTokenRow extends RowDataPacket {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function buildResetUrl(token: string): string {
  const base = env.frontendUrl.replace(/\/$/, '');
  return `${base}/app?resetToken=${encodeURIComponent(token)}`;
}

export async function requestPasswordReset(emailRaw: string): Promise<{ message: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { message: GENERIC_OK };
  }

  const user = await findUserByUsername(email);
  if (!user || !isValidEmail(user.username)) {
    return { message: GENERIC_OK };
  }

  // Invalidar tokens previos sin usar
  await pool.query(
    `UPDATE password_reset_tokens
     SET used_at = COALESCE(used_at, NOW(3))
     WHERE user_id = ? AND used_at IS NULL`,
    [user.id]
  );

  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const id = `prt${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await pool.query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [id, user.id, tokenHash, expiresAt]
  );

  const resetUrl = buildResetUrl(token);
  const html = `
    <p>Hola${user.name ? ` ${escapeHtml(user.name)}` : ''},</p>
    <p>Recibimos un pedido para restablecer la contraseña de tu cuenta en Posta.</p>
    <p><a href="${resetUrl}">Restablecer contraseña</a></p>
    <p>El enlace vence en 1 hora. Si no pediste este cambio, ignorá este correo.</p>
    <p style="color:#666;font-size:12px;">Si el botón no funciona, copiá esta URL:<br>${escapeHtml(resetUrl)}</p>
  `;

  try {
    const result = await sendMail({
      to: user.username,
      subject: 'Restablecé tu contraseña — Posta',
      html,
      text: `Restablecé tu contraseña en Posta:\n\n${resetUrl}\n\nEl enlace vence en 1 hora.`,
    });
    if (!result.sent) {
      console.info(`[password-reset] Link de desarrollo para ${user.username}: ${resetUrl}`);
    }
  } catch (err) {
    console.error('[password-reset] No se pudo enviar el correo:', err);
    // No revelamos el fallo al cliente (evita enumeración / ruido); el token queda creado.
  }

  return { message: GENERIC_OK };
}

export async function resetPasswordWithToken(
  tokenRaw: string,
  password: string
): Promise<void> {
  const token = tokenRaw.trim();
  if (!token || token.length < 32) {
    throw new Error('INVALID_TOKEN');
  }

  const passwordCheck = validateStrongPassword(password);
  if (!passwordCheck.ok) {
    throw new Error('WEAK_PASSWORD');
  }

  const tokenHash = hashToken(token);
  const [rows] = await pool.query<ResetTokenRow[]>(
    `SELECT id, user_id, token_hash, expires_at, used_at
     FROM password_reset_tokens
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

  const passwordHash = await bcrypt.hash(password, 10);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [updateResult] = await connection.query<ResultSetHeader>(
      `UPDATE password_reset_tokens
       SET used_at = NOW(3)
       WHERE id = ? AND used_at IS NULL`,
      [row.id]
    );
    if (updateResult.affectedRows === 0) {
      throw new Error('INVALID_TOKEN');
    }

    await connection.query('UPDATE users SET password_hash = ?, session_token = NULL WHERE id = ?', [
      passwordHash,
      row.user_id,
    ]);

    // Invalidar otros tokens pendientes del mismo usuario
    await connection.query(
      `UPDATE password_reset_tokens
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
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
