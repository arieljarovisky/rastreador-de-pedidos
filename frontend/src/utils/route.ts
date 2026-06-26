const routeCache = new Map<string, [number, number][]>();

/** Ruta por calles vía OSRM (fallback: línea directa) */
export async function fetchDrivingRoute(
  from: [number, number],
  to: [number, number]
): Promise<[number, number][]> {
  const key = `${from[0].toFixed(4)},${from[1].toFixed(4)}-${to[0].toFixed(4)},${to[1].toFixed(4)}`;
  const cached = routeCache.get(key);
  if (cached) return cached;

  const [fromLat, fromLng] = from;
  const [toLat, toLng] = to;
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('routing failed');
    const data = (await res.json()) as {
      code?: string;
      routes?: { geometry?: { coordinates?: [number, number][] } }[];
    };
    const coords = data.routes?.[0]?.geometry?.coordinates;
    if (data.code === 'Ok' && coords && coords.length >= 2) {
      const path = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
      routeCache.set(key, path);
      return path;
    }
  } catch {
    // fallback abajo
  }

  const fallback: [number, number][] = [from, to];
  routeCache.set(key, fallback);
  return fallback;
}
