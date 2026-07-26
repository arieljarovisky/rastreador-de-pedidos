import { randomUUID } from 'crypto';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { UserRole } from '../types/index.js';
import {
  createCheckoutPreference,
  getMercadoPagoPayment,
  getMercadoPagoWebhookUrl,
  isPostaMercadoPagoConfigured,
} from './mercadopago.service.js';

export interface SubscriptionPlan {
  id: string;
  name: string;
  minRepartidores: number;
  maxRepartidores: number | null;
  priceArs: number;
  sortOrder: number;
}

export interface AgencySubscriptionStatus {
  status: 'trial' | 'active' | 'past_due' | 'cancelled';
  isActive: boolean;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  plan: SubscriptionPlan | null;
  lastRepartidorCount: number;
  repartidorCount: number;
  recommendedPlan: SubscriptionPlan | null;
  daysRemaining: number | null;
}

interface PlanRow extends RowDataPacket {
  id: string;
  name: string;
  min_monthly_shipments: number;
  max_monthly_shipments: number | null;
  price_ars: string;
  sort_order: number;
}

interface SubRow extends RowDataPacket {
  agency_id: string;
  plan_id: string | null;
  status: 'trial' | 'active' | 'past_due' | 'cancelled';
  trial_ends_at: Date | null;
  current_period_start: Date | null;
  current_period_end: Date | null;
  last_shipment_count: number;
}

function rowToPlan(row: PlanRow): SubscriptionPlan {
  return {
    id: row.id,
    name: row.name,
    minRepartidores: row.min_monthly_shipments,
    maxRepartidores: row.max_monthly_shipments,
    priceArs: Number(row.price_ars),
    sortOrder: row.sort_order,
  };
}

export async function listSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const [rows] = await pool.query<PlanRow[]>(
    'SELECT * FROM subscription_plans WHERE active = 1 ORDER BY sort_order'
  );
  return rows.map(rowToPlan);
}

export function resolvePlanForRepartidorCount(
  plans: SubscriptionPlan[],
  repartidorCount: number
): SubscriptionPlan {
  const sorted = [...plans].sort((a, b) => a.sortOrder - b.sortOrder);
  const count = Math.max(0, repartidorCount);
  for (const plan of sorted) {
    const withinMin = count >= plan.minRepartidores;
    const withinMax =
      plan.maxRepartidores === null || count <= plan.maxRepartidores;
    if (withinMin && withinMax) return plan;
  }
  return sorted[sorted.length - 1]!;
}

export async function countAgencyRepartidores(agencyId: string): Promise<number> {
  const [rows] = await pool.query<Array<{ cnt: string } & RowDataPacket>>(
    `SELECT COUNT(*) AS cnt FROM users
     WHERE agency_id = ? AND role = ?`,
    [agencyId, UserRole.REPARTIDOR]
  );
  return Number(rows[0]?.cnt ?? 0);
}

async function getSubscriptionRow(agencyId: string): Promise<SubRow | null> {
  const [rows] = await pool.query<SubRow[]>(
    'SELECT * FROM agency_subscriptions WHERE agency_id = ? LIMIT 1',
    [agencyId]
  );
  return rows[0] ?? null;
}

export async function ensureAgencySubscription(agencyId: string): Promise<void> {
  const existing = await getSubscriptionRow(agencyId);
  if (existing) return;
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + env.mercadopago.trialDays);
  const now = new Date();
  await pool.query(
    `INSERT INTO agency_subscriptions (agency_id, status, trial_ends_at, updated_at, created_at)
     VALUES (?, 'trial', ?, ?, ?)`,
    [agencyId, trialEnd, now, now]
  );
}

function computeIsActive(sub: SubRow): boolean {
  const now = Date.now();
  if (sub.status === 'active') {
    if (!sub.current_period_end) return true;
    return new Date(sub.current_period_end).getTime() >= now;
  }
  if (sub.status === 'trial' && sub.trial_ends_at) {
    return new Date(sub.trial_ends_at).getTime() >= now;
  }
  return false;
}

