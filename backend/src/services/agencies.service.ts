import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { LocationPoint } from '../types/index.js';

export interface Agency {
  id: string;
  name: string;
  departurePoint?: LocationPoint;
}

interface AgencyRow extends RowDataPacket {
  id: string;
  name: string;
  departure_address: string | null;
  departure_lat: number | null;
  departure_lng: number | null;
}

function rowToAgency(row: AgencyRow): Agency {
  const agency: Agency = { id: row.id, name: row.name };
  if (row.departure_address && row.departure_lat != null && row.departure_lng != null) {
    agency.departurePoint = {
      address: row.departure_address,
      lat: Number(row.departure_lat),
      lng: Number(row.departure_lng),
    };
  }
  return agency;
}

export async function createAgency(data: {
  name: string;
  departurePoint?: LocationPoint;
}): Promise<Agency> {
  const id = `ag${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();
  await pool.query(
    `INSERT INTO agencies (id, name, departure_address, departure_lat, departure_lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name.trim(),
      data.departurePoint?.address ?? null,
      data.departurePoint?.lat ?? null,
      data.departurePoint?.lng ?? null,
      now,
    ]
  );
  const agency = await getAgencyById(id);
  if (!agency) throw new Error('CREATE_FAILED');
  return agency;
}

export async function getAgencyById(id: string): Promise<Agency | null> {
  const [rows] = await pool.query<AgencyRow[]>(
    `SELECT id, name, departure_address, departure_lat, departure_lng FROM agencies WHERE id = ?`,
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
