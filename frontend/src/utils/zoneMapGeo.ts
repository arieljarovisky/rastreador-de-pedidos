/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon, Position } from 'geojson';
import type { Barrio, DeliveryZone } from '../config/deliveryZones.js';

type GeoProps = {
  id?: string;
  nombre?: string;
  categoria?: string;
  provincia?: { nombre?: string };
};

const MATANZA_SPLIT_LAT = -34.74;

/** Partidos cuyo nombre en IGN difiere del id interno. */
const GBA_PARTIDO_OVERRIDES: Record<string, string> = {
  san_martin_gba: 'General San Martín',
  tortuguitas: 'Malvinas Argentinas',
  jose_c_paz: 'José C. Paz',
  general_rodriguez: 'General Rodríguez',
  presidente_peron: 'Presidente Perón',
  canuelas: 'Cañuelas',
  lujan: 'Luján',
  zarate: 'Zárate',
  esteban_echeverria: 'Esteban Echeverría',
  ituzaingo: 'Ituzaingó',
  moron: 'Morón',
  lanus: 'Lanús',
  quilmes: 'Quilmes',
  la_matanza_norte: 'La Matanza',
  la_matanza_sur: 'La Matanza',
};

export const ZONE_PAINT_ORDER = ['zona_cordon_3', 'zona_cordon_2', 'zona_cordon_1', 'zona_caba'] as const;

let ambaGeo: FeatureCollection | null = null;
let partidoByName = new Map<string, Feature>();
let comunaFeatures: Feature[] = [];

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function barrioCenter(barrio: Barrio): [number, number] {
  return [(barrio.south + barrio.north) / 2, (barrio.west + barrio.east) / 2];
}

