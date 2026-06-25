/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  STORE_ADMIN = 'store_admin',
  LOGISTICS_ADMIN = 'logistics_admin',
  REPARTIDOR = 'repartidor',
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

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  currentLocation?: UserLocation;
}

export interface OrderHistoryEvent {
  status: OrderStatus;
  timestamp: string;
  updatedBy: string; // Nombre del usuario que lo actualizó
  comment?: string;
}

export interface LocationHistoryPoint {
  lat: number;
  lng: number;
  timestamp: string;
}

export interface Order {
  id: string;
  clientName: string;
  clientPhone: string;
  address: string;
  lat: number; // Latitud de entrega
  lng: number; // Longitud de entrega
  status: OrderStatus;
  repartidorId: string | null;
  repartidorName: string | null;
  createdAt: string;
  updatedAt: string;
  history: OrderHistoryEvent[];
  locationHistory: LocationHistoryPoint[];
  notes?: string;
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