function daysRemaining(sub: SubRow): number | null {
  const now = Date.now();
  if (sub.status === 'trial' && sub.trial_ends_at) {
    return Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - now) / 86400000));
  }
  if (sub.status === 'active' && sub.current_period_end) {
    return Math.max(0, Math.ceil((new Date(sub.current_period_end).getTime() - now) / 86400000));
  }
  return null;
}

export async function getAgencySubscriptionStatus(
  agencyId: string
): Promise<AgencySubscriptionStatus> {
  await ensureAgencySubscription(agencyId);
  const sub = await getSubscriptionRow(agencyId);
  if (!sub) throw new Error('SUB_NOT_FOUND');

  const plans = await listSubscriptionPlans();
  const repartidorCount = await countAgencyRepartidores(agencyId);
  const recommendedPlan = resolvePlanForRepartidorCount(plans, repartidorCount);
  const plan = sub.plan_id ? plans.find((p) => p.id === sub.plan_id) ?? recommendedPlan : recommendedPlan;

  return {
    status: sub.status,
    isActive: computeIsActive(sub),
    trialEndsAt: sub.trial_ends_at ? new Date(sub.trial_ends_at).toISOString() : null,
    currentPeriodStart: sub.current_period_start
      ? new Date(sub.current_period_start).toISOString()
      : null,
    currentPeriodEnd: sub.current_period_end
      ? new Date(sub.current_period_end).toISOString()
      : null,
    plan,
    lastRepartidorCount: sub.last_shipment_count,
    repartidorCount,
    recommendedPlan,
    daysRemaining: daysRemaining(sub),
  };
}

export async function isAgencySubscriptionActive(agencyId: string): Promise<boolean> {
  const status = await getAgencySubscriptionStatus(agencyId);
  return status.isActive;
}

