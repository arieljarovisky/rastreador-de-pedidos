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
  shipping_address?: {
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
    province?: string;
    zipcode?: string;
    floor?: string;
    locality?: string;
  };
  shipping_option?: string;
  shipping_option_code?: string;
  fulfillments?: Array<{
    id: string;
    status?: string;
    shipping?: {
      type?: string;
      option?: { name?: string; code?: string };
      carrier?: { name?: string };
    };
    destination?: {
      name?: string;
      phone?: string;
      address?: string;
      city?: string;
      province?: string;
      zipcode?: string;
    };
  }>;
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
      headers: {
        Authentication: `bearer ${token.access_token}`,
        'User-Agent': 'LupoEnvios (contact@lupoenvios.com)',
      },
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
    Authentication: `bearer ${token}`,
    'User-Agent': 'LupoEnvios (contact@lupoenvios.com)',
    'Content-Type': 'application/json',
  };
}

function isExpressShipping(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return (
    normalized.includes('express') ||
    normalized.includes('rápido') ||
    normalized.includes('rapido') ||
    normalized.includes('urgente')
  );
}

function formatTnAddress(parts: {
  address?: string;
  city?: string;
  province?: string;
  zipcode?: string;
  floor?: string;
  locality?: string;
}): string {
  const line = [parts.address, parts.floor, parts.locality, parts.city, parts.province, parts.zipcode, 'Argentina']
    .filter((p) => p && String(p).trim())
    .join(', ');
  return line;
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

function orderIsExpress(order: TnOrder): boolean {
  if (isExpressShipping(order.shipping_option) || isExpressShipping(order.shipping_option_code)) {
    return true;
  }

  for (const fulfillment of order.fulfillments ?? []) {
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

function extractTnShipment(order: TnOrder): TiendaNubeExpressShipment | null {
  if (!orderIsExpress(order)) return null;
  if (order.payment_status && order.payment_status !== 'paid') return null;
  if (order.status === 'cancelled' || order.status === 'closed') return null;

  const fulfillment = order.fulfillments?.[0];
  const dest = fulfillment?.destination;
  const shippingAddr = order.shipping_address;

  const address = dest
    ? formatTnAddress(dest)
    : formatTnAddress({
        address: shippingAddr?.address,
        city: shippingAddr?.city,
        province: shippingAddr?.province,
        zipcode: shippingAddr?.zipcode,
        floor: shippingAddr?.floor,
        locality: shippingAddr?.locality,
      });

  if (!address) return null;

  const clientName =
    dest?.name?.trim() ||
    shippingAddr?.name?.trim() ||
    order.customer?.name?.trim() ||
    `Cliente TN #${order.number ?? order.id}`;

  const clientPhone =
    dest?.phone?.trim() || shippingAddr?.phone?.trim() || order.customer?.phone?.trim() || '';

  const shippingLabel =
    fulfillment?.shipping?.option?.name ||
    order.shipping_option ||
    'Express';

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

export async function listTiendaNubeExpressShipments(userId: string): Promise<TiendaNubeExpressShipment[]> {
  const integration = await getValidTiendaNubeIntegration(userId);
  const storeId = integration.externalStoreId;
  if (!storeId) throw new Error('TN_NOT_CONNECTED');

  const res = await fetch(
    `https://api.tiendanube.com/v1/${storeId}/orders?per_page=50&payment_status=paid&aggregates=fulfillment_orders`,
    { headers: tnHeaders(integration.accessToken) }
  );

  if (!res.ok) throw new Error('TN_API_ERROR');
  const orders = (await res.json()) as TnOrder[];

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
