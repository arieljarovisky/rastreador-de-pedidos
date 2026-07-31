import { createHash, randomBytes } from 'crypto';
import { env } from '../config/env.js';
import { sleep } from '../utils/sleep.js';
import type { Order } from '../types/index.js';
import { OrderStatus } from '../types/index.js';
import {
  findOrderByExternal,
  findOrderByExternalGlobal,
} from './orders.service.js';
import {
  getIntegration,
  upsertIntegration,
  type IntegrationPlatform,
  type StoreIntegration,
} from './integrations.service.js';
import { UserRole } from '../types/index.js';
import { deliveryDeadlineFromIsoDate } from '../utils/delivery-deadline.js';
import { isMlRescheduleSubstatus } from '../utils/ml-reschedule.js';

const ML_API = 'https://api.mercadolibre.com';
const ML_FETCH_TIMEOUT_MS = 20_000;

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Par PKCE (S256) para apps ML con "Requiere PKCE". */
export function createMercadoLibrePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

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
  pack_id?: number | null;
  status?: string;
  date_created: string;
  buyer: { nickname?: string; first_name?: string; last_name?: string; phone?: { number?: string } };
  shipping: { id: number };
  order_items?: Array<{ quantity?: number }>;
}

interface MlShipment {
  id: number;
  order_id?: number;
  logistic_type?: string;
  status?: string;
  substatus?: string | null;
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

export function getMercadoLibreAuthUrl(
  state: string,
  codeChallenge?: string,
  options?: { forceLogin?: boolean }
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.mercadolibre.appId,
    redirect_uri: env.mercadolibre.redirectUri,
    state,
  });
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  const authUrl = `https://auth.mercadolibre.com.ar/authorization?${params}`;
  if (!options?.forceLogin) return authUrl;

  // Cierra la sesión ML y vuelve al authorize: así reaparece el cartel de permisos
  // (si el grant ya fue revocado). Sin logout, ML reutiliza la sesión y saltea el consentimiento.
  const site = (env.mercadolibre.siteId || 'MLA').toLowerCase();
  return `https://www.mercadolibre.com/jms/${site}/lgz/logout?go=${encodeURIComponent(authUrl)}`;
}

/**
 * Revoca el grant de la app en la cuenta ML del usuario.
 * Sin esto, al reconectar ML saltea el cartel de "Autorizar".
 */
