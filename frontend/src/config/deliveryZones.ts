export interface DeliveryZone {
  id: string;
  name: string;
  color: string;
  south: number;
  west: number;
  north: number;
  east: number;
}

export const DELIVERY_ZONES: DeliveryZone[] = [
  {
    id: 'zona_norte',
    name: 'Zona Norte',
    color: '#3b82f6',
    south: -34.6,
    west: -58.52,
    north: -34.52,
    east: -58.42,
  },
  {
    id: 'zona_centro',
    name: 'Zona Centro',
    color: '#8b5cf6',
    south: -34.64,
    west: -58.46,
    north: -34.58,
    east: -58.36,
  },
  {
    id: 'zona_sur',
    name: 'Zona Sur',
    color: '#ef4444',
    south: -34.72,
    west: -58.52,
    north: -34.62,
    east: -58.4,
  },
  {
    id: 'zona_oeste',
    name: 'Zona Oeste',
    color: '#f59e0b',
    south: -34.68,
    west: -58.58,
    north: -34.58,
    east: -58.48,
  },
  {
    id: 'zona_gba_sur',
    name: 'GBA Sur',
    color: '#ec4899',
    south: -34.78,
    west: -58.55,
    north: -34.68,
    east: -58.38,
  },
];

export function getDeliveryZone(zoneId: string | null | undefined): DeliveryZone | undefined {
  if (!zoneId) return undefined;
  return DELIVERY_ZONES.find((z) => z.id === zoneId);
}

export function findZoneForPoint(lat: number, lng: number): DeliveryZone | null {
  for (const zone of DELIVERY_ZONES) {
    if (lat >= zone.south && lat <= zone.north && lng >= zone.west && lng <= zone.east) {
      return zone;
    }
  }
  return null;
}

export function zoneLabel(zoneId: string | null | undefined): string {
  return getDeliveryZone(zoneId)?.name ?? 'Sin zona';
}
