import { BARRIOS } from './barrios.js';

export type MlFlexCordon = 'caba' | 'cordon_1' | 'cordon_2' | 'cordon_3';

export interface MlFlexZone {
  /** ID oficial de Mercado Libre Flex (MLA). */
  id: string;
  label: string;
  cordon: MlFlexCordon;
  barrioIds: string[];
}

export const ML_FLEX_CORDON_LABELS: Record<MlFlexCordon, string> = {
  caba: 'CABA',
  cordon_1: '1.er cordón GBA',
  cordon_2: '2.º cordón GBA',
  cordon_3: '3.er cordón GBA',
};

const CABA_BARRIO_IDS = BARRIOS.filter((b) => b.area === 'CABA').map((b) => b.id);

/** Zonas Flex MLA agrupadas por cordón (misma lógica que Mercado Libre / AMBA). */
export const ML_FLEX_ZONES: MlFlexZone[] = [
  { id: 'CABA', label: 'CABA', cordon: 'caba', barrioIds: CABA_BARRIO_IDS },
  // 1.er cordón — adherido a Capital
  { id: 'Vicente_Lopez', label: 'Vicente López', cordon: 'cordon_1', barrioIds: ['vicente_lopez'] },
  { id: 'San_Isidro', label: 'San Isidro', cordon: 'cordon_1', barrioIds: ['san_isidro'] },
  { id: 'San_Fernando', label: 'San Fernando', cordon: 'cordon_1', barrioIds: ['san_fernando'] },
  { id: 'Avellaneda', label: 'Avellaneda', cordon: 'cordon_1', barrioIds: ['avellaneda'] },
  { id: 'Lanus', label: 'Lanús', cordon: 'cordon_1', barrioIds: ['lanus'] },
  { id: 'Moron', label: 'Morón', cordon: 'cordon_1', barrioIds: ['moron'] },
  { id: 'Hurlingham', label: 'Hurlingham', cordon: 'cordon_1', barrioIds: ['hurlingham'] },
  { id: 'Ituzaingo', label: 'Ituzaingó', cordon: 'cordon_1', barrioIds: ['ituzaingo'] },
  { id: 'San_Martin', label: 'San Martín', cordon: 'cordon_1', barrioIds: ['san_martin_gba'] },
  { id: 'Tres_De_Febrero', label: 'Tres de Febrero', cordon: 'cordon_1', barrioIds: ['tres_de_febrero'] },
  { id: 'La_Matanza_1', label: 'La Matanza Norte', cordon: 'cordon_1', barrioIds: ['la_matanza'] },
  // 2.º cordón
  { id: 'Quilmes', label: 'Quilmes', cordon: 'cordon_2', barrioIds: ['quilmes'] },
  { id: 'Berazategui', label: 'Berazategui', cordon: 'cordon_2', barrioIds: ['berazategui'] },
  { id: 'Lomas_de_Zamora', label: 'Lomas de Zamora', cordon: 'cordon_2', barrioIds: ['lomas_de_zamora'] },
  { id: 'Ezeiza', label: 'Ezeiza', cordon: 'cordon_2', barrioIds: ['ezeiza'] },
  { id: 'Esteban_Echeverria', label: 'Esteban Echeverría', cordon: 'cordon_2', barrioIds: ['esteban_echeverria'] },
  { id: 'Tigre', label: 'Tigre', cordon: 'cordon_2', barrioIds: ['tigre'] },
  { id: 'San_Miguel', label: 'San Miguel', cordon: 'cordon_2', barrioIds: ['malvinas_argentinas', 'tortuguitas'] },
  { id: 'Malvinas_Argentinas', label: 'Malvinas Argentinas', cordon: 'cordon_2', barrioIds: ['malvinas_argentinas', 'tortuguitas'] },
  { id: 'La_Matanza_2', label: 'La Matanza Sur', cordon: 'cordon_2', barrioIds: ['la_matanza'] },
  // 3.er cordón
  { id: 'Florencio_Varela', label: 'Florencio Varela', cordon: 'cordon_3', barrioIds: ['florencio_varela'] },
  { id: 'Merlo', label: 'Merlo', cordon: 'cordon_3', barrioIds: ['merlo'] },
  { id: 'Moreno', label: 'Moreno', cordon: 'cordon_3', barrioIds: ['moreno'] },
  { id: 'Jose_C_Paz', label: 'José C. Paz', cordon: 'cordon_3', barrioIds: ['pilar', 'malvinas_argentinas', 'tortuguitas'] },
  { id: 'Almirante_Brown', label: 'Almirante Brown', cordon: 'cordon_3', barrioIds: ['lomas_de_zamora', 'ezeiza', 'esteban_echeverria'] },
];

const mlZoneById = new Map(ML_FLEX_ZONES.map((z) => [z.id, z]));

export function listMlFlexZones(): MlFlexZone[] {
  return ML_FLEX_ZONES;
}

export function getMlFlexZoneById(id: string): MlFlexZone | undefined {
  return mlZoneById.get(id);
}

export function mlZoneIdsToBarrioIds(mlZoneIds: string[]): string[] {
  const ids = new Set<string>();
  for (const zoneId of mlZoneIds) {
    const zone = getMlFlexZoneById(zoneId);
    if (!zone) continue;
    for (const barrioId of zone.barrioIds) ids.add(barrioId);
  }
  return [...ids];
}

export function mlZonesForCordon(cordon: MlFlexCordon): MlFlexZone[] {
  return ML_FLEX_ZONES.filter((z) => z.cordon === cordon);
}

export function defaultMlZoneIdsForCordon(cordon: MlFlexCordon): string[] {
  return mlZonesForCordon(cordon).map((z) => z.id);
}

export const ML_FLEX_CORDON_ORDER: MlFlexCordon[] = ['caba', 'cordon_1', 'cordon_2', 'cordon_3'];
