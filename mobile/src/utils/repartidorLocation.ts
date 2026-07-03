import { User, UserLocation, UserRole } from '../types';

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

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function isUuidLike(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function repartidorIdentityKeys(rep: User): string[] {
  const id = normalizeKey(rep.id);
  const username = normalizeKey(rep.username);
  const keys = new Set<string>([`id:${id}`, `user:${username}`]);
  if (id !== username) {
    keys.add(`id:${username}`);
    keys.add(`user:${id}`);
  }
  return [...keys];
}

function preferredRepartidorId(a: User, b: User): string {
  if (isUuidLike(a.id) && !isUuidLike(b.id)) return a.id;
  if (isUuidLike(b.id) && !isUuidLike(a.id)) return b.id;
  if (a.username !== a.id && b.username === b.id) return a.id;
  if (b.username !== b.id && a.username === a.id) return b.id;
  return a.id.length >= b.id.length ? a.id : b.id;
}

/** Elimina repartidores duplicados (mismo id, username o alias cruzado). Conserva el GPS más reciente. */
export function dedupeRepartidores(reps: User[]): User[] {
  if (reps.length <= 1) return reps;

  const parent = reps.map((_, index) => index);

  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]];
      root = parent[root];
    }
    return root;
  };

  const unite = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  const keyToIndex = new Map<string, number>();

  reps.forEach((rep, index) => {
    for (const key of repartidorIdentityKeys(rep)) {
      const existing = keyToIndex.get(key);
      if (existing !== undefined) unite(existing, index);
      keyToIndex.set(key, index);
    }
  });

  const groups = new Map<number, User[]>();
  reps.forEach((rep, index) => {
    const root = find(index);
    const list = groups.get(root) ?? [];
    list.push(rep);
    groups.set(root, list);
  });

  return [...groups.values()].map((group) =>
    group.reduce<User>((acc, rep) => {
      if (!acc) return { ...rep };
      const merged = mergeUserFields(acc, rep);
      merged.id = preferredRepartidorId(acc, rep);
      return merged;
    }, group[0])
  );
}

export function repartidorIdentityMatches(rep: User, identity: string): boolean {
  const needle = normalizeKey(identity);
  return normalizeKey(rep.id) === needle || normalizeKey(rep.username) === needle;
}

export function repartidorMarkerKey(rep: User): string {
  return normalizeKey(rep.id);
}

export function findRepartidorByIdentity(reps: User[], identity: string): User | undefined {
  const needle = normalizeKey(identity);
  return reps.find(
    (r) => normalizeKey(r.id) === needle || normalizeKey(r.username) === needle
  );
}

function findRepartidorIndex(reps: User[], repartidorId: string): number {
  return reps.findIndex((r) => repartidorIdentityMatches(r, repartidorId));
}

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

function findLocalRepartidor(prev: User[], remote: User): User | undefined {
  const remoteKeys = [normalizeKey(remote.id), normalizeKey(remote.username)];
  return prev.find(
    (p) =>
      remoteKeys.includes(normalizeKey(p.id)) ||
      remoteKeys.includes(normalizeKey(p.username))
  );
}

export function mergeRepartidoresFromServer(prev: User[], server: User[]): User[] {
  const merged = server.map((remote) => {
    const local = findLocalRepartidor(prev, remote);
    if (!local) return remote;
    const combined = mergeUserFields(remote, local);
    combined.id = preferredRepartidorId(remote, local);
    return combined;
  });

  const mergedKeys = new Set(
    merged.flatMap((r) => [normalizeKey(r.id), normalizeKey(r.username)])
  );

  const liveOnly = prev.filter(
    (p) =>
      p.currentLocation &&
      !mergedKeys.has(normalizeKey(p.id)) &&
      !mergedKeys.has(normalizeKey(p.username))
  );

  return dedupeRepartidores([...merged, ...liveOnly]);
}
