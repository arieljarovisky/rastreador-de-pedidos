import bcrypt from 'bcryptjs';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import {
  Agency,
  createAgency,
  ensureAgencyStatusColumn,
  getAgencyById,
  setAgencyStatus,
  updateAgencyProfile,
} from './agencies.service.js';
import {
  adminUpdateAgencySubscription,
  AgencySubscriptionStatus,
  getAgencySubscriptionStatus,
  listSubscriptionPlans,
} from './subscriptions.service.js';
import { recordPlatformAudit } from './platform-audit.service.js';
import {
  createUser,
  ensureUserDisabledAtColumn,
  getRepartidores,
  getUserById,
  listSellers,
  updateSeller,
  updateSellerPassword,
} from './users.service.js';
import {
  getOrderById,
  setOrderArchived,
  updateOrderStatus,
} from './orders.service.js';
import {
  createZone,
  deleteZone,
  listZonesForAgency,
  updateZone,
  updateZoneShippingRates,
} from './delivery-zones.service.js';
import {
  createPriceList,
  deletePriceList,
  getPriceList,
  listPriceLists,
  updatePriceList,
} from './price-lists.service.js';
import { Order, OrderStatus, User, UserRole } from '../types/index.js';
import { isPlatformOwnerEmail } from '../middleware/platform.js';
import { isValidEmail } from '../utils/email.js';
import { DeliveryZone } from '../config/delivery-zones.js';

export interface PlatformAgencyListItem {
  id: string;
  name: string;
  city: string | null;
  status: 'active' | 'suspended';
  contactEmail: string | null;
  createdAt: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  sellers: number;
  repartidores: number;
  openOrders: number;
  subscriptionStatus: AgencySubscriptionStatus['status'] | null;
  subscriptionActive: boolean;
  daysRemaining: number | null;
}

export interface PlatformMetrics {
  agenciesTotal: number;
  agenciesActive: number;
  agenciesSuspended: number;
  trialsActive: number;
  trialsExpired: number;
  subscriptionsActive: number;
  usersTotal: number;
  ordersByStatus: Record<string, number>;
}

export interface PlatformAgencyDetail {
  agency: Agency;
  subscription: AgencySubscriptionStatus;
  owners: User[];
  sellers: User[];
  repartidores: User[];
  logisticsAdmins: User[];
  counts: {
    sellers: number;
    repartidores: number;
    logisticsAdmins: number;
    owners: number;
    ordersTotal: number;
    ordersOpen: number;
    zones: number;
    priceLists: number;
  };
  ordersByStatus: Record<string, number>;
}

function actorAgencyAdmin(actor: User, agencyId: string): User {
  return {
    ...actor,
    role: UserRole.SUPER_ADMIN,
    agencyId,
  };
}

