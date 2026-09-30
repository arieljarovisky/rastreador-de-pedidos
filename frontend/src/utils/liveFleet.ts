import { useSyncExternalStore } from 'react';
import type { User, UserLocation } from '../types.js';

/**
 * Posiciones GPS en vivo, fuera del estado de React.
 * Un punto nuevo solo avisa al mapa (y al puntito de la flota), no a la lista de pedidos.
 */
type FleetSnapshot = {
  version: number;
  byKey: Map<string, UserLocation>;
};

let snapshot: FleetSnapshot = { version: 0, byKey: new Map() };
const listeners = new Set<() => void>();

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function emit(): void {
  snapshot = { version: snapshot.version + 1, byKey: snapshot.byKey };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion(): number {
  return snapshot.version;
}

export function publishLiveRepartidor(repartidorId: string, location: UserLocation): void {
  const key = normalizeKey(repartidorId);
  if (!key || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return;

  const prev = snapshot.byKey.get(key);
  if (
    prev &&
    prev.lat === location.lat &&
    prev.lng === location.lng &&
    prev.timestamp === location.timestamp
  ) {
    return;
  }

  snapshot.byKey.set(key, location);
  emit();
}

export function clearLiveFleet(): void {
  if (snapshot.byKey.size === 0) return;
  snapshot.byKey = new Map();
  emit();
}

function locationTimestampMs(location?: UserLocation | null): number {
  if (!location?.timestamp) return 0;
  const at = new Date(location.timestamp).getTime();
  return Number.isNaN(at) ? 0 : at;
}

function pickFresher(a?: UserLocation, b?: UserLocation): UserLocation | undefined {
  if (!a) return b;
  if (!b) return a;
  return locationTimestampMs(b) >= locationTimestampMs(a) ? b : a;
}

function lookupLive(identity: string | null | undefined): UserLocation | undefined {
  if (!identity) return undefined;
  return snapshot.byKey.get(normalizeKey(identity));
}

/** GPS en vivo si es más reciente que el que vino en la lista de repartidores. */
export function resolveRepartidorLocation(rep: User): UserLocation | undefined {
  const live = lookupLive(rep.id) ?? lookupLive(rep.username);
  return pickFresher(rep.currentLocation, live);
}

export function useLiveFleetVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
