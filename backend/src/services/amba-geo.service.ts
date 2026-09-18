import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { BARRIOS, type Barrio } from '../config/barrios.js';
import type { DeliveryZone } from '../config/delivery-zones.js';
import { PRICING_ZONE_IDS } from '../config/amba-cordon-zones.js';

type Position = [number, number] | number[];
type Polygon = { type: 'Polygon'; coordinates: Position[][] };
type MultiPolygon = { type: 'MultiPolygon'; coordinates: Position[][][] };
type Geometry = Polygon | MultiPolygon | { type: string; coordinates?: unknown };
type Feature = {
  type: 'Feature';
  properties: Record<string, unknown> | null;
  geometry: Geometry | null;
};
type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };

type GeoProps = {
  id?: string;
  nombre?: string;
  categoria?: string;
  provincia?: { nombre?: string };
};

const MATANZA_SPLIT_LAT = -34.74;

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

const ZONE_MATCH_ORDER = ['zona_caba', 'zona_cordon_1', 'zona_cordon_2', 'zona_cordon_3'] as const;

let ambaGeo: FeatureCollection | null = null;
let loadPromise: Promise<FeatureCollection> | null = null;
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
    const xi = Number(ring[i][0]);
    const yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]);
    const yj = Number(ring[j][1]);
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;
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
    return multi.coordinates.some((poly) =>
      geometryContainsPoint(lat, lng, { type: 'Polygon', coordinates: poly })
    );
  }
  return false;
}

function featureContainsPoint(lat: number, lng: number, feature: Feature): boolean {
  if (!feature.geometry) return false;
  return geometryContainsPoint(lat, lng, feature.geometry);
}

function featureKey(feature: Feature): string {
  const props = feature.properties as GeoProps | null;
  return props?.id ?? props?.nombre ?? String(feature.geometry?.type ?? 'feature');
}

function intersectEdgeWithLat(a: Position, b: Position, lat: number): Position {
  const dy = Number(b[1]) - Number(a[1]);
  if (Math.abs(dy) < 1e-12) return [Number(a[0]), lat];
  const t = (lat - Number(a[1])) / dy;
  return [Number(a[0]) + t * (Number(b[0]) - Number(a[0])), lat];
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
  const open =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  const result: Position[] = [];
  for (let i = 0; i < open.length; i += 1) {
    const curr = open[i];
    const next = open[(i + 1) % open.length];
    const currIn = Number(curr[1]) >= minLat;
    const nextIn = Number(next[1]) >= minLat;
    if (currIn) result.push(curr);
    if (currIn !== nextIn) result.push(intersectEdgeWithLat(curr, next, minLat));
  }
  return closeRing(result);
}

function clipRingSouth(ring: Position[], maxLat: number): Position[] {
  if (ring.length < 2) return [];
  const open =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  const result: Position[] = [];
  for (let i = 0; i < open.length; i += 1) {
    const curr = open[i];
    const next = open[(i + 1) % open.length];
    const currIn = Number(curr[1]) <= maxLat;
    const nextIn = Number(next[1]) <= maxLat;
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
  const clipRing =
    mode === 'north'
      ? (ring: Position[]) => clipRingNorth(ring, splitLat)
      : (ring: Position[]) => clipRingSouth(ring, splitLat);

  if (geometry.type === 'Polygon') {
    const coords = (geometry as Polygon).coordinates
      .map((ring) => clipRing(ring))
      .filter((ring) => ring.length >= 4);
    if (!coords.length) return null;
    return { type: 'Polygon', coordinates: coords };
  }

  if (geometry.type === 'MultiPolygon') {
    const polys = (geometry as MultiPolygon).coordinates
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

function resolveGeoJsonPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/services → src/data  |  dist/services → dist/data
  return join(here, '..', 'data', 'departamentos-ar.geojson');
}

export async function ensureAmbaGeoLoaded(): Promise<FeatureCollection> {
  if (ambaGeo) return ambaGeo;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const raw = JSON.parse(readFileSync(resolveGeoJsonPath(), 'utf8')) as FeatureCollection;
    const features = raw.features.filter((feature) => {
      const prov = (feature.properties as GeoProps | null)?.provincia?.nombre;
      return prov === 'Buenos Aires' || prov === 'Ciudad Autónoma de Buenos Aires';
    });
    ambaGeo = { type: 'FeatureCollection', features };
    indexAmbaGeo(ambaGeo);
    return ambaGeo;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

export function isAmbaGeoLoaded(): boolean {
  return ambaGeo != null;
}

function canonicalPricingZoneId(zoneId: string): string {
  for (const id of PRICING_ZONE_IDS) {
    if (zoneId === id || zoneId.endsWith(`_${id}`)) return id;
  }
  return zoneId;
}

function resolveBarrioGeoFeature(barrio: Barrio): Feature | null {
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

function collectZoneGeoFeatures(zone: DeliveryZone, barrioCatalog: Barrio[]): Feature[] {
  const catalog = new Map(barrioCatalog.map((b) => [b.id, b]));
  const unique = new Map<string, Feature>();
  const barrioIds = zone.barrios ?? [];
  const canonicalId = canonicalPricingZoneId(zone.id);

  if (canonicalId === 'zona_caba' && comunaFeatures.length > 0) {
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

/**
 * Asigna un punto al cordón con los mismos polígonos IGN que el mapa del frontend.
 * Evita huecos de los bbox aproximados de barrios (que mandaban casi todo a "fuera de zona").
 */
export function findZoneForPointByGeo(
  zones: DeliveryZone[],
  lat: number,
  lng: number,
  barrioCatalog: Barrio[] = BARRIOS
): DeliveryZone | null {
  if (!ambaGeo || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const ordered = [...zones].sort((a, b) => {
    const ai = ZONE_MATCH_ORDER.indexOf(
      canonicalPricingZoneId(a.id) as (typeof ZONE_MATCH_ORDER)[number]
    );
    const bi = ZONE_MATCH_ORDER.indexOf(
      canonicalPricingZoneId(b.id) as (typeof ZONE_MATCH_ORDER)[number]
    );
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const zone of ordered) {
    const features = collectZoneGeoFeatures(zone, barrioCatalog);
    if (features.some((feature) => featureContainsPoint(lat, lng, feature))) {
      return zone;
    }
  }
  return null;
}
