/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Order } from '../types.js';
import {
  findPricingZoneForPoint,
  type Barrio,
  type DeliveryZone,
} from '../config/deliveryZones.js';
import { buildCordonMapZones, CORDON_ZONE_IDS } from '../config/ambaCordonZones.js';
import { findZoneForPointByGeo, isAmbaGeoLoaded } from './zoneMapGeo.js';
import { getOperationalDateKey } from './deliverySummary.js';

export const UNASSIGNED_REPARTIDOR_FILTER = '__unassigned__';

/** Normaliza ids tipo `agencia_zona_caba` → `zona_caba`. */
export function canonicalCordonZoneId(zoneId: string | null | undefined): string | null {
  if (!zoneId) return null;
  for (const id of CORDON_ZONE_IDS) {
    if (zoneId === id || zoneId.endsWith(`_${id}`)) return id;
  }
  return zoneId;
}

export function getOrderCordonId(
  order: Order,
  deliveryZones: DeliveryZone[],
  barrios: Barrio[]
): string | null {
  const cordonZones = buildCordonMapZones(deliveryZones, barrios);
  if (isAmbaGeoLoaded()) {
    const geoZone = findZoneForPointByGeo(cordonZones, order.lat, order.lng, barrios);
    if (geoZone) return canonicalCordonZoneId(geoZone.id);
  }
  return canonicalCordonZoneId(
    findPricingZoneForPoint(cordonZones, order.lat, order.lng, barrios)?.id ?? null
  );
}

/** Día operativo del pedido (corte de entrega o día de creación). */
export function getOrderOperationalDateKey(order: Order): string {
  if (order.deliveryDeadline) {
    return getOperationalDateKey(new Date(order.deliveryDeadline));
  }
  return getOperationalDateKey(new Date(order.createdAt));
}

/** Día en que el pedido se importó / creó en Posta. */
export function getOrderImportedDateKey(order: Order): string {
  return getOperationalDateKey(new Date(order.createdAt));
}

/** Fechas relevantes del pedido: importación y día operativo de entrega. */
export function getOrderDateKeys(order: Order): string[] {
  const keys = new Set<string>();
  keys.add(getOrderImportedDateKey(order));
  keys.add(getOrderOperationalDateKey(order));
  return [...keys];
}

/** True si el pedido pertenece al día (por importación o por entrega operativa). */
export function orderBelongsToDateKey(order: Order, dateKey: string): boolean {
  return getOrderDateKeys(order).includes(dateKey);
}

export function matchesOrderFilters(
  order: Order,
  filters: {
    sellerId?: string;
    cordonId?: string;
    repartidorId?: string;
    dateKey?: string;
    deliveryZones?: DeliveryZone[];
    barrios?: Barrio[];
  }
): boolean {
  if (filters.sellerId && order.sellerId !== filters.sellerId) return false;

  if (filters.repartidorId) {
    if (filters.repartidorId === UNASSIGNED_REPARTIDOR_FILTER) {
      if (order.repartidorId) return false;
    } else if (order.repartidorId !== filters.repartidorId) {
      return false;
    }
  }

  if (filters.cordonId) {
    const zones = filters.deliveryZones ?? [];
    const barrios = filters.barrios ?? [];
    const orderCordon = getOrderCordonId(order, zones, barrios);
    const filterCordon = canonicalCordonZoneId(filters.cordonId);
    if (!orderCordon || orderCordon !== filterCordon) return false;
  }

  if (filters.dateKey && !orderBelongsToDateKey(order, filters.dateKey)) {
    return false;
  }

  return true;
}
