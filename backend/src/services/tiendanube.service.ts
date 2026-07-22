import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';
import {
  getIntegration,
  upsertIntegration,
  type IntegrationPlatform,
  type StoreIntegration,
} from './integrations.service.js';

const TN_AUTH = 'https://www.tiendanube.com/apps';
const TN_API = 'https://api.tiendanube.com/v1';

const TN_ORDER_WEBHOOK_EVENTS = [
  'order/paid',
  'order/updated',
  'order/cancelled',
  'app/uninstalled',
] as const;

interface TnTokenResponse {
  access_token: string;
  token_type?: string;
  scope?: string;
  user_id: number;
}

interface TnNamedField {
  name?: string;
  code?: string;
}

interface TnDestination {
  name?: string;
  phone?: string;
  address?: string;
  street?: string;
  number?: string;
  city?: string;
  province?: string | TnNamedField;
  zipcode?: string;
  floor?: string;
  locality?: string;
}

interface TnFulfillment {
  id: string;
  status?: string;
  shipping?: {
    type?: string;
    option?: { name?: string; code?: string };
    carrier?: { name?: string };
    pickup_details?: unknown;
  };
  destination?: TnDestination;
}

export interface TnOrder {
  id: number;
  number?: number;
  created_at: string;
  payment_status?: string;
  status?: string;
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  shipping_address?: TnDestination;
  shipping_option?: string;
  shipping_option_code?: string;
  fulfillments?: TnFulfillment[];
  fulfillment_orders?: TnFulfillment[];
}

export function getTiendaNubeAuthUrl(state: string): string {
  const params = new URLSearchParams({ state });
  return `${TN_AUTH}/${env.tiendanube.appId}/authorize?${params}`;
}

