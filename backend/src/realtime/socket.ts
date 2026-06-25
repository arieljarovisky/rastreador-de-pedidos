import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { env } from '../config/env.js';
import { verifyToken } from '../middleware/auth.js';
import { getUserById } from '../services/users.service.js';
import { initIO, joinUserRooms } from './io.js';

export function setupSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigins,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  initIO(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        next(new Error('Token requerido'));
        return;
      }

      const payload = verifyToken(token);
      if (!payload) {
        next(new Error('Token inválido'));
        return;
      }

      const user = await getUserById(payload.userId);
      if (!user || user.role !== payload.role) {
        next(new Error('Usuario no válido'));
        return;
      }

      socket.data.user = user;
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error('Error de autenticación'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    joinUserRooms(socket.id, user);
    console.log(`[socket] ${user.name} (${user.role}) conectado`);

    socket.on('track:order', (orderId: string) => {
      if (typeof orderId === 'string' && orderId.length > 0) {
        socket.join(`order:${orderId}`);
      }
    });

    socket.on('untrack:order', (orderId: string) => {
      if (typeof orderId === 'string' && orderId.length > 0) {
        socket.leave(`order:${orderId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[socket] ${user.name} desconectado`);
    });
  });

  return io;
}
