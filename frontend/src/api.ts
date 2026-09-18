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
  pageSize?: number;
  signal?: AbortSignal;
};

export type OrdersRegistryStats = {
  total: number;
  pending: number;
  delivering: number;
  delivered: number;
  cancelled: number;
  archived: number;
};

export type OrdersRegistryPage = {
  items: unknown[];
  total: number;
  stats: OrdersRegistryStats;
};

export type FetchRegistryOptions = {
  limit?: number;
  offset?: number;
  sellerId?: string;
  externalSource?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  signal?: AbortSignal;
};

/** Página de Registro: items + COUNT total + stats agregados. */
export async function fetchOrdersRegistry(
  token: string,
  opts: FetchRegistryOptions = {}
): Promise<OrdersRegistryPage> {
  const params = new URLSearchParams({
    limit: String(opts.limit ?? 25),
    offset: String(opts.offset ?? 0),
  });
  if (opts.sellerId) params.set('sellerId', opts.sellerId);
  if (opts.externalSource) params.set('externalSource', opts.externalSource);
  if (opts.status && opts.status !== 'all') params.set('status', opts.status);
  if (opts.dateFrom) params.set('dateFrom', opts.dateFrom);
  if (opts.dateTo) params.set('dateTo', opts.dateTo);
  if (opts.q?.trim()) params.set('q', opts.q.trim());

  const res = await fetch(apiUrl(`/api/orders/registry?${params}`), {
    headers: { Authorization: `Bearer ${token}` },
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error('No se pudieron cargar los pedidos del registro');
  }
  const data = await res.json();
  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: Number(data.total ?? 0),
    stats: {
      total: Number(data.stats?.total ?? 0),
      pending: Number(data.stats?.pending ?? 0),
      delivering: Number(data.stats?.delivering ?? 0),
      delivered: Number(data.stats?.delivered ?? 0),
      cancelled: Number(data.stats?.cancelled ?? 0),
      archived: Number(data.stats?.archived ?? 0),
    },
  };
}

/**
 * Trae pedidos paginando el API (uso operativo / sync).
 * Preferí fetchOrdersRegistry en vistas de historial.
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
