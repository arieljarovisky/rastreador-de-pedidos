/**
 * 1) Borra el pago ≈ $200.000 de Ariel Lupo.
 * 2) Iguala todas las zonas de cada lista a la tarifa de CABA (precios iguales).
 * 3) Recalcula cargos de envío (y shipping_cost) con esas tarifas.
 *
 * Uso (en Railway /app, con tsx instalado):
 *   node ./node_modules/tsx/dist/cli.mjs scripts/migrate-equal-prices-and-delete-payment.ts
 *   node ./node_modules/tsx/dist/cli.mjs scripts/migrate-equal-prices-and-delete-payment.ts --apply
 *
 * Flags:
 *   --apply              escribe en DB
 *   --flex=3000          fuerza cobro Flex (default: tarifa CABA de la lista)
 *   --express=3000       fuerza cobro Express
 *   --standard=2500      fuerza cobro Estándar
 *   --seller=ariel       solo cargos de vendedores cuyo nombre/username matchea
 *   --drivers            también recalcula liquidación de repartidores
 */
import 'dotenv/config';
import { RowDataPacket } from 'mysql2';
import { pool } from '../src/config/database.js';
import { getOrderById } from '../src/services/orders.service.js';
import { resolveDriverPayAmountForOrder } from '../src/services/price-lists.service.js';

const APPLY = process.argv.includes('--apply');
const ALSO_DRIVERS = process.argv.includes('--drivers');
const PAYMENT_AMOUNT = 200_000;
const PAYMENT_TOLERANCE = 0.01;

function argValue(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const FORCE_FLEX = argValue('flex') != null ? Number(argValue('flex')) : null;
const FORCE_EXPRESS = argValue('express') != null ? Number(argValue('express')) : null;
const FORCE_STANDARD = argValue('standard') != null ? Number(argValue('standard')) : null;
const SELLER_FILTER = (argValue('seller') || 'ariel').trim().toLowerCase();
const ALL_SELLERS = process.argv.includes('--all-sellers');

function money(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(n);
}

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= PAYMENT_TOLERANCE;
}

function rateForShippingType(
  shippingType: string | null | undefined,
  rates: { flex: number; express: number; standard: number }
): number {
  if (shippingType === 'flex') return rates.flex;
  if (shippingType === 'express') return rates.express;
  return rates.standard;
}

async function findTargetUsers() {
  const [rows] = await pool.query<
    Array<{ id: string; username: string; name: string; role: string; agency_id: string | null } & RowDataPacket>
  >(
    `SELECT id, username, name, role, agency_id
     FROM users
     WHERE LOWER(name) LIKE '%ariel%lupo%'
        OR LOWER(name) LIKE '%lupo%ariel%'
        OR (LOWER(name) LIKE '%ariel%' AND LOWER(name) LIKE '%lupo%')
        OR LOWER(username) IN ('lupo', 'ariel', 'ariellupo')
        OR LOWER(name) = 'ariel lupo'`
  );
  return rows;
}

async function findPayments(userIds: string[]) {
  if (userIds.length === 0) return { billing: [] as Array<RowDataPacket>, driver: [] as Array<RowDataPacket> };
  const placeholders = userIds.map(() => '?').join(',');

  const [billing] = await pool.query<
    Array<{
      id: string;
      seller_id: string;
      amount: string | number;
      description: string;
      created_at: Date;
      agency_id: string;
    } & RowDataPacket>
  >(
    `SELECT id, seller_id, amount, description, created_at, agency_id
     FROM billing_ledger_entries
     WHERE entry_type = 'payment'
       AND seller_id IN (${placeholders})
       AND ABS(amount - ?) <= ?
     ORDER BY created_at DESC`,
    [...userIds, PAYMENT_AMOUNT, PAYMENT_TOLERANCE]
  );

  let driver: Array<{
    id: string;
    repartidor_id: string;
    amount: string | number;
    description: string;
    created_at: Date;
    agency_id: string;
  } & RowDataPacket> = [];

  try {
    const [driverRows] = await pool.query<typeof driver>(
      `SELECT id, repartidor_id, amount, description, created_at, agency_id
       FROM driver_ledger_entries
       WHERE entry_type = 'payment'
         AND repartidor_id IN (${placeholders})
         AND ABS(amount - ?) <= ?
       ORDER BY created_at DESC`,
      [...userIds, PAYMENT_AMOUNT, PAYMENT_TOLERANCE]
    );
    driver = driverRows;
  } catch {
    /* ignore */
  }

  return { billing, driver };
}

