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
  currentLocation?: UserLocation;
  departurePoint?: LocationPoint;
  pickupPoints?: PickupPoint[];
}

export interface OrderHistoryEvent {
  status: OrderStatus;
  timestamp: string;
  updatedBy: string;
  comment?: string;
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
  password_hash: string;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: Date | null;
  departure_address: string | null;
  departure_lat: number | null;
  departure_lng: number | null;
}

export interface DbOrderRow {
  id: string;
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
  repartidor_id: string | null;
  repartidor_name: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}
