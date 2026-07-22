import { randomUUID } from 'crypto';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { Order, OrderStatus, User, UserRole } from '../types/index.js';
import { isAgencyAdmin } from '../utils/roles.js';
import { getOrderById } from './orders.service.js';
import { findPricingZoneForPoint, listPricingZonesForAgency } from './delivery-zones.service.js';

export interface AgencyDriverPayRates {
  flex: number;
  express: number;
  standard: number;
  currency: 'ARS';
}

export interface ZoneDriverPayRates {
  zoneId: string;
  zoneName: string;
  flex: number;
  express: number;
  standard: number;
  currency: 'ARS';
}

export interface DriverLedgerEntry {
  id: string;
  agencyId: string;
  repartidorId: string;
  repartidorName: string | null;
  orderId: string | null;
  entryType: 'earning' | 'payment' | 'adjustment';
  amount: number;
  description: string;
  createdBy: string | null;
  createdAt: string;
}

export interface DriverSettlementSummary {
  currency: 'ARS';
  dateFrom: string;
  dateTo: string;
  repartidorId: string | null;
  repartidorName: string | null;
  totalEarned: number;
  totalPaid: number;
  balance: number;
  deliveredShipments: number;
  zoneRates: ZoneDriverPayRates[];
  defaultRates: AgencyDriverPayRates;
  byShippingType: Array<{ shippingType: string; count: number; amount: number }>;
  repartidores?: Array<{
    repartidorId: string;
    repartidorName: string;
    totalEarned: number;
    balance: number;
    deliveredShipments: number;
  }>;
}

const DEFAULT_DRIVER_PAY: AgencyDriverPayRates = {
  flex: 1500,
  express: 1800,
  standard: 1200,
  currency: 'ARS',
};

interface AgencyDriverPayRow extends RowDataPacket {
  driver_pay_flex: string | null;
  driver_pay_express: string | null;
  driver_pay_standard: string | null;
}

function toMoney(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function resolveRateForOrder(rates: AgencyDriverPayRates, shippingType: string | null | undefined): number {
  if (shippingType === 'flex') return rates.flex;
  if (shippingType === 'express') return rates.express;
  return rates.standard;
}

function shippingTypeLabel(shippingType: string | null | undefined): string {
  if (shippingType === 'flex') return 'Flex';
  if (shippingType === 'express') return 'Express';
  return 'Estándar';
}

export async function getAgencyDefaultDriverPayRates(agencyId: string): Promise<AgencyDriverPayRates> {
  try {
    const [rows] = await pool.query<AgencyDriverPayRow[]>(
      `SELECT driver_pay_flex, driver_pay_express, driver_pay_standard
       FROM agencies WHERE id = ? LIMIT 1`,
      [agencyId]
    );
    const row = rows[0];
    if (!row) return { ...DEFAULT_DRIVER_PAY };
    return {
      flex: toMoney(row.driver_pay_flex ?? DEFAULT_DRIVER_PAY.flex),
      express: toMoney(row.driver_pay_express ?? DEFAULT_DRIVER_PAY.express),
      standard: toMoney(row.driver_pay_standard ?? DEFAULT_DRIVER_PAY.standard),
      currency: 'ARS',
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'ER_BAD_FIELD_ERROR' || code === 'ER_NO_SUCH_TABLE') {
      return { ...DEFAULT_DRIVER_PAY };
    }
    throw err;
  }
}

export async function updateAgencyDefaultDriverPayRates(
  user: User,
  rates: Partial<AgencyDriverPayRates>
): Promise<AgencyDriverPayRates> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) {
    throw new Error('FORBIDDEN');
  }
  const current = await getAgencyDefaultDriverPayRates(user.agencyId);
  const next = {
    flex: rates.flex ?? current.flex,
    express: rates.express ?? current.express,
    standard: rates.standard ?? current.standard,
  };
  if (next.flex < 0 || next.express < 0 || next.standard < 0) {
    throw new Error('INVALID_RATES');
  }
  await pool.query(
    `UPDATE agencies
     SET driver_pay_flex = ?, driver_pay_express = ?, driver_pay_standard = ?
     WHERE id = ?`,
    [next.flex, next.express, next.standard, user.agencyId]
  );
  return { ...next, currency: 'ARS' };
}

