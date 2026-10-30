import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { geocodeAddress } from './geocode.service.js';
import { findPricingZoneForPoint } from './delivery-zones.service.js';
import { canonicalizePricingZoneKey } from './price-lists.service.js';
import {
  ambaPointForPlaceName,
  ambaPointForPostalCode,
  type AmbaPostalPoint,
} from '../config/amba-postal-codes.js';

export interface PostalCodeGeoResolved {
  postalCode: string;
  lat: number;
  lng: number;
  /** Canonical AMBA pricing zone, or null if outside coverage. */
  zoneKey: string | null;
  fromCache: boolean;
}

export interface PostalCodeGeoHints {
  city?: string | null;
  locality?: string | null;
  province?: string | null;
  country?: string | null;
}

interface CacheRow extends RowDataPacket {
  postal_code: string;
  lat: number;
  lng: number;
  zone_key: string | null;
  updated_at: Date;
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
const GEOCODE_BUDGET_MS = 2200;

/**
 * Normaliza CP argentino a 4 dígitos (ej. C1425ABA → 1425, 1425 → 1425).
 * Solo acepta CP de 4 dígitos o CPA (letra + 4 dígitos + 3 letras): un zip de 5+
 * dígitos (Uruguay 11000, México 11000) truncado caería en CABA.
 */
export function normalizeArgentinePostalCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = String(raw).replace(/[\s.-]/g, '').toUpperCase();
  const match = /^([A-Z])?(\d{4})([A-Z]{3})?$/.exec(compact);
  return match ? match[2] : null;
}

/** Letra de provincia del CPA (B = Buenos Aires, C = CABA), si viene. */
function cpaProvinceLetter(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = String(raw).replace(/[\s.-]/g, '').toUpperCase();
  const match = /^([A-Z])\d{4}/.exec(compact);
  return match ? match[1] : null;
}

