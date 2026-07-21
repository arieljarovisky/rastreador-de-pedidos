import { RowDataPacket } from 'mysql2';
import { Order, OrderStatus, User, UserRole } from '../types/index.js';
import { env } from '../config/env.js';
import { pool } from '../config/database.js';
import {
  findMercadoLibreIntegrationByMlUserId,
  listMercadoLibreIntegrationsForAgencyScan,
  type StoreIntegration,
} from './integrations.service.js';
import {
  fetchMercadoLibreFlexShipment,
  fetchMercadoLibreFlexShipmentByShipmentId,
  fetchMercadoLibreOrder,
  fetchMercadoLibreShipment,
  fetchMercadoLibreResource,
  fetchMercadoLibreMissedFeeds,
  findImportedMercadoLibreFlex,
  findImportedMercadoLibreFlexGlobal,
  findImportedMercadoLibreRefGlobal,
  formatMlShipmentStatusLabel,
  getValidMercadoLibreIntegration,
  isMlRescheduleSubstatus,
  mapMercadoLibreShipmentToOrderStatus,
  parseMercadoLibreNotificationResource,
  resolveMercadoLibreFlexDeliveryDeadline,
  type MercadoLibreFlexShipment,
  type MlFlexAssignment,
} from './mercadolibre.service.js';
import { geocodeAddress } from './geocode.service.js';
import {
  appendOrderMarketplaceComment,
  assignOrderToRepartidorFromMarketplace,
  createOrder,
  findOrderByExternalGlobal,
  getOrderById,
  getSellerIdForOrder,
  rescheduleOrderToNextOperationalDay,
  updateOrderDeliveryDeadlineIfNeeded,
  updateOrderMlShipmentMeta,
  updateOrderStatusFromMarketplace,
} from './orders.service.js';
import { getRepartidorByMercadoLibreUserId, getUserById } from './users.service.js';
import { getAgencyOperatorForImport, isAgencyMlBridgeUser } from './agency-ml.service.js';
import { createNotification } from './notifications.service.js';
import { emitOrderUpdated } from '../realtime/io.js';
import { syncMercadoLibreOrderAfterImport } from './marketplace-import.service.js';

export interface MercadoLibreNotificationPayload {
  _id?: string;
  resource: string;
  user_id: number | string;
  topic: string;
  application_id?: number | string;
  attempts?: number;
  sent?: string;
  received?: string;
}

const recentNotifications = new Map<string, number>();
const DEDUP_TTL_MS = 10 * 60 * 1000;

function flexScanLog(step: string, data?: Record<string, unknown>): void {
  console.log(`[ml-flex-scan] ${step}`, data ?? '');
}

type MlShipmentData = Awaited<ReturnType<typeof fetchMercadoLibreShipment>>;

interface FlexWebhookContext {
  webhookIntegration: StoreIntegration;
  agencyId: string | null;
  scanningRepartidor: User | null;
  dataIntegrations: StoreIntegration[];
}

async function buildFlexWebhookContext(
  integration: StoreIntegration
): Promise<FlexWebhookContext> {
  const user = await getUserById(integration.userId);
  const agencyId = user?.agencyId ?? null;
  const scanningRepartidor = user?.role === UserRole.REPARTIDOR ? user : null;
  const dataIntegrations: StoreIntegration[] = [];
  const seenUserIds = new Set<string>();

  const tryAdd = async (userId: string) => {
    if (seenUserIds.has(userId)) return;
    seenUserIds.add(userId);
    try {
      dataIntegrations.push(await getValidMercadoLibreIntegration(userId));
    } catch {
      flexScanLog('integración ML no disponible para datos', { userId });
    }
  };

  // Courier primero: los eventos Flex del repartidor deben poder leer el envío sin el vendedor.
  await tryAdd(integration.userId);

  if (agencyId) {
    for (const ctx of await listMercadoLibreIntegrationsForAgencyScan(agencyId)) {
      await tryAdd(ctx.integration.userId);
    }
  }

  flexScanLog('contexto Flex webhook', {
    webhookUserId: integration.userId,
    agencyId,
    scanningRepartidorId: scanningRepartidor?.id ?? null,
    dataIntegrationUserIds: dataIntegrations.map((i) => i.userId),
  });

  return { webhookIntegration: integration, agencyId, scanningRepartidor, dataIntegrations };
}

