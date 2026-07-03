import { User, UserLocation, UserRole } from '../types.js';

function locationTimestampMs(location?: UserLocation | null): number {
  if (!location?.timestamp) return 0;
  const at = new Date(location.timestamp).getTime();
  return Number.isNaN(at) ? 0 : at;
}

function pickFresherLocation(a?: UserLocation, b?: UserLocation): UserLocation | undefined {
  if (!a) return b;
  if (!b) return a;
  return locationTimestampMs(b) >= locationTimestampMs(a) ? b : a;
}

function mergeUserFields(base: User, incoming: User): User {
  return {
    ...base,
    ...incoming,
    name: incoming.name?.trim() || base.name,
    currentLocation: pickFresherLocation(base.currentLocation, incoming.currentLocation),
  };
}

/** Elimina repartidores duplicados (mismo id o mismo username). Conserva el GPS más reciente. */
export function dedupeRepartidores(reps: User[]): User[] {
  const byUsername = new Map<string, User>();

  for (const rep of reps) {
    const usernameKey = rep.username.trim().toLowerCase();
    const idKey = rep.id.trim().toLowerCase();
    const keys = new Set([usernameKey, idKey]);

    let merged: User | null = null;
    for (const key of keys) {
      const existing = byUsername.get(key);
      if (!existing) continue;
      merged = mergeUserFields(existing, rep);
      for (const oldKey of [existing.username.toLowerCase(), existing.id.toLowerCase()]) {
        byUsername.delete(oldKey);
      }
      break;
    }

    const next = merged ?? rep;
    for (const key of keys) {
      byUsername.set(key, next);
    }
  }

  const unique = new Map<string, User>();
  for (const rep of byUsername.values()) {
    unique.set(rep.id, rep);
  }
  return [...unique.values()];
}

function findRepartidorIndex(reps: User[], repartidorId: string): number {
  const needle = repartidorId.trim().toLowerCase();
  return reps.findIndex(
    (r) => r.id.toLowerCase() === needle || r.username.toLowerCase() === needle
  );
}

/** Actualiza la posición de flota de un repartidor (crea entrada mínima si falta). */
export function mergeRepartidorLocation(
  prev: User[],
  repartidorId: string,
  location: UserLocation,
  name?: string | null
): User[] {
  const idx = findRepartidorIndex(prev, repartidorId);
  if (idx === -1) {
    return dedupeRepartidores([
      ...prev,
      {
        id: repartidorId,
        username: repartidorId,
        name: name?.trim() || 'Repartidor',
        role: UserRole.REPARTIDOR,
        currentLocation: location,
      },
    ]);
  }

  const next = prev.map((rep, i) =>
    i === idx
      ? {
          ...rep,
          name: name?.trim() || rep.name,
          currentLocation: pickFresherLocation(rep.currentLocation, location) ?? location,
        }
      : rep
  );
  return dedupeRepartidores(next);
}

/** Fusiona lista del servidor con estado local sin perder GPS en vivo ni crear duplicados. */
export function mergeRepartidoresFromServer(prev: User[], server: User[]): User[] {
  const prevById = new Map(prev.map((r) => [r.id, r]));
  const prevByUsername = new Map(prev.map((r) => [r.username.toLowerCase(), r]));

  const merged = server.map((remote) => {
    const local =
      prevById.get(remote.id) ?? prevByUsername.get(remote.username.toLowerCase());
    if (!local) return remote;
    return mergeUserFields(remote, local);
  });

  return dedupeRepartidores(merged);
}
