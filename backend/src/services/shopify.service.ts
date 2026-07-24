import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';
import {
  getIntegration,
  upsertIntegration,
  type IntegrationPlatform,
  type StoreIntegration,
} from './integrations.service.js';

const SHOPIFY_ORDER_WEBHOOK_TOPICS = ['ORDERS_PAID', 'ORDERS_CANCELLED', 'APP_UNINSTALLED'] as const;

export interface ShopifyAddress {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  phone?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
}

export interface ShopifyShippingLine {
  title?: string | null;
  code?: string | null;
  source?: string | null;
}

/** Pedido en formato REST (webhooks y Admin REST). */
export interface ShopifyOrder {
  id: number | string;
  name?: string;
  order_number?: number;
  created_at?: string;
  financial_status?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  phone?: string | null;
  note?: string | null;
  shipping_address?: ShopifyAddress | null;
  billing_address?: ShopifyAddress | null;
  shipping_lines?: ShopifyShippingLine[];
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    default_address?: ShopifyAddress | null;
  } | null;
}

export interface ShopifyHomeShipment {
  externalId: string;
  platform: IntegrationPlatform;
  shippingType: 'standard';
  clientName: string;
  clientPhone: string;
  address: string;
  notes: string;
  createdAt: string;
}

export interface ShopifyDateRange {
  dateFrom?: string;
  dateTo?: string;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 90;

export function isShopifyConfigured(): boolean {
  return Boolean(env.shopify.apiKey && env.shopify.apiSecret);
}

export function normalizeShopifyShopDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\?.*$/, '');
  if (!value) throw new Error('SHOPIFY_INVALID_SHOP');

  if (!value.includes('.')) {
    value = `${value}.myshopify.com`;
  }

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) {
    throw new Error('SHOPIFY_INVALID_SHOP');
  }

  return value;
}

export function getShopifyAuthUrl(shop: string, state: string): string {
  const shopDomain = normalizeShopifyShopDomain(shop);
  const params = new URLSearchParams({
    client_id: env.shopify.apiKey,
    scope: env.shopify.scopes,
    redirect_uri: env.shopify.redirectUri,
    state,
  });
  return `https://${shopDomain}/admin/oauth/authorize?${params}`;
}

export function verifyShopifyOAuthHmac(query: Record<string, unknown>): boolean {
  const hmac = typeof query.hmac === 'string' ? query.hmac : '';
  if (!hmac || !env.shopify.apiSecret) return false;

  const pairs = Object.entries(query)
    .filter(([key]) => key !== 'hmac' && key !== 'signature')
    .map(([key, value]) => {
      const normalized =
        Array.isArray(value) ? value.map(String).join(',') : value == null ? '' : String(value);
      return `${key}=${normalized}`;
    })
    .sort((a, b) => a.localeCompare(b));

  const digest = createHmac('sha256', env.shopify.apiSecret)
    .update(pairs.join('&'))
    .digest('hex');

  const expected = Buffer.from(digest, 'utf8');
  const received = Buffer.from(hmac, 'utf8');
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

export function verifyShopifyWebhookHmac(
  rawBody: string | Buffer,
  hmacHeader: string | undefined
): boolean {
  if (!hmacHeader || !env.shopify.apiSecret) return false;

  const digest = createHmac('sha256', env.shopify.apiSecret)
    .update(rawBody)
    .digest('base64');

  const expected = Buffer.from(digest, 'utf8');
  const received = Buffer.from(hmacHeader.trim(), 'utf8');
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

export function getShopifyOrderWebhookUrl(): string {
  return `${env.publicUrl}/api/integrations/shopify/webhooks/orders`;
}

export function getShopifyPrivacyWebhookUrls(): {
  customersDataRequest: string;
  customersRedact: string;
  shopRedact: string;
} {
  const base = `${env.publicUrl}/api/integrations/shopify/webhooks`;
  return {
    customersDataRequest: `${base}/customers-data-request`,
    customersRedact: `${base}/customers-redact`,
    shopRedact: `${base}/shop-redact`,
  };
}

interface ShopifyTokenResponse {
  access_token: string;
  scope?: string;
}

export async function exchangeShopifyCode(
  userId: string,
  shop: string,
  code: string
): Promise<StoreIntegration> {
  const shopDomain = normalizeShopifyShopDomain(shop);
  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.shopify.apiKey,
      client_secret: env.shopify.apiSecret,
      code,
    }),
  });

  if (!res.ok) {
    console.error('[Shopify] token exchange failed:', res.status, await res.text().catch(() => ''));
    throw new Error('SHOPIFY_TOKEN_FAILED');
  }

  const token = (await res.json()) as ShopifyTokenResponse;
  if (!token.access_token) throw new Error('SHOPIFY_TOKEN_FAILED');

  let storeName = shopDomain;
  try {
    const shopInfo = await shopifyGraphql<{ shop?: { name?: string } }>(
      shopDomain,
      token.access_token,
      `query { shop { name } }`
    );
    if (shopInfo.shop?.name) storeName = shopInfo.shop.name;
  } catch {
    // optional
  }

  const integration = await upsertIntegration({
    userId,
    platform: 'shopify',
    externalStoreId: shopDomain,
    externalUserId: shopDomain,
    accessToken: token.access_token,
    metadata: { shop: shopDomain, storeName, scope: token.scope },
  });

  try {
    await ensureShopifyOrderWebhooks(integration);
  } catch (err) {
    console.warn(
      '[Shopify] No se pudieron registrar webhooks tras OAuth:',
      err instanceof Error ? err.message : err
    );
  }

  return (await getIntegration(userId, 'shopify')) ?? integration;
}