function listItemSubscriptionFlags(row: {
  sub_status: AgencySubscriptionStatus['status'] | null;
  trial_ends_at: Date | null;
  current_period_end: Date | null;
}): { subscriptionActive: boolean; daysRemaining: number | null } {
  if (!row.sub_status) return { subscriptionActive: false, daysRemaining: null };
  const now = Date.now();
  if (row.sub_status === 'active') {
    const end = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
    return {
      subscriptionActive: end === null || end >= now,
      daysRemaining: end === null ? null : Math.max(0, Math.ceil((end - now) / 86400000)),
    };
  }
  if (row.sub_status === 'trial' && row.trial_ends_at) {
    const end = new Date(row.trial_ends_at).getTime();
    return {
      subscriptionActive: end >= now,
      daysRemaining: Math.max(0, Math.ceil((end - now) / 86400000)),
    };
  }
  return { subscriptionActive: false, daysRemaining: null };
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  await ensureAgencyStatusColumn();
  await ensureUserDisabledAtColumn();

  const [agencyRows] = await pool.query<
    Array<{ total: number; active: number; suspended: number } & RowDataPacket>
  >(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'active') AS active,
       SUM(status = 'suspended') AS suspended
     FROM agencies`
  );

  const [subRows] = await pool.query<
    Array<{
      trials_active: number;
      trials_expired: number;
      subs_active: number;
    } & RowDataPacket>
  >(
    `SELECT
       SUM(status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at >= NOW(3)) AS trials_active,
       SUM(status = 'trial' AND (trial_ends_at IS NULL OR trial_ends_at < NOW(3))) AS trials_expired,
       SUM(status = 'active' AND (current_period_end IS NULL OR current_period_end >= NOW(3))) AS subs_active
     FROM agency_subscriptions`
  );

  const [userRows] = await pool.query<Array<{ cnt: number } & RowDataPacket>>(
    'SELECT COUNT(*) AS cnt FROM users WHERE disabled_at IS NULL'
  );

  const [orderRows] = await pool.query<Array<{ status: string; cnt: number } & RowDataPacket>>(
    `SELECT status, COUNT(*) AS cnt FROM orders WHERE archived = 0 GROUP BY status`
  );

  const ordersByStatus: Record<string, number> = {
    pending: 0,
    assigned: 0,
    delivering: 0,
    delivered: 0,
    cancelled: 0,
  };
  for (const row of orderRows) {
    ordersByStatus[row.status] = Number(row.cnt);
  }

  return {
    agenciesTotal: Number(agencyRows[0]?.total ?? 0),
    agenciesActive: Number(agencyRows[0]?.active ?? 0),
    agenciesSuspended: Number(agencyRows[0]?.suspended ?? 0),
    trialsActive: Number(subRows[0]?.trials_active ?? 0),
    trialsExpired: Number(subRows[0]?.trials_expired ?? 0),
    subscriptionsActive: Number(subRows[0]?.subs_active ?? 0),
    usersTotal: Number(userRows[0]?.cnt ?? 0),
    ordersByStatus,
  };
}

export async function listPlatformAgencies(params: {
  q?: string;
  status?: 'active' | 'suspended' | 'all';
  subscription?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'all';
  limit?: number;
  offset?: number;
}): Promise<{ items: PlatformAgencyListItem[]; total: number }> {
  await ensureAgencyStatusColumn();
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const where: string[] = [];
  const values: unknown[] = [];

  if (params.status && params.status !== 'all') {
    where.push('a.status = ?');
    values.push(params.status);
  }
  if (params.q?.trim()) {
    const like = `%${params.q.trim()}%`;
    where.push('(a.name LIKE ? OR a.city LIKE ? OR a.contact_email LIKE ? OR a.id LIKE ?)');
    values.push(like, like, like, like);
  }
  if (params.subscription && params.subscription !== 'all') {
    where.push('s.status = ?');
    values.push(params.subscription);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [countRows] = await pool.query<Array<{ cnt: number } & RowDataPacket>>(
    `SELECT COUNT(*) AS cnt
     FROM agencies a
     LEFT JOIN agency_subscriptions s ON s.agency_id = a.id
     ${whereSql}`,
    values
  );

  const [rows] = await pool.query<
    Array<{
      id: string;
      name: string;
      city: string | null;
      status: 'active' | 'suspended';
      contact_email: string | null;
      created_at: Date | null;
      sub_status: AgencySubscriptionStatus['status'] | null;
      trial_ends_at: Date | null;
      current_period_end: Date | null;
    } & RowDataPacket>
  >(
    `SELECT a.id, a.name, a.city, a.status, a.contact_email, a.created_at,
            s.status AS sub_status, s.trial_ends_at, s.current_period_end
     FROM agencies a
     LEFT JOIN agency_subscriptions s ON s.agency_id = a.id
     ${whereSql}
     ORDER BY a.created_at DESC, a.name ASC
     LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  const agencyIds = rows.map((row) => row.id);
  const ownersByAgency = new Map<string, { name: string; username: string }>();
  const sellersByAgency = new Map<string, number>();
  const repartidoresByAgency = new Map<string, number>();
  const openOrdersByAgency = new Map<string, number>();

  if (agencyIds.length > 0) {
    const placeholders = agencyIds.map(() => '?').join(', ');

    const [ownerRows] = await pool.query<
      Array<{ agency_id: string; name: string; username: string } & RowDataPacket>
    >(
      `SELECT u.agency_id, u.name, u.username
       FROM users u
       INNER JOIN (
         SELECT agency_id, MIN(id) AS id
         FROM users
         WHERE agency_id IN (${placeholders}) AND role = ?
         GROUP BY agency_id
       ) first_owner ON first_owner.id = u.id`,
      [...agencyIds, UserRole.SUPER_ADMIN]
    );
    for (const owner of ownerRows) {
      ownersByAgency.set(owner.agency_id, { name: owner.name, username: owner.username });
    }

    const [roleCountRows] = await pool.query<
      Array<{ agency_id: string; role: UserRole; cnt: number } & RowDataPacket>
    >(
      `SELECT agency_id, role, COUNT(*) AS cnt
       FROM users
       WHERE agency_id IN (${placeholders}) AND role IN (?, ?)
       GROUP BY agency_id, role`,
      [...agencyIds, UserRole.STORE_ADMIN, UserRole.REPARTIDOR]
    );
    for (const row of roleCountRows) {
      const n = Number(row.cnt);
      if (row.role === UserRole.STORE_ADMIN) sellersByAgency.set(row.agency_id, n);
      else if (row.role === UserRole.REPARTIDOR) repartidoresByAgency.set(row.agency_id, n);
    }

    const [openOrderRows] = await pool.query<
      Array<{ agency_id: string; cnt: number } & RowDataPacket>
    >(
      `SELECT agency_id, COUNT(*) AS cnt
       FROM orders
       WHERE agency_id IN (${placeholders})
         AND archived = 0
         AND status IN (?, ?, ?)
       GROUP BY agency_id`,
      [
        ...agencyIds,
        OrderStatus.PENDING,
        OrderStatus.ASSIGNED,
        OrderStatus.DELIVERING,
      ]
    );
    for (const row of openOrderRows) {
      openOrdersByAgency.set(row.agency_id, Number(row.cnt));
    }
  }

  const items: PlatformAgencyListItem[] = rows.map((row) => {
    const owner = ownersByAgency.get(row.id);
    const { subscriptionActive, daysRemaining } = listItemSubscriptionFlags(row);
    return {
      id: row.id,
      name: row.name,
      city: row.city,
      status: row.status === 'suspended' ? 'suspended' : 'active',
      contactEmail: row.contact_email,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.username ?? null,
      sellers: sellersByAgency.get(row.id) ?? 0,
      repartidores: repartidoresByAgency.get(row.id) ?? 0,
      openOrders: openOrdersByAgency.get(row.id) ?? 0,
      subscriptionStatus: row.sub_status,
      subscriptionActive,
      daysRemaining,
    };
  });

  return { total: Number(countRows[0]?.cnt ?? 0), items };
}

