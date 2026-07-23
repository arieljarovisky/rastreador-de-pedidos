import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { api } from '../api';
import { socketUrl, POLL_INTERVAL_MS } from '../config';
import { Order, User, AppNotification } from '../types';
import { normalizeOrder, normalizeOrders } from '../utils/normalizeOrder';
import { mergeRepartidorLocation, mergeRepartidoresFromServer } from '../utils/repartidorLocation';
import { showLocalNotification } from './usePushNotifications';

interface OrderLocationPayload {
  orderId: string;
  repartidorId: string;
  repartidorName?: string | null;
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
  /** Repartidor: sincroniza escaneos Flex al cargar y con mayor frecuencia */
  flexSync?: boolean;
  onNotificationCreated?: (notification: AppNotification) => void;
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
  const { trackRepartidores = false, flexSync = false, onNotificationCreated } = options;
  const [orders, setOrders] = useState<Order[]>([]);
  const [repartidores, setRepartidores] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const initialLoadDoneRef = useRef(false);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const onNotificationRef = useRef(onNotificationCreated);
  onNotificationRef.current = onNotificationCreated;

  const mergeOrder = useCallback((order: Order) => {
    const normalized = normalizeOrder(order);
    setOrders((prev) => {
      const i = prev.findIndex((o) => o.id === normalized.id);
      if (i === -1) return [normalized, ...prev];
      const next = [...prev];
      next[i] = normalized;
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
        const history = order.locationHistory ?? [];
        const last = history[history.length - 1];
        if (last?.timestamp === payload.point.timestamp) return order;
        return {
          ...order,
          locationHistory: [...history, payload.point],
          updatedAt: payload.point.timestamp,
        };
      })
    );
    if (trackRepartidores) {
      setRepartidores((prev) =>
        mergeRepartidorLocation(
          prev,
          payload.repartidorId,
          payload.point,
          payload.repartidorName
        )
      );
    }
  }, [trackRepartidores]);

  const applyRepartidorLocation = useCallback((payload: RepartidorLocationPayload) => {
    setRepartidores((prev) => {
      if (trackRepartidores) {
        const onSellerOrder = ordersRef.current.some(
          (o) => !o.archived && o.repartidorId === payload.repartidorId
        );
        if (!onSellerOrder && !prev.some((r) => r.id === payload.repartidorId)) {
          return prev;
        }
      }
      return mergeRepartidorLocation(prev, payload.repartidorId, payload.location, payload.name);
    });
  }, [trackRepartidores]);

  const load = useCallback(async (opts?: { forceFlexSync?: boolean }) => {
    if (!token) return;
    try {
      const useFlex = Boolean(flexSync && opts?.forceFlexSync);
      const ordersPromise = useFlex
        ? api.syncFlexOrders(token).then((r) => r.orders)
        : api.getOrders(token);
      const requests: [Promise<Order[]>, Promise<User[] | null>] = [
        ordersPromise,
        trackRepartidores ? api.getRepartidores(token) : Promise.resolve(null),
      ];
      const [ordersData, repsData] = await Promise.all(requests);
      setOrders(normalizeOrders(ordersData));
      if (repsData) setRepartidores((prev) => mergeRepartidoresFromServer(prev, repsData));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los pedidos.');
    }
  }, [token, trackRepartidores, flexSync]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load({ forceFlexSync: flexSync });
    setRefreshing(false);
  }, [load, flexSync]);

  useEffect(() => {
    if (!token) {
      initialLoadDoneRef.current = false;
      setOrders([]);
      setLoading(false);
      return;
    }

    const isInitial = !initialLoadDoneRef.current;
    if (isInitial) setLoading(true);

    load({ forceFlexSync: flexSync })
      .catch(() => undefined)
      .finally(() => {
        setLoading(false);
        initialLoadDoneRef.current = true;
      });
  }, [token, load, flexSync]);

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
    socket.on('order:updated', (order: Order) => {
      if (order.externalSource === 'mercadolibre' || order.shippingType === 'flex') {
        console.log('[posta-flex] order:updated', {
          orderId: order.id,
          status: order.status,
          repartidorId: order.repartidorId,
          externalOrderId: order.externalOrderId,
          shippingType: order.shippingType,
        });
      }
      mergeOrder(order);
    });
    socket.on('order:deleted', (p: { orderId: string }) => removeOrder(p.orderId));
    socket.on('order:location', (p: OrderLocationPayload) => applyLocation(p));
    if (trackRepartidores) {
      socket.on('repartidor:location', (p: RepartidorLocationPayload) =>
        applyRepartidorLocation(p)
      );
    }
    socket.on('notification:created', (notification: AppNotification) => {
      onNotificationRef.current?.(notification);
      // Solo alerta local en primer plano; en background llega el push.
      if (AppState.currentState === 'active') {
        void showLocalNotification(notification.title, notification.body, {
          notificationId: notification.id,
          type: notification.type,
          ...(notification.orderId ? { orderId: notification.orderId } : {}),
        });
      }
    });

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
    if (!token || !flexSync) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load({ forceFlexSync: true });
    });
    return () => sub.remove();
  }, [token, flexSync, load]);

  useEffect(() => {
    if (!token) return;
    // Poll liviano (GET). Flex forzado solo al abrir / volver a foreground / pull-to-refresh.
    const pollMs = connected ? POLL_INTERVAL_MS * 5 : POLL_INTERVAL_MS;
    const interval = setInterval(() => {
      void load();
    }, pollMs);
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
