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

/** Quita el aviso de ubicación aproximada cuando el geocoder ya resolvió bien. */
export function stripApproxLocationNote(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const cleaned = notes
    .replace(/\s*·\s*Ubicación aproximada:[^.]*\./gi, '')
    .replace(/Ubicación aproximada:[^.]*\.\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s·\s*$/g, '')
    .trim();
  return cleaned || null;
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

/** Centro de San Nicolás / microcentro, último recurso solo para direcciones AMBA. */
const CABA_FALLBACK = ambaPointForPlaceName('caba') ?? {
  lat: -34.605,
  lng: -58.375,
};

/**
 * Punto fuera del AMBA para no clavar en CABA un envío del interior
 * cuando Nominatim no responde (p. ej. Pigüé / CP 8170).
 * Queda fuera de los polígonos de pricing → tarifa 3° cordón.
 */
const INTERIOR_AR_FALLBACK = { lat: -37.6, lng: -64.0 };

/** AMBA completo (CABA + 3 cordones). Formato Nominatim: minLon,maxLat,maxLon,minLat */
const AMBA_VIEWBOX = '-59.20,-34.00,-57.85,-35.10';
/** Nominatim exige ~1 solicitud por segundo. */
const NOMINATIM_MIN_INTERVAL_MS = 1100;

const CPA_RE = /\b[A-Z]\d{4}[A-Z]{3}\b/i;
const POSTAL_DIGITS_RE = /\b(\d{4})\b/g;

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

function splitAddressParts(address: string): string[] {
  return address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Extrae el CP argentino de 4 dígitos (CPA o numérico) si aparece en la dirección. */
export function extractArgentinePostalDigits(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const cpa = trimmed.match(CPA_RE);
  if (cpa) {
    const digits = cpa[0].replace(/\D/g, '').slice(0, 4);
    if (digits.length === 4) return digits;
  }

  const parts = splitAddressParts(trimmed);
  // Preferir tramos finales (el CP suele ir al final; la altura de calle al inicio).
  for (let i = parts.length - 1; i >= 0; i--) {
    if (i === 0 && parts.length > 2) continue; // evitar tomar altura de calle
    const matches = parts[i].match(POSTAL_DIGITS_RE);
    if (!matches) continue;
    return matches[matches.length - 1];
  }

  return null;
}

/**
 * true cuando la dirección trae un CP que no está en la tabla AMBA
 * (interior / resto del país). Sin CP no afirmamos nada.
 */
export function addressHasNonAmbaPostalCode(address: string): boolean {
  const postal = extractArgentinePostalDigits(address);
  if (!postal) return false;
  return ambaPointForPostalCode(postal) == null;
}

/** Consultas de localidad/ciudad cuando la dirección completa no geocodifica. */
export function localityFallbackQueries(address: string): string[] {
  const parts = splitAddressParts(address).filter((part) => !/^argentina$/i.test(part));
  if (parts.length < 2) return [];

  const queries: string[] = [];
  const push = (q: string) => {
    const cleaned = q.trim();
    if (!cleaned || cleaned === address.trim()) return;
    if (!queries.includes(cleaned)) queries.push(cleaned);
  };

  // Sin la línea de calle (primer tramo).
  push(parts.slice(1).join(', '));

  let cpIdx = -1;
  for (let i = parts.length - 1; i >= 1; i--) {
    if (/\b\d{4}\b/.test(parts[i])) {
      cpIdx = i;
      break;
    }
  }

  if (cpIdx >= 1) {
    const start = Math.max(1, cpIdx - 2); // no incluir calle
    push(parts.slice(start, cpIdx + 1).join(', '));
    // Ciudad + provincia (sin CP), suele ser lo que Nominatim resuelve mejor.
    if (cpIdx >= 2) {
      push(parts.slice(Math.max(1, cpIdx - 2), cpIdx).join(', '));
    }
  }

  return queries;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const outsideAmba = addressHasNonAmbaPostalCode(trimmed);
  const query = trimmed.toLowerCase().includes('argentina')
    ? trimmed
    : `${trimmed}, Buenos Aires, Argentina`;

  // No forzar viewbox AMBA si el CP es del interior: "Belgrano 336, Pigüé"
  // terminaba en el barrio Belgrano de CABA / GBA.
  if (!outsideAmba) {
    const bounded = await nominatimSearch(query, true);
    if (bounded) return bounded;
  }

  const unbounded = await nominatimSearch(query, false);
  if (unbounded) return unbounded;

  for (const locality of localityFallbackQueries(trimmed)) {
    const localityQuery = locality.toLowerCase().includes('argentina')
      ? locality
      : `${locality}, Argentina`;
    const hit = await nominatimSearch(localityQuery, false);
    if (hit) return hit;
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
 * y si tampoco, un punto de respaldo. Nunca tira: un envío no debe quedar reintentando
 * cada 5 minutos porque el mapa no reconoció la dirección.
 *
 * Importante: un CP fuera del AMBA NUNCA debe caer en CABA (calles como "Belgrano"
 * o el fallback de microcentro).
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

  if (addressHasNonAmbaPostalCode(address)) {
    return { lat: INTERIOR_AR_FALLBACK.lat, lng: INTERIOR_AR_FALLBACK.lng, approximate: true };
  }

  return { lat: CABA_FALLBACK.lat, lng: CABA_FALLBACK.lng, approximate: true };
}

/**
 * Fallback AMBA por CP o nombre de localidad/barrio.
 * No usa el primer tramo (calle): "Belgrano, 336, Pigüé…" no debe matchear Belgrano CABA.
 * Si hay CP fuera del AMBA, no aplica.
 */
export function ambaFallbackFromAddress(address: string): { lat: number; lng: number } | null {
  const trimmed = address.trim();
  if (!trimmed) return null;

  if (addressHasNonAmbaPostalCode(trimmed)) return null;

  const cpa = trimmed.match(CPA_RE);
  if (cpa) {
    const digits = cpa[0].replace(/\D/g, '').slice(0, 4);
    const point = ambaPointForPostalCode(digits);
    if (point) return { lat: point.lat, lng: point.lng };
  }

  const parts = splitAddressParts(trimmed);

  // El número de calle suele estar en el primer tramo; el CP al final.
  for (let i = parts.length - 1; i >= 1; i--) {
    const matches = parts[i].match(/\b(\d{4})\b/g);
    if (!matches) continue;
    for (const match of matches) {
      const point = ambaPointForPostalCode(match);
      if (point) return { lat: point.lat, lng: point.lng };
    }
  }

  // Localidad/barrio: desde el final, nunca el primer tramo (calle).
  for (let i = parts.length - 1; i >= 1; i--) {
    const point = ambaPointForPlaceName(parts[i]);
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
