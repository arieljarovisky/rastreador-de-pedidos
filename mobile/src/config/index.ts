import Constants from 'expo-constants';

/**
 * URL base del backend de LupoEnvios.
 *
 * Se lee desde app.json -> expo.extra.apiBaseUrl.
 * En desarrollo con tu PC, podés apuntar a tu IP local, por ejemplo:
 *   "http://192.168.0.10:4000"
 * (no uses "localhost" desde un teléfono físico: no resuelve a tu PC).
 *
 * En producción, usá la URL pública de tu backend en Railway.
 */
const fromExtra =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  (Constants.manifest2?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;

export const API_BASE = (fromExtra ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${normalized}` : normalized;
}

/** URL para el socket de tiempo real (mismo host que la API). */
export function socketUrl(): string {
  return API_BASE;
}

/** Frecuencia mínima entre reportes de GPS (ms), igual que la web. */
export const GPS_THROTTLE_MS = 2000;

/** Cada cuánto se refrescan los pedidos por polling de respaldo (ms). */
export const POLL_INTERVAL_MS = 8000;
