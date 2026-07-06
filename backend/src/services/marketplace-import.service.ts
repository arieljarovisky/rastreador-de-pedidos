import { User, Order, UserRole, OrderStatus } from '../types/index.js';
import { geocodeAddress } from './geocode.service.js';
import {
  createOrder,
  findOrderByExternal,
  findOrderByExternalGlobal,
  getSellerIdForOrder,
  recordMercadoLibreLabelScan,
  assertOrderAccessibleForLabelScan,
  updateOrderStatus,
  applyMercadoLibreSyncState,
} from './orders.service.js';
import {
  listMercadoLibreFlexShipments,
  getValidMercadoLibreIntegration,
  parseMercadoLibreScanCode,
  resolveMercadoLibreFlexFromScan,
  findImportedMercadoLibreFlex,
  resolveMercadoLibreShipmentId,
  syncMercadoLibreFlexOnScan,
  fetchMercadoLibreShipment,
  fetchMercadoLibreFlexAssignment,
  formatMlShipmentStatusLabel,
  mapMercadoLibreShipmentToOrderStatus,
  type MercadoLibreFlexShipment,
} from './mercadolibre.service.js';
import {
  listTiendaNubeExpressShipments,
  type TiendaNubeDateRange,
  type TiendaNubeExpressShipment,
} from './tiendanube.service.js';
import {
  getIntegration,
  listMercadoLibreIntegrationsForAgency,
  type IntegrationPlatform,
} from './integrations.service.js';
import { assertSellerInAgency, getRepartidorByMercadoLibreUserId, getUserById } from './users.service.js';
import { isAgencyAdmin } from '../utils/roles.js';
import { sleep } from '../utils/sleep.js';
import { createNotification } from './notifications.service.js';
import { emitOrderUpdated } from '../realtime/io.js';
import { env } from '../config/env.js';

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
}

type RawShipment = MercadoLibreFlexShipment | TiendaNubeExpressShipment;

async function markImported(
  userId: string,
  shipments: RawShipment[]
): Promise<MarketplaceShipmentPreview[]> {
  const previews: MarketplaceShipmentPreview[] = [];
  for (const s of shipments) {
    const existing =
      s.platform === 'mercadolibre'
        ? await findImportedMercadoLibreFlex(userId, {
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

    let repartidorId: string | null = null;
    if (order.agencyId) {
      const assignment = await fetchMercadoLibreFlexAssignment(
        integration,
        env.mercadolibre.siteId,
        flex.externalId
      );
      if (assignment?.driver_id) {
        const repartidor = await getRepartidorByMercadoLibreUserId(
          assignment.driver_id,
          order.agencyId
        );
        repartidorId = repartidor?.id ?? null;
      }
    }

    const targetStatus = mapMercadoLibreShipmentToOrderStatus(mlStatus, mlSubstatus, {
      hasRepartidor: Boolean(repartidorId),
      onImport: true,
    });
    if (!targetStatus) {
      return order;
    }
    if (targetStatus === OrderStatus.PENDING && !repartidorId) {
      return order;
    }

    const statusLabel = formatMlShipmentStatusLabel({
      status: mlStatus,
      substatus: mlSubstatus ?? undefined,
    });
    const comment = repartidorId
      ? `Importado desde ML · estado ${statusLabel} · repartidor sincronizado`
      : `Importado desde ML · estado ${statusLabel}`;

    const updated = await applyMercadoLibreSyncState(order.id, {
      status: targetStatus,
      repartidorId,
      comment,
    });
    return updated ?? order;
  } catch (err) {
    console.warn('[ml-import] No se pudo sincronizar estado ML:', err);
    return order;
  }
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

async function importMercadoLibreFlexShipment(
  user: User,
  shipment: MercadoLibreFlexShipment
): Promise<ImportFlexResult> {
  try {
    const existing = await findImportedMercadoLibreFlex(user.id, shipment);
    if (existing) {
      const synced = await syncMercadoLibreOrderAfterImport(user.id, existing, shipment);
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
    });

    order = await syncMercadoLibreOrderAfterImport(user.id, order, shipment);
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
  options?: { notify?: boolean }
): Promise<{ imported: number; skipped: number; orders: string[]; errors: string[] }> {
  const integration = await getValidMercadoLibreIntegration(user.id);
  let imported = 0;
  let skipped = 0;
  const orderIds: string[] = [];
  const errors: string[] = [];

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

    const result = await importMercadoLibreFlexShipment(user, flex);
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
    const flex = await listMercadoLibreFlexShipments(userId);
    return markImported(userId, flex);
  }

  const dateRange: TiendaNubeDateRange | undefined =
    options?.dateFrom || options?.dateTo
      ? { dateFrom: options.dateFrom, dateTo: options.dateTo }
      : undefined;
  const express = await listTiendaNubeExpressShipments(userId, dateRange);
  return markImported(userId, express);
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

  for (const shipment of toImport) {
    if (shipment.platform === 'mercadolibre') {
      const result = await importMercadoLibreFlexShipment(user, shipment as MercadoLibreFlexShipment);
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
  if (order.status !== OrderStatus.PENDING || order.repartidorId) return order;
  return updateOrderStatus(
    user,
    order.id,
    OrderStatus.ASSIGNED,
    undefined,
    'Asignado por escaneo de etiqueta ML'
  );
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

  let integrations = await listMercadoLibreIntegrationsForAgency(user.agencyId);
  if (sellerId) {
    await assertSellerInAgency(sellerId, user.agencyId);
    const selected = await getIntegration(sellerId, 'mercadolibre');
    if (!selected) throw new Error('ML_SELLER_NOT_CONNECTED');
    integrations = [selected];
  }

  if (integrations.length === 0) {
    throw new Error('ML_NO_SELLERS_CONNECTED');
  }

  for (const integration of integrations) {
    let validIntegration = integration;
    try {
      validIntegration = await getValidMercadoLibreIntegration(integration.userId);
    } catch {
      continue;
    }

    const flex = await resolveMercadoLibreFlexFromScan(validIntegration, candidates);
    if (!flex) continue;

    const existing = await findImportedMercadoLibreFlex(validIntegration.userId, flex);
    if (existing) {
      const seller = await getUserById(validIntegration.userId);
      return returnRescan(
        existing,
        flex.mlOrderId,
        seller?.name ?? 'Vendedor',
        validIntegration.userId,
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

    const seller = await getUserById(validIntegration.userId);
    let order = await createOrder(user, {
      clientName: flex.clientName,
      clientPhone: flex.clientPhone,
      address: flex.address,
      lat,
      lng,
      notes: flex.notes,
      sellerId: validIntegration.userId,
      externalSource: flex.platform,
      externalOrderId: flex.externalId,
      shippingType: flex.shippingType,
      historyComment: `Etiqueta ML #${flex.mlOrderId} escaneada en colecta (${seller?.name ?? 'vendedor'})`,
      historyLat: scanLocation?.lat,
      historyLng: scanLocation?.lng,
    });
    order = await assignScannedOrderToRepartidorIfNeeded(user, order);

    const assignedSellerId = await getSellerIdForOrder(order.id);
    emitOrderUpdated(order, assignedSellerId);
    await notifySellerOnLabelScan(
      assignedSellerId ?? validIntegration.userId,
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
        sellerId: validIntegration.userId,
        sellerName: seller?.name ?? 'Vendedor',
        externalOrderId: flex.externalId,
      },
      flex.externalId
    );
  }

  throw new Error('ML_SCAN_NOT_FOUND');
}
