export interface LatLng {
  lat: number;
  lng: number;
}

export type RouteAlertKind = 'accident' | 'closure' | 'jam' | 'hazard' | 'construction';

export interface PenaltyAlert extends LatLng {
  kind: RouteAlertKind;
  delaySeconds: number;
}

const EARTH_M = 6_371_000;
const MAX_EXACT_NODES = 13;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Segundos de manejo urbano si no hay grafo de calles. */
export function fallbackDriveSeconds(a: LatLng, b: LatLng, multiplier = 1): number {
  const meters = haversineMeters(a, b) * 1.35;
  const base = meters / (22_000 / 3600);
  return Math.max(45, base * multiplier);
}

export function metersToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const lat0 = (a.lat + b.lat) / 2;
  const cos = Math.cos((lat0 * Math.PI) / 180) || 1;
  const ax = a.lng * cos;
  const ay = a.lat;
  const bx = b.lng * cos;
  const by = b.lat;
  const px = p.lng * cos;
  const py = p.lat;
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  let t = 0;
  if (ab2 > 0) {
    t = ((px - ax) * abx + (py - ay) * aby) / ab2;
    t = Math.max(0, Math.min(1, t));
  }
  const closest = { lat: ay + aby * t, lng: (ax + abx * t) / cos };
  return haversineMeters(p, closest);
}

export function metersToPolyline(p: LatLng, line: LatLng[]): number {
  if (line.length === 0) return Number.POSITIVE_INFINITY;
  if (line.length === 1) return haversineMeters(p, line[0]);
  let best = Number.POSITIVE_INFINITY;
  const step = Math.max(1, Math.floor(line.length / 180));
  for (let i = 0; i < line.length - 1; i += step) {
    const j = Math.min(line.length - 1, i + step);
    best = Math.min(best, metersToSegment(p, line[i], line[j]));
  }
  return best;
}

/** Punto intermedio desplazado para rodear un corte. */
export function offsetAway(a: LatLng, b: LatLng, obstacle: LatLng, meters: number): LatLng {
  const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  const cos = Math.cos((mid.lat * Math.PI) / 180) || 1;
  const dx = (b.lng - a.lng) * cos;
  const dy = b.lat - a.lat;
  const len = Math.hypot(dx, dy) || 1;
  let px = -dy / len;
  let py = dx / len;
  const ox = (obstacle.lng - mid.lng) * cos;
  const oy = obstacle.lat - mid.lat;
  if (px * ox + py * oy > 0) {
    px = -px;
    py = -py;
  }
  return {
    lat: mid.lat + (meters / 111_320) * py,
    lng: mid.lng + (meters / (111_320 * cos)) * px,
  };
}

/**
 * Factor de congestión típica de AMBA cuando no hay un proveedor de tránsito en vivo.
 * No reemplaza un dato en tiempo real: se combina con las novedades reportadas.
 */
export function rushHourMultiplier(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon';
  let hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '12');
  if (hour === 24) hour = 0;

  if (weekday === 'Sun') {
    if (hour >= 18 && hour <= 21) return 1.25;
    return 1;
  }
  if (weekday === 'Sat') {
    if (hour >= 11 && hour <= 14) return 1.2;
    if (hour >= 18 && hour <= 21) return 1.28;
    return 1.05;
  }
  if (hour >= 7 && hour < 10) return 1.5;
  if (hour >= 17 && hour < 20) return 1.65;
  if (hour >= 12 && hour < 14) return 1.2;
  if (hour >= 10 && hour < 17) return 1.12;
  if (hour >= 20 && hour < 22) return 1.22;
  return 0.95;
}

const INFLUENCE: Record<RouteAlertKind, { radius: number; base: number }> = {
  closure: { radius: 520, base: 1500 },
  accident: { radius: 380, base: 600 },
  jam: { radius: 450, base: 420 },
  construction: { radius: 320, base: 360 },
  hazard: { radius: 220, base: 150 },
};

