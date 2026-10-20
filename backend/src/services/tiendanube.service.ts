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
  /** Calle (sin altura). En la API de TN no incluye el número. */
  address?: string;
  street?: string;
  /** Altura / número de puerta. Puede venir como string o number según versión de API. */
  number?: string | number;
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
  shipping_option_reference?: string;
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

  const previous = await getIntegration(userId, 'tiendanube');
  const integration = await upsertIntegration({
    userId,
    platform: 'tiendanube',
    externalStoreId: storeId,
    externalUserId: storeId,
    accessToken: token.access_token,
    metadata: {
      ...(previous?.metadata ?? {}),
      storeName,
      scope: token.scope,
    },
  });

  try {
    await ensureTiendaNubeOrderWebhooks(integration);
  } catch (err) {
    console.warn(
      '[TN] No se pudieron registrar webhooks de pedidos tras OAuth:',
      err instanceof Error ? err.message : err
    );
  }

  try {
    await ensureTiendaNubeShippingCarrier(integration);
  } catch (err) {
    console.warn(
      '[TN] No se pudo registrar Shipping Carrier Posta tras OAuth:',
      err instanceof Error ? err.message : err
    );
  }

  return (await getIntegration(userId, 'tiendanube')) ?? integration;
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

/** Filtra placeholders que TN usa cuando el dato no está informado. */
function tnAddressPart(value: string | number | undefined | null): string {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (
    normalized === 'no informado' ||
    normalized === 'nao informado' ||
    normalized === 'not provided' ||
    normalized === 'n/a' ||
    normalized === '-'
  ) {
    return '';
  }
  return text;
}

function streetLineIncludesNumber(streetLine: string, number: string): boolean {
  const digits = number.replace(/\D/g, '');
  if (!digits) {
    const needle = number.toLowerCase();
    return streetLine.toLowerCase().includes(needle);
  }
  return new RegExp(`(^|\\D)${digits}(\\D|$)`).test(streetLine);
}

/** Detecta direcciones importadas sin altura (p. ej. "Bauness, 7 / PB, …"). */
export function addressMissingStreetNumber(address: string): boolean {
  const first = address.split(',')[0]?.trim() ?? '';
  return first.length > 0 && !/\d/.test(first);
}

/**
 * Arma la dirección de entrega de TN.
 * En la API, `address`/`street` es solo la calle y `number` es la altura;
 * hay que concatenarlos o el geocoder pierde la ubicación exacta.
 */
