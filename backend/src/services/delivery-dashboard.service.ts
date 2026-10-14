import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { AppNotification, OrderStatus, User, UserRole } from '../types/index.js';
import { isAgencyAdmin } from '../utils/roles.js';
import {
  DELIVERY_DEADLINE_HOUR,
  DELIVERY_SLA_HOUR,
  formatDeadlineHourLabel,
  getActiveOperationalDateKey,
  getOperationalDateKey,
  getOperationalDayBounds,
  deliveryDeadlineForOperationalDate,
  normalizeDeadlineHour,
} from '../utils/delivery-deadline.js';
import { createNotification } from './notifications.service.js';
import { getAgencyDeliveryDeadlineHour } from './agencies.service.js';
import { resolveSalesCutoffHour } from './users.service.js';

export interface DeliveryDailySummary {
  date: string;
  deadlineHour: number;
  deadlineAt: string;
  total: number;
  delivered: number;
  undelivered: number;
  overdue: number;
  cancelled: number;
  minutesUntilDeadline: number;
  isPastDeadline: boolean;
}

interface OrderCountRow extends RowDataPacket {
  status: string;
  cnt: number;
}

function buildSummary(
  rows: OrderCountRow[],
  salesCutoffAt: Date,
  dateKey: string,
  deadlineHour: number = DELIVERY_DEADLINE_HOUR
): DeliveryDailySummary {
  const now = Date.now();
  const salesCutoffMs = salesCutoffAt.getTime();
  const counts = new Map(rows.map((r) => [r.status, Number(r.cnt)]));
  const cutHour = normalizeDeadlineHour(deadlineHour);

  const delivered = counts.get(OrderStatus.DELIVERED) ?? 0;
  const cancelled = counts.get(OrderStatus.CANCELLED) ?? 0;
  const pending = counts.get(OrderStatus.PENDING) ?? 0;
  const assigned = counts.get(OrderStatus.ASSIGNED) ?? 0;
  const delivering = counts.get(OrderStatus.DELIVERING) ?? 0;
  const undelivered = pending + assigned + delivering;
  const total = delivered + cancelled + undelivered;

  const todayKey = getActiveOperationalDateKey();
  const isViewingToday = dateKey === todayKey;
  const isPastDeadline = isViewingToday
    ? now >= salesCutoffMs
    : dateKey < todayKey;
  const deliverySlaAt = deliveryDeadlineForOperationalDate(dateKey, DELIVERY_SLA_HOUR);
  const isPastDeliverySla = isViewingToday
    ? now >= deliverySlaAt.getTime()
    : dateKey < todayKey;

  return {
    date: dateKey,
    deadlineHour: cutHour,
    deadlineAt: salesCutoffAt.toISOString(),
    total,
    delivered,
    undelivered,
    overdue: isPastDeliverySla ? undelivered : 0,
    cancelled,
    minutesUntilDeadline: isViewingToday
      ? Math.max(0, Math.floor((salesCutoffMs - now) / 60_000))
      : 0,
    isPastDeadline,
  };
}

async function queryOrderCounts(
  agencyId: string,
  dateKey: string,
  sellerId?: string
): Promise<OrderCountRow[]> {
  const { start, end } = getOperationalDayBounds(dateKey);
  const params: (string | Date)[] = [agencyId, start, end];
  let sellerFilter = '';
  if (sellerId) {
    sellerFilter = ' AND o.seller_id = ?';
    params.push(sellerId);
  }

  const [rows] = await pool.query<OrderCountRow[]>(
    `SELECT o.status, COUNT(*) AS cnt
     FROM orders o
     WHERE o.agency_id = ?
       AND o.archived = 0
       AND o.delivery_deadline >= ?
       AND o.delivery_deadline < ?
       ${sellerFilter}
     GROUP BY o.status`,
    params
  );
  return rows;
}

export async function getDeliverySummaryForUser(
  user: User,
  dateKey: string = getActiveOperationalDateKey()
): Promise<DeliveryDailySummary> {
  const deadlineHour =
    user.role === UserRole.STORE_ADMIN
      ? await resolveSalesCutoffHour({ sellerId: user.id, agencyId: user.agencyId })
      : user.agencyId
        ? await getAgencyDeliveryDeadlineHour(user.agencyId)
        : DELIVERY_DEADLINE_HOUR;
  const salesCutoffAt = deliveryDeadlineForOperationalDate(dateKey, deadlineHour);

  if (user.role === UserRole.STORE_ADMIN) {
    if (!user.agencyId) {
      return buildSummary([], salesCutoffAt, dateKey, deadlineHour);
    }
    const rows = await queryOrderCounts(user.agencyId, dateKey, user.id);
    return buildSummary(rows, salesCutoffAt, dateKey, deadlineHour);
  }

  if (isAgencyAdmin(user.role)) {
    if (!user.agencyId) {
      return buildSummary([], salesCutoffAt, dateKey, deadlineHour);
    }
    const rows = await queryOrderCounts(user.agencyId, dateKey);
    return buildSummary(rows, salesCutoffAt, dateKey, deadlineHour);
  }

  return buildSummary([], salesCutoffAt, dateKey, deadlineHour);
}

