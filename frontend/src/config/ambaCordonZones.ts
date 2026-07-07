import type { Barrio, DeliveryZone } from './deliveryZones.js';

/** Zonas cordón AMBA — ids y barrios (espejo del backend). */
export const CORDON_ZONE_IDS = ['zona_caba', 'zona_cordon_1', 'zona_cordon_2', 'zona_cordon_3'] as const;

export const LEGACY_ZONE_IDS = [
  'zona_norte',
  'zona_centro',
  'zona_sur',
  'zona_oeste',
  'zona_gba_sur',
] as const;

const LEGACY_SET = new Set<string>(LEGACY_ZONE_IDS);
const CORDON_SET = new Set<string>(CORDON_ZONE_IDS);

export const CORDON_ZONE_META: Record<
  (typeof CORDON_ZONE_IDS)[number],
  { name: string; color: string }
> = {
  zona_caba: { name: 'CABA', color: '#F9E04B' },
  zona_cordon_1: { name: '1° Cordón', color: '#6BCB9A' },
  zona_cordon_2: { name: '2° Cordón', color: '#6BA4E8' },
  zona_cordon_3: { name: '3° Cordón', color: '#B5E48C' },
};

/** Colores del mapa (más claros para fondo oscuro). */
export function mapColorForZone(zoneId: string, apiColor?: string): string {
  const meta = CORDON_ZONE_META[zoneId as (typeof CORDON_ZONE_IDS)[number]];
  return meta?.color ?? apiColor ?? '#94a3b8';
}

export function isLegacyZoneId(zoneId: string): boolean {
  return LEGACY_SET.has(zoneId);
}

export function isCordonZoneId(zoneId: string): boolean {
  return CORDON_SET.has(zoneId);
}

/** Barrios por cordón (fallback si la API aún no tiene `barrios` cargados). */
export const CORDON_ZONE_BARRIOS: Record<string, string[]> = {
  zona_cordon_1: [
    'san_fernando',
    'san_isidro',
    'vicente_lopez',
    'san_martin_gba',
    'tres_de_febrero',
    'hurlingham',
    'moron',
    'ituzaingo',
    'la_matanza_norte',
    'lomas_de_zamora',
    'lanus',
    'avellaneda',
  ],
  zona_cordon_2: [
    'tigre',
    'malvinas_argentinas',
    'jose_c_paz',
    'san_miguel',
    'moreno',
    'merlo',
    'la_matanza_sur',
    'ezeiza',
    'esteban_echeverria',
    'almirante_brown',
    'florencio_varela',
    'quilmes',
    'berazategui',
  ],
  zona_cordon_3: [
    'zarate',
    'campana',
    'escobar',
    'pilar',
    'lujan',
    'general_rodriguez',
    'marcos_paz',
    'canuelas',
    'san_vicente',
    'presidente_peron',
    'ensenada',
    'la_plata',
    'berisso',
  ],
};

function boundsFromBarrios(barrioIds: string[], catalog: Barrio[]): {
  south: number;
  west: number;
  north: number;
  east: number;
} {
  const items = barrioIds
    .map((id) => catalog.find((b) => b.id === id))
    .filter((b): b is Barrio => Boolean(b));
  if (items.length === 0) {
    return { south: -35.1, west: -59.2, north: -34.4, east: -58.3 };
  }
  return {
    south: Math.min(...items.map((b) => b.south)),
    west: Math.min(...items.map((b) => b.west)),
    north: Math.max(...items.map((b) => b.north)),
    east: Math.max(...items.map((b) => b.east)),
  };
}

export function barriosForMapZone(
  zoneId: string,
  apiBarrios: string[] | undefined,
  cabaBarrioIds: string[]
): string[] {
  if (apiBarrios?.length) return apiBarrios;
  if (zoneId === 'zona_caba') return cabaBarrioIds;
  return CORDON_ZONE_BARRIOS[zoneId] ?? [];
}

/** Siempre devuelve las 4 zonas cordón para pintar el mapa (aunque falten en la API). */
export function buildCordonMapZones(apiZones: DeliveryZone[], barrioCatalog: Barrio[]): DeliveryZone[] {
  const apiById = new Map(apiZones.map((z) => [z.id, z]));
  const cabaBarrioIds = barrioCatalog.filter((b) => b.area === 'CABA').map((b) => b.id);

  return CORDON_ZONE_IDS.map((zoneId) => {
    const api = apiById.get(zoneId);
    const meta = CORDON_ZONE_META[zoneId];
    const zoneBarrios = barriosForMapZone(zoneId, api?.barrios, cabaBarrioIds);
    const bounds = boundsFromBarrios(zoneBarrios, barrioCatalog);

    return {
      id: zoneId,
      name: api?.name ?? meta.name,
      color: mapColorForZone(zoneId, api?.color),
      south: api?.south ?? bounds.south,
      west: api?.west ?? bounds.west,
      north: api?.north ?? bounds.north,
      east: api?.east ?? bounds.east,
      barrios: zoneBarrios,
      shippingRates: api?.shippingRates,
    };
  });
}

/** @deprecated Usar buildCordonMapZones */
export function zonesForMapPaint<T extends { id: string }>(zones: T[]): T[] {
  return zones.filter((z) => isCordonZoneId(z.id));
}
