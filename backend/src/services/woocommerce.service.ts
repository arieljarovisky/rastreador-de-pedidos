import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';
import {
  getIntegration,
  upsertIntegration,
  type IntegrationPlatform,
  type StoreIntegration,
} from './integrations.service.js';

export interface WooAddress {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  phone?: string;
  email?: string;
}

export interface WooShippingLine {
  method_title?: string;
  method_id?: string;
}

export interface WooOrder {
  id: number;
  number?: string;
  status?: string;
  date_created?: string;
  date_paid?: string | null;
  needs_payment?: boolean;
  billing?: WooAddress;
  shipping?: WooAddress;
  shipping_lines?: WooShippingLine[];
  customer_note?: string;
}

export interface WooHomeShipment {
  externalId: string;
  platform: IntegrationPlatform;
  shippingType: 'standard';
  clientName: string;
  clientPhone: string;
  address: string;
  notes: string;
  createdAt: string;
}

export interface WooDateRange {
  dateFrom?: string;
  dateTo?: string;
}

export interface WooConnectInput {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 90;
const WOO_WEBHOOK_TOPICS = ['order.created', 'order.updated'] as const;

export function normalizeWooStoreUrl(input: string): string {
  let value = input.trim();
  if (!value) throw new Error('WOO_INVALID_URL');
  if (!/^https:\/\//i.test(value)) {
    if (/^http:\/\//i.test(value)) throw new Error('WOO_HTTP_NOT_ALLOWED');
    value = `https://${value}`;
  }
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('WOO_HTTP_NOT_ALLOWED');
  return `${url.protocol}//${url.host}`.replace(/\/$/, '');
}

export function wooStoreHost(storeUrl: string): string {
  return new URL(normalizeWooStoreUrl(storeUrl)).host.toLowerCase();
}

function wooAuthHeader(consumerKey: string, consumerSecret: string): string {
  return `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`;
}

async function wooFetch<T>(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const base = normalizeWooStoreUrl(storeUrl);
  const res = await fetch(`${base}/wp-json/wc/v3${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: wooAuthHeader(consumerKey, consumerSecret),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[WooCommerce] API error:', res.status, body.slice(0, 300));
    if (res.status === 401 || res.status === 403) throw new Error('WOO_AUTH_FAILED');
    throw new Error('WOO_API_ERROR');
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function getWooCommerceOrderWebhookUrl(): string {
  return `${env.publicUrl}/api/integrations/woocommerce/webhooks/orders`;
}

export function verifyWooCommerceWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  const digest = createHmac('sha256', secret).update(rawBody).digest('base64');
  const expected = Buffer.from(digest, 'utf8');
  const received = Buffer.from(signatureHeader.trim(), 'utf8');
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

function isPickupShipping(text: string | undefined | null): boolean {
  if (!text) return false;
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return (
    normalized.includes('retiro') ||
    normalized.includes('pickup') ||
    normalized.includes('local_pickup') ||
    normalized.includes('local pickup') ||
    normalized.includes('sucursal') ||
    normalized.includes('en local') ||
    normalized.includes('en tienda')
  );
}

function formatWooAddress(addr: WooAddress | undefined): string {
  if (!addr) return '';
  const line = [addr.address_1, addr.address_2].filter((p) => p && String(p).trim()).join(', ');
  return [line, addr.city, addr.state, addr.postcode, addr.country || 'Argentina']
    .filter((p) => p && String(p).trim())
    .join(', ');
}

export function isWooOrderCancelled(order: WooOrder): boolean {
  const status = (order.status || '').toLowerCase();
  return status === 'cancelled' || status === 'refunded' || status === 'failed' || status === 'trash';
}

export function isWooOrderPaid(order: WooOrder): boolean {
  if (order.needs_payment === true) return false;
  if (order.date_paid) return true;
  const status = (order.status || '').toLowerCase();
  return status === 'processing' || status === 'completed';
}

export function mapWooOrderToShipment(order: WooOrder): WooHomeShipment | null {
  if (!isWooOrderPaid(order)) return null;
  if (isWooOrderCancelled(order)) return null;

  const shippingLines = order.shipping_lines ?? [];
  if (
    shippingLines.length > 0 &&
    shippingLines.every((line) => isPickupShipping(line.method_title) || isPickupShipping(line.method_id))
  ) {
    return null;
  }

  const address = formatWooAddress(order.shipping);
  if (!address || address.replace(/,?\s*Argentina$/i, '').trim().length < 5) return null;

  const clientName =
    [order.shipping?.first_name, order.shipping?.last_name].filter(Boolean).join(' ').trim() ||
    [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(' ').trim() ||
    `Cliente Woo #${order.number ?? order.id}`;

  const clientPhone = order.shipping?.phone?.trim() || order.billing?.phone?.trim() || '';
  const shippingLabel =
    shippingLines.map((l) => l.method_title).filter(Boolean).join(', ') || 'Envío a domicilio';

  return {
    externalId: String(order.id),
    platform: 'woocommerce',
    shippingType: 'standard',
    clientName,
    clientPhone,
    address,
    notes: `WooCommerce · Pedido #${order.number ?? order.id} · ${shippingLabel}`,
    createdAt: order.date_created || new Date().toISOString(),
  };
}

export function parseWooCommerceDateRange(
  dateFrom?: string,
  dateTo?: string
): WooDateRange | undefined {
  const from = dateFrom?.trim();
  const to = dateTo?.trim();
  if (!from && !to) return undefined;

  if ((from && !DATE_ONLY_RE.test(from)) || (to && !DATE_ONLY_RE.test(to))) {
    throw new Error('WOO_INVALID_DATE');
  }
  if (from && to && from > to) {
    throw new Error('WOO_INVALID_DATE_RANGE');
  }

  if (from && to) {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > MAX_RANGE_DAYS) {
      throw new Error('WOO_DATE_RANGE_TOO_LONG');
    }
  }

  return { dateFrom: from, dateTo: to };
}

export function getWooCredentials(integration: StoreIntegration): {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  webhookSecret: string | null;
} {
  const storeUrl =
    typeof integration.metadata?.storeUrl === 'string' ? integration.metadata.storeUrl : '';
  const consumerKey =
    typeof integration.metadata?.consumerKey === 'string' ? integration.metadata.consumerKey : '';
  if (!storeUrl || !consumerKey || !integration.accessToken) {
    throw new Error('WOO_NOT_CONNECTED');
  }
  return {
    storeUrl,
    consumerKey,
    consumerSecret: integration.accessToken,
    webhookSecret:
      typeof integration.metadata?.webhookSecret === 'string'
        ? integration.metadata.webhookSecret
        : null,
  };
}

export async function getValidWooCommerceIntegration(userId: string): Promise<StoreIntegration> {
  const integration = await getIntegration(userId, 'woocommerce');
  if (!integration) throw new Error('WOO_NOT_CONNECTED');
  return integration;
}

export async function connectWooCommerce(
  userId: string,
  input: WooConnectInput
): Promise<StoreIntegration> {
  const storeUrl = normalizeWooStoreUrl(input.storeUrl);
  const consumerKey = input.consumerKey.trim();
  const consumerSecret = input.consumerSecret.trim();

  if (!consumerKey.startsWith('ck_') || !consumerSecret.startsWith('cs_')) {
    throw new Error('WOO_INVALID_KEYS');
  }

  // Validar credenciales con un listado mínimo
  await wooFetch<WooOrder[]>(storeUrl, consumerKey, consumerSecret, '/orders?per_page=1');

  let storeName = wooStoreHost(storeUrl);
  try {
    const system = await wooFetch<{ environment?: { site_url?: string }; settings?: { general?: { woocommerce_store_address?: string } } }>(
      storeUrl,
      consumerKey,
      consumerSecret,
      '/system_status'
    );
    if (system?.environment?.site_url) {
      storeName = system.environment.site_url;
    }
  } catch {
    // system_status puede requerir más permisos
  }

  const webhookSecret = randomBytes(24).toString('hex');
  const integration = await upsertIntegration({
    userId,
    platform: 'woocommerce',
    externalStoreId: wooStoreHost(storeUrl),
    externalUserId: wooStoreHost(storeUrl),
    accessToken: consumerSecret,
    metadata: {
      storeUrl,
      storeName,
      consumerKey,
      webhookSecret,
    },
  });

  try {
    await ensureWooCommerceOrderWebhooks(integration);
  } catch (err) {
    console.warn(
      '[WooCommerce] No se pudieron registrar webhooks tras connect:',
      err instanceof Error ? err.message : err
    );
  }

  return (await getIntegration(userId, 'woocommerce')) ?? integration;
}

export async function fetchWooCommerceOrder(
  integration: StoreIntegration,
  orderId: string | number
): Promise<WooOrder> {
  const creds = getWooCredentials(integration);
  return wooFetch<WooOrder>(
    creds.storeUrl,
    creds.consumerKey,
    creds.consumerSecret,
    `/orders/${orderId}`
  );
}

async function fetchWooCommerceOrders(
  integration: StoreIntegration,
  dateRange?: WooDateRange
): Promise<WooOrder[]> {
  const creds = getWooCredentials(integration);
  const all: WooOrder[] = [];

  for (let page = 1; page <= 20; page++) {
    const params = new URLSearchParams({
      per_page: '50',
      page: String(page),
      status: 'processing,completed',
      orderby: 'date',
      order: 'desc',
    });
    if (dateRange?.dateFrom) params.set('after', `${dateRange.dateFrom}T00:00:00`);
    if (dateRange?.dateTo) params.set('before', `${dateRange.dateTo}T23:59:59`);

    const orders = await wooFetch<WooOrder[]>(
      creds.storeUrl,
      creds.consumerKey,
      creds.consumerSecret,
      `/orders?${params}`
    );
    if (!Array.isArray(orders) || orders.length === 0) break;
    all.push(...orders);
    if (orders.length < 50) break;
  }

  return all;
}

export async function listWooCommerceHomeShipments(
  userId: string,
  dateRange?: WooDateRange
): Promise<WooHomeShipment[]> {
  const integration = await getValidWooCommerceIntegration(userId);
  const orders = await fetchWooCommerceOrders(integration, dateRange);
  const shipments: WooHomeShipment[] = [];
  for (const order of orders) {
    const shipment = mapWooOrderToShipment(order);
    if (shipment) shipments.push(shipment);
  }
  return shipments;
}

interface WooWebhookRegistration {
  id: number;
  name?: string;
  topic?: string;
  delivery_url?: string;
  status?: string;
}

export async function ensureWooCommerceOrderWebhooks(integration: StoreIntegration): Promise<void> {
  const creds = getWooCredentials(integration);
  const deliveryUrl = getWooCommerceOrderWebhookUrl();
  const secret = creds.webhookSecret || randomBytes(24).toString('hex');

  const existing = await wooFetch<WooWebhookRegistration[]>(
    creds.storeUrl,
    creds.consumerKey,
    creds.consumerSecret,
    '/webhooks?per_page=100'
  );

  const webhookIds: number[] =
    Array.isArray(integration.metadata?.webhookIds)
      ? (integration.metadata!.webhookIds as number[])
      : [];

  for (const topic of WOO_WEBHOOK_TOPICS) {
    const found = (existing || []).find(
      (wh) =>
        wh.topic === topic &&
        (wh.delivery_url || '').replace(/\/$/, '') === deliveryUrl.replace(/\/$/, '')
    );
    if (found?.id) {
      if (!webhookIds.includes(found.id)) webhookIds.push(found.id);
      continue;
    }

    const created = await wooFetch<WooWebhookRegistration>(
      creds.storeUrl,
      creds.consumerKey,
      creds.consumerSecret,
      '/webhooks',
      {
        method: 'POST',
        body: JSON.stringify({
          name: `Posta ${topic}`,
          topic,
          delivery_url: deliveryUrl,
          secret,
          status: 'active',
        }),
      }
    );
    if (created?.id) webhookIds.push(created.id);
  }

  await upsertIntegration({
    userId: integration.userId,
    platform: 'woocommerce',
    accessToken: integration.accessToken,
    metadata: {
      ...(integration.metadata ?? {}),
      storeUrl: creds.storeUrl,
      consumerKey: creds.consumerKey,
      webhookSecret: secret,
      orderWebhookUrl: deliveryUrl,
      webhookIds,
      webhooksEnsuredAt: new Date().toISOString(),
    },
  });
}

export async function deleteWooCommerceRemoteWebhooks(integration: StoreIntegration): Promise<void> {
  const creds = getWooCredentials(integration);
  const webhookIds = Array.isArray(integration.metadata?.webhookIds)
    ? (integration.metadata!.webhookIds as number[])
    : [];

  for (const id of webhookIds) {
    try {
      await wooFetch<void>(
        creds.storeUrl,
        creds.consumerKey,
        creds.consumerSecret,
        `/webhooks/${id}`,
        { method: 'DELETE' }
      );
    } catch (err) {
      console.warn('[WooCommerce] no se pudo borrar webhook remoto', {
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
