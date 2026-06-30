export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  STORE_ADMIN = 'store_admin',
  LOGISTICS_ADMIN = 'logistics_admin',
  REPARTIDOR = 'repartidor',
}

export enum OrderStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  DELIVERING = 'delivering',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

/** Cómo la agencia registra escaneos en Mercado Libre Flex. */
export type MlFlexMode = 'agency' | 'repartidor';

/** Modelo de negocio de la plataforma. */
export type BusinessModel = 'managed' | 'marketplace';

export type AgencyShippingServiceType = 'same_day' | 'turbo' | 'custom';

export interface AgencyShippingService {
  type: AgencyShippingServiceType;
  /** Etiqueta visible para servicios personalizados. */
  label?: string;
  description?: string;
}

/** Zona de cobertura visible en el marketplace. */
export interface AgencyCoverageZone {
  id: string;
  name: string;
  barrios?: string[];
}

/** Perfil público de agencia en el marketplace. */
export interface MarketplaceAgency {
  id: string;
  name: string;
  city?: string | null;
  province?: string | null;
  website?: string | null;
  instagram?: string | null;
  shippingServices: AgencyShippingService[];
  departurePoint?: LocationPoint;
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

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  agencyId?: string | null;
  agencyName?: string | null;
  /** Modo Flex de la agencia (mensajería única vs repartidor independiente). */
  agencyMlFlexMode?: MlFlexMode | null;
  /** Vendedor marketplace: agencia preferida para envíos. */
  preferredAgencyId?: string | null;
  preferredAgencyName?: string | null;
  /** Vendedor registrado de forma independiente (sin agencia fija). */
  isMarketplaceSeller?: boolean;
  city?: string | null;
  province?: string | null;
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
  agencyId?: string | null;
  sellerId: string | null;
  sellerName: string | null;
  clientName: string;
  clientPhone: string;
  address: string;
  lat: number;
  lng: number;
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

export interface JwtPayload {
  userId: string;
  role: UserRole;
}

export interface DbUserRow {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  agency_id: string | null;
  preferred_agency_id: string | null;
  city: string | null;
  province: string | null;
  password_hash: string;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: Date | null;
  departure_address: string | null;
  departure_lat: number | null;
  departure_lng: number | null;
  delivery_zone: string | null;
}

export interface DbOrderRow {
  id: string;
  agency_id: string | null;
  seller_id: string | null;
  external_source: string | null;
  external_order_id: string | null;
  shipping_type: string | null;
  client_name: string;
  client_phone: string;
  address: string;
  lat: number;
  lng: number;
  status: OrderStatus;
  archived: number;
  repartidor_id: string | null;
  repartidor_name: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}