async function alreadyNotifiedToday(
  userId: string,
  type: AppNotification['type'],
  dateKey: string
): Promise<boolean> {
  const { start, end } = getOperationalDayBounds(dateKey);
  const [rows] = await pool.query<Array<{ cnt: number } & RowDataPacket>>(
    `SELECT COUNT(*) AS cnt FROM notifications
     WHERE user_id = ? AND type = ?
       AND created_at >= ? AND created_at < ?`,
    [userId, type, start, end]
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function getAgencyAdminIds(agencyId: string): Promise<string[]> {
  const [rows] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    `SELECT id FROM users WHERE agency_id = ? AND role IN ('super_admin', 'logistics_admin')`,
    [agencyId]
  );
  return rows.map((r) => r.id);
}

async function getSellerIds(agencyId: string): Promise<string[]> {
  const [rows] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    `SELECT id FROM users WHERE agency_id = ? AND role = 'store_admin'`,
    [agencyId]
  );
  return rows.map((r) => r.id);
}

async function notifyUserIfNeeded(
  userId: string,
  type: AppNotification['type'],
  dateKey: string,
  title: string,
  body: string
): Promise<void> {
  if (await alreadyNotifiedToday(userId, type, dateKey)) return;
  await createNotification({
    id: `n_${type}_${userId}_${dateKey}_${Date.now()}`,
    userId,
    title,
    body,
    type,
  });
}

type DeliveryAlertKind = 'warning' | 'urgent' | 'missed';

/** Hora ART del aviso. El límite es la entrega (21 hs), no el corte de ventas. */
function deliveryAlertHour(kind: DeliveryAlertKind): number {
  if (kind === 'warning') return Math.max(0, DELIVERY_SLA_HOUR - 3);
  if (kind === 'urgent') return Math.max(0, DELIVERY_SLA_HOUR - 1);
  return DELIVERY_SLA_HOUR;
}

function deliveryAlertCopy(
  kind: DeliveryAlertKind,
  undelivered: number,
  audience: 'admin' | 'seller'
): { type: AppNotification['type']; title: string; body: string } {
  const n = undelivered;
  const pedidos = `pedido${n === 1 ? '' : 's'}`;
  const hourLabel = formatDeadlineHourLabel(DELIVERY_SLA_HOUR);

  if (kind === 'warning') {
    const body =
      audience === 'admin'
        ? `${n} ${pedidos} sin entregar. El límite de entrega es a las ${hourLabel} hs.`
        : `Tenés ${n} ${pedidos} sin entregar. El límite de entrega es a las ${hourLabel} hs.`;
    return { type: 'deadline_warning', title: 'Recordatorio de entrega', body };
  }

  if (kind === 'urgent') {
    const body =
      audience === 'admin'
        ? `Queda 1 hora para el límite de entrega (${hourLabel}). ${n} ${pedidos} sin entregar.`
        : `Queda 1 hora para el límite de entrega (${hourLabel}). Tenés ${n} ${pedidos} sin entregar.`;
    return { type: 'deadline_urgent', title: 'Última hora', body };
  }

  const body =
    audience === 'admin'
      ? `Límite de las ${hourLabel}: ${n} ${pedidos} no entregado${n === 1 ? '' : 's'}.`
      : `${n} ${pedidos} ${n === 1 ? 'no se entregó' : 'no se entregaron'} antes de las ${hourLabel}.`;
  return { type: 'deadline_missed', title: audience === 'admin' ? 'Fuera de plazo' : 'Pedidos fuera de plazo', body };
}

/**
 * Avisa a las 18, 20 y 21 hs ART según pedidos del día todavía sin entregar.
 * No usa el corte de ventas de la agencia ni del vendedor.
 */
