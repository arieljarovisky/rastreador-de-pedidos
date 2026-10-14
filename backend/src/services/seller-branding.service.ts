import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { UserRole } from '../types/index.js';

export type LabelFont = 'helvetica' | 'times' | 'courier';
export const ALLOWED_LABEL_FONTS: readonly LabelFont[] = ['helvetica', 'times', 'courier'];
export const DEFAULT_LABEL_FONT: LabelFont = 'helvetica';
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const ALLOWED_LOGO_MIME = ['image/png', 'image/jpeg'];

export interface SellerContact {
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  whatsapp: string | null;
  storeAddress: string | null;
}

export const EMPTY_SELLER_CONTACT: SellerContact = {
  instagram: null,
  facebook: null,
  tiktok: null,
  whatsapp: null,
  storeAddress: null,
};

let brandingColumnsReady: Promise<void> | null = null;

/** Garantiza columnas de branding y contacto público (self-heal si migrate no corrió). */
async function ensureSellerBrandingColumns(): Promise<void> {
  if (!brandingColumnsReady) {
    brandingColumnsReady = (async () => {
      const [cols] = await pool.query<Array<{ COLUMN_NAME: string } & RowDataPacket>>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
           AND COLUMN_NAME IN ('logo_image', 'logo_mime', 'logo_updated_at', 'label_font',
             'seller_instagram', 'seller_facebook', 'seller_tiktok', 'seller_whatsapp', 'seller_store_address')`
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
      if (!have.has('seller_instagram')) {
        await pool.query('ALTER TABLE users ADD COLUMN seller_instagram VARCHAR(30) NULL AFTER label_font');
      }
      if (!have.has('seller_facebook')) {
        await pool.query('ALTER TABLE users ADD COLUMN seller_facebook VARCHAR(80) NULL AFTER seller_instagram');
      }
      if (!have.has('seller_tiktok')) {
        await pool.query('ALTER TABLE users ADD COLUMN seller_tiktok VARCHAR(30) NULL AFTER seller_facebook');
      }
      if (!have.has('seller_whatsapp')) {
        await pool.query('ALTER TABLE users ADD COLUMN seller_whatsapp VARCHAR(20) NULL AFTER seller_tiktok');
      }
      if (!have.has('seller_store_address')) {
        await pool.query(
          'ALTER TABLE users ADD COLUMN seller_store_address VARCHAR(140) NULL AFTER seller_whatsapp'
        );
      }
    })().catch((err) => {
      brandingColumnsReady = null;
      throw err;
    });
  }
  await brandingColumnsReady;
}

type ContactRow = {
  seller_instagram: string | null;
  seller_facebook: string | null;
  seller_tiktok: string | null;
  seller_whatsapp: string | null;
  seller_store_address: string | null;
};

function contactFromRow(row: ContactRow | undefined): SellerContact {
  if (!row) return { ...EMPTY_SELLER_CONTACT };
  return {
    instagram: row.seller_instagram?.trim() || null,
    facebook: row.seller_facebook?.trim() || null,
    tiktok: row.seller_tiktok?.trim() || null,
    whatsapp: row.seller_whatsapp?.trim() || null,
    storeAddress: row.seller_store_address?.trim() || null,
  };
}

export function sellerContactHasContent(contact: SellerContact | null | undefined): boolean {
  if (!contact) return false;
  return Boolean(
    contact.instagram || contact.facebook || contact.tiktok || contact.whatsapp || contact.storeAddress
  );
}

function readOptionalText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error('INVALID_CONTACT');
  const trimmed = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSocialHandle(value: unknown): string | null {
  const raw = readOptionalText(value);
  if (!raw) return null;
  let handle = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  handle = handle.replace(/^(instagram\.com|tiktok\.com)\//i, '');
  handle = handle.replace(/^@/, '').split(/[/?#]/)[0]?.trim() ?? '';
  if (!handle) return null;
  if (handle.length > 30) throw new Error('CONTACT_TOO_LONG');
  if (!/^[A-Za-z0-9._]+$/.test(handle) || !/[A-Za-z0-9]/.test(handle)) {
    throw new Error('INVALID_HANDLE');
  }
  return handle;
}

function normalizeFacebook(value: unknown): string | null {
  const raw = readOptionalText(value);
  if (!raw) return null;
  let page = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  page = page.replace(/^(facebook\.com|fb\.com)\//i, '').replace(/\/+$/, '');
  if (!page) return null;
  if (page.length > 80) throw new Error('CONTACT_TOO_LONG');
  if (!/^[A-Za-z0-9._\-/]+$/.test(page) || !/[A-Za-z0-9]/.test(page)) {
    throw new Error('INVALID_HANDLE');
  }
  return page;
}

function normalizeWhatsapp(value: unknown): string | null {
  const raw = readOptionalText(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) throw new Error('INVALID_WHATSAPP');
  return digits;
}

function normalizeStoreAddress(value: unknown): string | null {
  const raw = readOptionalText(value);
  if (!raw) return null;
  if (raw.length < 4) throw new Error('ADDRESS_TOO_SHORT');
  if (raw.length > 140) throw new Error('ADDRESS_TOO_LONG');
  return raw;
}

export async function getSellerBrandingSummary(sellerId: string): Promise<{
  hasLogo: boolean;
  labelFont: LabelFont;
  logoUpdatedAt: string | null;
  contact: SellerContact;
}> {
  await ensureSellerBrandingColumns();
  const [rows] = await pool.query<
    Array<
      {
        has_logo: number;
        label_font: LabelFont;
        logo_updated_at: Date | null;
      } & ContactRow &
        RowDataPacket
    >
  >(
    `SELECT (logo_image IS NOT NULL) AS has_logo, label_font, logo_updated_at,
            seller_instagram, seller_facebook, seller_tiktok, seller_whatsapp, seller_store_address
     FROM users WHERE id = ? AND role = ? LIMIT 1`,
    [sellerId, UserRole.STORE_ADMIN]
  );
  const row = rows[0];
  return {
    hasLogo: Boolean(row?.has_logo),
    labelFont: row?.label_font ?? DEFAULT_LABEL_FONT,
    logoUpdatedAt: row?.logo_updated_at ? new Date(row.logo_updated_at).toISOString() : null,
    contact: contactFromRow(row),
  };
}

export async function getSellerContact(sellerId: string): Promise<SellerContact> {
  const summary = await getSellerBrandingSummary(sellerId);
  return summary.contact;
}

export async function updateSellerContact(sellerId: string, body: unknown): Promise<SellerContact> {
  if (!body || typeof body !== 'object') throw new Error('INVALID_CONTACT');
  const input = body as Record<string, unknown>;
  const contact: SellerContact = {
    instagram: normalizeSocialHandle(input.instagram),
    facebook: normalizeFacebook(input.facebook),
    tiktok: normalizeSocialHandle(input.tiktok),
    whatsapp: normalizeWhatsapp(input.whatsapp),
    storeAddress: normalizeStoreAddress(input.storeAddress),
  };
  await ensureSellerBrandingColumns();
  await pool.query(
    `UPDATE users
     SET seller_instagram = ?, seller_facebook = ?, seller_tiktok = ?, seller_whatsapp = ?, seller_store_address = ?
     WHERE id = ? AND role = ?`,
    [
      contact.instagram,
      contact.facebook,
      contact.tiktok,
      contact.whatsapp,
      contact.storeAddress,
      sellerId,
      UserRole.STORE_ADMIN,
    ]
  );
  return contact;
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
export async function getShippingLabelBranding(sellerId: string | null | undefined): Promise<{
  logoBuffer: Buffer | null;
  labelFont: LabelFont;
  contact: SellerContact;
}> {
  if (!sellerId) {
    return { logoBuffer: null, labelFont: DEFAULT_LABEL_FONT, contact: { ...EMPTY_SELLER_CONTACT } };
  }
  const [logo, summary] = await Promise.all([
    getSellerLogo(sellerId),
    getSellerBrandingSummary(sellerId),
  ]);
  return { logoBuffer: logo?.data ?? null, labelFont: summary.labelFont, contact: summary.contact };
}