export async function getPlatformAgencyDetail(agencyId: string): Promise<PlatformAgencyDetail> {
  const agency = await getAgencyById(agencyId);
  if (!agency) throw new Error('NOT_FOUND');

  const subscription = await getAgencySubscriptionStatus(agencyId);
  const sellers = await listSellers(agencyId);
  const repartidores = await getRepartidores(agencyId);

  const [adminRows] = await pool.query<
    Array<{
      id: string;
      username: string;
      name: string;
      role: UserRole;
      agency_id: string | null;
      disabled_at: Date | null;
      current_lat: number | null;
      current_lng: number | null;
      location_updated_at: Date | null;
      departure_address: string | null;
      departure_lat: number | null;
      departure_lng: number | null;
      delivery_zone: string | null;
      delivery_deadline_hour: number | null;
    } & RowDataPacket>
  >(
    `SELECT id, username, name, role, agency_id, disabled_at,
            current_lat, current_lng, location_updated_at,
            departure_address, departure_lat, departure_lng,
            delivery_zone, delivery_deadline_hour
     FROM users
     WHERE agency_id = ? AND role IN (?, ?)
     ORDER BY role, name`,
    [agencyId, UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN]
  );
  const owners: User[] = [];
  const logisticsAdmins: User[] = [];
  for (const row of adminRows) {
    const user: User = {
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      agencyId: row.agency_id ?? null,
      agencyName: agency.name,
      disabledAt: row.disabled_at ? new Date(row.disabled_at).toISOString() : null,
      deliveryZone: row.delivery_zone,
      deliveryDeadlineHour: row.delivery_deadline_hour,
    };
    if (row.current_lat != null && row.current_lng != null && row.location_updated_at) {
      user.currentLocation = {
        lat: Number(row.current_lat),
        lng: Number(row.current_lng),
        timestamp: new Date(row.location_updated_at).toISOString(),
      };
    }
    if (row.departure_address && row.departure_lat != null && row.departure_lng != null) {
      user.departurePoint = {
        address: row.departure_address,
        lat: Number(row.departure_lat),
        lng: Number(row.departure_lng),
      };
    }
    if (user.role === UserRole.SUPER_ADMIN) owners.push(user);
    else logisticsAdmins.push(user);
  }

  const [orderRows] = await pool.query<Array<{ status: string; cnt: number } & RowDataPacket>>(
    `SELECT status, COUNT(*) AS cnt FROM orders WHERE agency_id = ? AND archived = 0 GROUP BY status`,
    [agencyId]
  );
  const ordersByStatus: Record<string, number> = {
    pending: 0,
    assigned: 0,
    delivering: 0,
    delivered: 0,
    cancelled: 0,
  };
  let ordersTotal = 0;
  let ordersOpen = 0;
  for (const row of orderRows) {
    const n = Number(row.cnt);
    ordersByStatus[row.status] = n;
    ordersTotal += n;
    if (
      row.status === OrderStatus.PENDING ||
      row.status === OrderStatus.ASSIGNED ||
      row.status === OrderStatus.DELIVERING
    ) {
      ordersOpen += n;
    }
  }

  const zones = await listZonesForAgency(agencyId);
  const priceLists = await listPriceLists(agencyId);

  return {
    agency,
    subscription,
    owners,
    sellers,
    repartidores,
    logisticsAdmins,
    counts: {
      sellers: sellers.length,
      repartidores: repartidores.length,
      logisticsAdmins: logisticsAdmins.length,
      owners: owners.length,
      ordersTotal,
      ordersOpen,
      zones: zones.length,
      priceLists: priceLists.length,
    },
    ordersByStatus,
  };
}

