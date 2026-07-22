import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { DEFAULT_DELIVERY_ZONES, DeliveryZone, LEGACY_ZONE_IDS } from '../config/delivery-zones.js';
import { isPricingZoneId, isLegacyZoneId } from '../config/amba-cordon-zones.js';
import { pointInZoneBarrios, resolveBarriosToBounds } from '../config/barrios.js';

interface DeliveryZoneRow extends RowDataPacket {
  id: string;
  agency_id: string;
  name: string;
  color: string;
  south: number;
  west: number;
  north: number;
  east: number;
  barrios: string | string[] | null;
  shipping_rate_flex: string | number | null;
  shipping_rate_express: string | number | null;
  shipping_rate_standard: string | number | null;
  driver_pay_flex: string | number | null;
  driver_pay_express: string | number | null;
  driver_pay_standard: string | number | null;
}

const DEFAULT_ZONE_RATES = { flex: 2800, express: 3200, standard: 2500 };
const DEFAULT_DRIVER_PAY = { flex: 1500, express: 1800, standard: 1200 };

function toRate(value: string | number | null | undefined, fallback: number): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
}

function parseBarrios(raw: string | string[] | null): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw.length > 0 ? raw : undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as string[]) : undefined;
  } catch {
    return undefined;
  }
}

function rowToZone(row: DeliveryZoneRow): DeliveryZone {
  const zone: DeliveryZone = {
    id: row.id,
    name: row.name,
    color: row.color,
    south: Number(row.south),
    west: Number(row.west),
    north: Number(row.north),
    east: Number(row.east),
    shippingRates: {
      flex: toRate(row.shipping_rate_flex, DEFAULT_ZONE_RATES.flex),
      express: toRate(row.shipping_rate_express, DEFAULT_ZONE_RATES.express),
      standard: toRate(row.shipping_rate_standard, DEFAULT_ZONE_RATES.standard),
    },
    driverPayRates: {
      flex: toRate(row.driver_pay_flex, DEFAULT_DRIVER_PAY.flex),
      express: toRate(row.driver_pay_express, DEFAULT_DRIVER_PAY.express),
      standard: toRate(row.driver_pay_standard, DEFAULT_DRIVER_PAY.standard),
    },
  };
  const barrios = parseBarrios(row.barrios);
  if (barrios) zone.barrios = barrios;
  return zone;
}

const ZONE_SELECT = `id, agency_id, name, color, south, west, north, east, barrios,
  shipping_rate_flex, shipping_rate_express, shipping_rate_standard,
  driver_pay_flex, driver_pay_express, driver_pay_standard`;

export async function listZonesForAgency(agencyId: string): Promise<DeliveryZone[]> {
  const [rows] = await pool.query<DeliveryZoneRow[]>(
    `SELECT ${ZONE_SELECT}
     FROM delivery_zones WHERE agency_id = ? ORDER BY name`,
    [agencyId]
  );
  return rows.map(rowToZone);
}

export async function listPricingZonesForAgency(agencyId: string): Promise<DeliveryZone[]> {
  const zones = await listZonesForAgency(agencyId);
  return zones.filter((z) => isPricingZoneId(z.id) && !isLegacyZoneId(z.id));
}

export async function listAssignmentZonesForAgency(agencyId: string): Promise<DeliveryZone[]> {
  const zones = await listZonesForAgency(agencyId);
  return zones.filter((z) => !isPricingZoneId(z.id));
}

function matchZoneForPoint(zones: DeliveryZone[], lat: number, lng: number): DeliveryZone | null {
  for (const zone of zones) {
    if (zone.barrios?.length) {
      if (pointInZoneBarrios(lat, lng, zone.barrios)) return zone;
      continue;
    }
    if (lat >= zone.south && lat <= zone.north && lng >= zone.west && lng <= zone.east) {
      return zone;
    }
  }
  return null;
}

export async function findPricingZoneForPoint(
  agencyId: string,
  lat: number,
  lng: number
): Promise<DeliveryZone | null> {
  const zones = await listPricingZonesForAgency(agencyId);
  return matchZoneForPoint(zones, lat, lng);
}

export async function findAssignmentZoneForPoint(
  agencyId: string,
  lat: number,
  lng: number
): Promise<DeliveryZone | null> {
  const zones = await listAssignmentZonesForAgency(agencyId);
  return matchZoneForPoint(zones, lat, lng);
}

