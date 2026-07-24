import { pool } from '../config/database.js';
import { RowDataPacket } from 'mysql2';
import {
  deleteShopifyIntegrationByShopDomain,
  findShopifyIntegrationByShopDomain,
} from './integrations.service.js';

export interface ShopifyCustomersDataRequestPayload {
  shop_id?: number | string;
  shop_domain?: string;
  customer?: {
    id?: number | string;
    email?: string;
    phone?: string;
  };
  orders_requested?: Array<number | string>;
  data_request?: { id?: number | string };
}

export interface ShopifyCustomersRedactPayload {
  shop_id?: number | string;
  shop_domain?: string;
  customer?: {
    id?: number | string;
    email?: string;
    phone?: string;
  };
  orders_to_redact?: Array<number | string>;
}

export interface ShopifyShopRedactPayload {
  shop_id?: number | string;
  shop_domain?: string;
}

async function redactShopifyOrders(
  shopDomain: string,
  orderIds: Array<number | string>
): Promise<number> {
  if (!orderIds.length) return 0;

  const integration = await findShopifyIntegrationByShopDomain(shopDomain);
  if (!integration) return 0;

  const placeholders = orderIds.map(() => '?').join(', ');
  const [result] = await pool.query(
    `UPDATE orders
     SET client_name = 'Cliente redactado', client_phone = '', address = 'Dirección redactada',
         notes = NULL, updated_at = ?
     WHERE seller_id = ? AND external_source = 'shopify'
       AND external_order_id IN (${placeholders})`,
    [new Date(), integration.userId, ...orderIds.map(String)]
  );

  return (result as { affectedRows?: number }).affectedRows ?? 0;
}

export async function processShopifyShopRedact(
  payload: ShopifyShopRedactPayload
): Promise<void> {
  const shopDomain = payload?.shop_domain?.trim();
  if (!shopDomain) return;
  await deleteShopifyIntegrationByShopDomain(shopDomain);
}

export async function processShopifyCustomersRedact(
  payload: ShopifyCustomersRedactPayload
): Promise<void> {
  const shopDomain = payload?.shop_domain?.trim();
  if (!shopDomain || !payload.orders_to_redact?.length) return;
  await redactShopifyOrders(shopDomain, payload.orders_to_redact);
}

export async function processShopifyCustomersDataRequest(
  payload: ShopifyCustomersDataRequestPayload
): Promise<void> {
  const shopDomain = payload?.shop_domain?.trim();
  if (!shopDomain || !payload.orders_requested?.length) return;

  const integration = await findShopifyIntegrationByShopDomain(shopDomain);
  if (!integration) return;

  const placeholders = payload.orders_requested.map(() => '?').join(', ');
  interface OrderRow extends RowDataPacket {
    id: string;
    external_order_id: string | null;
    client_name: string;
    client_phone: string;
    address: string;
  }
  const [rows] = await pool.query<OrderRow[]>(
    `SELECT id, external_order_id, client_name, client_phone, address
     FROM orders
     WHERE seller_id = ? AND external_source = 'shopify'
       AND external_order_id IN (${placeholders})`,
    [integration.userId, ...payload.orders_requested.map(String)]
  );

  console.info('[Shopify GDPR] customers/data_request', {
    shopDomain,
    dataRequestId: payload.data_request?.id,
    customerId: payload.customer?.id,
    ordersFound: rows.length,
    orders: rows.map((row) => ({
      orderId: row.id,
      externalOrderId: row.external_order_id,
      clientName: row.client_name,
      clientPhone: row.client_phone,
      address: row.address,
    })),
  });
}
