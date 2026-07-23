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

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  agencyId?: string | null;
  agencyName?: string | null;
  currentLocation?: UserLocation;
  departurePoint?: LocationPoint;
  pickupPoints?: PickupPoint[];
  deliveryZone?: string | null;
  /** Corte de ventas del vendedor (0–23). null/undefined = hereda el de la agencia. */
  deliveryDeadlineHour?: number | null;
}

export interface AgencyMercadoLibreCourierStatus {
  configured: boolean;
  connected: boolean;
  account: {
    nickname: string | null;
    connectedAt: string;
  } | null;
}

export interface RepartidorMercadoLibreStatus {
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
  deliveryDeadline?: string;
  history: OrderHistoryEvent[];
  locationHistory: LocationHistoryPoint[];
  notes?: string;
  externalSource?: string | null;
  externalOrderId?: string | null;
  shippingType?: string | null;
  /** Último status de envío ML Flex (ej. shipped). */
  mlShipmentStatus?: string | null;
  /** Último substatus ML Flex (ej. receiver_absent). */
  mlShipmentSubstatus?: string | null;
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
    autoSync?: boolean;
    orderWebhookUrl?: string;
    shippingRatesUrl?: string;
    shippingCarrierReady?: boolean;
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
  mlShipmentStatus?: string;
  mlPackId?: string;
  mlProductCount?: number;
  mlOrderIds?: string[];
}

export interface MarketplaceDateRange {
  dateFrom?: string;
  dateTo?: string;
}

export interface DeliveryDailySummary {
  date: string;
  deadlineHour: number;
  deadlineAt: string;
  total: number;
  delivered: number;
  undelivered: number;
  overdue: number;
  /** Entregados después del corte del día (21:00 AR). */
  deliveredLate: number;
  cancelled: number;
  minutesUntilDeadline: number;
  isPastDeadline: boolean;
}

export interface AppNotification {
  id: string;
  userId: string; // 'all' o un id de usuario específico
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  type:
    | 'order_assigned'
    | 'order_delivered'
    | 'location_update'
    | 'info'
    | 'deadline_warning'
    | 'deadline_urgent'
    | 'deadline_missed';
  orderId?: string;
}

export interface AgencyShippingRates {
  flex: number;
  express: number;
  standard: number;
  currency: 'ARS';
}

export interface ZoneShippingRates {
  zoneId: string;
  zoneName: string;
  flex: number;
  express: number;
  standard: number;
  currency: 'ARS';
}

export interface BillingLedgerEntry {
  id: string;
  agencyId: string;
  sellerId: string;
  sellerName: string | null;
  orderId: string | null;
  entryType: 'charge' | 'payment' | 'adjustment';
  amount: number;
  description: string;
  createdBy: string | null;
  createdAt: string;
}

export interface BillingSummary {
  currency: 'ARS';
  dateFrom: string;
  dateTo: string;
  sellerId: string | null;
  sellerName: string | null;
  totalSpent: number;
  totalPaid: number;
  balance: number;
  chargedShipments: number;
  zoneRates: ZoneShippingRates[];
  defaultRates: AgencyShippingRates;
  byShippingType: Array<{ shippingType: string; count: number; amount: number }>;
  sellers?: Array<{
    sellerId: string;
    sellerName: string;
    totalSpent: number;
    balance: number;
    chargedShipments: number;
  }>;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  minRepartidores: number;
  maxRepartidores: number | null;
  priceArs: number;
  sortOrder: number;
}

export interface AgencySubscriptionStatus {
  status: 'trial' | 'active' | 'past_due' | 'cancelled';
  isActive: boolean;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  plan: SubscriptionPlan | null;
  lastRepartidorCount: number;
  repartidorCount: number;
  recommendedPlan: SubscriptionPlan | null;
  daysRemaining: number | null;
  postaMercadoPagoConfigured?: boolean;
}

export interface AgencyMercadoPagoStatus {
  configured: boolean;
  connected: boolean;
  webhookUrl?: string;
  account: {
    mpUserId: string;
    nickname: string | null;
    connectedAt: string;
  } | null;
}

export interface BillingPaymentOptions {
  balance: number;
  mercadoPagoAvailable: boolean;
}

export interface DriverLedgerEntry {
  id: string;
  agencyId: string;
  repartidorId: string;
  repartidorName: string | null;
  orderId: string | null;
  entryType: 'earning' | 'payment' | 'adjustment';
  amount: number;
  description: string;
  createdBy: string | null;
  createdAt: string;
}

export interface DriverSettlementSummary {
  currency: 'ARS';
  dateFrom: string;
  dateTo: string;
  repartidorId: string | null;
  repartidorName: string | null;
  totalEarned: number;
  totalPaid: number;
  balance: number;
  deliveredShipments: number;
  zoneRates: ZoneShippingRates[];
  defaultRates: AgencyShippingRates;
  byShippingType: Array<{ shippingType: string; count: number; amount: number }>;
  repartidores?: Array<{
    repartidorId: string;
    repartidorName: string;
    totalEarned: number;
    balance: number;
    deliveredShipments: number;
  }>;
}
