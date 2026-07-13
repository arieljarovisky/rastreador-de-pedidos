import { User, Order, UserRole, OrderStatus } from '../types/index.js';
import { geocodeAddress } from './geocode.service.js';
import {
  createOrder,
  findOrderByExternal,
  findOrderByExternalGlobal,
  getSellerIdForOrder,
  assignOrderToScanningRepartidor,
  recordMercadoLibreLabelScan,
  assertOrderAccessibleForLabelScan,
  updateOrderStatus,
  applyMercadoLibreSyncState,
  updateOrderDeliveryDeadlineIfNeeded,
  listOpenMercadoLibreOrdersForAgency,
} from './orders.service.js';
import {
  listMercadoLibreFlexShipments,
  getValidMercadoLibreIntegration,
  parseMercadoLibreScanCode,
  resolveMercadoLibreFlexFromScan,
  findImportedMercadoLibreFlex,
  findImportedMercadoLibreFlexGlobal,
  resolveMercadoLibreShipmentId,
  syncMercadoLibreFlexOnScan,
  fetchMercadoLibreShipment,
  fetchMercadoLibreFlexAssignment,
  resolveMercadoLibreFlexAssignmentProbe,
  extractMercadoLibreFlexDriverId,
  isMercadoLibreFlexWithCourier,
  formatMlShipmentStatusLabel,
  mapMercadoLibreShipmentToOrderStatus,
  resolveMercadoLibreFlexDeliveryDeadline,
  type MercadoLibreFlexShipment,
} from './mercadolibre.service.js';
import {
  listTiendaNubeExpressShipments,
  type TiendaNubeDateRange,
  type TiendaNubeExpressShipment,
} from './tiendanube.service.js';
import {
  getIntegration,
  getAgencyMercadoLibreIntegration,
  listMercadoLibreIntegrationsForAgencyScan,
  type IntegrationPlatform,
  type StoreIntegration,
} from './integrations.service.js';
import { assertSellerInAgency, getRepartidorByMercadoLibreUserId, getUserById } from './users.service.js';
import { isAgencyAdmin } from '../utils/roles.js';
import { sleep } from '../utils/sleep.js';
import { createNotification } from './notifications.service.js';
import { emitOrderUpdated } from '../realtime/io.js';
import { env } from '../config/env.js';
import {
  ensureAgencyMlBridgeUser,
  getAgencyOperatorForImport,
} from './agency-ml.service.js';

const recentFlexSyncByRepartidor = new Map<string, number>();
const inFlightFlexSyncByRepartidor = new Set<string>();
const FLEX_SYNC_COOLDOWN_MS = 60_000;
const FLEX_SYNC_FORCE_COOLDOWN_MS = 15_000;
/**
 * Pedidos Flex suelen entrar vie/sáb/dom y se escanean el lunes (o finde largo).
 * Hay que cubrir varios días de altas, no solo las últimas 24h.
 */
const FLEX_SYNC_LOOKBACK_DAYS = 10;
const FLEX_SYNC_SHIPMENT_LIMIT = 50;

function formatImportError(externalId: string, reason: string): string {
  if (reason === 'GEOCODE_UNAVAILABLE') {
    return `#${externalId}: el mapa está saturado. Esperá unos segundos e importá de nuevo.`;
  }
  if (reason === 'SELLER_NO_AGENCY') {
    return 'Tu cuenta no está asociada a una agencia. Pedile a tu agencia de logística que verifique tu usuario.';
  }
  if (reason === 'EXTERNAL_ORDER_EXISTS') {
    return `#${externalId}: ya fue importado antes.`;
  }
  if (reason.includes('Duplicate entry') && reason.includes('PRIMARY')) {
    return `#${externalId}: conflicto de ID interno. Reintentá la importación.`;
  }
  return `#${externalId}: ${reason}`;
}

export interface MarketplaceShipmentPreview {
  externalId: string;
  mlOrderId?: string;
  mlPackId?: string;
  platform: IntegrationPlatform;
  shippingType: 'flex' | 'express';
  clientName: string;
  clientPhone: string;
  address: string;
  lat?: number;
  lng?: number;
  notes: string;
  createdAt: string;
  alreadyImported: boolean;
  mlShipmentStatus?: string;
  mlShipmentSubstatus?: string | null;
  mlProductCount?: number;
  mlOrderIds?: string[];
}

type RawShipment = MercadoLibreFlexShipment | TiendaNubeExpressShipment;

async function markImported(
  userId: string,
  shipments: RawShipment[],
  options?: { agencyMode?: boolean }
): Promise<MarketplaceShipmentPreview[]> {
  const previews: MarketplaceShipmentPreview[] = [];
  for (const s of shipments) {
    const existing =
      s.platform === 'mercadolibre'
        ? options?.agencyMode
          ? await findImportedMercadoLibreFlexGlobal({
              externalId: s.externalId,
              mlOrderId: (s as MercadoLibreFlexShipment).mlOrderId,
            })
          : await findImportedMercadoLibreFlex(userId, {
              externalId: s.externalId,
              mlOrderId: (s as MercadoLibreFlexShipment).mlOrderId,
            })
        : await findOrderByExternal(userId, s.platform, s.externalId);
    previews.push({
      ...s,
      alreadyImported: Boolean(existing),
    });
  }
  return previews;
}