export async function createPlatformAgency(
  actor: User,
  data: {
    name: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    cuit?: string | null;
    city?: string | null;
    ownerName: string;
    ownerEmail: string;
    ownerPassword: string;
  }
): Promise<{ agency: Agency; owner: User }> {
  if (!data.name.trim()) throw new Error('NAME_REQUIRED');
  if (!data.ownerName.trim()) throw new Error('OWNER_NAME_REQUIRED');
  const ownerEmail = data.ownerEmail.trim().toLowerCase();
  if (!isValidEmail(ownerEmail)) throw new Error('INVALID_EMAIL');
  if (!data.ownerPassword || data.ownerPassword.length < 6) throw new Error('PASSWORD_SHORT');

  const agency = await createAgency({
    name: data.name,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    cuit: data.cuit,
    city: data.city,
  });

  const owner = await createUser({
    username: ownerEmail,
    password: data.ownerPassword,
    name: data.ownerName,
    role: UserRole.SUPER_ADMIN,
    agencyId: agency.id,
    emailVerified: true,
  });

  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId: agency.id,
    entityType: 'agency',
    entityId: agency.id,
    action: 'create',
    summary: `Alta de agencia ${agency.name} (dueño ${owner.username})`,
  });

  return { agency, owner };
}

export async function updatePlatformAgency(
  actor: User,
  agencyId: string,
  data: {
    name?: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    cuit?: string | null;
    city?: string | null;
    deliveryDeadlineHour?: number;
  }
): Promise<Agency> {
  const updated = await updateAgencyProfile(agencyId, data);
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'agency',
    entityId: agencyId,
    action: 'update',
    summary: `Actualización de ficha ${updated.name}`,
  });
  return updated;
}

