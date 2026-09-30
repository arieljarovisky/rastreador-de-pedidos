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
type ExpoExtra = {
  apiBaseUrl?: string;
  cartoApiKey?: string;
};

const fromExtra =
  (Constants.expoConfig?.extra as ExpoExtra | undefined)?.apiBaseUrl ??
  (Constants.manifest2?.extra as ExpoExtra | undefined)?.apiBaseUrl;

export const API_BASE = (fromExtra ?? '').replace(/\/$/, '');

/** Misma key de tiles CARTO que la web. Va en app.json para que el build no dependa del .env local. */
const cartoFromExtra =
  (Constants.expoConfig?.extra as ExpoExtra | undefined)?.cartoApiKey ??
  (Constants.manifest2?.extra as ExpoExtra | undefined)?.cartoApiKey;

export const CARTO_API_KEY =
  process.env.EXPO_PUBLIC_CARTO_API_KEY?.trim() || cartoFromExtra?.trim() || '';

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${normalized}` : normalized;
}

/** URL para el socket de tiempo real (mismo host que la API). */
export function socketUrl(): string {
  return API_BASE;
}

/** Frecuencia mínima entre reportes rápidos al moverse (ms). */
export const GPS_THROTTLE_MS = 2000;

/** Heartbeat GPS aunque el repartidor esté parado (ms). Debe ser < umbral "stale" del mapa web (~90s). */
export const GPS_HEARTBEAT_MS = 30_000;

/** Polling de respaldo si el socket está caído (ms). */
export const POLL_INTERVAL_MS = 20_000;

/** Con el socket conectado no hace falta re-bajar todos los pedidos seguido. */
export const POLL_INTERVAL_CONNECTED_MS = 180_000;

/** Repartidor: sincroniza escaneos Flex con más frecuencia (ms). */
export const REPARTIDOR_FLEX_POLL_MS = 10_000;
