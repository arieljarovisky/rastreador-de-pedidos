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
};

/** La Matanza está partida en norte/sur: se pinta con rectángulos aproximados. */
const BOUNDS_ONLY_BARRIOS = new Set(['la_matanza_norte', 'la_matanza_sur']);

/** Orden de pintado: cordones exteriores primero, CABA al final. */
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

function barrioBoundsFeature(barrio: Barrio): Feature {
  return {
    type: 'Feature',
    properties: { nombre: barrio.name, categoria: 'Bounds' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [barrio.west, barrio.south],
          [barrio.east, barrio.south],
          [barrio.east, barrio.north],
          [barrio.west, barrio.north],
          [barrio.west, barrio.south],
        ],
      ],
    },
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

  if (BOUNDS_ONLY_BARRIOS.has(barrio.id)) {
    return barrioBoundsFeature(barrio);
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
    let feature = resolveBarrioGeoFeature(barrio);
    if (!feature) feature = barrioBoundsFeature(barrio);
    const key = BOUNDS_ONLY_BARRIOS.has(barrioId) ? `bounds:${barrioId}` : featureKey(feature);
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

export function featureLabel(feature: Feature, barrioCatalog: Barrio[], barrioIds: string[]): string {
  const props = feature.properties as GeoProps | null;
  if (props?.categoria === 'Bounds') return props.nombre ?? 'Zona';
  if (props?.categoria === 'Partido') return props.nombre ?? 'Partido';
  if (props?.categoria === 'Comuna') {
    const catalog = new Map(barrioCatalog.map((b) => [b.id, b]));
    const names = barrioIds
      .map((id) => catalog.get(id))
      .filter((barrio): barrio is Barrio => Boolean(barrio))
      .filter((barrio) => {
        const feat = resolveBarrioGeoFeature(barrio);
        return feat && featureKey(feat) === featureKey(feature);
      })
      .map((barrio) => barrio.name);
    if (names.length > 0) return names.join(' · ');
    return props.nombre ?? 'Comuna';
  }
  return props?.nombre ?? 'Zona';
}
