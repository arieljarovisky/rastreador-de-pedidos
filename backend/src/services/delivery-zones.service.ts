import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { DEFAULT_DELIVERY_ZONES, DeliveryZone } from '../config/delivery-zones.js';

interface DeliveryZoneRow extends RowDataPacket {
  id: string;
  agency_id: string;
  name: string;
  color: string;
  south: number;
  west: number;
  north: number;
  east: number;
}

function rowToZone(row: DeliveryZoneRow): DeliveryZone {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    south: Number(row.south),
    west: Number(row.west),
    north: Number(row.north),
    east: Number(row.east),
  };
}

export async function listZonesForAgency(agencyId: string): Promise<DeliveryZone[]> {
  const [rows] = await pool.query<DeliveryZoneRow[]>(
    `SELECT id, agency_id, name, color, south, west, north, east
     FROM delivery_zones WHERE agency_id = ? ORDER BY name`,
    [agencyId]
  );
  return rows.map(rowToZone);
}

export async function getZoneById(agencyId: string, zoneId: string): Promise<DeliveryZone | null> {
  const [rows] = await pool.query<DeliveryZoneRow[]>(
    `SELECT id, agency_id, name, color, south, west, north, east
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

export async function findZoneForPoint(
  agencyId: string,
  lat: number,
  lng: number
): Promise<DeliveryZone | null> {
  const zones = await listZonesForAgency(agencyId);
  for (const zone of zones) {
    if (lat >= zone.south && lat <= zone.north && lng >= zone.west && lng <= zone.east) {
      return zone;
    }
  }
  return null;
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

export async function seedDefaultZonesForAgency(agencyId: string): Promise<void> {
  const existing = await listZonesForAgency(agencyId);
  if (existing.length > 0) return;

  const now = new Date();
  for (const zone of DEFAULT_DELIVERY_ZONES) {
    await pool.query(
      `INSERT INTO delivery_zones (id, agency_id, name, color, south, west, north, east, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [zone.id, agencyId, zone.name, zone.color, zone.south, zone.west, zone.north, zone.east, now]
    );
  }
}

export async function createZone(
  agencyId: string,
  data: {
    name: string;
    color?: string;
    south: number;
    west: number;
    north: number;
    east: number;
  }
): Promise<DeliveryZone> {
  const name = data.name.trim();
  if (!name) throw new Error('NAME_REQUIRED');

  validateBounds(data);

  const existing = await listZonesForAgency(agencyId);
  const color = data.color ?? ZONE_COLORS[existing.length % ZONE_COLORS.length];
  validateColor(color);

  const id = `dz${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();

  await pool.query(
    `INSERT INTO delivery_zones (id, agency_id, name, color, south, west, north, east, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, agencyId, name, color, data.south, data.west, data.north, data.east, now]
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
  }
): Promise<DeliveryZone> {
  const existing = await getZoneById(agencyId, zoneId);
  if (!existing) throw new Error('NOT_FOUND');

  const updated = {
    name: data.name?.trim() ?? existing.name,
    color: data.color ?? existing.color,
    south: data.south ?? existing.south,
    west: data.west ?? existing.west,
    north: data.north ?? existing.north,
    east: data.east ?? existing.east,
  };

  if (!updated.name) throw new Error('NAME_REQUIRED');
  validateBounds(updated);
  validateColor(updated.color);

  await pool.query(
    `UPDATE delivery_zones SET name = ?, color = ?, south = ?, west = ?, north = ?, east = ? WHERE id = ? AND agency_id = ?`,
    [updated.name, updated.color, updated.south, updated.west, updated.north, updated.east, zoneId, agencyId]
  );

  const zone = await getZoneById(agencyId, zoneId);
  if (!zone) throw new Error('NOT_FOUND');
  return zone;
}

export async function deleteZone(agencyId: string, zoneId: string): Promise<void> {
  const existing = await getZoneById(agencyId, zoneId);
  if (!existing) throw new Error('NOT_FOUND');

  const [usage] = await pool.query<Array<{ cnt: number } & RowDataPacket>>(
    `SELECT COUNT(*) AS cnt FROM users WHERE agency_id = ? AND delivery_zone = ?`,
    [agencyId, zoneId]
  );
  if (Number(usage[0]?.cnt ?? 0) > 0) {
    throw new Error('ZONE_IN_USE');
  }

  await pool.query('DELETE FROM delivery_zones WHERE id = ? AND agency_id = ?', [zoneId, agencyId]);
}
