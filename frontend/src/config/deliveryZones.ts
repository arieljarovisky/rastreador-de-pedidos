import { CORDON_ZONE_IDS, isCordonZoneId, isLegacyZoneId, CORDON_ZONE_META } from './ambaCordonZones.js';

export interface DeliveryZone {
  id: string;
  name: string;
  color: string;
  south: number;
  west: number;
  north: number;
  east: number;
  barrios?: string[];
  shippingRates?: {
    flex: number;
    express: number;
    standard: number;
  };
  driverPayRates?: {
    flex: number;
    express: number;
    standard: number;
  };
}

export const DEFAULT_ZONE_SHIPPING_RATES = {
  flex: 2800,
  express: 3200,
  standard: 2500,
};

export const DEFAULT_ZONE_DRIVER_PAY_RATES = {
  flex: 1500,
  express: 1800,
  standard: 1200,
};

export function zoneShippingRates(zone: DeliveryZone) {
  return zone.shippingRates ?? DEFAULT_ZONE_SHIPPING_RATES;
}

export function zoneDriverPayRates(zone: DeliveryZone) {
  return zone.driverPayRates ?? DEFAULT_ZONE_DRIVER_PAY_RATES;
}

export interface Barrio {
  id: string;
  name: string;
  area: 'CABA' | 'GBA';
  south: number;
  west: number;
  north: number;
  east: number;
}

export function getDeliveryZone(
  zones: DeliveryZone[],
  zoneId: string | null | undefined
): DeliveryZone | undefined {
  if (!zoneId) return undefined;
  return zones.find((z) => z.id === zoneId);
}

export function isPricingZoneId(zoneId: string): boolean {
  return isCordonZoneId(zoneId) && !isLegacyZoneId(zoneId);
}

export function isAssignmentZone(zone: DeliveryZone): boolean {
  return !isPricingZoneId(zone.id);
}

export function isDeletableAssignmentZone(zone: DeliveryZone): boolean {
  return isAssignmentZone(zone) && !isLegacyZoneId(zone.id);
}

export { isLegacyZoneId };

export function pricingZoneDisplayName(zone: DeliveryZone): string {
  const meta = CORDON_ZONE_META[zone.id as (typeof CORDON_ZONE_IDS)[number]];
  return meta?.name ?? zone.name;
}

export function pricingZones(zones: DeliveryZone[]): DeliveryZone[] {
  return zones.filter((z) => isPricingZoneId(z.id));
}

export function assignmentZones(zones: DeliveryZone[]): DeliveryZone[] {
  return zones.filter((z) => isAssignmentZone(z));
}

const PRICING_ZONE_ORDER = new Map(CORDON_ZONE_IDS.map((id, i) => [id, i]));

export function sortPricingZones(zones: DeliveryZone[]): DeliveryZone[] {
  return [...zones].sort((a, b) => {
    const ai = PRICING_ZONE_ORDER.get(a.id as (typeof CORDON_ZONE_IDS)[number]) ?? 99;
    const bi = PRICING_ZONE_ORDER.get(b.id as (typeof CORDON_ZONE_IDS)[number]) ?? 99;
    return ai - bi;
  });
}

function pointInBarrio(lat: number, lng: number, barrio: Barrio): boolean {
  return lat >= barrio.south && lat <= barrio.north && lng >= barrio.west && lng <= barrio.east;
}

function barrioArea(barrio: Barrio): number {
  return Math.max(0, barrio.north - barrio.south) * Math.max(0, barrio.east - barrio.west);
}

/**
 * Fallback por bbox: elige el barrio más chico que contenga el punto.
 * Así un partido GBA grande no “roba” un barrio CABA chico, y viceversa
 * se reduce el solape de rectángulos aproximados.
 */
function matchZoneForPoint(
  zones: DeliveryZone[],
  lat: number,
  lng: number,
  barrioCatalog: Barrio[] = []
): DeliveryZone | null {
  const catalog = new Map(barrioCatalog.map((b) => [b.id, b]));
  let best: { zone: DeliveryZone; area: number } | null = null;

  for (const zone of zones) {
    if (zone.barrios?.length) {
      for (const id of zone.barrios) {
        const barrio = catalog.get(id);
        if (!barrio || !pointInBarrio(lat, lng, barrio)) continue;
        const area = barrioArea(barrio);
        if (!best || area < best.area) {
          best = { zone, area };
        }
      }
      continue;
    }
    if (lat >= zone.south && lat <= zone.north && lng >= zone.west && lng <= zone.east) {
      const area = Math.max(0, zone.north - zone.south) * Math.max(0, zone.east - zone.west);
      if (!best || area < best.area) {
        best = { zone, area };
      }
    }
  }
  return best?.zone ?? null;
}

export function findPricingZoneForPoint(
  zones: DeliveryZone[],
  lat: number,
  lng: number,
  barrioCatalog: Barrio[] = []
): DeliveryZone | null {
  return matchZoneForPoint(sortPricingZones(pricingZones(zones)), lat, lng, barrioCatalog);
}

export function findAssignmentZoneForPoint(
  zones: DeliveryZone[],
  lat: number,
  lng: number,
  barrioCatalog: Barrio[] = []
): DeliveryZone | null {
  return matchZoneForPoint(assignmentZones(zones), lat, lng, barrioCatalog);
}

/** Tarifa de envío según cordón geográfico. */
export function findZoneForPoint(
  zones: DeliveryZone[],
  lat: number,
  lng: number,
  barrioCatalog: Barrio[] = []
): DeliveryZone | null {
  return findPricingZoneForPoint(zones, lat, lng, barrioCatalog);
}

export function zoneLabel(zones: DeliveryZone[], zoneId: string | null | undefined): string {
  return getDeliveryZone(zones, zoneId)?.name ?? 'Sin zona';
}

export function barrioNames(barrioCatalog: Barrio[], barrioIds: string[]): string {
  const catalog = new Map(barrioCatalog.map((b) => [b.id, b.name]));
  return barrioIds.map((id) => catalog.get(id) ?? id).join(', ');
}

export const ZONE_COLOR_PRESETS = [
  '#F9E04B',
  '#6BCB9A',
  '#6BA4E8',
  '#B5E48C',
  '#3b82f6',
  '#8b5cf6',
  '#ef4444',
  '#f59e0b',
];
