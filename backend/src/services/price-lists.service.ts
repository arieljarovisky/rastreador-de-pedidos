import { randomUUID } from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { PRICING_ZONE_IDS } from '../config/amba-cordon-zones.js';
import { User, UserRole } from '../types/index.js';
import { isAgencyAdmin } from '../utils/roles.js';
import { findPricingZoneForPoint, listPricingZonesForAgency } from './delivery-zones.service.js';

export interface RateTrio {
  flex: number;
  express: number;
  standard: number;
}

export interface PriceListZoneRates {
  zoneKey: string;
  zoneName: string;
  shipping: RateTrio;
  driverPay: RateTrio;
}

export interface PriceList {
  id: string;
  agencyId: string;
  name: string;
  isDefault: boolean;
  outsideShipping: RateTrio;
  outsideDriverPay: RateTrio;
  zoneRates: PriceListZoneRates[];
  sellerCount: number;
}

export interface PriceListSummary {
  id: string;
  name: string;
  isDefault: boolean;
  sellerCount: number;
}

const DEFAULT_SHIPPING: RateTrio = { flex: 2800, express: 3200, standard: 2500 };
const DEFAULT_DRIVER: RateTrio = { flex: 1500, express: 1800, standard: 1200 };

const ZONE_NAMES: Record<string, string> = {
  zona_caba: 'CABA',
  zona_cordon_1: '1° Cordón',
  zona_cordon_2: '2° Cordón',
  zona_cordon_3: '3° Cordón',
};

interface PriceListRow extends RowDataPacket {
  id: string;
  agency_id: string;
  name: string;
  is_default: number;
  shipping_rate_flex: string | number;
  shipping_rate_express: string | number;
  shipping_rate_standard: string | number;
  driver_pay_flex: string | number;
  driver_pay_express: string | number;
  driver_pay_standard: string | number;
}

interface ZoneRateRow extends RowDataPacket {
  zone_key: string;
  shipping_rate_flex: string | number;
  shipping_rate_express: string | number;
  shipping_rate_standard: string | number;
  driver_pay_flex: string | number;
  driver_pay_express: string | number;
  driver_pay_standard: string | number;
}

function toMoney(value: string | number | null | undefined, fallback = 0): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
}

function trio(
  flex: string | number | null | undefined,
  express: string | number | null | undefined,
  standard: string | number | null | undefined,
  defaults: RateTrio
): RateTrio {
  return {
    flex: toMoney(flex, defaults.flex),
    express: toMoney(express, defaults.express),
    standard: toMoney(standard, defaults.standard),
  };
}

export function canonicalizePricingZoneKey(zoneId: string): string | null {
  for (const id of PRICING_ZONE_IDS) {
    if (zoneId === id || zoneId.endsWith(`_${id}`)) return id;
  }
  return null;
}

function pickRate(rates: RateTrio, shippingType: string | null | undefined): number {
  if (shippingType === 'flex') return rates.flex;
  if (shippingType === 'express') return rates.express;
  return rates.standard;
}

async function countSellersOnList(priceListId: string): Promise<number> {
  const [rows] = await pool.query<Array<{ cnt: number } & RowDataPacket>>(
    `SELECT COUNT(*) AS cnt FROM users
     WHERE role = ? AND price_list_id = ?`,
    [UserRole.STORE_ADMIN, priceListId]
  );
  return Number(rows[0]?.cnt ?? 0);
}

async function loadZoneRates(priceListId: string): Promise<PriceListZoneRates[]> {
  const [rows] = await pool.query<ZoneRateRow[]>(
    `SELECT zone_key, shipping_rate_flex, shipping_rate_express, shipping_rate_standard,
            driver_pay_flex, driver_pay_express, driver_pay_standard
     FROM price_list_zone_rates WHERE price_list_id = ?`,
    [priceListId]
  );
  const byKey = new Map(rows.map((r) => [r.zone_key, r]));
  return PRICING_ZONE_IDS.map((zoneKey) => {
    const row = byKey.get(zoneKey);
    return {
      zoneKey,
      zoneName: ZONE_NAMES[zoneKey] ?? zoneKey,
      shipping: row
        ? trio(row.shipping_rate_flex, row.shipping_rate_express, row.shipping_rate_standard, DEFAULT_SHIPPING)
        : { ...DEFAULT_SHIPPING },
      driverPay: row
        ? trio(row.driver_pay_flex, row.driver_pay_express, row.driver_pay_standard, DEFAULT_DRIVER)
        : { ...DEFAULT_DRIVER },
    };
  });
}