async function fetchShipmentWithFallback(
  integrations: StoreIntegration[],
  shipmentId: string
): Promise<{ shipment: MlShipmentData; integration: StoreIntegration } | null> {
  for (const integration of integrations) {
    try {
      const shipment = await fetchMercadoLibreShipment(integration, shipmentId, {
        quietStatuses: [401, 403],
      });
      flexScanLog('envío ML obtenido', {
        shipmentId,
        integrationUserId: integration.userId,
        logisticType: shipment.logistic_type,
      });
      return { shipment, integration };
    } catch {
      flexScanLog('fetch shipment falló con integración', {
        shipmentId,
        integrationUserId: integration.userId,
      });
    }
  }
  return null;
}

async function fetchFlexAssignmentWithFallback(
  integrations: StoreIntegration[],
  resource: string,
  parsed: ReturnType<typeof parseMercadoLibreNotificationResource>,
  shipmentId: string
): Promise<MlFlexAssignment | null> {
  const paths = [resource];
  if (parsed.siteId) {
    paths.push(`/flex/sites/${parsed.siteId}/shipments/${shipmentId}/assignment/v1`);
  }

  for (const integration of integrations) {
    for (const path of paths) {
      const assignment = await fetchMercadoLibreResource<MlFlexAssignment>(integration, path);
      if (assignment) {
        flexScanLog('assignment obtenido', {
          shipmentId,
          integrationUserId: integration.userId,
          driverId: assignment.driver_id ?? null,
        });
        return assignment;
      }
    }
  }

  flexScanLog('assignment no obtenido con ninguna integración', { shipmentId });
  return null;
}

async function buildAssignmentIntegrations(
  context: FlexWebhookContext
): Promise<StoreIntegration[]> {
  const integrations: StoreIntegration[] = [];
  const seen = new Set<string>();

  const add = (integration: StoreIntegration) => {
    if (seen.has(integration.userId)) return;
    seen.add(integration.userId);
    integrations.push(integration);
  };

  try {
    add(await getValidMercadoLibreIntegration(context.webhookIntegration.userId));
  } catch {
    flexScanLog('integración webhook no válida para assignment', {
      userId: context.webhookIntegration.userId,
    });
  }

  for (const integration of context.dataIntegrations) {
    add(integration);
  }

  return integrations;
}

export const ML_WEBHOOK_TOPICS = ['orders_v2', 'orders', 'shipments', 'flex-handshakes'] as const;

/** Último POST de notificación recibido (diagnóstico: si ML está pegando al backend). */
let lastWebhookReceivedAt: string | null = null;
let lastWebhookTopic: string | null = null;
let lastWebhookUserId: string | null = null;
let webhookPostCount = 0;

export function recordMercadoLibreWebhookHit(info?: {
  topic?: string;
  userId?: string | number;
}): void {
  webhookPostCount += 1;
  lastWebhookReceivedAt = new Date().toISOString();
  lastWebhookTopic = info?.topic ?? null;
  lastWebhookUserId = info?.userId != null ? String(info.userId) : null;
}

export function getMercadoLibreWebhookHealth(): {
  webhookUrl: string;
  topics: readonly string[];
  postCountSinceBoot: number;
  lastReceivedAt: string | null;
  lastTopic: string | null;
  lastUserId: string | null;
  receiving: boolean;
  hint: string;
} {
  const receiving = Boolean(lastWebhookReceivedAt);
  return {
    webhookUrl: getMercadoLibreWebhookUrl(),
    topics: ML_WEBHOOK_TOPICS,
    postCountSinceBoot: webhookPostCount,
    lastReceivedAt: lastWebhookReceivedAt,
    lastTopic: lastWebhookTopic,
    lastUserId: lastWebhookUserId,
    receiving,
    hint: receiving
      ? 'ML está enviando notificaciones a este backend.'
      : 'Ningún POST de ML desde el último deploy. Si había una URL vieja (QA) o el callback falló, ML desactiva los tópicos: re-marcá flex-handshakes + orders_v2 + shipments en Developers, guardá, reconectá ML en Posta y volvé a escanear.',
  };
}

