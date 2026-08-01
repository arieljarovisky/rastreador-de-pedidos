/**
 * One-shot:
 * 1) Elimina el pago de ~$200.000 de Ariel Lupo (billing y/o liquidación repartidor).
 * 2) Recalcula cargos de envíos ya facturados con las tarifas actuales de price lists.
 *
 * Uso:
 *   npx tsx scripts/migrate-equal-prices-and-delete-payment.ts          # dry-run
 *   npx tsx scripts/migrate-equal-prices-and-delete-payment.ts --apply  # aplica
 *
 * Apuntá DB_* / MYSQL* al MySQL de producción (Railway TCP Proxy) antes de --apply.
 */
import 'dotenv/config';
import { RowDataPacket } from 'mysql2';
import { pool } from '../src/config/database.js';
import { getOrderById } from '../src/services/orders.service.js';
import { resolveShippingAmountForOrder } from '../src/services/price-lists.service.js';
import { resolveDriverPayAmountForOrder } from '../src/services/price-lists.service.js';

const APPLY = process.argv.includes('--apply');
const ALSO_DRIVERS = process.argv.includes('--drivers');
const PAYMENT_AMOUNT = 200_000;
const PAYMENT_TOLERANCE = 0.01;

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
  if (userIds.length === 0) return { billing: [], driver: [] as Array<RowDataPacket> };
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
    // tabla puede no existir en DBs viejas
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
    // intents opcionales
  }
  await pool.query(`DELETE FROM billing_ledger_entries WHERE id = ? AND entry_type = 'payment'`, [
    entryId,
  ]);
}