export async function revokeMercadoLibreAuthorization(
  integration: Pick<StoreIntegration, 'externalUserId' | 'accessToken'>
): Promise<boolean> {
  const mlUserId = integration.externalUserId?.trim();
  const accessToken = integration.accessToken?.trim();
  const appId = env.mercadolibre.appId?.trim();
  if (!mlUserId || !accessToken || !appId) return false;

  try {
    const res = await fetch(`${ML_API}/users/${mlUserId}/applications/${appId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[ml-oauth] revoke failed', { status: res.status, body: body.slice(0, 300) });
      return false;
    }
    console.log('[ml-oauth] autorización ML revocada', { mlUserId });
    return true;
  } catch (err) {
    console.warn('[ml-oauth] revoke error', err);
    return false;
  }
}

/** Intenta refrescar el token y revocar el grant; best-effort. */
export async function revokeMercadoLibreForUser(userId: string): Promise<void> {
  const integration = await getIntegration(userId, 'mercadolibre');
  if (!integration) return;

  let target = integration;
  try {
    if (tokenExpiresSoon(integration) && integration.refreshToken) {
      target = await refreshMercadoLibreToken(integration);
    }
  } catch (err) {
    console.warn('[ml-oauth] no se pudo refrescar token antes de revocar', err);
  }

  await revokeMercadoLibreAuthorization(target);
}

export async function exchangeMercadoLibreCode(
  userId: string,
  code: string,
  codeVerifier?: string
): Promise<StoreIntegration> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.mercadolibre.appId,
    client_secret: env.mercadolibre.appSecret,
    code,
    redirect_uri: env.mercadolibre.redirectUri,
  });
  if (codeVerifier) body.set('code_verifier', codeVerifier);

  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('[ml-oauth] token exchange failed', {
      status: res.status,
      body: errBody.slice(0, 400),
      hasPkce: Boolean(codeVerifier),
    });
    throw new Error('ML_TOKEN_FAILED');
  }
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

const refreshInFlightByUserId = new Map<string, Promise<StoreIntegration>>();

function tokenExpiresSoon(integration: StoreIntegration): boolean {
  return Boolean(
    integration.tokenExpiresAt &&
      new Date(integration.tokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000
  );
}

async function refreshMercadoLibreToken(integration: StoreIntegration): Promise<StoreIntegration> {
  const existing = refreshInFlightByUserId.get(integration.userId);
  if (existing) return existing;

  const promise = doRefreshMercadoLibreToken(integration).finally(() => {
    refreshInFlightByUserId.delete(integration.userId);
  });
  refreshInFlightByUserId.set(integration.userId, promise);
  return promise;
}

async function doRefreshMercadoLibreToken(integration: StoreIntegration): Promise<StoreIntegration> {
  // Otro request pudo renovar mientras esperábamos el single-flight.
  const latest = await getIntegration(integration.userId, 'mercadolibre');
  if (latest && !tokenExpiresSoon(latest)) return latest;

  const refreshToken = latest?.refreshToken ?? integration.refreshToken;
  if (!refreshToken) return latest ?? integration;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: env.mercadolibre.appId,
    client_secret: env.mercadolibre.appSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    // Race típica: otro proceso ya usó el refresh_token; re-leer DB.
    const afterFail = await getIntegration(integration.userId, 'mercadolibre');
    if (
      afterFail &&
      afterFail.accessToken !== (latest ?? integration).accessToken &&
      !tokenExpiresSoon(afterFail)
    ) {
      return afterFail;
    }
    const errBody = await res.text().catch(() => '');
    console.error('[ml-oauth] token refresh failed', {
      userId: integration.userId,
      status: res.status,
      body: errBody.slice(0, 400),
    });
    throw new Error('ML_TOKEN_REFRESH_FAILED');
  }
  const token = (await res.json()) as MlTokenResponse;
  const expiresAt =
    token.expires_in != null ? new Date(Date.now() + token.expires_in * 1000) : null;

  return upsertIntegration({
    userId: integration.userId,
    platform: 'mercadolibre',
    externalUserId: (latest ?? integration).externalUserId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? refreshToken,
    tokenExpiresAt: expiresAt,
    metadata: (latest ?? integration).metadata,
  });
}

export async function getValidMercadoLibreIntegration(userId: string): Promise<StoreIntegration> {
  const integration = await getIntegration(userId, 'mercadolibre');
  if (!integration) throw new Error('ML_NOT_CONNECTED');

  if (tokenExpiresSoon(integration) && integration.refreshToken) {
    return refreshMercadoLibreToken(integration);
  }
  return integration;
}

/** Igual que getValid, pero null si no hay conexión o el refresh falló. */
export async function tryGetValidMercadoLibreIntegration(
  userId: string
): Promise<StoreIntegration | null> {
  try {
    return await getValidMercadoLibreIntegration(userId);
  } catch {
    return null;
  }
}

async function mlFetch<T>(
  integration: StoreIntegration,
  path: string,
  options?: { quietStatuses?: number[] }
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${ML_API}${path}`, {
      headers: { Authorization: `Bearer ${integration.accessToken}` },
      signal: AbortSignal.timeout(ML_FETCH_TIMEOUT_MS),
    });
    if (res.status === 429) {
      await sleep(800 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      if (!options?.quietStatuses?.includes(res.status)) {
        const body = await res.text().catch(() => '');
        console.warn('[ml-api] error', {
          status: res.status,
          path,
          integrationUserId: integration.userId,
          body: body.slice(0, 200),
        });
      }
      throw new Error(`ML_API_ERROR_${res.status}`);
    }
    return res.json() as Promise<T>;
  }
  throw new Error('ML_API_ERROR');
}

function formatMlAddress(shipment: MlShipment): string {
  const addr = shipment.receiver_address;
  if (!addr) return '';
  const line = unmaskMlText(addr.address_line);
  if (line) return line;
  const parts = [
    [unmaskMlText(addr.street_name), unmaskMlText(addr.street_number)].filter(Boolean).join(' '),
    unmaskMlText(addr.city?.name),
    unmaskMlText(addr.state?.name),
    unmaskMlText(addr.zip_code),
    'Argentina',
  ].filter(Boolean);
  // Si solo quedó "Argentina", el domicilio sigue oculto.
  if (parts.length <= 1) return '';
  return parts.join(', ');
}

function buyerName(order: MlOrder, shipment: MlShipment): string {
  const receiver = unmaskMlText(shipment.receiver_address?.receiver_name);
  if (receiver) return receiver;
  const first = unmaskMlText(order.buyer.first_name);
  const last = unmaskMlText(order.buyer.last_name);
  const full = `${first} ${last}`.trim();
  if (full) return full;
  const nick = unmaskMlText(order.buyer.nickname);
  if (nick) return nick;
  return `Comprador ML #${order.id}`;
}

/** ML oculta PII con "XXXXXXX" hasta confirmar pago / según permisos del token. */
export function isMercadoLibreMaskedValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const t = value.trim();
  if (!t) return false;
  return /^X{3,}$/i.test(t) || /^\*{3,}$/.test(t);
}

function unmaskMlText(value: string | null | undefined): string {
  const t = value?.trim() ?? '';
  if (!t || isMercadoLibreMaskedValue(t)) return '';
  return t;
}

export function orderHasMaskedMercadoLibreContact(order: Pick<Order, 'clientName' | 'clientPhone' | 'address'>): boolean {
  const firstLine = order.address?.split(',')[0]?.trim() ?? '';
  return (
    isMercadoLibreMaskedValue(order.clientName) ||
    isMercadoLibreMaskedValue(order.clientPhone) ||
    isMercadoLibreMaskedValue(order.address) ||
    isMercadoLibreMaskedValue(firstLine) ||
    !order.address?.trim()
  );
}

/** Datos de contacto legibles desde un shipment ML (sin máscara). */
export function extractContactFromMlShipment(shipment: MlShipment): {
  clientName: string;
  clientPhone: string;
  address: string;
  lat?: number;
  lng?: number;
} | null {
  const address = formatMlAddress(shipment);
  if (!address) return null;
  const clientName = unmaskMlText(shipment.receiver_address?.receiver_name);
  const clientPhone = unmaskMlText(shipment.receiver_address?.receiver_phone);
  const lat = shipment.receiver_address?.latitude;
  const lng = shipment.receiver_address?.longitude;
  return {
    clientName,
    clientPhone,
    address,
    lat: lat != null && Number.isFinite(Number(lat)) ? Number(lat) : undefined,
    lng: lng != null && Number.isFinite(Number(lng)) ? Number(lng) : undefined,
  };
}