/**
 * Elimina una agencia y TODO lo asociado (usuarios, pedidos, zonas, precios,
 * suscripción, facturación, integraciones). Irreversible.
 *
 * `users` y `orders` no tienen ON DELETE CASCADE hacia `agencies`, así que se
 * borran a mano dentro de una transacción; el resto cae por cascada de FK.
 */
export async function deletePlatformAgency(
  actor: User,
  agencyId: string
): Promise<{ name: string; deletedOrders: number; deletedUsers: number }> {
  const agency = await getAgencyById(agencyId);
  if (!agency) throw new Error('NOT_FOUND');

  // El dueño de Posta nunca pertenece a una agencia, pero por las dudas.
  if (actor.agencyId === agencyId) throw new Error('CANNOT_DELETE_OWN_AGENCY');

  const conn = await pool.getConnection();
  let deletedOrders = 0;
  let deletedUsers = 0;
  try {
    await conn.beginTransaction();

    const [userRows] = await conn.query<Array<{ id: string } & RowDataPacket>>(
      'SELECT id FROM users WHERE agency_id = ?',
      [agencyId]
    );
    const userIds = userRows.map((r) => r.id);

    // Pedidos: order_history / order_location_history caen por cascada;
    // notifications.order_id queda en NULL por el FK.
    const [ordersResult] = await conn.query<ResultSetHeader>(
      'DELETE FROM orders WHERE agency_id = ?',
      [agencyId]
    );
    deletedOrders = ordersResult.affectedRows;

    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      // Pedidos de otros tenants asignados a estos usuarios no deberían existir,
      // pero los FKs de orders.seller_id/repartidor_id no tienen cascada:
      await conn.query(
        `UPDATE orders SET repartidor_id = NULL WHERE repartidor_id IN (${placeholders})`,
        userIds
      );
      await conn.query(
        `UPDATE orders SET seller_id = NULL WHERE seller_id IN (${placeholders})`,
        userIds
      );
      // notifications / notification_dismissals no tienen FK por user_id.
      await conn.query(
        `DELETE FROM notifications WHERE user_id IN (${placeholders})`,
        userIds
      );
      try {
        await conn.query(
          `DELETE FROM notification_dismissals WHERE user_id IN (${placeholders})`,
          userIds
        );
      } catch {
        /* tabla puede no existir en instalaciones viejas */
      }
      const [usersResult] = await conn.query<ResultSetHeader>(
        `DELETE FROM users WHERE id IN (${placeholders})`,
        userIds
      );
      deletedUsers = usersResult.affectedRows;
    }

    // Cascadas de agencies: delivery_zones, price_lists (+zone_rates),
    // agency_subscriptions, agency_mercadopago_accounts, billing/driver ledgers,
    // billing/subscription payment intents.
    await conn.query('DELETE FROM agencies WHERE id = ?', [agencyId]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'agency',
    entityId: agencyId,
    action: 'delete',
    summary: `Agencia ${agency.name} eliminada definitivamente (${deletedUsers} usuarios, ${deletedOrders} pedidos)`,
  });

  return { name: agency.name, deletedOrders, deletedUsers };
}

export async function setPlatformAgencyStatus(
  actor: User,
  agencyId: string,
  status: 'active' | 'suspended'
): Promise<Agency> {
  const updated = await setAgencyStatus(agencyId, status);
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'agency',
    entityId: agencyId,
    action: status === 'suspended' ? 'suspend' : 'reactivate',
    summary:
      status === 'suspended'
        ? `Agencia ${updated.name} suspendida`
        : `Agencia ${updated.name} reactivada`,
  });
  return updated;
}

