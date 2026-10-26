import { findTiendaNubeIntegrationByStoreId } from './integrations.service.js';
import {
  readTiendaNubeExpressAdditionalDays,
  readTiendaNubeShippingMethodSettings,
} from './tiendanube.service.js';
import { getUserById, resolveSalesCutoffHour, resolveWorksOnHolidays } from './users.service.js';
import { resolveClosedDateKeys } from './closed-days.service.js';
import { resolvePostalCodeForAgency } from './postal-code-geo.service.js';
import { resolveShippingAmountForOrder } from './price-lists.service.js';
import { resolveSellerCustomerPrice } from './seller-customer-rates.service.js';
import { UserRole } from '../types/index.js';
import {
  computeDeliveryDeadline,
  DELIVERY_DEADLINE_HOUR,
  getOperationalDateKey,
  shiftOperationalDateKey,
  type BusinessDayOptions,
} from '../utils/delivery-deadline.js';

export interface TnShippingRatesRequest {
  store_id?: number | string;
  currency?: string;
  destination?: {
    postal_code?: string;
    zipcode?: string;
    city?: string;
    locality?: string;
    province?: string;
    country?: string;
  };
  carrier?: {
    options?: Array<{ code?: string; name?: string; additional_days?: unknown }>;
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

/** Ejemplo de la doc de tarifas: `2016-07-12T14:48:45-0300`. */
function tnDeliveryIso(dateKey: string): string {
  return `${dateKey}T14:48:45-0300`;
}

function asAdditionalDays(value: unknown): number {
  const raw =
    value && typeof value === 'object' && 'days' in value
      ? (value as { days?: unknown }).days
      : value;
  const n = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(14, Math.trunc(n));
}

/** TN suma additional_days de la opción encima de min/max. */
export function readExpressAdditionalDays(payload: TnShippingRatesRequest): number {
  const options = payload.carrier?.options ?? [];
  const match =
    options.find((o) => (o.code ?? '').toLowerCase() === 'express') ?? options[0];
  return asAdditionalDays(match?.additional_days);
}

/**
 * Día de entrega del checkout: mismo día si compra antes del corte;
 * si ya pasó, el próximo hábil.
 * Con `2026-10-26T14:48:45-0300` y additional_days 0, el checkout mostró el martes 27.
 * Tienda Nube suma un día a la fecha del ejemplo, así que enviamos el día anterior.
 */
export function buildTiendaNubeDeliveryWindow(
  now: Date = new Date(),
  deadlineHour: number = DELIVERY_DEADLINE_HOUR,
  opts?: BusinessDayOptions,
  additionalDays = 0
): { min: string; max: string; operationalDate: string } {
  const deadline = computeDeliveryDeadline(now, deadlineHour, opts);
  let dateKey = getOperationalDateKey(deadline);
  if (additionalDays > 0) {
    dateKey = shiftOperationalDateKey(dateKey, -additionalDays);
  }
  const operationalDate = dateKey;
  const sent = shiftOperationalDateKey(dateKey, -1);
  const iso = tnDeliveryIso(sent);
  return { min: iso, max: iso, operationalDate };
}

async function resolveSellerDeliveryCalendar(
  sellerId: string,
  agencyId: string
): Promise<{ deadlineHour: number; opts: BusinessDayOptions }> {
  try {
    const [deadlineHour, worksOnHolidays, closedDateKeys] = await Promise.all([
      resolveSalesCutoffHour({ sellerId, agencyId }),
      resolveWorksOnHolidays({ sellerId, agencyId }),
      resolveClosedDateKeys({ sellerId, agencyId }),
    ]);
    return { deadlineHour, opts: { worksOnHolidays, closedDateKeys } };
  } catch (err) {
    console.warn('[tn-rates] calendario de entrega no disponible, se usa el default:', err);
    return { deadlineHour: DELIVERY_DEADLINE_HOUR, opts: { worksOnHolidays: false } };
  }
}

/**
 * Cotiza «Envíos en el día» para el callback de Shipping Carrier de TN.
 * El precio sale del cordón de la dirección (CABA, 1°, 2° o 3°).
 * `price` es el importe que el vendedor eligió para sus clientes; si no eligió, la tarifa de Posta de ese cordón.
 * `price_merchant` es lo que Posta le cobra al vendedor en ese cordón.
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

  const shippingMethod = readTiendaNubeShippingMethodSettings(integration.metadata);
  if (!shippingMethod.enabled) {
    return { ok: false, status: 422, reason: 'shipping_disabled' };
  }

  const seller = await getUserById(integration.userId);
  if (!seller || seller.role !== UserRole.STORE_ADMIN || !seller.agencyId) {
    return { ok: false, status: 422, reason: 'seller_invalid' };
  }

  const postal =
    payload.destination?.postal_code ??
    payload.destination?.zipcode ??
    null;

  const resolved = await resolvePostalCodeForAgency(seller.agencyId, postal, {
    city: payload.destination?.city ?? null,
    locality: payload.destination?.locality ?? null,
  });
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

  let customerAmount = amount;
  try {
    const custom = await resolveSellerCustomerPrice(seller.id, resolved.zoneKey);
    if (custom != null) customerAmount = custom;
  } catch (err) {
    console.warn('[tn-rates] Precio del vendedor no disponible, se usa la tarifa de Posta:', err);
  }

  const currency = (payload.currency ?? 'ARS').toUpperCase();
  const calendar = await resolveSellerDeliveryCalendar(seller.id, seller.agencyId);
  let additionalDays = readExpressAdditionalDays(payload);
  try {
    const storedDays = await readTiendaNubeExpressAdditionalDays(integration);
    additionalDays = Math.max(additionalDays, storedDays);
  } catch (err) {
    console.warn('[tn-rates] no se pudieron leer los días extra de la opción:', err);
  }
  const { min, max, operationalDate } = buildTiendaNubeDeliveryWindow(
    new Date(),
    calendar.deadlineHour,
    calendar.opts,
    additionalDays
  );
  console.log('[tn-rates] cotización', {
    store_id: storeId,
    postal,
    cutoffHour: calendar.deadlineHour,
    additionalDays,
    operationalDate,
    carrierOptions: payload.carrier?.options ?? null,
    min_delivery_date: min,
    max_delivery_date: max,
  });

  return {
    ok: true,
    rates: [
      {
        name: shippingMethod.methodName,
        code: 'express',
        price: customerAmount,
        price_merchant: amount,
        currency,
        type: 'ship',
        phone_required: true,
        min_delivery_date: min,
        max_delivery_date: max,
        reference: 'posta_envios_en_el_dia',
      },
    ],
  };
}