export async function exchangeTiendaNubeCode(
  userId: string,
  code: string
): Promise<StoreIntegration> {
  const res = await fetch(`${TN_AUTH}/authorize/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.tiendanube.appId,
      client_secret: env.tiendanube.appSecret,
      grant_type: 'authorization_code',
      code,
    }),
  });

  if (!res.ok) throw new Error('TN_TOKEN_FAILED');
  const token = (await res.json()) as TnTokenResponse;
  const storeId = String(token.user_id);

  let storeName = storeId;
  try {
    const storeRes = await fetch(`${TN_API}/${storeId}/store`, {
      headers: tnHeaders(token.access_token),
    });
    if (storeRes.ok) {
      const store = (await storeRes.json()) as { name?: { es?: string; en?: string } | string };
      if (typeof store.name === 'string') storeName = store.name;
      else if (store.name?.es) storeName = store.name.es;
    }
  } catch {
    // optional store name
  }

  const integration = await upsertIntegration({
    userId,
    platform: 'tiendanube',
    externalStoreId: storeId,
    externalUserId: storeId,
    accessToken: token.access_token,
    metadata: { storeName, scope: token.scope },
  });

  try {
    await ensureTiendaNubeOrderWebhooks(integration);
  } catch (err) {
    console.warn(
      '[TN] No se pudieron registrar webhooks de pedidos tras OAuth:',
      err instanceof Error ? err.message : err
    );
  }

  return integration;
}

export async function getValidTiendaNubeIntegration(userId: string): Promise<StoreIntegration> {
  const integration = await getIntegration(userId, 'tiendanube');
  if (!integration) throw new Error('TN_NOT_CONNECTED');
  return integration;
}

function tnHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Authentication: `bearer ${token}`,
    'User-Agent': 'LupoEnvios (contact@lupoenvios.com)',
    'Content-Type': 'application/json',
  };
}

function normalizeProvince(province: string | TnNamedField | undefined): string {
  if (!province) return '';
  if (typeof province === 'string') return province;
  return province.name ?? province.code ?? '';
}

function formatTnAddress(parts: TnDestination): string {
  const streetLine = [parts.street, parts.number].filter((p) => p && String(p).trim()).join(' ');
  const address = parts.address?.trim() || streetLine.trim();
  const province = normalizeProvince(parts.province);

  return [address, parts.floor, parts.locality, parts.city, province, parts.zipcode, 'Argentina']
    .filter((p) => p && String(p).trim())
    .join(', ');
}

function getOrderFulfillments(order: TnOrder): TnFulfillment[] {
  if (order.fulfillments?.length) return order.fulfillments;
  if (order.fulfillment_orders?.length) return order.fulfillment_orders;
  return [];
}

function isPickupShipping(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return (
    normalized.includes('retiro') ||
    normalized.includes('pickup') ||
    normalized.includes('sucursal') ||
    normalized.includes('en local') ||
    normalized.includes('en tienda')
  );
}

function isStandardShipping(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = normalizeShippingText(text);
  if (normalized.includes('express') || normalized.includes('rapido') || normalized.includes('urgente')) {
    return false;
  }
  return (
    normalized.includes('estandar') ||
    normalized.includes('standard') ||
    normalized.includes('economico') ||
    normalized.includes('paquete') ||
    normalized.includes('normal') ||
    normalized.includes('clasico')
  );
}

function normalizeShippingText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isExpressShipping(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = normalizeShippingText(text);

  if (isStandardShipping(text)) return false;

  if (
    /\bexpress\b/.test(normalized) ||
    normalized.includes('_express') ||
    normalized.includes('express_')
  ) {
    return true;
  }

  if (
    normalized.includes('rapido') ||
    normalized.includes('urgente') ||
    normalized.includes('same day') ||
    normalized.includes('sameday') ||
    normalized.includes('flash')
  ) {
    return true;
  }

  if (normalized.includes('envio express')) return true;

  if (
    (normalized.includes('nube') || normalized.includes('tiendanube')) &&
    (normalized.includes('express') || normalized.includes('rapido') || normalized.includes('urgente'))
  ) {
    return true;
  }

  return false;
}

function fulfillmentIsPickup(fulfillment: TnFulfillment): boolean {
  if (fulfillment.shipping?.pickup_details) return true;
  const type = fulfillment.shipping?.type?.toLowerCase() ?? '';
  if (type.includes('pickup') || type.includes('retiro')) return true;

  const optionName = fulfillment.shipping?.option?.name;
  const optionCode = fulfillment.shipping?.option?.code;
  const carrierName = fulfillment.shipping?.carrier?.name;
  return (
    isPickupShipping(optionName) ||
    isPickupShipping(optionCode) ||
    isPickupShipping(carrierName)
  );
}

function orderIsExpress(order: TnOrder): boolean {
  if (isExpressShipping(order.shipping_option) || isExpressShipping(order.shipping_option_code)) {
    return true;
  }

  for (const fulfillment of getOrderFulfillments(order)) {
    if (fulfillmentIsPickup(fulfillment)) continue;
    const optionName = fulfillment.shipping?.option?.name;
    const optionCode = fulfillment.shipping?.option?.code;
    const carrierName = fulfillment.shipping?.carrier?.name;
    if (
      isExpressShipping(optionName) ||
      isExpressShipping(optionCode) ||
      isExpressShipping(carrierName)
    ) {
      return true;
    }
  }

  return false;
}

export interface TiendaNubeExpressShipment {
  externalId: string;
  platform: IntegrationPlatform;
  shippingType: 'express';
  clientName: string;
  clientPhone: string;
  address: string;
  notes: string;
  createdAt: string;
}

/** Mapea un pedido TN a envío Express importable, o null si no aplica. */
export function mapTiendaNubeOrderToShipment(order: TnOrder): TiendaNubeExpressShipment | null {
  if (order.payment_status && order.payment_status !== 'paid') return null;
  if (order.status === 'cancelled' || order.status === 'closed') return null;

  const fulfillments = getOrderFulfillments(order);
  const deliverableFulfillment = fulfillments.find((f) => !fulfillmentIsPickup(f));
  const isPickupOnly =
    fulfillments.length > 0 && fulfillments.every((f) => fulfillmentIsPickup(f));

  if (isPickupOnly || isPickupShipping(order.shipping_option) || isPickupShipping(order.shipping_option_code)) {
    return null;
  }

  if (!orderIsExpress(order)) return null;

  const fulfillment = deliverableFulfillment ?? fulfillments[0];
  const dest = fulfillment?.destination;
  const shippingAddr = order.shipping_address;

  const address = dest
    ? formatTnAddress(dest)
    : shippingAddr
      ? formatTnAddress(shippingAddr)
      : '';

  if (!address || address.replace(/,?\s*Argentina$/i, '').trim().length < 5) return null;

  const clientName =
    dest?.name?.trim() ||
    shippingAddr?.name?.trim() ||
    order.customer?.name?.trim() ||
    `Cliente TN #${order.number ?? order.id}`;

  const clientPhone =
    dest?.phone?.trim() || shippingAddr?.phone?.trim() || order.customer?.phone?.trim() || '';

  const shippingLabel =
    fulfillment?.shipping?.option?.name ||
    fulfillment?.shipping?.carrier?.name ||
    order.shipping_option ||
    'Envío';

  return {
    externalId: String(order.id),
    platform: 'tiendanube',
    shippingType: 'express',
    clientName,
    clientPhone,
    address,
    notes: `Tienda Nube Express · Pedido #${order.number ?? order.id} · ${shippingLabel}`,
    createdAt: order.created_at,
  };
}

export function isTiendaNubeOrderCancelled(order: TnOrder): boolean {
  return order.status === 'cancelled' || order.status === 'closed';
}

export interface TiendaNubeDateRange {
  dateFrom?: string;
  dateTo?: string;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TN_RANGE_DAYS = 90;

export function parseTiendaNubeDateRange(
  dateFrom?: string,
  dateTo?: string
): TiendaNubeDateRange | undefined {
  const from = dateFrom?.trim();
  const to = dateTo?.trim();
  if (!from && !to) return undefined;

  if ((from && !DATE_ONLY_RE.test(from)) || (to && !DATE_ONLY_RE.test(to))) {
    throw new Error('TN_INVALID_DATE');
  }
  if (from && to && from > to) {
    throw new Error('TN_INVALID_DATE_RANGE');
  }

  if (from && to) {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > MAX_TN_RANGE_DAYS) {
      throw new Error('TN_DATE_RANGE_TOO_LONG');
    }
  }

  return { dateFrom: from, dateTo: to };
}

function toTnCreatedAtMin(date: string): string {
  return `${date}T00:00:00-03:00`;
}

function toTnCreatedAtMax(date: string): string {
  return `${date}T23:59:59-03:00`;
}

async function fetchTiendaNubeOrders(
  storeId: string,
  accessToken: string,
  dateRange?: TiendaNubeDateRange
): Promise<TnOrder[]> {
  const allOrders: TnOrder[] = [];
  const baseParams = new URLSearchParams({
    per_page: '200',
    payment_status: 'paid',
    aggregates: 'fulfillment_orders',
  });

  if (dateRange?.dateFrom) {
    baseParams.set('created_at_min', toTnCreatedAtMin(dateRange.dateFrom));
  }
  if (dateRange?.dateTo) {
    baseParams.set('created_at_max', toTnCreatedAtMax(dateRange.dateTo));
  }

  for (let page = 1; page <= 50; page++) {
    const params = new URLSearchParams(baseParams);
    params.set('page', String(page));

    const res = await fetch(`${TN_API}/${storeId}/orders?${params}`, {
      headers: tnHeaders(accessToken),
    });

    if (!res.ok) {
      console.error('[TN] orders API error:', res.status, await res.text().catch(() => ''));
      throw new Error('TN_API_ERROR');
    }

    const orders = (await res.json()) as TnOrder[];
    if (!Array.isArray(orders)) {
      console.error('[TN] unexpected orders response:', orders);
      throw new Error('TN_API_ERROR');
    }

    if (orders.length === 0) break;
    allOrders.push(...orders);
    if (orders.length < 200) break;
  }

  return allOrders;
}

export async function fetchTiendaNubeOrder(
  storeId: string,
  accessToken: string,
  orderId: string | number
): Promise<TnOrder> {
  const params = new URLSearchParams({ aggregates: 'fulfillment_orders' });
  const res = await fetch(`${TN_API}/${storeId}/orders/${orderId}?${params}`, {
    headers: tnHeaders(accessToken),
  });

  if (!res.ok) {
    console.error('[TN] order API error:', res.status, await res.text().catch(() => ''));
    throw new Error('TN_API_ERROR');
  }

  return (await res.json()) as TnOrder;
}

export async function listTiendaNubeExpressShipments(
  userId: string,
  dateRange?: TiendaNubeDateRange
): Promise<TiendaNubeExpressShipment[]> {
  const integration = await getValidTiendaNubeIntegration(userId);
  const storeId = integration.externalStoreId;
  if (!storeId) throw new Error('TN_NOT_CONNECTED');

  const orders = await fetchTiendaNubeOrders(storeId, integration.accessToken, dateRange);

  const shipments: TiendaNubeExpressShipment[] = [];
  for (const order of orders) {
    const shipment = mapTiendaNubeOrderToShipment(order);
    if (shipment) shipments.push(shipment);
  }
  return shipments;
}

export function getTiendaNubeOrderWebhookUrl(): string {
  return `${env.publicUrl}/api/integrations/tiendanube/webhooks/orders`;
}

export function verifyTiendaNubeWebhookHmac(
  rawBody: string | Buffer,
  hmacHeader: string | undefined
): boolean {
  if (!hmacHeader || !env.tiendanube.appSecret) return false;

  const digest = createHmac('sha256', env.tiendanube.appSecret)
    .update(rawBody)
    .digest('hex');

  const expected = Buffer.from(digest, 'utf8');
  const received = Buffer.from(hmacHeader.trim(), 'utf8');
  if (expected.length !== received.length) return false;

  try {
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

interface TnWebhookRegistration {
  id: number;
  event: string;
  url: string;
}

async function listTiendaNubeWebhooks(
  storeId: string,
  accessToken: string
): Promise<TnWebhookRegistration[]> {
  const res = await fetch(`${TN_API}/${storeId}/webhooks?per_page=200`, {
    headers: tnHeaders(accessToken),
  });
  if (!res.ok) {
    console.error('[TN] list webhooks error:', res.status, await res.text().catch(() => ''));
    throw new Error('TN_API_ERROR');
  }
  const data = (await res.json()) as TnWebhookRegistration[];
  return Array.isArray(data) ? data : [];
}

async function createTiendaNubeWebhook(
  storeId: string,
  accessToken: string,
  event: string,
  url: string
): Promise<void> {
  const res = await fetch(`${TN_API}/${storeId}/webhooks`, {
    method: 'POST',
    headers: tnHeaders(accessToken),
    body: JSON.stringify({ event, url }),
  });
  if (!res.ok && res.status !== 422) {
    console.error('[TN] create webhook error:', event, res.status, await res.text().catch(() => ''));
    throw new Error('TN_API_ERROR');
  }
}

/** Registra webhooks de pedidos/desinstalación si faltan (idempotente). */
export async function ensureTiendaNubeOrderWebhooks(
  integration: StoreIntegration
): Promise<{ created: number; existing: number }> {
  const storeId = integration.externalStoreId;
  if (!storeId) throw new Error('TN_NOT_CONNECTED');

  const url = getTiendaNubeOrderWebhookUrl();
  const existing = await listTiendaNubeWebhooks(storeId, integration.accessToken);
  const covered = new Set(
    existing.filter((w) => w.url === url).map((w) => w.event)
  );

  let created = 0;
  for (const event of TN_ORDER_WEBHOOK_EVENTS) {
    if (covered.has(event)) continue;
    await createTiendaNubeWebhook(storeId, integration.accessToken, event, url);
    created += 1;
  }

  return { created, existing: TN_ORDER_WEBHOOK_EVENTS.length - created };
}

export function isTiendaNubeConfigured(): boolean {
  return Boolean(env.tiendanube.appId && env.tiendanube.appSecret && env.tiendanube.redirectUri);
}
