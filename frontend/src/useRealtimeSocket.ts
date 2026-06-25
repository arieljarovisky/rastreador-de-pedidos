import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Order, User, LocationHistoryPoint } from './types.js';
import { socketUrl } from './api.ts';

interface OrderLocationPayload {
  orderId: string;
  sellerId: string | null;
  repartidorId: string;
  repartidorName: string | null;
  point: LocationHistoryPoint;
}

interface RepartidorLocationPayload {
  repartidorId: string;
  name: string;
  location: LocationHistoryPoint;
}

interface UseRealtimeSocketOptions {
  token: string | null;
  activeOrderId: string | null;
  onOrderUpdated: (order: Order) => void;
  onOrderLocation: (payload: OrderLocationPayload) => void;
  onRepartidorLocation: (payload: RepartidorLocationPayload) => void;
  onConnectionChange: (connected: boolean) => void;
}

export function useRealtimeSocket({
  token,
  activeOrderId,
  onOrderUpdated,
  onOrderLocation,
  onRepartidorLocation,
  onConnectionChange,
}: UseRealtimeSocketOptions): void {
  const socketRef = useRef<Socket | null>(null);
  const trackedOrderRef = useRef<string | null>(null);

  const callbacksRef = useRef({
    onOrderUpdated,
    onOrderLocation,
    onRepartidorLocation,
    onConnectionChange,
  });

  callbacksRef.current = {
    onOrderUpdated,
    onOrderLocation,
    onRepartidorLocation,
    onConnectionChange,
  };

  useEffect(() => {
    if (!token) return;

    const socket = io(socketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    const handleConnect = () => {
      callbacksRef.current.onConnectionChange(true);
      if (trackedOrderRef.current) {
        socket.emit('track:order', trackedOrderRef.current);
      }
    };
    const handleDisconnect = () => callbacksRef.current.onConnectionChange(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('order:updated', (order: Order) => callbacksRef.current.onOrderUpdated(order));
    socket.on('order:location', (payload: OrderLocationPayload) =>
      callbacksRef.current.onOrderLocation(payload)
    );
    socket.on('repartidor:location', (payload: RepartidorLocationPayload) =>
      callbacksRef.current.onRepartidorLocation(payload)
    );

    if (socket.connected) handleConnect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.disconnect();
      socketRef.current = null;
      callbacksRef.current.onConnectionChange(false);
    };
  }, [token]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;

    if (trackedOrderRef.current && trackedOrderRef.current !== activeOrderId) {
      socket.emit('untrack:order', trackedOrderRef.current);
    }

    if (activeOrderId) {
      socket.emit('track:order', activeOrderId);
      trackedOrderRef.current = activeOrderId;
    } else {
      trackedOrderRef.current = null;
    }
  }, [activeOrderId, token]);
}