export interface MercadoLibreFlexShipment {
  /** ID del envío ML — clave de deduplicación (varias órdenes pueden compartirlo). */
  externalId: string;
  /** Orden ML representativa del envío (etiquetas y referencia legible). */
  mlOrderId: string;
  mlPackId?: string;
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
  mlShipmentSubstatus?: string | null;
  /** Productos en la venta (suma de cantidades en order_items), como en ML. */
  mlProductCount?: number;
  /** Órdenes MLA agrupadas (mismo pack o envío). Solo informativo. */
  mlOrderIds?: string[];
}

function countOrderProducts(order: MlOrder): number {
  const items = order.order_items ?? [];
  if (items.length === 0) return 1;
  return items.reduce((sum, item) => sum + Math.max(1, item.quantity ?? 1), 0);
}

function buildFlexNotes(order: MlOrder, shipment: MlShipment): string {
  const productCount = countOrderProducts(order);
  const products =
    productCount > 1 ? ` · Paquete de ${productCount} productos` : '';
  const pack = order.pack_id != null ? ` · Pack MLA #${order.pack_id}` : '';
  return `Mercado Libre Flex · Envío #${shipment.id}${pack}${products} · Orden #${order.id}`;
}

export type MercadoLibreFlexRef = Pick<MercadoLibreFlexShipment, 'externalId' | 'mlOrderId'>;

export async function findImportedMercadoLibreFlex(
  sellerId: string,
  flex: MercadoLibreFlexRef
): Promise<Order | null> {
  // Un envío físico Flex = un pedido en Posta (packs comparten externalId).
  const byShipment = await findOrderByExternal(sellerId, 'mercadolibre', flex.externalId);
  if (byShipment) return byShipment;

  if (flex.mlOrderId) {
    return findOrderByExternal(sellerId, 'mercadolibre', flex.mlOrderId);
  }

  return null;
}

export async function findImportedMercadoLibreFlexGlobal(
  flex: MercadoLibreFlexRef
): Promise<Order | null> {
  const byShipment = await findOrderByExternalGlobal('mercadolibre', flex.externalId);
  if (byShipment) return byShipment;

  if (flex.mlOrderId) {
    return findOrderByExternalGlobal('mercadolibre', flex.mlOrderId);
  }

  return null;
}

export async function findImportedMercadoLibreRef(
  sellerId: string,
  mlRefId: string
): Promise<Order | null> {
  const byRef = await findOrderByExternal(sellerId, 'mercadolibre', mlRefId);
  if (byRef) return byRef;

  try {
    const integration = await getValidMercadoLibreIntegration(sellerId);
    const flex = await fetchMercadoLibreFlexShipment(integration, mlRefId);
    if (flex) return findImportedMercadoLibreFlex(sellerId, flex);
  } catch {
    try {
      const integration = await getValidMercadoLibreIntegration(sellerId);
      const flex = await fetchMercadoLibreFlexShipmentByShipmentId(integration, mlRefId);
      if (flex) return findImportedMercadoLibreFlex(sellerId, flex);
    } catch {
      // ignorar referencia ML desconocida
    }
  }

  return null;
}