function isDuplicateNotification(id: string | undefined): boolean {
  if (!id) return false;
  const now = Date.now();
  for (const [key, ts] of recentNotifications) {
    if (now - ts > DEDUP_TTL_MS) recentNotifications.delete(key);
  }
  if (recentNotifications.has(id)) return true;
  recentNotifications.set(id, now);
  return false;
}

export function getMercadoLibreWebhookUrl(): string {
  return `${env.publicUrl}/api/integrations/mercadolibre/notifications`;
}

function mapMlShipmentStatusToOrderStatus(
  mlStatus: string,
  currentStatus: OrderStatus,
  hasRepartidor: boolean,
  mlSubstatus?: string | null
): OrderStatus | null {
  return mapMercadoLibreShipmentToOrderStatus(mlStatus, mlSubstatus, {
    hasRepartidor,
    currentStatus,
    onImport: false,
  });
}

async function notifySellerFlexEvent(
  sellerId: string | null,
  order: Order,
  title: string,
  body: string
): Promise<void> {
  if (!sellerId) return;
  await createNotification({
    id: `n_ml_flex_${Date.now()}_${order.id}`,
    userId: sellerId,
    title,
    body,
    type: 'info',
    orderId: order.id,
  });
}

async function importFlexShipment(
  integration: StoreIntegration,
  shipment: MercadoLibreFlexShipment
): Promise<string | null> {
  flexScanLog('importando envío Flex', {
    mlShipmentId: shipment.externalId,
    mlOrderId: shipment.mlOrderId,
    integrationUserId: integration.userId,
  });
  const seller = await getUserById(integration.userId);
  if (!seller) {
    flexScanLog('importación abortada: vendedor no encontrado', {
      integrationUserId: integration.userId,
    });
    return null;
  }

  const agencyMode = isAgencyMlBridgeUser(seller);
  const existing = agencyMode
    ? await findImportedMercadoLibreFlexGlobal(shipment)
    : await findImportedMercadoLibreFlex(integration.userId, shipment);
  if (existing) {
    const synced = await syncMercadoLibreOrderAfterImport(integration.userId, existing, shipment);
    const sellerId = await getSellerIdForOrder(synced.id);
    emitOrderUpdated(synced, sellerId);
    flexScanLog('envío ya importado', { orderId: synced.id, mlShipmentId: shipment.externalId });
    return synced.id;
  }

  let lat = shipment.lat;
  let lng = shipment.lng;
  if (lat === undefined || lng === undefined) {
    const geocoded = await geocodeAddress(shipment.address);
    if (!geocoded) {
      flexScanLog('importación abortada: geocodificación falló', {
        mlShipmentId: shipment.externalId,
        address: shipment.address,
      });
      return null;
    }
    lat = geocoded.lat;
    lng = geocoded.lng;
  }

  const orderCreator = agencyMode
    ? (await getAgencyOperatorForImport(seller.agencyId!)) ?? seller
    : seller;

  const mlDeadline = await resolveMercadoLibreFlexDeliveryDeadline(
    integration,
    shipment.externalId
  );

  let order = await createOrder(orderCreator, {
    clientName: shipment.clientName,
    clientPhone: shipment.clientPhone,
    address: shipment.address,
    lat,
    lng,
    notes: shipment.notes,
    externalSource: 'mercadolibre',
    externalOrderId: shipment.externalId,
    shippingType: 'flex',
    deliveryDeadline: mlDeadline ?? undefined,
    sellerId: agencyMode ? undefined : seller.id,
    historyComment: agencyMode
      ? `Importado automáticamente desde ML (cuenta de la agencia) · envío #${shipment.externalId}`
      : undefined,
  });

  order = await syncMercadoLibreOrderAfterImport(integration.userId, order, shipment);

  const sellerId = await getSellerIdForOrder(order.id);
  if (sellerId) {
    await notifySellerFlexEvent(
      sellerId,
      order,
      'Nuevo envío Flex (Mercado Libre)',
      `Se importó automáticamente el envío ML #${shipment.externalId} (orden #${shipment.mlOrderId}) como ${order.id}.`
    );
  }

  emitOrderUpdated(order, sellerId);
  flexScanLog('envío importado', { orderId: order.id, mlShipmentId: shipment.externalId });
  return order.id;
}