export async function getValidShopifyIntegration(userId: string): Promise<StoreIntegration> {
  const integration = await getIntegration(userId, 'shopify');
  if (!integration) throw new Error('SHOPIFY_NOT_CONNECTED');
  return integration;
}

async function shopifyGraphql<T>(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(
    `https://${shopDomain}/admin/api/${env.shopify.apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!res.ok) {
    console.error('[Shopify] GraphQL HTTP error:', res.status, await res.text().catch(() => ''));
    throw new Error('SHOPIFY_API_ERROR');
  }

  const json = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (json.errors?.length) {
    console.error('[Shopify] GraphQL errors:', json.errors);
    throw new Error('SHOPIFY_API_ERROR');
  }
  if (!json.data) throw new Error('SHOPIFY_API_ERROR');
  return json.data;
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
    normalized.includes('en tienda') ||
    normalized.includes('store pickup')
  );
}

function formatShopifyAddress(addr: ShopifyAddress | null | undefined): string {
  if (!addr) return '';
  const nameLine = [addr.address1, addr.address2].filter((p) => p && String(p).trim()).join(', ');
  return [nameLine, addr.city, addr.province, addr.zip, addr.country || 'Argentina']
    .filter((p) => p && String(p).trim())
    .join(', ');
}

function clientNameFromAddress(addr: ShopifyAddress | null | undefined): string {
  if (!addr) return '';
  if (addr.name?.trim()) return addr.name.trim();
  return [addr.first_name, addr.last_name].filter((p) => p && String(p).trim()).join(' ').trim();
}

export function isShopifyOrderCancelled(order: ShopifyOrder): boolean {
  return Boolean(order.cancelled_at);
}

export function isShopifyOrderPaid(order: ShopifyOrder): boolean {
  const status = (order.financial_status || '').toLowerCase();
  return status === 'paid' || status === 'partially_paid';
}

/** Mapea un pedido Shopify a envío a domicilio importable, o null si no aplica. */
export function mapShopifyOrderToShipment(order: ShopifyOrder): ShopifyHomeShipment | null {
  if (!isShopifyOrderPaid(order)) return null;
  if (isShopifyOrderCancelled(order)) return null;

  const shippingLines = order.shipping_lines ?? [];
  if (shippingLines.length > 0 && shippingLines.every((line) => isPickupShipping(line.title) || isPickupShipping(line.code))) {
    return null;
  }
  if (shippingLines.some((line) => isPickupShipping(line.title) || isPickupShipping(line.code))) {
    // mixto con pickup dominante: si no hay shipping address, omitir
    if (!order.shipping_address) return null;
  }

  const address = formatShopifyAddress(order.shipping_address);
  if (!address || address.replace(/,?\s*Argentina$/i, '').trim().length < 5) return null;

  const clientName =
    clientNameFromAddress(order.shipping_address) ||
    clientNameFromAddress(order.customer?.default_address) ||
    [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ').trim() ||
    `Cliente Shopify ${order.name ?? `#${order.id}`}`;

  const clientPhone =
    order.shipping_address?.phone?.trim() ||
    order.phone?.trim() ||
    order.customer?.phone?.trim() ||
    order.billing_address?.phone?.trim() ||
    '';

  const shippingLabel =
    shippingLines.map((l) => l.title).filter(Boolean).join(', ') || 'Envío a domicilio';

  return {
    externalId: String(order.id),
    platform: 'shopify',
    shippingType: 'standard',
    clientName,
    clientPhone,
    address,
    notes: `Shopify · Pedido ${order.name ?? `#${order.order_number ?? order.id}`} · ${shippingLabel}`,
    createdAt: order.created_at || new Date().toISOString(),
  };
}

export function parseShopifyDateRange(
  dateFrom?: string,
  dateTo?: string
): ShopifyDateRange | undefined {
  const from = dateFrom?.trim();
  const to = dateTo?.trim();
  if (!from && !to) return undefined;

  if ((from && !DATE_ONLY_RE.test(from)) || (to && !DATE_ONLY_RE.test(to))) {
    throw new Error('SHOPIFY_INVALID_DATE');
  }
  if (from && to && from > to) {
    throw new Error('SHOPIFY_INVALID_DATE_RANGE');
  }

  if (from && to) {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > MAX_RANGE_DAYS) {
      throw new Error('SHOPIFY_DATE_RANGE_TOO_LONG');
    }
  }

  return { dateFrom: from, dateTo: to };
}

function gidToNumericId(gid: string): string {
  const parts = gid.split('/');
  return parts[parts.length - 1] || gid;
}

interface GqlOrderNode {
  id: string;
  name?: string;
  createdAt?: string;
  displayFinancialStatus?: string;
  cancelledAt?: string | null;
  phone?: string | null;
  note?: string | null;
  shippingAddress?: {
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    phone?: string | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    province?: string | null;
    zip?: string | null;
    country?: string | null;
  } | null;
  shippingLines?: {
    nodes?: Array<{ title?: string | null; code?: string | null }>;
  };
  customer?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

function gqlOrderToRest(order: GqlOrderNode): ShopifyOrder {
  const addr = order.shippingAddress;
  return {
    id: gidToNumericId(order.id),
    name: order.name,
    created_at: order.createdAt,
    financial_status: order.displayFinancialStatus?.toLowerCase(),
    cancelled_at: order.cancelledAt,
    phone: order.phone,
    note: order.note,
    shipping_address: addr
      ? {
          first_name: addr.firstName,
          last_name: addr.lastName,
          name: addr.name,
          phone: addr.phone,
          address1: addr.address1,
          address2: addr.address2,
          city: addr.city,
          province: addr.province,
          zip: addr.zip,
          country: addr.country,
        }
      : null,
    shipping_lines: (order.shippingLines?.nodes ?? []).map((line) => ({
      title: line.title,
      code: line.code,
    })),
    customer: order.customer
      ? {
          first_name: order.customer.firstName,
          last_name: order.customer.lastName,
        }
      : null,
  };
}

async function fetchShopifyOrdersGraphql(
  shopDomain: string,
  accessToken: string,
  dateRange?: ShopifyDateRange
): Promise<ShopifyOrder[]> {
  const queryParts = ['financial_status:paid'];
  if (dateRange?.dateFrom) queryParts.push(`created_at:>='${dateRange.dateFrom}T00:00:00-03:00'`);
  if (dateRange?.dateTo) queryParts.push(`created_at:<='${dateRange.dateTo}T23:59:59-03:00'`);

  const all: ShopifyOrder[] = [];
  let cursor: string | null = null;

  type OrdersPage = {
    orders: {
      pageInfo: { hasNextPage: boolean; endCursor?: string | null };
      nodes: GqlOrderNode[];
    };
  };

  for (let page = 0; page < 20; page++) {
    const data: OrdersPage = await shopifyGraphql<OrdersPage>(
      shopDomain,
      accessToken,
      `query ($query: String!, $cursor: String) {
        orders(first: 50, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            name
            createdAt
            displayFinancialStatus
            cancelledAt
            phone
            note
            shippingAddress {
              firstName lastName name phone address1 address2 city province zip country
            }
            shippingLines(first: 5) { nodes { title code } }
            customer { firstName lastName }
          }
        }
      }`,
      { query: queryParts.join(' '), cursor }
    );

    for (const node of data.orders.nodes) {
      all.push(gqlOrderToRest(node));
    }

    if (!data.orders.pageInfo.hasNextPage || !data.orders.pageInfo.endCursor) break;
    cursor = data.orders.pageInfo.endCursor;
  }

  return all;
}

export async function fetchShopifyOrder(
  shopDomain: string,
  accessToken: string,
  orderId: string | number
): Promise<ShopifyOrder> {
  const gid = String(orderId).startsWith('gid://')
    ? String(orderId)
    : `gid://shopify/Order/${orderId}`;

  const data = await shopifyGraphql<{ order: GqlOrderNode | null }>(
    shopDomain,
    accessToken,
    `query ($id: ID!) {
      order(id: $id) {
        id
        name
        createdAt
        displayFinancialStatus
        cancelledAt
        phone
        note
        shippingAddress {
          firstName lastName name phone address1 address2 city province zip country
        }
        shippingLines(first: 5) { nodes { title code } }
        customer { firstName lastName }
      }
    }`,
    { id: gid }
  );

  if (!data.order) throw new Error('SHOPIFY_API_ERROR');
  return gqlOrderToRest(data.order);
}

