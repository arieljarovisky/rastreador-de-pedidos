import { findTiendaNubeIntegrationByStoreId } from './integrations.service.js';
import { getUserById } from './users.service.js';
import { resolvePostalCodeForAgency } from './postal-code-geo.service.js';
import { resolveShippingAmountForOrder } from './price-lists.service.js';
import { UserRole } from '../types/index.js';

export interface TnShippingRatesRequest {
  store_id?: number | string;
  currency?: string;
  destination?: {
    postal_code?: string;
    zipcode?: string;
    city?: string;
    province?: string;
    country?: string;
  };
  carrier?: {
    options?: Array<{ code?: string; name?: string }>;
  };
}

export interface TnShippingRate {
  name: string;
  code: string;
  price: number;
  price_merchant: number;
  currency: string;
  type: 'ship';
  phone_required: boolean;
  min_delivery_date: string;
  max_delivery_date: string;
  reference: string;
}

export type TnShippingRatesResult =
  | { ok: true; rates: TnShippingRate[] }
  | { ok: false; status: 422; reason: string };

function argentinaIsoOffset(date: Date): string {
  // Argentina fijo UTC-3
  const shifted = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  const ss = String(shifted.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}-0300`;
}

function deliveryWindow(): { min: string; max: string } {
  const now = new Date();
  const min = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const max = new Date(now.getTime() + 28 * 60 * 60 * 1000);
  return { min: argentinaIsoOffset(min), max: argentinaIsoOffset(max) };
}

/**
 * Cotiza Posta Express para el callback de Shipping Carrier de TN.
 * Fuera de cobertura AMBA → 422 (Posta no aparece en checkout).
 */
export async function quoteTiendaNubePostaExpressRates(
  payload: TnShippingRatesRequest
): Promise<TnShippingRatesResult> {
  const storeId = payload.store_id;
  if (storeId == null) {
    return { ok: false, status: 422, reason: 'missing_store_id' };
  }

  const integration = await findTiendaNubeIntegrationByStoreId(storeId);
  if (!integration) {
    return { ok: false, status: 422, reason: 'store_not_connected' };
  }

  const seller = await getUserById(integration.userId);
  if (!seller || seller.role !== UserRole.STORE_ADMIN || !seller.agencyId) {
    return { ok: false, status: 422, reason: 'seller_invalid' };
  }

  const postal =
    payload.destination?.postal_code ??
    payload.destination?.zipcode ??
    null;

  const resolved = await resolvePostalCodeForAgency(seller.agencyId, postal);
  if (!resolved) {
    return { ok: false, status: 422, reason: 'postal_code_unresolved' };
  }
  if (!resolved.zoneKey) {
    return { ok: false, status: 422, reason: 'out_of_coverage' };
  }

  const amount = await resolveShippingAmountForOrder({
    agencyId: seller.agencyId,
    sellerId: seller.id,
    lat: resolved.lat,
    lng: resolved.lng,
    shippingType: 'express',
  });

  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, status: 422, reason: 'rate_unavailable' };
  }

  const currency = (payload.currency ?? 'ARS').toUpperCase();
  const { min, max } = deliveryWindow();

  return {
    ok: true,
    rates: [
      {
        name: 'Posta Express',
        code: 'express',
        price: amount,
        price_merchant: amount,
        currency,
        type: 'ship',
        phone_required: true,
        min_delivery_date: min,
        max_delivery_date: max,
        reference: 'posta_express',
      },
    ],
  };
}