export async function getZoneById(agencyId: string, zoneId: string): Promise<DeliveryZone | null> {
  const [rows] = await pool.query<DeliveryZoneRow[]>(
    `SELECT ${ZONE_SELECT}
     FROM delivery_zones WHERE agency_id = ? AND id = ?`,
    [agencyId, zoneId]
  );
  const row = rows[0];
  return row ? rowToZone(row) : null;
}

export async function isValidZoneForAgency(agencyId: string, zoneId: string): Promise<boolean> {
  const zone = await getZoneById(agencyId, zoneId);
  return zone !== null;
}

export async function isValidAssignmentZoneForAgency(
  agencyId: string,
  zoneId: string
): Promise<boolean> {
  if (isPricingZoneId(zoneId)) return false;
  return isValidZoneForAgency(agencyId, zoneId);
}

export async function findZoneForPoint(
  agencyId: string,
  lat: number,
  lng: number
): Promise<DeliveryZone | null> {
  return findPricingZoneForPoint(agencyId, lat, lng);
}

const ZONE_COLORS = ['#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#ec4899', '#10b981', '#06b6d4', '#84cc16'];

function validateBounds(data: {
  south: number;
  west: number;
  north: number;
  east: number;
}): void {
  if (data.south >= data.north) throw new Error('INVALID_BOUNDS');
  if (data.west >= data.east) throw new Error('INVALID_BOUNDS');
}

function validateColor(color: string): void {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('INVALID_COLOR');
}

async function isGlobalZoneIdTaken(zoneId: string): Promise<boolean> {
  const [rows] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    'SELECT id FROM delivery_zones WHERE id = ? LIMIT 1',
    [zoneId]
  );
  return rows.length > 0;
}

/** ID único global: canonical si está libre; si no, prefijo por agencia (PK es solo `id`). */
async function resolveSeedZoneId(agencyId: string, canonicalId: string): Promise<string | null> {
  if (await getZoneById(agencyId, canonicalId)) return null;

  if (!(await isGlobalZoneIdTaken(canonicalId))) return canonicalId;

  const scopedId = `${agencyId}_${canonicalId}`.slice(0, 64);
  if (await getZoneById(agencyId, scopedId)) return null;
  if (await isGlobalZoneIdTaken(scopedId)) return null;

  return scopedId;
}

export async function seedDefaultZonesForAgency(agencyId: string): Promise<void> {
  const now = new Date();
  for (const zone of DEFAULT_DELIVERY_ZONES) {
    const zoneId = await resolveSeedZoneId(agencyId, zone.id);
    if (!zoneId) continue;

    await pool.query(
      `INSERT INTO delivery_zones (id, agency_id, name, color, south, west, north, east, barrios, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        zoneId,
        agencyId,
        zone.name,
        zone.color,
        zone.south,
        zone.west,
        zone.north,
        zone.east,
        zone.barrios?.length ? JSON.stringify(zone.barrios) : null,
        now,
      ]
    );
  }
}

/** Asegura zonas cordón AMBA (CABA + 3 anillos) y retira presets viejos sin uso. */
export async function ensureCordonZonesForAgency(agencyId: string): Promise<void> {
  const now = new Date();

  for (const zone of DEFAULT_DELIVERY_ZONES) {
    const existing = await getZoneById(agencyId, zone.id);
    if (existing) {
      await pool.query(
        `UPDATE delivery_zones
         SET name = ?, color = ?, south = ?, west = ?, north = ?, east = ?, barrios = ?
         WHERE id = ? AND agency_id = ?`,
        [
          zone.name,
          zone.color,
          zone.south,
          zone.west,
          zone.north,
          zone.east,
          zone.barrios?.length ? JSON.stringify(zone.barrios) : null,
          zone.id,
          agencyId,
        ]
      );
      continue;
    }

    const zoneId = await resolveSeedZoneId(agencyId, zone.id);
    if (!zoneId) continue;

    await pool.query(
      `INSERT INTO delivery_zones (id, agency_id, name, color, south, west, north, east, barrios, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        zoneId,
        agencyId,
        zone.name,
        zone.color,
        zone.south,
        zone.west,
        zone.north,
        zone.east,
        zone.barrios?.length ? JSON.stringify(zone.barrios) : null,
        now,
      ]
    );
  }

  for (const legacyId of LEGACY_ZONE_IDS) {
    const legacy = await getZoneById(agencyId, legacyId);
    if (!legacy) continue;

    await pool.query(
      `UPDATE users SET delivery_zone = NULL WHERE agency_id = ? AND delivery_zone = ?`,
      [agencyId, legacyId]
    );
    await pool.query('DELETE FROM delivery_zones WHERE id = ? AND agency_id = ?', [legacyId, agencyId]);
  }

  // Zonas custom sin barrios (rectángulos viejos del preset anterior)
  const [legacyBounds] = await pool.query<DeliveryZoneRow[]>(
    `SELECT ${ZONE_SELECT} FROM delivery_zones
     WHERE agency_id = ? AND (barrios IS NULL OR barrios = '[]' OR barrios = 'null')
       AND id NOT IN (?, ?, ?, ?)`,
    [agencyId, 'zona_caba', 'zona_cordon_1', 'zona_cordon_2', 'zona_cordon_3']
  );
  for (const row of legacyBounds) {
    const [usage] = await pool.query<Array<{ cnt: number } & RowDataPacket>>(
      `SELECT COUNT(*) AS cnt FROM users WHERE agency_id = ? AND delivery_zone = ?`,
      [agencyId, row.id]
    );
    if (Number(usage[0]?.cnt ?? 0) > 0) continue;
    await pool.query('DELETE FROM delivery_zones WHERE id = ? AND agency_id = ?', [row.id, agencyId]);
  }
}

