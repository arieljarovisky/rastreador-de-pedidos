import { randomUUID } from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { User } from '../types/index.js';
import { haversineMeters, LatLng, RouteAlertKind } from './route-optimizer.js';

export type RouteAlertSource = 'fleet' | 'tomtom' | 'gcba' | 'traffic';

export interface RouteAlert extends LatLng {
  id: string;
  kind: RouteAlertKind;
  title: string;
  description: string | null;
  delaySeconds: number;
  source: RouteAlertSource;
  expiresAt: string | null;
  mine: boolean;
  onPath: boolean;
}

const KIND_TITLE: Record<RouteAlertKind, string> = {
  accident: 'Accidente',
  closure: 'Corte de calle',
  jam: 'Congestión',
  hazard: 'Peligro en la vía',
  construction: 'Obra',
};

const TTL_MINUTES: Record<RouteAlertKind, number> = {
  jam: 45,
  accident: 90,
  hazard: 180,
  closure: 8 * 60,
  construction: 12 * 60,
};

const KINDS = new Set<RouteAlertKind>(['accident', 'closure', 'jam', 'hazard', 'construction']);

let tableReady: Promise<void> | null = null;

function ensureRouteAlertsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS route_alerts (
          id VARCHAR(36) PRIMARY KEY,
          agency_id VARCHAR(36) NOT NULL,
          repartidor_id VARCHAR(36) NOT NULL,
          kind ENUM('accident','closure','jam','hazard','construction') NOT NULL,
          lat DECIMAL(10, 7) NOT NULL,
          lng DECIMAL(10, 7) NOT NULL,
          note VARCHAR(240) NULL,
          created_at DATETIME(3) NOT NULL,
          expires_at DATETIME(3) NOT NULL,
          INDEX idx_route_alerts_agency_exp (agency_id, expires_at),
          CONSTRAINT fk_route_alerts_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_route_alerts_rep FOREIGN KEY (repartidor_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
      .then(() => undefined)
      .catch((err) => {
        tableReady = null;
        throw err;
      });
  }
  return tableReady;
}

interface DbAlertRow extends RowDataPacket {
  id: string;
  agency_id: string;
  repartidor_id: string;
  kind: RouteAlertKind;
  lat: number | string;
  lng: number | string;
  note: string | null;
  expires_at: Date | string;
}

function isKind(value: string): value is RouteAlertKind {
  return KINDS.has(value as RouteAlertKind);
}

export function alertTitle(kind: RouteAlertKind): string {
  return KIND_TITLE[kind];
}

function mapFleetRow(row: DbAlertRow, userId: string): RouteAlert {
  const expires = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
  return {
    id: row.id,
    kind: row.kind,
    lat: Number(row.lat),
    lng: Number(row.lng),
    title: KIND_TITLE[row.kind],
    description: row.note?.trim() || null,
    delaySeconds: 0,
    source: 'fleet',
    expiresAt: Number.isNaN(expires.getTime()) ? null : expires.toISOString(),
    mine: row.repartidor_id === userId,
    onPath: false,
  };
}

export async function listFleetAlerts(user: User): Promise<RouteAlert[]> {
  if (!user.agencyId) return [];
  await ensureRouteAlertsTable();
  const [rows] = await pool.query<DbAlertRow[]>(
    `SELECT id, agency_id, repartidor_id, kind, lat, lng, note, expires_at
     FROM route_alerts
     WHERE agency_id = ? AND expires_at > NOW(3)
     ORDER BY created_at DESC
     LIMIT 200`,
    [user.agencyId]
  );
  return rows.map((row) => mapFleetRow(row, user.id));
}