/** Tras importar, sincroniza estado ML y repartidor Flex (assignment). */
export async function syncMercadoLibreOrderAfterImport(
  sellerUserId: string,
  order: Order,
  flex: Pick<
    MercadoLibreFlexShipment,
    'externalId' | 'mlShipmentStatus' | 'mlShipmentSubstatus'
  >
): Promise<Order> {
  try {
    const integration = await getValidMercadoLibreIntegration(sellerUserId);
    const liveShipment = await fetchMercadoLibreShipment(integration, flex.externalId);
    const mlStatus = liveShipment.status ?? flex.mlShipmentStatus;
    const mlSubstatus = liveShipment.substatus ?? flex.mlShipmentSubstatus ?? null;

    let currentOrder = order;
    const mlDeadline = await resolveMercadoLibreFlexDeliveryDeadline(integration, flex.externalId);
    if (mlDeadline) {
      const withDeadline = await updateOrderDeliveryDeadlineIfNeeded(order.id, mlDeadline);
      if (withDeadline) currentOrder = withDeadline;
    }

    let repartidorId: string | null = null;
    if (order.agencyId) {
      const assignment = await fetchMercadoLibreFlexAssignment(
        integration,
        env.mercadolibre.siteId,
        flex.externalId
      );
      const driverId = extractMercadoLibreFlexDriverId(assignment);
      if (driverId) {
        const repartidor = await getRepartidorByMercadoLibreUserId(driverId, order.agencyId);
        repartidorId = repartidor?.id ?? null;
      }
    }

    const targetStatus = mapMercadoLibreShipmentToOrderStatus(mlStatus, mlSubstatus, {
      hasRepartidor: Boolean(repartidorId),
      onImport: true,
    });
    if (!targetStatus) {
      return currentOrder;
    }
    if (targetStatus === OrderStatus.PENDING && !repartidorId) {
      return currentOrder;
    }

    const statusLabel = formatMlShipmentStatusLabel({
      status: mlStatus,
      substatus: mlSubstatus ?? undefined,
    });
    const comment = repartidorId
      ? `Importado desde ML · estado ${statusLabel} · repartidor sincronizado`
      : `Importado desde ML · estado ${statusLabel}`;

    const updated = await applyMercadoLibreSyncState(currentOrder.id, {
      status: targetStatus,
      repartidorId,
      comment,
    });
    return updated ?? currentOrder;
  } catch (err) {
    console.warn('[ml-import] No se pudo sincronizar estado ML:', err);
    return order;
  }
}

const ML_LIVE_SYNC_LIMIT = 12;

function isOpenMercadoLibreOrder(order: Order): boolean {
  return (
    order.externalSource === 'mercadolibre' &&
    Boolean(order.externalOrderId) &&
    order.status !== OrderStatus.DELIVERED &&
    order.status !== OrderStatus.CANCELLED &&
    !order.archived
  );
}

/** Consulta ML y actualiza pedidos Flex abiertos (respaldo si no llegaron webhooks). */
export async function syncOpenMercadoLibreOrdersInList(orders: Order[]): Promise<Order[]> {
  const openMl = orders.filter(isOpenMercadoLibreOrder);
  if (openMl.length === 0) return orders;

  const toSync = openMl.slice(0, ML_LIVE_SYNC_LIMIT);
  const updates = new Map<string, Order>();

  await Promise.all(
    toSync.map(async (order) => {
      const sellerId = order.sellerId ?? (await getSellerIdForOrder(order.id));
      if (!sellerId || !order.externalOrderId) return;

      const updated = await syncMercadoLibreOrderAfterImport(sellerId, order, {
        externalId: order.externalOrderId,
      });
      if (
        updated.status !== order.status ||
        updated.repartidorId !== order.repartidorId
      ) {
        emitOrderUpdated(updated, sellerId);
      }
      updates.set(order.id, updated);
    })
  );

  if (updates.size === 0) return orders;
  return orders.map((order) => updates.get(order.id) ?? order);
}

export async function syncMercadoLibreOrderLiveStatus(
  sellerUserId: string,
  order: Order
): Promise<Order> {
  if (!isOpenMercadoLibreOrder(order) || !order.externalOrderId) return order;
  return syncMercadoLibreOrderAfterImport(sellerUserId, order, {
    externalId: order.externalOrderId,
  });
}

/**
 * Respaldo cuando ML no envía webhooks flex-handshakes:
 * consulta envíos Flex de la agencia y asigna los que ML tiene asignados al repartidor.
 */
export async function syncFlexScansForRepartidor(
  repartidor: User,
  options?: { force?: boolean }
): Promise<number> {
  if (repartidor.role !== UserRole.REPARTIDOR || !repartidor.agencyId) return 0;

  const now = Date.now();
  const lastSync = recentFlexSyncByRepartidor.get(repartidor.id) ?? 0;
  const cooldown = options?.force ? FLEX_SYNC_FORCE_COOLDOWN_MS : FLEX_SYNC_COOLDOWN_MS;
  if (now - lastSync < cooldown) return 0;
  // Evita syncs simultáneos del mismo repartidor (cada corrida hace ~40 requests a ML).
  if (inFlightFlexSyncByRepartidor.has(repartidor.id)) return 0;
  inFlightFlexSyncByRepartidor.add(repartidor.id);
  recentFlexSyncByRepartidor.set(repartidor.id, now);
  try {
    return await runFlexScansSync(repartidor, now, options);
  } finally {
    inFlightFlexSyncByRepartidor.delete(repartidor.id);
  }
}

