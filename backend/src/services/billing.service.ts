import { randomUUID } from 'crypto';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { Order, OrderStatus, User, UserRole } from '../types/index.js';
import { isAgencyAdmin } from '../utils/roles.js';
import { getOrderById } from './orders.service.js';
import { findPricingZoneForPoint, listPricingZonesForAgency } from './delivery-zones.service.js';

export interface AgencyShippingRates {
  flex: number;
  express: number;
  standard: number;
  currency: 'ARS';
}

export interface ZoneShippingRates {
  zoneId: string;
  zoneName: string;
  flex: number;
  express: number;
  standard: number;
  currency: 'ARS';
}

export interface BillingLedgerEntry {
  id: string;
  agencyId: string;
  sellerId: string;
  sellerName: string | null;
  orderId: string | null;
  orderAddress: string | null;
  pricingZoneId: string | null;
  pricingZoneName: string | null;
  entryType: 'charge' | 'payment' | 'adjustment';
  amount: number;
  description: string;
  createdBy: string | null;
  createdAt: string;
}

export interface BillingSummary {
  currency: 'ARS';
  dateFrom: string;
  dateTo: string;
  sellerId: string | null;
  sellerName: string | null;
  totalSpent: number;
  totalPaid: number;
  balance: number;
  chargedShipments: number;
  zoneRates: ZoneShippingRates[];
  defaultRates: AgencyShippingRates;
  byShippingType: Array<{ shippingType: string; count: number; amount: number }>;
  sellers?: Array<{
    sellerId: string;
    sellerName: string;
    totalSpent: number;
    balance: number;
    chargedShipments: number;
  }>;
}

const DEFAULT_RATES: AgencyShippingRates = {
  flex: 2800,
  express: 3200,
  standard: 2500,
  currency: 'ARS',
};

interface AgencyRateRow extends RowDataPacket {
  shipping_rate_flex: string | null;
  shipping_rate_express: string | null;
  shipping_rate_standard: string | null;
}

function toMoney(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function resolveRateForOrder(rates: AgencyShippingRates, shippingType: string | null | undefined): number {
  if (shippingType === 'flex') return rates.flex;
  if (shippingType === 'express') return rates.express;
  return rates.standard;
}

async function resolveOrderShippingRate(order: Order): Promise<number> {
  if (!order.agencyId) return DEFAULT_RATES.standard;

  try {
    const { resolveShippingAmountForOrder } = await import('./price-lists.service.js');
    return await resolveShippingAmountForOrder({
      agencyId: order.agencyId,
      sellerId: order.sellerId,
      lat: order.lat,
      lng: order.lng,
      shippingType: order.shippingType,
    });
  } catch (err) {
    console.warn('[billing] Fallback a tarifas legacy:', err);
  }

  const zone = await findPricingZoneForPoint(order.agencyId, order.lat, order.lng);
  if (zone?.shippingRates) {
    return resolveRateForOrder(
      { ...zone.shippingRates, currency: 'ARS' },
      order.shippingType
    );
  }

  const fallback = await getAgencyDefaultShippingRates(order.agencyId);
  return resolveRateForOrder(fallback, order.shippingType);
}

export async function listAgencyZoneShippingRates(agencyId: string): Promise<ZoneShippingRates[]> {
  try {
    const zones = await listPricingZonesForAgency(agencyId);
    return zones.map((zone) => {
      const rates = zone.shippingRates ?? DEFAULT_RATES;
      return {
        zoneId: zone.id,
        zoneName: zone.name,
        flex: rates.flex,
        express: rates.express,
        standard: rates.standard,
        currency: 'ARS' as const,
      };
    });
  } catch (err) {
    console.warn('[billing] No se pudieron cargar tarifas por zona:', err);
    return [];
  }
}

function shippingTypeLabel(shippingType: string | null | undefined): string {
  if (shippingType === 'flex') return 'Flex';
  if (shippingType === 'express') return 'Express';
  return 'Estándar';
}

export async function getAgencyDefaultShippingRates(agencyId: string): Promise<AgencyShippingRates> {
  try {
    const [rows] = await pool.query<AgencyRateRow[]>(
      `SELECT shipping_rate_flex, shipping_rate_express, shipping_rate_standard
       FROM agencies WHERE id = ? LIMIT 1`,
      [agencyId]
    );
    const row = rows[0];
    if (!row) return { ...DEFAULT_RATES };
    return {
      flex: toMoney(row.shipping_rate_flex ?? DEFAULT_RATES.flex),
      express: toMoney(row.shipping_rate_express ?? DEFAULT_RATES.express),
      standard: toMoney(row.shipping_rate_standard ?? DEFAULT_RATES.standard),
      currency: 'ARS',
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'ER_BAD_FIELD_ERROR' || code === 'ER_NO_SUCH_TABLE') {
      return { ...DEFAULT_RATES };
    }
    throw err;
  }
}

export async function updateAgencyDefaultShippingRates(
  user: User,
  rates: Partial<AgencyShippingRates>
): Promise<AgencyShippingRates> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) {
    throw new Error('FORBIDDEN');
  }
  const current = await getAgencyDefaultShippingRates(user.agencyId);
  const next = {
    flex: rates.flex ?? current.flex,
    express: rates.express ?? current.express,
    standard: rates.standard ?? current.standard,
  };
  await pool.query(
    `UPDATE agencies
     SET shipping_rate_flex = ?, shipping_rate_express = ?, shipping_rate_standard = ?
     WHERE id = ?`,
    [next.flex, next.express, next.standard, user.agencyId]
  );
  return { ...next, currency: 'ARS' };
}