async function sendDeliverySlaAlerts(
  kind: DeliveryAlertKind,
  dateKey: string,
  agencyIds?: string[],
  forHour?: number
): Promise<void> {
  const targetHour = deliveryAlertHour(kind);
  if (forHour != null && forHour !== targetHour) return;

  const [agencies] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    agencyIds?.length
      ? `SELECT id FROM agencies WHERE id IN (${agencyIds.map(() => '?').join(',')})`
      : 'SELECT id FROM agencies',
    agencyIds?.length ? agencyIds : []
  );

  const deadlineAt = deliveryDeadlineForOperationalDate(dateKey, DELIVERY_SLA_HOUR);

  for (const agency of agencies) {
    const summary = buildSummary(
      await queryOrderCounts(agency.id, dateKey),
      deadlineAt,
      dateKey,
      DELIVERY_SLA_HOUR
    );
    if (summary.undelivered > 0) {
      const adminCopy = deliveryAlertCopy(kind, summary.undelivered, 'admin');
      const adminIds = await getAgencyAdminIds(agency.id);
      for (const adminId of adminIds) {
        await notifyUserIfNeeded(adminId, adminCopy.type, dateKey, adminCopy.title, adminCopy.body);
      }
    }

    const sellerIds = await getSellerIds(agency.id);
    for (const sellerId of sellerIds) {
      const sellerSummary = buildSummary(
        await queryOrderCounts(agency.id, dateKey, sellerId),
        deadlineAt,
        dateKey,
        DELIVERY_SLA_HOUR
      );
      if (sellerSummary.undelivered === 0) continue;
      const sellerCopy = deliveryAlertCopy(kind, sellerSummary.undelivered, 'seller');
      await notifyUserIfNeeded(sellerId, sellerCopy.type, dateKey, sellerCopy.title, sellerCopy.body);
    }
  }
}

/**
 * @param forHour Si se pasa, solo notifica cuando esa hora ART es 3 horas antes del límite de entrega.
 */
export async function sendDeadlineWarnings(
  dateKey: string,
  agencyIds?: string[],
  forHour?: number
): Promise<void> {
  await sendDeliverySlaAlerts('warning', dateKey, agencyIds, forHour);
}

export async function sendDeadlineUrgentAlerts(
  dateKey: string,
  agencyIds?: string[],
  forHour?: number
): Promise<void> {
  await sendDeliverySlaAlerts('urgent', dateKey, agencyIds, forHour);
}

export async function sendDeadlineMissedAlerts(
  dateKey: string,
  agencyIds?: string[],
  forHour?: number
): Promise<void> {
  await sendDeliverySlaAlerts('missed', dateKey, agencyIds, forHour);
}

function countFromDeadlineBody(body: string): number | null {
  const match = body.match(/(\d+)\s+pedidos?/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reescribe alertas ya guardadas que usaban el corte de ventas.
 * Mueve la hora visible a 18:00, 20:00 y 21:00 del mismo día.
 */
export async function rewriteLegacyDeliveryDeadlineNotifications(): Promise<number> {
  const [rows] = await pool.query<
    Array<{ id: string; title: string; body: string; type: string; created_at: Date; role: string | null } & RowDataPacket>
  >(
    `SELECT n.id, n.title, n.body, n.type, n.created_at, u.role
     FROM notifications n
     LEFT JOIN users u ON u.id = n.user_id
     WHERE n.type IN ('deadline_warning', 'deadline_urgent', 'deadline_missed')`
  );

  let updated = 0;
  for (const row of rows) {
    const kind: DeliveryAlertKind =
      row.type === 'deadline_warning' ? 'warning' : row.type === 'deadline_urgent' ? 'urgent' : 'missed';
    const undelivered = countFromDeadlineBody(row.body);
    if (undelivered == null) continue;

    const audience = row.role === 'store_admin' ? 'seller' : 'admin';
    const copy = deliveryAlertCopy(kind, undelivered, audience);
    const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;

    const target = deliveryDeadlineForOperationalDate(
      getOperationalDateKey(createdAt),
      deliveryAlertHour(kind)
    );
    const nextAt = new Date(target.getTime() + (createdAt.getTime() % 60_000));
    const sameText = row.title === copy.title && row.body === copy.body;
    const sameTime = Math.abs(createdAt.getTime() - nextAt.getTime()) < 1500;
    if (sameText && sameTime) continue;

    await pool.query(`UPDATE notifications SET title = ?, body = ?, created_at = ? WHERE id = ?`, [
      copy.title,
      copy.body,
      nextAt,
      row.id,
    ]);
    updated += 1;
  }

  if (updated > 0) {
    console.log(
      `[notifications] Reescritas ${updated} alertas viejas al límite de entrega de las ${formatDeadlineHourLabel(DELIVERY_SLA_HOUR)}.`
    );
  }
  return updated;
}