async function repriceSellerCharges(): Promise<{
  scanned: number;
  changed: number;
  unchanged: number;
  skipped: number;
  deltaTotal: number;
}> {
  const [charges] = await pool.query<
    Array<{
      id: string;
      order_id: string | null;
      amount: string | number;
      agency_id: string;
      seller_id: string;
    } & RowDataPacket>
  >(
    `SELECT id, order_id, amount, agency_id, seller_id
     FROM billing_ledger_entries
     WHERE entry_type = 'charge' AND order_id IS NOT NULL`
  );

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let deltaTotal = 0;
  const samples: string[] = [];

  for (const charge of charges) {
    if (!charge.order_id) {
      skipped += 1;
      continue;
    }
    const order = await getOrderById(charge.order_id);
    if (!order?.agencyId || order.lat == null || order.lng == null) {
      skipped += 1;
      continue;
    }

    const newAmount = await resolveShippingAmountForOrder({
      agencyId: order.agencyId,
      sellerId: order.sellerId,
      lat: order.lat,
      lng: order.lng,
      shippingType: order.shippingType,
    });
    const oldAmount = Number(charge.amount);
    if (almostEqual(oldAmount, newAmount)) {
      unchanged += 1;
      continue;
    }

    deltaTotal += newAmount - oldAmount;
    changed += 1;
    if (samples.length < 15) {
      samples.push(
        `${charge.order_id}: ${money(oldAmount)} → ${money(newAmount)} (${money(newAmount - oldAmount)})`
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
    Array<{
      id: string;
      order_id: string | null;
      amount: string | number;
    } & RowDataPacket>
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

async function showCurrentRates(): Promise<void> {
  const [lists] = await pool.query<
    Array<{
      id: string;
      agency_id: string;
      name: string;
      is_default: number;
      shipping_rate_flex: string | number;
      shipping_rate_express: string | number;
      shipping_rate_standard: string | number;
    } & RowDataPacket>
  >(
    `SELECT id, agency_id, name, is_default,
            shipping_rate_flex, shipping_rate_express, shipping_rate_standard
     FROM price_lists
     ORDER BY agency_id, is_default DESC, name`
  );

  console.log('\nListas de precios actuales:');
  for (const list of lists) {
    console.log(
      `  [${list.agency_id}] ${list.name}${list.is_default ? ' (default)' : ''}: fuera de zona F/E/S = ${list.shipping_rate_flex}/${list.shipping_rate_express}/${list.shipping_rate_standard}`
    );
    const [zones] = await pool.query<
      Array<{
        zone_key: string;
        shipping_rate_flex: string | number;
        shipping_rate_express: string | number;
        shipping_rate_standard: string | number;
      } & RowDataPacket>
    >(
      `SELECT zone_key, shipping_rate_flex, shipping_rate_express, shipping_rate_standard
       FROM price_list_zone_rates WHERE price_list_id = ? ORDER BY zone_key`,
      [list.id]
    );
    for (const z of zones) {
      console.log(
        `    ${z.zone_key}: ${z.shipping_rate_flex}/${z.shipping_rate_express}/${z.shipping_rate_standard}`
      );
    }
  }
}

async function main(): Promise<void> {
  console.log(`Modo: ${APPLY ? 'APPLY (escribe en DB)' : 'DRY-RUN (solo muestra)'}`);
  console.log(
    `DB: ${process.env.DB_HOST || process.env.MYSQLHOST || 'localhost'} / ${process.env.DB_NAME || process.env.MYSQLDATABASE || '?'}`
  );

  await showCurrentRates();

  const users = await findTargetUsers();
  console.log('\nUsuarios candidatos Ariel/Lupo:');
  if (!users.length) console.log('  (ninguno)');
  for (const u of users) {
    console.log(`  ${u.id} @${u.username} "${u.name}" role=${u.role} agency=${u.agency_id}`);
  }

  const { billing, driver } = await findPayments(users.map((u) => u.id));

  // Fallback: buscar pago de 200000 aunque el nombre no matchee exacto
  if (!billing.length && !driver.length) {
    const [anyBilling] = await pool.query<
      Array<{
        id: string;
        seller_id: string;
        amount: string | number;
        description: string;
        created_at: Date;
        name: string;
        username: string;
      } & RowDataPacket>
    >(
      `SELECT b.id, b.seller_id, b.amount, b.description, b.created_at, u.name, u.username
       FROM billing_ledger_entries b
       JOIN users u ON u.id = b.seller_id
       WHERE b.entry_type = 'payment' AND ABS(b.amount - ?) <= ?
       ORDER BY b.created_at DESC
       LIMIT 20`,
      [PAYMENT_AMOUNT, PAYMENT_TOLERANCE]
    );
    console.log('\nPagos de vendedor ≈ $200.000 (cualquier usuario):');
    for (const p of anyBilling) {
      console.log(
        `  ${p.id} ${money(Number(p.amount))} — ${p.name} (@${p.username}) — ${p.description} — ${p.created_at}`
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

  console.log('\nPagos a repartidor a eliminar:');
  if (!driver.length) console.log('  (ninguno)');
  for (const p of driver) {
    console.log(
      `  ${p.id} driver=${p.repartidor_id} ${money(Number(p.amount))} — ${p.description} — ${p.created_at}`
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

  console.log('\n--- Recálculo de cargos de envío (vendedores) ---');
  const sellerStats = await repriceSellerCharges();
  console.log(
    `Cargos: ${sellerStats.scanned} · a cambiar: ${sellerStats.changed} · igual: ${sellerStats.unchanged} · omitidos: ${sellerStats.skipped}`
  );
  console.log(`Delta total cargos: ${money(sellerStats.deltaTotal)}`);

  if (ALSO_DRIVERS) {
    console.log('\n--- Recálculo de earnings de repartidores (--drivers) ---');
    const driverStats = await repriceDriverEarnings();
    console.log(
      `Earnings: ${driverStats.scanned} · a cambiar: ${driverStats.changed} · igual: ${driverStats.unchanged} · omitidos: ${driverStats.skipped}`
    );
    console.log(`Delta total earnings: ${money(driverStats.deltaTotal)}`);
  }

  if (!APPLY) {
    console.log('\nDry-run listo. Para aplicar: npx tsx scripts/migrate-equal-prices-and-delete-payment.ts --apply');
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