export interface RepriceChargesResult {
  scanned: number;
  changed: number;
  unchanged: number;
  skipped: number;
  deltaTotal: number;
}

/** Recalcula cargos ya facturados de la agencia con las tarifas actuales de listas/zonas. */
export async function repriceAgencyChargesToCurrentRates(
  user: User,
  options?: { sellerId?: string | null; dryRun?: boolean }
): Promise<RepriceChargesResult> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) throw new Error('FORBIDDEN');

  const dryRun = options?.dryRun === true;
  const params: string[] = [user.agencyId];
  let sellerFilter = '';
  if (options?.sellerId) {
    sellerFilter = ' AND b.seller_id = ?';
    params.push(options.sellerId);
  }

  const [charges] = await pool.query<
    Array<{ id: string; order_id: string; amount: string | number } & RowDataPacket>
  >(
    `SELECT b.id, b.order_id, b.amount
     FROM billing_ledger_entries b
     WHERE b.agency_id = ?
       AND b.entry_type = 'charge'
       AND b.order_id IS NOT NULL${sellerFilter}`,
    params
  );

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let deltaTotal = 0;

  for (const charge of charges) {
    const order = await getOrderById(charge.order_id);
    if (!order?.agencyId || order.agencyId !== user.agencyId) {
      skipped += 1;
      continue;
    }
    if (order.lat == null || order.lng == null) {
      skipped += 1;
      continue;
    }

    const newAmount = await resolveOrderShippingRate(order);
    const oldAmount = Number(charge.amount);
    if (Math.abs(oldAmount - newAmount) < 0.01) {
      unchanged += 1;
      continue;
    }

    deltaTotal += newAmount - oldAmount;
    changed += 1;

    if (!dryRun) {
      await pool.query(
        `UPDATE billing_ledger_entries SET amount = ? WHERE id = ? AND entry_type = 'charge'`,
        [newAmount, charge.id]
      );
      await pool.query(`UPDATE orders SET shipping_cost = ? WHERE id = ?`, [
        newAmount,
        charge.order_id,
      ]);
    }
  }

  return {
    scanned: charges.length,
    changed,
    unchanged,
    skipped,
    deltaTotal: Math.round(deltaTotal * 100) / 100,
  };
}

