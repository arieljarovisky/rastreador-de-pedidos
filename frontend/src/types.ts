/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  STORE_ADMIN = 'store_admin',
  LOGISTICS_ADMIN = 'logistics_admin',
  REPARTIDOR = 'repartidor',
}

/** Dueño de la agencia (registro) o admin de logística */
export function isAgencyAdmin(role: UserRole): boolean {
  return role === UserRole.SUPER_ADMIN || role === UserRole.LOGISTICS_ADMIN;
}

export enum OrderStatus {
  PENDING = 'pending',     // Creado, sin asignar
  ASSIGNED = 'assigned',   // Asignado a un repartidor
  DELIVERING = 'delivering', // En viaje / En camino
  DELIVERED = 'delivered',   // Entregado
  CANCELLED = 'cancelled',   // Cancelado
}

/** Cómo la agencia registra escaneos en Mercado Libre Flex. */
export type MlFlexMode = 'agency' | 'repartidor';

/** Modelo de negocio de la plataforma. */
export type BusinessModel = 'managed' | 'marketplace';

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

export interface AgencyMarketplaceProfile {
  website?: string | null;
  instagram?: string | null;
  city?: string | null;
  province?: string | null;
  shippingServices: AgencyShippingService[];
  coverageAreas: AgencyCoverageArea[];
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

export interface AgencyMercadoLibreCourierStatus {
  configured: boolean;
  connected: boolean;
  account: {
    nickname: string | null;
    connectedAt: string;
  } | null;
}

export interface AgencyIntegrationsStatus {
  mlFlexMode: MlFlexMode;
  mercadolibreCourier: AgencyMercadoLibreCourierStatus;
}

export interface RepartidorMercadoLibreStatus {
  mlFlexMode: MlFlexMode;
  mercadolibre: AgencyMercadoLibreCourierStatus;
}

export interface SellerStats {
  totalOrders: number;
  pendingOrders: number;
  activeOrders: number;
  deliveredOrders: number;
}

export interface SellerDetail {
  user: User;
  stats: SellerStats;
}

export interface OrderHistoryEvent {
  status: OrderStatus;
  timestamp: string;
  updatedBy: string; // Nombre del usuario que lo actualizó
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
  lat: number; // Latitud de entrega
  lng: number; // Longitud de entrega
  status: OrderStatus;
  archived?: boolean;
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
}

export interface MarketplaceIntegrationAccount {
  platform: 'mercadolibre' | 'tiendanube';
  connected: boolean;
  externalUserId: string | null;
  externalStoreId: string | null;
  nickname: string | null;
  connectedAt: string;
}

export interface MarketplaceIntegrationStatus {
  mercadolibre: {
    configured: boolean;
    connected: boolean;
    webhookUrl?: string;
    account: MarketplaceIntegrationAccount | null;
  };
  tiendanube: {
    configured: boolean;
    connected: boolean;
    account: MarketplaceIntegrationAccount | null;
  };
}

export interface MarketplaceShipmentPreview {
  externalId: string;
  mlOrderId?: string;
  platform: 'mercadolibre' | 'tiendanube';
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

export interface MarketplaceDateRange {
  dateFrom?: string;
  dateTo?: string;
}

export interface AppNotification {
  id: string;
  userId: string; // 'all' o un id de usuario específico
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  type: 'order_assigned' | 'order_delivered' | 'location_update' | 'info';
  orderId?: string;
}
