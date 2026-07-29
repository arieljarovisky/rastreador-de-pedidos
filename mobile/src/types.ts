/**
 * Tipos compartidos con el backend de LupoEnvios.
 * Mantené esto alineado con backend/src/types/index.ts y frontend/src/types.ts.
 */

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  STORE_ADMIN = 'store_admin',
  LOGISTICS_ADMIN = 'logistics_admin',
  REPARTIDOR = 'repartidor',
  PLATFORM_OWNER = 'platform_owner',
}

export enum OrderStatus {
  PENDING = 'pending', // Creado, sin asignar
  ASSIGNED = 'assigned', // Asignado a un repartidor
  DELIVERING = 'delivering', // En viaje / En camino
  DELIVERED = 'delivered', // Entregado
  CANCELLED = 'cancelled', // Cancelado
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
  deliveryDeadlineHour?: number | null;
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
  deliveryDeadline?: string;
  history: OrderHistoryEvent[];
  locationHistory: LocationHistoryPoint[];
  notes?: string;
  externalSource?: string | null;
  externalOrderId?: string | null;
  shippingType?: string | null;
  archived?: boolean;
  mlShipmentStatus?: string | null;
  mlShipmentSubstatus?: string | null;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export type MarketplacePlatform = 'mercadolibre' | 'tiendanube' | 'shopify' | 'woocommerce';

export interface MarketplaceShipmentPreview {
  externalId: string;
  mlOrderId?: string;
  mlPackId?: string;
  platform: MarketplacePlatform;
  shippingType: 'flex' | 'express' | 'standard';
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
    autoSync?: boolean;
    orderWebhookUrl?: string;
    shippingRatesUrl?: string;
    shippingCarrierReady?: boolean;
    account: IntegrationAccountStatus | null;
  };
  shopify: {
    configured: boolean;
    connected: boolean;
    autoSync?: boolean;
    orderWebhookUrl?: string;
    account: IntegrationAccountStatus | null;
  };
  woocommerce: {
    configured: boolean;
    connected: boolean;
    autoSync?: boolean;
    orderWebhookUrl?: string;
    account: IntegrationAccountStatus | null;
  };
}

export interface AgencyMercadoLibreCourierStatus {
  configured: boolean;
  connected: boolean;
  account: IntegrationAccountStatus | null;
}

export interface RepartidorMercadoLibreStatus {
  mercadolibre: AgencyMercadoLibreCourierStatus;
}

export interface MarketplaceImportResult {
  imported: number;
  skipped: number;
  orders: string[];
  errors: string[];
}

export interface DeliveryDailySummary {
  date: string;
  deadlineHour: number;
  deadlineAt: string;
  total: number;
  delivered: number;
  undelivered: number;
  overdue: number;
  cancelled: number;
  minutesUntilDeadline: number;
  isPastDeadline: boolean;
}

export interface AppNotification {
  id: string;
  userId: string;
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
  totalSpent: number;
  totalPaid: number;
  balance: number;
  chargedShipments: number;
}

export interface BillingPaymentOptions {
  balance: number;
  mercadoPagoAvailable: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  minRepartidores: number;
  maxRepartidores: number | null;
  priceArs: number;
}

export interface AgencySubscriptionStatus {
  status: 'trial' | 'active' | 'past_due' | 'cancelled';
  isActive: boolean;
  repartidorCount: number;
  recommendedPlan: SubscriptionPlan | null;
  daysRemaining: number | null;
  postaMercadoPagoConfigured?: boolean;
}

export interface AgencyMercadoPagoStatus {
  configured: boolean;
  connected: boolean;
  account: { nickname: string | null; connectedAt: string } | null;
}

/** Entrada de bitácora personal del repartidor (paquetes sin vínculo ML). */
export type DriverScanEntryStatus = 'pending' | 'delivered' | 'cancelled';

export interface DriverScanEntry {
  id: string;
  agencyId: string;
  repartidorId: string;
  scanCode: string;
  routeDate: string;
  status: DriverScanEntryStatus;
  note: string | null;
  clientName?: string | null;
  address?: string | null;
  clientPhone?: string | null;
  scannedAt: string;
  deliveredAt: string | null;
  alreadyRegistered: boolean;
}

export interface DriverScanDayResult {
  date: string;
  entries: DriverScanEntry[];
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
