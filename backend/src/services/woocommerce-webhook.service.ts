import { OrderStatus, UserRole } from '../types/index.js';
import {
  findWooCommerceIntegrationByStoreHost,
} from './integrations.service.js';
import {
  fetchWooCommerceOrder,
  getWooCredentials,
  isWooOrderCancelled,
  mapWooOrderToShipment,
  verifyWooCommerceWebhookSignature,
  wooStoreHost,
  type WooOrder,
} from './woocommerce.service.js';
import { importWooCommerceShipment } from './marketplace-import.service.js';
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

export function assertWooCommerceWebhookSignature(
  rawBody: string | Buffer | undefined,
  signatureHeader: string | undefined,
  secret: string | null | undefined
): boolean {
  if (!rawBody || !secret) return false;
  return verifyWooCommerceWebhookSignature(rawBody, signatureHeader, secret);
}

/**
 * Resuelve la integración a partir del source/delivery URL o del host del payload.
 * Woo no siempre manda el store host; usamos X-WC-Webhook-Source si está.
 */
export async function resolveWooCommerceIntegrationFromWebhook(options: {
  sourceUrl?: string;
  storeHostHint?: string;
}): Promise<{ integrationUserId: string; storeHost: string; webhookSecret: string | null } | null> {
  const hostCandidate =
    options.storeHostHint ||
    (options.sourceUrl
      ? (() => {
          try {
            return wooStoreHost(options.sourceUrl);
          } catch {
            return '';
          }
        })()
      : '');

  if (!hostCandidate) return null;
  const integration = await findWooCommerceIntegrationByStoreHost(hostCandidate);
  if (!integration) return null;
  const creds = getWooCredentials(integration);
  return {
    integrationUserId: integration.userId,
    storeHost: hostCandidate,
    webhookSecret: creds.webhookSecret,
  };
}

export async function processWooCommerceOrderWebhook(
  payload: WooOrder | Record<string, unknown>,
  options: { storeHost: string; topic?: string }
): Promise<void> {
  const storeHost = options.storeHost.trim().toLowerCase();
  const topic = (options.topic || '').trim().toLowerCase();
  const orderPayload = payload as WooOrder;
  const resourceId = orderPayload?.id;

  if (!storeHost) {
    console.warn('[woo-webhook] sin storeHost');
    return;
  }

  const dedupKey = `${storeHost}:${topic}:${resourceId ?? ''}`;
  if (isDuplicate(dedupKey)) {
    console.log('[woo-webhook] duplicado ignorado', { storeHost, topic, resourceId });
    return;
  }

  if (resourceId == null) {
    console.warn('[woo-webhook] sin id de pedido', { storeHost, topic });
    return;
  }

  const integration = await findWooCommerceIntegrationByStoreHost(storeHost);
  if (!integration) {
    console.warn('[woo-webhook] sin integración', { storeHost, topic });
    return;
  }

  const owner = await getUserById(integration.userId);
  if (!owner || owner.role !== UserRole.STORE_ADMIN) {
    console.warn('[woo-webhook] dueño inválido', { userId: integration.userId, storeHost });
    return;
  }

  let order: WooOrder = orderPayload;
  try {
    order = await fetchWooCommerceOrder(integration, resourceId);
  } catch (err) {
    console.warn('[woo-webhook] no se pudo refetch order, uso payload', {
      storeHost,
      resourceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (isWooOrderCancelled(order) || topic === 'order.deleted') {
    await cancelImportedWooOrder(owner.id, String(order.id ?? resourceId));
    return;
  }

  if (topic && topic !== 'order.created' && topic !== 'order.updated') {
    console.log('[woo-webhook] evento ignorado', { topic, storeHost, resourceId });
    return;
  }

  const shipment = mapWooOrderToShipment(order);
  if (!shipment) {
    console.log('[woo-webhook] pedido no pagado/domicilio — omitido', {
      storeHost,
      orderId: order.id,
      status: order.status,
    });
    return;
  }

  const result = await importWooCommerceShipment(owner, shipment, { notify: true });
  if (result.kind === 'imported') {
    console.log('[woo-webhook] importado', {
      storeHost,
      externalId: shipment.externalId,
      orderId: result.order.id,
    });
  } else if (result.kind === 'skipped') {
    console.log('[woo-webhook] ya existía', {
      storeHost,
      externalId: shipment.externalId,
      reason: result.reason,
    });
  } else {
    console.warn('[woo-webhook] error importando', {
      storeHost,
      externalId: shipment.externalId,
      message: result.message,
    });
  }
}

async function cancelImportedWooOrder(sellerId: string, externalOrderId: string): Promise<void> {
  const existing = await findOrderByExternal(sellerId, 'woocommerce', externalOrderId);
  if (!existing) return;

  const updated = await updateOrderStatusFromMarketplace(
    existing.id,
    OrderStatus.CANCELLED,
    'Cancelado en WooCommerce',
    'WooCommerce'
  );
  if (!updated) return;

  const orderSellerId = (await getSellerIdForOrder(updated.id)) ?? sellerId;
  emitOrderUpdated(updated, orderSellerId);

  await createNotification({
    id: `n_woo_cancel_${Date.now()}_${updated.id}`,
    userId: sellerId,
    title: 'Pedido cancelado',
    body: `El pedido WooCommerce #${externalOrderId} se canceló en WooCommerce.`,
    type: 'info',
    orderId: updated.id,
  });

  console.log('[woo-webhook] pedido cancelado', {
    orderId: updated.id,
    externalOrderId,
  });
}
