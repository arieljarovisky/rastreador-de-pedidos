import { BARRIOS } from './barrios.js';
import { resolveBarriosToBounds } from './barrios.js';
import type { DeliveryZone } from './delivery-zones.js';

/** Colores alineados al mapa de referencia AMBA (CABA + cordones). */
export const CORDON_ZONE_COLORS = {
  caba: '#F9E04B',
  cordon1: '#6BCB9A',
  cordon2: '#6BA4E8',
  cordon3: '#B5E48C',
} as const;

const CABA_BARRIO_IDS = BARRIOS.filter((b) => b.area === 'CABA').map((b) => b.id);

/** Barrios / partidos por cordón según mapa operativo AMBA. */
export const CORDON_ZONE_BARRIOS: Record<string, string[]> = {
  zona_caba: CABA_BARRIO_IDS,
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

const LEGACY_ZONE_IDS = ['zona_norte', 'zona_centro', 'zona_sur', 'zona_oeste', 'zona_gba_sur'];

function buildZone(id: string, name: string, color: string, barrios: string[]): DeliveryZone {
  const bounds = resolveBarriosToBounds(barrios);
  return {
    id,
    name,
    color,
    south: bounds.south,
    west: bounds.west,
    north: bounds.north,
    east: bounds.east,
    barrios,
  };
}

export const AMBA_CORDON_ZONES: DeliveryZone[] = [
  buildZone('zona_caba', 'CABA', CORDON_ZONE_COLORS.caba, CORDON_ZONE_BARRIOS.zona_caba),
  buildZone('zona_cordon_1', '1° Cordón', CORDON_ZONE_COLORS.cordon1, CORDON_ZONE_BARRIOS.zona_cordon_1),
  buildZone('zona_cordon_2', '2° Cordón', CORDON_ZONE_COLORS.cordon2, CORDON_ZONE_BARRIOS.zona_cordon_2),
  buildZone('zona_cordon_3', '3° Cordón', CORDON_ZONE_COLORS.cordon3, CORDON_ZONE_BARRIOS.zona_cordon_3),
];

export const PRICING_ZONE_IDS = AMBA_CORDON_ZONES.map((z) => z.id);

export function isPricingZoneId(zoneId: string): boolean {
  if (PRICING_ZONE_IDS.includes(zoneId)) return true;
  return PRICING_ZONE_IDS.some((id) => zoneId.endsWith(`_${id}`));
}

export function isAssignmentZoneId(zoneId: string): boolean {
  return !isPricingZoneId(zoneId);
}

export { LEGACY_ZONE_IDS };