export async function createZone(
  agencyId: string,
  data: {
    name?: string;
    color?: string;
    south?: number;
    west?: number;
    north?: number;
    east?: number;
    barrios?: string[];
  }
): Promise<DeliveryZone> {
  let south = data.south;
  let west = data.west;
  let north = data.north;
  let east = data.east;
  let barrios = data.barrios?.filter(Boolean);

  if (barrios && barrios.length > 0) {
    const resolved = resolveBarriosToBounds(barrios);
    south = resolved.south;
    west = resolved.west;
    north = resolved.north;
    east = resolved.east;
  } else if (south === undefined || west === undefined || north === undefined || east === undefined) {
    throw new Error('BARRIOS_OR_BOUNDS_REQUIRED');
  } else {
    barrios = undefined;
  }

  const name = (data.name?.trim() || (barrios ? resolveBarriosToBounds(barrios).names.join(', ') : '')).trim();
  if (!name) throw new Error('NAME_REQUIRED');

  validateBounds({ south: south!, west: west!, north: north!, east: east! });

  const existing = await listZonesForAgency(agencyId);
  const color = data.color ?? ZONE_COLORS[existing.length % ZONE_COLORS.length];
  validateColor(color);

  const id = `dz${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();

  await pool.query(
    `INSERT INTO delivery_zones (id, agency_id, name, color, south, west, north, east, barrios, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      agencyId,
      name,
      color,
      south,
      west,
      north,
      east,
      barrios ? JSON.stringify(barrios) : null,
      now,
    ]
  );

  const zone = await getZoneById(agencyId, id);
  if (!zone) throw new Error('CREATE_FAILED');
  return zone;
}

export async function updateZone(
  agencyId: string,
  zoneId: string,
  data: {
    name?: string;
    color?: string;
    south?: number;
    west?: number;
    north?: number;
    east?: number;
    barrios?: string[];
  }
): Promise<DeliveryZone> {
  const existing = await getZoneById(agencyId, zoneId);
  if (!existing) throw new Error('NOT_FOUND');
  if (isPricingZoneId(zoneId)) throw new Error('PRICING_ZONE_PROTECTED');

  let barrios = data.barrios !== undefined ? data.barrios.filter(Boolean) : existing.barrios;
  let south = data.south ?? existing.south;
  let west = data.west ?? existing.west;
  let north = data.north ?? existing.north;
  let east = data.east ?? existing.east;

  if (data.barrios !== undefined && barrios && barrios.length > 0) {
    const resolved = resolveBarriosToBounds(barrios);
    south = resolved.south;
    west = resolved.west;
    north = resolved.north;
    east = resolved.east;
  } else if (data.barrios !== undefined && (!barrios || barrios.length === 0)) {
    barrios = undefined;
  }

  const autoName = barrios?.length ? resolveBarriosToBounds(barrios).names.join(', ') : '';
  const updated = {
    name: (data.name?.trim() || autoName || existing.name).trim(),
    color: data.color ?? existing.color,
    south,
    west,
    north,
    east,
    barrios,
  };

  if (!updated.name) throw new Error('NAME_REQUIRED');
  validateBounds(updated);
  validateColor(updated.color);

  await pool.query(
    `UPDATE delivery_zones SET name = ?, color = ?, south = ?, west = ?, north = ?, east = ?, barrios = ? WHERE id = ? AND agency_id = ?`,
    [
      updated.name,
      updated.color,
      updated.south,
      updated.west,
      updated.north,
      updated.east,
      updated.barrios ? JSON.stringify(updated.barrios) : null,
      zoneId,
      agencyId,
    ]
  );

  const zone = await getZoneById(agencyId, zoneId);
  if (!zone) throw new Error('NOT_FOUND');
  return zone;
}

