import { OrderStatus, UserRole } from '../types/index.js';
import {
  deleteTiendaNubeIntegrationByStoreId,
  findTiendaNubeIntegrationByStoreId,
} from './integrations.service.js';
import {
  fetchTiendaNubeOrder,
  isTiendaNubeOrderCancelled,
  mapTiendaNubeOrderToShipment,
  verifyTiendaNubeWebhookHmac,
} from './tiendanube.service.js';
import { importTiendaNubeExpressShipment } from './marketplace-import.service.js';
import {
  findOrderByExternal,
  getSellerIdForOrder,
  updateOrderStatusFromMarketplace,
} from './orders.service.js';
import { getUserById } from './users.service.js';
import { emitOrderUpdated } from '../realtime/io.js';
import { createNotification } from './notifications.service.js';

export interface TiendaNubeOrderWebhookPayload {
  store_id?: number | string;
  event?: string;
  id?: number | string;
}

const recentNotifications = new Map<string, number>();
const DEDUP_TTL_MS = 10 * 60 * 1000;

function pruneDedup(): void {
  const now = Date.now();
  for (const [key, ts] of recentNotifications) {
    if (now - ts > DEDUP_TTL_MS) recentNotifications.delete(key);
  }
}

function isDuplicate(key: string): boolean {
  pruneDedup();
  if (recentNotifications.has(key)) return true;
  recentNotifications.set(key, Date.now());
  return false;
}

export function assertTiendaNubeWebhookHmac(
  rawBody: string | Buffer | undefined,
  hmacHeader: string | undefined
): boolean {
  if (!rawBody) return false;
  return verifyTiendaNubeWebhookHmac(rawBody, hmacHeader);
}

/**
 * Procesa un webhook de pedidos/app de Tienda Nube.
 * Pensado para correr en background tras responder 200 a TN (timeout 3s).
 */
export async function processTiendaNubeOrderWebhook(
  payload: TiendaNubeOrderWebhookPayload
): Promise<void> {
  const storeId = payload.store_id;
  const event = payload.event?.trim();
  const resourceId = payload.id;

  if (storeId == null || !event) {
    console.warn('[tn-webhook] payload incompleto', payload);
    return;
  }

  const dedupKey = `${storeId}:${event}:${resourceId ?? ''}`;
  if (isDuplicate(dedupKey)) {
    console.log('[tn-webhook] duplicado ignorado', { storeId, event, resourceId });
    return;
  }

  if (event === 'app/uninstalled') {
    await deleteTiendaNubeIntegrationByStoreId(storeId);
    console.log('[tn-webhook] app/uninstalled → integración eliminada', { storeId });
    return;
  }

  if (resourceId == null) {
    console.warn('[tn-webhook] sin id de pedido', { storeId, event });
    return;
  }

  const integration = await findTiendaNubeIntegrationByStoreId(storeId);
  if (!integration) {
    console.warn('[tn-webhook] sin integración para store', { storeId, event });
    return;
  }

  const owner = await getUserById(integration.userId);
  if (!owner || owner.role !== UserRole.STORE_ADMIN) {
    console.warn('[tn-webhook] dueño inválido', { userId: integration.userId, storeId });
    return;
  }

  const storeKey = integration.externalStoreId ?? String(storeId);

  if (event === 'order/cancelled') {
    await cancelImportedTiendaNubeOrder(owner.id, String(resourceId));
    return;
  }

  if (event !== 'order/paid' && event !== 'order/updated') {
    console.log('[tn-webhook] evento ignorado', { event, storeId, resourceId });
    return;
  }

  const order = await fetchTiendaNubeOrder(storeKey, integration.accessToken, resourceId);

  if (isTiendaNubeOrderCancelled(order)) {
    await cancelImportedTiendaNubeOrder(owner.id, String(order.id));
    return;
  }

  const shipment = mapTiendaNubeOrderToShipment(order);
  if (!shipment) {
    console.log('[tn-webhook] pedido no Express/pagado — omitido', {
      storeId,
      orderId: order.id,
      payment_status: order.payment_status,
      status: order.status,
    });
    return;
  }

  const result = await importTiendaNubeExpressShipment(owner, shipment, { notify: true });
  if (result.kind === 'imported') {
    console.log('[tn-webhook] importado', {
      storeId,
      externalId: shipment.externalId,
      orderId: result.order.id,
    });
  } else if (result.kind === 'skipped') {
    console.log('[tn-webhook] ya existía o no importable', {
      storeId,
      externalId: shipment.externalId,
      reason: result.reason,
    });
  } else {
    console.warn('[tn-webhook] error importando', {
      storeId,
      externalId: shipment.externalId,
      message: result.message,
    });
  }
}

async function cancelImportedTiendaNubeOrder(sellerId: string, externalOrderId: string): Promise<void> {
  const existing = await findOrderByExternal(sellerId, 'tiendanube', externalOrderId);
  if (!existing) return;

  const updated = await updateOrderStatusFromMarketplace(
    existing.id,
    OrderStatus.CANCELLED,
    'Cancelado en Tienda Nube',
    'Tienda Nube'
  );
  if (!updated) return;

  const orderSellerId = (await getSellerIdForOrder(updated.id)) ?? sellerId;
  emitOrderUpdated(updated, orderSellerId);

  await createNotification({
    id: `n_tn_cancel_${Date.now()}_${updated.id}`,
    userId: sellerId,
    title: 'Pedido cancelado',
    body: `El pedido TN #${externalOrderId} se canceló en Tienda Nube.`,
    type: 'info',
    orderId: updated.id,
  });

  console.log('[tn-webhook] pedido cancelado', {
    orderId: updated.id,
    externalOrderId,
  });
}
