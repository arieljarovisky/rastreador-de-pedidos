import { env } from '../config/env.js';
import {
  getIntegration,
  upsertIntegration,
  type IntegrationPlatform,
  type StoreIntegration,
} from './integrations.service.js';

const ML_API = 'https://api.mercadolibre.com';

interface MlTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number;
}

interface MlUserResponse {
  id: number;
  nickname: string;
  site_id?: string;
}

interface MlOrderSearchResult {
  results: Array<{ id: number }>;
}

interface MlOrder {
  id: number;
  date_created: string;
  buyer: { nickname?: string; first_name?: string; last_name?: string; phone?: { number?: string } };
  shipping: { id: number };
}

interface MlShipment {
  id: number;
  logistic_type?: string;
  status?: string;
  receiver_address?: {
    address_line?: string;
    street_name?: string;
    street_number?: string;
    city?: { name?: string };
    state?: { name?: string };
    zip_code?: string;
    latitude?: number;
    longitude?: number;
    receiver_name?: string;
    receiver_phone?: string;
  };
}

export function getMercadoLibreAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.mercadolibre.appId,
    redirect_uri: env.mercadolibre.redirectUri,
    state,
  });
  return `https://auth.mercadolibre.com.ar/authorization?${params}`;
}

export async function exchangeMercadoLibreCode(
  userId: string,
  code: string
): Promise<StoreIntegration> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.mercadolibre.appId,
    client_secret: env.mercadolibre.appSecret,
    code,
    redirect_uri: env.mercadolibre.redirectUri,
  });

  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });

  if (!res.ok) throw new Error('ML_TOKEN_FAILED');
  const token = (await res.json()) as MlTokenResponse;

  const mlUserId = String(token.user_id ?? '');
  let nickname = mlUserId;
  if (mlUserId) {
    const userRes = await fetch(`${ML_API}/users/${mlUserId}`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (userRes.ok) {
      const user = (await userRes.json()) as MlUserResponse;
      nickname = user.nickname;
    }
  }

  const expiresAt =
    token.expires_in != null ? new Date(Date.now() + token.expires_in * 1000) : null;

  return upsertIntegration({
    userId,
    platform: 'mercadolibre',
    externalUserId: mlUserId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    tokenExpiresAt: expiresAt,
    metadata: { nickname },
  });
}

async function refreshMercadoLibreToken(integration: StoreIntegration): Promise<StoreIntegration> {
  if (!integration.refreshToken) return integration;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: env.mercadolibre.appId,
    client_secret: env.mercadolibre.appSecret,
    refresh_token: integration.refreshToken,
  });

  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) throw new Error('ML_TOKEN_REFRESH_FAILED');
  const token = (await res.json()) as MlTokenResponse;
  const expiresAt =
    token.expires_in != null ? new Date(Date.now() + token.expires_in * 1000) : null;

  return upsertIntegration({
    userId: integration.userId,
    platform: 'mercadolibre',
    externalUserId: integration.externalUserId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? integration.refreshToken,
    tokenExpiresAt: expiresAt,
    metadata: integration.metadata,
  });
}

export async function getValidMercadoLibreIntegration(userId: string): Promise<StoreIntegration> {
  const integration = await getIntegration(userId, 'mercadolibre');
  if (!integration) throw new Error('ML_NOT_CONNECTED');

  const expiresSoon =
    integration.tokenExpiresAt &&
    new Date(integration.tokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000;

  if (expiresSoon && integration.refreshToken) {
    return refreshMercadoLibreToken(integration);
  }
  return integration;
}

async function mlFetch<T>(integration: StoreIntegration, path: string): Promise<T> {
  const res = await fetch(`${ML_API}${path}`, {
    headers: { Authorization: `Bearer ${integration.accessToken}` },
  });
  if (!res.ok) throw new Error('ML_API_ERROR');
  return res.json() as Promise<T>;
}

function formatMlAddress(shipment: MlShipment): string {
  const addr = shipment.receiver_address;
  if (!addr) return '';
  if (addr.address_line?.trim()) return addr.address_line.trim();
  const parts = [
    [addr.street_name, addr.street_number].filter(Boolean).join(' '),
    addr.city?.name,
    addr.state?.name,
    addr.zip_code,
    'Argentina',
  ].filter(Boolean);
  return parts.join(', ');
}

function buyerName(order: MlOrder, shipment: MlShipment): string {
  const receiver = shipment.receiver_address?.receiver_name?.trim();
  if (receiver) return receiver;
  const first = order.buyer.first_name?.trim() ?? '';
  const last = order.buyer.last_name?.trim() ?? '';
  const full = `${first} ${last}`.trim();
  if (full) return full;
  return order.buyer.nickname?.trim() || `Comprador ML #${order.id}`;
}

export interface MercadoLibreFlexShipment {
  externalId: string;
  platform: IntegrationPlatform;
  shippingType: 'flex';
  clientName: string;
  clientPhone: string;
  address: string;
  lat?: number;
  lng?: number;
  notes: string;
  createdAt: string;
}

export async function listMercadoLibreFlexShipments(userId: string): Promise<MercadoLibreFlexShipment[]> {
  const integration = await getValidMercadoLibreIntegration(userId);
  const sellerId = integration.externalUserId;
  if (!sellerId) throw new Error('ML_NOT_CONNECTED');

  const search = await mlFetch<MlOrderSearchResult>(
    integration,
    `/orders/search?seller=${sellerId}&order.status=paid&sort=date_desc&limit=50`
  );

  const shipments: MercadoLibreFlexShipment[] = [];

  for (const item of search.results ?? []) {
    try {
      const order = await mlFetch<MlOrder>(integration, `/orders/${item.id}`);
      if (!order.shipping?.id) continue;

      const shipment = await mlFetch<MlShipment>(integration, `/shipments/${order.shipping.id}`);
      if (shipment.logistic_type !== 'self_service') continue;
      if (shipment.status === 'cancelled' || shipment.status === 'delivered') continue;

      const address = formatMlAddress(shipment);
      if (!address) continue;

      const lat = shipment.receiver_address?.latitude;
      const lng = shipment.receiver_address?.longitude;

      shipments.push({
        externalId: String(order.id),
        platform: 'mercadolibre',
        shippingType: 'flex',
        clientName: buyerName(order, shipment),
        clientPhone:
          shipment.receiver_address?.receiver_phone?.trim() ||
          order.buyer.phone?.number?.trim() ||
          '',
        address,
        lat: lat != null && Number.isFinite(Number(lat)) ? Number(lat) : undefined,
        lng: lng != null && Number.isFinite(Number(lng)) ? Number(lng) : undefined,
        notes: `Mercado Libre Flex · Orden #${order.id}`,
        createdAt: order.date_created,
      });
    } catch {
      // skip individual order errors
    }
  }

  return shipments;
}

export function isMercadoLibreConfigured(): boolean {
  return Boolean(env.mercadolibre.appId && env.mercadolibre.appSecret && env.mercadolibre.redirectUri);
}