function ringContainsPoint(lat: number, lng: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function geometryContainsPoint(lat: number, lng: number, geometry: Geometry): boolean {
  if (geometry.type === 'Polygon') {
    const poly = geometry as Polygon;
    if (!ringContainsPoint(lat, lng, poly.coordinates[0])) return false;
    for (let i = 1; i < poly.coordinates.length; i += 1) {
      if (ringContainsPoint(lat, lng, poly.coordinates[i])) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    const multi = geometry as MultiPolygon;
    return multi.coordinates.some((poly) => geometryContainsPoint(lat, lng, { type: 'Polygon', coordinates: poly }));
  }
  return false;
}

function featureContainsPoint(lat: number, lng: number, feature: Feature): boolean {
  if (!feature.geometry) return false;
  return geometryContainsPoint(lat, lng, feature.geometry);
}

function featureKey(feature: Feature): string {
  const props = feature.properties as GeoProps | null;
  return props?.id ?? props?.nombre ?? JSON.stringify(feature.geometry?.type);
}

function intersectEdgeWithLat(a: Position, b: Position, lat: number): Position {
  const dy = b[1] - a[1];
  if (Math.abs(dy) < 1e-12) return [a[0], lat];
  const t = (lat - a[1]) / dy;
  return [a[0] + t * (b[0] - a[0]), lat];
}

function closeRing(ring: Position[]): Position[] {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

function clipRingNorth(ring: Position[], minLat: number): Position[] {
  if (ring.length < 2) return [];
  const open = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;
  const result: Position[] = [];
  for (let i = 0; i < open.length; i += 1) {
    const curr = open[i];
    const next = open[(i + 1) % open.length];
    const currIn = curr[1] >= minLat;
    const nextIn = next[1] >= minLat;
    if (currIn) result.push(curr);
    if (currIn !== nextIn) result.push(intersectEdgeWithLat(curr, next, minLat));
  }
  return closeRing(result);
}

function clipRingSouth(ring: Position[], maxLat: number): Position[] {
  if (ring.length < 2) return [];
  const open = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;
  const result: Position[] = [];
  for (let i = 0; i < open.length; i += 1) {
    const curr = open[i];
    const next = open[(i + 1) % open.length];
    const currIn = curr[1] <= maxLat;
    const nextIn = next[1] <= maxLat;
    if (currIn) result.push(curr);
    if (currIn !== nextIn) result.push(intersectEdgeWithLat(curr, next, maxLat));
  }
  return closeRing(result);
}

function clipGeometry(
  geometry: Geometry,
  mode: 'north' | 'south',
  splitLat: number
): Geometry | null {
  const clipRing = mode === 'north'
    ? (ring: Position[]) => clipRingNorth(ring, splitLat)
    : (ring: Position[]) => clipRingSouth(ring, splitLat);

  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates
      .map((ring) => clipRing(ring))
      .filter((ring) => ring.length >= 4);
    if (!coords.length) return null;
    return { type: 'Polygon', coordinates: coords };
  }

  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates
      .map((poly) => {
        const coords = poly.map((ring) => clipRing(ring)).filter((ring) => ring.length >= 4);
        return coords.length ? coords : null;
      })
      .filter((poly): poly is Position[][] => Boolean(poly));
    if (!polys.length) return null;
    return { type: 'MultiPolygon', coordinates: polys };
  }

  return null;
}

function clipMatanzaFeature(feature: Feature, mode: 'north' | 'south'): Feature | null {
  if (!feature.geometry) return null;
  const clipped = clipGeometry(feature.geometry, mode, MATANZA_SPLIT_LAT);
  if (!clipped) return null;
  return {
    type: 'Feature',
    properties: {
      ...(feature.properties as GeoProps),
      nombre: mode === 'north' ? 'La Matanza Norte' : 'La Matanza Sur',
      categoria: 'Partido',
    },
    geometry: clipped,
  };
}

function indexAmbaGeo(collection: FeatureCollection): void {
  partidoByName = new Map();
  comunaFeatures = [];

  for (const feature of collection.features) {
    const props = feature.properties as GeoProps | null;
    if (!props?.nombre) continue;
    if (props.categoria === 'Partido') {
      partidoByName.set(normalizeName(props.nombre), feature);
    } else if (props.categoria === 'Comuna') {
      comunaFeatures.push(feature);
    }
  }
}

export async function loadAmbaGeoJson(): Promise<FeatureCollection> {
  if (ambaGeo) return ambaGeo;

  const res = await fetch('/geo/departamentos-ar.geojson');
  if (!res.ok) throw new Error('No se pudo cargar el mapa de zonas.');

  const raw = (await res.json()) as FeatureCollection;
  const features = raw.features.filter((feature) => {
    const prov = (feature.properties as GeoProps | null)?.provincia?.nombre;
    return prov === 'Buenos Aires' || prov === 'Ciudad Autónoma de Buenos Aires';
  });

  ambaGeo = { type: 'FeatureCollection', features };
  indexAmbaGeo(ambaGeo);
  return ambaGeo;
}

export function resolveBarrioGeoFeature(barrio: Barrio): Feature | null {
  if (!ambaGeo) return null;

  if (barrio.id === 'la_matanza_norte' || barrio.id === 'la_matanza_sur') {
    const full = partidoByName.get(normalizeName('La Matanza'));
    if (!full) return null;
    return clipMatanzaFeature(full, barrio.id === 'la_matanza_norte' ? 'north' : 'south');
  }

  if (barrio.area === 'GBA') {
    const partidoName = GBA_PARTIDO_OVERRIDES[barrio.id] ?? barrio.name;
    return partidoByName.get(normalizeName(partidoName)) ?? null;
  }

  const [lat, lng] = barrioCenter(barrio);
  for (const feature of comunaFeatures) {
    if (featureContainsPoint(lat, lng, feature)) return feature;
  }
  return null;
}

export function collectZoneGeoFeatures(
  zone: DeliveryZone,
  barrioCatalog: Barrio[]
): Feature[] {
  const catalog = new Map(barrioCatalog.map((b) => [b.id, b]));
  const unique = new Map<string, Feature>();

  const barrioIds = zone.barrios ?? [];

  if (zone.id === 'zona_caba' && comunaFeatures.length > 0) {
    for (const feature of comunaFeatures) {
      unique.set(featureKey(feature), feature);
    }
    return Array.from(unique.values());
  }

  const allCaba =
    barrioIds.length > 0 && barrioIds.every((id) => catalog.get(id)?.area === 'CABA');
  if (allCaba) {
    for (const feature of comunaFeatures) {
      unique.set(featureKey(feature), feature);
    }
    return Array.from(unique.values());
  }

  for (const barrioId of barrioIds) {
    const barrio = catalog.get(barrioId);
    if (!barrio) continue;
    const feature = resolveBarrioGeoFeature(barrio);
    if (!feature) continue;
    const key =
      barrioId === 'la_matanza_norte' || barrioId === 'la_matanza_sur'
        ? `matanza:${barrioId}`
        : featureKey(feature);
    unique.set(key, feature);
  }

  return Array.from(unique.values());
}

export function sortZonesForMapPaint(zones: DeliveryZone[]): DeliveryZone[] {
  return [...zones].sort((a, b) => {
    const ai = ZONE_PAINT_ORDER.indexOf(a.id as (typeof ZONE_PAINT_ORDER)[number]);
    const bi = ZONE_PAINT_ORDER.indexOf(b.id as (typeof ZONE_PAINT_ORDER)[number]);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name, 'es');
    if (ai === -1) return -1;
    if (bi === -1) return 1;
    return ai - bi;
  });
}