export async function chargeOrderOnDelivery(order: Order): Promise<boolean> {
  if (order.status !== OrderStatus.DELIVERED) return false;
  if (!order.sellerId || !order.agencyId) return false;

  const [existing] = await pool.query<Array<{ billed_at: Date | null } & RowDataPacket>>(
    'SELECT billed_at FROM orders WHERE id = ? LIMIT 1',
    [order.id]
  );
  if (existing[0]?.billed_at) return false;

  const amount = await resolveOrderShippingRate(order);
  const now = new Date();
  const entryId = randomUUID();
  const label = shippingTypeLabel(order.shippingType);
  const description = `Envío ${order.id} · ${label} · ${order.clientName}`;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO billing_ledger_entries
        (id, agency_id, seller_id, order_id, entry_type, amount, description, created_by, created_at)
       VALUES (?, ?, ?, ?, 'charge', ?, ?, 'Sistema', ?)`,
      [entryId, order.agencyId, order.sellerId, order.id, amount, description, now]
    );
    await conn.query(
      'UPDATE orders SET shipping_cost = ?, billed_at = ? WHERE id = ? AND billed_at IS NULL',
      [amount, now, order.id]
    );
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function backfillDeliveredCharges(limit = 40): Promise<void> {
  try {
    const [rows] = await pool.query<
      Array<{ id: string } & RowDataPacket>
    >(
      `SELECT id FROM orders
       WHERE status = 'delivered' AND billed_at IS NULL AND seller_id IS NOT NULL AND agency_id IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT ?`,
      [limit]
    );
    for (const row of rows) {
      try {
        const order = await getOrderById(row.id);
        if (order) await chargeOrderOnDelivery(order);
      } catch (err) {
        console.warn(`[billing] No se pudo facturar pedido ${row.id}:`, err);
      }
    }
  } catch (err) {
    console.warn('[billing] Backfill de cargos omitido:', err);
  }
}

function resolveSellerScope(
  user: User,
  sellerId?: string | null
): { agencyId: string; sellerId: string | null } {
  if (user.role === UserRole.STORE_ADMIN) {
    if (!user.agencyId) throw new Error('NO_AGENCY');
    return { agencyId: user.agencyId, sellerId: user.id };
  }
  if (!isAgencyAdmin(user.role) || !user.agencyId) throw new Error('FORBIDDEN');
  return { agencyId: user.agencyId, sellerId: sellerId ?? null };
}

async function getSellerName(sellerId: string | null): Promise<string | null> {
  if (!sellerId) return null;
  const [rows] = await pool.query<Array<{ name: string } & RowDataPacket>>(
    'SELECT name FROM users WHERE id = ? LIMIT 1',
    [sellerId]
  );
  return rows[0]?.name ?? null;
}

export async function getBillingSummary(
  user: User,
  options: { dateFrom: string; dateTo: string; sellerId?: string | null }
): Promise<BillingSummary> {
  await backfillDeliveredCharges();
  const scope = resolveSellerScope(user, options.sellerId);
  const zoneRates = await listAgencyZoneShippingRates(scope.agencyId);
  const defaultRates = await getAgencyDefaultShippingRates(scope.agencyId);
  const sellerName = await getSellerName(scope.sellerId);

  const params: Array<string> = [scope.agencyId, `${options.dateFrom} 00:00:00`, `${options.dateTo} 23:59:59.999`];
  let sellerFilter = '';
  let sellerFilterB = '';
  if (scope.sellerId) {
    sellerFilter = ' AND seller_id = ?';
    sellerFilterB = ' AND b.seller_id = ?';
    params.push(scope.sellerId);
  }

  const [spentRows] = await pool.query<
    Array<{ total: string | null; count: string | null } & RowDataPacket>
  >(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
     FROM billing_ledger_entries
     WHERE agency_id = ? AND entry_type = 'charge'
       AND created_at >= ? AND created_at <= ?${sellerFilter}`,
    params
  );

  const [paidRows] = await pool.query<Array<{ total: string | null } & RowDataPacket>>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM billing_ledger_entries
     WHERE agency_id = ? AND entry_type = 'payment'
       AND created_at >= ? AND created_at <= ?${sellerFilter}`,
    params
  );

  const balanceParams: Array<string> = [scope.agencyId];
  let balanceSellerFilter = '';
  if (scope.sellerId) {
    balanceSellerFilter = ' AND seller_id = ?';
    balanceParams.push(scope.sellerId);
  }
  const [balanceRows] = await pool.query<Array<{ balance: string | null } & RowDataPacket>>(
    `SELECT COALESCE(SUM(CASE entry_type
       WHEN 'charge' THEN amount
       WHEN 'payment' THEN -amount
       WHEN 'adjustment' THEN amount
       ELSE 0 END), 0) AS balance
     FROM billing_ledger_entries
     WHERE agency_id = ?${balanceSellerFilter}`,
    balanceParams
  );

  const [byTypeRows] = await pool.query<
    Array<{ shipping_type: string | null; count: string; amount: string } & RowDataPacket>
  >(
    `SELECT COALESCE(o.shipping_type, 'standard') AS shipping_type,
            COUNT(*) AS count,
            COALESCE(SUM(b.amount), 0) AS amount
     FROM billing_ledger_entries b
     INNER JOIN orders o ON o.id = b.order_id
     WHERE b.agency_id = ? AND b.entry_type = 'charge'
       AND b.created_at >= ? AND b.created_at <= ?${sellerFilterB}
     GROUP BY COALESCE(o.shipping_type, 'standard')
     ORDER BY amount DESC`,
    params
  );

  let sellers: BillingSummary['sellers'];
  if (!scope.sellerId && isAgencyAdmin(user.role)) {
    const [sellerRows] = await pool.query<
      Array<{ seller_id: string; seller_name: string; total_spent: string; balance: string; shipments: string } & RowDataPacket>
    >(
      `SELECT b.seller_id,
              u.name AS seller_name,
              COALESCE(SUM(CASE WHEN b.entry_type = 'charge' AND b.created_at >= ? AND b.created_at <= ? THEN b.amount ELSE 0 END), 0) AS total_spent,
              COALESCE(SUM(CASE b.entry_type WHEN 'charge' THEN b.amount WHEN 'payment' THEN -b.amount WHEN 'adjustment' THEN b.amount ELSE 0 END), 0) AS balance,
              COALESCE(SUM(CASE WHEN b.entry_type = 'charge' AND b.created_at >= ? AND b.created_at <= ? THEN 1 ELSE 0 END), 0) AS shipments
       FROM billing_ledger_entries b
       INNER JOIN users u ON u.id = b.seller_id
       WHERE b.agency_id = ?
       GROUP BY b.seller_id, u.name
       HAVING total_spent > 0 OR balance > 0
       ORDER BY total_spent DESC, balance DESC`,
      [`${options.dateFrom} 00:00:00`, `${options.dateTo} 23:59:59.999`, `${options.dateFrom} 00:00:00`, `${options.dateTo} 23:59:59.999`, scope.agencyId]
    );
    sellers = sellerRows.map((row) => ({
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      totalSpent: toMoney(row.total_spent),
      balance: toMoney(row.balance),
      chargedShipments: Number(row.shipments),
    }));
  }

  return {
    currency: 'ARS',
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    sellerId: scope.sellerId,
    sellerName,
    totalSpent: toMoney(spentRows[0]?.total),
    totalPaid: toMoney(paidRows[0]?.total),
    balance: toMoney(balanceRows[0]?.balance),
    chargedShipments: Number(spentRows[0]?.count ?? 0),
    zoneRates,
    defaultRates,
    byShippingType: byTypeRows.map((row) => ({
      shippingType: row.shipping_type ?? 'standard',
      count: Number(row.count),
      amount: toMoney(row.amount),
    })),
    sellers,
  };
}

export async function listBillingLedger(
  user: User,
  options: { dateFrom: string; dateTo: string; sellerId?: string | null; limit?: number; offset?: number }
): Promise<BillingLedgerEntry[]> {
  const scope = resolveSellerScope(user, options.sellerId);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 5000);
  const offset = Math.max(options.offset ?? 0, 0);

  const params: Array<string | number> = [
    scope.agencyId,
    `${options.dateFrom} 00:00:00`,
    `${options.dateTo} 23:59:59.999`,
  ];
  let sellerFilter = '';
  if (scope.sellerId) {
    sellerFilter = ' AND b.seller_id = ?';
    params.push(scope.sellerId);
  }
  params.push(limit, offset);

  const [rows] = await pool.query<
    Array<{
      id: string;
      agency_id: string;
      seller_id: string;
      seller_name: string | null;
      order_id: string | null;
      order_address: string | null;
      order_lat: number | null;
      order_lng: number | null;
      entry_type: 'charge' | 'payment' | 'adjustment';
      amount: string;
      description: string;
      created_by: string | null;
      created_at: Date;
    } & RowDataPacket>
  >(
    `SELECT b.id, b.agency_id, b.seller_id, u.name AS seller_name, b.order_id,
            o.address AS order_address, o.lat AS order_lat, o.lng AS order_lng,
            b.entry_type, b.amount, b.description, b.created_by, b.created_at
     FROM billing_ledger_entries b
     LEFT JOIN users u ON u.id = b.seller_id
     LEFT JOIN orders o ON o.id = b.order_id
     WHERE b.agency_id = ?
       AND b.created_at >= ? AND b.created_at <= ?${sellerFilter}
     ORDER BY b.created_at DESC
     LIMIT ? OFFSET ?`,
    params
  );

  const ZONE_NAMES: Record<string, string> = {
    zona_caba: 'CABA',
    zona_cordon_1: '1° Cordón',
    zona_cordon_2: '2° Cordón',
    zona_cordon_3: '3° Cordón',
  };

  const result: BillingLedgerEntry[] = [];
  for (const row of rows) {
    let pricingZoneId: string | null = null;
    let pricingZoneName: string | null = null;
    if (
      row.entry_type === 'charge' &&
      row.order_id &&
      row.order_lat != null &&
      row.order_lng != null &&
      Number.isFinite(Number(row.order_lat)) &&
      Number.isFinite(Number(row.order_lng))
    ) {
      try {
        const zone = await findPricingZoneForPoint(
          row.agency_id,
          Number(row.order_lat),
          Number(row.order_lng)
        );
        if (zone) {
          const canonical =
            Object.keys(ZONE_NAMES).find(
              (id) => zone.id === id || zone.id.endsWith(`_${id}`)
            ) ?? zone.id;
          pricingZoneId = canonical;
          pricingZoneName = ZONE_NAMES[canonical] ?? zone.name;
        } else {
          // Sin cobertura AMBA: se cobra como 3° cordón (no existe tarifa “fuera de zona”).
          pricingZoneId = 'zona_cordon_3';
          pricingZoneName = '3° Cordón';
        }
      } catch {
        pricingZoneId = null;
        pricingZoneName = null;
      }
    }

    result.push({
      id: row.id,
      agencyId: row.agency_id,
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      orderId: row.order_id,
      orderAddress: row.order_address?.trim() || null,
      pricingZoneId,
      pricingZoneName,
      entryType: row.entry_type,
      amount: toMoney(row.amount),
      description: row.description,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at).toISOString(),
    });
  }
  return result;
}

export async function recordBillingPayment(
  user: User,
  options: { sellerId: string; amount: number; description?: string }
): Promise<BillingLedgerEntry> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) throw new Error('FORBIDDEN');
  if (!options.sellerId || options.amount <= 0) throw new Error('INVALID_PAYMENT');

  const [sellerRows] = await pool.query<Array<{ agency_id: string } & RowDataPacket>>(
    'SELECT agency_id FROM users WHERE id = ? AND role = ? LIMIT 1',
    [options.sellerId, UserRole.STORE_ADMIN]
  );
  const seller = sellerRows[0];
  if (!seller || seller.agency_id !== user.agencyId) throw new Error('SELLER_NOT_FOUND');

  const description = options.description?.trim() || 'Pago registrado por la agencia';
  const entryId = await applyAutomatedBillingPayment({
    agencyId: user.agencyId,
    sellerId: options.sellerId,
    amount: options.amount,
    description,
    createdBy: user.name,
  });

  const entries = await listBillingLedger(user, {
    dateFrom: '1970-01-01',
    dateTo: '2099-12-31',
    sellerId: options.sellerId,
    limit: 1,
  });
  return entries.find((e) => e.id === entryId) ?? entries[0]!;
}

export async function applyAutomatedBillingPayment(options: {
  agencyId: string;
  sellerId: string;
  amount: number;
  description: string;
  createdBy: string;
}): Promise<string> {
  if (!options.sellerId || options.amount <= 0) throw new Error('INVALID_PAYMENT');

  const now = new Date();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO billing_ledger_entries
      (id, agency_id, seller_id, order_id, entry_type, amount, description, created_by, created_at)
     VALUES (?, ?, ?, NULL, 'payment', ?, ?, ?, ?)`,
    [id, options.agencyId, options.sellerId, options.amount, options.description, options.createdBy, now]
  );
  return id;
}
