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
  agencyId?: string | null;
  agencyName?: string | null;
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
  /** Corte de entrega (21:00 AR del día operativo). */
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

export interface JwtPayload {
  userId: string;
  role: UserRole;
  /** Identificador de sesión activa (solo repartidores). */
  sessionId?: string;
}

export interface DbUserRow {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  agency_id: string | null;
  password_hash: string;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: Date | null;
  departure_address: string | null;
  departure_lat: number | null;
  departure_lng: number | null;
  delivery_zone: string | null;
  session_token: string | null;
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
  delivery_deadline: Date | null;
  ml_shipment_status: string | null;
  ml_shipment_substatus: string | null;
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
