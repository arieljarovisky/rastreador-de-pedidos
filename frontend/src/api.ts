const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${normalized}` : normalized;
}

/** Origen web para volver tras OAuth ML/TN al mismo dominio donde hay sesión. */
export function oauthReturnOriginQuery(): string {
  return `return_origin=${encodeURIComponent(window.location.origin)}`;
}

export function socketUrl(): string {
  return API_BASE || window.location.origin;
}

type FetchOrdersOptions = {
  includeArchived?: boolean;
  /** Tamaño de página al recorrer el historial. */
  pageSize?: number;
  signal?: AbortSignal;
};

/**
 * Trae todos los pedidos del usuario paginando el API (sin tope artificial de 200).
 * Usar includeArchived en vistas de historial (Registro).
 */
export async function fetchAllOrders(
  token: string,
  opts: FetchOrdersOptions = {}
): Promise<unknown[]> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 500, 1), 5000);
  const headers = { Authorization: `Bearer ${token}` };
  const all: unknown[] = [];
  let offset = 0;

  for (;;) {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (opts.includeArchived) params.set('includeArchived', '1');

    const res = await fetch(apiUrl(`/api/orders?${params}`), {
      headers,
      signal: opts.signal,
    });
    if (!res.ok) {
      throw new Error('No se pudieron cargar los pedidos');
    }
    const data = await res.json();
    const batch: unknown[] = Array.isArray(data) ? data : data.orders ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}