/** Suma demora a cada tramo que pasa cerca de un corte, choque o congestión. */
export function applyAlertPenalties(
  matrix: number[][],
  points: LatLng[],
  alerts: PenaltyAlert[]
): number[][] {
  const next = matrix.map((row) => row.slice());
  if (alerts.length === 0) return next;

  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      let extra = 0;
      for (const alert of alerts) {
        const spec = INFLUENCE[alert.kind];
        const distance = metersToSegment(alert, points[i], points[j]);
        if (distance > spec.radius) continue;
        const falloff = 1 - distance / spec.radius;
        const base = Math.max(spec.base, alert.delaySeconds || 0);
        extra += base * falloff;
      }
      if (extra > 0) next[i][j] += Math.min(2700, extra);
    }
  }
  return next;
}

function pathCost(order: number[], matrix: number[][]): number {
  let cost = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const edge = matrix[order[i]]?.[order[i + 1]];
    cost += Number.isFinite(edge) ? edge : 1e9;
  }
  return cost;
}

function nearestNeighbor(matrix: number[][]): number[] {
  const n = matrix.length;
  const used = new Set<number>([0]);
  const order = [0];
  while (order.length < n) {
    const last = order[order.length - 1];
    let best = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let j = 1; j < n; j++) {
      if (used.has(j)) continue;
      const cost = matrix[last]?.[j];
      const value = Number.isFinite(cost) ? cost : 1e9;
      if (value < bestCost) {
        bestCost = value;
        best = j;
      }
    }
    if (best < 0) break;
    used.add(best);
    order.push(best);
  }
  return order;
}

function improve2Opt(order: number[], matrix: number[][]): number[] {
  let best = order.slice();
  let improved = true;
  let guard = 0;
  while (improved && guard < 48) {
    improved = false;
    guard += 1;
    for (let i = 1; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = best.slice();
        const reversed = candidate.slice(i, k + 1).reverse();
        candidate.splice(i, reversed.length, ...reversed);
        if (pathCost(candidate, matrix) + 1e-6 < pathCost(best, matrix)) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  return best;
}

function exactOpenTsp(matrix: number[][]): number[] {
  const n = matrix.length;
  const size = 1 << n;
  const inf = Number.POSITIVE_INFINITY;
  const dp = Array.from({ length: size }, () => Array<number>(n).fill(inf));
  const parent = Array.from({ length: size }, () => Array<number>(n).fill(-1));
  dp[1][0] = 0;

  for (let mask = 1; mask < size; mask++) {
    if ((mask & 1) === 0) continue;
    for (let last = 0; last < n; last++) {
      if ((mask & (1 << last)) === 0) continue;
      const cost = dp[mask][last];
      if (!Number.isFinite(cost)) continue;
      for (let next = 1; next < n; next++) {
        if (mask & (1 << next)) continue;
        const edge = matrix[last][next];
        if (!Number.isFinite(edge)) continue;
        const nextMask = mask | (1 << next);
        const candidate = cost + edge;
        if (candidate < dp[nextMask][next]) {
          dp[nextMask][next] = candidate;
          parent[nextMask][next] = last;
        }
      }
    }
  }

  const full = size - 1;
  let bestEnd = -1;
  let best = inf;
  for (let end = 1; end < n; end++) {
    if (dp[full][end] < best) {
      best = dp[full][end];
      bestEnd = end;
    }
  }
  if (bestEnd < 0 || !Number.isFinite(best)) return nearestNeighbor(matrix);

  const reversed: number[] = [];
  let mask = full;
  let current = bestEnd;
  while (current >= 0 && reversed.length <= n) {
    reversed.push(current);
    const prev = parent[mask][current];
    mask &= ~(1 << current);
    current = prev;
  }
  reversed.reverse();
  if (reversed[0] !== 0 || reversed.length !== n) return nearestNeighbor(matrix);
  return reversed;
}

/** TSP abierto: arranca en el índice 0 (ubicación del repartidor) y no vuelve al origen. */
export function solveOpenTsp(matrix: number[][]): number[] {
  const n = matrix.length;
  if (n <= 1) return [0];
  if (n === 2) return [0, 1];
  if (n <= MAX_EXACT_NODES) return exactOpenTsp(matrix);
  return improve2Opt(nearestNeighbor(matrix), matrix);
}

export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export function downsamplePolyline(points: LatLng[], maxPoints = 350): LatLng[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled: LatLng[] = [];
  for (let i = 0; i < points.length; i += step) sampled.push(points[i]);
  const last = points[points.length - 1];
  const tail = sampled[sampled.length - 1];
  if (!tail || tail.lat !== last.lat || tail.lng !== last.lng) sampled.push(last);
  return sampled;
}