function foldProvince(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const AMBA_PROVINCE_KEYS = new Set([
  'caba',
  'capital federal',
  'ciudad de buenos aires',
  'ciudad autonoma de buenos aires',
  'buenos aires',
  'bs as',
  'bs.as',
  'bs. as.',
  'provincia de buenos aires',
]);

/** true si la provincia es Buenos Aires o CABA (puede ser AMBA; decide el CP). */
export function provinceIsAmba(province: string | null | undefined): boolean {
  if (!province) return false;
  return AMBA_PROVINCE_KEYS.has(foldProvince(province));
}

/**
 * true si la provincia NO puede ser AMBA (p. ej. Mendoza).
 * Buenos Aires / CABA → false (puede ser AMBA o interior; decide el CP).
 * Sin provincia → false (no afirmamos).
 */
export function provinceIsOutsideAmba(province: string | null | undefined): boolean {
  if (!province) return false;
  const key = foldProvince(province);
  if (!key) return false;
  return !AMBA_PROVINCE_KEYS.has(key);
}

/** true si el país viene y no es Argentina. Sin país → false. */
export function countryIsOutsideArgentina(country: string | null | undefined): boolean {
  if (!country) return false;
  const key = foldProvince(country);
  if (!key) return false;
  return key !== 'ar' && key !== 'arg' && key !== 'argentina';
}

/**
 * Punto AMBA local para checkout: CP primero; nombres de ciudad solo si no hay CP
 * o el CP es AMBA. Evita "San Martín" (Mendoza, 5570) → San Martín GBA.
 */
export function resolveAmbaLocalPoint(
  rawPostalCode: string | null | undefined,
  hints?: PostalCodeGeoHints
): AmbaPostalPoint | null {
  const postalCode = normalizeArgentinePostalCode(rawPostalCode);
  if (provinceIsOutsideAmba(hints?.province)) return null;

  const byCp = postalCode ? ambaPointForPostalCode(postalCode) : null;
  if (byCp) return byCp;

  // CP presente pero fuera de la tabla AMBA: no adivinar por localidad/ciudad.
  if (postalCode) return null;

  return ambaPointForPlaceName(hints?.locality) ?? ambaPointForPlaceName(hints?.city);
}

async function readCache(postalCode: string): Promise<CacheRow | null> {
  const [rows] = await pool.query<CacheRow[]>(
    `SELECT postal_code, lat, lng, zone_key, updated_at
     FROM postal_code_geo_cache WHERE postal_code = ? LIMIT 1`,
    [postalCode]
  );
  return rows[0] ?? null;
}

async function writeCache(
  postalCode: string,
  lat: number,
  lng: number,
  zoneKey: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO postal_code_geo_cache (postal_code, lat, lng, zone_key, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng),
       zone_key = VALUES(zone_key), updated_at = VALUES(updated_at)`,
    [postalCode, lat, lng, zoneKey, new Date()]
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/**
 * Resuelve CP → lat/lng y zona de pricing de la agencia.
 * El AMBA se resuelve en memoria: Nominatim no entra en el checkout.
 *
 * CP fuera del AMBA (o provincia no BA/CABA) → zoneKey null (out_of_coverage),
 * sin matchear nombres ambiguos tipo "San Martín".
 */
export async function resolvePostalCodeForAgency(
  agencyId: string,
  rawPostalCode: string | null | undefined,
  hints?: PostalCodeGeoHints
): Promise<PostalCodeGeoResolved | null> {
  const postalCode = normalizeArgentinePostalCode(rawPostalCode);
  const ambaByCp = postalCode ? ambaPointForPostalCode(postalCode) : null;
  const rawPostalPresent = Boolean(rawPostalCode && String(rawPostalCode).trim());
  const cpaLetter = cpaProvinceLetter(rawPostalCode);

  // Fuera de cobertura sin geocode: Express no debe cotizar en Mendoza/etc.
  // Ante la duda se corta: mostrar Express donde no llegamos es peor que no mostrarlo.
  const outside =
    countryIsOutsideArgentina(hints?.country) ||
    provinceIsOutsideAmba(hints?.province) ||
    // CP que vino pero no es un CP argentino válido (zip extranjero, basura).
    (rawPostalPresent && !postalCode) ||
    // CPA con letra de otra provincia (B = Buenos Aires, C = CABA).
    (cpaLetter != null && cpaLetter !== 'B' && cpaLetter !== 'C') ||
    (postalCode != null && !ambaByCp) ||
    // Sin CP solo matcheamos por nombre si la provincia confirma BA/CABA:
    // "Merlo", "Pilar", "Luján", "San Martín" existen también en el interior.
    (!postalCode && !provinceIsAmba(hints?.province));

  if (outside) {
    return {
      postalCode: postalCode ?? 'outside',
      lat: 0,
      lng: 0,
      zoneKey: null,
      fromCache: false,
    };
  }

  const local = resolveAmbaLocalPoint(rawPostalCode, hints);

  if (local) {
    const zone = await findPricingZoneForPoint(agencyId, local.lat, local.lng);
    const zoneKey = zone ? canonicalizePricingZoneKey(zone.id) : null;
    if (postalCode) {
      void writeCache(postalCode, local.lat, local.lng, zoneKey).catch((err) => {
        console.warn('[postal-code] No se pudo guardar el CP en cache:', err);
      });
    }
    return {
      postalCode: postalCode ?? local.barrioId,
      lat: local.lat,
      lng: local.lng,
      zoneKey,
      fromCache: false,
    };
  }

  if (!postalCode) return null;

  const cached = await readCache(postalCode);
  const cacheFresh =
    cached && Date.now() - new Date(cached.updated_at).getTime() < CACHE_TTL_MS;

  if (cacheFresh && cached) {
    // Cache viejo pudo guardarse con match erróneo (San Martín GBA); CP no-AMBA ya
    // se cortó arriba, acá solo CPs AMBA.
    const zone = await findPricingZoneForPoint(agencyId, cached.lat, cached.lng);
    const zoneKey = zone ? canonicalizePricingZoneKey(zone.id) : null;
    if (zoneKey !== cached.zone_key) {
      void writeCache(postalCode, cached.lat, cached.lng, zoneKey);
    }
    return {
      postalCode,
      lat: cached.lat,
      lng: cached.lng,
      zoneKey,
      fromCache: true,
    };
  }

  const geo = await withTimeout(
    geocodeAddress(`Código postal ${postalCode}, Argentina`),
    GEOCODE_BUDGET_MS
  );
  if (!geo) return null;

  const zone = await findPricingZoneForPoint(agencyId, geo.lat, geo.lng);
  const zoneKey = zone ? canonicalizePricingZoneKey(zone.id) : null;
  await writeCache(postalCode, geo.lat, geo.lng, zoneKey);

  return {
    postalCode,
    lat: geo.lat,
    lng: geo.lng,
    zoneKey,
    fromCache: false,
  };
}
