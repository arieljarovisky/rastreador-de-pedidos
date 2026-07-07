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