async function syncOrderStatus(
  orderId: string,
  nextStatus: OrderStatus,
  mlStatusLabel: string
): Promise<void> {
  const updated = await updateOrderStatusFromMarketplace(
    orderId,
    nextStatus,
    `Mercado Libre Flex: ${mlStatusLabel}`
  );
  if (!updated) return;

  const sellerId = await getSellerIdForOrder(orderId);
  emitOrderUpdated(updated, sellerId);

  if (nextStatus === OrderStatus.DELIVERED) {
    await createNotification({
      id: `n_ml_delivered_${Date.now()}_${orderId}`,
      userId: sellerId ?? 'all',
      title: 'Entrega confirmada en Mercado Libre',
      body: `El pedido ${orderId} fue marcado como entregado en Mercado Libre.`,
      type: 'order_delivered',
      orderId,
    });
  }
}

async function resolveFlexOrderForShipment(
  integration: StoreIntegration,
  mlShipmentId: string,
  mlShipment: Awaited<ReturnType<typeof fetchMercadoLibreShipment>>
): Promise<Order | null> {
  flexScanLog('buscando pedido Posta para envío ML', {
    mlShipmentId,
    mlOrderId: mlShipment.order_id ?? null,
    mlStatus: mlShipment.status,
    logisticType: mlShipment.logistic_type,
  });
  const mlOrderId = mlShipment.order_id ? String(mlShipment.order_id) : null;
  const owner = await getUserById(integration.userId);
  const agencyMode = owner ? isAgencyMlBridgeUser(owner) : false;

  let existing = await findOrderByExternalGlobal('mercadolibre', mlShipmentId);
  if (!existing && mlOrderId) {
    existing = await findImportedMercadoLibreRefGlobal(mlOrderId, integration.userId);
  }
  if (!existing) {
    const flexByShipment = await fetchMercadoLibreFlexShipmentByShipmentId(
      integration,
      mlShipmentId
    );
    if (flexByShipment) {
      existing = agencyMode
        ? await findImportedMercadoLibreFlexGlobal(flexByShipment)
        : await findImportedMercadoLibreFlex(integration.userId, flexByShipment);
    }
  }

  if (!existing && mlOrderId && mlShipment.status !== 'cancelled' && mlShipment.status !== 'delivered') {
    const flexShipment = await fetchMercadoLibreFlexShipment(integration, mlOrderId);
    if (flexShipment) {
      const importedId = await importFlexShipment(integration, flexShipment);
      if (importedId) {
        existing = agencyMode
          ? await findImportedMercadoLibreFlexGlobal(flexShipment)
          : await findImportedMercadoLibreFlex(integration.userId, flexShipment);
      }
    }
  }

  if (existing) {
    flexScanLog('pedido Posta encontrado', {
      orderId: existing.id,
      mlShipmentId,
      status: existing.status,
      repartidorId: existing.repartidorId,
    });
  } else {
    flexScanLog('pedido Posta no encontrado tras búsqueda/import', { mlShipmentId, mlOrderId });
  }

  return existing;
}

