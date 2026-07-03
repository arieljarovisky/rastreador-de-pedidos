import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { AppNotification, OrderStatus, User, UserRole } from '../types/index.js';
import { isAgencyAdmin } from '../utils/roles.js';
import {
  DELIVERY_DEADLINE_HOUR,
  getOperationalDateKey,
  getTodayDeadline,
  getOperationalDayBounds,
} from '../utils/delivery-deadline.js';
import { createNotification } from './notifications.service.js';

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
  deadlineAt: Date,
  dateKey: string
): DeliveryDailySummary {
  const now = Date.now();
  const deadlineMs = deadlineAt.getTime();
  const counts = new Map(rows.map((r) => [r.status, Number(r.cnt)]));

  const delivered = counts.get(OrderStatus.DELIVERED) ?? 0;
  const cancelled = counts.get(OrderStatus.CANCELLED) ?? 0;
  const pending = counts.get(OrderStatus.PENDING) ?? 0;
  const assigned = counts.get(OrderStatus.ASSIGNED) ?? 0;
  const delivering = counts.get(OrderStatus.DELIVERING) ?? 0;
  const undelivered = pending + assigned + delivering;
  const total = delivered + cancelled + undelivered;
  const isPastDeadline = now >= deadlineMs;

  return {
    date: dateKey,
    deadlineHour: DELIVERY_DEADLINE_HOUR,
    deadlineAt: deadlineAt.toISOString(),
    total,
    delivered,
    undelivered,
    overdue: isPastDeadline ? undelivered : 0,
    cancelled,
    minutesUntilDeadline: Math.max(0, Math.floor((deadlineMs - now) / 60_000)),
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
  dateKey: string = getOperationalDateKey()
): Promise<DeliveryDailySummary> {
  const deadlineAt = getTodayDeadline();

  if (user.role === UserRole.STORE_ADMIN) {
    if (!user.agencyId) {
      return buildSummary([], deadlineAt, dateKey);
    }
    const rows = await queryOrderCounts(user.agencyId, dateKey, user.id);
    return buildSummary(rows, deadlineAt, dateKey);
  }

  if (isAgencyAdmin(user.role)) {
    if (!user.agencyId) {
      return buildSummary([], deadlineAt, dateKey);
    }
    const rows = await queryOrderCounts(user.agencyId, dateKey);
    return buildSummary(rows, deadlineAt, dateKey);
  }

  return buildSummary([], deadlineAt, dateKey);
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

export async function sendDeadlineWarnings(dateKey: string): Promise<void> {
  const [agencies] = await pool.query<Array<{ id: string; name: string } & RowDataPacket>>(
    'SELECT id, name FROM agencies'
  );

  for (const agency of agencies) {
    const summary = buildSummary(
      await queryOrderCounts(agency.id, dateKey),
      getTodayDeadline(),
      dateKey
    );
    if (summary.undelivered === 0) continue;

    const adminIds = await getAgencyAdminIds(agency.id);
    const adminBody = `${summary.undelivered} pedido${summary.undelivered === 1 ? '' : 's'} sin entregar. El corte es a las ${DELIVERY_DEADLINE_HOUR}:00 hs.`;
    for (const adminId of adminIds) {
      await notifyUserIfNeeded(
        adminId,
        'deadline_warning',
        dateKey,
        '⏰ Recordatorio de corte',
        adminBody
      );
    }

    const sellerIds = await getSellerIds(agency.id);
    for (const sellerId of sellerIds) {
      const sellerSummary = buildSummary(
        await queryOrderCounts(agency.id, dateKey, sellerId),
        getTodayDeadline(),
        dateKey
      );
      if (sellerSummary.undelivered === 0) continue;
      await notifyUserIfNeeded(
        sellerId,
        'deadline_warning',
        dateKey,
        '⏰ Recordatorio de corte',
        `Tenés ${sellerSummary.undelivered} pedido${sellerSummary.undelivered === 1 ? '' : 's'} sin entregar. Corte a las ${DELIVERY_DEADLINE_HOUR}:00 hs.`
      );
    }
  }
}

export async function sendDeadlineUrgentAlerts(dateKey: string): Promise<void> {
  const [agencies] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    'SELECT id FROM agencies'
  );

  for (const agency of agencies) {
    const summary = buildSummary(
      await queryOrderCounts(agency.id, dateKey),
      getTodayDeadline(),
      dateKey
    );
    if (summary.undelivered === 0) continue;

    const adminIds = await getAgencyAdminIds(agency.id);
    const adminBody = `Queda 1 hora para el corte (${DELIVERY_DEADLINE_HOUR}:00). ${summary.undelivered} pedido${summary.undelivered === 1 ? '' : 's'} sin entregar.`;
    for (const adminId of adminIds) {
      await notifyUserIfNeeded(
        adminId,
        'deadline_urgent',
        dateKey,
        '⚠️ Última hora',
        adminBody
      );
    }

    const sellerIds = await getSellerIds(agency.id);
    for (const sellerId of sellerIds) {
      const sellerSummary = buildSummary(
        await queryOrderCounts(agency.id, dateKey, sellerId),
        getTodayDeadline(),
        dateKey
      );
      if (sellerSummary.undelivered === 0) continue;
      await notifyUserIfNeeded(
        sellerId,
        'deadline_urgent',
        dateKey,
        '⚠️ Última hora',
        `Queda 1 hora para el corte. Tenés ${sellerSummary.undelivered} pedido${sellerSummary.undelivered === 1 ? '' : 's'} sin entregar.`
      );
    }
  }
}

export async function sendDeadlineMissedAlerts(dateKey: string): Promise<void> {
  const [agencies] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    'SELECT id FROM agencies'
  );

  for (const agency of agencies) {
    const summary = buildSummary(
      await queryOrderCounts(agency.id, dateKey),
      getTodayDeadline(),
      dateKey
    );
    if (summary.undelivered === 0) continue;

    const adminIds = await getAgencyAdminIds(agency.id);
    const adminBody = `Corte de las ${DELIVERY_DEADLINE_HOUR}:00: ${summary.undelivered} pedido${summary.undelivered === 1 ? '' : 's'} no entregado${summary.undelivered === 1 ? '' : 's'}.`;
    for (const adminId of adminIds) {
      await notifyUserIfNeeded(
        adminId,
        'deadline_missed',
        dateKey,
        '🚨 Corte de entrega',
        adminBody
      );
    }

    const sellerIds = await getSellerIds(agency.id);
    for (const sellerId of sellerIds) {
      const sellerSummary = buildSummary(
        await queryOrderCounts(agency.id, dateKey, sellerId),
        getTodayDeadline(),
        dateKey
      );
      if (sellerSummary.undelivered === 0) continue;
      await notifyUserIfNeeded(
        sellerId,
        'deadline_missed',
        dateKey,
        '🚨 Pedidos fuera de plazo',
        `${sellerSummary.undelivered} pedido${sellerSummary.undelivered === 1 ? '' : 's'} no se entregó${sellerSummary.undelivered === 1 ? '' : 'ron'} antes de las ${DELIVERY_DEADLINE_HOUR}:00.`
      );
    }
  }
}