export function formatTnAddress(parts: TnDestination): string {
  const streetName = tnAddressPart(parts.address) || tnAddressPart(parts.street);
  const number = tnAddressPart(parts.number);
  const streetLine =
    streetName && number && !streetLineIncludesNumber(streetName, number)
      ? `${streetName} ${number}`
      : streetName || number;
  const province = normalizeProvince(parts.province);

  return [
    streetLine,
    tnAddressPart(parts.floor),
    tnAddressPart(parts.locality),
    tnAddressPart(parts.city),
    tnAddressPart(province),
    tnAddressPart(parts.zipcode),
    'Argentina',
  ]
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

  // Carrier / opción Posta (Shipping Carrier code "express" o nombre "Posta …")
  if (normalized === 'express' || normalized.includes('posta')) {
    return true;
  }

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

function orderIsPostaExpress(order: TnOrder): boolean {
  if (order.shipping_option_reference && normalizeShippingText(order.shipping_option_reference).includes('posta')) {
    return true;
  }

  for (const fulfillment of getOrderFulfillments(order)) {
    if (fulfillmentIsPickup(fulfillment)) continue;
    const optionCode = fulfillment.shipping?.option?.code;
    const optionName = fulfillment.shipping?.option?.name;
    const carrierName = fulfillment.shipping?.carrier?.name;
    const carrierNorm = carrierName ? normalizeShippingText(carrierName) : '';
    if (carrierNorm.includes('posta')) {
      if (
        !optionCode ||
        optionCode === 'express' ||
        isExpressShipping(optionCode) ||
        isExpressShipping(optionName)
      ) {
        return true;
      }
    }
    if (optionCode === 'express' && (carrierNorm.includes('posta') || isExpressShipping(optionName))) {
      return true;
    }
  }

  if (order.shipping_option_code === 'express' && isExpressShipping(order.shipping_option)) {
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
  if (orderIsPostaExpress(order)) return true;

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

/** Dirección de entrega TN (fulfillment destination o shipping_address). */
export function resolveTnOrderShippingAddress(order: TnOrder): string {
  const fulfillments = getOrderFulfillments(order);
  const deliverable = fulfillments.find((f) => !fulfillmentIsPickup(f));
  const dest = (deliverable ?? fulfillments[0])?.destination;
  if (dest) {
    const formatted = formatTnAddress(dest);
    if (formatted.replace(/,?\s*Argentina$/i, '').trim().length >= 5) return formatted;
  }
  if (order.shipping_address) {
    return formatTnAddress(order.shipping_address);
  }
  return '';
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

  const address = resolveTnOrderShippingAddress(order);

  if (!address || address.replace(/,?\s*Argentina$/i, '').trim().length < 5) return null;

  const fulfillment = deliverableFulfillment ?? fulfillments[0];
  const dest = fulfillment?.destination;
  const shippingAddr = order.shipping_address;

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

  const isPosta = orderIsPostaExpress(order);
  const prefix = isPosta ? 'Posta Express' : 'Tienda Nube Express';

  return {
    externalId: String(order.id),
    platform: 'tiendanube',
    shippingType: 'express',
    clientName,
    clientPhone,
    address,
    notes: `${prefix} · Pedido #${order.number ?? order.id} · ${shippingLabel}`,
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

const POSTA_CARRIER_NAME = 'Posta';
const POSTA_EXPRESS_OPTION_CODE = 'express';
export const DEFAULT_TN_SHIPPING_METHOD_NAME = 'Posta Express';
const TN_SHIPPING_METHOD_NAME_MAX = 40;

export interface TiendaNubeShippingMethodSettings {
  enabled: boolean;
  methodName: string;
}

/** Sin elección explícita del vendedor, el método no se ofrece en el checkout. */
export function readTiendaNubeShippingMethodSettings(
  metadata: Record<string, unknown> | null | undefined
): TiendaNubeShippingMethodSettings {
  const raw = typeof metadata?.shippingMethodName === 'string' ? metadata.shippingMethodName.trim() : '';
  return {
    enabled: metadata?.shippingEnabled === true,
    methodName:
      raw.length >= 2 && raw.length <= TN_SHIPPING_METHOD_NAME_MAX
        ? raw
        : DEFAULT_TN_SHIPPING_METHOD_NAME,
  };
}

export function normalizeTiendaNubeShippingMethodName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('TN_SHIPPING_NAME_INVALID');
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > TN_SHIPPING_METHOD_NAME_MAX) {
    throw new Error('TN_SHIPPING_NAME_INVALID');
  }
  return name;
}

export function getTiendaNubeShippingRatesUrl(): string {
  return `${env.publicUrl}/api/integrations/tiendanube/shipping/rates`;
}

interface TnShippingCarrier {
  id: number;
  name: string;
  callback_url?: string;
  types?: string;
  active?: boolean;
}

interface TnShippingCarrierOption {
  id: number;
  code: string;
  name: string;
  active?: boolean;
}

async function listTiendaNubeShippingCarriers(
  storeId: string,
  accessToken: string
): Promise<TnShippingCarrier[]> {
  const res = await fetch(`${TN_API}/${storeId}/shipping_carriers`, {
    headers: tnHeaders(accessToken),
  });
  if (!res.ok) {
    console.error('[TN] list shipping_carriers error:', res.status, await res.text().catch(() => ''));
    throw new Error('TN_API_ERROR');
  }
  const data = (await res.json()) as TnShippingCarrier[];
  return Array.isArray(data) ? data : [];
}

async function createTiendaNubeShippingCarrier(
  storeId: string,
  accessToken: string,
  active: boolean
): Promise<TnShippingCarrier> {
  const res = await fetch(`${TN_API}/${storeId}/shipping_carriers`, {
    method: 'POST',
    headers: tnHeaders(accessToken),
    body: JSON.stringify({
      name: POSTA_CARRIER_NAME,
      callback_url: getTiendaNubeShippingRatesUrl(),
      types: 'ship',
      active,
    }),
  });
  if (!res.ok) {
    console.error('[TN] create shipping_carrier error:', res.status, await res.text().catch(() => ''));
    throw new Error('TN_API_ERROR');
  }
  return (await res.json()) as TnShippingCarrier;
}

async function updateTiendaNubeShippingCarrier(
  storeId: string,
  accessToken: string,
  carrierId: number,
  active: boolean
): Promise<void> {
  const res = await fetch(`${TN_API}/${storeId}/shipping_carriers/${carrierId}`, {
    method: 'PUT',
    headers: tnHeaders(accessToken),
    body: JSON.stringify({
      name: POSTA_CARRIER_NAME,
      callback_url: getTiendaNubeShippingRatesUrl(),
      types: 'ship',
      active,
    }),
  });
  if (!res.ok) {
    console.error('[TN] update shipping_carrier error:', res.status, await res.text().catch(() => ''));
    throw new Error('TN_API_ERROR');
  }
}

async function listTiendaNubeShippingCarrierOptions(
  storeId: string,
  accessToken: string,
  carrierId: number
): Promise<TnShippingCarrierOption[]> {
  const res = await fetch(`${TN_API}/${storeId}/shipping_carriers/${carrierId}/options`, {
    headers: tnHeaders(accessToken),
  });
  if (!res.ok) {
    console.error('[TN] list shipping options error:', res.status, await res.text().catch(() => ''));
    throw new Error('TN_API_ERROR');
  }
  const data = (await res.json()) as TnShippingCarrierOption[];
  return Array.isArray(data) ? data : [];
}

async function createTiendaNubeShippingCarrierOption(
  storeId: string,
  accessToken: string,
  carrierId: number,
  settings: TiendaNubeShippingMethodSettings
): Promise<TnShippingCarrierOption> {
  const res = await fetch(`${TN_API}/${storeId}/shipping_carriers/${carrierId}/options`, {
    method: 'POST',
    headers: tnHeaders(accessToken),
    body: JSON.stringify({
      code: POSTA_EXPRESS_OPTION_CODE,
      name: settings.methodName,
      allow_free_shipping: false,
      active: settings.enabled,
    }),
  });
  if (!res.ok) {
    console.error('[TN] create shipping option error:', res.status, await res.text().catch(() => ''));
    throw new Error('TN_API_ERROR');
  }
  return (await res.json()) as TnShippingCarrierOption;
}

async function updateTiendaNubeShippingCarrierOption(
  storeId: string,
  accessToken: string,
  carrierId: number,
  optionId: number,
  settings: TiendaNubeShippingMethodSettings
): Promise<void> {
  const res = await fetch(`${TN_API}/${storeId}/shipping_carriers/${carrierId}/options/${optionId}`, {
    method: 'PUT',
    headers: tnHeaders(accessToken),
    body: JSON.stringify({
      code: POSTA_EXPRESS_OPTION_CODE,
      name: settings.methodName,
      allow_free_shipping: false,
      active: settings.enabled,
    }),
  });
  if (!res.ok) {
    console.error('[TN] update shipping option error:', res.status, await res.text().catch(() => ''));
    throw new Error('TN_API_ERROR');
  }
}

/**
 * Registra el carrier Posta en la tienda y aplica si está activo y con qué nombre.
 * Sin `settings`, usa lo guardado: apagado y «Posta Express» si el vendedor no eligió.
 */
export async function ensureTiendaNubeShippingCarrier(
  integration: StoreIntegration,
  settingsInput?: TiendaNubeShippingMethodSettings
): Promise<{ carrierId: number; optionId: number }> {
  const storeId = integration.externalStoreId;
  if (!storeId) throw new Error('TN_NOT_CONNECTED');

  const settings = settingsInput ?? readTiendaNubeShippingMethodSettings(integration.metadata);
  const carriers = await listTiendaNubeShippingCarriers(storeId, integration.accessToken);
  const storedCarrierId =
    typeof integration.metadata?.shippingCarrierId === 'number'
      ? integration.metadata.shippingCarrierId
      : null;

  let carrier =
    (storedCarrierId != null ? carriers.find((c) => c.id === storedCarrierId) : undefined) ??
    carriers.find((c) => (c.callback_url ?? '').includes('/tiendanube/shipping/rates')) ??
    carriers.find((c) => c.name.trim().toLowerCase() === POSTA_CARRIER_NAME.toLowerCase());

  if (!carrier) {
    carrier = await createTiendaNubeShippingCarrier(
      storeId,
      integration.accessToken,
      settings.enabled
    );
  } else {
    const expectedUrl = getTiendaNubeShippingRatesUrl();
    const carrierName = carrier.name.trim().toLowerCase();
    if (
      carrier.callback_url !== expectedUrl ||
      carrier.active !== settings.enabled ||
      carrierName !== POSTA_CARRIER_NAME.toLowerCase()
    ) {
      await updateTiendaNubeShippingCarrier(
        storeId,
        integration.accessToken,
        carrier.id,
        settings.enabled
      );
    }
  }

  const options = await listTiendaNubeShippingCarrierOptions(
    storeId,
    integration.accessToken,
    carrier.id
  );
  let option = options.find((o) => o.code === POSTA_EXPRESS_OPTION_CODE);
  if (!option) {
    option = await createTiendaNubeShippingCarrierOption(
      storeId,
      integration.accessToken,
      carrier.id,
      settings
    );
  } else if (option.name !== settings.methodName || option.active !== settings.enabled) {
    await updateTiendaNubeShippingCarrierOption(
      storeId,
      integration.accessToken,
      carrier.id,
      option.id,
      settings
    );
    option = { ...option, name: settings.methodName, active: settings.enabled };
  }

  await upsertIntegration({
    userId: integration.userId,
    platform: 'tiendanube',
    accessToken: integration.accessToken,
    metadata: {
      ...(integration.metadata ?? {}),
      shippingCarrierId: carrier.id,
      shippingExpressOptionId: option.id,
      shippingEnabled: settings.enabled,
      shippingMethodName: settings.methodName,
    },
  });

  return { carrierId: carrier.id, optionId: option.id };
}

export async function saveTiendaNubeShippingMethod(
  userId: string,
  input: { enabled: unknown; methodName: unknown }
): Promise<TiendaNubeShippingMethodSettings> {
  const integration = await getIntegration(userId, 'tiendanube');
  if (!integration) throw new Error('TN_NOT_CONNECTED');
  if (typeof input.enabled !== 'boolean') throw new Error('TN_SHIPPING_ENABLED_INVALID');
  const settings: TiendaNubeShippingMethodSettings = {
    enabled: input.enabled,
    methodName: normalizeTiendaNubeShippingMethodName(input.methodName),
  };
  await ensureTiendaNubeShippingCarrier(integration, settings);
  return settings;
}

export function isTiendaNubeConfigured(): boolean {
  return Boolean(env.tiendanube.appId && env.tiendanube.appSecret && env.tiendanube.redirectUri);
}

/**
 * Marca un pedido de Tienda Nube como entregado creando un tracking event con status "delivered".
 * Según la API de TN, esto actualiza automáticamente el fulfillment order a DELIVERED.
 */
/**
 * Publica el código/URL de seguimiento Posta en el fulfillment de TN
 * y notifica al comprador (notify_customer).
 */
export async function pushTiendaNubePublicTracking(
  sellerId: string,
  externalOrderId: string,
  tracking: { code: string; url: string }
): Promise<{ success: boolean; error?: string }> {
  const integration = await getIntegration(sellerId, 'tiendanube');
  if (!integration) return { success: false, error: 'TN_NOT_CONNECTED' };

  const storeId = integration.externalStoreId;
  if (!storeId) return { success: false, error: 'TN_NO_STORE_ID' };

  try {
    const order = await fetchTiendaNubeOrder(storeId, integration.accessToken, externalOrderId);
    const fulfillments = getOrderFulfillments(order);
    if (fulfillments.length === 0) {
      return { success: false, error: 'TN_NO_FULFILLMENTS' };
    }

    const deliverable = fulfillments.find((f) => !fulfillmentIsPickup(f));
    const fulfillmentId = deliverable?.id ?? fulfillments[0]?.id;
    if (!fulfillmentId) return { success: false, error: 'TN_NO_FULFILLMENT_ID' };

    const payload = {
      tracking_info: {
        code: tracking.code,
        url: tracking.url,
        notify_customer: true,
      },
    };

    const res = await fetch(
      `${TN_API}/${storeId}/orders/${externalOrderId}/fulfillment-orders/${fulfillmentId}`,
      {
        method: 'PATCH',
        headers: tnHeaders(integration.accessToken),
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      console.error(
        `[TN] Error al publicar tracking ${tracking.code}:`,
        res.status,
        errorText.slice(0, 300)
      );
      return { success: false, error: 'TN_TRACKING_PUSH_FAILED' };
    }

    console.log(`[TN] Tracking ${tracking.code} publicado para pedido ${externalOrderId}`);
    return { success: true };
  } catch (err) {
    console.error('[TN] Error al publicar tracking:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'TN_UNKNOWN_ERROR',
    };
  }
}

export async function markTiendaNubeOrderAsDelivered(
  sellerId: string,
  externalOrderId: string
): Promise<{ success: boolean; error?: string }> {
  const integration = await getIntegration(sellerId, 'tiendanube');
  if (!integration) {
    return { success: false, error: 'TN_NOT_CONNECTED' };
  }

  const storeId = integration.externalStoreId;
  if (!storeId) {
    return { success: false, error: 'TN_NO_STORE_ID' };
  }

  try {
    const order = await fetchTiendaNubeOrder(storeId, integration.accessToken, externalOrderId);

    const fulfillments = getOrderFulfillments(order);
    if (fulfillments.length === 0) {
      console.warn(`[TN] Pedido ${externalOrderId} sin fulfillment orders, no se puede marcar como entregado`);
      return { success: false, error: 'TN_NO_FULFILLMENTS' };
    }

    const deliverableFulfillment = fulfillments.find((f) => !fulfillmentIsPickup(f));
    const fulfillmentId = deliverableFulfillment?.id ?? fulfillments[0]?.id;

    if (!fulfillmentId) {
      return { success: false, error: 'TN_NO_FULFILLMENT_ID' };
    }

    const happenedAt = new Date().toISOString();

    const trackingEventRes = await fetch(
      `${TN_API}/${storeId}/orders/${externalOrderId}/fulfillment-orders/${fulfillmentId}/tracking-events`,
      {
        method: 'POST',
        headers: tnHeaders(integration.accessToken),
        body: JSON.stringify({
          status: 'delivered',
          happened_at: happenedAt,
          description: 'Entregado por Posta',
        }),
      }
    );

    if (!trackingEventRes.ok) {
      const errorText = await trackingEventRes.text().catch(() => '');
      console.error(
        `[TN] Error al crear tracking event para pedido ${externalOrderId}:`,
        trackingEventRes.status,
        errorText
      );

      if (trackingEventRes.status === 422) {
        return { success: true };
      }

      return { success: false, error: 'TN_TRACKING_EVENT_FAILED' };
    }

    console.log(`[TN] Pedido ${externalOrderId} marcado como entregado en Tienda Nube`);
    return { success: true };
  } catch (err) {
    console.error('[TN] Error al marcar pedido como entregado:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'TN_UNKNOWN_ERROR',
    };
  }
}