export async function findImportedMercadoLibreRefGlobal(
  mlRefId: string,
  sellerId?: string
): Promise<Order | null> {
  const globalByRef = await findOrderByExternalGlobal('mercadolibre', mlRefId);
  if (globalByRef) return globalByRef;

  if (sellerId) {
    const bySeller = await findImportedMercadoLibreRef(sellerId, mlRefId);
    if (bySeller) return bySeller;
  }

  return null;
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
  const phone =
    unmaskMlText(shipment.receiver_address?.receiver_phone) ||
    unmaskMlText(order.buyer.phone?.number) ||
    '';

  return {
    externalId: String(shipment.id),
    mlOrderId: String(order.id),
    mlPackId: order.pack_id != null ? String(order.pack_id) : undefined,
    platform: 'mercadolibre',
    shippingType: 'flex',
    clientName: buyerName(order, shipment),
    clientPhone: phone,
    address,
    lat: lat != null && Number.isFinite(Number(lat)) ? Number(lat) : undefined,
    lng: lng != null && Number.isFinite(Number(lng)) ? Number(lng) : undefined,
    notes: buildFlexNotes(order, shipment),
    createdAt: order.date_created,
    mlShipmentStatus: shipment.status,
    mlShipmentSubstatus: shipment.substatus ?? null,
    mlProductCount: countOrderProducts(order),
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
  mlShipmentId: string,
  options?: { quietStatuses?: number[] }
): Promise<MlShipment> {
  return mlFetch<MlShipment>(integration, `/shipments/${mlShipmentId}`, options);
}

interface MlShipmentLeadTime {
  estimated_delivery_time?: { date?: string };
  estimated_delivery_final?: { date?: string };
  estimated_delivery_limit?: { date?: string };
}

export async function fetchMercadoLibreShipmentLeadTime(
  integration: StoreIntegration,
  shipmentId: string
): Promise<MlShipmentLeadTime | null> {
  try {
    return await mlFetch<MlShipmentLeadTime>(
      integration,
      `/shipments/${shipmentId}/lead_time`,
      { quietStatuses: [404] }
    );
  } catch {
    return null;
  }
}

/** Fecha prometida al comprador según ML (lead_time). */
export function parseMercadoLibreDeliveryDeadline(
  leadTime: MlShipmentLeadTime | null,
  deadlineHour?: number
): Date | null {
  if (!leadTime) return null;
  // estimated_delivery_time = promesa real al comprador (p. ej. Flex “hoy antes de 21 hs”).
  // limit/final son plazos de cancelación/reclamo, casi siempre días o meses después.
  const iso =
    leadTime.estimated_delivery_time?.date ??
    leadTime.estimated_delivery_limit?.date ??
    leadTime.estimated_delivery_final?.date;
  if (!iso) return null;
  return deliveryDeadlineFromIsoDate(iso, deadlineHour);
}

export async function resolveMercadoLibreFlexDeliveryDeadline(
  integration: StoreIntegration,
  shipmentId: string,
  deadlineHour?: number
): Promise<Date | null> {
  const leadTime = await fetchMercadoLibreShipmentLeadTime(integration, shipmentId);
  return parseMercadoLibreDeliveryDeadline(leadTime, deadlineHour);
}

export interface MlFlexAssignment {
  driver_id?: number;
  /** Algunas respuestas anidan el transportista. */
  driver?: { id?: number | string };
}

/** Normaliza driver_id desde respuestas planas o anidadas de assignment Flex. */
export function extractMercadoLibreFlexDriverId(
  assignment: MlFlexAssignment | Record<string, unknown> | null | undefined
): string | null {
  if (!assignment || typeof assignment !== 'object') return null;
  const raw =
    (assignment as MlFlexAssignment).driver_id ??
    (assignment as MlFlexAssignment).driver?.id ??
    (assignment as { courier_id?: number | string }).courier_id ??
    null;
  if (raw == null || raw === '') return null;
  return String(raw);
}

export interface MlMissedFeedMessage {
  _id?: string;
  resource: string;
  user_id: string | number;
  topic: string;
  application_id?: number | string;
  attempts?: number;
  sent?: string;
  received?: string;
}

interface MlMissedFeedsResponse {
  messages?: MlMissedFeedMessage[];
}

/** Extrae IDs de un resource de notificación ML (shipments, flex-handshakes, orders). */
export function parseMercadoLibreNotificationResource(resource: string): {
  shipmentId?: string;
  siteId?: string;
  mlOrderId?: string;
} {
  const trimmed = resource.trim();
  const handshakeMatch = trimmed.match(
    /\/flex\/sites\/([A-Z]{3})\/shipments\/(\d+)\/assignment\/v\d+/i
  );
  if (handshakeMatch) {
    return { siteId: handshakeMatch[1].toUpperCase(), shipmentId: handshakeMatch[2] };
  }
  const shipmentMatch = trimmed.match(/\/shipments\/(\d+)/i);
  if (shipmentMatch) return { shipmentId: shipmentMatch[1] };
  const orderMatch = trimmed.match(/\/orders\/(\d+)/i);
  if (orderMatch) return { mlOrderId: orderMatch[1] };
  return {};
}

/** GET recurso relativo documentado en la notificación (p. ej. assignment/v1). */
export async function fetchMercadoLibreResource<T>(
  integration: StoreIntegration,
  resource: string
): Promise<T | null> {
  const path = resource.trim().startsWith('/') ? resource.trim() : `/${resource.trim()}`;
  try {
    return await mlFetch<T>(integration, path);
  } catch {
    return null;
  }
}

export interface MlFlexAssignmentProbe {
  assignment: MlFlexAssignment | null;
  /** HTTP status del último intento útil (v2 luego v1), o null si no hubo respuesta. */
  status: number | null;
  integrationUserId?: string;
}

async function probeMercadoLibreFlexAssignmentWithIntegration(
  integration: StoreIntegration,
  siteId: string,
  shipmentId: string
): Promise<MlFlexAssignmentProbe> {
  let lastStatus: number | null = null;

  for (const version of ['v2', 'v1'] as const) {
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await fetch(
          `${ML_API}/flex/sites/${siteId}/shipments/${shipmentId}/assignment/${version}`,
          {
            headers: { Authorization: `Bearer ${integration.accessToken}` },
            signal: AbortSignal.timeout(ML_FETCH_TIMEOUT_MS),
          }
        );
        if (res.status === 429) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        lastStatus = res.status;
        if (!res.ok) break;

        const assignment = (await res.json()) as MlFlexAssignment;
        const driverId = extractMercadoLibreFlexDriverId(assignment);
        if (driverId) {
          const numeric = Number(driverId);
          return {
            assignment: {
              ...assignment,
              driver_id: Number.isFinite(numeric) ? numeric : assignment.driver_id,
              driver: assignment.driver ?? { id: driverId },
            },
            status: res.status,
            integrationUserId: integration.userId,
          };
        }
        // 200 sin driver_id: probar v1 / otra integración
        break;
      }
    } catch {
      // probar siguiente versión
    }
  }

  return { assignment: null, status: lastStatus, integrationUserId: integration.userId };
}

