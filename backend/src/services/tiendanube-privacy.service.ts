import { pool } from '../config/database.js';
import { RowDataPacket } from 'mysql2';
import { env } from '../config/env.js';
import {
  deleteTiendaNubeIntegrationByStoreId,
  findTiendaNubeIntegrationByStoreId,
} from './integrations.service.js';

export interface TiendaNubeStoreRedactPayload {
  store_id: number | string;
}

export interface TiendaNubeCustomerRedactPayload {
  store_id: number | string;
  customer: {
    id: number | string;
    email?: string;
    phone?: string;
    identification?: string;
  };
  orders_to_redact: Array<number | string>;
}

export interface TiendaNubeCustomerDataRequestPayload {
  store_id: number | string;
  customer: {
    id: number | string;
    email?: string;
    phone?: string;
    identification?: string;
  };
  orders_requested: Array<number | string>;
  checkouts_requested?: Array<number | string>;
  drafts_orders_requested?: Array<number | string>;
  data_request: { id: number | string };
}

export function getTiendaNubePrivacyWebhookUrls(): {
  storeRedact: string;
  customersRedact: string;
  customersDataRequest: string;
} {
  const base = `${env.publicUrl}/api/integrations/tiendanube/webhooks`;
  return {
    storeRedact: `${base}/store-redact`,
    customersRedact: `${base}/customers-redact`,
    customersDataRequest: `${base}/customers-data-request`,
  };
}

async function redactTiendaNubeOrders(
  storeId: string | number,
  orderIds: Array<number | string>
): Promise<number> {
  if (!orderIds.length) return 0;

  const integration = await findTiendaNubeIntegrationByStoreId(storeId);
  if (!integration) return 0;

  const placeholders = orderIds.map(() => '?').join(', ');
  const [result] = await pool.query(
    `UPDATE orders
     SET client_name = 'Cliente redactado', client_phone = '', address = 'Dirección redactada',
         notes = NULL, updated_at = ?
     WHERE seller_id = ? AND external_source = 'tiendanube'
       AND external_order_id IN (${placeholders})`,
    [new Date(), integration.userId, ...orderIds.map(String)]
  );

  return (result as { affectedRows?: number }).affectedRows ?? 0;
}

export async function processTiendaNubeStoreRedact(
  payload: TiendaNubeStoreRedactPayload
): Promise<void> {
  if (!payload?.store_id) return;
  await deleteTiendaNubeIntegrationByStoreId(payload.store_id);
}

export async function processTiendaNubeCustomerRedact(
  payload: TiendaNubeCustomerRedactPayload
): Promise<void> {
  if (!payload?.store_id || !payload.orders_to_redact?.length) return;
  await redactTiendaNubeOrders(payload.store_id, payload.orders_to_redact);
}

export async function processTiendaNubeCustomerDataRequest(
  payload: TiendaNubeCustomerDataRequestPayload
): Promise<void> {
  if (!payload?.store_id || !payload.orders_requested?.length) return;

  const integration = await findTiendaNubeIntegrationByStoreId(payload.store_id);
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
     WHERE seller_id = ? AND external_source = 'tiendanube'
       AND external_order_id IN (${placeholders})`,
    [integration.userId, ...payload.orders_requested.map(String)]
  );

  console.info('[TN LGPD] customers/data_request', {
    storeId: payload.store_id,
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
