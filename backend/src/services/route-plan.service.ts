import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { OrderStatus, User, UserRole } from '../types/index.js';
import { getActiveOperationalDateKey } from '../utils/delivery-deadline.js';
import { geocodeAddress } from './geocode.service.js';
import {
  alertsNear,
  dedupeAlerts,
  fetchGcbaAlerts,
  fetchTomTomAlerts,
  listFleetAlerts,
  RouteAlert,
} from './route-alerts.service.js';
import { ensureDriverScanEntriesTable } from './driver-scan.service.js';
import {
  applyAlertPenalties,
  decodePolyline,
  downsamplePolyline,
  fallbackDriveSeconds,
  haversineMeters,
  LatLng,
  metersToPolyline,
  metersToSegment,
  offsetAway,
  rushHourMultiplier,
  solveOpenTsp,
} from './route-optimizer.js';

const MAX_STOPS = 16;
const MAX_GEOCODES = 3;

export interface RouteStop {
  id: string;
  source: 'order' | 'scan';
  clientName: string;
  address: string;
  lat: number;
  lng: number;
  sequence: number;
  etaSeconds: number;
  legDurationSeconds: number;
  legDistanceMeters: number;
}

export interface SkippedStop {
  label: string;
  reason: string;
}

export interface RoutePlan {
  generatedAt: string;
  origin: LatLng;
  stops: RouteStop[];
  skipped: SkippedStop[];
  polyline: LatLng[];
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  freeFlowDurationSeconds: number;
  trafficDelaySeconds: number;
  trafficMode: 'live' | 'estimated';
  summary: string;
  warning: string | null;
  alerts: RouteAlert[];
}

interface StopDraft {
  id: string;
  source: 'order' | 'scan';
  clientName: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

interface Leg {
  durationSeconds: number;
  staticSeconds: number;
  distanceMeters: number;
  points: LatLng[];
  avoidedClosure: boolean;
}

class RoutePlanError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function isRoutePlanError(err: unknown): err is RoutePlanError {
  return err instanceof RoutePlanError;
}

function asPoint(lat: number | null, lng: number | null): LatLng | null {
  if (
    lat == null ||
    lng == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180 ||
    (lat === 0 && lng === 0)
  ) {
    return null;
  }
  return { lat, lng };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadDrafts(user: User): Promise<StopDraft[]> {
  const [orderRows] = await pool.query<
    Array<RowDataPacket & { id: string; client_name: string; address: string; lat: number | string | null; lng: number | string | null }>
  >(
    `SELECT id, client_name, address, lat, lng
     FROM orders
     WHERE repartidor_id = ? AND archived = 0 AND status IN (?, ?)`,
    [user.id, OrderStatus.ASSIGNED, OrderStatus.DELIVERING]
  );

  await ensureDriverScanEntriesTable();
  const routeDate = getActiveOperationalDateKey();
  const [scanRows] = await pool.query<
    Array<RowDataPacket & { id: string; client_name: string | null; address: string | null; scan_code: string; lat: number | string | null; lng: number | string | null }>
  >(
    `SELECT id, client_name, address, scan_code, lat, lng
     FROM driver_scan_entries
     WHERE repartidor_id = ? AND route_date = ? AND status = 'pending'`,
    [user.id, routeDate]
  );

  const drafts: StopDraft[] = orderRows.map((row) => ({
    id: `order:${row.id}`,
    source: 'order',
    clientName: row.client_name?.trim() || 'Envío',
    address: row.address?.trim() || 'Sin dirección',
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
  }));

  for (const row of scanRows) {
    drafts.push({
      id: `scan:${row.id}`,
      source: 'scan',
      clientName: row.client_name?.trim() || 'Paquete del registro',
      address: row.address?.trim() || row.scan_code,
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
    });
  }
  return drafts;
}

async function locateDrafts(drafts: StopDraft[]): Promise<{ located: Array<StopDraft & LatLng>; skipped: SkippedStop[] }> {
  const located: Array<StopDraft & LatLng> = [];
  const skipped: SkippedStop[] = [];
  let geocodes = 0;

  for (const draft of drafts) {
    const point = asPoint(draft.lat, draft.lng);
    if (point) {
      located.push({ ...draft, lat: point.lat, lng: point.lng });
      continue;
    }
    if (!draft.address.trim() || draft.address === 'Sin dirección' || geocodes >= MAX_GEOCODES) {
      skipped.push({
        label: draft.clientName,
        reason: 'Sin ubicación. Completá calle y altura para incluirlo.',
      });
      continue;
    }
    geocodes += 1;
    try {
      const hit = await geocodeAddress(draft.address);
      if (!hit) {
        skipped.push({ label: draft.clientName, reason: 'No pudimos ubicar la dirección.' });
        continue;
      }
      located.push({ ...draft, lat: hit.lat, lng: hit.lng });
    } catch {
      skipped.push({ label: draft.clientName, reason: 'El mapa no respondió para esta dirección.' });
    }
  }
  return { located, skipped };
}

interface DurationMatrix {
  durations: number[][];
  staticDurations: number[][];
  distances: number[][];
  live: boolean;
}

function emptyMatrix(n: number, points: LatLng[], multiplier: number): DurationMatrix {
  const durations = Array.from({ length: n }, () => Array<number>(n).fill(0));
  const staticDurations = Array.from({ length: n }, () => Array<number>(n).fill(0));
  const distances = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const meters = haversineMeters(points[i], points[j]) * 1.35;
      distances[i][j] = meters;
      staticDurations[i][j] = fallbackDriveSeconds(points[i], points[j], 1);
      durations[i][j] = fallbackDriveSeconds(points[i], points[j], multiplier);
    }
  }
  return { durations, staticDurations, distances, live: false };
}

function parseDurationSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const match = /^(-?\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function googleMatrix(points: LatLng[]): Promise<DurationMatrix | null> {
  const key = env.routing.googleMapsApiKey;
  if (!key) return null;
  const waypoint = (point: LatLng) => ({
    waypoint: { location: { latLng: { latitude: point.lat, longitude: point.lng } } },
  });
  try {
    const response = await fetchWithTimeout(
      'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,staticDuration,distanceMeters,condition',
        },
        body: JSON.stringify({
          origins: points.map(waypoint),
          destinations: points.map(waypoint),
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
        }),
      },
      12_000
    );
    if (!response.ok) {
      console.warn(`[route-plan] Google matrix respondió ${response.status}`);
      return null;
    }
    const text = (await response.text()).trim();
    if (!text) return null;
    let elements: unknown[] = [];
    if (text.startsWith('[')) {
      elements = JSON.parse(text) as unknown[];
    } else if (text.startsWith('{') && !text.includes('\n')) {
      const obj = JSON.parse(text) as unknown;
      if (isRecord(obj) && obj.error) return null;
      elements = [obj];
    } else {
      elements = text
        .split('\n')
        .map((line) => line.trim().replace(/,$/, ''))
        .filter((line) => line && line !== '[' && line !== ']')
        .map((line) => JSON.parse(line) as unknown);
    }

    const n = points.length;
    const matrix = emptyMatrix(n, points, 1);
    matrix.live = true;
    let filled = 0;
    for (const element of elements) {
      if (!isRecord(element)) continue;
      const i = Number(element.originIndex);
      const j = Number(element.destinationIndex);
      if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= n || j >= n) continue;
      if (element.condition && element.condition !== 'ROUTE_EXISTS') continue;
      const duration = parseDurationSeconds(element.duration);
      const staticDuration = parseDurationSeconds(element.staticDuration);
      const distance = Number(element.distanceMeters);
      if (duration == null) continue;
      matrix.durations[i][j] = Math.max(0, duration);
      matrix.staticDurations[i][j] = Math.max(0, staticDuration ?? duration);
      if (Number.isFinite(distance)) matrix.distances[i][j] = distance;
      filled += 1;
    }
    return filled >= n ? matrix : null;
  } catch (err) {
    console.warn('[route-plan] Google matrix falló:', err instanceof Error ? err.message : err);
    return null;
  }
}