function rowToList(row: PriceListRow, zoneRates: PriceListZoneRates[], sellerCount: number): PriceList {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    isDefault: Boolean(row.is_default),
    outsideShipping: trio(
      row.shipping_rate_flex,
      row.shipping_rate_express,
      row.shipping_rate_standard,
      DEFAULT_SHIPPING
    ),
    outsideDriverPay: trio(
      row.driver_pay_flex,
      row.driver_pay_express,
      row.driver_pay_standard,
      DEFAULT_DRIVER
    ),
    zoneRates,
    sellerCount,
  };
}

export async function listPriceLists(agencyId: string): Promise<PriceListSummary[]> {
  const [rows] = await pool.query<PriceListRow[]>(
    `SELECT id, agency_id, name, is_default,
            shipping_rate_flex, shipping_rate_express, shipping_rate_standard,
            driver_pay_flex, driver_pay_express, driver_pay_standard
     FROM price_lists WHERE agency_id = ?
     ORDER BY is_default DESC, name ASC`,
    [agencyId]
  );
  const out: PriceListSummary[] = [];
  for (const row of rows) {
    out.push({
      id: row.id,
      name: row.name,
      isDefault: Boolean(row.is_default),
      sellerCount: await countSellersOnList(row.id),
    });
  }
  return out;
}

export async function getPriceList(agencyId: string, listId: string): Promise<PriceList | null> {
  const [rows] = await pool.query<PriceListRow[]>(
    `SELECT id, agency_id, name, is_default,
            shipping_rate_flex, shipping_rate_express, shipping_rate_standard,
            driver_pay_flex, driver_pay_express, driver_pay_standard
     FROM price_lists WHERE agency_id = ? AND id = ? LIMIT 1`,
    [agencyId, listId]
  );
  const row = rows[0];
  if (!row) return null;
  const zoneRates = await loadZoneRates(row.id);
  const sellerCount = await countSellersOnList(row.id);
  return rowToList(row, zoneRates, sellerCount);
}

export async function getDefaultPriceList(agencyId: string): Promise<PriceList | null> {
  const [rows] = await pool.query<PriceListRow[]>(
    `SELECT id FROM price_lists WHERE agency_id = ? AND is_default = 1 LIMIT 1`,
    [agencyId]
  );
  if (!rows[0]) return null;
  return getPriceList(agencyId, rows[0].id);
}

export async function resolvePriceListForSeller(
  agencyId: string,
  sellerId: string | null | undefined
): Promise<PriceList | null> {
  if (sellerId) {
    const [rows] = await pool.query<Array<{ price_list_id: string | null } & RowDataPacket>>(
      `SELECT price_list_id FROM users WHERE id = ? AND agency_id = ? AND role = ? LIMIT 1`,
      [sellerId, agencyId, UserRole.STORE_ADMIN]
    );
    const listId = rows[0]?.price_list_id;
    if (listId) {
      const list = await getPriceList(agencyId, listId);
      if (list) return list;
    }
  }
  return getDefaultPriceList(agencyId);
}

export async function resolveShippingAmountForOrder(input: {
  agencyId: string;
  sellerId: string | null;
  lat: number;
  lng: number;
  shippingType: string | null | undefined;
}): Promise<number> {
  const list = await resolvePriceListForSeller(input.agencyId, input.sellerId);
  if (!list) return DEFAULT_SHIPPING.standard;

  const zone = await findPricingZoneForPoint(input.agencyId, input.lat, input.lng);
  const zoneKey = zone ? canonicalizePricingZoneKey(zone.id) : null;
  if (zoneKey) {
    const zr = list.zoneRates.find((z) => z.zoneKey === zoneKey);
    if (zr) return pickRate(zr.shipping, input.shippingType);
  }
  return pickRate(list.outsideShipping, input.shippingType);
}