async function syncOrderFromMlShipment(
  existing: Order,
  shipment: Awaited<ReturnType<typeof fetchMercadoLibreShipment>>,
  integration?: StoreIntegration
): Promise<void> {
  if (!shipment.status) return;

  const statusLabel = formatMlShipmentStatusLabel(shipment);
  const mlStatus = shipment.status.trim().toLowerCase();
  const mlSubstatus = shipment.substatus?.trim().toLowerCase() || null;
  const comment = `Mercado Libre Flex: ${statusLabel}`;
  const previousSubstatus = (existing.mlShipmentSubstatus ?? '').trim().toLowerCase() || null;
  const isRescheduleException = isMlRescheduleSubstatus(mlSubstatus);
  const isNewException = isRescheduleException && previousSubstatus !== mlSubstatus;

  const storeSubstatus =
    mlStatus === 'delivered' || mlStatus === 'cancelled' ? null : mlSubstatus;

  let order =
    (await updateOrderMlShipmentMeta(existing.id, mlStatus, storeSubstatus)) ?? existing;

  const next = mapMlShipmentStatusToOrderStatus(
    shipment.status,
    order.status,
    Boolean(order.repartidorId),
    shipment.substatus
  );

  if (next && next !== order.status) {
    await syncOrderStatus(order.id, next, statusLabel);
    order = (await getOrderById(order.id)) ?? order;
  } else if (isNewException || (next == null && previousSubstatus !== mlSubstatus)) {
    const last = order.history[order.history.length - 1];
    const alreadyLogged =
      last?.comment === comment ||
      Boolean(last?.comment?.includes(statusLabel)) ||
      order.history.some((e) => e.comment === comment);
    if (!alreadyLogged) {
      const updated = await appendOrderMarketplaceComment(order.id, comment);
      if (updated) order = updated;
    }
  }

  // Alinear día operativo con lead_time ML (reprogramaciones, EDT nuevo, etc.).
  let preferred: Date | null = null;
  if (
    integration &&
    shipment.id &&
    order.status !== OrderStatus.DELIVERED &&
    order.status !== OrderStatus.CANCELLED
  ) {
    preferred = await resolveMercadoLibreFlexDeliveryDeadline(
      integration,
      String(shipment.id)
    );
    if (preferred && !isRescheduleException) {
      const withDeadline = await updateOrderDeliveryDeadlineIfNeeded(
        order.id,
        preferred,
        'Fecha de entrega alineada con Mercado Libre'
      );
      if (withDeadline) order = withDeadline;
    }
  }

  // Ausente / reprogramado por comprador: mover al día que corresponde (hoy o fecha ML).
  // Idempotente: también corrige si el subestado ya estaba guardado pero el día quedó viejo.
  if (
    isRescheduleException &&
    order.status !== OrderStatus.DELIVERED &&
    order.status !== OrderStatus.CANCELLED
  ) {
    const reason =
      mlSubstatus === 'receiver_absent'
        ? 'Destinatario ausente · reprogramado para hoy'
        : mlSubstatus === 'buyer_rescheduled'
          ? 'Reprogramado por el comprador'
          : `${statusLabel} · reprogramado para hoy`;
    const rescheduled = await rescheduleOrderToNextOperationalDay(
      order.id,
      preferred,
      reason
    );
    if (rescheduled) order = rescheduled;
  }

  const sellerId = await getSellerIdForOrder(order.id);
  emitOrderUpdated(order, sellerId);
}

async function handleOrderResource(
  integration: StoreIntegration,
  mlOrderId: string
): Promise<void> {
  const validIntegration = await getValidMercadoLibreIntegration(integration.userId);
  const mlOrder = await fetchMercadoLibreOrder(validIntegration, mlOrderId);

  if (mlOrder.status === 'cancelled') {
    const existing = await findImportedMercadoLibreRefGlobal(mlOrderId, integration.userId);
    if (existing) {
      await syncOrderStatus(existing.id, OrderStatus.CANCELLED, 'Orden cancelada');
    }
    return;
  }

  if (mlOrder.status !== 'paid') return;

  const flexShipment = await fetchMercadoLibreFlexShipment(validIntegration, mlOrderId);
  if (!flexShipment) return;

  const existing = await findImportedMercadoLibreFlex(integration.userId, flexShipment);
  if (!existing) {
    await importFlexShipment(validIntegration, flexShipment);
    return;
  }

  if (flexShipment.mlShipmentStatus) {
    const shipment = await fetchMercadoLibreShipment(
      validIntegration,
      flexShipment.externalId
    );
    await syncOrderFromMlShipment(existing, shipment, validIntegration);
  }
}

