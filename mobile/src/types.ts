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

export function isAgencyAdmin(role: UserRole): boolean {
  return role === UserRole.SUPER_ADMIN || role === UserRole.LOGISTICS_ADMIN;
}

/** Etiqueta legible para cada estado de pedido. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'Pendiente',
  [OrderStatus.ASSIGNED]: 'Asignado',
  [OrderStatus.DELIVERING]: 'En viaje',
  [OrderStatus.DELIVERED]: 'Entregado',
  [OrderStatus.CANCELLED]: 'Cancelado',
};
