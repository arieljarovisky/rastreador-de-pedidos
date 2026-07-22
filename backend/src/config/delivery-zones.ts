import { AMBA_CORDON_ZONES, LEGACY_ZONE_IDS } from './amba-cordon-zones.js';

export interface ZoneRateTrio {
  flex: number;
  express: number;
  standard: number;
}

export interface DeliveryZone {
  id: string;
  name: string;
  color: string;
  south: number;
  west: number;
  north: number;
  east: number;
  barrios?: string[];
  shippingRates?: ZoneRateTrio;
  /** Monto que se le paga al repartidor por envío entregado en esta zona. */
  driverPayRates?: ZoneRateTrio;
}

export const DEFAULT_DELIVERY_ZONES = AMBA_CORDON_ZONES;
export { LEGACY_ZONE_IDS };

/** @deprecated Usar delivery-zones.service con agencyId */
export const DELIVERY_ZONES = AMBA_CORDON_ZONES;