async function runFlexScansSync(
  repartidor: User,
  now: number,
  options?: { force?: boolean }
): Promise<number> {
  if (!repartidor.agencyId) return 0;

  const repartidorMl = await getIntegration(repartidor.id, 'mercadolibre');
  const mlCourierId = repartidorMl?.externalUserId;
  if (!mlCourierId) {
    console.log('[ml-flex-sync] repartidor sin ML conectado', { repartidorId: repartidor.id });
    return 0;
  }

  console.log('[ml-flex-sync] iniciando sync', {
    repartidorId: repartidor.id,
    mlCourierId,
    agencyId: repartidor.agencyId,
    lookbackDays: FLEX_SYNC_LOOKBACK_DAYS,
    force: Boolean(options?.force),
  });

  if (options?.force) {
    try {
      const { replayMercadoLibreMissedFeeds } = await import('./mercadolibre-webhook.service.js');
      const replay = await replayMercadoLibreMissedFeeds({
        topic: 'flex-handshakes',
        limit: 20,
      });
      if (replay.replayed > 0 || replay.errors > 0) {
        console.log('[ml-flex-sync] missed_feeds flex-handshakes', replay);
      }
    } catch (err) {
      console.warn(
        '[ml-flex-sync] missed_feeds falló',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  const operator = await getAgencyOperatorForImport(repartidor.agencyId);
  const contexts = await listMercadoLibreIntegrationsForAgencyScan(repartidor.agencyId);
  if (contexts.length === 0) {
    console.warn('[ml-flex-sync] agencia sin integraciones ML', { agencyId: repartidor.agencyId });
    return 0;
  }

  // Misma cuenta ML en agencia/vendedor y repartidor: ML suele devolver assignment sin driver_id.
  const agencyMl = await getAgencyMercadoLibreIntegration(repartidor.agencyId);
  const sharedAccountMlIds = new Set<string>();
  if (agencyMl?.externalUserId && agencyMl.externalUserId === mlCourierId) {
    sharedAccountMlIds.add(agencyMl.externalUserId);
  }
  for (const ctx of contexts) {
    if (ctx.integration.externalUserId && ctx.integration.externalUserId === mlCourierId) {
      sharedAccountMlIds.add(ctx.integration.externalUserId);
    }
  }
  const sharedAccountMode = sharedAccountMlIds.size > 0;

  const dateFrom = new Date(now - FLEX_SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  let synced = 0;
  let checked = 0;
  let matched = 0;
  const seenShipmentIds = new Set<string>();
  const sampleSkips: Array<{
    shipmentId: string;
    driverId: string | null;
    assignmentStatus: number | null;
    mlStatus?: string | null;
    matchReason?: string;
  }> = [];
  const assignmentStatusCounts: Record<string, number> = {};

  let repartidorIntegration: StoreIntegration | null = null;
  try {
    repartidorIntegration = await getValidMercadoLibreIntegration(repartidor.id);
  } catch {
    console.warn('[ml-flex-sync] token ML del repartidor inválido', { repartidorId: repartidor.id });
  }

  if (sharedAccountMode) {
    console.log('[ml-flex-sync] modo cuenta ML compartida (agencia/vendedor = courier)', {
      repartidorId: repartidor.id,
      mlCourierId,
    });
  }

  const shipmentMatchesCourier = (
    driverId: string | null,
    flex?: MercadoLibreFlexShipment
  ): { ok: boolean; reason: string } => {
    if (driverId === String(mlCourierId)) {
      return { ok: true, reason: 'driver_id' };
    }
    if (!sharedAccountMode) {
      return { ok: false, reason: 'driver_mismatch' };
    }
    // Misma cuenta: si ML publica otro driver, no pisar.
    if (driverId && driverId !== String(mlCourierId)) {
      return { ok: false, reason: 'other_driver' };
    }
    // Sin driver_id: solo envíos ya en ruta / con courier (evita asignar todo el depósito).
    if (
      flex &&
      isMercadoLibreFlexWithCourier(flex.mlShipmentStatus, flex.mlShipmentSubstatus)
    ) {
      return { ok: true, reason: 'shared_account_in_transit' };
    }
    return { ok: false, reason: 'shared_account_not_in_transit' };
  };

  const tryAssignShipment = async (
    shipmentId: string,
    assignmentIntegrations: StoreIntegration[],
    importOwner: User,
    mlIntegrationUserId: string,
    agencyMode: boolean,
    flex?: MercadoLibreFlexShipment
  ): Promise<boolean> => {
    if (seenShipmentIds.has(shipmentId)) return false;
    seenShipmentIds.add(shipmentId);
    checked++;

    const probe = await resolveMercadoLibreFlexAssignmentProbe(
      assignmentIntegrations,
      shipmentId
    );
    const driverId = extractMercadoLibreFlexDriverId(probe.assignment);
    const statusKey = probe.status == null ? 'none' : String(probe.status);
    assignmentStatusCounts[statusKey] = (assignmentStatusCounts[statusKey] ?? 0) + 1;

    const match = shipmentMatchesCourier(driverId, flex);
    let resolvedMatch = match;
    if (
      !resolvedMatch.ok &&
      sharedAccountMode &&
      !driverId &&
      options?.force
    ) {
      const existing =
        (await findImportedMercadoLibreFlexGlobal({
          externalId: shipmentId,
          mlOrderId: flex?.mlOrderId ?? shipmentId,
        })) ?? null;
      if (existing && !existing.repartidorId) {
        // Escaneo previo de la agencia con la misma cuenta ML: quedó en Posta sin repartidor.
        resolvedMatch = { ok: true, reason: 'shared_account_unassigned_order' };
      }
    }

    if (!resolvedMatch.ok) {
      if (sampleSkips.length < 8) {
        sampleSkips.push({
          shipmentId,
          driverId,
          assignmentStatus: probe.status,
          mlStatus: flex
            ? `${flex.mlShipmentStatus ?? ''}/${flex.mlShipmentSubstatus ?? ''}`
            : null,
          matchReason: resolvedMatch.reason,
        });
      }
      return false;
    }
    matched++;

    console.log('[ml-flex-sync] envío asignado al repartidor en ML', {
      shipmentId,
      repartidorId: repartidor.id,
      driverId,
      matchReason: resolvedMatch.reason,
    });

    let order: Order | null = null;
    if (flex) {
      const result = await importMercadoLibreFlexShipment(importOwner, flex, {
        mlIntegrationUserId,
        agencyMode,
      });
      if (result.kind !== 'imported' && result.kind !== 'synced') return false;
      order = result.order;
    } else {
      order =
        (await findImportedMercadoLibreFlexGlobal({
          externalId: shipmentId,
          mlOrderId: shipmentId,
        })) ?? null;
      if (!order) return false;
    }

    if (order.repartidorId !== repartidor.id) {
      order = await assignOrderToScanningRepartidor(
        repartidor,
        order.id,
        resolvedMatch.reason.startsWith('shared_account')
          ? 'Asignado por escaneo Flex (cuenta ML compartida con agencia)'
          : 'Asignado por escaneo en Mercado Envíos Flex (sync)'
      );
    }

    const sellerId = await getSellerIdForOrder(order.id);
    emitOrderUpdated(order, sellerId);
    synced++;
    return true;
  };

  for (const { integration, isAgencyAccount } of contexts) {
    try {
      const validIntegration = await getValidMercadoLibreIntegration(integration.userId);
      const flexShipments = await listMercadoLibreFlexShipments(integration.userId, { dateFrom });
      const assignmentIntegrations = [
        ...(repartidorIntegration ? [repartidorIntegration] : []),
        validIntegration,
      ];
      const sellerUser = await getUserById(integration.userId);
      const owner =
        isAgencyAccount && operator ? operator : sellerUser ?? operator ?? repartidor;

      for (const flex of flexShipments.slice(0, FLEX_SYNC_SHIPMENT_LIMIT)) {
        await tryAssignShipment(
          flex.externalId,
          assignmentIntegrations,
          owner,
          integration.userId,
          isAgencyAccount,
          flex
        );
      }
    } catch (err) {
      console.warn('[ml-flex-sync] error en integración', {
        integrationUserId: integration.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Pedidos ya en Posta: re-chequear assignment aunque estén fuera de la ventana de listado ML.
  try {
    const openOrders = await listOpenMercadoLibreOrdersForAgency(repartidor.agencyId, 40);
    const assignmentIntegrations = [
      ...(repartidorIntegration ? [repartidorIntegration] : []),
      ...contexts.map((c) => c.integration),
    ];

    for (const order of openOrders) {
      if (!order.externalOrderId) continue;
      if (order.repartidorId === repartidor.id) continue;

      await tryAssignShipment(
        order.externalOrderId,
        assignmentIntegrations,
        operator ?? repartidor,
        contexts[0]?.integration.userId ?? repartidor.id,
        true
      );
    }
  } catch (err) {
    console.warn('[ml-flex-sync] error revisando pedidos abiertos', {
      agencyId: repartidor.agencyId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  console.log('[ml-flex-sync] sync completado', {
    repartidorId: repartidor.id,
    mlCourierId,
    sharedAccountMode,
    checked,
    matched,
    synced,
    assignmentStatusCounts,
    ...(matched === 0 && sampleSkips.length > 0 ? { sampleSkips } : {}),
  });

  return synced;
}

export interface MarketplaceListOptions {
  dateFrom?: string;
  dateTo?: string;
  /** Números de orden o envío ML (ej. 2000013826685141) para importar sin listar antes. */
  mlRefs?: string[];
}

type ImportFlexResult =
  | { kind: 'imported'; order: Order }
  | { kind: 'synced'; order: Order }
  | { kind: 'error'; message: string; fatal?: boolean };

interface ImportFlexOptions {
  mlIntegrationUserId: string;
  agencyMode?: boolean;
}

async function importMercadoLibreFlexShipment(
  user: User,
  shipment: MercadoLibreFlexShipment,
  options?: ImportFlexOptions
): Promise<ImportFlexResult> {
  const mlUserId = options?.mlIntegrationUserId ?? user.id;
  const agencyMode = options?.agencyMode ?? false;

  try {
    const existing = agencyMode
      ? await findImportedMercadoLibreFlexGlobal(shipment)
      : await findImportedMercadoLibreFlex(mlUserId, shipment);
    if (existing) {
      const synced = await syncMercadoLibreOrderAfterImport(mlUserId, existing, shipment);
      const sellerId = await getSellerIdForOrder(synced.id);
      emitOrderUpdated(synced, sellerId);
      return { kind: 'synced', order: synced };
    }

    let lat = shipment.lat;
    let lng = shipment.lng;
    if (lat === undefined || lng === undefined) {
      const geocoded = await geocodeAddress(shipment.address);
      if (!geocoded) {
        return {
          kind: 'error',
          message: `#${shipment.externalId}: no se pudo ubicar la dirección en el mapa.`,
        };
      }
      lat = geocoded.lat;
      lng = geocoded.lng;
    }

    const integration = await getValidMercadoLibreIntegration(mlUserId);
    const mlDeadline = await resolveMercadoLibreFlexDeliveryDeadline(
      integration,
      shipment.externalId
    );

    let order = await createOrder(user, {
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
      historyComment: agencyMode
        ? `Importado desde ML (cuenta de la agencia) · envío #${shipment.externalId}`
        : undefined,
    });

    order = await syncMercadoLibreOrderAfterImport(mlUserId, order, shipment);
    const sellerId = await getSellerIdForOrder(order.id);
    emitOrderUpdated(order, sellerId);
    return { kind: 'imported', order };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'error desconocido';
    return {
      kind: 'error',
      message: formatImportError(shipment.externalId, reason),
      fatal: reason === 'SELLER_NO_AGENCY',
    };
  }
}

/** Importa uno o más envíos Flex por número de orden o envío MLA escrito. */
export async function importMercadoLibreByRefs(
  user: User,
  refs: string[],
  options?: { notify?: boolean; flexOptions?: ImportFlexOptions }
): Promise<{ imported: number; skipped: number; orders: string[]; errors: string[] }> {
  const flexOptions = options?.flexOptions;
  const mlUserId = flexOptions?.mlIntegrationUserId ?? user.id;
  const integration = await getValidMercadoLibreIntegration(mlUserId);
  let imported = 0;
  let skipped = 0;
  const orderIds: string[] = [];
  const errors: string[] = [];
  const seenShipments = new Set<string>();

  for (const rawRef of refs) {
    const trimmed = rawRef.trim();
    if (!trimmed) continue;

    const candidates = parseMercadoLibreScanCode(trimmed);
    if (candidates.length === 0) {
      errors.push(`"${trimmed}": ingresá un número de orden o envío de Mercado Libre.`);
      skipped++;
      continue;
    }

    const flex = await resolveMercadoLibreFlexFromScan(integration, candidates);
    if (!flex) {
      errors.push(
        `#${trimmed}: no se encontró un envío Flex en tu cuenta de Mercado Libre.`
      );
      skipped++;
      continue;
    }

    if (seenShipments.has(flex.externalId)) {
      skipped++;
      continue;
    }
    seenShipments.add(flex.externalId);

    const result = await importMercadoLibreFlexShipment(user, flex, flexOptions);
    if (result.kind === 'imported') {
      imported++;
      orderIds.push(result.order.id);
    } else if (result.kind === 'synced') {
      skipped++;
      orderIds.push(result.order.id);
    } else {
      errors.push(result.message);
      skipped++;
      if (result.fatal) break;
    }
  }

  if (imported > 0 && options?.notify !== false) {
    await createNotification({
      id: `n_import_${Date.now()}_${user.id}`,
      userId: user.id,
      title: imported === 1 ? 'Envío importado' : 'Envíos importados',
      body:
        imported === 1
          ? `Se importó 1 pedido de Mercado Libre Flex como ${orderIds[0]}.`
          : `Se importaron ${imported} pedidos de Mercado Libre Flex.`,
      type: 'info',
      orderId: orderIds[0],
    });
  }

  return { imported, skipped, orders: orderIds, errors };
}

export async function listImportableShipments(
  userId: string,
  platform: IntegrationPlatform,
  options?: MarketplaceListOptions
): Promise<MarketplaceShipmentPreview[]> {
  if (platform === 'mercadolibre') {
    const flex = await listMercadoLibreFlexShipments(userId, {
      dateFrom: options?.dateFrom,
      dateTo: options?.dateTo,
    });
    return markImported(userId, flex);
  }

  const dateRange: TiendaNubeDateRange | undefined =
    options?.dateFrom || options?.dateTo
      ? { dateFrom: options.dateFrom, dateTo: options.dateTo }
      : undefined;
  const express = await listTiendaNubeExpressShipments(userId, dateRange);
  return markImported(userId, express);
}

export async function listAgencyImportableShipments(
  user: User,
  platform: IntegrationPlatform,
  options?: MarketplaceListOptions
): Promise<MarketplaceShipmentPreview[]> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) {
    throw new Error('FORBIDDEN');
  }
  if (platform !== 'mercadolibre') {
    throw new Error('FORBIDDEN');
  }

  const bridge = await ensureAgencyMlBridgeUser(user.agencyId);
  const integration = await getValidMercadoLibreIntegration(bridge.id);
  void integration;

  const flex = await listMercadoLibreFlexShipments(bridge.id, {
    dateFrom: options?.dateFrom,
    dateTo: options?.dateTo,
  });
  return markImported(bridge.id, flex, { agencyMode: true });
}

export async function importAgencyMarketplaceShipments(
  user: User,
  platform: IntegrationPlatform,
  externalIds?: string[],
  options?: MarketplaceListOptions
): Promise<{ imported: number; skipped: number; orders: string[]; errors: string[] }> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) {
    throw new Error('FORBIDDEN');
  }
  if (platform !== 'mercadolibre') {
    throw new Error('FORBIDDEN');
  }

  const bridge = await ensureAgencyMlBridgeUser(user.agencyId);
  const flexOptions: ImportFlexOptions = {
    mlIntegrationUserId: bridge.id,
    agencyMode: true,
  };

  if (options?.mlRefs?.length) {
    return importMercadoLibreByRefs(user, options.mlRefs, {
      notify: true,
      flexOptions,
    });
  }

  const all = await listAgencyImportableShipments(user, platform, options);
  const matchesExternalId = (s: MarketplaceShipmentPreview, id: string) =>
    s.externalId === id || s.mlOrderId === id;

  let toImport = all.filter((s) => !s.alreadyImported && s.mlShipmentStatus !== 'delivered');
  if (externalIds?.length) {
    toImport = all.filter(
      (s) => externalIds.some((id) => matchesExternalId(s, id)) && !s.alreadyImported
    );
  }

  let imported = 0;
  let skipped = 0;
  const orderIds: string[] = [];
  const errors: string[] = [];
  const seenMlShipments = new Set<string>();

  for (const shipment of toImport) {
    if (seenMlShipments.has(shipment.externalId)) {
      skipped++;
      continue;
    }
    seenMlShipments.add(shipment.externalId);

    const result = await importMercadoLibreFlexShipment(
      user,
      shipment as MercadoLibreFlexShipment,
      flexOptions
    );
    if (result.kind === 'imported') {
      imported++;
      orderIds.push(result.order.id);
    } else if (result.kind === 'synced') {
      skipped++;
      orderIds.push(result.order.id);
    } else {
      errors.push(result.message);
      skipped++;
      if (result.fatal) break;
    }
  }

  if (imported > 0) {
    const title = imported === 1 ? 'Envío importado' : 'Envíos importados';
    const body =
      imported === 1
        ? `Se importó 1 pedido de Mercado Libre Flex (agencia) como ${orderIds[0]}.`
        : `Se importaron ${imported} pedidos de Mercado Libre Flex (agencia).`;

    await createNotification({
      id: `n_import_agency_${Date.now()}_${user.id}`,
      userId: user.id,
      title,
      body,
      type: 'info',
      orderId: orderIds[0],
    });
  }

  return { imported, skipped, orders: orderIds, errors };
}

export async function importMarketplaceShipments(
  user: User,
  platform: IntegrationPlatform,
  externalIds?: string[],
  options?: MarketplaceListOptions
): Promise<{ imported: number; skipped: number; orders: string[]; errors: string[] }> {
  if (platform === 'mercadolibre' && options?.mlRefs?.length) {
    return importMercadoLibreByRefs(user, options.mlRefs);
  }

  const all = await listImportableShipments(user.id, platform, options);

  const matchesExternalId = (s: MarketplaceShipmentPreview, id: string) =>
    s.externalId === id || s.mlOrderId === id;

  let toImport = externalIds?.length
    ? all.filter((s) => externalIds.some((id) => matchesExternalId(s, id)) && !s.alreadyImported)
    : all.filter((s) => !s.alreadyImported);

  let imported = 0;
  let skipped = 0;
  const orderIds: string[] = [];
  const errors: string[] = [];

  if (externalIds?.length && platform === 'mercadolibre') {
    const listedIds = new Set(
      all.flatMap((s) => [s.externalId, s.mlOrderId].filter((id): id is string => Boolean(id)))
    );
    const unmatchedRefs = externalIds.filter((id) => !listedIds.has(id));
    if (unmatchedRefs.length > 0) {
      const refResult = await importMercadoLibreByRefs(user, unmatchedRefs, { notify: false });
      imported += refResult.imported;
      skipped += refResult.skipped;
      orderIds.push(...refResult.orders);
      errors.push(...refResult.errors);
    }
  }

  if (externalIds?.length && toImport.length === 0 && imported === 0 && errors.length === 0) {
    const allAlreadyImported = externalIds.every((id) =>
      all.some((s) => matchesExternalId(s, id) && s.alreadyImported)
    );
    if (allAlreadyImported) {
      const syncResult = await importMercadoLibreByRefs(user, externalIds, { notify: false });
      return {
        imported: syncResult.imported,
        skipped: syncResult.skipped,
        orders: syncResult.orders,
        errors:
          syncResult.errors.length > 0
            ? syncResult.errors
            : syncResult.imported === 0
              ? ['Esos pedidos ya fueron importados.']
              : [],
      };
    }
  }

  /** Packs ML: varias órdenes comparten un envío → importar una sola vez por envío. */
  const seenMlShipments = new Set<string>();

  for (const shipment of toImport) {
    if (shipment.platform === 'mercadolibre') {
      if (seenMlShipments.has(shipment.externalId)) {
        skipped++;
        continue;
      }
      seenMlShipments.add(shipment.externalId);

      const result = await importMercadoLibreFlexShipment(
        user,
        shipment as MercadoLibreFlexShipment,
        { mlIntegrationUserId: user.id }
      );
      if (result.kind === 'imported') {
        imported++;
        orderIds.push(result.order.id);
      } else if (result.kind === 'synced') {
        skipped++;
        orderIds.push(result.order.id);
      } else {
        errors.push(result.message);
        skipped++;
        if (result.fatal) break;
      }
      continue;
    }

    try {
      const existing = await findOrderByExternal(user.id, shipment.platform, shipment.externalId);
      if (existing) {
        skipped++;
        continue;
      }

      let lat = shipment.lat;
      let lng = shipment.lng;
      if (lat === undefined || lng === undefined) {
        const geocoded = await geocodeAddress(shipment.address);
        if (!geocoded) {
          skipped++;
          errors.push(`#${shipment.externalId}: no se pudo ubicar la dirección en el mapa.`);
          continue;
        }
        lat = geocoded.lat;
        lng = geocoded.lng;
      }

      const order = await createOrder(user, {
        clientName: shipment.clientName,
        clientPhone: shipment.clientPhone,
        address: shipment.address,
        lat,
        lng,
        notes: shipment.notes,
        externalSource: shipment.platform,
        externalOrderId: shipment.externalId,
        shippingType: shipment.shippingType,
      });

      const sellerId = await getSellerIdForOrder(order.id);
      emitOrderUpdated(order, sellerId);
      orderIds.push(order.id);
      imported++;
    } catch (err) {
      skipped++;
      const reason = err instanceof Error ? err.message : 'error desconocido';
      const formatted = formatImportError(shipment.externalId, reason);
      if (reason === 'SELLER_NO_AGENCY') {
        errors.push(formatted);
        break;
      }
      errors.push(formatted);
    }
  }

  if (imported === 0 && toImport.length > 0 && errors.length === 0 && skipped === 0) {
    errors.push('No se pudo importar ningún envío.');
  }

  if (imported > 0) {
    const platformLabel =
      platform === 'mercadolibre' ? 'Mercado Libre Flex' : 'Tienda Nube Express';
    const title = imported === 1 ? 'Envío importado' : 'Envíos importados';
    const body =
      imported === 1
        ? `Se importó 1 pedido de ${platformLabel} como ${orderIds[0]}.`
        : `Se importaron ${imported} pedidos de ${platformLabel}.`;

    await createNotification({
      id: `n_import_${Date.now()}_${user.id}`,
      userId: user.id,
      title,
      body,
      type: 'info',
      orderId: orderIds[0],
    });
  }

  return { imported, skipped, orders: orderIds, errors };
}

export interface MercadoLibreScanImportResult {
  order: Order;
  alreadyImported: boolean;
  sellerId: string;
  sellerName: string;
  externalOrderId: string;
  mlFlexRegistered: boolean;
  mlFlexMessage: string;
}

export interface ScanLocation {
  lat: number;
  lng: number;
}

export function parseScanLocation(lat?: unknown, lng?: unknown): ScanLocation | undefined {
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    return undefined;
  }
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return undefined;
  }
  if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
    return undefined;
  }
  return { lat: parsedLat, lng: parsedLng };
}

/** Notifica al vendedor cuando un repartidor o la agencia escanea su etiqueta ML. */
async function notifySellerOnLabelScan(
  sellerId: string | null | undefined,
  scanner: User,
  order: Order,
  externalOrderId: string,
  alreadyImported: boolean
): Promise<void> {
  if (!sellerId) return;

  const title = alreadyImported ? 'Etiqueta escaneada' : 'Paquete colectado';
  const body = alreadyImported
    ? `${scanner.name} escaneó la etiqueta ML #${externalOrderId} de tu envío ${order.id}.`
    : `${scanner.name} colectó tu envío ML #${externalOrderId} (${order.clientName}) → ${order.id}.`;

  await createNotification({
    id: `n_scan_seller_${Date.now()}_${order.id}`,
    userId: sellerId,
    title,
    body,
    type: 'info',
    orderId: order.id,
  });
}

/** Asigna el pedido al repartidor que escaneó (colecta Flex → Mis envíos). */
async function assignScannedOrderToRepartidorIfNeeded(user: User, order: Order): Promise<Order> {
  if (user.role !== UserRole.REPARTIDOR) return order;
  try {
    const updated = await assignOrderToScanningRepartidor(
      user,
      order.id,
      'Asignado por escaneo de etiqueta ML'
    );
    if (updated.repartidorId === user.id && updated.repartidorId !== order.repartidorId) {
      await createNotification({
        id: `n_scan_assign_${Date.now()}_${order.id}`,
        userId: user.id,
        title: 'Pedido asignado',
        body: `Se te asignó el envío ${updated.id} (${updated.clientName}) por escaneo de etiqueta.`,
        type: 'order_assigned',
        orderId: updated.id,
      });
    }
    return updated;
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_AVAILABLE') return order;
    throw err;
  }
}

async function attachMercadoLibreFlexSync(
  user: User,
  base: Omit<MercadoLibreScanImportResult, 'mlFlexRegistered' | 'mlFlexMessage'>,
  shipmentId: string
): Promise<MercadoLibreScanImportResult> {
  if (!user.agencyId) {
    return {
      ...base,
      mlFlexRegistered: false,
      mlFlexMessage: 'Sin agencia asociada para sincronizar con Flex.',
    };
  }

  try {
    const flexSync = await Promise.race([
      syncMercadoLibreFlexOnScan(user.agencyId, shipmentId, user.id, user.role),
      sleep(25_000).then(() => ({
        registered: false,
        message:
          'Mercado Libre tardó demasiado en responder. El pedido quedó en Posta; reintentá el escaneo en unos segundos.',
      })),
    ]);
    return {
      ...base,
      mlFlexRegistered: flexSync.registered,
      mlFlexMessage: flexSync.message,
    };
  } catch (err) {
    console.warn('[scan-import] Flex sync error:', err);
    return {
      ...base,
      mlFlexRegistered: false,
      mlFlexMessage:
        'No se pudo registrar en Mercado Libre Flex. El pedido quedó en Posta; verificá tu conexión ML en el perfil.',
    };
  }
}

export async function importMercadoLibreByScanForAgency(
  user: User,
  code: string,
  sellerId?: string,
  scanLocation?: ScanLocation
): Promise<MercadoLibreScanImportResult> {
  const canScan = isAgencyAdmin(user.role) || user.role === UserRole.REPARTIDOR;
  if (!canScan || !user.agencyId) {
    throw new Error('FORBIDDEN');
  }

  const candidates = parseMercadoLibreScanCode(code);
  if (candidates.length === 0) {
    throw new Error('ML_SCAN_INVALID');
  }

  async function returnRescan(
    existing: Order,
    externalOrderId: string,
    sellerName: string,
    sellerIdForResult: string,
    shipmentId: string
  ): Promise<MercadoLibreScanImportResult> {
    assertOrderAccessibleForLabelScan(user, existing);
    let updated = await recordMercadoLibreLabelScan(user, existing.id, externalOrderId, {
      isFirstImport: false,
      lat: scanLocation?.lat,
      lng: scanLocation?.lng,
    });
    updated = await assignScannedOrderToRepartidorIfNeeded(user, updated);
    const assignedSellerId = await getSellerIdForOrder(updated.id);
    emitOrderUpdated(updated, assignedSellerId);
    await notifySellerOnLabelScan(
      assignedSellerId ?? sellerIdForResult,
      user,
      updated,
      externalOrderId,
      true
    );
    return attachMercadoLibreFlexSync(
      user,
      {
        order: updated,
        alreadyImported: true,
        sellerId: sellerIdForResult,
        sellerName,
        externalOrderId,
      },
      shipmentId
    );
  }

  for (const candidate of candidates) {
    const existing = await findOrderByExternalGlobal('mercadolibre', candidate.id);
    if (existing) {
      const existingSellerId = await getSellerIdForOrder(existing.id);
      const seller = existingSellerId ? await getUserById(existingSellerId) : null;
      const shipmentId =
        existingSellerId != null
          ? await resolveMercadoLibreShipmentId(existingSellerId, existing.externalOrderId ?? candidate.id)
          : existing.externalOrderId ?? candidate.id;
      return returnRescan(
        existing,
        candidate.id,
        seller?.name ?? 'Vendedor',
        existingSellerId ?? '',
        shipmentId
      );
    }
  }

  let integrationContexts = await listMercadoLibreIntegrationsForAgencyScan(user.agencyId);
  if (sellerId) {
    await assertSellerInAgency(sellerId, user.agencyId);
    const selected = await getIntegration(sellerId, 'mercadolibre');
    if (!selected) throw new Error('ML_SELLER_NOT_CONNECTED');
    integrationContexts = [{ integration: selected, isAgencyAccount: false }];
  }

  if (integrationContexts.length === 0) {
    throw new Error('ML_NOT_CONNECTED');
  }

  for (const { integration, isAgencyAccount } of integrationContexts) {
    let validIntegration = integration;
    try {
      validIntegration = await getValidMercadoLibreIntegration(integration.userId);
    } catch {
      continue;
    }

    const flex = await resolveMercadoLibreFlexFromScan(validIntegration, candidates);
    if (!flex) continue;

    const existing = isAgencyAccount
      ? await findImportedMercadoLibreFlexGlobal(flex)
      : await findImportedMercadoLibreFlex(validIntegration.userId, flex);
    if (existing) {
      const seller = isAgencyAccount ? null : await getUserById(validIntegration.userId);
      return returnRescan(
        existing,
        flex.mlOrderId,
        seller?.name ?? 'Agencia',
        existing.sellerId ?? validIntegration.userId,
        flex.externalId
      );
    }

    let lat = flex.lat;
    let lng = flex.lng;
    if (lat === undefined || lng === undefined) {
      const geocoded = await geocodeAddress(flex.address);
      if (!geocoded) throw new Error('GEOCODE_UNAVAILABLE');
      lat = geocoded.lat;
      lng = geocoded.lng;
    }

    const seller = isAgencyAccount ? null : await getUserById(validIntegration.userId);
    const mlDeadline = await resolveMercadoLibreFlexDeliveryDeadline(
      validIntegration,
      flex.externalId
    );
    let order = await createOrder(user, {
      clientName: flex.clientName,
      clientPhone: flex.clientPhone,
      address: flex.address,
      lat,
      lng,
      notes: flex.notes,
      sellerId: isAgencyAccount ? undefined : validIntegration.userId,
      externalSource: flex.platform,
      externalOrderId: flex.externalId,
      shippingType: flex.shippingType,
      deliveryDeadline: mlDeadline ?? undefined,
      historyComment: isAgencyAccount
        ? `Etiqueta ML #${flex.mlOrderId} escaneada en colecta (cuenta de la agencia)`
        : `Etiqueta ML #${flex.mlOrderId} escaneada en colecta (${seller?.name ?? 'vendedor'})`,
      historyLat: scanLocation?.lat,
      historyLng: scanLocation?.lng,
    });
    order = await assignScannedOrderToRepartidorIfNeeded(user, order);

    const assignedSellerId = await getSellerIdForOrder(order.id);
    emitOrderUpdated(order, assignedSellerId);
    await notifySellerOnLabelScan(
      assignedSellerId ?? (isAgencyAccount ? null : validIntegration.userId),
      user,
      order,
      flex.mlOrderId,
      false
    );

    return attachMercadoLibreFlexSync(
      user,
      {
        order,
        alreadyImported: false,
        sellerId: isAgencyAccount ? '' : validIntegration.userId,
        sellerName: seller?.name ?? 'Agencia',
        externalOrderId: flex.externalId,
      },
      flex.externalId
    );
  }

  throw new Error('ML_SCAN_NOT_FOUND');
}
