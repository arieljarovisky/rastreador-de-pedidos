/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Barrio } from './deliveryZones.js';

export type MlFlexCordon = 'caba' | 'cordon_1' | 'cordon_2' | 'cordon_3';

export interface MlFlexZone {
  id: string;
  label: string;
  cordon: MlFlexCordon;
  barrioIds: string[];
}

export interface GeoCatalog {
  barrios: Barrio[];
  mlZones: MlFlexZone[];
  cordonLabels: Record<MlFlexCordon, string>;
  cordonOrder: MlFlexCordon[];
}

export function isGeoCatalog(data: unknown): data is GeoCatalog {
  return Boolean(data && typeof data === 'object' && Array.isArray((data as GeoCatalog).barrios));
}

export function mlZoneIdsToBarrioIds(mlZoneIds: string[], mlZones: MlFlexZone[]): string[] {
  const byId = new Map(mlZones.map((z) => [z.id, z]));
  const ids = new Set<string>();
  for (const zoneId of mlZoneIds) {
    const zone = byId.get(zoneId);
    if (!zone) continue;
    for (const barrioId of zone.barrioIds) ids.add(barrioId);
  }
  return [...ids];
}

export function mlZoneLabels(mlZoneIds: string[], mlZones: MlFlexZone[]): string {
  const byId = new Map(mlZones.map((z) => [z.id, z]));
  return mlZoneIds.map((id) => byId.get(id)?.label ?? id).join(', ');
}

export function mlZonesForCordon(cordon: MlFlexCordon, mlZones: MlFlexZone[]): MlFlexZone[] {
  return mlZones.filter((z) => z.cordon === cordon);
}

export function defaultMlZoneIdsForCordon(cordon: MlFlexCordon, mlZones: MlFlexZone[]): string[] {
  return mlZonesForCordon(cordon, mlZones).map((z) => z.id);
}

export const ML_FLEX_CORDON_COLORS: Record<MlFlexCordon, string> = {
  caba: '#3b82f6',
  cordon_1: '#10b981',
  cordon_2: '#f59e0b',
  cordon_3: '#ef4444',
};