async function fetchMercadoLibreFlexAssignmentWithIntegration(
  integration: StoreIntegration,
  siteId: string,
  shipmentId: string
): Promise<MlFlexAssignment | null> {
  const probe = await probeMercadoLibreFlexAssignmentWithIntegration(
    integration,
    siteId,
    shipmentId
  );
  return probe.assignment;
}

/** Consulta assignment/handshake Flex (tópico flex-handshakes). */
export async function fetchMercadoLibreFlexAssignment(
  integration: StoreIntegration,
  siteId: string,
  shipmentId: string
): Promise<MlFlexAssignment | null> {
  return fetchMercadoLibreFlexAssignmentWithIntegration(integration, siteId, shipmentId);
}

/** Prueba assignment con varias integraciones (repartidor primero, luego vendedor/agencia). */
export async function resolveMercadoLibreFlexAssignment(
  integrations: StoreIntegration[],
  shipmentId: string,
  siteId = env.mercadolibre.siteId
): Promise<MlFlexAssignment | null> {
  const probe = await resolveMercadoLibreFlexAssignmentProbe(integrations, shipmentId, siteId);
  return probe.assignment;
}

/** Igual que resolve, pero incluye status HTTP para diagnóstico (404 = sin driver/ruta). */
export async function resolveMercadoLibreFlexAssignmentProbe(
  integrations: StoreIntegration[],
  shipmentId: string,
  siteId = env.mercadolibre.siteId
): Promise<MlFlexAssignmentProbe> {
  let lastProbe: MlFlexAssignmentProbe = { assignment: null, status: null };
  for (const integration of integrations) {
    const probe = await probeMercadoLibreFlexAssignmentWithIntegration(
      integration,
      siteId,
      shipmentId
    );
    lastProbe = probe;
    if (extractMercadoLibreFlexDriverId(probe.assignment)) return probe;
  }
  return lastProbe;
}

/** Historial de notificaciones perdidas de la aplicación ML (solo token del dueño de la app). */
export async function fetchMercadoLibreMissedFeeds(
  options?: { topic?: string; offset?: number; limit?: number }
): Promise<MlMissedFeedMessage[]> {
  if (!env.mercadolibre.appId || !env.mercadolibre.appOwnerAccessToken) return [];

  const params = new URLSearchParams({ app_id: env.mercadolibre.appId });
  if (options?.topic) params.set('topic', options.topic);
  if (options?.offset != null) params.set('offset', String(options.offset));
  if (options?.limit != null) params.set('limit', String(options.limit));

  const res = await fetch(`${ML_API}/missed_feeds?${params.toString()}`, {
    headers: { Authorization: `Bearer ${env.mercadolibre.appOwnerAccessToken}` },
    signal: AbortSignal.timeout(ML_FETCH_TIMEOUT_MS),
  });

  if (res.status === 401 || res.status === 403) {
    console.warn(
      '[ml-api] missed_feeds no disponible: el token debe ser del dueño de la app ML (ML_APP_OWNER_ACCESS_TOKEN)'
    );
    return [];
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn('[ml-api] missed_feeds error', { status: res.status, body: body.slice(0, 200) });
    return [];
  }

  const data = (await res.json()) as MlMissedFeedsResponse;
  return data.messages ?? [];
}

/** Traducciones de status ML → texto legible (español). */
const ML_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  handling: 'En preparación',
  ready_to_ship: 'Listo para enviar',
  shipped: 'En tránsito',
  in_transit: 'En tránsito',
  out_for_delivery: 'En camino al domicilio',
  on_route: 'En ruta de entrega',
  soon_deliver: 'Próximo a entregar',
  delivered: 'Entregado',
  not_delivered: 'No entregado',
  cancelled: 'Cancelado',
};

/** Subestados ML — si hay match, se prioriza este mensaje (más específico). */
const ML_SUBSTATUS_LABELS: Record<string, string> = {
  receiver_absent: 'Destinatario ausente en el domicilio',
  rejected_by_receiver: 'El destinatario rechazó el paquete',
  bad_address: 'Dirección incorrecta o incompleta',
  incorrect_address: 'Dirección incorrecta o incompleta',
  buyer_not_found: 'No se encontró al comprador',
  not_accessible: 'Domicilio no accesible',
  dangerous_area: 'Zona de entrega peligrosa',
  delivery_failed: 'Intento de entrega fallido',
  returning_to_warehouse: 'Regresa al depósito',
  returning_to_sender: 'En devolución al vendedor',
  returned_to_warehouse: 'Devuelto al depósito',
  returned: 'Devuelto',
  out_for_delivery: 'En camino al domicilio',
  on_route: 'En ruta de entrega',
  in_transit: 'En tránsito',
  picked_up: 'Colectado por el transportista',
  in_carriage: 'En transporte',
  dropped_off: 'Depositado en punto de logística',
  delivery_in_progress: 'Entrega en curso',
  soon_deliver: 'Próximo a entregar',
  ready_to_print: 'Etiqueta lista para imprimir',
  printed: 'Etiqueta impresa',
  ready_for_pickup: 'Listo para retiro',
  in_hub: 'En centro de distribución',
  buffered: 'En espera en depósito',
  packing: 'Empaquetando',
  packed: 'Empaquetado',
  invoice_pending: 'Factura pendiente',
  waiting_for_withdrawal: 'Esperando retiro',
  delayed: 'Demorado',
  stolen: 'Reportado como robado',
  damaged: 'Paquete dañado',
  lost: 'Paquete extraviado',
  detained: 'Retenido',
  to_be_agreed: 'Reprogramar entrega',
  buyer_rescheduled: 'Envío reprogramado por el comprador',
  waiting_for_confirmation: 'Esperando confirmación de entrega',
  claimed_me: 'Con reclamo en Mercado Libre',
};