export async function listShopifyHomeShipments(
  userId: string,
  dateRange?: ShopifyDateRange
): Promise<ShopifyHomeShipment[]> {
  const integration = await getValidShopifyIntegration(userId);
  const shopDomain = integration.externalStoreId;
  if (!shopDomain) throw new Error('SHOPIFY_NOT_CONNECTED');

  const orders = await fetchShopifyOrdersGraphql(shopDomain, integration.accessToken, dateRange);
  const shipments: ShopifyHomeShipment[] = [];
  for (const order of orders) {
    const shipment = mapShopifyOrderToShipment(order);
    if (shipment) shipments.push(shipment);
  }
  return shipments;
}

export async function ensureShopifyOrderWebhooks(integration: StoreIntegration): Promise<void> {
  const shopDomain = integration.externalStoreId;
  if (!shopDomain) return;

  const callbackUrl = getShopifyOrderWebhookUrl();
  const existing = await shopifyGraphql<{
    webhookSubscriptions: {
      nodes: Array<{ id: string; topic: string; endpoint?: { __typename?: string; callbackUrl?: string } }>;
    };
  }>(
    shopDomain,
    integration.accessToken,
    `query {
      webhookSubscriptions(first: 50) {
        nodes {
          id
          topic
          endpoint {
            __typename
            ... on WebhookHttpEndpoint { callbackUrl }
          }
        }
      }
    }`
  );

  for (const topic of SHOPIFY_ORDER_WEBHOOK_TOPICS) {
    const already = existing.webhookSubscriptions.nodes.some(
      (node) =>
        node.topic === topic &&
        node.endpoint?.callbackUrl?.replace(/\/$/, '') === callbackUrl.replace(/\/$/, '')
    );
    if (already) continue;

    const result = await shopifyGraphql<{
      webhookSubscriptionCreate?: {
        userErrors?: Array<{ message?: string }>;
      };
    }>(
      shopDomain,
      integration.accessToken,
      `mutation ($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          userErrors { field message }
          webhookSubscription { id topic }
        }
      }`,
      {
        topic,
        webhookSubscription: {
          format: 'JSON',
          uri: callbackUrl,
        },
      }
    );

    const errors = result.webhookSubscriptionCreate?.userErrors ?? [];
    if (errors.length) {
      console.warn('[Shopify] webhook create errors', { topic, errors });
    }
  }

  await upsertIntegration({
    userId: integration.userId,
    platform: 'shopify',
    accessToken: integration.accessToken,
    metadata: {
      ...(integration.metadata ?? {}),
      shop: shopDomain,
      orderWebhookUrl: callbackUrl,
      webhooksEnsuredAt: new Date().toISOString(),
    },
  });
}