function readTomTomMatrix(data: unknown, points: LatLng[]): DurationMatrix | null {
  if (!isRecord(data)) return null;
  const rows = Array.isArray(data.data) ? data.data : Array.isArray(data.matrix) ? data.matrix : null;
  if (!rows) return null;
  const n = points.length;
  const matrix = emptyMatrix(n, points, 1);
  matrix.live = true;
  let filled = 0;
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const i = Number(row.originIndex);
    const j = Number(row.destinationIndex);
    const summary = isRecord(row.routeSummary) ? row.routeSummary : row;
    if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= n || j >= n) continue;
    const duration = Number(summary.travelTimeInSeconds ?? summary.duration);
    const noTraffic = Number(summary.noTrafficTravelTimeInSeconds ?? summary.staticDuration);
    const distance = Number(summary.lengthInMeters ?? summary.distanceMeters);
    if (!Number.isFinite(duration)) continue;
    matrix.durations[i][j] = Math.max(0, duration);
    matrix.staticDurations[i][j] = Math.max(0, Number.isFinite(noTraffic) ? noTraffic : duration);
    if (Number.isFinite(distance)) matrix.distances[i][j] = distance;
    filled += 1;
  }
  return filled >= n ? matrix : null;
}

async function tomtomMatrix(points: LatLng[]): Promise<DurationMatrix | null> {
  const key = env.routing.tomtomApiKey;
  if (!key) return null;
  const body = {
    origins: points.map((point) => ({ point: { latitude: point.lat, longitude: point.lng } })),
    destinations: points.map((point) => ({ point: { latitude: point.lat, longitude: point.lng } })),
    options: { departAt: 'now', routeType: 'fastest', traffic: 'live', travelMode: 'car' },
  };
  try {
    const response = await fetchWithTimeout(
      `https://api.tomtom.com/routing/matrix/2?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      12_000
    );
    if (response.status === 202) {
      const payload = (await response.json().catch(() => ({}))) as { jobId?: string };
      const location = response.headers.get('location');
      const statusUrl = location
        ? new URL(location, 'https://api.tomtom.com').toString()
        : payload.jobId
          ? `https://api.tomtom.com/routing/matrix/2/${payload.jobId}?key=${encodeURIComponent(key)}`
          : null;
      if (!statusUrl) return null;
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        await sleep(700);
        const poll = await fetchWithTimeout(statusUrl, { method: 'GET' }, 8000);
        if (poll.status === 202 || poll.status === 404) continue;
        if (!poll.ok) return null;
        return readTomTomMatrix(await poll.json(), points);
      }
      return null;
    }
    if (!response.ok) {
      console.warn(`[route-plan] TomTom matrix respondió ${response.status}`);
      return null;
    }
    return readTomTomMatrix(await response.json(), points);
  } catch (err) {
    console.warn('[route-plan] TomTom matrix falló:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function osrmMatrix(points: LatLng[], multiplier: number): Promise<DurationMatrix | null> {
  const coords = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = `${env.routing.osrmUrl}/table/v1/driving/${coords}?annotations=duration,distance`;
  try {
    const response = await fetchWithTimeout(url, { method: 'GET' }, 12_000);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      code?: string;
      durations?: Array<Array<number | null>>;
      distances?: Array<Array<number | null>>;
    };
    if (data.code !== 'Ok' || !data.durations) return null;
    const n = points.length;
    const matrix = emptyMatrix(n, points, multiplier);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const duration = data.durations[i]?.[j];
        const distance = data.distances?.[i]?.[j];
        if (duration == null || !Number.isFinite(duration)) continue;
        matrix.staticDurations[i][j] = duration;
        matrix.durations[i][j] = duration * multiplier;
        if (distance != null && Number.isFinite(distance)) matrix.distances[i][j] = distance;
      }
    }
    return matrix;
  } catch (err) {
    console.warn('[route-plan] OSRM table falló:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function osrmLeg(points: LatLng[]): Promise<Leg | null> {
  if (points.length < 2) return null;
  const coords = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = `${env.routing.osrmUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  try {
    const response = await fetchWithTimeout(url, { method: 'GET' }, 12_000);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      code?: string;
      routes?: Array<{
        duration?: number;
        distance?: number;
        geometry?: { coordinates?: Array<[number, number]> };
        legs?: Array<{ duration?: number; distance?: number }>;
      }>;
    };
    const route = data.routes?.[0];
    const coordinates = route?.geometry?.coordinates;
    if (data.code !== 'Ok' || !route || !coordinates || coordinates.length < 2) return null;
    const legs = route.legs ?? [];
    const duration = legs.reduce((sum, leg) => sum + (leg.duration ?? 0), 0) || route.duration || 0;
    const distance = legs.reduce((sum, leg) => sum + (leg.distance ?? 0), 0) || route.distance || 0;
    return {
      durationSeconds: duration,
      staticSeconds: duration,
      distanceMeters: distance,
      points: coordinates.map(([lng, lat]) => ({ lat, lng })),
      avoidedClosure: points.length > 2,
    };
  } catch {
    return null;
  }
}

async function googleRoute(points: LatLng[]): Promise<{ legs: Leg[]; polyline: LatLng[]; alerts: RouteAlert[] } | null> {
  const key = env.routing.googleMapsApiKey;
  if (!key || points.length < 2) return null;
  const asLocation = (point: LatLng) => ({
    location: { latLng: { latitude: point.lat, longitude: point.lng } },
  });
  try {
    const response = await fetchWithTimeout(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask':
            'routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.staticDuration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline,routes.legs.travelAdvisory.speedReadingIntervals',
        },
        body: JSON.stringify({
          origin: asLocation(points[0]),
          destination: asLocation(points[points.length - 1]),
          intermediates: points.slice(1, -1).map(asLocation),
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          extraComputations: ['TRAFFIC_ON_POLYLINE'],
          polylineQuality: 'OVERVIEW',
          languageCode: 'es-AR',
          units: 'METRIC',
        }),
      },
      12_000
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      routes?: Array<{
        polyline?: { encodedPolyline?: string };
        legs?: Array<{
          duration?: string;
          staticDuration?: string;
          distanceMeters?: number;
          polyline?: { encodedPolyline?: string };
          travelAdvisory?: {
            speedReadingIntervals?: Array<{
              startPolylinePointIndex?: number;
              endPolylinePointIndex?: number;
              speed?: string;
            }>;
          };
        }>;
      }>;
    };
    const route = data.routes?.[0];
    if (!route?.legs?.length) return null;
    const legs: Leg[] = [];
    const alerts: RouteAlert[] = [];
    const polyline: LatLng[] = [];
    route.legs.forEach((leg, index) => {
      const pointsOfLeg = leg.polyline?.encodedPolyline ? decodePolyline(leg.polyline.encodedPolyline) : [];
      const duration = parseDurationSeconds(leg.duration) ?? 0;
      const staticDuration = parseDurationSeconds(leg.staticDuration) ?? duration;
      legs.push({
        durationSeconds: duration,
        staticSeconds: staticDuration,
        distanceMeters: Number(leg.distanceMeters) || 0,
        points: pointsOfLeg,
        avoidedClosure: false,
      });
      appendPolyline(polyline, pointsOfLeg);
      const intervals = leg.travelAdvisory?.speedReadingIntervals ?? [];
      for (const interval of intervals) {
        if (interval.speed !== 'TRAFFIC_JAM' && interval.speed !== 'SLOW') continue;
        const start = interval.startPolylinePointIndex ?? 0;
        const end = interval.endPolylinePointIndex ?? start;
        if (end - start < 3) continue;
        const sample = pointsOfLeg[Math.floor((start + end) / 2)];
        if (!sample) continue;
        alerts.push({
          id: `traffic-${index}-${start}`,
          kind: 'jam',
          lat: sample.lat,
          lng: sample.lng,
          title: interval.speed === 'TRAFFIC_JAM' ? 'Tránsito pesado' : 'Tránsito lento',
          description: 'Medido sobre el recorrido en este momento.',
          delaySeconds: Math.max(0, duration - staticDuration),
          source: 'traffic',
          expiresAt: null,
          mine: false,
          onPath: true,
        });
      }
    });
    if (polyline.length < 2 && route.polyline?.encodedPolyline) {
      polyline.push(...decodePolyline(route.polyline.encodedPolyline));
    }
    return { legs, polyline, alerts };
  } catch (err) {
    console.warn('[route-plan] Google route falló:', err instanceof Error ? err.message : err);
    return null;
  }
}

function appendPolyline(polyline: LatLng[], next: LatLng[]): void {
  if (next.length === 0) return;
  if (polyline.length > 0) {
    const last = polyline[polyline.length - 1];
    const first = next[0];
    if (Math.abs(last.lat - first.lat) < 1e-5 && Math.abs(last.lng - first.lng) < 1e-5) {
      polyline.pop();
    }
  }
  polyline.push(...next);
}

function straightLeg(a: LatLng, b: LatLng, multiplier: number): Leg {
  return {
    durationSeconds: fallbackDriveSeconds(a, b, multiplier),
    staticSeconds: fallbackDriveSeconds(a, b, 1),
    distanceMeters: haversineMeters(a, b),
    points: [a, b],
    avoidedClosure: false,
  };
}

async function geometryWithDetours(
  ordered: LatLng[],
  closures: LatLng[],
  multiplier: number
): Promise<{ legs: Leg[]; polyline: LatLng[] }> {
  const legs: Leg[] = [];
  let detours = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    const from = ordered[i];
    const to = ordered[i + 1];
    let leg = (await osrmLeg([from, to])) ?? straightLeg(from, to, multiplier);
    const blocking = closures.find((closure) => metersToSegment(closure, from, to) < 220);
    if (blocking && detours < 6) {
      detours += 1;
      const via = offsetAway(from, to, blocking, 750);
      const avoided = await osrmLeg([from, via, to]);
      if (avoided && metersToPolyline(blocking, avoided.points) > metersToPolyline(blocking, leg.points)) {
        leg = { ...avoided, avoidedClosure: true };
      }
    }
    legs.push(leg);
  }
  const polyline: LatLng[] = [];
  for (const leg of legs) appendPolyline(polyline, leg.points);
  return { legs, polyline };
}

export async function buildRoutePlan(user: User, origin: LatLng): Promise<RoutePlan> {
  if (user.role !== UserRole.REPARTIDOR || !user.agencyId) {
    throw new RoutePlanError('No tenés permiso para armar un recorrido.', 403);
  }
  const start = asPoint(origin.lat, origin.lng);
  if (!start) {
    throw new RoutePlanError('Necesitamos tu ubicación para armar el recorrido.', 400);
  }

  const drafts = await loadDrafts(user);
  if (drafts.length === 0) {
    throw new RoutePlanError('No tenés paquetes pendientes para recorrer.', 400);
  }

  const { located, skipped } = await locateDrafts(drafts);
  if (located.length === 0) {
    throw new RoutePlanError('Ningún paquete tiene una ubicación para armar el recorrido.', 400);
  }

  const ranked = located
    .map((stop) => ({ stop, distance: haversineMeters(start, stop) }))
    .sort((a, b) => a.distance - b.distance);
  const chosen = ranked.slice(0, MAX_STOPS).map((item) => item.stop);
  for (const extra of ranked.slice(MAX_STOPS)) {
    skipped.push({
      label: extra.stop.clientName,
      reason: `Quedó afuera: el recorrido arma hasta ${MAX_STOPS} paradas, las más cercanas primero.`,
    });
  }

  const points: LatLng[] = [start, ...chosen.map((stop) => ({ lat: stop.lat, lng: stop.lng }))];
  const multiplier = rushHourMultiplier();
  const liveMatrix = (await googleMatrix(points)) ?? (await tomtomMatrix(points));
  const baseMatrix = liveMatrix ?? (await osrmMatrix(points, multiplier)) ?? emptyMatrix(points.length, points, multiplier);

  const fleet = await listFleetAlerts(user);
  const external = await Promise.all([fetchTomTomAlerts(points), fetchGcbaAlerts(points)]);
  const nearby = alertsNear(dedupeAlerts([...fleet, ...external.flat()]), points, 4_000);
  const penalized = applyAlertPenalties(
    baseMatrix.durations,
    points,
    nearby.map((alert) => ({
      lat: alert.lat,
      lng: alert.lng,
      kind: alert.kind,
      delaySeconds: alert.delaySeconds,
    }))
  );
  const order = solveOpenTsp(penalized);
  const orderedPoints = order.map((index) => points[index]);
  const orderedStops = order.slice(1).map((index) => chosen[index - 1]);

  const closures = nearby.filter((alert) => alert.kind === 'closure');
  const google = liveMatrix?.live && env.routing.googleMapsApiKey ? await googleRoute(orderedPoints) : null;
  const drawn = google
    ? { legs: google.legs, polyline: google.polyline }
    : await geometryWithDetours(orderedPoints, closures, baseMatrix.live ? 1 : multiplier);

  const trafficAlerts = google?.alerts ?? [];
  const alerts = dedupeAlerts([...nearby, ...trafficAlerts])
    .map((alert) => ({
      ...alert,
      onPath: drawn.polyline.length > 1 && metersToPolyline(alert, drawn.polyline) < (alert.kind === 'closure' ? 220 : 380),
    }))
    .filter((alert) => alert.onPath || points.some((point) => haversineMeters(alert, point) < 1_500))
    .sort((a, b) => Number(b.onPath) - Number(a.onPath))
    .slice(0, 25);

  let elapsed = 0;
  let freeFlow = 0;
  let distance = 0;
  const stops: RouteStop[] = orderedStops.map((stop, index) => {
    const leg = drawn.legs[index];
    const from = order[index];
    const to = order[index + 1];
    const matrixDuration = baseMatrix.durations[from]?.[to] ?? 0;
    const matrixStatic = baseMatrix.staticDurations[from]?.[to] ?? matrixDuration;
    let legDuration = google ? leg?.durationSeconds || matrixDuration : matrixDuration;
    let legStatic = google ? leg?.staticSeconds || matrixStatic : matrixStatic;
    if (!google && leg?.avoidedClosure) {
      const detour = (leg.durationSeconds || 0) * (baseMatrix.live ? 1 : multiplier);
      if (detour > legDuration) legDuration = detour;
    }
    const legDistance = leg?.distanceMeters || baseMatrix.distances[from]?.[to] || 0;
    elapsed += legDuration;
    freeFlow += legStatic;
    distance += legDistance;
    return {
      id: stop.id,
      source: stop.source,
      clientName: stop.clientName,
      address: stop.address,
      lat: stop.lat,
      lng: stop.lng,
      sequence: index + 1,
      etaSeconds: Math.round(elapsed),
      legDurationSeconds: Math.round(legDuration),
      legDistanceMeters: Math.round(legDistance),
    };
  });

  const nearest = ranked[0]?.distance ?? 0;
  const trafficMode = baseMatrix.live ? 'live' : 'estimated';
  return {
    generatedAt: new Date().toISOString(),
    origin: start,
    stops,
    skipped,
    polyline: downsamplePolyline(drawn.polyline),
    totalDurationSeconds: Math.round(elapsed),
    totalDistanceMeters: Math.round(distance),
    freeFlowDurationSeconds: Math.round(freeFlow),
    trafficDelaySeconds: Math.max(0, Math.round(elapsed - freeFlow)),
    trafficMode,
    summary:
      trafficMode === 'live'
        ? 'Recorrido ordenado con el tránsito de ahora y las novedades de la zona.'
        : 'Recorrido ordenado con tiempos de calle, la hora pico de ahora y las novedades cercanas.',
    warning:
      nearest > 40_000
        ? 'Estás lejos de los paquetes. El tiempo incluye el viaje hasta la primera parada.'
        : null,
    alerts,
  };
}
