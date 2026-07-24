import { OrderStatus, UserRole } from '../types/index.js';
import {
  deleteShopifyIntegrationByShopDomain,
  findShopifyIntegrationByShopDomain,
} from './integrations.service.js';
import {
  fetchShopifyOrder,
  isShopifyOrderCancelled,
  mapShopifyOrderToShipment,
  verifyShopifyWebhookHmac,
  type ShopifyOrder,
} from './shopify.service.js';
import { importShopifyShipment } from './marketplace-import.service.js';
import {
  findOrderByExternal,
  getSellerIdForOrder,
  updateOrderStatusFromMarketplace,
} from './orders.service.js';
import { getUserById } from './users.service.js';
import { emitOrderUpdated } from '../realtime/io.js';
import { createNotification } from './notifications.service.js';

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

export function assertShopifyWebhookHmac(
  rawBody: string | Buffer | undefined,
  hmacHeader: string | undefined
): boolean {
  if (!rawBody) return false;
  return verifyShopifyWebhookHmac(rawBody, hmacHeader);
}

function normalizeTopic(topicHeader: string | undefined): string {
  return (topicHeader || '').trim().toLowerCase();
}

/**
 * Procesa webhooks de pedidos/app de Shopify.
 * Pensado para correr en background tras responder 200.
 */
export async function processShopifyOrderWebhook(
  payload: ShopifyOrder | Record<string, unknown>,
  options: { shopDomain?: string; topic?: string }
): Promise<void> {
  const shopDomain = options.shopDomain?.trim().toLowerCase();
  const topic = normalizeTopic(options.topic);
  const orderPayload = payload as ShopifyOrder;
  const resourceId = orderPayload?.id;

  if (!shopDomain || !topic) {
    console.warn('[shopify-webhook] payload incompleto', { shopDomain, topic });
    return;
  }

  const dedupKey = `${shopDomain}:${topic}:${resourceId ?? ''}`;
  if (isDuplicate(dedupKey)) {
    console.log('[shopify-webhook] duplicado ignorado', { shopDomain, topic, resourceId });
    return;
  }

  if (topic === 'app/uninstalled') {
    await deleteShopifyIntegrationByShopDomain(shopDomain);
    console.log('[shopify-webhook] app/uninstalled → integración eliminada', { shopDomain });
    return;
  }

  if (resourceId == null) {
    console.warn('[shopify-webhook] sin id de pedido', { shopDomain, topic });
    return;
  }

  const integration = await findShopifyIntegrationByShopDomain(shopDomain);
  if (!integration) {
    console.warn('[shopify-webhook] sin integración para shop', { shopDomain, topic });
    return;
  }

  const owner = await getUserById(integration.userId);
  if (!owner || owner.role !== UserRole.STORE_ADMIN) {
    console.warn('[shopify-webhook] dueño inválido', { userId: integration.userId, shopDomain });
    return;
  }

  if (topic === 'orders/cancelled') {
    await cancelImportedShopifyOrder(owner.id, String(resourceId));
    return;
  }

  if (topic !== 'orders/paid' && topic !== 'orders/updated' && topic !== 'orders/create') {
    console.log('[shopify-webhook] evento ignorado', { topic, shopDomain, resourceId });
    return;
  }

  let order: ShopifyOrder = orderPayload;
  try {
    order = await fetchShopifyOrder(
      integration.externalStoreId ?? shopDomain,
      integration.accessToken,
      resourceId
    );
  } catch (err) {
    console.warn('[shopify-webhook] no se pudo refetch order, uso payload', {
      shopDomain,
      resourceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (isShopifyOrderCancelled(order)) {
    await cancelImportedShopifyOrder(owner.id, String(order.id));
    return;
  }

  const shipment = mapShopifyOrderToShipment(order);
  if (!shipment) {
    console.log('[shopify-webhook] pedido no pagado/domicilio — omitido', {
      shopDomain,
      orderId: order.id,
      financial_status: order.financial_status,
    });
    return;
  }

  const result = await importShopifyShipment(owner, shipment, { notify: true });
  if (result.kind === 'imported') {
    console.log('[shopify-webhook] importado', {
      shopDomain,
      externalId: shipment.externalId,
      orderId: result.order.id,
    });
  } else if (result.kind === 'skipped') {
    console.log('[shopify-webhook] ya existía o no importable', {
      shopDomain,
      externalId: shipment.externalId,
      reason: result.reason,
    });
  } else {
    console.warn('[shopify-webhook] error importando', {
      shopDomain,
      externalId: shipment.externalId,
      message: result.message,
    });
  }
}

async function cancelImportedShopifyOrder(sellerId: string, externalOrderId: string): Promise<void> {
  const existing = await findOrderByExternal(sellerId, 'shopify', externalOrderId);
  if (!existing) return;

  const updated = await updateOrderStatusFromMarketplace(
    existing.id,
    OrderStatus.CANCELLED,
    'Cancelado en Shopify',
    'Shopify'
  );
  if (!updated) return;

  const orderSellerId = (await getSellerIdForOrder(updated.id)) ?? sellerId;
  emitOrderUpdated(updated, orderSellerId);

  await createNotification({
    id: `n_shopify_cancel_${Date.now()}_${updated.id}`,
    userId: sellerId,
    title: 'Pedido cancelado',
    body: `El pedido Shopify #${externalOrderId} se canceló en Shopify.`,
    type: 'info',
    orderId: updated.id,
  });

  console.log('[shopify-webhook] pedido cancelado', {
    orderId: updated.id,
    externalOrderId,
  });
}
