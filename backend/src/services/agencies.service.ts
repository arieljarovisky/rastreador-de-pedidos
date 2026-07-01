import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { LocationPoint } from '../types/index.js';
import type { AgencyCoverageArea, AgencyShippingService, MarketplaceAgency, MlFlexMode } from '../types/index.js';
import { normalizeCoverageAreas } from './coverage-areas.service.js';
import { seedDefaultZonesForAgency } from './delivery-zones.service.js';

export interface Agency {
  id: string;
  name: string;
  mlFlexMode: MlFlexMode;
  website?: string | null;
  instagram?: string | null;
  city?: string | null;
  province?: string | null;
  shippingServices: AgencyShippingService[];
  coverageAreas: AgencyCoverageArea[];
  departurePoint?: LocationPoint;
}

interface AgencyRow extends RowDataPacket {
  id: string;
  name: string;
  ml_flex_mode: MlFlexMode;
  website: string | null;
  instagram: string | null;
  city: string | null;
  province: string | null;
  shipping_services: AgencyShippingService[] | string | null;
  coverage_areas: AgencyCoverageArea[] | string | null;
  departure_address: string | null;
  departure_lat: number | null;
  departure_lng: number | null;
}

const AGENCY_COLUMNS = `id, name, ml_flex_mode, website, instagram, city, province, shipping_services, coverage_areas,
  departure_address, departure_lat, departure_lng`;

function parseShippingServices(raw: AgencyShippingService[] | string | null): AgencyShippingService[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw) as AgencyShippingService[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseCoverageAreas(raw: AgencyCoverageArea[] | string | null): AgencyCoverageArea[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return normalizeCoverageAreas(raw);
  try {
    return normalizeCoverageAreas(JSON.parse(raw));
  } catch {
    return [];
  }
}

function rowToAgency(row: AgencyRow): Agency {
  const agency: Agency = {
    id: row.id,
    name: row.name,
    mlFlexMode: row.ml_flex_mode ?? 'agency',
    website: row.website ?? null,
    instagram: row.instagram ?? null,
    city: row.city ?? null,
    province: row.province ?? null,
    shippingServices: parseShippingServices(row.shipping_services),
    coverageAreas: parseCoverageAreas(row.coverage_areas),
  };
  if (row.departure_address && row.departure_lat != null && row.departure_lng != null) {
    agency.departurePoint = {
      address: row.departure_address,
      lat: Number(row.departure_lat),
      lng: Number(row.departure_lng),
    };
  }
  return agency;
}

function rowToMarketplaceAgency(row: AgencyRow): MarketplaceAgency {
  const agency = rowToAgency(row);
  return {
    id: agency.id,
    name: agency.name,
    city: agency.city,
    province: agency.province,
    website: agency.website,
    instagram: agency.instagram,
    shippingServices: agency.shippingServices,
    coverageAreas: agency.coverageAreas,
    departurePoint: agency.departurePoint,
  };
}

export async function createAgency(data: {
  name: string;
  departurePoint?: LocationPoint;
  city?: string;
  province?: string;
  coverageAreas?: AgencyCoverageArea[];
}): Promise<Agency> {
  const id = `ag${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();
  const coverageAreas = data.coverageAreas ?? [];
  await pool.query(
    `INSERT INTO agencies (id, name, city, province, coverage_areas, departure_address, departure_lat, departure_lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name.trim(),
      data.city?.trim() ?? null,
      data.province?.trim() ?? null,
      JSON.stringify(coverageAreas),
      data.departurePoint?.address ?? null,
      data.departurePoint?.lat ?? null,
      data.departurePoint?.lng ?? null,
      now,
    ]
  );
  const agency = await getAgencyById(id);
  if (!agency) throw new Error('CREATE_FAILED');
  await seedDefaultZonesForAgency(id);
  return agency;
}

export async function getAgencyById(id: string): Promise<Agency | null> {
  const [rows] = await pool.query<AgencyRow[]>(
    `SELECT ${AGENCY_COLUMNS} FROM agencies WHERE id = ?`,
    [id]
  );
  const row = rows[0];
  return row ? rowToAgency(row) : null;
}

export async function getAgencyDeparture(agencyId: string): Promise<LocationPoint | null> {
  const agency = await getAgencyById(agencyId);
  return agency?.departurePoint ?? null;
}

export async function updateAgencyDeparture(
  agencyId: string,
  data: { address: string; lat: number; lng: number }
): Promise<LocationPoint> {
  const agency = await getAgencyById(agencyId);
  if (!agency) throw new Error('NOT_FOUND');

  await pool.query(
    `UPDATE agencies SET departure_address = ?, departure_lat = ?, departure_lng = ? WHERE id = ?`,
    [data.address, data.lat, data.lng, agencyId]
  );

  const updated = await getAgencyDeparture(agencyId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}

export async function updateAgencyMlFlexMode(
  agencyId: string,
  mlFlexMode: MlFlexMode
): Promise<Agency> {
  const agency = await getAgencyById(agencyId);
  if (!agency) throw new Error('NOT_FOUND');

  await pool.query(`UPDATE agencies SET ml_flex_mode = ? WHERE id = ?`, [mlFlexMode, agencyId]);

  const updated = await getAgencyById(agencyId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}

export async function updateAgencyMarketplaceProfile(
  agencyId: string,
  data: {
    website?: string | null;
    instagram?: string | null;
    city?: string | null;
    province?: string | null;
    shippingServices?: AgencyShippingService[];
    coverageAreas?: AgencyCoverageArea[];
  }
): Promise<Agency> {
  const agency = await getAgencyById(agencyId);
  if (!agency) throw new Error('NOT_FOUND');

  const website = data.website !== undefined ? (data.website?.trim() || null) : agency.website ?? null;
  const instagram =
    data.instagram !== undefined ? (data.instagram?.trim().replace(/^@/, '') || null) : agency.instagram ?? null;
  const city = data.city !== undefined ? (data.city?.trim() || null) : agency.city ?? null;
  const province = data.province !== undefined ? (data.province?.trim() || null) : agency.province ?? null;
  const shippingServices = data.shippingServices ?? agency.shippingServices;
  const coverageAreas = data.coverageAreas ?? agency.coverageAreas;

  await pool.query(
    `UPDATE agencies SET website = ?, instagram = ?, city = ?, province = ?, shipping_services = ?, coverage_areas = ? WHERE id = ?`,
    [website, instagram, city, province, JSON.stringify(shippingServices), JSON.stringify(coverageAreas), agencyId]
  );

  const updated = await getAgencyById(agencyId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}

export async function listMarketplaceAgencies(filters?: {
  province?: string;
  serviceType?: AgencyShippingService['type'];
}): Promise<MarketplaceAgency[]> {
  let sql = `SELECT ${AGENCY_COLUMNS} FROM agencies WHERE 1=1`;
  const params: string[] = [];

  if (filters?.province) {
    sql += ' AND LOWER(province) = LOWER(?)';
    params.push(filters.province.trim());
  }

  sql += ' ORDER BY name ASC';

  const [rows] = await pool.query<AgencyRow[]>(sql, params);
  let agencies = rows.map(rowToMarketplaceAgency);

  if (filters?.serviceType) {
    agencies = agencies.filter((a) =>
      a.shippingServices.some((s) => s.type === filters.serviceType)
    );
  }

  return agencies;
}
