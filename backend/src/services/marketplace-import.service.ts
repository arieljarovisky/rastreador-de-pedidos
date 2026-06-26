import { User } from '../types/index.js';
import { geocodeAddress } from './geocode.service.js';
import { createOrder, findOrderByExternal, getSellerIdForOrder } from './orders.service.js';
import {
  listMercadoLibreFlexShipments,
  type MercadoLibreFlexShipment,
} from './mercadolibre.service.js';
import {
  listTiendaNubeExpressShipments,
  type TiendaNubeDateRange,
  type TiendaNubeExpressShipment,
} from './tiendanube.service.js';
import type { IntegrationPlatform } from './integrations.service.js';
import { createNotification } from './notifications.service.js';
import { emitOrderUpdated } from '../realtime/io.js';

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

      await createNotification({
        id: `n_import_${Date.now()}_${order.id}`,
        userId: 'all',
        title: 'Envío importado',
        body: `Se importó el pedido ${shipment.platform === 'mercadolibre' ? 'Flex' : 'Express'} #${shipment.externalId} como ${order.id}.`,
        type: 'info',
        orderId: order.id,
      });

      const sellerId = await getSellerIdForOrder(order.id);
      emitOrderUpdated(order, sellerId);

      orderIds.push(order.id);
      imported++;
    } catch (err) {
      skipped++;
      const reason = err instanceof Error ? err.message : 'error desconocido';
      errors.push(`#${shipment.externalId}: ${reason}`);
    }
  }

  if (imported === 0 && toImport.length > 0 && errors.length === 0) {
    errors.push('No se pudo importar ningún envío.');
  }

  return { imported, skipped, orders: orderIds, errors };
}