function humanizeMlCode(code: string): string {
  return code
    .replace(/[_/]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Etiqueta legible del estado/subestado ML (sin códigos crudos tipo shipped/receiver_absent). */
export function formatMlShipmentStatusLabel(shipment: Pick<MlShipment, 'status' | 'substatus'>): string {
  const status = shipment.status?.trim().toLowerCase() ?? '';
  const substatus = shipment.substatus?.trim().toLowerCase() ?? '';

  if (substatus && ML_SUBSTATUS_LABELS[substatus]) {
    return ML_SUBSTATUS_LABELS[substatus];
  }
  if (status && ML_STATUS_LABELS[status]) {
    if (substatus) {
      return `${ML_STATUS_LABELS[status]} · ${humanizeMlCode(substatus)}`;
    }
    return ML_STATUS_LABELS[status];
  }
  if (substatus) return humanizeMlCode(substatus);
  if (status) return humanizeMlCode(status);
  return 'Actualización de envío';
}

/**
 * Subestados ML que implican reintento otro día (p. ej. “Envío reprogramado por el comprador”).
 * Lista canónica: `utils/ml-reschedule.ts`.
 */
export { isMlRescheduleSubstatus, ML_RESCHEDULE_SUBSTATUS_LIST } from '../utils/ml-reschedule.js';

/** Badge corto para UI (Ausente / Reprogramado / …). */
export function getMlExceptionBadgeLabel(substatus?: string | null): string | null {
  const sub = (substatus ?? '').trim().toLowerCase();
  if (!sub) return null;
  if (sub === 'receiver_absent') return 'Ausente';
  if (sub === 'to_be_agreed' || sub === 'buyer_rescheduled') return 'Reprogramado';
  if (sub === 'bad_address' || sub === 'incorrect_address') return 'Dir. incorrecta';
  if (sub === 'rejected_by_receiver') return 'Rechazado';
  if (sub === 'delivery_failed') return 'No entregado';
  if (isMlRescheduleSubstatus(sub)) return 'Reprogramado';
  return null;
}

const ML_IN_TRANSIT_SUBSTATUSES = [
  'out_for_delivery',
  'on_route',
  'in_transit',
  'picked_up',
  'in_carriage',
  'dropped_off',
  'delivery_in_progress',
  'soon_deliver',
];

function isMercadoLibreShipmentInTransit(mlStatus: string, mlSubstatus: string): boolean {
  // Reprogramado / fallo: aunque el status siga en "shipped", ya no está en viaje.
  if (isMlRescheduleSubstatus(mlSubstatus)) return false;
  if (mlStatus === 'not_delivered') return false;
  if (
    ['shipped', 'in_transit', 'out_for_delivery', 'on_route', 'soon_deliver'].includes(mlStatus)
  ) {
    return true;
  }
  return ML_IN_TRANSIT_SUBSTATUSES.some((s) => mlSubstatus === s || mlSubstatus.includes(s));
}

/** True si el envío Flex ya está en ruta / con el courier (no solo listo en depósito). */
export function isMercadoLibreFlexWithCourier(
  mlStatus?: string | null,
  mlSubstatus?: string | null
): boolean {
  const status = (mlStatus ?? '').toLowerCase().trim();
  const sub = (mlSubstatus ?? '').toLowerCase().trim();
  if (!status && !sub) return false;
  if (['delivered', 'cancelled', 'not_delivered'].includes(status)) return false;
  return isMercadoLibreShipmentInTransit(status, sub);
}

/** Mapea estado ML → Posta. Con `onImport` aplica el estado real al importar. */
export function mapMercadoLibreShipmentToOrderStatus(
  mlStatus?: string,
  mlSubstatus?: string | null,
  options?: {
    hasRepartidor?: boolean;
    currentStatus?: OrderStatus;
    onImport?: boolean;
  }
): OrderStatus | null {
  const status = (mlStatus ?? '').toLowerCase().trim();
  const sub = (mlSubstatus ?? '').toLowerCase().trim();
  const hasRepartidor = options?.hasRepartidor ?? false;
  const current = options?.currentStatus ?? OrderStatus.PENDING;
  const onImport = options?.onImport ?? false;

  if (status === 'delivered' || sub === 'delivered') return OrderStatus.DELIVERED;
  if (status === 'cancelled') return OrderStatus.CANCELLED;

  // Reprogramación / no entregado: sale de “en viaje” y vuelve a cola del día nuevo.
  if (isMlRescheduleSubstatus(sub) || status === 'not_delivered') {
    if (current === OrderStatus.DELIVERED || current === OrderStatus.CANCELLED) return null;
    return hasRepartidor ? OrderStatus.ASSIGNED : OrderStatus.PENDING;
  }

  const inTransit = isMercadoLibreShipmentInTransit(status, sub);

  if (onImport) {
    if (inTransit) {
      return OrderStatus.DELIVERING;
    }
    if (status === 'handling' || sub.includes('in_hub') || sub.includes('packed')) {
      return hasRepartidor ? OrderStatus.ASSIGNED : OrderStatus.PENDING;
    }
    if (hasRepartidor) return OrderStatus.ASSIGNED;
    return OrderStatus.PENDING;
  }

  if (inTransit) {
    if (
      hasRepartidor &&
      (current === OrderStatus.ASSIGNED || current === OrderStatus.DELIVERING)
    ) {
      return OrderStatus.DELIVERING;
    }
    return null;
  }

  return null;
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

const ML_SEARCH_TZ = '-03:00';

function toMercadoLibreSearchDateParam(isoDate: string, endOfDay: boolean): string {
  const trimmed = isoDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('ML_INVALID_DATE');
  }
  return endOfDay
    ? `${trimmed}T23:59:59.000${ML_SEARCH_TZ}`
    : `${trimmed}T00:00:00.000${ML_SEARCH_TZ}`;
}

/** Rango de fechas para /orders/search (default: últimos 30 días). */
export function resolveMercadoLibreSearchDateRange(
  dateFrom?: string,
  dateTo?: string
): { from: string; to: string } {
  if (dateFrom || dateTo) {
    const to = dateTo ?? toDateInputValue(new Date());
    const from =
      dateFrom ??
      toDateInputValue(new Date(new Date(to).getTime() - 30 * 24 * 60 * 60 * 1000));
    if (from > to) throw new Error('ML_INVALID_DATE_RANGE');
    return {
      from: toMercadoLibreSearchDateParam(from, false),
      to: toMercadoLibreSearchDateParam(to, true),
    };
  }

  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return {
    from: toMercadoLibreSearchDateParam(toDateInputValue(from), false),
    to: toMercadoLibreSearchDateParam(toDateInputValue(to), true),
  };
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

export async function listMercadoLibreFlexShipments(
  userId: string,
  options?: { dateFrom?: string; dateTo?: string }
): Promise<MercadoLibreFlexShipment[]> {
  const integration = await getValidMercadoLibreIntegration(userId);
  const sellerId = integration.externalUserId;
  if (!sellerId) throw new Error('ML_NOT_CONNECTED');

  const shipments: MercadoLibreFlexShipment[] = [];
  /** Una fila por orden ML al consultar ML; se fusiona por envío al final. */
  const seenOrderIds = new Set<string>();
  const pageSize = 50;
  const maxPages = 6;
  const dateRange = resolveMercadoLibreSearchDateRange(options?.dateFrom, options?.dateTo);

  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const params = new URLSearchParams({
      seller: sellerId,
      'order.status': 'paid',
      sort: 'date_desc',
      limit: String(pageSize),
      offset: String(offset),
    });
    if (dateRange.from) params.set('order.date_created.from', dateRange.from);
    if (dateRange.to) params.set('order.date_created.to', dateRange.to);

    const search = await mlFetch<MlOrderSearchResult>(
      integration,
      `/orders/search?${params.toString()}`
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
        if (!flex) continue;
        shipments.push(flex);
      } catch (err) {
        console.warn('[ml-list] No se pudo cargar orden ML', orderId, err);
      }
    }

    if (results.length < pageSize) break;
  }

  return mergeMercadoLibreFlexForListing(shipments);
}

/** Una fila por venta MLA (pack o envío), como en el panel de Mercado Libre. */
function mergeMercadoLibreFlexForListing(
  items: MercadoLibreFlexShipment[]
): MercadoLibreFlexShipment[] {
  const grouped = new Map<string, MercadoLibreFlexShipment>();

  for (const flex of items) {
    const key = flex.mlPackId ? `pack:${flex.mlPackId}` : `ship:${flex.externalId}`;
    const prev = grouped.get(key);
    if (!prev) {
      grouped.set(key, {
        ...flex,
        mlOrderIds: [flex.mlOrderId],
        mlProductCount: flex.mlProductCount ?? 1,
      });
      continue;
    }

    const mlOrderIds = [...(prev.mlOrderIds ?? [prev.mlOrderId]), flex.mlOrderId];
    grouped.set(key, {
      ...prev,
      mlOrderIds,
      mlProductCount: (prev.mlProductCount ?? 1) + (flex.mlProductCount ?? 1),
    });
  }

  return [...grouped.values()];
}

export function isMercadoLibreConfigured(): boolean {
  return Boolean(env.mercadolibre.appId && env.mercadolibre.appSecret && env.mercadolibre.redirectUri);
}

export type MercadoLibreCourierRegisterResult =
  | { ok: true; alreadyRegistered?: boolean }
  | { ok: false; code: string; message: string };

/** Resuelve el ID de envío ML a partir de una referencia (orden o envío). */
export async function resolveMercadoLibreShipmentId(
  sellerId: string,
  refId: string
): Promise<string> {
  if (/^2000\d{8,}$/.test(refId)) {
    try {
      const integration = await getValidMercadoLibreIntegration(sellerId);
      const flex = await fetchMercadoLibreFlexShipment(integration, refId);
      if (flex) return flex.externalId;
    } catch {
      // usar refId tal cual
    }
  }
  return refId;
}

/**
 * Registra en Mercado Libre Flex que el repartidor tomó el envío (API courier-shipment).
 * Requiere cuenta ML del repartidor vinculada vía OAuth.
 */
export async function registerMercadoLibreCourierShipment(
  integration: StoreIntegration,
  shipmentId: string,
  siteId = env.mercadolibre.siteId
): Promise<MercadoLibreCourierRegisterResult> {
  const courierUserId = integration.externalUserId;
  if (!courierUserId) {
    return {
      ok: false,
      code: 'ML_COURIER_NO_USER',
      message: 'La cuenta de Mercado Libre no tiene user_id asociado.',
    };
  }

  const numericId = Number(shipmentId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return {
      ok: false,
      code: 'ML_INVALID_SHIPMENT',
      message: 'ID de envío inválido para Mercado Libre Flex.',
    };
  }

  let validIntegration: StoreIntegration;
  try {
    validIntegration = await getValidMercadoLibreIntegration(integration.userId);
  } catch {
    return {
      ok: false,
      code: 'ML_COURIER_NOT_CONNECTED',
      message: 'La cuenta de Mercado Libre perdió la conexión. Reconectala en tu perfil.',
    };
  }

  const url = `${ML_API}/flex/sites/${siteId}/users/${courierUserId}/courier-shipment/v1`;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validIntegration.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ shipment_id: numericId }),
      signal: AbortSignal.timeout(ML_FETCH_TIMEOUT_MS),
    });

    if (res.status === 429) {
      await sleep(800 * (attempt + 1));
      continue;
    }

    if (res.status === 204) {
      return { ok: true };
    }
    if (res.status === 409) {
      return { ok: true, alreadyRegistered: true };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        code: 'ML_COURIER_AUTH',
        message:
          'Mercado Libre rechazó la cuenta. Verificá que esté registrada como mensajería Flex y reconectala en tu perfil.',
      };
    }
    if (res.status === 404) {
      return {
        ok: false,
        code: 'ML_SHIPMENT_NOT_FOUND',
        message: 'Mercado Libre no encontró ese envío Flex.',
      };
    }

    const body = await res.text().catch(() => '');
    console.warn('[ml-flex] courier-shipment failed', res.status, body.slice(0, 200));
    return {
      ok: false,
      code: 'ML_COURIER_REGISTER_FAILED',
      message: 'Mercado Libre no aceptó el registro del envío. Revisá el estado del pedido en ML.',
    };
  }

  return {
    ok: false,
    code: 'ML_COURIER_RATE_LIMIT',
    message: 'Mercado Libre está saturado. El escaneo quedó en Posta; reintentá registrar en Flex más tarde.',
  };
}