/** Tópico shipments → GET /shipments/$SHIPMENT_ID (estado/subestado Flex). */
async function handleShipmentResource(
  integration: StoreIntegration,
  mlShipmentId: string
): Promise<void> {
  const validIntegration = await getValidMercadoLibreIntegration(integration.userId);
  const shipment = await fetchMercadoLibreShipment(validIntegration, mlShipmentId);

  if (shipment.logistic_type !== 'self_service') return;

  const existing = await resolveFlexOrderForShipment(validIntegration, mlShipmentId, shipment);
  if (!existing) return;

  await syncOrderFromMlShipment(existing, shipment, validIntegration);
}

/** Mapea driver_id de Flex (o la cuenta ML del webhook) al repartidor Posta de la agencia. */
async function resolveRepartidorForFlexHandshake(
  assignment: MlFlexAssignment | null,
  integration: StoreIntegration,
  agencyId: string | null,
  scanningRepartidor?: User | null
): Promise<User | null> {
  flexScanLog('resolviendo repartidor', {
    driverId: assignment?.driver_id ?? null,
    integrationUserId: integration.userId,
    agencyId,
    scanningRepartidorId: scanningRepartidor?.id ?? null,
  });

  if (scanningRepartidor) {
    flexScanLog('repartidor del escaneo (cuenta ML del webhook)', {
      repartidorId: scanningRepartidor.id,
      repartidorName: scanningRepartidor.name,
    });
    return scanningRepartidor;
  }

  if (assignment?.driver_id) {
    const byDriver = await getRepartidorByMercadoLibreUserId(assignment.driver_id, agencyId);
    if (byDriver) {
      flexScanLog('repartidor encontrado por driver_id', {
        repartidorId: byDriver.id,
        repartidorName: byDriver.name,
        driverId: assignment.driver_id,
      });
      return byDriver;
    }
    flexScanLog('sin repartidor Posta para driver_id', {
      driverId: assignment.driver_id,
      agencyId,
    });
  }

  // Misma cuenta ML agencia/vendedor = courier: ML a menudo no manda driver_id.
  // Si hay un repartidor Posta con esa misma external_user_id, asignarle el escaneo.
  if (integration.externalUserId) {
    const bySharedMl = await getRepartidorByMercadoLibreUserId(
      integration.externalUserId,
      agencyId
    );
    if (bySharedMl) {
      flexScanLog('repartidor por cuenta ML compartida (agencia/courier)', {
        repartidorId: bySharedMl.id,
        repartidorName: bySharedMl.name,
        mlUserId: integration.externalUserId,
        driverId: assignment?.driver_id ?? null,
      });
      return bySharedMl;
    }
  }

  const scanner = await getUserById(integration.userId);
  if (scanner?.role === UserRole.REPARTIDOR && scanner.agencyId === agencyId) {
    flexScanLog('repartidor por cuenta ML del webhook', {
      repartidorId: scanner.id,
      repartidorName: scanner.name,
    });
    return scanner;
  }

  flexScanLog('no se pudo resolver repartidor', {
    integrationUserId: integration.userId,
    integrationUserRole: scanner?.role ?? null,
    agencyId,
    driverId: assignment?.driver_id ?? null,
  });
  return null;
}

