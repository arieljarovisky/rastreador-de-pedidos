import { env } from '../config/env.js';
import { sleep } from '../utils/sleep.js';
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
  status?: string;
  date_created: string;
  buyer: { nickname?: string; first_name?: string; last_name?: string; phone?: { number?: string } };
  shipping: { id: number };
}

interface MlShipment {
  id: number;
  order_id?: number;
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
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${ML_API}${path}`, {
      headers: { Authorization: `Bearer ${integration.accessToken}` },
    });
    if (res.status === 429) {
      await sleep(800 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error('ML_API_ERROR');
    return res.json() as Promise<T>;
  }
  throw new Error('ML_API_ERROR');
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
  mlShipmentStatus?: string;
}

function buildFlexShipmentFromMl(
  order: MlOrder,
  shipment: MlShipment
): MercadoLibreFlexShipment | null {
  if (shipment.logistic_type !== 'self_service') return null;
  if (shipment.status === 'cancelled') return null;

  const address = formatMlAddress(shipment);
  if (!address) return null;

  const lat = shipment.receiver_address?.latitude;
  const lng = shipment.receiver_address?.longitude;

  return {
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
    mlShipmentStatus: shipment.status,
  };
}

export async function fetchMercadoLibreOrder(
  integration: StoreIntegration,
  mlOrderId: string
): Promise<MlOrder> {
  return mlFetch<MlOrder>(integration, `/orders/${mlOrderId}`);
}

export async function fetchMercadoLibreShipment(
  integration: StoreIntegration,
  mlShipmentId: string
): Promise<MlShipment> {
  return mlFetch<MlShipment>(integration, `/shipments/${mlShipmentId}`);
}

export async function fetchMercadoLibreFlexShipment(
  integration: StoreIntegration,
  mlOrderId: string
): Promise<MercadoLibreFlexShipment | null> {
  const order = await fetchMercadoLibreOrder(integration, mlOrderId);
  if (!order.shipping?.id) return null;
  const shipment = await fetchMercadoLibreShipment(integration, String(order.shipping.id));
  return buildFlexShipmentFromMl(order, shipment);
}

export async function fetchMercadoLibreFlexShipmentByShipmentId(
  integration: StoreIntegration,
  mlShipmentId: string
): Promise<MercadoLibreFlexShipment | null> {
  const shipment = await fetchMercadoLibreShipment(integration, mlShipmentId);
  if (!shipment.order_id) return null;
  const order = await fetchMercadoLibreOrder(integration, String(shipment.order_id));
  return buildFlexShipmentFromMl(order, shipment);
}

export type MercadoLibreScanCandidate = { type: 'order' | 'shipment'; id: string };

export function parseMercadoLibreScanCode(raw: string): MercadoLibreScanCandidate[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const candidates: MercadoLibreScanCandidate[] = [];
  const seen = new Set<string>();

  const add = (type: MercadoLibreScanCandidate['type'], id: string) => {
    const key = `${type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ type, id });
  };

  const urlOrder = trimmed.match(/\/orders\/(\d{8,})/i);
  const urlShipment = trimmed.match(/\/shipments\/(\d{8,})/i);
  if (urlOrder) add('order', urlOrder[1]);
  if (urlShipment) add('shipment', urlShipment[1]);

  const digitSequences = trimmed.match(/\d{8,}/g) ?? [];
  for (const seq of digitSequences) {
    if (/^2000\d{8,}$/.test(seq)) {
      add('order', seq);
    } else {
      add('shipment', seq);
    }
  }

  return candidates;
}

export async function resolveMercadoLibreFlexFromScan(
  integration: StoreIntegration,
  candidates: MercadoLibreScanCandidate[]
): Promise<MercadoLibreFlexShipment | null> {
  for (const candidate of candidates) {
    try {
      const flex =
        candidate.type === 'order'
          ? await fetchMercadoLibreFlexShipment(integration, candidate.id)
          : await fetchMercadoLibreFlexShipmentByShipmentId(integration, candidate.id);
      if (flex) return flex;
    } catch {
      // probar siguiente candidato o vendedor
    }
  }
  return null;
}

export async function listMercadoLibreFlexShipments(userId: string): Promise<MercadoLibreFlexShipment[]> {
  const integration = await getValidMercadoLibreIntegration(userId);
  const sellerId = integration.externalUserId;
  if (!sellerId) throw new Error('ML_NOT_CONNECTED');

  const shipments: MercadoLibreFlexShipment[] = [];
  const seenOrderIds = new Set<string>();
  const pageSize = 50;
  const maxPages = 4;

  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const search = await mlFetch<MlOrderSearchResult>(
      integration,
      `/orders/search?seller=${sellerId}&order.status=paid&sort=date_desc&limit=${pageSize}&offset=${offset}`
    );

    const results = search.results ?? [];
    if (results.length === 0) break;

    for (const item of results) {
      const orderId = String(item.id);
      if (seenOrderIds.has(orderId)) continue;
      seenOrderIds.add(orderId);

      try {
        await sleep(120);
        const flex = await fetchMercadoLibreFlexShipment(integration, orderId);
        if (!flex || flex.mlShipmentStatus === 'delivered') continue;
        shipments.push(flex);
      } catch {
        // omitir pedidos individuales con error temporal de la API
      }
    }

    if (results.length < pageSize) break;
  }

  return shipments;
}

export function isMercadoLibreConfigured(): boolean {
  return Boolean(env.mercadolibre.appId && env.mercadolibre.appSecret && env.mercadolibre.redirectUri);
}

export async function getMercadoLibreShippingLabelPdf(
  sellerUserId: string,
  mlOrderId: string
): Promise<Buffer> {
  const integration = await getValidMercadoLibreIntegration(sellerUserId);
  const order = await fetchMercadoLibreOrder(integration, mlOrderId);
  if (!order.shipping?.id) {
    throw new Error('ML_NO_SHIPMENT');
  }

  const shipmentId = String(order.shipping.id);
  const labelUrl = `${ML_API}/shipment_labels?shipment_ids=${encodeURIComponent(shipmentId)}&response_type=pdf`;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(labelUrl, {
      headers: { Authorization: `Bearer ${integration.accessToken}` },
    });
    if (res.status === 429) {
      await sleep(800 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      if (body.includes('not_printable_status')) {
        throw new Error('ML_LABEL_NOT_READY');
      }
      if (res.status === 404) {
        throw new Error('ML_LABEL_NOT_FOUND');
      }
      throw new Error('ML_LABEL_UNAVAILABLE');
    }
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('ML_LABEL_UNAVAILABLE');
}
