import type { AgencyCoverageArea } from '../types/index.js';

export function parsePlacesInput(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeCoverageAreas(raw: unknown): AgencyCoverageArea[] {
  if (!Array.isArray(raw)) return [];
  const result: AgencyCoverageArea[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const placesRaw = row.places;
    const places = Array.isArray(placesRaw)
      ? placesRaw.map((p) => String(p).trim()).filter(Boolean)
      : typeof placesRaw === 'string'
        ? parsePlacesInput(placesRaw)
        : [];
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
    if (area.places.length === 0) throw new Error('COVERAGE_PLACES_REQUIRED');
    if (!Number.isFinite(area.tariff) || area.tariff < 0) throw new Error('COVERAGE_TARIFF_INVALID');
    if (area.minimumOrders != null && (!Number.isFinite(area.minimumOrders) || area.minimumOrders < 1)) {
      throw new Error('COVERAGE_MIN_ORDERS_INVALID');
    }
  }
}
