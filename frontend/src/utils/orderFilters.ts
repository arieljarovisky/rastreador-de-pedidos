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
import { buildCordonMapZones } from '../config/ambaCordonZones.js';
import { getOperationalDateKey } from './deliverySummary.js';

export const UNASSIGNED_REPARTIDOR_FILTER = '__unassigned__';

export function getOrderCordonId(
  order: Order,
  deliveryZones: DeliveryZone[],
  barrios: Barrio[]
): string | null {
  const cordonZones = buildCordonMapZones(deliveryZones, barrios);
  return findPricingZoneForPoint(cordonZones, order.lat, order.lng, barrios)?.id ?? null;
}

/** Día operativo del pedido (corte de entrega o día de creación). */
export function getOrderOperationalDateKey(order: Order): string {
  if (order.deliveryDeadline) {
    return getOperationalDateKey(new Date(order.deliveryDeadline));
  }
  return getOperationalDateKey(new Date(order.createdAt));
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
    if (getOrderCordonId(order, zones, barrios) !== filters.cordonId) return false;
  }

  if (filters.dateKey && getOrderOperationalDateKey(order) !== filters.dateKey) {
    return false;
  }

  return true;
}
