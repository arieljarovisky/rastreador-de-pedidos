import { User, Order } from '../types/index.js';
import { geocodeAddress } from './geocode.service.js';
import {
  createOrder,
  findOrderByExternal,
  findOrderByExternalGlobal,
  getSellerIdForOrder,
} from './orders.service.js';
import {
  listMercadoLibreFlexShipments,
  getValidMercadoLibreIntegration,
  parseMercadoLibreScanCode,
  resolveMercadoLibreFlexFromScan,
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
import { assertSellerInAgency, getUserById } from './users.service.js';
import { isAgencyAdmin } from '../utils/roles.js';
import { createNotification } from './notifications.service.js';
import { emitOrderUpdated } from '../realtime/io.js';

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
}

type RawShipment = MercadoLibreFlexShipment | TiendaNubeExpressShipment;

async function markImported(
  userId: string,
  shipments: RawShipment[]
): Promise<MarketplaceShipmentPreview[]> {
  const previews: MarketplaceShipmentPreview[] = [];
  for (const s of shipments) {
    const existing = await findOrderByExternal(userId, s.platform, s.externalId);
    previews.push({
      ...s,
      alreadyImported: Boolean(existing),
    });
  }
  return previews;
}

export interface MarketplaceListOptions {
  dateFrom?: string;
  dateTo?: string;
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
  const all = await listImportableShipments(user.id, platform, options);
  const toImport = externalIds?.length
    ? all.filter((s) => externalIds.includes(s.externalId) && !s.alreadyImported)
    : all.filter((s) => !s.alreadyImported);

  if (externalIds?.length && toImport.length === 0) {
    const missing = externalIds.filter((id) => !all.some((s) => s.externalId === id));
    if (missing.length > 0) {
      return {
        imported: 0,
        skipped: externalIds.length,
        orders: [],
        errors: [`No se encontraron los pedidos #${missing.join(', #')} para importar. Buscá envíos de nuevo.`],
      };
    }
    return {
      imported: 0,
      skipped: externalIds.length,
      orders: [],
      errors: ['Esos pedidos ya fueron importados.'],
    };
  }

  let imported = 0;
  let skipped = 0;
  const orderIds: string[] = [];
  const errors: string[] = [];

  for (const shipment of toImport) {
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

  if (imported === 0 && toImport.length > 0 && errors.length === 0) {
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
}

export async function importMercadoLibreByScanForAgency(
  user: User,
  code: string,
  sellerId?: string
): Promise<MercadoLibreScanImportResult> {
  if (!isAgencyAdmin(user.role) || !user.agencyId) {
    throw new Error('FORBIDDEN');
  }

  const candidates = parseMercadoLibreScanCode(code);
  if (candidates.length === 0) {
    throw new Error('ML_SCAN_INVALID');
  }

  for (const candidate of candidates) {
    if (candidate.type !== 'order') continue;
    const existing = await findOrderByExternalGlobal('mercadolibre', candidate.id);
    if (existing) {
      const existingSellerId = await getSellerIdForOrder(existing.id);
      const seller = existingSellerId ? await getUserById(existingSellerId) : null;
      return {
        order: existing,
        alreadyImported: true,
        sellerId: existingSellerId ?? '',
        sellerName: seller?.name ?? 'Vendedor',
        externalOrderId: candidate.id,
      };
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

    const existing = await findOrderByExternal(
      validIntegration.userId,
      'mercadolibre',
      flex.externalId
    );
    if (existing) {
      const seller = await getUserById(validIntegration.userId);
      return {
        order: existing,
        alreadyImported: true,
        sellerId: validIntegration.userId,
        sellerName: seller?.name ?? 'Vendedor',
        externalOrderId: flex.externalId,
      };
    }

    let lat = flex.lat;
    let lng = flex.lng;
    if (lat === undefined || lng === undefined) {
      const geocoded = await geocodeAddress(flex.address);
      if (!geocoded) throw new Error('GEOCODE_UNAVAILABLE');
      lat = geocoded.lat;
      lng = geocoded.lng;
    }

    const order = await createOrder(user, {
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
    });

    const assignedSellerId = await getSellerIdForOrder(order.id);
    emitOrderUpdated(order, assignedSellerId);

    const seller = await getUserById(validIntegration.userId);
    await createNotification({
      id: `n_scan_${Date.now()}_${user.id}`,
      userId: user.id,
      title: 'Colecta en vendedor',
      body: `Orden ML #${flex.externalId} de ${seller?.name ?? 'vendedor'} → ${order.id}.`,
      type: 'info',
      orderId: order.id,
    });

    return {
      order,
      alreadyImported: false,
      sellerId: validIntegration.userId,
      sellerName: seller?.name ?? 'Vendedor',
      externalOrderId: flex.externalId,
    };
  }

  throw new Error('ML_SCAN_NOT_FOUND');
}
