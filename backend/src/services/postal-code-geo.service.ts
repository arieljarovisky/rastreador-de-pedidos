import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { geocodeAddress } from './geocode.service.js';
import { findPricingZoneForPoint } from './delivery-zones.service.js';
import { canonicalizePricingZoneKey } from './price-lists.service.js';

export interface PostalCodeGeoResolved {
  postalCode: string;
  lat: number;
  lng: number;
  /** Canonical AMBA pricing zone, or null if outside coverage. */
  zoneKey: string | null;
  fromCache: boolean;
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

/** Normaliza CP argentino a dígitos (ej. C1425ABA → 1425, 1425 → 1425). */
export function normalizeArgentinePostalCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 4) return null;
  // CPA nuevo: 1 letra + 4 dígitos + 3 letras → tomar los 4 del medio ya extraídos
  if (digits.length >= 4) return digits.slice(0, 4);
  return null;
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
 * Usa cache para responder en <2s en el callback de TN.
 */
export async function resolvePostalCodeForAgency(
  agencyId: string,
  rawPostalCode: string | null | undefined
): Promise<PostalCodeGeoResolved | null> {
  const postalCode = normalizeArgentinePostalCode(rawPostalCode);
  if (!postalCode) return null;

  const cached = await readCache(postalCode);
  const cacheFresh =
    cached && Date.now() - new Date(cached.updated_at).getTime() < CACHE_TTL_MS;

  if (cacheFresh && cached) {
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
