/**
 * Tipos compartidos con el backend de LupoEnvios.
 * Mantené esto alineado con backend/src/types/index.ts y frontend/src/types.ts.
 */

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  STORE_ADMIN = 'store_admin',
  LOGISTICS_ADMIN = 'logistics_admin',
  REPARTIDOR = 'repartidor',
}

export enum OrderStatus {
  PENDING = 'pending', // Creado, sin asignar
  ASSIGNED = 'assigned', // Asignado a un repartidor
  DELIVERING = 'delivering', // En viaje / En camino
  DELIVERED = 'delivered', // Entregado
  CANCELLED = 'cancelled', // Cancelado
}

export type MlFlexMode = 'agency' | 'repartidor';

export type AgencyShippingServiceType = 'same_day' | 'turbo' | 'custom';

export interface AgencyShippingService {
  type: AgencyShippingServiceType;
  label?: string;
  description?: string;
}

export interface AgencyCoverageArea {
  id: string;
  name: string;
  places: string[];
  tariff: number;
  minimumOrders?: number | null;
}

export interface AgencyCoverageZone {
  id: string;
  name: string;
  barrios?: string[];
}

export interface MarketplaceAgency {
  id: string;
  name: string;
  city?: string | null;
  province?: string | null;
  website?: string | null;
  instagram?: string | null;
  shippingServices: AgencyShippingService[];
  departurePoint?: LocationPoint;
  coverageAreas?: AgencyCoverageArea[];
  coverageZones?: AgencyCoverageZone[];
}

export interface UserLocation {
  lat: number;
  lng: number;
  timestamp: string;
}

export interface LocationPoint {
  address: string;
  lat: number;
  lng: number;
}

export interface PickupPoint {
  id: string;
  userId: string;
  sellerName?: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  createdAt: string;
}

export type SellerMonthlyOrders = 'under_10' | '10_50' | '51_200' | 'over_200';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  agencyId?: string | null;
  agencyName?: string | null;
  agencyMlFlexMode?: MlFlexMode | null;
  preferredAgencyId?: string | null;
  preferredAgencyName?: string | null;
  isMarketplaceSeller?: boolean;
  city?: string | null;
  province?: string | null;
  monthlyOrders?: SellerMonthlyOrders | null;
  sellerCategories?: string[];
  currentLocation?: UserLocation;
  departurePoint?: LocationPoint;
  pickupPoints?: PickupPoint[];
  deliveryZone?: string | null;
}

export interface OrderHistoryEvent {
  status: OrderStatus;
  timestamp: string;
  updatedBy: string;
  comment?: string;
  lat?: number;
  lng?: number;
}

export interface LocationHistoryPoint {
  lat: number;
  lng: number;
  timestamp: string;
}

export interface Order {
  id: string;
  sellerId: string | null;
  sellerName: string | null;
  clientName: string;
  clientPhone: string;
  address: string;
  lat: number;
  lng: number;
  status: OrderStatus;
  repartidorId: string | null;
  repartidorName: string | null;
  createdAt: string;
  updatedAt: string;
  history: OrderHistoryEvent[];
  locationHistory: LocationHistoryPoint[];
  notes?: string;
  externalSource?: string | null;
  externalOrderId?: string | null;
  shippingType?: string | null;
  archived?: boolean;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export type MarketplacePlatform = 'mercadolibre' | 'tiendanube';

export interface MarketplaceShipmentPreview {
  externalId: string;
  mlOrderId?: string;
  mlPackId?: string;
  platform: MarketplacePlatform;
  shippingType: 'flex' | 'express';
  clientName: string;
  clientPhone: string;
  address: string;
  lat?: number;
  lng?: number;
  notes: string;
  createdAt: string;
  alreadyImported: boolean;
}

export interface IntegrationAccountStatus {
  nickname?: string;
  email?: string;
  storeName?: string;
}

export interface IntegrationsStatus {
  mercadolibre: {
    configured: boolean;
    connected: boolean;
    account: IntegrationAccountStatus | null;
  };
  tiendanube: {
    configured: boolean;
    connected: boolean;
    account: IntegrationAccountStatus | null;
  };
}

export interface AgencyMercadoLibreCourierStatus {
  configured: boolean;
  connected: boolean;
  account: IntegrationAccountStatus | null;
}

export interface AgencyIntegrationsStatus {
  mlFlexMode: MlFlexMode;
  mercadolibreCourier: AgencyMercadoLibreCourierStatus;
}

export interface RepartidorMercadoLibreStatus {
  mlFlexMode: MlFlexMode;
  mercadolibre: AgencyMercadoLibreCourierStatus;
}

export interface MarketplaceImportResult {
  imported: number;
  skipped: number;
  orders: string[];
  errors: string[];
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  type: 'order_assigned' | 'order_delivered' | 'location_update' | 'info';
  orderId?: string;
}

export function isAgencyAdmin(role: UserRole): boolean {
  return role === UserRole.SUPER_ADMIN || role === UserRole.LOGISTICS_ADMIN;
}

export function isSellerRole(role: UserRole): boolean {
  return role === UserRole.STORE_ADMIN;
}

export function isRepartidorRole(role: UserRole): boolean {
  return role === UserRole.REPARTIDOR;
}

/** Roles admitidos en la app móvil Posta. */
export const MOBILE_APP_ROLES: UserRole[] = [
  UserRole.REPARTIDOR,
  UserRole.STORE_ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.LOGISTICS_ADMIN,
];

export function isAgencyAdminRole(role: UserRole): boolean {
  return isAgencyAdmin(role);
}

/** Etiqueta legible para cada estado de pedido. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'En almacén',
  [OrderStatus.ASSIGNED]: 'Asignado',
  [OrderStatus.DELIVERING]: 'En viaje',
  [OrderStatus.DELIVERED]: 'Entregado',
  [OrderStatus.CANCELLED]: 'Cancelado',
};
