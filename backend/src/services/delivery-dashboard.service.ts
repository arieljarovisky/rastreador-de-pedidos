import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { AppNotification, OrderStatus, User, UserRole } from '../types/index.js';
import { isAgencyAdmin } from '../utils/roles.js';
import {
  DELIVERY_DEADLINE_HOUR,
  DELIVERY_SLA_HOUR,
  formatDeadlineHourLabel,
  getActiveOperationalDateKey,
  getTodayDeadline,
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

async function loadAgencyDeadlineHour(agencyId: string): Promise<number> {
  return getAgencyDeliveryDeadlineHour(agencyId);
}

/**
 * @param forHour Si se pasa, solo notifica a quien tenga el hito (-3h / -1h / corte) en esa hora ART.
 */
export async function sendDeadlineWarnings(
  dateKey: string,
  agencyIds?: string[],
  forHour?: number
): Promise<void> {
  const [agencies] = await pool.query<Array<{ id: string; name: string } & RowDataPacket>>(
    agencyIds?.length
      ? `SELECT id, name FROM agencies WHERE id IN (${agencyIds.map(() => '?').join(',')})`
      : 'SELECT id, name FROM agencies',
    agencyIds?.length ? agencyIds : []
  );

  for (const agency of agencies) {
    const agencyHour = await loadAgencyDeadlineHour(agency.id);
    const agencyWarningHour = Math.max(0, agencyHour - 3);

    if (forHour == null || forHour === agencyWarningHour) {
      const deadlineAt = getTodayDeadline(agencyHour);
      const hourLabel = formatDeadlineHourLabel(agencyHour);
      const summary = buildSummary(
        await queryOrderCounts(agency.id, dateKey),
        deadlineAt,
        dateKey,
        agencyHour
      );
      if (summary.undelivered > 0) {
        const adminIds = await getAgencyAdminIds(agency.id);
        const adminBody = `${summary.undelivered} pedido${summary.undelivered === 1 ? '' : 's'} sin entregar. El corte es a las ${hourLabel} hs.`;
        for (const adminId of adminIds) {
          await notifyUserIfNeeded(
            adminId,
            'deadline_warning',
            dateKey,
            'Recordatorio de corte',
            adminBody
          );
        }
      }
    }

    const sellerIds = await getSellerIds(agency.id);
    for (const sellerId of sellerIds) {
      const sellerHour = await resolveSalesCutoffHour({
        sellerId,
        agencyId: agency.id,
      });
      const sellerWarningHour = Math.max(0, sellerHour - 3);
      if (forHour != null && forHour !== sellerWarningHour) continue;

      const sellerDeadlineAt = getTodayDeadline(sellerHour);
      const hourLabel = formatDeadlineHourLabel(sellerHour);
      const sellerSummary = buildSummary(
        await queryOrderCounts(agency.id, dateKey, sellerId),
        sellerDeadlineAt,
        dateKey,
        sellerHour
      );
      if (sellerSummary.undelivered === 0) continue;
      await notifyUserIfNeeded(
        sellerId,
        'deadline_warning',
        dateKey,
        'Recordatorio de corte',
        `Tenés ${sellerSummary.undelivered} pedido${sellerSummary.undelivered === 1 ? '' : 's'} sin entregar. Corte a las ${hourLabel} hs.`
      );
    }
  }
}

export async function sendDeadlineUrgentAlerts(
  dateKey: string,
  agencyIds?: string[],
  forHour?: number
): Promise<void> {
  const [agencies] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    agencyIds?.length
      ? `SELECT id FROM agencies WHERE id IN (${agencyIds.map(() => '?').join(',')})`
      : 'SELECT id FROM agencies',
    agencyIds?.length ? agencyIds : []
  );

  for (const agency of agencies) {
    const agencyHour = await loadAgencyDeadlineHour(agency.id);
    const agencyUrgentHour = Math.max(0, agencyHour - 1);

    if (forHour == null || forHour === agencyUrgentHour) {
      const deadlineAt = getTodayDeadline(agencyHour);
      const hourLabel = formatDeadlineHourLabel(agencyHour);
      const summary = buildSummary(
        await queryOrderCounts(agency.id, dateKey),
        deadlineAt,
        dateKey,
        agencyHour
      );
      if (summary.undelivered > 0) {
        const adminIds = await getAgencyAdminIds(agency.id);
        const adminBody = `Queda 1 hora para el corte (${hourLabel}). ${summary.undelivered} pedido${summary.undelivered === 1 ? '' : 's'} sin entregar.`;
        for (const adminId of adminIds) {
          await notifyUserIfNeeded(
            adminId,
            'deadline_urgent',
            dateKey,
            'Última hora',
            adminBody
          );
        }
      }
    }

    const sellerIds = await getSellerIds(agency.id);
    for (const sellerId of sellerIds) {
      const sellerHour = await resolveSalesCutoffHour({
        sellerId,
        agencyId: agency.id,
      });
      const sellerUrgentHour = Math.max(0, sellerHour - 1);
      if (forHour != null && forHour !== sellerUrgentHour) continue;

      const sellerDeadlineAt = getTodayDeadline(sellerHour);
      const sellerSummary = buildSummary(
        await queryOrderCounts(agency.id, dateKey, sellerId),
        sellerDeadlineAt,
        dateKey,
        sellerHour
      );
      if (sellerSummary.undelivered === 0) continue;
      await notifyUserIfNeeded(
        sellerId,
        'deadline_urgent',
        dateKey,
        'Última hora',
        `Queda 1 hora para el corte. Tenés ${sellerSummary.undelivered} pedido${sellerSummary.undelivered === 1 ? '' : 's'} sin entregar.`
      );
    }
  }
}

