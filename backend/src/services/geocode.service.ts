import { ambaPointForPlaceName, ambaPointForPostalCode } from '../config/amba-postal-codes.js';
import { sleep } from '../utils/sleep.js';

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export interface ImportCoordinates {
  lat: number;
  lng: number;
  /** true si no salió de Nominatim (CP, barrio o CABA). */
  approximate: boolean;
}

export const APPROX_LOCATION_NOTE =
  'Ubicación aproximada: el mapa no reconoció la dirección exacta.';

export function withApproxLocationNote(notes: string, approximate: boolean): string {
  if (!approximate) return notes;
  if (notes.includes('Ubicación aproximada')) return notes;
  return notes ? `${notes} · ${APPROX_LOCATION_NOTE}` : APPROX_LOCATION_NOTE;
}

export function withApproxHistoryComment(
  comment: string | undefined,
  approximate: boolean
): string | undefined {
  if (!approximate) return comment;
  if (!comment) return APPROX_LOCATION_NOTE;
  if (comment.includes('Ubicación aproximada')) return comment;
  return `${comment} · ${APPROX_LOCATION_NOTE}`;
}

/** Centro de San Nicolás / microcentro, último recurso para no bloquear un import. */
const CABA_FALLBACK = ambaPointForPlaceName('caba') ?? {
  lat: -34.605,
  lng: -58.375,
};

/** AMBA completo (CABA + 3 cordones). Formato Nominatim: minLon,maxLat,maxLon,minLat */
const AMBA_VIEWBOX = '-59.20,-34.00,-57.85,-35.10';
/** Nominatim exige ~1 solicitud por segundo. */
const NOMINATIM_MIN_INTERVAL_MS = 1100;

let nominatimQueue: Promise<void> = Promise.resolve();
let lastNominatimAt = 0;

function scheduleNominatimRequest<T>(fn: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const wait = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastNominatimAt);
    if (wait > 0) await sleep(wait);
    lastNominatimAt = Date.now();
    return fn();
  });
  nominatimQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const query = trimmed.toLowerCase().includes('argentina')
    ? trimmed
    : `${trimmed}, Buenos Aires, Argentina`;

  const bounded = await nominatimSearch(query, true);
  if (bounded) return bounded;

  const unbounded = await nominatimSearch(query, false);
  if (unbounded) return unbounded;

  const cityOnly = trimmed
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(-3)
    .join(', ');
  if (cityOnly && cityOnly !== trimmed) {
    return nominatimSearch(`${cityOnly}, Argentina`, false);
  }

  return null;
}

export function hasValidCoordinates(lat?: number | null, lng?: number | null): boolean {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * Coordenadas para importar un pedido: Nominatim si responde, si no CP/barrio AMBA,
 * y si tampoco, un punto en CABA. Nunca tira: un envío no debe quedar reintentando
 * cada 5 minutos porque el mapa no reconoció la dirección.
 */
export async function resolveImportCoordinates(
  address: string,
  existing?: { lat?: number | null; lng?: number | null }
): Promise<ImportCoordinates> {
  const existingLat = existing?.lat;
  const existingLng = existing?.lng;
  if (hasValidCoordinates(existingLat, existingLng) && existingLat != null && existingLng != null) {
    return { lat: existingLat, lng: existingLng, approximate: false };
  }

  try {
    const geocoded = await geocodeAddress(address);
    if (geocoded) {
      return { lat: geocoded.lat, lng: geocoded.lng, approximate: false };
    }
  } catch (err) {
    console.warn('[geocode] Nominatim no disponible, usando fallback', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const amba = ambaFallbackFromAddress(address);
  if (amba) return { ...amba, approximate: true };

  return { lat: CABA_FALLBACK.lat, lng: CABA_FALLBACK.lng, approximate: true };
}

const CPA_RE = /\b[A-Z]\d{4}[A-Z]{3}\b/i;

function ambaFallbackFromAddress(address: string): { lat: number; lng: number } | null {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const cpa = trimmed.match(CPA_RE);
  if (cpa) {
    const digits = cpa[0].replace(/\D/g, '').slice(0, 4);
    const point = ambaPointForPostalCode(digits);
    if (point) return { lat: point.lat, lng: point.lng };
  }

  const parts = trimmed
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  // El número de calle suele estar en el primer tramo; el CP al final.
  for (let i = parts.length - 1; i >= 1; i--) {
    const matches = parts[i].match(/\b(\d{4})\b/g);
    if (!matches) continue;
    for (const match of matches) {
      const point = ambaPointForPostalCode(match);
      if (point) return { lat: point.lat, lng: point.lng };
    }
  }

  for (const part of parts) {
    const point = ambaPointForPlaceName(part);
    if (point) return { lat: point.lat, lng: point.lng };
  }

  return null;
}

async function nominatimSearch(query: string, bounded: boolean): Promise<GeocodeResult | null> {
  return scheduleNominatimRequest(async () => {
    const params = new URLSearchParams({
      format: 'json',
      q: query,
      limit: '1',
      countrycodes: 'ar',
    });
    if (bounded) {
      params.set('viewbox', AMBA_VIEWBOX);
      params.set('bounded', '1');
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: {
          'User-Agent': 'LupoEnvios/1.0 (rastreador-de-pedidos)',
          'Accept-Language': 'es',
        },
      });

      if (response.status === 429 || response.status === 503) {
        await sleep(1500 * (attempt + 1));
        continue;
      }

      if (!response.ok) {
        throw new Error('GEOCODE_UNAVAILABLE');
      }

      const results = (await response.json()) as NominatimResult[];
      const hit = results[0];
      if (!hit) return null;

      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return {
        lat,
        lng,
        displayName: hit.display_name,
      };
    }

    throw new Error('GEOCODE_UNAVAILABLE');
  });
}
