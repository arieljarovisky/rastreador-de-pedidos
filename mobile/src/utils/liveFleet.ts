import { useSyncExternalStore } from 'react';
import type { User, UserLocation } from '../types';

/**
 * GPS en vivo, fuera del estado de React.
 * Un punto nuevo mueve el mapa y no vuelve a renderizar las listas de pedidos.
 */
let version = 0;
const byKey = new Map<string, UserLocation>();
const listeners = new Set<() => void>();

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion(): number {
  return version;
}

export function publishLiveRepartidor(repartidorId: string, location: UserLocation): void {
  const key = normalizeKey(repartidorId);
  if (!key || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return;

  const prev = byKey.get(key);
  if (
    prev &&
    prev.lat === location.lat &&
    prev.lng === location.lng &&
    prev.timestamp === location.timestamp
  ) {
    return;
  }

  byKey.set(key, location);
  emit();
}

export function clearLiveFleet(): void {
  if (byKey.size === 0) return;
  byKey.clear();
  emit();
}

export function readLiveLocation(identity: string | null | undefined): UserLocation | undefined {
  if (!identity) return undefined;
  return byKey.get(normalizeKey(identity));
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

export function resolveRepartidorLocation(rep: User): UserLocation | undefined {
  const live = readLiveLocation(rep.id) ?? readLiveLocation(rep.username);
  return pickFresher(rep.currentLocation, live);
}

export function useLiveFleetVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
