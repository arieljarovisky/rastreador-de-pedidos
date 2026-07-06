import { RowDataPacket } from 'mysql2';
import { Order, OrderStatus } from '../types/index.js';
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
  findImportedMercadoLibreRefGlobal,
  formatMlShipmentStatusLabel,
  getValidMercadoLibreIntegration,
  parseMercadoLibreNotificationResource,
  type MercadoLibreFlexShipment,
  type MlFlexAssignment,
} from './mercadolibre.service.js';
import { geocodeAddress } from './geocode.service.js';
import {
  appendOrderMarketplaceComment,
  createOrder,
  findOrderByExternalGlobal,
  getSellerIdForOrder,
  updateOrderStatusFromMarketplace,
} from './orders.service.js';
import { getUserById } from './users.service.js';
import { createNotification } from './notifications.service.js';
import { emitOrderUpdated } from '../realtime/io.js';

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
  hasRepartidor: boolean
): OrderStatus | null {
  const normalized = mlStatus.toLowerCase();

  if (normalized === 'delivered') return OrderStatus.DELIVERED;
  if (normalized === 'cancelled') return OrderStatus.CANCELLED;

  if (
    ['shipped', 'in_transit', 'out_for_delivery', 'on_route', 'handling'].includes(normalized)
  ) {
    if (hasRepartidor && (currentStatus === OrderStatus.ASSIGNED || currentStatus === OrderStatus.DELIVERING)) {
      return OrderStatus.DELIVERING;
    }
    return null;
  }

  return null;
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

  const existing = await findImportedMercadoLibreFlex(integration.userId, shipment);
  if (existing) return existing.id;

  let lat = shipment.lat;
  let lng = shipment.lng;
  if (lat === undefined || lng === undefined) {
    const geocoded = await geocodeAddress(shipment.address);
    if (!geocoded) return null;
    lat = geocoded.lat;
    lng = geocoded.lng;
  }

  const order = await createOrder(seller, {
    clientName: shipment.clientName,
    clientPhone: shipment.clientPhone,
    address: shipment.address,
    lat,
    lng,
    notes: shipment.notes,
    externalSource: 'mercadolibre',
    externalOrderId: shipment.externalId,
    shippingType: 'flex',
  });

  const sellerId = await getSellerIdForOrder(order.id);
  await notifySellerFlexEvent(
    sellerId,
    order,
    'Nuevo envío Flex (Mercado Libre)',
    `Se importó automáticamente el envío ML #${shipment.externalId} (orden #${shipment.mlOrderId}) como ${order.id}.`
  );

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
      existing = await findImportedMercadoLibreFlex(integration.userId, flexByShipment);
    }
  }

  if (!existing && mlOrderId && mlShipment.status !== 'cancelled' && mlShipment.status !== 'delivered') {
    const flexShipment = await fetchMercadoLibreFlexShipment(integration, mlOrderId);
    if (flexShipment) {
      const importedId = await importFlexShipment(integration, flexShipment);
      if (importedId) {
        existing = await findImportedMercadoLibreFlex(integration.userId, flexShipment);
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
    Boolean(existing.repartidorId)
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
      Boolean(existing.repartidorId)
    );
    if (next) {
      await syncOrderStatus(existing.id, next, flexShipment.mlShipmentStatus);
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

  const driverNote = assignment?.driver_id
    ? `Handshake Flex · transportista ML #${assignment.driver_id}`
    : 'Handshake Flex · colecta o transferencia registrada en ML';
  const statusLabel = formatMlShipmentStatusLabel(shipment);
  const comment = `${driverNote} · estado ${statusLabel}`;

  const updated = await appendOrderMarketplaceComment(existing.id, comment);
  if (updated) {
    existing = updated;
    const sellerId = await getSellerIdForOrder(existing.id);
    emitOrderUpdated(existing, sellerId);
    await notifySellerFlexEvent(
      sellerId,
      existing,
      'Colecta Flex en Mercado Libre',
      `Tu envío ${existing.id} (ML #${shipmentId}) fue escaneado o transferido en Flex.`
    );
  }

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
