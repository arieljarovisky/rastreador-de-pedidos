export interface DeliveryZone {
  id: string;
  name: string;
  color: string;
  south: number;
  west: number;
  north: number;
  east: number;
  barrios?: string[];
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

function pointInBarrio(lat: number, lng: number, barrio: Barrio): boolean {
  return lat >= barrio.south && lat <= barrio.north && lng >= barrio.west && lng <= barrio.east;
}

export function findZoneForPoint(
  zones: DeliveryZone[],
  lat: number,
  lng: number,
  barrioCatalog: Barrio[] = []
): DeliveryZone | null {
  const catalog = new Map(barrioCatalog.map((b) => [b.id, b]));

  for (const zone of zones) {
    if (zone.barrios?.length) {
      const inZone = zone.barrios.some((id) => {
        const barrio = catalog.get(id);
        return barrio ? pointInBarrio(lat, lng, barrio) : false;
      });
      if (inZone) return zone;
      continue;
    }
    if (lat >= zone.south && lat <= zone.north && lng >= zone.west && lng <= zone.east) {
      return zone;
    }
  }
  return null;
}

export function zoneLabel(zones: DeliveryZone[], zoneId: string | null | undefined): string {
  return getDeliveryZone(zones, zoneId)?.name ?? 'Sin zona';
}

export function barrioNames(barrioCatalog: Barrio[], barrioIds: string[]): string {
  const catalog = new Map(barrioCatalog.map((b) => [b.id, b.name]));
  return barrioIds.map((id) => catalog.get(id) ?? id).join(', ');
}

export const ZONE_COLOR_PRESETS = [
  '#3b82f6',
  '#8b5cf6',
  '#ef4444',
  '#f59e0b',
  '#ec4899',
  '#10b981',
  '#06b6d4',
  '#84cc16',
];
