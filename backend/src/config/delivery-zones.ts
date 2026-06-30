export interface DeliveryZone {
  id: string;
  name: string;
  color: string;
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Zonas predefinidas para CABA y GBA (se copian a cada agencia al crear/migrar) */
export const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  {
    id: 'zona_norte',
    name: 'Zona Norte',
    color: '#3b82f6',
    south: -34.6,
    west: -58.52,
    north: -34.52,
    east: -58.42,
  },
  {
    id: 'zona_centro',
    name: 'Zona Centro',
    color: '#8b5cf6',
    south: -34.64,
    west: -58.46,
    north: -34.58,
    east: -58.36,
  },
  {
    id: 'zona_sur',
    name: 'Zona Sur',
    color: '#ef4444',
    south: -34.72,
    west: -58.52,
    north: -34.62,
    east: -58.4,
  },
  {
    id: 'zona_oeste',
    name: 'Zona Oeste',
    color: '#f59e0b',
    south: -34.68,
    west: -58.58,
    north: -34.58,
    east: -58.48,
  },
  {
    id: 'zona_gba_sur',
    name: 'GBA Sur',
    color: '#ec4899',
    south: -34.78,
    west: -58.55,
    north: -34.68,
    east: -58.38,
  },
];

/** @deprecated Usar delivery-zones.service con agencyId */
export const DELIVERY_ZONES = DEFAULT_DELIVERY_ZONES;
