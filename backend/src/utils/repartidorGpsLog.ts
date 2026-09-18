interface GpsLogUser {
  id: string;
  username?: string;
  name?: string;
}

function isEnabled(): boolean {
  // Opt-in: el hot path GPS no debe loguear salvo debug explícito.
  const raw = process.env.REPARTIDOR_GPS_LOG?.trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

function matchesFilter(user: GpsLogUser): boolean {
  const filter = process.env.REPARTIDOR_GPS_LOG_FILTER?.trim().toLowerCase();
  if (!filter) return true;
  const haystack = [user.id, user.username, user.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(filter);
}

/** Log estructurado de peticiones GPS de repartidores (visible en Railway → Deploy Logs). */
export function logRepartidorGps(
  kind: string,
  user: GpsLogUser,
  details: Record<string, unknown> = {}
): void {
  if (!isEnabled() || !matchesFilter(user)) return;

  const payload = {
    at: new Date().toISOString(),
    kind,
    repartidorId: user.id,
    username: user.username ?? null,
    name: user.name ?? null,
    ...details,
  };

  console.log(`[GPS] ${JSON.stringify(payload)}`);
}
