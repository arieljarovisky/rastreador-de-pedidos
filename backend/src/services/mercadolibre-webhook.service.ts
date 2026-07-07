import { RowDataPacket } from 'mysql2';
import { Order, OrderStatus, User, UserRole } from '../types/index.js';
import { env } from '../config/env.js';
import { pool } from '../config/database.js';
import {
  findMercadoLibreIntegrationByMlUserId,
  type StoreIntegration,
} from './integrations.service.js';
import {
  fetchMercadoLibreFlexShipment,
  fetchMercadoLibreFlexShipmentByShipmentId,
  fetchMercadoLibreOrder,
  fetchMercadoLibreShipment,
  fetchMercadoLibreResource,
  fetchMercadoLibreMissedFeeds,
  findImportedMercadoLibreFlex,
  findImportedMercadoLibreFlexGlobal,
  findImportedMercadoLibreRefGlobal,
  formatMlShipmentStatusLabel,
  getValidMercadoLibreIntegration,
  mapMercadoLibreShipmentToOrderStatus,
  parseMercadoLibreNotificationResource,
  type MercadoLibreFlexShipment,
  type MlFlexAssignment,
} from './mercadolibre.service.js';
import { geocodeAddress } from './geocode.service.js';
import {
  appendOrderMarketplaceComment,
  assignOrderToRepartidorFromMarketplace,
  createOrder,
  findOrderByExternalGlobal,
  getSellerIdForOrder,
  updateOrderStatusFromMarketplace,
} from './orders.service.js';
import { getRepartidorByMercadoLibreUserId, getUserById } from './users.service.js';
import { getAgencyOperatorForImport, isAgencyMlBridgeUser } from './agency-ml.service.js';
import { createNotification } from './notifications.service.js';
import { emitOrderUpdated } from '../realtime/io.js';
import { syncMercadoLibreOrderAfterImport } from './marketplace-import.service.js';

export interface MercadoLibreNotificationPayload {
  _id?: string;
  resource: string;
  user_id: number | string;
  topic: string;
  application_id?: number | string;
  attempts?: number;
  sent?: string;
  received?: string;
}

const recentNotifications = new Map<string, number>();
const DEDUP_TTL_MS = 10 * 60 * 1000;

export const ML_WEBHOOK_TOPICS = ['orders_v2', 'orders', 'shipments', 'flex-handshakes'] as const;

function isDuplicateNotification(id: string | undefined): boolean {
  if (!id) return false;
  const now = Date.now();
  for (const [key, ts] of recentNotifications) {
    if (now - ts > DEDUP_TTL_MS) recentNotifications.delete(key);
  }
  if (recentNotifications.has(id)) return true;
  recentNotifications.set(id, now);
  return false;
}

export function getMercadoLibreWebhookUrl(): string {
  return `${env.publicUrl}/api/integrations/mercadolibre/notifications`;
}

function mapMlShipmentStatusToOrderStatus(
  mlStatus: string,
  currentStatus: OrderStatus,
  hasRepartidor: boolean,
  mlSubstatus?: string | null
): OrderStatus | null {
  return mapMercadoLibreShipmentToOrderStatus(mlStatus, mlSubstatus, {
    hasRepartidor,
    currentStatus,
    onImport: false,
  });
}

async function notifySellerFlexEvent(
  sellerId: string | null,
  order: Order,
  title: string,
  body: string
): Promise<void> {
  if (!sellerId) return;
  await createNotification({
    id: `n_ml_flex_${Date.now()}_${order.id}`,
    userId: sellerId,
    title,
    body,
    type: 'info',
    orderId: order.id,
  });
}

async function importFlexShipment(
  integration: StoreIntegration,
  shipment: MercadoLibreFlexShipment
): Promise<string | null> {
  const seller = await getUserById(integration.userId);
  if (!seller) return null;

  const agencyMode = isAgencyMlBridgeUser(seller);
  const existing = agencyMode
    ? await findImportedMercadoLibreFlexGlobal(shipment)
    : await findImportedMercadoLibreFlex(integration.userId, shipment);
  if (existing) return existing.id;

  let lat = shipment.lat;
  let lng = shipment.lng;
  if (lat === undefined || lng === undefined) {
    const geocoded = await geocodeAddress(shipment.address);
    if (!geocoded) return null;
    lat = geocoded.lat;
    lng = geocoded.lng;
  }

  const orderCreator = agencyMode
    ? (await getAgencyOperatorForImport(seller.agencyId!)) ?? seller
    : seller;

  let order = await createOrder(orderCreator, {
    clientName: shipment.clientName,
    clientPhone: shipment.clientPhone,
    address: shipment.address,
    lat,
    lng,
    notes: shipment.notes,
    externalSource: 'mercadolibre',
    externalOrderId: shipment.externalId,
    shippingType: 'flex',
    sellerId: agencyMode ? undefined : seller.id,
    historyComment: agencyMode
      ? `Importado automáticamente desde ML (cuenta de la agencia) · envío #${shipment.externalId}`
      : undefined,
  });

  order = await syncMercadoLibreOrderAfterImport(integration.userId, order, shipment);

  const sellerId = await getSellerIdForOrder(order.id);
  if (sellerId) {
    await notifySellerFlexEvent(
      sellerId,
      order,
      'Nuevo envío Flex (Mercado Libre)',
      `Se importó automáticamente el envío ML #${shipment.externalId} (orden #${shipment.mlOrderId}) como ${order.id}.`
    );
  }

  emitOrderUpdated(order, sellerId);
  return order.id;
}