/** Tópico flex-handshakes → GET assignment/v1 del resource de la notificación. */
async function handleFlexHandshakeResource(
  integration: StoreIntegration,
  resource: string
): Promise<void> {
  flexScanLog('inicio handshake Flex', {
    resource,
    integrationUserId: integration.userId,
    mlUserId: integration.externalUserId,
  });

  const context = await buildFlexWebhookContext(integration);
  const parsed = parseMercadoLibreNotificationResource(resource);
  const shipmentId = parsed.shipmentId;
  if (!shipmentId) {
    flexScanLog('handshake ignorado: sin shipmentId en resource', { resource });
    return;
  }

  const assignmentIntegrations = await buildAssignmentIntegrations(context);
  const assignment = await fetchFlexAssignmentWithFallback(
    assignmentIntegrations,
    resource,
    parsed,
    shipmentId
  );

  flexScanLog('assignment ML obtenido', {
    shipmentId,
    driverId: assignment?.driver_id ?? null,
    siteId: parsed.siteId ?? null,
  });

  let existing = await findOrderByExternalGlobal('mercadolibre', shipmentId);
  if (existing) {
    flexScanLog('pedido Posta ya existía por shipmentId', {
      orderId: existing.id,
      shipmentId,
    });
  }

  const shipmentResult = await fetchShipmentWithFallback(context.dataIntegrations, shipmentId);
  const shipment = shipmentResult?.shipment ?? null;
  const dataIntegration =
    shipmentResult?.integration ?? context.dataIntegrations[0] ?? null;

  if (shipment && shipment.logistic_type !== 'self_service' && !existing) {
    flexScanLog('handshake ignorado: no es Flex (self_service)', {
      shipmentId,
      logisticType: shipment.logistic_type,
    });
    return;
  }

  if (!existing) {
    if (!shipment || !dataIntegration) {
      flexScanLog('handshake sin pedido Posta — no hay datos ML para importar', {
        shipmentId,
        hasShipment: Boolean(shipment),
        hasDataIntegration: Boolean(dataIntegration),
      });
      return;
    }
    existing = await resolveFlexOrderForShipment(dataIntegration, shipmentId, shipment);
    if (!existing) {
      flexScanLog('handshake sin pedido Posta — importación falló', { shipmentId });
      return;
    }
  }

  const repartidor = await resolveRepartidorForFlexHandshake(
    assignment,
    integration,
    existing.agencyId ?? context.agencyId,
    context.scanningRepartidor
  );

  const driverNote = repartidor
    ? existing.repartidorId && existing.repartidorId !== repartidor.id
      ? `Handshake Flex · transferido a ${repartidor.name}`
      : `Handshake Flex · colectado por ${repartidor.name}`
    : assignment?.driver_id
      ? `Handshake Flex · transportista ML #${assignment.driver_id}`
      : 'Handshake Flex · colecta o transferencia registrada en ML';
  const statusLabel = shipment
    ? formatMlShipmentStatusLabel(shipment)
    : 'escaneo Flex';
  const comment = `${driverNote} · ${statusLabel}`;

  const updated = await appendOrderMarketplaceComment(existing.id, comment);
  if (updated) {
    existing = updated;
  }

  let assignedToRepartidor = false;
  if (repartidor) {
    const repartidorIdBefore = existing.repartidorId;
    const isTransfer = Boolean(repartidorIdBefore && repartidorIdBefore !== repartidor.id);
    const assignComment = isTransfer
      ? `Reasignado por escaneo en Mercado Envíos Flex (último escaneo)`
      : 'Asignado automáticamente por escaneo en Mercado Envíos Flex';
    const assignedOrder = await assignOrderToRepartidorFromMarketplace(
      existing.id,
      repartidor.id,
      assignComment
    );
    if (assignedOrder?.repartidorId === repartidor.id) {
      existing = assignedOrder;
      assignedToRepartidor = repartidorIdBefore !== repartidor.id;
      flexScanLog('pedido asignado al repartidor', {
        orderId: existing.id,
        repartidorId: repartidor.id,
        repartidorName: repartidor.name,
        isTransfer,
        status: existing.status,
      });
      if (assignedToRepartidor) {
        await createNotification({
          id: `n_ml_flex_assign_${Date.now()}_${existing.id}`,
          userId: repartidor.id,
          title: isTransfer ? 'Pedido transferido (Flex)' : 'Pedido asignado (Flex)',
          body: isTransfer
            ? `El envío ${existing.id} quedó asignado a vos por el último escaneo en Mercado Envíos Flex.`
            : `Se te asignó el pedido ${existing.id} por escaneo en Mercado Envíos Flex.`,
          type: 'order_assigned',
          orderId: existing.id,
        });
        if (isTransfer && repartidorIdBefore) {
          await createNotification({
            id: `n_ml_flex_unassign_${Date.now()}_${existing.id}`,
            userId: repartidorIdBefore,
            title: 'Pedido transferido (Flex)',
            body: `El envío ${existing.id} fue escaneado por ${repartidor.name} y ya no está asignado a vos.`,
            type: 'info',
            orderId: existing.id,
          });
        }
      }
    } else {
      flexScanLog('asignación no aplicada', {
        orderId: existing.id,
        repartidorId: repartidor.id,
        assignedRepartidorId: assignedOrder?.repartidorId ?? null,
        orderStatus: existing.status,
      });
    }
  } else {
    flexScanLog('handshake sin repartidor — solo comentario en pedido', {
      orderId: existing.id,
      shipmentId,
      driverId: assignment?.driver_id ?? null,
    });
  }

  const sellerId = await getSellerIdForOrder(existing.id);
  emitOrderUpdated(existing, sellerId);
  await notifySellerFlexEvent(
    sellerId,
    existing,
    assignedToRepartidor ? 'Colecta Flex — repartidor asignado' : 'Colecta Flex en Mercado Libre',
    assignedToRepartidor && repartidor
      ? `Tu envío ${existing.id} (ML #${shipmentId}) fue colectado por ${repartidor.name} en Flex.`
      : `Tu envío ${existing.id} (ML #${shipmentId}) fue escaneado o transferido en Flex.`
  );

  if (shipment) {
    await syncOrderFromMlShipment(existing, shipment);
  }
  flexScanLog('handshake Flex completado', {
    orderId: existing.id,
    shipmentId,
    repartidorId: existing.repartidorId,
    status: existing.status,
    assignedToRepartidor,
  });
}