export async function updatePlatformSubscription(
  actor: User,
  agencyId: string,
  data: {
    status?: 'trial' | 'active' | 'past_due' | 'cancelled';
    planId?: string | null;
    trialEndsAt?: string | null;
    currentPeriodEnd?: string | null;
    extendTrialDays?: number;
  }
): Promise<AgencySubscriptionStatus> {
  if (!(await getAgencyById(agencyId))) throw new Error('NOT_FOUND');
  const updated = await adminUpdateAgencySubscription(agencyId, data);
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'subscription',
    entityId: agencyId,
    action: 'subscription_update',
    summary: `Suscripción → ${updated.status} (activo=${updated.isActive})`,
  });
  return updated;
}

export async function listPlatformUsers(
  agencyId: string,
  role?: UserRole
): Promise<User[]> {
  if (!(await getAgencyById(agencyId))) throw new Error('NOT_FOUND');
  await ensureUserDisabledAtColumn();
  const values: unknown[] = [agencyId];
  let sql = `SELECT id FROM users WHERE agency_id = ?`;
  if (role) {
    sql += ' AND role = ?';
    values.push(role);
  }
  sql += ' ORDER BY role, name';
  const [rows] = await pool.query<Array<{ id: string } & RowDataPacket>>(sql, values);
  const users: User[] = [];
  for (const row of rows) {
    const user = await getUserById(row.id);
    if (user) users.push(user);
  }
  return users;
}

export async function createPlatformUser(
  actor: User,
  agencyId: string,
  data: {
    name: string;
    username: string;
    password: string;
    role: UserRole;
    deliveryZone?: string | null;
  }
): Promise<User> {
  if (!(await getAgencyById(agencyId))) throw new Error('NOT_FOUND');
  if (
    data.role !== UserRole.SUPER_ADMIN &&
    data.role !== UserRole.LOGISTICS_ADMIN &&
    data.role !== UserRole.STORE_ADMIN &&
    data.role !== UserRole.REPARTIDOR
  ) {
    throw new Error('INVALID_ROLE');
  }
  const user = await createUser({
    username: data.username,
    password: data.password,
    name: data.name,
    role: data.role,
    agencyId,
    deliveryZone: data.deliveryZone,
    emailVerified: true,
  });
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'user',
    entityId: user.id,
    action: 'create',
    summary: `Alta usuario ${user.username} (${user.role})`,
  });
  return user;
}

export async function updatePlatformUser(
  actor: User,
  agencyId: string,
  userId: string,
  data: { name?: string; username?: string; deliveryZone?: string | null }
): Promise<User> {
  const user = await getUserById(userId);
  if (!user || user.agencyId !== agencyId) throw new Error('NOT_FOUND');

  if (user.role === UserRole.STORE_ADMIN) {
    const updated = await updateSeller(
      userId,
      {
        name: data.name ?? user.name,
        username: data.username,
      },
      agencyId
    );
    await recordPlatformAudit({
      actorUserId: actor.id,
      actorEmail: actor.username,
      agencyId,
      entityType: 'user',
      entityId: userId,
      action: 'update',
      summary: `Actualización vendedor ${updated.username}`,
    });
    return updated;
  }

  if (data.name?.trim()) {
    await pool.query('UPDATE users SET name = ? WHERE id = ?', [data.name.trim(), userId]);
  }
  if (data.username?.trim()) {
    const username = data.username.trim().toLowerCase();
    if (!isValidEmail(username)) throw new Error('INVALID_EMAIL');
    if (isPlatformOwnerEmail(user.username) && username !== user.username) {
      throw new Error('CANNOT_CHANGE_PLATFORM_OWNER_EMAIL');
    }
    await pool.query('UPDATE users SET username = ? WHERE id = ?', [username, userId]);
  }
  if (data.deliveryZone !== undefined && user.role === UserRole.REPARTIDOR) {
    await pool.query('UPDATE users SET delivery_zone = ? WHERE id = ?', [
      data.deliveryZone,
      userId,
    ]);
  }

  const updated = await getUserById(userId);
  if (!updated) throw new Error('NOT_FOUND');
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'user',
    entityId: userId,
    action: 'update',
    summary: `Actualización usuario ${updated.username}`,
  });
  return updated;
}