async function syncOrderStatus(
  orderId: string,
  nextStatus: OrderStatus,
  mlStatusLabel: string
): Promise<void> {
  const updated = await updateOrderStatusFromMarketplace(
    orderId,
    nextStatus,
    `Sincronizado desde Mercado Libre (${mlStatusLabel})`
  );
  if (!updated) return;

  const sellerId = await getSellerIdForOrder(orderId);
  emitOrderUpdated(updated, sellerId);

  if (nextStatus === OrderStatus.DELIVERED) {
    await createNotification({
      id: `n_ml_delivered_${Date.now()}_${orderId}`,
      userId: sellerId ?? 'all',
      title: 'Entrega confirmada en Mercado Libre',
      body: `El pedido ${orderId} fue marcado como entregado en Mercado Libre.`,
      type: 'order_delivered',
      orderId,
    });
  }
}

async function resolveFlexOrderForShipment(
  integration: StoreIntegration,
  mlShipmentId: string,
  mlShipment: Awaited<ReturnType<typeof fetchMercadoLibreShipment>>
): Promise<Order | null> {
  const mlOrderId = mlShipment.order_id ? String(mlShipment.order_id) : null;
  const owner = await getUserById(integration.userId);
  const agencyMode = owner ? isAgencyMlBridgeUser(owner) : false;

  let existing = await findOrderByExternalGlobal('mercadolibre', mlShipmentId);
  if (!existing && mlOrderId) {
    existing = await findImportedMercadoLibreRefGlobal(mlOrderId, integration.userId);
  }
  if (!existing) {
    const flexByShipment = await fetchMercadoLibreFlexShipmentByShipmentId(
      integration,
      mlShipmentId
    );
    if (flexByShipment) {
      existing = agencyMode
        ? await findImportedMercadoLibreFlexGlobal(flexByShipment)
        : await findImportedMercadoLibreFlex(integration.userId, flexByShipment);
    }
  }

  if (!existing && mlOrderId && mlShipment.status !== 'cancelled' && mlShipment.status !== 'delivered') {
    const flexShipment = await fetchMercadoLibreFlexShipment(integration, mlOrderId);
    if (flexShipment) {
      const importedId = await importFlexShipment(integration, flexShipment);
      if (importedId) {
        existing = agencyMode
          ? await findImportedMercadoLibreFlexGlobal(flexShipment)
          : await findImportedMercadoLibreFlex(integration.userId, flexShipment);
      }
    }
  }

  return existing;
}

async function syncOrderFromMlShipment(
  existing: Order,
  shipment: Awaited<ReturnType<typeof fetchMercadoLibreShipment>>
): Promise<void> {
  if (!shipment.status) return;

  const statusLabel = formatMlShipmentStatusLabel(shipment);
  const next = mapMlShipmentStatusToOrderStatus(
    shipment.status,
    existing.status,
    Boolean(existing.repartidorId),
    shipment.substatus
  );
  if (next) {
    await syncOrderStatus(existing.id, next, statusLabel);
    return;
  }

  const updated = await appendOrderMarketplaceComment(
    existing.id,
    `Actualización ML Flex (${statusLabel})`
  );
  if (!updated) return;
  const sellerId = await getSellerIdForOrder(existing.id);
  emitOrderUpdated(updated, sellerId);
}