export async function sendDeadlineMissedAlerts(
  dateKey: string,
  agencyIds?: string[],
  forHour?: number
): Promise<void> {
  const [agencies] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    agencyIds?.length
      ? `SELECT id FROM agencies WHERE id IN (${agencyIds.map(() => '?').join(',')})`
      : 'SELECT id FROM agencies',
    agencyIds?.length ? agencyIds : []
  );

  for (const agency of agencies) {
    const agencyHour = await loadAgencyDeadlineHour(agency.id);

    if (forHour == null || forHour === agencyHour) {
      const deadlineAt = getTodayDeadline(agencyHour);
      const hourLabel = formatDeadlineHourLabel(agencyHour);
      const summary = buildSummary(
        await queryOrderCounts(agency.id, dateKey),
        deadlineAt,
        dateKey,
        agencyHour
      );
      if (summary.undelivered > 0) {
        const adminIds = await getAgencyAdminIds(agency.id);
        const adminBody = `Corte de las ${hourLabel}: ${summary.undelivered} pedido${summary.undelivered === 1 ? '' : 's'} no entregado${summary.undelivered === 1 ? '' : 's'}.`;
        for (const adminId of adminIds) {
          await notifyUserIfNeeded(
            adminId,
            'deadline_missed',
            dateKey,
            'Corte de entrega',
            adminBody
          );
        }
      }
    }

    const sellerIds = await getSellerIds(agency.id);
    for (const sellerId of sellerIds) {
      const sellerHour = await resolveSalesCutoffHour({
        sellerId,
        agencyId: agency.id,
      });
      if (forHour != null && forHour !== sellerHour) continue;

      const sellerDeadlineAt = getTodayDeadline(sellerHour);
      const hourLabel = formatDeadlineHourLabel(sellerHour);
      const sellerSummary = buildSummary(
        await queryOrderCounts(agency.id, dateKey, sellerId),
        sellerDeadlineAt,
        dateKey,
        sellerHour
      );
      if (sellerSummary.undelivered === 0) continue;
      await notifyUserIfNeeded(
        sellerId,
        'deadline_missed',
        dateKey,
        'Pedidos fuera de plazo',
        `${sellerSummary.undelivered} pedido${sellerSummary.undelivered === 1 ? '' : 's'} no se entregó${sellerSummary.undelivered === 1 ? '' : 'ron'} antes de las ${hourLabel}.`
      );
    }
  }
}
