import type { User } from '../types';
import { resolveRepartidorLocation } from './liveFleet';

/** Tres heartbeats de 30 s. Igual que el panel web. */
const STALE_MS = 90_000;

export function isStaleLocation(timestamp?: string | null, now = Date.now()): boolean {
  if (!timestamp) return true;
  const at = new Date(timestamp).getTime();
  if (Number.isNaN(at)) return true;
  return now - at > STALE_MS;
}

/** GPS en vivo: la app del repartidor reportó ubicación hace menos de 90 s. */
export function isRepartidorGpsActive(rep: User, now = Date.now()): boolean {
  const loc = resolveRepartidorLocation(rep);
  return Boolean(loc && !isStaleLocation(loc.timestamp, now));
}