async function deleteBillingPayment(entryId: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE billing_payment_intents
       SET ledger_entry_id = NULL, status = 'cancelled', updated_at = NOW(3)
       WHERE ledger_entry_id = ?`,
      [entryId]
    );
  } catch {
    /* ignore */
  }
  await pool.query(`DELETE FROM billing_ledger_entries WHERE id = ? AND entry_type = 'payment'`, [
    entryId,
  ]);
}

async function equalizePriceLists(): Promise<
  Map<string, { flex: number; express: number; standard: number }>
> {
  const ratesByAgency = new Map<string, { flex: number; express: number; standard: number }>();

  const [lists] = await pool.query<
    Array<{ id: string; agency_id: string; name: string; is_default: number } & RowDataPacket>
  >(`SELECT id, agency_id, name, is_default FROM price_lists ORDER BY agency_id, is_default DESC`);

  console.log('\nIgualando zonas a CABA en cada lista:');
  for (const list of lists) {
    const [cabaRows] = await pool.query<
      Array<{
        shipping_rate_flex: string | number;
        shipping_rate_express: string | number;
        shipping_rate_standard: string | number;
        driver_pay_flex: string | number;
        driver_pay_express: string | number;
        driver_pay_standard: string | number;
      } & RowDataPacket>
    >(
      `SELECT shipping_rate_flex, shipping_rate_express, shipping_rate_standard,
              driver_pay_flex, driver_pay_express, driver_pay_standard
       FROM price_list_zone_rates
       WHERE price_list_id = ? AND zone_key = 'zona_caba'
       LIMIT 1`,
      [list.id]
    );
    const caba = cabaRows[0];
    if (!caba) {
      console.log(`  [${list.agency_id}] ${list.name}: sin zona_caba, omitida`);
      continue;
    }

    const shipping = {
      flex: FORCE_FLEX ?? Number(caba.shipping_rate_flex),
      express: FORCE_EXPRESS ?? Number(caba.shipping_rate_express),
      standard: FORCE_STANDARD ?? Number(caba.shipping_rate_standard),
    };
    const driver = {
      flex: Number(caba.driver_pay_flex),
      express: Number(caba.driver_pay_express),
      standard: Number(caba.driver_pay_standard),
    };

    ratesByAgency.set(list.agency_id, shipping);
    console.log(
      `  [${list.agency_id}] ${list.name}: F/E/S = ${shipping.flex}/${shipping.express}/${shipping.standard}`
    );

    if (APPLY) {
      await pool.query(
        `UPDATE price_list_zone_rates SET
           shipping_rate_flex = ?, shipping_rate_express = ?, shipping_rate_standard = ?,
           driver_pay_flex = ?, driver_pay_express = ?, driver_pay_standard = ?
         WHERE price_list_id = ?`,
        [
          shipping.flex,
          shipping.express,
          shipping.standard,
          driver.flex,
          driver.express,
          driver.standard,
          list.id,
        ]
      );
      await pool.query(
        `UPDATE price_lists SET
           shipping_rate_flex = ?, shipping_rate_express = ?, shipping_rate_standard = ?,
           driver_pay_flex = ?, driver_pay_express = ?, driver_pay_standard = ?
         WHERE id = ?`,
        [
          shipping.flex,
          shipping.express,
          shipping.standard,
          driver.flex,
          driver.express,
          driver.standard,
          list.id,
        ]
      );
      if (list.is_default) {
        await pool.query(
          `UPDATE agencies SET
             shipping_rate_flex = ?, shipping_rate_express = ?, shipping_rate_standard = ?,
             driver_pay_flex = ?, driver_pay_express = ?, driver_pay_standard = ?
           WHERE id = ?`,
          [
            shipping.flex,
            shipping.express,
            shipping.standard,
            driver.flex,
            driver.express,
            driver.standard,
            list.agency_id,
          ]
        );
        await pool.query(
          `UPDATE delivery_zones SET
             shipping_rate_flex = ?, shipping_rate_express = ?, shipping_rate_standard = ?,
             driver_pay_flex = ?, driver_pay_express = ?, driver_pay_standard = ?
           WHERE agency_id = ?`,
          [
            shipping.flex,
            shipping.express,
            shipping.standard,
            driver.flex,
            driver.express,
            driver.standard,
            list.agency_id,
          ]
        );
      }
    }
  }

  return ratesByAgency;
}

async function resolveSellerIdsForFilter(): Promise<string[] | null> {
  if (ALL_SELLERS) return null;
  if (!SELLER_FILTER) return null;
  const like = `%${SELLER_FILTER}%`;
  const [rows] = await pool.query<Array<{ id: string; name: string; username: string } & RowDataPacket>>(
    `SELECT id, name, username FROM users
     WHERE role = 'store_admin'
       AND (LOWER(name) LIKE ? OR LOWER(username) LIKE ?)`,
    [like, like]
  );
  console.log(`\nFiltro vendedor "${SELLER_FILTER}":`);
  for (const r of rows) console.log(`  ${r.id} @${r.username} "${r.name}"`);
  if (!rows.length) {
    console.log('  (ninguno — no se tocarán cargos; usá --all-sellers para todos)');
  }
  return rows.map((r) => r.id);
}

async function repriceSellerCharges(
  ratesByAgency: Map<string, { flex: number; express: number; standard: number }>,
  sellerIds: string[] | null
): Promise<{
  scanned: number;
  changed: number;
  unchanged: number;
  skipped: number;
  deltaTotal: number;
}> {
  let sql = `SELECT id, order_id, amount, agency_id, seller_id
             FROM billing_ledger_entries
             WHERE entry_type = 'charge' AND order_id IS NOT NULL`;
  const params: string[] = [];
  if (sellerIds) {
    if (sellerIds.length === 0) {
      return { scanned: 0, changed: 0, unchanged: 0, skipped: 0, deltaTotal: 0 };
    }
    sql += ` AND seller_id IN (${sellerIds.map(() => '?').join(',')})`;
    params.push(...sellerIds);
  }

  const [charges] = await pool.query<
    Array<{
      id: string;
      order_id: string | null;
      amount: string | number;
      agency_id: string;
      seller_id: string;
    } & RowDataPacket>
  >(sql, params);

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let deltaTotal = 0;
  const samples: string[] = [];
  const defaultRates = { flex: FORCE_FLEX ?? 3000, express: FORCE_EXPRESS ?? 3000, standard: FORCE_STANDARD ?? 2500 };

  for (const charge of charges) {
    if (!charge.order_id) {
      skipped += 1;
      continue;
    }
    const order = await getOrderById(charge.order_id);
    if (!order) {
      skipped += 1;
      continue;
    }

    const rates = ratesByAgency.get(charge.agency_id) ?? defaultRates;
    const newAmount = rateForShippingType(order.shippingType, rates);
    const oldAmount = Number(charge.amount);
    if (almostEqual(oldAmount, newAmount)) {
      unchanged += 1;
      continue;
    }

    deltaTotal += newAmount - oldAmount;
    changed += 1;
    if (samples.length < 20) {
      samples.push(
        `${charge.order_id} (${order.shippingType ?? 'standard'}): ${money(oldAmount)} → ${money(newAmount)}`
      );
    }

    if (APPLY) {
      await pool.query(`UPDATE billing_ledger_entries SET amount = ? WHERE id = ? AND entry_type = 'charge'`, [
        newAmount,
        charge.id,
      ]);
      await pool.query(`UPDATE orders SET shipping_cost = ? WHERE id = ?`, [newAmount, charge.order_id]);
    }
  }

  if (samples.length) {
    console.log('\nEjemplos de cargos a actualizar:');
    for (const s of samples) console.log('  ·', s);
  }

  return { scanned: charges.length, changed, unchanged, skipped, deltaTotal };
}

async function repriceDriverEarnings(): Promise<{
  scanned: number;
  changed: number;
  unchanged: number;
  skipped: number;
  deltaTotal: number;
}> {
  const [earnings] = await pool.query<
    Array<{ id: string; order_id: string | null; amount: string | number } & RowDataPacket>
  >(
    `SELECT id, order_id, amount
     FROM driver_ledger_entries
     WHERE entry_type = 'earning' AND order_id IS NOT NULL`
  );

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let deltaTotal = 0;

  for (const earning of earnings) {
    if (!earning.order_id) {
      skipped += 1;
      continue;
    }
    const order = await getOrderById(earning.order_id);
    if (!order?.agencyId || order.lat == null || order.lng == null) {
      skipped += 1;
      continue;
    }

    const newAmount = await resolveDriverPayAmountForOrder({
      agencyId: order.agencyId,
      sellerId: order.sellerId,
      lat: order.lat,
      lng: order.lng,
      shippingType: order.shippingType,
    });
    const oldAmount = Number(earning.amount);
    if (almostEqual(oldAmount, newAmount)) {
      unchanged += 1;
      continue;
    }

    deltaTotal += newAmount - oldAmount;
    changed += 1;

    if (APPLY) {
      await pool.query(
        `UPDATE driver_ledger_entries SET amount = ? WHERE id = ? AND entry_type = 'earning'`,
        [newAmount, earning.id]
      );
      await pool.query(`UPDATE orders SET driver_pay_amount = ? WHERE id = ?`, [
        newAmount,
        earning.order_id,
      ]);
    }
  }

  return { scanned: earnings.length, changed, unchanged, skipped, deltaTotal };
}

async function main(): Promise<void> {
  console.log(`Modo: ${APPLY ? 'APPLY (escribe en DB)' : 'DRY-RUN (solo muestra)'}`);
  console.log(
    `DB: ${process.env.DB_HOST || process.env.MYSQLHOST || 'localhost'} / ${process.env.DB_NAME || process.env.MYSQLDATABASE || '?'}`
  );
  console.log(
    `Filtro: ${ALL_SELLERS ? 'TODOS los vendedores' : `seller~${SELLER_FILTER}`} · force flex=${FORCE_FLEX ?? 'CABA'}`
  );

  const users = await findTargetUsers();
  console.log('\nUsuarios Ariel/Lupo:');
  if (!users.length) console.log('  (ninguno)');
  for (const u of users) {
    console.log(`  ${u.id} @${u.username} "${u.name}" role=${u.role} agency=${u.agency_id}`);
  }

  const { billing, driver } = await findPayments(users.map((u) => u.id));

  if (!billing.length && !driver.length) {
    const [anyBilling] = await pool.query<
      Array<{
        id: string;
        amount: string | number;
        description: string;
        created_at: Date;
        name: string;
        username: string;
      } & RowDataPacket>
    >(
      `SELECT b.id, b.amount, b.description, b.created_at, u.name, u.username
       FROM billing_ledger_entries b
       JOIN users u ON u.id = b.seller_id
       WHERE b.entry_type = 'payment' AND ABS(b.amount - ?) <= ?
       ORDER BY b.created_at DESC
       LIMIT 20`,
      [PAYMENT_AMOUNT, PAYMENT_TOLERANCE]
    );
    console.log('\nPagos ≈ $200.000 (cualquier usuario):');
    for (const p of anyBilling) {
      console.log(
        `  ${p.id} ${money(Number(p.amount))} — ${p.name} (@${p.username}) — ${p.description}`
      );
    }
  }

  console.log('\nPagos de vendedor a eliminar:');
  if (!billing.length) console.log('  (ninguno)');
  for (const p of billing) {
    console.log(
      `  ${p.id} seller=${p.seller_id} ${money(Number(p.amount))} — ${p.description} — ${p.created_at}`
    );
  }

  if (APPLY) {
    for (const p of billing) {
      await deleteBillingPayment(p.id);
      console.log(`Eliminado pago vendedor ${p.id}`);
    }
    for (const p of driver) {
      await pool.query(`DELETE FROM driver_ledger_entries WHERE id = ? AND entry_type = 'payment'`, [
        p.id,
      ]);
      console.log(`Eliminado pago repartidor ${p.id}`);
    }
  }

  const ratesByAgency = await equalizePriceLists();
  const sellerIds = await resolveSellerIdsForFilter();

  console.log('\n--- Recálculo de cargos ---');
  const sellerStats = await repriceSellerCharges(ratesByAgency, sellerIds);
  console.log(
    `Cargos: ${sellerStats.scanned} · a cambiar: ${sellerStats.changed} · igual: ${sellerStats.unchanged} · omitidos: ${sellerStats.skipped}`
  );
  console.log(`Delta total cargos: ${money(sellerStats.deltaTotal)}`);

  if (ALSO_DRIVERS) {
    console.log('\n--- Recálculo earnings repartidores ---');
    const driverStats = await repriceDriverEarnings();
    console.log(
      `Earnings: ${driverStats.scanned} · a cambiar: ${driverStats.changed} · igual: ${driverStats.unchanged}`
    );
    console.log(`Delta total earnings: ${money(driverStats.deltaTotal)}`);
  }

  if (!APPLY) {
    console.log('\nDry-run OK. Para aplicar en Railway:');
    console.log(
      '  node ./node_modules/tsx/dist/cli.mjs scripts/migrate-equal-prices-and-delete-payment.ts --flex=3000 --express=3000 --standard=2500 --apply'
    );
    console.log('  (agregá --all-sellers si querés todos los vendedores, no solo Ariel)');
  } else {
    console.log('\nCambios aplicados.');
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
