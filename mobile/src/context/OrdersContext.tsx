import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useOrders } from '../hooks/useOrders';
import { useLocationReporter } from '../hooks/useLocationReporter';
import { api, MercadoLibreScanImportResult } from '../api';
import { getScanGeolocation } from '../utils/scanLocation';
import { Order, OrderStatus } from '../types';

interface OrdersState {
  orders: Order[];
  loading: boolean;
  refreshing: boolean;
  connected: boolean;
  error: string | null;
  coords: { lat: number; lng: number } | null;
  permissionDenied: boolean;
  deliveringOrder: Order | null;
  refresh: () => Promise<void>;
  updateStatus: (
    orderId: string,
    status: OrderStatus,
    opts?: { repartidorId?: string; comment?: string }
  ) => Promise<Order>;
  getOrder: (orderId: string) => Order | undefined;
  scanMercadoLibreLabel: (code: string) => Promise<MercadoLibreScanImportResult>;
}

const OrdersContext = createContext<OrdersState | undefined>(undefined);

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const { orders, loading, refreshing, connected, error, refresh } = useOrders(token);

  const deliveringOrder = useMemo(
    () =>
      orders.find(
        (o) => o.repartidorId === user?.id && o.status === OrderStatus.DELIVERING
      ) ?? null,
    [orders, user?.id]
  );

  // GPS de flota siempre activo; si hay pedido en viaje también registra la ruta del envío.
  const { coords, permissionDenied } = useLocationReporter(
    token,
    deliveringOrder?.id ?? null,
    Boolean(token)
  );

  const updateStatus = useMemo(
    () =>
      async (
        orderId: string,
        status: OrderStatus,
        opts?: { repartidorId?: string; comment?: string }
      ): Promise<Order> => {
        if (!token) throw new Error('Sin sesión');
        const updated = await api.updateOrderStatus(token, orderId, status, opts);
        // El socket/polling también lo reflejará, pero refrescamos para feedback inmediato.
        refresh();
        return updated;
      },
    [token, refresh]
  );

  const getOrder = useMemo(
    () => (orderId: string) => orders.find((o) => o.id === orderId),
    [orders]
  );

  const scanMercadoLibreLabel = useMemo(
    () => async (code: string): Promise<MercadoLibreScanImportResult> => {
      if (!token) throw new Error('Sin sesión');
      const loc = await getScanGeolocation();
      const result = await api.scanMercadoLibreLabel(
        token,
        code,
        loc?.lat,
        loc?.lng
      );
      await refresh();
      return result;
    },
    [token, refresh]
  );

  const value = useMemo<OrdersState>(
    () => ({
      orders,
      loading,
      refreshing,
      connected,
      error,
      coords,
      permissionDenied,
      deliveringOrder,
      refresh,
      updateStatus,
      getOrder,
      scanMercadoLibreLabel,
    }),
    [
      orders,
      loading,
      refreshing,
      connected,
      error,
      coords,
      permissionDenied,
      deliveringOrder,
      refresh,
      updateStatus,
      getOrder,
      scanMercadoLibreLabel,
    ]
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrdersContext(): OrdersState {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrdersContext debe usarse dentro de <OrdersProvider>');
  return ctx;
}