export async function createSubscriptionCheckout(
  agencyId: string,
  payerEmail?: string
): Promise<{ intentId: string; initPoint: string; plan: SubscriptionPlan; amount: number }> {
  if (!isPostaMercadoPagoConfigured()) throw new Error('POSTA_MP_NOT_CONFIGURED');

  const plans = await listSubscriptionPlans();
  const repartidorCount = await countAgencyRepartidores(agencyId);
  const plan = resolvePlanForRepartidorCount(plans, repartidorCount);
  const amount = plan.priceArs;

  const intentId = randomUUID();
  const now = new Date();
  await pool.query(
    `INSERT INTO subscription_payment_intents
      (id, agency_id, plan_id, amount, shipment_count, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [intentId, agencyId, plan.id, amount, repartidorCount, now, now]
  );

  const preference = await createCheckoutPreference(env.mercadopago.postaAccessToken, {
    title: `Posta · Suscripción ${plan.name}`,
    amount,
    externalReference: `sub:${intentId}`,
    notificationUrl: getMercadoPagoWebhookUrl(),
    backUrls: {
      success: `${env.frontendUrl}/app?tab=settings&subscription=success`,
      failure: `${env.frontendUrl}/app?tab=settings&subscription=failure`,
      pending: `${env.frontendUrl}/app?tab=settings&subscription=pending`,
    },
    payerEmail,
  });

  await pool.query(
    'UPDATE subscription_payment_intents SET mp_preference_id = ?, updated_at = ? WHERE id = ?',
    [preference.id, new Date(), intentId]
  );

  return { intentId, initPoint: preference.init_point, plan, amount };
}

export async function processSubscriptionPaymentWebhook(
  paymentId: string | number
): Promise<void> {
  if (!isPostaMercadoPagoConfigured()) return;

  const payment = await getMercadoPagoPayment(paymentId, env.mercadopago.postaAccessToken);
  if (payment.status !== 'approved') return;

  const ref = payment.external_reference ?? '';
  if (!ref.startsWith('sub:')) return;
  const intentId = ref.slice(4);

  const [intentRows] = await pool.query<
    Array<{ id: string; agency_id: string; plan_id: string; status: string } & RowDataPacket>
  >('SELECT id, agency_id, plan_id, status FROM subscription_payment_intents WHERE id = ? LIMIT 1', [
    intentId,
  ]);
  const intent = intentRows[0];
  if (!intent || intent.status === 'approved') return;

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await pool.query(
    `UPDATE subscription_payment_intents
     SET status = 'approved', mp_payment_id = ?, updated_at = ?
     WHERE id = ?`,
    [String(payment.id), now, intentId]
  );

  const repartidorCount = await countAgencyRepartidores(intent.agency_id);
  await pool.query(
    `UPDATE agency_subscriptions
     SET plan_id = ?, status = 'active', trial_ends_at = NULL,
         current_period_start = ?, current_period_end = ?,
         last_shipment_count = ?, mp_payment_id = ?, updated_at = ?
     WHERE agency_id = ?`,
    [
      intent.plan_id,
      now,
      periodEnd,
      repartidorCount,
      String(payment.id),
      now,
      intent.agency_id,
    ]
  );
}

export async function adminUpdateAgencySubscription(
  agencyId: string,
  data: {
    status?: 'trial' | 'active' | 'past_due' | 'cancelled';
    planId?: string | null;
    trialEndsAt?: string | null;
    currentPeriodEnd?: string | null;
    extendTrialDays?: number;
  }
): Promise<AgencySubscriptionStatus> {
  await ensureAgencySubscription(agencyId);
  const sub = await getSubscriptionRow(agencyId);
  if (!sub) throw new Error('SUB_NOT_FOUND');

  const plans = await listSubscriptionPlans();
  let planId = sub.plan_id;
  if (data.planId !== undefined) {
    if (data.planId === null) {
      planId = null;
    } else {
      const plan = plans.find((p) => p.id === data.planId);
      if (!plan) throw new Error('PLAN_NOT_FOUND');
      planId = plan.id;
    }
  }

  let status = data.status ?? sub.status;
  let trialEndsAt = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  let periodStart = sub.current_period_start ? new Date(sub.current_period_start) : null;
  let periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;

  if (typeof data.extendTrialDays === 'number' && Number.isFinite(data.extendTrialDays)) {
    const days = Math.trunc(data.extendTrialDays);
    if (days < 1 || days > 3650) throw new Error('INVALID_TRIAL_DAYS');
    const base =
      trialEndsAt && trialEndsAt.getTime() > Date.now() ? trialEndsAt : new Date();
    base.setDate(base.getDate() + days);
    trialEndsAt = base;
    status = 'trial';
  }

  if (data.trialEndsAt !== undefined) {
    if (data.trialEndsAt === null) {
      trialEndsAt = null;
    } else {
      const parsed = new Date(data.trialEndsAt);
      if (Number.isNaN(parsed.getTime())) throw new Error('INVALID_TRIAL_ENDS_AT');
      trialEndsAt = parsed;
    }
  }

  if (data.currentPeriodEnd !== undefined) {
    if (data.currentPeriodEnd === null) {
      periodEnd = null;
    } else {
      const parsed = new Date(data.currentPeriodEnd);
      if (Number.isNaN(parsed.getTime())) throw new Error('INVALID_PERIOD_END');
      periodEnd = parsed;
      if (!periodStart) periodStart = new Date();
    }
  }

  if (status === 'active' && !periodEnd) {
    periodStart = periodStart ?? new Date();
    periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const now = new Date();
  await pool.query(
    `UPDATE agency_subscriptions
     SET plan_id = ?, status = ?, trial_ends_at = ?,
         current_period_start = ?, current_period_end = ?, updated_at = ?
     WHERE agency_id = ?`,
    [planId, status, trialEndsAt, periodStart, periodEnd, now, agencyId]
  );

  return getAgencySubscriptionStatus(agencyId);
}
