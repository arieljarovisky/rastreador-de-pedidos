import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { socketUrl } from '../config';

/**
 * Suscribe el socket al room `order:{id}` para recibir ubicaciones con prioridad.
 * Complementa el room global `tracking` del hook useOrders.
 */
export function useTrackOrder(token: string | null, orderId: string | null): void {
  const socketRef = useRef<Socket | null>(null);
  const trackedRef = useRef<string | null>(null);
  const orderIdRef = useRef(orderId);
  orderIdRef.current = orderId;

  const syncSubscription = (socket: Socket) => {
    if (trackedRef.current && trackedRef.current !== orderIdRef.current) {
      socket.emit('untrack:order', trackedRef.current);
    }
    if (orderIdRef.current) {
      socket.emit('track:order', orderIdRef.current);
      trackedRef.current = orderIdRef.current;
    } else {
      trackedRef.current = null;
    }
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

    const onConnect = () => syncSubscription(socket);
    socket.on('connect', onConnect);
    if (socket.connected) onConnect();

    return () => {
      if (trackedRef.current) {
        socket.emit('untrack:order', trackedRef.current);
      }
      socket.off('connect', onConnect);
      socket.disconnect();
      socketRef.current = null;
      trackedRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    syncSubscription(socket);
  }, [orderId]);
}