export async function resetPlatformUserPassword(
  actor: User,
  agencyId: string,
  userId: string,
  password: string
): Promise<void> {
  if (password.length < 6) throw new Error('PASSWORD_SHORT');
  const user = await getUserById(userId);
  if (!user || user.agencyId !== agencyId) throw new Error('NOT_FOUND');

  if (user.role === UserRole.STORE_ADMIN) {
    await updateSellerPassword(userId, password, agencyId);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
  }

  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'user',
    entityId: userId,
    action: 'password_reset',
    summary: `Reset password ${user.username}`,
  });
}

export async function setPlatformUserDisabled(
  actor: User,
  agencyId: string,
  userId: string,
  disabled: boolean
): Promise<User> {
  await ensureUserDisabledAtColumn();
  const user = await getUserById(userId);
  if (!user || user.agencyId !== agencyId) throw new Error('NOT_FOUND');
  if (user.id === actor.id) throw new Error('CANNOT_DISABLE_SELF');
  if (isPlatformOwnerEmail(user.username) && disabled) {
    throw new Error('CANNOT_DISABLE_PLATFORM_OWNER');
  }

  await pool.query('UPDATE users SET disabled_at = ? WHERE id = ?', [
    disabled ? new Date() : null,
    userId,
  ]);
  const updated = await getUserById(userId);
  if (!updated) throw new Error('NOT_FOUND');
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'user',
    entityId: userId,
    action: disabled ? 'disable' : 'enable',
    summary: `${disabled ? 'Deshabilitado' : 'Habilitado'} ${updated.username}`,
  });
  return updated;
}

