import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '../api';
import { socketUrl, POLL_INTERVAL_MS } from '../config';
import { Order } from '../types';

interface OrderLocationPayload {
  orderId: string;
  repartidorId: string;
  point: { lat: number; lng: number; timestamp: string };
}

interface UseOrdersResult {
  orders: Order[];
  loading: boolean;
  refreshing: boolean;
  connected: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Carga los pedidos del repartidor y los mantiene actualizados con:
 *  - socket.io (eventos order:updated / order:deleted / order:location), igual que la web
 *  - polling de respaldo cada POLL_INTERVAL_MS por si el socket se cae
 */
export function useOrders(token: string | null): UseOrdersResult {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const mergeOrder = useCallback((order: Order) => {
    setOrders((prev) => {
      const i = prev.findIndex((o) => o.id === order.id);
      if (i === -1) return [order, ...prev];
      const next = [...prev];
      next[i] = order;
      return next;
    });
  }, []);

  const removeOrder = useCallback((orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }, []);

  const applyLocation = useCallback((payload: OrderLocationPayload) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== payload.orderId) return order;
        const last = order.locationHistory[order.locationHistory.length - 1];
        if (last?.timestamp === payload.point.timestamp) return order;
        return {
          ...order,
          locationHistory: [...order.locationHistory, payload.point],
          updatedAt: payload.point.timestamp,
        };
      })
    );
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getOrders(token);
      setOrders(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los pedidos.');
    }
  }, [token]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Carga inicial
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [token, load]);

  // Socket de tiempo real
  useEffect(() => {
    if (!token) return;
    const socket = io(socketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('order:updated', (order: Order) => mergeOrder(order));
    socket.on('order:deleted', (p: { orderId: string }) => removeOrder(p.orderId));
    socket.on('order:location', (p: OrderLocationPayload) => applyLocation(p));

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token, mergeOrder, removeOrder, applyLocation]);

  // Polling de respaldo (más frecuente si el socket está caído)
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      load();
    }, connected ? POLL_INTERVAL_MS * 5 : POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token, connected, load]);

  return { orders, loading, refreshing, connected, error, refresh };
}