export async function processMercadoLibreNotification(
  payload: MercadoLibreNotificationPayload
): Promise<void> {
  if (isDuplicateNotification(payload._id)) {
    console.log('[ml-webhook] Notificación duplicada ignorada', { _id: payload._id });
    return;
  }

  const integration = await findMercadoLibreIntegrationByMlUserId(payload.user_id);
  if (!integration) {
    console.warn('[ml-webhook] Sin integración para user_id', payload.user_id, {
      topic: payload.topic,
      resource: payload.resource,
    });
    return;
  }

  const resource = payload.resource?.trim();
  if (!resource) return;

  console.log(
    `[ml-webhook] ${payload.topic} user=${payload.user_id} resource=${resource}`
  );

  const parsed = parseMercadoLibreNotificationResource(resource);
  const orderFromResource = resource.match(/\/orders\/(\d+)/i)?.[1];
  const mlOrderId = parsed.mlOrderId ?? orderFromResource;
  const shipmentId = parsed.shipmentId;

  try {
    if (payload.topic === 'flex-handshakes') {
      await handleFlexHandshakeResource(integration, resource);
      return;
    }

    if (payload.topic === 'orders_v2' || payload.topic === 'orders') {
      if (mlOrderId) {
        await handleOrderResource(integration, mlOrderId);
      }
      return;
    }

    if (payload.topic === 'shipments') {
      if (shipmentId) {
        await handleShipmentResource(integration, shipmentId);
        return;
      }
      if (mlOrderId) {
        await handleOrderResource(integration, mlOrderId);
      }
    }
  } catch (err) {
    console.error('[ml-webhook] Error procesando notificación:', err);
  }
}

/** Reprocesa notificaciones perdidas reportadas por ML (missed_feeds). */
export async function replayMercadoLibreMissedFeeds(options?: {
  topic?: string;
  limit?: number;
}): Promise<{ replayed: number; errors: number }> {
  if (!env.mercadolibre.appId || !env.mercadolibre.appOwnerAccessToken) {
    return { replayed: 0, errors: 0 };
  }

  const messages = (await fetchMercadoLibreMissedFeeds({
    topic: options?.topic,
    limit: options?.limit ?? 50,
  })) as MercadoLibreNotificationPayload[];

  if (messages.length > 0) {
    console.log('[ml-webhook] missed_feeds obtenido', {
      topic: options?.topic ?? 'all',
      count: messages.length,
    });
  }

  let replayed = 0;
  let errors = 0;

  for (const message of messages) {
    try {
      await processMercadoLibreNotification(message);
      replayed++;
    } catch {
      errors++;
    }
  }

  return { replayed, errors };
}
