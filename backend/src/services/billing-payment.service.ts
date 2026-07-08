import { randomUUID } from 'crypto';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { User, UserRole } from '../types/index.js';
import {
  createCheckoutPreference,
  getBillingWebhookUrl,
  getMercadoPagoPayment,
} from './mercadopago.service.js';
import {
  getAgencyMercadoPagoAccount,
  getValidAgencyMercadoPagoToken,
} from './agency-mercadopago.service.js';
import { applyAutomatedBillingPayment } from './billing.service.js';

export async function getSellerOutstandingBalance(
  agencyId: string,
  sellerId: string
): Promise<number> {
  const [rows] = await pool.query<Array<{ balance: string | null } & RowDataPacket>>(
    `SELECT COALESCE(SUM(CASE entry_type
       WHEN 'charge' THEN amount
       WHEN 'payment' THEN -amount
       WHEN 'adjustment' THEN amount
       ELSE 0 END), 0) AS balance
     FROM billing_ledger_entries
     WHERE agency_id = ? AND seller_id = ?`,
    [agencyId, sellerId]
  );
  const balance = Number(rows[0]?.balance ?? 0);
  return Math.round(balance * 100) / 100;
}

export async function createSellerBillingCheckout(
  user: User,
  options: { amount?: number }
): Promise<{ intentId: string; initPoint: string; amount: number }> {
  if (user.role !== UserRole.STORE_ADMIN || !user.agencyId) throw new Error('FORBIDDEN');

  const account = await getAgencyMercadoPagoAccount(user.agencyId);
  if (!account) throw new Error('AGENCY_MP_NOT_CONNECTED');

  const balance = await getSellerOutstandingBalance(user.agencyId, user.id);
  const amount = options.amount ?? balance;
  if (!amount || amount <= 0) throw new Error('NO_BALANCE');
  if (amount > balance + 0.01) throw new Error('AMOUNT_EXCEEDS_BALANCE');

  const accessToken = await getValidAgencyMercadoPagoToken(user.agencyId);
  const intentId = randomUUID();
  const now = new Date();

  await pool.query(
    `INSERT INTO billing_payment_intents
      (id, agency_id, seller_id, amount, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    [intentId, user.agencyId, user.id, amount, now, now]
  );

  const preference = await createCheckoutPreference(accessToken, {
    title: 'Saldo de envíos · Posta',
    amount,
    externalReference: `bill:${intentId}`,
    notificationUrl: getBillingWebhookUrl(),
    backUrls: {
      success: `${env.frontendUrl}/app?tab=account&payment=success`,
      failure: `${env.frontendUrl}/app?tab=account&payment=failure`,
      pending: `${env.frontendUrl}/app?tab=account&payment=pending`,
    },
    payerEmail: user.username.includes('@') ? user.username : undefined,
  });

  await pool.query(
    'UPDATE billing_payment_intents SET mp_preference_id = ?, updated_at = ? WHERE id = ?',
    [preference.id, new Date(), intentId]
  );

  return { intentId, initPoint: preference.init_point, amount };
}

export async function processBillingPaymentWebhook(paymentId: string | number): Promise<void> {
  const [intentRows] = await pool.query<
    Array<{
      id: string;
      agency_id: string;
      seller_id: string;
      amount: string;
      status: string;
      ledger_entry_id: string | null;
    } & RowDataPacket>
  >(
    `SELECT i.id, i.agency_id, i.seller_id, i.amount, i.status, i.ledger_entry_id
     FROM billing_payment_intents i
     WHERE i.mp_payment_id = ?
     LIMIT 1`,
    [String(paymentId)]
  );

  let intent = intentRows[0];

  if (!intent) {
    const [pendingByPayment] = await pool.query<
      Array<{
        id: string;
        agency_id: string;
        seller_id: string;
        amount: string;
        status: string;
        ledger_entry_id: string | null;
      } & RowDataPacket>
    >(
      `SELECT id, agency_id, seller_id, amount, status, ledger_entry_id
       FROM billing_payment_intents WHERE status = 'pending'`
    );
    for (const row of pendingByPayment) {
      try {
        const token = await getValidAgencyMercadoPagoToken(row.agency_id);
        const payment = await getMercadoPagoPayment(paymentId, token);
        const ref = payment.external_reference ?? '';
        if (ref === `bill:${row.id}`) {
          intent = row;
          break;
        }
      } catch {
        // try next
      }
    }
  }

  if (!intent || intent.status === 'approved') return;

  const accessToken = await getValidAgencyMercadoPagoToken(intent.agency_id);
  const payment = await getMercadoPagoPayment(paymentId, accessToken);
  if (payment.status !== 'approved') return;

  const ref = payment.external_reference ?? '';
  if (ref !== `bill:${intent.id}`) return;

  if (intent.ledger_entry_id) return;

  const now = new Date();
  const ledgerEntryId = await applyAutomatedBillingPayment({
    agencyId: intent.agency_id,
    sellerId: intent.seller_id,
    amount: Number(intent.amount),
    description: 'Pago con Mercado Pago',
    createdBy: 'Mercado Pago',
  });

  await pool.query(
    `UPDATE billing_payment_intents
     SET status = 'approved', mp_payment_id = ?, ledger_entry_id = ?, updated_at = ?
     WHERE id = ?`,
    [String(payment.id), ledgerEntryId, now, intent.id]
  );
}

export function isAgencyMpConnectedForSeller(agencyId: string): Promise<boolean> {
  return getAgencyMercadoPagoAccount(agencyId).then((a) => Boolean(a));
}