async function handleOrderResource(
  integration: StoreIntegration,
  mlOrderId: string
): Promise<void> {
  const validIntegration = await getValidMercadoLibreIntegration(integration.userId);
  const mlOrder = await fetchMercadoLibreOrder(validIntegration, mlOrderId);

  if (mlOrder.status === 'cancelled') {
    const existing = await findImportedMercadoLibreRefGlobal(mlOrderId, integration.userId);
    if (existing) {
      await syncOrderStatus(existing.id, OrderStatus.CANCELLED, 'orden cancelada');
    }
    return;
  }

  if (mlOrder.status !== 'paid') return;

  const flexShipment = await fetchMercadoLibreFlexShipment(validIntegration, mlOrderId);
  if (!flexShipment) return;

  const existing = await findImportedMercadoLibreFlex(integration.userId, flexShipment);
  if (!existing) {
    await importFlexShipment(validIntegration, flexShipment);
    return;
  }

  if (flexShipment.mlShipmentStatus) {
    const next = mapMlShipmentStatusToOrderStatus(
      flexShipment.mlShipmentStatus,
      existing.status,
      Boolean(existing.repartidorId),
      flexShipment.mlShipmentSubstatus
    );
    if (next) {
      const label = formatMlShipmentStatusLabel({
        status: flexShipment.mlShipmentStatus,
        substatus: flexShipment.mlShipmentSubstatus ?? undefined,
      });
      await syncOrderStatus(existing.id, next, label);
    }
  }
}

/** Tópico shipments → GET /shipments/$SHIPMENT_ID (estado/subestado Flex). */
async function handleShipmentResource(
  integration: StoreIntegration,
  mlShipmentId: string
): Promise<void> {
  const validIntegration = await getValidMercadoLibreIntegration(integration.userId);
  const shipment = await fetchMercadoLibreShipment(validIntegration, mlShipmentId);

  if (shipment.logistic_type !== 'self_service') return;

  const existing = await resolveFlexOrderForShipment(validIntegration, mlShipmentId, shipment);
  if (!existing) return;

  await syncOrderFromMlShipment(existing, shipment);
}

/** Mapea driver_id de Flex (o la cuenta ML del webhook) al repartidor Posta de la agencia. */
async function resolveRepartidorForFlexHandshake(
  assignment: MlFlexAssignment | null,
  integration: StoreIntegration,
  agencyId: string | null
): Promise<User | null> {
  if (assignment?.driver_id) {
    const byDriver = await getRepartidorByMercadoLibreUserId(assignment.driver_id, agencyId);
    if (byDriver) return byDriver;
  }

  const scanner = await getUserById(integration.userId);
  if (scanner?.role === UserRole.REPARTIDOR && scanner.agencyId === agencyId) {
    return scanner;
  }

  return null;
}

/** Tópico flex-handshakes → GET assignment/v1 del resource de la notificación. */
async function handleFlexHandshakeResource(
  integration: StoreIntegration,
  resource: string
): Promise<void> {
  const validIntegration = await getValidMercadoLibreIntegration(integration.userId);
  const parsed = parseMercadoLibreNotificationResource(resource);
  const shipmentId = parsed.shipmentId;
  if (!shipmentId) return;

  const assignment =
    (await fetchMercadoLibreResource<MlFlexAssignment>(validIntegration, resource)) ??
    (parsed.siteId
      ? await fetchMercadoLibreResource<MlFlexAssignment>(
          validIntegration,
          `/flex/sites/${parsed.siteId}/shipments/${shipmentId}/assignment/v1`
        )
      : null);

  const shipment = await fetchMercadoLibreShipment(validIntegration, shipmentId);
  if (shipment.logistic_type !== 'self_service') return;

  let existing = await resolveFlexOrderForShipment(validIntegration, shipmentId, shipment);
  if (!existing) return;

  const repartidor = await resolveRepartidorForFlexHandshake(
    assignment,
    integration,
    existing.agencyId ?? null
  );

  const driverNote = repartidor
    ? existing.repartidorId && existing.repartidorId !== repartidor.id
      ? `Handshake Flex · transferido a ${repartidor.name}`
      : `Handshake Flex · colectado por ${repartidor.name}`
    : assignment?.driver_id
      ? `Handshake Flex · transportista ML #${assignment.driver_id}`
      : 'Handshake Flex · colecta o transferencia registrada en ML';
  const statusLabel = formatMlShipmentStatusLabel(shipment);
  const comment = `${driverNote} · estado ${statusLabel}`;

  const updated = await appendOrderMarketplaceComment(existing.id, comment);
  if (updated) {
    existing = updated;
  }

  let assignedToRepartidor = false;
  if (repartidor) {
    const repartidorIdBefore = existing.repartidorId;
    const isTransfer = Boolean(repartidorIdBefore && repartidorIdBefore !== repartidor.id);
    const assignComment = isTransfer
      ? `Reasignado por escaneo en Mercado Envíos Flex (último escaneo)`
      : 'Asignado automáticamente por escaneo en Mercado Envíos Flex';
    const assignedOrder = await assignOrderToRepartidorFromMarketplace(
      existing.id,
      repartidor.id,
      assignComment
    );
    if (assignedOrder?.repartidorId === repartidor.id) {
      existing = assignedOrder;
      assignedToRepartidor = repartidorIdBefore !== repartidor.id;
      if (assignedToRepartidor) {
        await createNotification({
          id: `n_ml_flex_assign_${Date.now()}_${existing.id}`,
          userId: repartidor.id,
          title: isTransfer ? 'Pedido transferido (Flex)' : 'Pedido asignado (Flex)',
          body: isTransfer
            ? `El envío ${existing.id} quedó asignado a vos por el último escaneo en Mercado Envíos Flex.`
            : `Se te asignó el pedido ${existing.id} por escaneo en Mercado Envíos Flex.`,
          type: 'order_assigned',
          orderId: existing.id,
        });
        if (isTransfer && repartidorIdBefore) {
          await createNotification({
            id: `n_ml_flex_unassign_${Date.now()}_${existing.id}`,
            userId: repartidorIdBefore,
            title: 'Pedido transferido (Flex)',
            body: `El envío ${existing.id} fue escaneado por ${repartidor.name} y ya no está asignado a vos.`,
            type: 'info',
            orderId: existing.id,
          });
        }
      }
    }
  }

  const sellerId = await getSellerIdForOrder(existing.id);
  emitOrderUpdated(existing, sellerId);
  await notifySellerFlexEvent(
    sellerId,
    existing,
    assignedToRepartidor ? 'Colecta Flex — repartidor asignado' : 'Colecta Flex en Mercado Libre',
    assignedToRepartidor && repartidor
      ? `Tu envío ${existing.id} (ML #${shipmentId}) fue colectado por ${repartidor.name} en Flex.`
      : `Tu envío ${existing.id} (ML #${shipmentId}) fue escaneado o transferido en Flex.`
  );

  await syncOrderFromMlShipment(existing, shipment);
}

