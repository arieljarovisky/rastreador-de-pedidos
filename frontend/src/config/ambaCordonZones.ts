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

export function barriosForMapZone(
  zoneId: string,
  apiBarrios?: string[],
  cabaBarrioIds?: string[]
): string[] {
  if (apiBarrios?.length) return apiBarrios;
  if (zoneId === 'zona_caba') return cabaBarrioIds ?? [];
  return CORDON_ZONE_BARRIOS[zoneId] ?? [];
}

export function zonesForMapPaint<T extends { id: string; barrios?: string[] }>(zones: T[]): T[] {
  return zones.filter((z) => !isLegacyZoneId(z.id));
}
