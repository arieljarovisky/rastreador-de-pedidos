import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '../api';
import { socketUrl, POLL_INTERVAL_MS } from '../config';
import { Order, User } from '../types';

interface OrderLocationPayload {
  orderId: string;
  repartidorId: string;
  point: { lat: number; lng: number; timestamp: string };
}

interface RepartidorLocationPayload {
  repartidorId: string;
  name: string;
  location: { lat: number; lng: number; timestamp: string };
}

interface UseOrdersOptions {
  /** Vendedor: cargar repartidores y escuchar GPS en vivo */
  trackRepartidores?: boolean;
}

interface UseOrdersResult {
  orders: Order[];
  repartidores: User[];
  loading: boolean;
  refreshing: boolean;
  connected: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useOrders(
  token: string | null,
  options: UseOrdersOptions = {}
): UseOrdersResult {
  const { trackRepartidores = false } = options;
  const [orders, setOrders] = useState<Order[]>([]);
  const [repartidores, setRepartidores] = useState<User[]>([]);
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

  const applyRepartidorLocation = useCallback((payload: RepartidorLocationPayload) => {
    setRepartidores((prev) =>
      prev.map((rep) =>
        rep.id === payload.repartidorId
          ? {
              ...rep,
              name: payload.name || rep.name,
              currentLocation: {
                lat: payload.location.lat,
                lng: payload.location.lng,
                timestamp: payload.location.timestamp,
              },
            }
          : rep
      )
    );
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const requests: [Promise<Order[]>, Promise<User[] | null>] = [
        api.getOrders(token),
        trackRepartidores ? api.getRepartidores(token) : Promise.resolve(null),
      ];
      const [ordersData, repsData] = await Promise.all(requests);
      setOrders(ordersData);
      if (repsData) setRepartidores(repsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los pedidos.');
    }
  }, [token, trackRepartidores]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [token, load]);

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
    if (trackRepartidores) {
      socket.on('repartidor:location', (p: RepartidorLocationPayload) =>
        applyRepartidorLocation(p)
      );
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [
    token,
    trackRepartidores,
    mergeOrder,
    removeOrder,
    applyLocation,
    applyRepartidorLocation,
  ]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      load();
    }, connected ? POLL_INTERVAL_MS * 5 : POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token, connected, load]);

  return {
    orders,
    repartidores,
    loading,
    refreshing,
    connected,
    error,
    refresh,
  };
}
