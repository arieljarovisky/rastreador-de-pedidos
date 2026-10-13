import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { AMBA_CORDON_ZONES, PRICING_ZONE_IDS } from '../config/amba-cordon-zones.js';
import { resolvePriceListForSeller } from './price-lists.service.js';

/** Express de respaldo, alineado a DEFAULT_SHIPPING de las listas. */
const FALLBACK_EXPRESS = 3200;
const MAX_PRICE = 10_000_000;

export interface SellerCustomerZoneRate {
  zoneKey: string;
  zoneName: string;
  /** null = el cliente ve el mismo precio que cobra Posta. */
  customerPrice: number | null;
  postaPrice: number;
}

interface RateRow extends RowDataPacket {
  zone_key: string;
  customer_price: string | number;
}

let tableReady: Promise<void> | null = null;

async function ensureSellerCustomerRatesTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS seller_customer_shipping_rates (
          user_id VARCHAR(36) NOT NULL,
          zone_key VARCHAR(64) NOT NULL,
          customer_price DECIMAL(12,2) NOT NULL,
          updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (user_id, zone_key),
          CONSTRAINT fk_scsr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      )
      .then(() => undefined)
      .catch((err) => {
        tableReady = null;
        throw err;
      });
  }
  return tableReady;
}

function toMoney(value: string | number | null | undefined, fallback: number): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
}

export function parseCustomerPrice(value: unknown): number | null {
  if (value == null || value === '') return null;
  const raw = typeof value === 'number' ? value : Number(String(value).replace(',', '.').trim());
  if (!Number.isFinite(raw) || raw < 0 || raw > MAX_PRICE) {
    throw new Error('INVALID_PRICE');
  }
  return Math.round(raw * 100) / 100;
}

async function postaExpressByZone(
  agencyId: string,
  sellerId: string
): Promise<Map<string, number>> {
  const list = await resolvePriceListForSeller(agencyId, sellerId);
  const out = new Map<string, number>();
  for (const zoneKey of PRICING_ZONE_IDS) {
    const zone = list?.zoneRates.find((z) => z.zoneKey === zoneKey);
    out.set(zoneKey, zone ? toMoney(zone.shipping.express, FALLBACK_EXPRESS) : FALLBACK_EXPRESS);
  }
  return out;
}

export async function getSellerCustomerShippingRates(
  sellerId: string,
  agencyId: string
): Promise<SellerCustomerZoneRate[]> {
  await ensureSellerCustomerRatesTable();
  const [rows] = await pool.query<RateRow[]>(
    `SELECT zone_key, customer_price
     FROM seller_customer_shipping_rates WHERE user_id = ?`,
    [sellerId]
  );
  const custom = new Map(rows.map((row) => [row.zone_key, toMoney(row.customer_price, 0)]));
  const posta = await postaExpressByZone(agencyId, sellerId);

  return AMBA_CORDON_ZONES.filter((zone) => PRICING_ZONE_IDS.includes(zone.id)).map((zone) => ({
    zoneKey: zone.id,
    zoneName: zone.name,
    customerPrice: custom.has(zone.id) ? (custom.get(zone.id) ?? null) : null,
    postaPrice: posta.get(zone.id) ?? FALLBACK_EXPRESS,
  }));
}

export async function saveSellerCustomerShippingRates(
  sellerId: string,
  agencyId: string,
  input: Array<{ zoneKey: string; customerPrice: number | null }>
): Promise<SellerCustomerZoneRate[]> {
  await ensureSellerCustomerRatesTable();

  const allowed = new Set<string>(PRICING_ZONE_IDS);
  const byKey = new Map<string, number | null>();
  for (const item of input) {
    if (!allowed.has(item.zoneKey)) throw new Error('INVALID_ZONE');
    if (byKey.has(item.zoneKey)) throw new Error('INVALID_ZONE');
    byKey.set(item.zoneKey, item.customerPrice);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const zoneKey of PRICING_ZONE_IDS) {
      const price = byKey.get(zoneKey) ?? null;
      if (price == null) {
        await conn.query(
          `DELETE FROM seller_customer_shipping_rates WHERE user_id = ? AND zone_key = ?`,
          [sellerId, zoneKey]
        );
        continue;
      }
      await conn.query(
        `INSERT INTO seller_customer_shipping_rates (user_id, zone_key, customer_price)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE customer_price = VALUES(customer_price)`,
        [sellerId, zoneKey, price]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return getSellerCustomerShippingRates(sellerId, agencyId);
}

/** Precio que el vendedor eligió para esa zona, o null si sigue el de Posta. */
export async function resolveSellerCustomerPrice(
  sellerId: string,
  zoneKey: string
): Promise<number | null> {
  if (!PRICING_ZONE_IDS.includes(zoneKey)) return null;
  await ensureSellerCustomerRatesTable();
  const [rows] = await pool.query<RateRow[]>(
    `SELECT zone_key, customer_price
     FROM seller_customer_shipping_rates
     WHERE user_id = ? AND zone_key = ? LIMIT 1`,
    [sellerId, zoneKey]
  );
  const row = rows[0];
  if (!row) return null;
  return toMoney(row.customer_price, 0);
}