export async function resolveDriverPayAmountForOrder(input: {
  agencyId: string;
  sellerId: string | null;
  lat: number;
  lng: number;
  shippingType: string | null | undefined;
}): Promise<number> {
  const list = await resolvePriceListForSeller(input.agencyId, input.sellerId);
  if (!list) return DEFAULT_DRIVER.standard;

  const zone = await findPricingZoneForPoint(input.agencyId, input.lat, input.lng);
  const zoneKey = zone ? canonicalizePricingZoneKey(zone.id) : null;
  if (zoneKey) {
    const zr = list.zoneRates.find((z) => z.zoneKey === zoneKey);
    if (zr) return pickRate(zr.driverPay, input.shippingType);
  }
  return pickRate(list.outsideDriverPay, input.shippingType);
}

async function upsertZoneRates(
  priceListId: string,
  zoneRates: Array<{
    zoneKey: string;
    shipping: RateTrio;
    driverPay: RateTrio;
  }>
): Promise<void> {
  for (const zr of zoneRates) {
    if (!PRICING_ZONE_IDS.includes(zr.zoneKey)) continue;
    await pool.query(
      `INSERT INTO price_list_zone_rates
        (price_list_id, zone_key, shipping_rate_flex, shipping_rate_express, shipping_rate_standard,
         driver_pay_flex, driver_pay_express, driver_pay_standard)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         shipping_rate_flex = VALUES(shipping_rate_flex),
         shipping_rate_express = VALUES(shipping_rate_express),
         shipping_rate_standard = VALUES(shipping_rate_standard),
         driver_pay_flex = VALUES(driver_pay_flex),
         driver_pay_express = VALUES(driver_pay_express),
         driver_pay_standard = VALUES(driver_pay_standard)`,
      [
        priceListId,
        zr.zoneKey,
        zr.shipping.flex,
        zr.shipping.express,
        zr.shipping.standard,
        zr.driverPay.flex,
        zr.driverPay.express,
        zr.driverPay.standard,
      ]
    );
  }
}