export async function listPlatformOrders(params: {
  agencyId?: string;
  status?: OrderStatus;
  q?: string;
  archived?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ items: Order[]; total: number }> {
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const where: string[] = [];
  const values: unknown[] = [];

  if (params.agencyId) {
    where.push('agency_id = ?');
    values.push(params.agencyId);
  }
  if (params.status) {
    where.push('status = ?');
    values.push(params.status);
  }
  if (params.archived === true) {
    where.push('archived = 1');
  } else if (params.archived === false) {
    where.push('archived = 0');
  }
  if (params.q?.trim()) {
    const like = `%${params.q.trim()}%`;
    where.push('(id LIKE ? OR client_name LIKE ? OR address LIKE ? OR client_phone LIKE ?)');
    values.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [countRows] = await pool.query<Array<{ cnt: number } & RowDataPacket>>(
    `SELECT COUNT(*) AS cnt FROM orders ${whereSql}`,
    values
  );
  const [rows] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    `SELECT id FROM orders ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  const items: Order[] = [];
  for (const row of rows) {
    const order = await getOrderById(row.id);
    if (order) items.push(order);
  }
  return { total: Number(countRows[0]?.cnt ?? 0), items };
}

export async function updatePlatformOrderStatus(
  actor: User,
  orderId: string,
  status: OrderStatus,
  repartidorId?: string,
  comment?: string
): Promise<Order> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error('NOT_FOUND');
  const agencyId = order.agencyId;
  if (!agencyId) throw new Error('NO_AGENCY');

  const updated = await updateOrderStatus(
    actorAgencyAdmin(actor, agencyId),
    orderId,
    status,
    repartidorId,
    comment ?? `Actualizado desde panel Posta`
  );

  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'order',
    entityId: orderId,
    action: status === OrderStatus.CANCELLED ? 'cancel' : 'update',
    summary: `Pedido ${orderId} → ${status}`,
  });
  return updated;
}

export async function archivePlatformOrder(
  actor: User,
  orderId: string,
  archived: boolean
): Promise<Order> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error('NOT_FOUND');
  const agencyId = order.agencyId;
  if (!agencyId) throw new Error('NO_AGENCY');

  const updated = await setOrderArchived(
    actorAgencyAdmin(actor, agencyId),
    orderId,
    archived
  );
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'order',
    entityId: orderId,
    action: 'archive',
    summary: `Pedido ${orderId} ${archived ? 'archivado' : 'desarchivado'}`,
  });
  return updated;
}

export async function listPlatformZones(agencyId: string): Promise<DeliveryZone[]> {
  if (!(await getAgencyById(agencyId))) throw new Error('NOT_FOUND');
  return listZonesForAgency(agencyId);
}

export async function createPlatformZone(
  actor: User,
  agencyId: string,
  data: Parameters<typeof createZone>[1]
): Promise<DeliveryZone> {
  if (!(await getAgencyById(agencyId))) throw new Error('NOT_FOUND');
  const zone = await createZone(agencyId, data);
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'zone',
    entityId: zone.id,
    action: 'create',
    summary: `Alta zona ${zone.name}`,
  });
  return zone;
}

export async function updatePlatformZone(
  actor: User,
  agencyId: string,
  zoneId: string,
  data: Parameters<typeof updateZone>[2]
): Promise<DeliveryZone> {
  const zone = await updateZone(agencyId, zoneId, data);
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'zone',
    entityId: zoneId,
    action: 'update',
    summary: `Actualización zona ${zone.name}`,
  });
  return zone;
}

export async function updatePlatformZoneRates(
  actor: User,
  agencyId: string,
  zoneId: string,
  data: {
    flex?: number;
    express?: number;
    standard?: number;
    driverFlex?: number;
    driverExpress?: number;
    driverStandard?: number;
  }
): Promise<DeliveryZone> {
  const zone = await updateZoneShippingRates(agencyId, zoneId, data);
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'zone',
    entityId: zoneId,
    action: 'update',
    summary: `Tarifas zona ${zone.name}`,
  });
  return zone;
}

export async function deletePlatformZone(
  actor: User,
  agencyId: string,
  zoneId: string
): Promise<void> {
  await deleteZone(agencyId, zoneId);
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'zone',
    entityId: zoneId,
    action: 'delete',
    summary: `Baja zona ${zoneId}`,
  });
}

export async function listPlatformPriceLists(agencyId: string) {
  if (!(await getAgencyById(agencyId))) throw new Error('NOT_FOUND');
  return listPriceLists(agencyId);
}

export async function getPlatformPriceList(agencyId: string, listId: string) {
  const list = await getPriceList(agencyId, listId);
  if (!list) throw new Error('NOT_FOUND');
  return list;
}

export async function createPlatformPriceList(
  actor: User,
  agencyId: string,
  data: { name: string; cloneFromId?: string | null }
) {
  if (!(await getAgencyById(agencyId))) throw new Error('NOT_FOUND');
  const list = await createPriceList(actorAgencyAdmin(actor, agencyId), data);
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'price_list',
    entityId: list.id,
    action: 'create',
    summary: `Alta lista ${list.name}`,
  });
  return list;
}

export async function updatePlatformPriceList(
  actor: User,
  agencyId: string,
  listId: string,
  data: {
    name?: string;
    outsideShipping?: Partial<{ flex: number; express: number; standard: number }>;
    outsideDriverPay?: Partial<{ flex: number; express: number; standard: number }>;
    zoneRates?: Array<{
      zoneKey: string;
      shipping?: Partial<{ flex: number; express: number; standard: number }>;
      driverPay?: Partial<{ flex: number; express: number; standard: number }>;
    }>;
  }
) {
  if (!(await getAgencyById(agencyId))) throw new Error('NOT_FOUND');
  const list = await updatePriceList(actorAgencyAdmin(actor, agencyId), listId, data);
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'price_list',
    entityId: listId,
    action: 'update',
    summary: `Actualización lista ${list.name}`,
  });
  return list;
}

export async function deletePlatformPriceList(
  actor: User,
  agencyId: string,
  listId: string
): Promise<void> {
  await deletePriceList(actorAgencyAdmin(actor, agencyId), listId);
  await recordPlatformAudit({
    actorUserId: actor.id,
    actorEmail: actor.username,
    agencyId,
    entityType: 'price_list',
    entityId: listId,
    action: 'delete',
    summary: `Baja lista ${listId}`,
  });
}

export { listSubscriptionPlans };
