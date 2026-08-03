import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { LocationPoint } from '../types/index.js';
import { seedDefaultZonesForAgency, ensureCordonZonesForAgency } from './delivery-zones.service.js';
import { ensureAgencySubscription } from './subscriptions.service.js';
import { DELIVERY_DEADLINE_HOUR, normalizeDeadlineHour } from '../utils/delivery-deadline.js';

let deadlineHourColumnReady: Promise<void> | null = null;
let agencyStatusColumnReady: Promise<void> | null = null;
let worksOnHolidaysColumnReady: Promise<void> | null = null;

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

export async function ensureAgencyStatusColumn(): Promise<void> {
  if (!agencyStatusColumnReady) {
    agencyStatusColumnReady = (async () => {
      const [rows] = await pool.query<Array<{ COLUMN_NAME: string } & RowDataPacket>>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'status'`
      );
      if (rows.length === 0) {
        await pool.query(
          "ALTER TABLE agencies ADD COLUMN status ENUM('active','suspended') NOT NULL DEFAULT 'active' AFTER city"
        );
        console.log('[agencies] Columna status creada (default active)');
      }
    })().catch((err) => {
      agencyStatusColumnReady = null;
      throw err;
    });
  }
  await agencyStatusColumnReady;
}

/** Garantiza agencies.works_on_holidays (0 = respeta feriados nacionales). */
export async function ensureAgencyWorksOnHolidaysColumn(): Promise<void> {
  if (!worksOnHolidaysColumnReady) {
    worksOnHolidaysColumnReady = (async () => {
      const [rows] = await pool.query<Array<{ COLUMN_NAME: string } & RowDataPacket>>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'works_on_holidays'`
      );
      if (rows.length === 0) {
        await pool.query(
          'ALTER TABLE agencies ADD COLUMN works_on_holidays TINYINT(1) NOT NULL DEFAULT 0 AFTER delivery_deadline_hour'
        );
        console.log('[agencies] Columna works_on_holidays creada (default 0)');
      }
    })().catch((err) => {
      worksOnHolidaysColumnReady = null;
      throw err;
    });
  }
  await worksOnHolidaysColumnReady;
}

export interface Agency {
  id: string;
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  cuit?: string | null;
  city?: string | null;
  status: 'active' | 'suspended';
  deliveryDeadlineHour: number;
  /** Si true, opera en feriados nacionales / puentes. Domingos siguen sin operar. */
  worksOnHolidays: boolean;
  departurePoint?: LocationPoint;
  createdAt?: string | null;
}

interface AgencyRow extends RowDataPacket {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  cuit: string | null;
  city: string | null;
  status?: 'active' | 'suspended' | null;
  delivery_deadline_hour: number | null;
  works_on_holidays?: number | null;
  departure_address: string | null;
  departure_lat: number | null;
  departure_lng: number | null;
  created_at?: Date | null;
}

function rowToAgency(row: AgencyRow): Agency {
  const agency: Agency = {
    id: row.id,
    name: row.name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    cuit: row.cuit,
    city: row.city,
    status: row.status === 'suspended' ? 'suspended' : 'active',
    deliveryDeadlineHour: normalizeDeadlineHour(row.delivery_deadline_hour),
    worksOnHolidays: Boolean(row.works_on_holidays),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
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
  await ensureAgencyStatusColumn();
  await ensureAgencyWorksOnHolidaysColumn();
  const [rows] = await pool.query<AgencyRow[]>(
    `SELECT id, name, contact_email, contact_phone, cuit, city, status, delivery_deadline_hour,
            works_on_holidays, departure_address, departure_lat, departure_lng, created_at
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

export async function getAgencyWorksOnHolidays(agencyId: string): Promise<boolean> {
  await ensureAgencyWorksOnHolidaysColumn();
  const [rows] = await pool.query<
    Array<{ works_on_holidays: number | null } & RowDataPacket>
  >('SELECT works_on_holidays FROM agencies WHERE id = ? LIMIT 1', [agencyId]);
  return Boolean(rows[0]?.works_on_holidays);
}

export async function updateAgencyWorksOnHolidays(
  agencyId: string,
  worksOnHolidays: boolean
): Promise<boolean> {
  await ensureAgencyWorksOnHolidaysColumn();
  const agency = await getAgencyById(agencyId);
  if (!agency) throw new Error('NOT_FOUND');
  const value = worksOnHolidays ? 1 : 0;
  await pool.query('UPDATE agencies SET works_on_holidays = ? WHERE id = ?', [value, agencyId]);
  if (!worksOnHolidays) {
    const { clearSellerWorksOnHolidaysWhenAgencyDisables } = await import('./users.service.js');
    await clearSellerWorksOnHolidaysWhenAgencyDisables(agencyId);
  }
  return Boolean(value);
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

export async function updateAgencyProfile(
  agencyId: string,
  data: {
    name?: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    cuit?: string | null;
    city?: string | null;
    deliveryDeadlineHour?: number;
  }
): Promise<Agency> {
  const agency = await getAgencyById(agencyId);
  if (!agency) throw new Error('NOT_FOUND');

  const name = data.name !== undefined ? data.name.trim() : agency.name;
  if (!name) throw new Error('NAME_REQUIRED');

  let deadlineHour = agency.deliveryDeadlineHour;
  if (data.deliveryDeadlineHour !== undefined) {
    deadlineHour = await updateAgencyDeliveryDeadlineHour(agencyId, data.deliveryDeadlineHour);
  }

  await pool.query(
    `UPDATE agencies
     SET name = ?, contact_email = ?, contact_phone = ?, cuit = ?, city = ?
     WHERE id = ?`,
    [
      name,
      data.contactEmail !== undefined
        ? data.contactEmail?.trim().toLowerCase() || null
        : agency.contactEmail ?? null,
      data.contactPhone !== undefined ? data.contactPhone || null : agency.contactPhone ?? null,
      data.cuit !== undefined ? data.cuit || null : agency.cuit ?? null,
      data.city !== undefined ? data.city?.trim() || null : agency.city ?? null,
      agencyId,
    ]
  );

  const updated = await getAgencyById(agencyId);
  if (!updated) throw new Error('NOT_FOUND');
  // Asegurar que el deadline quedó aplicado si solo se actualizó el resto
  if (data.deliveryDeadlineHour === undefined) {
    return updated;
  }
  return { ...updated, deliveryDeadlineHour: deadlineHour };
}

export async function setAgencyStatus(
  agencyId: string,
  status: 'active' | 'suspended'
): Promise<Agency> {
  await ensureAgencyStatusColumn();
  const agency = await getAgencyById(agencyId);
  if (!agency) throw new Error('NOT_FOUND');
  await pool.query('UPDATE agencies SET status = ? WHERE id = ?', [status, agencyId]);
  const updated = await getAgencyById(agencyId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}