export async function ensureDefaultPriceListForAgency(agencyId: string): Promise<PriceList> {
  const existing = await getDefaultPriceList(agencyId);
  if (existing) return existing;

  const [agencyRows] = await pool.query<
    Array<{
      shipping_rate_flex: string | number | null;
      shipping_rate_express: string | number | null;
      shipping_rate_standard: string | number | null;
      driver_pay_flex: string | number | null;
      driver_pay_express: string | number | null;
      driver_pay_standard: string | number | null;
    } & RowDataPacket>
  >(
    `SELECT shipping_rate_flex, shipping_rate_express, shipping_rate_standard,
            driver_pay_flex, driver_pay_express, driver_pay_standard
     FROM agencies WHERE id = ? LIMIT 1`,
    [agencyId]
  );
  const agency = agencyRows[0];
  const outsideShipping = trio(
    agency?.shipping_rate_flex,
    agency?.shipping_rate_express,
    agency?.shipping_rate_standard,
    DEFAULT_SHIPPING
  );
  const outsideDriver = trio(
    agency?.driver_pay_flex,
    agency?.driver_pay_express,
    agency?.driver_pay_standard,
    DEFAULT_DRIVER
  );

  const zones = await listPricingZonesForAgency(agencyId);
  const zoneRates = PRICING_ZONE_IDS.map((zoneKey) => {
    const zone = zones.find((z) => canonicalizePricingZoneKey(z.id) === zoneKey);
    return {
      zoneKey,
      shipping: zone?.shippingRates
        ? { ...zone.shippingRates }
        : { ...DEFAULT_SHIPPING },
      driverPay: zone?.driverPayRates
        ? { ...zone.driverPayRates }
        : { ...DEFAULT_DRIVER },
    };
  });

  const id = randomUUID();
  await pool.query(
    `INSERT INTO price_lists
      (id, agency_id, name, is_default,
       shipping_rate_flex, shipping_rate_express, shipping_rate_standard,
       driver_pay_flex, driver_pay_express, driver_pay_standard)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      agencyId,
      'Lista general',
      outsideShipping.flex,
      outsideShipping.express,
      outsideShipping.standard,
      outsideDriver.flex,
      outsideDriver.express,
      outsideDriver.standard,
    ]
  );
  await upsertZoneRates(id, zoneRates);
  const created = await getPriceList(agencyId, id);
  if (!created) throw new Error('CREATE_FAILED');
  return created;
}

export async function ensureDefaultPriceListsForAllAgencies(): Promise<void> {
  const [agencies] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    'SELECT id FROM agencies'
  );
  for (const agency of agencies) {
    await ensureDefaultPriceListForAgency(agency.id);
  }
}

export async function createPriceList(
  user: User,
  data: { name: string; cloneFromId?: string | null }
): Promise<PriceList> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) throw new Error('FORBIDDEN');
  const name = data.name.trim();
  if (name.length < 2) throw new Error('NAME_REQUIRED');

  await ensureDefaultPriceListForAgency(user.agencyId);

  let source: PriceList | null = null;
  if (data.cloneFromId) {
    source = await getPriceList(user.agencyId, data.cloneFromId);
  }
  if (!source) {
    source = await getDefaultPriceList(user.agencyId);
  }
  if (!source) throw new Error('CREATE_FAILED');

  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO price_lists
        (id, agency_id, name, is_default,
         shipping_rate_flex, shipping_rate_express, shipping_rate_standard,
         driver_pay_flex, driver_pay_express, driver_pay_standard)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        user.agencyId,
        name,
        source.outsideShipping.flex,
        source.outsideShipping.express,
        source.outsideShipping.standard,
        source.outsideDriverPay.flex,
        source.outsideDriverPay.express,
        source.outsideDriverPay.standard,
      ]
    );
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'ER_DUP_ENTRY') throw new Error('NAME_TAKEN');
    throw err;
  }

  await upsertZoneRates(
    id,
    source.zoneRates.map((z) => ({
      zoneKey: z.zoneKey,
      shipping: z.shipping,
      driverPay: z.driverPay,
    }))
  );

  const created = await getPriceList(user.agencyId, id);
  if (!created) throw new Error('CREATE_FAILED');
  return created;
}

export async function updatePriceList(
  user: User,
  listId: string,
  data: {
    name?: string;
    outsideShipping?: Partial<RateTrio>;
    outsideDriverPay?: Partial<RateTrio>;
    zoneRates?: Array<{
      zoneKey: string;
      shipping?: Partial<RateTrio>;
      driverPay?: Partial<RateTrio>;
    }>;
  }
): Promise<PriceList> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) throw new Error('FORBIDDEN');
  const current = await getPriceList(user.agencyId, listId);
  if (!current) throw new Error('NOT_FOUND');

  const name = data.name?.trim() ?? current.name;
  if (name.length < 2) throw new Error('NAME_REQUIRED');

  const outsideShipping = {
    flex: data.outsideShipping?.flex ?? current.outsideShipping.flex,
    express: data.outsideShipping?.express ?? current.outsideShipping.express,
    standard: data.outsideShipping?.standard ?? current.outsideShipping.standard,
  };
  const outsideDriverPay = {
    flex: data.outsideDriverPay?.flex ?? current.outsideDriverPay.flex,
    express: data.outsideDriverPay?.express ?? current.outsideDriverPay.express,
    standard: data.outsideDriverPay?.standard ?? current.outsideDriverPay.standard,
  };

  for (const n of [
    ...Object.values(outsideShipping),
    ...Object.values(outsideDriverPay),
  ]) {
    if (!Number.isFinite(n) || n < 0) throw new Error('INVALID_RATES');
  }

  try {
    await pool.query(
      `UPDATE price_lists SET
         name = ?,
         shipping_rate_flex = ?, shipping_rate_express = ?, shipping_rate_standard = ?,
         driver_pay_flex = ?, driver_pay_express = ?, driver_pay_standard = ?
       WHERE id = ? AND agency_id = ?`,
      [
        name,
        outsideShipping.flex,
        outsideShipping.express,
        outsideShipping.standard,
        outsideDriverPay.flex,
        outsideDriverPay.express,
        outsideDriverPay.standard,
        listId,
        user.agencyId,
      ]
    );
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'ER_DUP_ENTRY') throw new Error('NAME_TAKEN');
    throw err;
  }

  if (data.zoneRates?.length) {
    const merged = current.zoneRates.map((zr) => {
      const patch = data.zoneRates!.find((p) => p.zoneKey === zr.zoneKey);
      if (!patch) return { zoneKey: zr.zoneKey, shipping: zr.shipping, driverPay: zr.driverPay };
      return {
        zoneKey: zr.zoneKey,
        shipping: {
          flex: patch.shipping?.flex ?? zr.shipping.flex,
          express: patch.shipping?.express ?? zr.shipping.express,
          standard: patch.shipping?.standard ?? zr.shipping.standard,
        },
        driverPay: {
          flex: patch.driverPay?.flex ?? zr.driverPay.flex,
          express: patch.driverPay?.express ?? zr.driverPay.express,
          standard: patch.driverPay?.standard ?? zr.driverPay.standard,
        },
      };
    });
    for (const zr of merged) {
      for (const n of [...Object.values(zr.shipping), ...Object.values(zr.driverPay)]) {
        if (!Number.isFinite(n) || n < 0) throw new Error('INVALID_RATES');
      }
    }
    await upsertZoneRates(listId, merged);
  }

  // Mantener agencies.* y delivery_zones en sync si es la lista default (compat lectura vieja)
  if (current.isDefault) {
    await pool.query(
      `UPDATE agencies SET
         shipping_rate_flex = ?, shipping_rate_express = ?, shipping_rate_standard = ?,
         driver_pay_flex = ?, driver_pay_express = ?, driver_pay_standard = ?
       WHERE id = ?`,
      [
        outsideShipping.flex,
        outsideShipping.express,
        outsideShipping.standard,
        outsideDriverPay.flex,
        outsideDriverPay.express,
        outsideDriverPay.standard,
        user.agencyId,
      ]
    );
  }

  const updated = await getPriceList(user.agencyId, listId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}

export async function deletePriceList(user: User, listId: string): Promise<void> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) throw new Error('FORBIDDEN');
  const current = await getPriceList(user.agencyId, listId);
  if (!current) throw new Error('NOT_FOUND');
  if (current.isDefault) throw new Error('DEFAULT_PROTECTED');

  await pool.query('UPDATE users SET price_list_id = NULL WHERE price_list_id = ? AND agency_id = ?', [
    listId,
    user.agencyId,
  ]);
  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM price_lists WHERE id = ? AND agency_id = ?',
    [listId, user.agencyId]
  );
  if (result.affectedRows === 0) throw new Error('NOT_FOUND');
}

export async function assignSellerPriceList(
  user: User,
  sellerId: string,
  priceListId: string | null
): Promise<void> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) throw new Error('FORBIDDEN');

  const [sellers] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    `SELECT id FROM users WHERE id = ? AND agency_id = ? AND role = ? LIMIT 1`,
    [sellerId, user.agencyId, UserRole.STORE_ADMIN]
  );
  if (!sellers[0]) throw new Error('SELLER_NOT_FOUND');

  if (priceListId) {
    const list = await getPriceList(user.agencyId, priceListId);
    if (!list) throw new Error('NOT_FOUND');
  }

  await pool.query('UPDATE users SET price_list_id = ? WHERE id = ?', [priceListId, sellerId]);
}

export async function listSellersPriceListAssignments(agencyId: string): Promise<
  Array<{ sellerId: string; sellerName: string; priceListId: string | null; priceListName: string | null }>
> {
  const [rows] = await pool.query<
    Array<{
      id: string;
      name: string;
      price_list_id: string | null;
      list_name: string | null;
    } & RowDataPacket>
  >(
    `SELECT u.id, u.name, u.price_list_id, pl.name AS list_name
     FROM users u
     LEFT JOIN price_lists pl ON pl.id = u.price_list_id
     WHERE u.agency_id = ? AND u.role = ?
     ORDER BY u.name ASC`,
    [agencyId, UserRole.STORE_ADMIN]
  );
  return rows.map((r) => ({
    sellerId: r.id,
    sellerName: r.name,
    priceListId: r.price_list_id,
    priceListName: r.list_name,
  }));
}