export async function createFleetAlert(
  user: User,
  input: { kind: string; lat: number; lng: number; note?: string | null }
): Promise<RouteAlert> {
  if (!user.agencyId) throw new Error('FORBIDDEN');
  if (!isKind(input.kind)) throw new Error('INVALID_KIND');
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) throw new Error('INVALID_POINT');

  await ensureRouteAlertsTable();
  const id = randomUUID();
  const note = input.note?.trim().slice(0, 240) || null;
  const expires = new Date(Date.now() + TTL_MINUTES[input.kind] * 60_000);
  await pool.query<ResultSetHeader>(
    `INSERT INTO route_alerts
      (id, agency_id, repartidor_id, kind, lat, lng, note, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), ?)`,
    [id, user.agencyId, user.id, input.kind, input.lat, input.lng, note, expires]
  );

  return {
    id,
    kind: input.kind,
    lat: input.lat,
    lng: input.lng,
    title: KIND_TITLE[input.kind],
    description: note,
    delaySeconds: 0,
    source: 'fleet',
    expiresAt: expires.toISOString(),
    mine: true,
    onPath: false,
  };
}

export async function deleteFleetAlert(user: User, alertId: string): Promise<void> {
  if (!user.agencyId) throw new Error('FORBIDDEN');
  await ensureRouteAlertsTable();
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM route_alerts
     WHERE id = ? AND agency_id = ? AND repartidor_id = ?`,
    [alertId, user.agencyId, user.id]
  );
  if (result.affectedRows === 0) throw new Error('NOT_FOUND');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function midpoint(coords: unknown): LatLng | null {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const first = coords[0];
  if (typeof first === 'number' && coords.length >= 2 && typeof coords[1] === 'number') {
    return { lng: first, lat: coords[1] };
  }
  const points: LatLng[] = [];
  for (const pair of coords) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const lng = Number(pair[0]);
    const lat = Number(pair[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) points.push({ lat, lng });
  }
  if (points.length === 0) return null;
  const mid = points[Math.floor(points.length / 2)];
  return mid;
}

function tomtomKind(iconCategory: number): RouteAlertKind | null {
  switch (iconCategory) {
    case 1:
    case 14:
      return iconCategory === 14 ? 'hazard' : 'accident';
    case 6:
      return 'jam';
    case 7:
    case 8:
      return 'closure';
    case 9:
      return 'construction';
    case 3:
      return 'hazard';
    default:
      return null;
  }
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Posta/1.0 (route-plan)' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.warn('[route-alerts] fuente externa no disponible:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function bboxOf(points: LatLng[], padDeg = 0.03): { minLat: number; minLng: number; maxLat: number; maxLng: number } | null {
  if (points.length === 0) return null;
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }
  minLat -= padDeg;
  maxLat += padDeg;
  minLng -= padDeg;
  maxLng += padDeg;
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const maxSpan = 0.45;
  if (maxLat - minLat > maxSpan) {
    minLat = centerLat - maxSpan / 2;
    maxLat = centerLat + maxSpan / 2;
  }
  if (maxLng - minLng > maxSpan) {
    minLng = centerLng - maxSpan / 2;
    maxLng = centerLng + maxSpan / 2;
  }
  return { minLat, minLng, maxLat, maxLng };
}

export async function fetchTomTomAlerts(points: LatLng[]): Promise<RouteAlert[]> {
  const key = env.routing.tomtomApiKey;
  const box = bboxOf(points);
  if (!key || !box) return [];

  const bbox = `${box.minLng},${box.minLat},${box.maxLng},${box.maxLat}`;
  const fields =
    '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description},from,to,delay,roadNumbers}}}';
  const url =
    `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${encodeURIComponent(key)}` +
    `&bbox=${encodeURIComponent(bbox)}&language=es-ES&fields=${encodeURIComponent(fields)}`;
  const data = await fetchJson(url);
  if (!isRecord(data) || !Array.isArray(data.incidents)) return [];

  const alerts: RouteAlert[] = [];
  for (const incident of data.incidents) {
    if (!isRecord(incident)) continue;
    const properties = isRecord(incident.properties) ? incident.properties : {};
    const kind = tomtomKind(Number(properties.iconCategory));
    const geometry = isRecord(incident.geometry) ? incident.geometry : {};
    const point = midpoint(geometry.coordinates);
    if (!kind || !point) continue;
    const events = Array.isArray(properties.events) ? properties.events : [];
    const eventText = events
      .map((event) => (isRecord(event) && typeof event.description === 'string' ? event.description : ''))
      .filter(Boolean)
      .join(' · ');
    const from = typeof properties.from === 'string' ? properties.from : '';
    const to = typeof properties.to === 'string' ? properties.to : '';
    const street = [from, to].filter(Boolean).join(' → ');
    const delay = Number(properties.delay);
    alerts.push({
      id: `tomtom-${String(properties.id ?? alerts.length)}`,
      kind,
      lat: point.lat,
      lng: point.lng,
      title: KIND_TITLE[kind],
      description: [eventText, street].filter(Boolean).join(' · ') || null,
      delaySeconds: Number.isFinite(delay) && delay > 0 ? delay : 0,
      source: 'tomtom',
      expiresAt: null,
      mine: false,
      onPath: false,
    });
  }
  return alerts;
}

function textKind(text: string, fallback: RouteAlertKind): RouteAlertKind {
  const value = text.toLowerCase();
  if (/accident|choque|siniestro/.test(value)) return 'accident';
  if (/obra|trabaj/.test(value)) return 'construction';
  if (/congest|embotell|demora|lento|tranc/.test(value)) return 'jam';
  if (/peligro|inund|pozo/.test(value)) return 'hazard';
  if (/corte|cerrad|manifest|desv[ií]o/.test(value)) return 'closure';
  return fallback;
}

function collectRecords(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  const nested: Record<string, unknown>[] = [];
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) nested.push(...value.filter(isRecord));
  }
  return nested.length > 0 ? nested : [data];
}

export async function fetchGcbaAlerts(points: LatLng[]): Promise<RouteAlert[]> {
  const clientId = env.routing.baTransporteClientId;
  const clientSecret = env.routing.baTransporteClientSecret;
  const box = bboxOf(points, 0.02);
  if (!clientId || !clientSecret || !box) return [];

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
  });
  const base = 'https://apitransporte.buenosaires.gob.ar/transito/v1';
  const [cortes, eventos] = await Promise.all([
    fetchJson(`${base}/cortes?${params}`),
    fetchJson(`${base}/eventos?${params}`),
  ]);

  const alerts: RouteAlert[] = [];
  const batches: Array<{ data: unknown; fallback: RouteAlertKind }> = [
    { data: cortes, fallback: 'closure' },
    { data: eventos, fallback: 'jam' },
  ];

  for (const batch of batches) {
    for (const row of collectRecords(batch.data)) {
      const lat = readNumber(row, ['lat', 'latitude', 'latitud', 'y']);
      const lng = readNumber(row, ['lng', 'lon', 'long', 'longitude', 'longitud', 'x']);
      if (lat == null || lng == null) continue;
      if (lat < box.minLat || lat > box.maxLat || lng < box.minLng || lng > box.maxLng) continue;
      const rawText = ['nombre', 'descripcion', 'description', 'motivo', 'tipo', 'calle', 'title']
        .map((key) => (typeof row[key] === 'string' ? row[key] : ''))
        .filter(Boolean)
        .join(' · ');
      const kind = textKind(rawText, batch.fallback);
      alerts.push({
        id: `gcba-${kind}-${lat.toFixed(4)}-${lng.toFixed(4)}`,
        kind,
        lat,
        lng,
        title: KIND_TITLE[kind],
        description: rawText || null,
        delaySeconds: 0,
        source: 'gcba',
        expiresAt: null,
        mine: false,
        onPath: false,
      });
    }
  }
  return alerts;
}

export function dedupeAlerts(alerts: RouteAlert[]): RouteAlert[] {
  const kept: RouteAlert[] = [];
  for (const alert of alerts) {
    const index = kept.findIndex(
      (item) => item.kind === alert.kind && haversineMeters(item, alert) < 140
    );
    if (index < 0) {
      kept.push(alert);
      continue;
    }
    if (alert.source === 'fleet' && kept[index].source !== 'fleet') {
      kept[index] = alert;
    }
  }
  return kept;
}

export function alertsNear(alerts: RouteAlert[], points: LatLng[], radiusMeters: number): RouteAlert[] {
  if (points.length === 0) return [];
  return alerts.filter((alert) =>
    points.some((point) => haversineMeters(alert, point) <= radiusMeters)
  );
}
