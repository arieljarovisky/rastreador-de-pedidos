import { env } from '../config/env.js';
import {
  getIntegration,
  upsertIntegration,
  type IntegrationPlatform,
  type StoreIntegration,
} from './integrations.service.js';

const TN_AUTH = 'https://www.tiendanube.com/apps';

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

interface TnOrder {
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
    const storeRes = await fetch(`https://api.tiendanube.com/v1/${storeId}/store`, {
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

  return upsertIntegration({
    userId,
    platform: 'tiendanube',
    externalStoreId: storeId,
    externalUserId: storeId,
    accessToken: token.access_token,
    metadata: { storeName, scope: token.scope },
  });
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

function isExpressShipping(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return (
    normalized.includes('express') ||
    normalized.includes('rápido') ||
    normalized.includes('rapido') ||
    normalized.includes('urgente') ||
    normalized.includes('nube') ||
    normalized.includes('envío') ||
    normalized.includes('envio') ||
    normalized.includes('domicilio') ||
    normalized.includes('same day') ||
    normalized.includes('sameday') ||
    normalized.includes('flash') ||
    normalized.includes('correo') ||
    normalized.includes('andreani') ||
    normalized.includes('oca')
  );
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

function orderHasDeliveryAddress(order: TnOrder): boolean {
  const fulfillment = getOrderFulfillments(order).find((f) => !fulfillmentIsPickup(f));
  if (fulfillment?.destination) {
    const addr = formatTnAddress(fulfillment.destination);
    if (addr.replace(/,?\s*Argentina$/i, '').trim().length > 5) return true;
  }

  if (order.shipping_address) {
    const addr = formatTnAddress(order.shipping_address);
    if (addr.replace(/,?\s*Argentina$/i, '').trim().length > 5) return true;
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

function extractTnShipment(order: TnOrder): TiendaNubeExpressShipment | null {
  if (order.payment_status && order.payment_status !== 'paid') return null;
  if (order.status === 'cancelled' || order.status === 'closed') return null;

  const fulfillments = getOrderFulfillments(order);
  const deliverableFulfillment = fulfillments.find((f) => !fulfillmentIsPickup(f));
  const isPickupOnly =
    fulfillments.length > 0 && fulfillments.every((f) => fulfillmentIsPickup(f));

  if (isPickupOnly || isPickupShipping(order.shipping_option) || isPickupShipping(order.shipping_option_code)) {
    return null;
  }

  if (!orderIsExpress(order) && !orderHasDeliveryAddress(order)) return null;

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
    notes: `Tienda Nube · Pedido #${order.number ?? order.id} · ${shippingLabel}`,
    createdAt: order.created_at,
  };
}

export async function listTiendaNubeExpressShipments(userId: string): Promise<TiendaNubeExpressShipment[]> {
  const integration = await getValidTiendaNubeIntegration(userId);
  const storeId = integration.externalStoreId;
  if (!storeId) throw new Error('TN_NOT_CONNECTED');

  const res = await fetch(
    `https://api.tiendanube.com/v1/${storeId}/orders?per_page=50&payment_status=paid&aggregates=fulfillment_orders`,
    { headers: tnHeaders(integration.accessToken) }
  );

  if (!res.ok) {
    console.error('[TN] orders API error:', res.status, await res.text().catch(() => ''));
    throw new Error('TN_API_ERROR');
  }

  const orders = (await res.json()) as TnOrder[];
  if (!Array.isArray(orders)) {
    console.error('[TN] unexpected orders response:', orders);
    throw new Error('TN_API_ERROR');
  }

  const shipments: TiendaNubeExpressShipment[] = [];
  for (const order of orders) {
    const shipment = extractTnShipment(order);
    if (shipment) shipments.push(shipment);
  }
  return shipments;
}

export function isTiendaNubeConfigured(): boolean {
  return Boolean(env.tiendanube.appId && env.tiendanube.appSecret && env.tiendanube.redirectUri);
}
