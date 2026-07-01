import { getBarrioById, resolveBarriosToBounds } from '../config/barrios.js';
import { getMlFlexZoneById, mlZoneIdsToBarrioIds } from '../config/ml-flex-zones.js';
import type { AgencyCoverageArea } from '../types/index.js';

export function parsePlacesInput(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveBarrioIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((id) => String(id).trim())
    .filter((id) => Boolean(getBarrioById(id)));
}

function resolveMlZoneIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((id) => String(id).trim())
    .filter((id) => Boolean(getMlFlexZoneById(id)));
}

function barrioNamesFromIds(ids: string[]): string[] {
  return ids.map((id) => getBarrioById(id)?.name ?? id);
}

export function normalizeCoverageAreas(raw: unknown): AgencyCoverageArea[] {
  if (!Array.isArray(raw)) return [];
  const result: AgencyCoverageArea[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const mlZoneIds = resolveMlZoneIds(row.mlZoneIds);
    const barriosFromMl = mlZoneIds.length > 0 ? mlZoneIdsToBarrioIds(mlZoneIds) : [];
    const barrios = barriosFromMl.length > 0 ? barriosFromMl : resolveBarrioIds(row.barrios);
    const placesRaw = row.places;
    const legacyPlaces = Array.isArray(placesRaw)
      ? placesRaw.map((p) => String(p).trim()).filter(Boolean)
      : typeof placesRaw === 'string'
        ? parsePlacesInput(placesRaw)
        : [];
    const places = barrios.length > 0 ? barrioNamesFromIds(barrios) : legacyPlaces;

    const nameInput = typeof row.name === 'string' ? row.name.trim() : '';
    const name =
      nameInput ||
      (barrios.length > 0
        ? resolveBarriosToBounds(barrios).names.join(', ')
        : places.slice(0, 3).join(', '));

    const tariff = Number(row.tariff);
    const minimumOrdersRaw = row.minimumOrders;
    const minimumOrders =
      minimumOrdersRaw === null || minimumOrdersRaw === undefined || minimumOrdersRaw === ''
        ? null
        : Number(minimumOrdersRaw);
    const id =
      typeof row.id === 'string' && row.id.trim()
        ? row.id.trim()
        : `cov_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    if (!name || places.length === 0 || !Number.isFinite(tariff) || tariff < 0) continue;
    result.push({
      id,
      name,
      mlZoneIds,
      barrios,
      places,
      tariff: Math.round(tariff * 100) / 100,
      minimumOrders:
        minimumOrders != null && Number.isFinite(minimumOrders) && minimumOrders >= 1
          ? Math.floor(minimumOrders)
          : null,
    });
  }
  return result;
}

export function validateCoverageAreas(areas: AgencyCoverageArea[]): void {
  if (areas.length === 0) {
    throw new Error('COVERAGE_REQUIRED');
  }
  for (const area of areas) {
    if (!area.name.trim()) throw new Error('COVERAGE_NAME_REQUIRED');
    if (area.barrios.length === 0) throw new Error('COVERAGE_BARRIOS_REQUIRED');
    if (area.places.length === 0) throw new Error('COVERAGE_BARRIOS_REQUIRED');
    if (!Number.isFinite(area.tariff) || area.tariff < 0) throw new Error('COVERAGE_TARIFF_INVALID');
    if (area.minimumOrders != null && (!Number.isFinite(area.minimumOrders) || area.minimumOrders < 1)) {
      throw new Error('COVERAGE_MIN_ORDERS_INVALID');
    }
  }
}