export async function deleteZone(agencyId: string, zoneId: string): Promise<void> {
  const existing = await getZoneById(agencyId, zoneId);
  if (!existing) throw new Error('NOT_FOUND');

  if (isLegacyZoneId(zoneId)) {
    await pool.query(
      `UPDATE users SET delivery_zone = NULL WHERE agency_id = ? AND delivery_zone = ?`,
      [agencyId, zoneId]
    );
    await pool.query('DELETE FROM delivery_zones WHERE id = ? AND agency_id = ?', [zoneId, agencyId]);
    return;
  }

  if (isPricingZoneId(zoneId)) {
    await pool.query('DELETE FROM delivery_zones WHERE id = ? AND agency_id = ?', [zoneId, agencyId]);
    return;
  }

  const [usage] = await pool.query<Array<{ cnt: number } & RowDataPacket>>(
    `SELECT COUNT(*) AS cnt FROM users WHERE agency_id = ? AND delivery_zone = ?`,
    [agencyId, zoneId]
  );
  if (Number(usage[0]?.cnt ?? 0) > 0) {
    throw new Error('ZONE_IN_USE');
  }

  await pool.query('DELETE FROM delivery_zones WHERE id = ? AND agency_id = ?', [zoneId, agencyId]);
}

export async function updateZoneShippingRates(
  agencyId: string,
  zoneId: string,
  rates: {
    flex?: number;
    express?: number;
    standard?: number;
    driverFlex?: number;
    driverExpress?: number;
    driverStandard?: number;
  }
): Promise<DeliveryZone> {
  const existing = await getZoneById(agencyId, zoneId);
  if (!existing) throw new Error('NOT_FOUND');
  if (!isPricingZoneId(zoneId)) throw new Error('ASSIGNMENT_ZONE_NO_RATES');

  const currentRates = existing.shippingRates ?? DEFAULT_ZONE_RATES;
  const currentDriver = existing.driverPayRates ?? DEFAULT_DRIVER_PAY;
  const next = {
    flex: rates.flex ?? currentRates.flex,
    express: rates.express ?? currentRates.express,
    standard: rates.standard ?? currentRates.standard,
  };
  const nextDriver = {
    flex: rates.driverFlex ?? currentDriver.flex,
    express: rates.driverExpress ?? currentDriver.express,
    standard: rates.driverStandard ?? currentDriver.standard,
  };

  if (
    next.flex < 0 ||
    next.express < 0 ||
    next.standard < 0 ||
    nextDriver.flex < 0 ||
    nextDriver.express < 0 ||
    nextDriver.standard < 0
  ) {
    throw new Error('INVALID_RATES');
  }

  await pool.query(
    `UPDATE delivery_zones
     SET shipping_rate_flex = ?, shipping_rate_express = ?, shipping_rate_standard = ?,
         driver_pay_flex = ?, driver_pay_express = ?, driver_pay_standard = ?
     WHERE id = ? AND agency_id = ?`,
    [
      next.flex,
      next.express,
      next.standard,
      nextDriver.flex,
      nextDriver.express,
      nextDriver.standard,
      zoneId,
      agencyId,
    ]
  );

  const zone = await getZoneById(agencyId, zoneId);
  if (!zone) throw new Error('NOT_FOUND');
  return zone;
}