export async function listAgencyZoneDriverPayRates(agencyId: string): Promise<ZoneDriverPayRates[]> {
  try {
    const zones = await listPricingZonesForAgency(agencyId);
    return zones.map((zone) => {
      const rates = zone.driverPayRates ?? DEFAULT_DRIVER_PAY;
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
    console.warn('[driver-settlement] No se pudieron cargar pagos por zona:', err);
    return [];
  }
}

async function resolveOrderDriverPay(order: Order): Promise<number> {
  if (!order.agencyId) return DEFAULT_DRIVER_PAY.standard;

  try {
    const { resolveDriverPayAmountForOrder } = await import('./price-lists.service.js');
    return await resolveDriverPayAmountForOrder({
      agencyId: order.agencyId,
      sellerId: order.sellerId,
      lat: order.lat,
      lng: order.lng,
      shippingType: order.shippingType,
    });
  } catch (err) {
    console.warn('[driver-settlement] Fallback a tarifas legacy:', err);
  }

  const zone = await findPricingZoneForPoint(order.agencyId, order.lat, order.lng);
  if (zone?.driverPayRates) {
    return resolveRateForOrder(
      { ...zone.driverPayRates, currency: 'ARS' },
      order.shippingType
    );
  }

  const fallback = await getAgencyDefaultDriverPayRates(order.agencyId);
  return resolveRateForOrder(fallback, order.shippingType);
}

/** Acumula el pago al repartidor cuando un pedido se entrega. */
export async function accrueDriverPayOnDelivery(order: Order): Promise<boolean> {
  if (order.status !== OrderStatus.DELIVERED) return false;
  if (!order.agencyId || !order.repartidorId) return false;

  const [existing] = await pool.query<Array<{ driver_billed_at: Date | null } & RowDataPacket>>(
    'SELECT driver_billed_at FROM orders WHERE id = ? LIMIT 1',
    [order.id]
  );
  if (existing[0]?.driver_billed_at) return false;

  const amount = await resolveOrderDriverPay(order);
  const now = new Date();
  const entryId = randomUUID();
  const label = shippingTypeLabel(order.shippingType);
  const description = `Entrega ${order.id} · ${label} · ${order.clientName}`;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO driver_ledger_entries
        (id, agency_id, repartidor_id, order_id, entry_type, amount, description, created_by, created_at)
       VALUES (?, ?, ?, ?, 'earning', ?, ?, 'Sistema', ?)`,
      [entryId, order.agencyId, order.repartidorId, order.id, amount, description, now]
    );
    await conn.query(
      'UPDATE orders SET driver_pay_amount = ?, driver_billed_at = ? WHERE id = ? AND driver_billed_at IS NULL',
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

async function backfillDeliveredDriverPay(limit = 40): Promise<void> {
  try {
    const [rows] = await pool.query<Array<{ id: string } & RowDataPacket>>(
      `SELECT id FROM orders
       WHERE status = 'delivered'
         AND driver_billed_at IS NULL
         AND repartidor_id IS NOT NULL
         AND agency_id IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT ?`,
      [limit]
    );
    for (const row of rows) {
      try {
        const order = await getOrderById(row.id);
        if (order) await accrueDriverPayOnDelivery(order);
      } catch (err) {
        console.warn(`[driver-settlement] No se pudo liquidar pedido ${row.id}:`, err);
      }
    }
  } catch (err) {
    console.warn('[driver-settlement] Backfill de pagos omitido:', err);
  }
}

function resolveDriverScope(
  user: User,
  repartidorId?: string | null
): { agencyId: string; repartidorId: string | null } {
  if (user.role === UserRole.REPARTIDOR) {
    if (!user.agencyId) throw new Error('NO_AGENCY');
    return { agencyId: user.agencyId, repartidorId: user.id };
  }
  if (!isAgencyAdmin(user.role) || !user.agencyId) throw new Error('FORBIDDEN');
  return { agencyId: user.agencyId, repartidorId: repartidorId ?? null };
}

async function getRepartidorName(repartidorId: string | null): Promise<string | null> {
  if (!repartidorId) return null;
  const [rows] = await pool.query<Array<{ name: string } & RowDataPacket>>(
    'SELECT name FROM users WHERE id = ? LIMIT 1',
    [repartidorId]
  );
  return rows[0]?.name ?? null;
}

export async function getDriverSettlementSummary(
  user: User,
  options: { dateFrom: string; dateTo: string; repartidorId?: string | null }
): Promise<DriverSettlementSummary> {
  await backfillDeliveredDriverPay();
  const scope = resolveDriverScope(user, options.repartidorId);
  const zoneRates = await listAgencyZoneDriverPayRates(scope.agencyId);
  const defaultRates = await getAgencyDefaultDriverPayRates(scope.agencyId);
  const repartidorName = await getRepartidorName(scope.repartidorId);

  const params: Array<string> = [
    scope.agencyId,
    `${options.dateFrom} 00:00:00`,
    `${options.dateTo} 23:59:59.999`,
  ];
  let driverFilter = '';
  let driverFilterB = '';
  if (scope.repartidorId) {
    driverFilter = ' AND repartidor_id = ?';
    driverFilterB = ' AND d.repartidor_id = ?';
    params.push(scope.repartidorId);
  }

  const [earnedRows] = await pool.query<
    Array<{ total: string | null; count: string | null } & RowDataPacket>
  >(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
     FROM driver_ledger_entries
     WHERE agency_id = ? AND entry_type = 'earning'
       AND created_at >= ? AND created_at <= ?${driverFilter}`,
    params
  );

  const [paidRows] = await pool.query<Array<{ total: string | null } & RowDataPacket>>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM driver_ledger_entries
     WHERE agency_id = ? AND entry_type = 'payment'
       AND created_at >= ? AND created_at <= ?${driverFilter}`,
    params
  );

  const balanceParams: Array<string> = [scope.agencyId];
  let balanceDriverFilter = '';
  if (scope.repartidorId) {
    balanceDriverFilter = ' AND repartidor_id = ?';
    balanceParams.push(scope.repartidorId);
  }
  const [balanceRows] = await pool.query<Array<{ balance: string | null } & RowDataPacket>>(
    `SELECT COALESCE(SUM(CASE entry_type
       WHEN 'earning' THEN amount
       WHEN 'payment' THEN -amount
       WHEN 'adjustment' THEN amount
       ELSE 0 END), 0) AS balance
     FROM driver_ledger_entries
     WHERE agency_id = ?${balanceDriverFilter}`,
    balanceParams
  );

  const [byTypeRows] = await pool.query<
    Array<{ shipping_type: string | null; count: string; amount: string } & RowDataPacket>
  >(
    `SELECT COALESCE(o.shipping_type, 'standard') AS shipping_type,
            COUNT(*) AS count,
            COALESCE(SUM(d.amount), 0) AS amount
     FROM driver_ledger_entries d
     INNER JOIN orders o ON o.id = d.order_id
     WHERE d.agency_id = ? AND d.entry_type = 'earning'
       AND d.created_at >= ? AND d.created_at <= ?${driverFilterB}
     GROUP BY COALESCE(o.shipping_type, 'standard')
     ORDER BY amount DESC`,
    params
  );

  let repartidores: DriverSettlementSummary['repartidores'];
  if (!scope.repartidorId && isAgencyAdmin(user.role)) {
    const [driverRows] = await pool.query<
      Array<{
        repartidor_id: string;
        repartidor_name: string;
        total_earned: string;
        balance: string;
        shipments: string;
      } & RowDataPacket>
    >(
      `SELECT d.repartidor_id,
              u.name AS repartidor_name,
              COALESCE(SUM(CASE WHEN d.entry_type = 'earning' AND d.created_at >= ? AND d.created_at <= ? THEN d.amount ELSE 0 END), 0) AS total_earned,
              COALESCE(SUM(CASE d.entry_type WHEN 'earning' THEN d.amount WHEN 'payment' THEN -d.amount WHEN 'adjustment' THEN d.amount ELSE 0 END), 0) AS balance,
              COALESCE(SUM(CASE WHEN d.entry_type = 'earning' AND d.created_at >= ? AND d.created_at <= ? THEN 1 ELSE 0 END), 0) AS shipments
       FROM driver_ledger_entries d
       INNER JOIN users u ON u.id = d.repartidor_id
       WHERE d.agency_id = ?
       GROUP BY d.repartidor_id, u.name
       HAVING total_earned > 0 OR balance > 0
       ORDER BY total_earned DESC, balance DESC`,
      [
        `${options.dateFrom} 00:00:00`,
        `${options.dateTo} 23:59:59.999`,
        `${options.dateFrom} 00:00:00`,
        `${options.dateTo} 23:59:59.999`,
        scope.agencyId,
      ]
    );
    repartidores = driverRows.map((row) => ({
      repartidorId: row.repartidor_id,
      repartidorName: row.repartidor_name,
      totalEarned: toMoney(row.total_earned),
      balance: toMoney(row.balance),
      deliveredShipments: Number(row.shipments),
    }));
  }

  return {
    currency: 'ARS',
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    repartidorId: scope.repartidorId,
    repartidorName,
    totalEarned: toMoney(earnedRows[0]?.total),
    totalPaid: toMoney(paidRows[0]?.total),
    balance: toMoney(balanceRows[0]?.balance),
    deliveredShipments: Number(earnedRows[0]?.count ?? 0),
    zoneRates,
    defaultRates,
    byShippingType: byTypeRows.map((row) => ({
      shippingType: row.shipping_type ?? 'standard',
      count: Number(row.count),
      amount: toMoney(row.amount),
    })),
    repartidores,
  };
}

export async function listDriverLedger(
  user: User,
  options: {
    dateFrom: string;
    dateTo: string;
    repartidorId?: string | null;
    limit?: number;
    offset?: number;
  }
): Promise<DriverLedgerEntry[]> {
  const scope = resolveDriverScope(user, options.repartidorId);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 5000);
  const offset = Math.max(options.offset ?? 0, 0);

  const params: Array<string | number> = [
    scope.agencyId,
    `${options.dateFrom} 00:00:00`,
    `${options.dateTo} 23:59:59.999`,
  ];
  let driverFilter = '';
  if (scope.repartidorId) {
    driverFilter = ' AND d.repartidor_id = ?';
    params.push(scope.repartidorId);
  }
  params.push(limit, offset);

  const [rows] = await pool.query<
    Array<{
      id: string;
      agency_id: string;
      repartidor_id: string;
      repartidor_name: string | null;
      order_id: string | null;
      entry_type: 'earning' | 'payment' | 'adjustment';
      amount: string;
      description: string;
      created_by: string | null;
      created_at: Date;
    } & RowDataPacket>
  >(
    `SELECT d.id, d.agency_id, d.repartidor_id, u.name AS repartidor_name, d.order_id,
            d.entry_type, d.amount, d.description, d.created_by, d.created_at
     FROM driver_ledger_entries d
     LEFT JOIN users u ON u.id = d.repartidor_id
     WHERE d.agency_id = ?
       AND d.created_at >= ? AND d.created_at <= ?${driverFilter}
     ORDER BY d.created_at DESC
     LIMIT ? OFFSET ?`,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    agencyId: row.agency_id,
    repartidorId: row.repartidor_id,
    repartidorName: row.repartidor_name,
    orderId: row.order_id,
    entryType: row.entry_type,
    amount: toMoney(row.amount),
    description: row.description,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function recordDriverPayment(
  user: User,
  options: { repartidorId: string; amount: number; description?: string }
): Promise<DriverLedgerEntry> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) throw new Error('FORBIDDEN');
  if (!options.repartidorId || options.amount <= 0) throw new Error('INVALID_PAYMENT');

  const [driverRows] = await pool.query<Array<{ agency_id: string } & RowDataPacket>>(
    'SELECT agency_id FROM users WHERE id = ? AND role = ? LIMIT 1',
    [options.repartidorId, UserRole.REPARTIDOR]
  );
  const driver = driverRows[0];
  if (!driver || driver.agency_id !== user.agencyId) throw new Error('DRIVER_NOT_FOUND');

  const description = options.description?.trim() || 'Liquidación registrada por la agencia';
  const now = new Date();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO driver_ledger_entries
      (id, agency_id, repartidor_id, order_id, entry_type, amount, description, created_by, created_at)
     VALUES (?, ?, ?, NULL, 'payment', ?, ?, ?, ?)`,
    [id, user.agencyId, options.repartidorId, options.amount, description, user.name, now]
  );

  const entries = await listDriverLedger(user, {
    dateFrom: '1970-01-01',
    dateTo: '2099-12-31',
    repartidorId: options.repartidorId,
    limit: 1,
  });
  return entries.find((e) => e.id === id) ?? entries[0]!;
}
