export interface DeliveryZone {
  id: string;
  name: string;
  color: string;
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

export function findZoneForPoint(
  zones: DeliveryZone[],
  lat: number,
  lng: number
): DeliveryZone | null {
  for (const zone of zones) {
    if (lat >= zone.south && lat <= zone.north && lng >= zone.west && lng <= zone.east) {
      return zone;
    }
  }
  return null;
}

export function zoneLabel(zones: DeliveryZone[], zoneId: string | null | undefined): string {
  return getDeliveryZone(zones, zoneId)?.name ?? 'Sin zona';
}
