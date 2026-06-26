import { OrderStatus } from '../types/index.js';
import { env } from '../config/env.js';
import {
  findMercadoLibreIntegrationByMlUserId,
  type StoreIntegration,
} from './integrations.service.js';
import {
  fetchMercadoLibreFlexShipment,
  fetchMercadoLibreOrder,
  fetchMercadoLibreShipment,
  getValidMercadoLibreIntegration,
  type MercadoLibreFlexShipment,
} from './mercadolibre.service.js';
import { geocodeAddress } from './geocode.service.js';
import {
  createOrder,
  findOrderByExternal,
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

async function importFlexShipment(
  integration: StoreIntegration,
  shipment: MercadoLibreFlexShipment
): Promise<string | null> {
  const seller = await getUserById(integration.userId);
  if (!seller) return null;

  const existing = await findOrderByExternal(
    integration.userId,
    'mercadolibre',
    shipment.externalId
  );
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

  await createNotification({
    id: `n_ml_import_${Date.now()}_${order.id}`,
    userId: 'all',
    title: 'Nuevo envío Flex (Mercado Libre)',
    body: `Se importó automáticamente la orden ML #${shipment.externalId} como ${order.id}.`,
    type: 'info',
    orderId: order.id,
  });

  const sellerId = await getSellerIdForOrder(order.id);
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

async function handleOrderResource(
  integration: StoreIntegration,
  mlOrderId: string
): Promise<void> {
  const validIntegration = await getValidMercadoLibreIntegration(integration.userId);
  const mlOrder = await fetchMercadoLibreOrder(validIntegration, mlOrderId);

  if (mlOrder.status === 'cancelled') {
    const existing = await findOrderByExternalGlobal('mercadolibre', mlOrderId);
    if (existing) {
      await syncOrderStatus(existing.id, OrderStatus.CANCELLED, 'orden cancelada');
    }
    return;
  }

  if (mlOrder.status !== 'paid') return;

  const flexShipment = await fetchMercadoLibreFlexShipment(validIntegration, mlOrderId);
  if (!flexShipment) return;

  const existing = await findOrderByExternalGlobal('mercadolibre', mlOrderId);
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

async function handleShipmentResource(
  integration: StoreIntegration,
  mlShipmentId: string
): Promise<void> {
  const validIntegration = await getValidMercadoLibreIntegration(integration.userId);
  const shipment = await fetchMercadoLibreShipment(validIntegration, mlShipmentId);

  if (shipment.logistic_type !== 'self_service') return;

  const mlOrderId = shipment.order_id ? String(shipment.order_id) : null;
  if (!mlOrderId) return;

  let existing = await findOrderByExternalGlobal('mercadolibre', mlOrderId);

  if (!existing && shipment.status !== 'cancelled' && shipment.status !== 'delivered') {
    const flexShipment = await fetchMercadoLibreFlexShipment(validIntegration, mlOrderId);
    if (flexShipment) {
      await importFlexShipment(validIntegration, flexShipment);
      existing = await findOrderByExternalGlobal('mercadolibre', mlOrderId);
    }
  }

  if (!existing || !shipment.status) return;

  const next = mapMlShipmentStatusToOrderStatus(
    shipment.status,
    existing.status,
    Boolean(existing.repartidorId)
  );
  if (next) {
    await syncOrderStatus(existing.id, next, shipment.status);
  }
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

  const orderMatch = resource.match(/\/orders\/(\d+)/i);
  const shipmentMatch = resource.match(/\/shipments\/(\d+)/i);

  try {
    if (payload.topic === 'orders_v2' || payload.topic === 'orders') {
      if (orderMatch) {
        await handleOrderResource(integration, orderMatch[1]);
      }
      return;
    }

    if (payload.topic === 'shipments') {
      if (shipmentMatch) {
        await handleShipmentResource(integration, shipmentMatch[1]);
        return;
      }
      if (orderMatch) {
        await handleOrderResource(integration, orderMatch[1]);
      }
    }
  } catch (err) {
    console.error('[ml-webhook] Error procesando notificación:', err);
  }
}