/** Registra el envío en Flex con la cuenta ML del repartidor que escanea. */
export async function syncMercadoLibreFlexOnScan(
  _agencyId: string,
  shipmentId: string,
  scanningUserId: string,
  scanningUserRole: UserRole
): Promise<{ registered: boolean; message: string }> {
  if (scanningUserRole !== UserRole.REPARTIDOR) {
    return {
      registered: false,
      message: 'El escaneo debe hacerlo un repartidor con su cuenta ML conectada.',
    };
  }

  const repartidorIntegration = await getIntegration(scanningUserId, 'mercadolibre');
  if (!repartidorIntegration) {
    return {
      registered: false,
      message: 'Conectá tu cuenta de Mercado Libre Flex en tu perfil.',
    };
  }

  const result = await registerMercadoLibreCourierShipment(repartidorIntegration, shipmentId);
  if (result.ok) {
    return {
      registered: true,
      message: result.alreadyRegistered
        ? 'Envío ya registrado en Mercado Libre Flex.'
        : 'Registrado en Mercado Libre Flex con tu cuenta.',
    };
  }
  return { registered: false, message: result.message };
}

/** Extrae número de orden MLA guardado en notas del pedido Posta. */
export function extractMlOrderIdFromNotes(notes?: string | null): string | undefined {
  const match = notes?.match(/Orden #(\d{8,})/);
  return match?.[1];
}

export async function getMercadoLibreShippingLabelPdf(
  sellerUserId: string,
  mlRefId: string,
  options?: { alternateRef?: string }
): Promise<Buffer> {
  const integration = await getValidMercadoLibreIntegration(sellerUserId);
  const refs = [...new Set([mlRefId, options?.alternateRef].filter(Boolean) as string[])];

  let shipmentId: string | null = null;
  for (const ref of refs) {
    try {
      const resolved = await resolveMercadoLibreShipmentId(sellerUserId, ref);
      await fetchMercadoLibreShipment(integration, resolved);
      shipmentId = resolved;
      break;
    } catch {
      // probar siguiente referencia (orden vs envío)
    }
  }

  if (!shipmentId) {
    throw new Error('ML_NO_SHIPMENT');
  }

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
      const bodyLower = body.toLowerCase();
      console.warn('[ml-label] Error ML', res.status, body.slice(0, 400));
      if (
        bodyLower.includes('delivered') &&
        (bodyLower.includes('not_printable') || bodyLower.includes('shplab'))
      ) {
        throw new Error('ML_ALREADY_DELIVERED');
      }
      if (bodyLower.includes('not_printable')) {
        throw new Error('ML_LABEL_NOT_READY');
      }
      if (res.status === 404) {
        throw new Error('ML_LABEL_NOT_FOUND');
      }
      if (res.status === 401 || body.includes('invalid_token') || body.includes('Unauthorized')) {
        throw new Error('ML_NOT_CONNECTED');
      }
      throw new Error('ML_LABEL_UNAVAILABLE');
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) {
      throw new Error('ML_LABEL_NOT_FOUND');
    }
    return buffer;
  }
  throw new Error('ML_LABEL_UNAVAILABLE');
}