export async function processMercadoLibreNotification(
  payload: MercadoLibreNotificationPayload
): Promise<void> {
  if (isDuplicateNotification(payload._id)) return;

  const integration = await findMercadoLibreIntegrationByMlUserId(payload.user_id);
  if (!integration) {
    console.warn('[ml-webhook] Sin integración para user_id', payload.user_id);
    return;
  }

  const resource = payload.resource?.trim();
  if (!resource) return;

  console.log(
    `[ml-webhook] ${payload.topic} user=${payload.user_id} resource=${resource}`
  );

  const parsed = parseMercadoLibreNotificationResource(resource);
  const orderFromResource = resource.match(/\/orders\/(\d+)/i)?.[1];
  const mlOrderId = parsed.mlOrderId ?? orderFromResource;
  const shipmentId = parsed.shipmentId;

  try {
    if (payload.topic === 'flex-handshakes') {
      await handleFlexHandshakeResource(integration, resource);
      return;
    }

    if (payload.topic === 'orders_v2' || payload.topic === 'orders') {
      if (mlOrderId) {
        await handleOrderResource(integration, mlOrderId);
      }
      return;
    }

    if (payload.topic === 'shipments') {
      if (shipmentId) {
        await handleShipmentResource(integration, shipmentId);
        return;
      }
      if (mlOrderId) {
        await handleOrderResource(integration, mlOrderId);
      }
    }
  } catch (err) {
    console.error('[ml-webhook] Error procesando notificación:', err);
  }
}

/** Reprocesa notificaciones perdidas reportadas por ML (missed_feeds). */
export async function replayMercadoLibreMissedFeeds(options?: {
  topic?: string;
  limit?: number;
}): Promise<{ replayed: number; errors: number }> {
  if (!env.mercadolibre.appId) {
    return { replayed: 0, errors: 0 };
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT user_id FROM store_integrations WHERE platform = 'mercadolibre' LIMIT 1`
  );
  const anyUserId = rows[0]?.user_id as string | undefined;
  if (!anyUserId) return { replayed: 0, errors: 0 };

  let validIntegration: StoreIntegration;
  try {
    validIntegration = await getValidMercadoLibreIntegration(anyUserId);
  } catch {
    return { replayed: 0, errors: 0 };
  }

  const messages = await fetchMercadoLibreMissedFeeds(validIntegration, {
    topic: options?.topic,
    limit: options?.limit ?? 50,
  });

  let replayed = 0;
  let errors = 0;

  for (const message of messages) {
    try {
      await processMercadoLibreNotification(message as MercadoLibreNotificationPayload);
      replayed++;
    } catch {
      errors++;
    }
  }

  return { replayed, errors };
}
