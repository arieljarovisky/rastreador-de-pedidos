/** Distancia máxima (m) para considerar que dos marcadores están en el mismo lugar. */
const SAME_PLACE_METERS = 18;

/** Radio base (m) del círculo de separación visual entre marcadores superpuestos. */
const SPREAD_RADIUS_METERS = 32;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface SpreadLatLng extends LatLng {
  displayLat: number;
  displayLng: number;
}

function distanceMeters(a: LatLng, b: LatLng): number {
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const dLat = (a.lat - b.lat) * 111_320;
  const dLng = (a.lng - b.lng) * 111_320 * cosLat;
  return Math.hypot(dLat, dLng);
}

function metersToLatLngOffset(
  centerLat: number,
  metersEast: number,
  metersNorth: number
): { dLat: number; dLng: number } {
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  return {
    dLat: metersNorth / 111_320,
    dLng: metersEast / (111_320 * cosLat),
  };
}

/** Agrupa marcadores cercanos y reparte los del mismo grupo en un círculo. */
export function spreadOverlappingMarkers<T extends LatLng>(items: T[]): Array<T & SpreadLatLng> {
  if (items.length === 0) return [];

  const groups: T[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;

    const group: T[] = [items[i]];
    assigned.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;
      const closeToGroup = group.some((member) => distanceMeters(member, items[j]) <= SAME_PLACE_METERS);
      if (closeToGroup) {
        group.push(items[j]);
        assigned.add(j);
      }
    }

    groups.push(group);
  }

  const result: Array<T & SpreadLatLng> = [];

  for (const group of groups) {
    if (group.length === 1) {
      const item = group[0];
      result.push({
        ...item,
        displayLat: item.lat,
        displayLng: item.lng,
      });
      continue;
    }

    const centerLat = group.reduce((sum, item) => sum + item.lat, 0) / group.length;
    const centerLng = group.reduce((sum, item) => sum + item.lng, 0) / group.length;
    const count = group.length;
    const radius = SPREAD_RADIUS_METERS * (1 + Math.max(0, count - 3) * 0.12);

    group.forEach((item, index) => {
      const angle = (2 * Math.PI * index) / count - Math.PI / 2;
      const metersEast = radius * Math.sin(angle);
      const metersNorth = radius * Math.cos(angle);
      const { dLat, dLng } = metersToLatLngOffset(centerLat, metersEast, metersNorth);

      result.push({
        ...item,
        displayLat: centerLat + dLat,
        displayLng: centerLng + dLng,
      });
    });
  }

  return result;
}
