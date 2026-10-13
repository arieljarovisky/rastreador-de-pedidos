import type { Order } from '../types/index.js';
import { buildPublicTrackingUrl } from '../utils/public-tracking-code.js';
import { pushTiendaNubePublicTracking } from './tiendanube.service.js';
import { pushShopifyPublicTracking } from './shopify.service.js';
import { pushWooCommercePublicTracking } from './woocommerce.service.js';

/**
 * Empuja el código/URL de seguimiento Posta al ecommerce para que
 * el comprador lo reciba en su cuenta / email de la tienda.
 * No bloquea el flujo de importación (fire-and-forget desde callers).
 */
export async function pushPublicTrackingToMarketplace(order: Order): Promise<void> {
  if (!order.publicTrackingCode || !order.externalOrderId || !order.sellerId) return;
  if (order.externalSource === 'mercadolibre') return;

  const tracking = {
    code: order.publicTrackingCode,
    url: buildPublicTrackingUrl(order.publicTrackingCode),
  };

  try {
    if (order.externalSource === 'tiendanube') {
      await pushTiendaNubePublicTracking(order.sellerId, order.externalOrderId, tracking);
      return;
    }
    if (order.externalSource === 'shopify') {
      await pushShopifyPublicTracking(order.sellerId, order.externalOrderId, tracking);
      return;
    }
    if (order.externalSource === 'woocommerce') {
      await pushWooCommercePublicTracking(order.sellerId, order.externalOrderId, tracking);
    }
  } catch (err) {
    console.warn(
      '[marketplace-tracking] No se pudo publicar tracking',
      order.id,
      err instanceof Error ? err.message : err
    );
  }
}
