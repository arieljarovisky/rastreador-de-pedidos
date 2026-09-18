import { Server } from 'socket.io';
import { Order, User, LocationHistoryPoint, AppNotification } from '../types/index.js';
import { UserRole } from '../types/index.js';
import { isAgencyAdmin } from '../utils/roles.js';
import { logRepartidorGps } from '../utils/repartidorGpsLog.js';

let io: Server | null = null;

export function initIO(server: Server): void {
  io = server;
}

export function getIO(): Server | null {
  return io;
}

function trackingRooms(sellerId: string | null, orderId: string, repartidorId?: string | null): string[] {
  const rooms = ['tracking', `order:${orderId}`];
  if (sellerId) rooms.push(`seller:${sellerId}`);
  if (repartidorId) rooms.push(`repartidor:${repartidorId}`);
  return rooms;
}

export function emitOrderUpdated(order: Order, sellerId: string | null): void {
  if (!io) return;
  const rooms = trackingRooms(sellerId, order.id, order.repartidorId);
  for (const room of rooms) {
    io.to(room).emit('order:updated', order);
  }
}

export function emitOrderDeleted(
  orderId: string,
  sellerId: string | null,
  agencyId?: string | null
): void {
  if (!io) return;
  // Scope por agencia (nunca broadcast a 'tracking': filtraba entre agencias).
  if (agencyId) {
    io.to(`agency:${agencyId}`).emit('order:deleted', { orderId, sellerId });
  }
  if (sellerId) {
    io.to(`seller:${sellerId}`).emit('order:deleted', { orderId, sellerId });
  }
}

export function emitOrderLocation(
  payload: {
    orderId: string;
    sellerId: string | null;
    repartidorId: string;
    repartidorName: string | null;
    point: LocationHistoryPoint;
  }
): void {
  if (!io) return;
  const rooms = trackingRooms(payload.sellerId, payload.orderId, payload.repartidorId);
  for (const room of rooms) {
    io.to(room).emit('order:location', payload);
  }
}

export function emitRepartidorLocation(repartidor: User): void {
  if (!io || !repartidor.currentLocation || !repartidor.agencyId) return;
  logRepartidorGps('socket_emit', repartidor, {
    lat: repartidor.currentLocation.lat,
    lng: repartidor.currentLocation.lng,
    savedAt: repartidor.currentLocation.timestamp,
  });
  // Scope por agencia (nunca broadcast a 'tracking': filtraba entre agencias).
  io.to(`agency:${repartidor.agencyId}`).emit('repartidor:location', {
    repartidorId: repartidor.id,
    name: repartidor.name,
    location: repartidor.currentLocation,
  });
}

export function emitNotificationCreated(notification: AppNotification): void {
  if (!io) return;
  // Solo al destinatario (nunca broadcast a 'tracking': filtraba entre agencias).
  if (!notification.userId || notification.userId === 'all') return;
  io.to(`user:${notification.userId}`).emit('notification:created', notification);
}

export function joinUserRooms(
  socketId: string,
  user: { id: string; role: UserRole; agencyId?: string | null }
): void {
  if (!io) return;
  const socket = io.sockets.sockets.get(socketId);
  if (!socket) return;

  socket.join('tracking');
  socket.join(`user:${user.id}`);
  if (user.agencyId) {
    socket.join(`agency:${user.agencyId}`);
  }

  if (isAgencyAdmin(user.role)) {
    socket.join('logistics');
  }
  if (user.role === UserRole.STORE_ADMIN) {
    socket.join(`seller:${user.id}`);
  }
  if (user.role === UserRole.REPARTIDOR) {
    socket.join(`repartidor:${user.id}`);
  }
}
