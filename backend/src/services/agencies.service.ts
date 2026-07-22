import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { LocationPoint } from '../types/index.js';
import { seedDefaultZonesForAgency, ensureCordonZonesForAgency } from './delivery-zones.service.js';
import { ensureAgencySubscription } from './subscriptions.service.js';
import { DELIVERY_DEADLINE_HOUR, normalizeDeadlineHour } from '../utils/delivery-deadline.js';

let deadlineHourColumnReady: Promise<void> | null = null;

/** Garantiza la columna delivery_deadline_hour (por si el migrate no corrió aún). */
export async function ensureAgencyDeliveryDeadlineHourColumn(): Promise<void> {
  if (!deadlineHourColumnReady) {
    deadlineHourColumnReady = (async () => {
      const [rows] = await pool.query<Array<{ COLUMN_NAME: string } & RowDataPacket>>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'delivery_deadline_hour'`
      );
      if (rows.length === 0) {
        await pool.query(
          `ALTER TABLE agencies ADD COLUMN delivery_deadline_hour TINYINT UNSIGNED NOT NULL DEFAULT ${DELIVERY_DEADLINE_HOUR} AFTER city`
        );
        console.log(
          `[agencies] Columna delivery_deadline_hour creada (default ${DELIVERY_DEADLINE_HOUR})`
        );
      }
    })().catch((err) => {
      deadlineHourColumnReady = null;
      throw err;
    });
  }
  await deadlineHourColumnReady;
}

export interface Agency {
  id: string;
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  cuit?: string | null;
  city?: string | null;
  deliveryDeadlineHour: number;
  departurePoint?: LocationPoint;
}

interface AgencyRow extends RowDataPacket {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  cuit: string | null;
  city: string | null;
  delivery_deadline_hour: number | null;
  departure_address: string | null;
  departure_lat: number | null;
  departure_lng: number | null;
}

function rowToAgency(row: AgencyRow): Agency {
  const agency: Agency = {
    id: row.id,
    name: row.name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    cuit: row.cuit,
    city: row.city,
    deliveryDeadlineHour: normalizeDeadlineHour(row.delivery_deadline_hour),
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

export async function createAgency(data: {
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  cuit?: string | null;
  city?: string | null;
  departurePoint?: LocationPoint;
}): Promise<Agency> {
  const id = `ag${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();
  await pool.query(
    `INSERT INTO agencies (id, name, contact_email, contact_phone, cuit, city, departure_address, departure_lat, departure_lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name.trim(),
      data.contactEmail?.trim().toLowerCase() ?? null,
      data.contactPhone ?? null,
      data.cuit ?? null,
      data.city?.trim() ?? null,
      data.departurePoint?.address ?? null,
      data.departurePoint?.lat ?? null,
      data.departurePoint?.lng ?? null,
      now,
    ]
  );
  const agency = await getAgencyById(id);
  if (!agency) throw new Error('CREATE_FAILED');
  await seedDefaultZonesForAgency(id);
  await ensureCordonZonesForAgency(id);
  await ensureAgencySubscription(id);
  return agency;
}

export async function getAgencyById(id: string): Promise<Agency | null> {
  await ensureAgencyDeliveryDeadlineHourColumn();
  const [rows] = await pool.query<AgencyRow[]>(
    `SELECT id, name, contact_email, contact_phone, cuit, city, delivery_deadline_hour,
            departure_address, departure_lat, departure_lng
     FROM agencies WHERE id = ?`,
    [id]
  );
  const row = rows[0];
  return row ? rowToAgency(row) : null;
}

export async function listAgenciesDeadlineHours(): Promise<
  Array<{ id: string; deliveryDeadlineHour: number }>
> {
  await ensureAgencyDeliveryDeadlineHourColumn();
  const [rows] = await pool.query<
    Array<{ id: string; delivery_deadline_hour: number | null } & RowDataPacket>
  >('SELECT id, delivery_deadline_hour FROM agencies');
  return rows.map((row) => ({
    id: row.id,
    deliveryDeadlineHour: normalizeDeadlineHour(row.delivery_deadline_hour),
  }));
}

export async function getAgencyDeliveryDeadlineHour(agencyId: string): Promise<number> {
  await ensureAgencyDeliveryDeadlineHourColumn();
  const [rows] = await pool.query<
    Array<{ delivery_deadline_hour: number | null } & RowDataPacket>
  >('SELECT delivery_deadline_hour FROM agencies WHERE id = ? LIMIT 1', [agencyId]);
  return normalizeDeadlineHour(rows[0]?.delivery_deadline_hour ?? DELIVERY_DEADLINE_HOUR);
}

export async function updateAgencyDeliveryDeadlineHour(
  agencyId: string,
  hour: number
): Promise<number> {
  await ensureAgencyDeliveryDeadlineHourColumn();
  const agency = await getAgencyById(agencyId);
  if (!agency) throw new Error('NOT_FOUND');
  if (!Number.isFinite(hour)) throw new Error('INVALID_HOUR');
  const normalized = Math.trunc(Number(hour));
  if (normalized < 0 || normalized > 23) throw new Error('INVALID_HOUR');
  await pool.query('UPDATE agencies SET delivery_deadline_hour = ? WHERE id = ?', [
    normalized,
    agencyId,
  ]);
  const { clampSellerDeadlineHoursToAgencyMax } = await import('./users.service.js');
  await clampSellerDeadlineHoursToAgencyMax(agencyId, normalized);
  return normalized;
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
