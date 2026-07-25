import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { UserRole } from '../types/index.js';

export type LabelFont = 'helvetica' | 'times' | 'courier';
export const ALLOWED_LABEL_FONTS: readonly LabelFont[] = ['helvetica', 'times', 'courier'];
export const DEFAULT_LABEL_FONT: LabelFont = 'helvetica';
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const ALLOWED_LOGO_MIME = ['image/png', 'image/jpeg'];

let brandingColumnsReady: Promise<void> | null = null;

/** Garantiza users.logo_image/logo_mime/logo_updated_at/label_font (self-heal si migrate no corrió). */
async function ensureSellerBrandingColumns(): Promise<void> {
  if (!brandingColumnsReady) {
    brandingColumnsReady = (async () => {
      const [cols] = await pool.query<Array<{ COLUMN_NAME: string } & RowDataPacket>>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
           AND COLUMN_NAME IN ('logo_image', 'logo_mime', 'logo_updated_at', 'label_font')`
      );
      const have = new Set(cols.map((c) => c.COLUMN_NAME));
      if (!have.has('logo_image')) {
        await pool.query('ALTER TABLE users ADD COLUMN logo_image MEDIUMBLOB NULL AFTER delivery_deadline_hour');
      }
      if (!have.has('logo_mime')) {
        await pool.query('ALTER TABLE users ADD COLUMN logo_mime VARCHAR(32) NULL AFTER logo_image');
      }
      if (!have.has('logo_updated_at')) {
        await pool.query('ALTER TABLE users ADD COLUMN logo_updated_at DATETIME(3) NULL AFTER logo_mime');
      }
      if (!have.has('label_font')) {
        await pool.query(
          "ALTER TABLE users ADD COLUMN label_font VARCHAR(20) NOT NULL DEFAULT 'helvetica' AFTER logo_updated_at"
        );
      }
    })().catch((err) => {
      brandingColumnsReady = null;
      throw err;
    });
  }
  await brandingColumnsReady;
}

export async function getSellerBrandingSummary(
  sellerId: string
): Promise<{ hasLogo: boolean; labelFont: LabelFont; logoUpdatedAt: string | null }> {
  await ensureSellerBrandingColumns();
  const [rows] = await pool.query<
    Array<{ has_logo: number; label_font: LabelFont; logo_updated_at: Date | null } & RowDataPacket>
  >(
    `SELECT (logo_image IS NOT NULL) AS has_logo, label_font, logo_updated_at
     FROM users WHERE id = ? AND role = ? LIMIT 1`,
    [sellerId, UserRole.STORE_ADMIN]
  );
  const row = rows[0];
  return {
    hasLogo: Boolean(row?.has_logo),
    labelFont: row?.label_font ?? DEFAULT_LABEL_FONT,
    logoUpdatedAt: row?.logo_updated_at ? new Date(row.logo_updated_at).toISOString() : null,
  };
}

export async function getSellerLogo(sellerId: string): Promise<{ data: Buffer; mime: string } | null> {
  await ensureSellerBrandingColumns();
  const [rows] = await pool.query<
    Array<{ logo_image: Buffer | null; logo_mime: string | null } & RowDataPacket>
  >('SELECT logo_image, logo_mime FROM users WHERE id = ? AND role = ? LIMIT 1', [
    sellerId,
    UserRole.STORE_ADMIN,
  ]);
  const row = rows[0];
  if (!row?.logo_image || !row.logo_mime) return null;
  return { data: row.logo_image, mime: row.logo_mime };
}

export async function saveSellerLogo(sellerId: string, buffer: Buffer, mime: string): Promise<void> {
  if (!ALLOWED_LOGO_MIME.includes(mime)) throw new Error('INVALID_LOGO_MIME');
  if (buffer.length > MAX_LOGO_BYTES) throw new Error('LOGO_TOO_LARGE');
  await ensureSellerBrandingColumns();
  await pool.query(
    'UPDATE users SET logo_image = ?, logo_mime = ?, logo_updated_at = ? WHERE id = ? AND role = ?',
    [buffer, mime, new Date(), sellerId, UserRole.STORE_ADMIN]
  );
}

export async function deleteSellerLogo(sellerId: string): Promise<void> {
  await ensureSellerBrandingColumns();
  await pool.query(
    'UPDATE users SET logo_image = NULL, logo_mime = NULL, logo_updated_at = NULL WHERE id = ? AND role = ?',
    [sellerId, UserRole.STORE_ADMIN]
  );
}

export async function updateSellerLabelFont(sellerId: string, font: unknown): Promise<LabelFont> {
  if (typeof font !== 'string' || !ALLOWED_LABEL_FONTS.includes(font as LabelFont)) {
    throw new Error('INVALID_FONT');
  }
  await ensureSellerBrandingColumns();
  await pool.query('UPDATE users SET label_font = ? WHERE id = ? AND role = ?', [
    font,
    sellerId,
    UserRole.STORE_ADMIN,
  ]);
  return font as LabelFont;
}

/** Branding para generar el PDF de la etiqueta; sellerId nulo/sin configurar → defaults. */
export async function getShippingLabelBranding(
  sellerId: string | null | undefined
): Promise<{ logoBuffer: Buffer | null; labelFont: LabelFont }> {
  if (!sellerId) return { logoBuffer: null, labelFont: DEFAULT_LABEL_FONT };
  const [logo, summary] = await Promise.all([
    getSellerLogo(sellerId),
    getSellerBrandingSummary(sellerId),
  ]);
  return { logoBuffer: logo?.data ?? null, labelFont: summary.labelFont };
}
