import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useOrders } from '../hooks/useOrders';
import { api, MercadoLibreScanImportResult } from '../api';
import { Order, OrderStatus, User } from '../types';

interface AgencyOrdersState {
  orders: Order[];
  repartidores: User[];
  sellers: User[];
  loading: boolean;
  refreshing: boolean;
  connected: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getOrder: (orderId: string) => Order | undefined;
  assignRepartidor: (orderId: string, repartidorId: string) => Promise<Order>;
  unassignRepartidor: (orderId: string) => Promise<Order>;
  assignSeller: (orderId: string, sellerId: string) => Promise<Order>;
  updateStatus: (orderId: string, status: OrderStatus, comment?: string) => Promise<Order>;
  cancelOrder: (orderId: string) => Promise<Order>;
  deleteOrder: (orderId: string) => Promise<void>;
  archiveOrder: (orderId: string, archived: boolean) => Promise<Order>;
  scanMercadoLibreLabel: (
    code: string,
    sellerId: string
  ) => Promise<MercadoLibreScanImportResult>;
}

const AgencyOrdersContext = createContext<AgencyOrdersState | undefined>(undefined);

export function AgencyOrdersProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { orders, repartidores, loading, refreshing, connected, error, refresh } = useOrders(
    token,
    { trackRepartidores: true }
  );
  const [sellers, setSellers] = useState<User[]>([]);

  const loadSellers = useMemo(
    () => async () => {
      if (!token) return;
      const data = await api.getSellers(token);
      setSellers(data);
    },
    [token]
  );

  useEffect(() => {
    void loadSellers();
  }, [loadSellers]);

  const refreshAll = useMemo(
    () => async () => {
      await Promise.all([refresh(), loadSellers()]);
    },
    [refresh, loadSellers]
  );

  const getOrder = useMemo(
    () => (orderId: string) => orders.find((o) => o.id === orderId),
    [orders]
  );

  const assignRepartidor = useMemo(
    () => async (orderId: string, repartidorId: string) => {
      if (!token) throw new Error('Sin sesión');
      const order = await api.updateOrderStatus(token, orderId, OrderStatus.ASSIGNED, {
        repartidorId,
        comment: 'Asignado desde app de agencia',
      });
      await refreshAll();
      return order;
    },
    [token, refreshAll]
  );

  const unassignRepartidor = useMemo(
    () => async (orderId: string) => {
      if (!token) throw new Error('Sin sesión');
      const order = await api.updateOrderStatus(token, orderId, OrderStatus.PENDING, {
        comment: 'Repartidor desasignado desde app de agencia',
      });
      await refreshAll();
      return order;
    },
    [token, refreshAll]
  );

  const assignSeller = useMemo(
    () => async (orderId: string, sellerId: string) => {
      if (!token) throw new Error('Sin sesión');
      const order = await api.assignOrderSeller(token, orderId, sellerId);
      await refreshAll();
      return order;
    },
    [token, refreshAll]
  );

  const updateStatus = useMemo(
    () => async (orderId: string, status: OrderStatus, comment?: string) => {
      if (!token) throw new Error('Sin sesión');
      const order = await api.updateOrderStatus(token, orderId, status, { comment });
      await refreshAll();
      return order;
    },
    [token, refreshAll]
  );

  const cancelOrder = useMemo(
    () => async (orderId: string) => {
      if (!token) throw new Error('Sin sesión');
      const order = await api.cancelOrder(token, orderId, 'Cancelado desde app de agencia');
      await refreshAll();
      return order;
    },
    [token, refreshAll]
  );

  const deleteOrder = useMemo(
    () => async (orderId: string) => {
      if (!token) throw new Error('Sin sesión');
      await api.deleteOrder(token, orderId);
      await refreshAll();
    },
    [token, refreshAll]
  );

  const archiveOrder = useMemo(
    () => async (orderId: string, archived: boolean) => {
      if (!token) throw new Error('Sin sesión');
      const order = await api.archiveOrder(token, orderId, archived);
      await refreshAll();
      return order;
    },
    [token, refreshAll]
  );

  const scanMercadoLibreLabel = useMemo(
    () => async (code: string, sellerId: string) => {
      if (!token) throw new Error('Sin sesión');
      const { getScanGeolocation } = await import('../utils/scanLocation');
      const loc = await getScanGeolocation();
      const result = await api.scanMercadoLibreLabel(
        token,
        code,
        loc?.lat,
        loc?.lng,
        sellerId
      );
      await refreshAll();
      return result;
    },
    [token, refreshAll]
  );

  const value = useMemo<AgencyOrdersState>(
    () => ({
      orders,
      repartidores,
      sellers,
      loading,
      refreshing,
      connected,
      error,
      refresh: refreshAll,
      getOrder,
      assignRepartidor,
      unassignRepartidor,
      assignSeller,
      updateStatus,
      cancelOrder,
      deleteOrder,
      archiveOrder,
      scanMercadoLibreLabel,
    }),
    [
      orders,
      repartidores,
      sellers,
      loading,
      refreshing,
      connected,
      error,
      refreshAll,
      getOrder,
      assignRepartidor,
      unassignRepartidor,
      assignSeller,
      updateStatus,
      cancelOrder,
      deleteOrder,
      archiveOrder,
      scanMercadoLibreLabel,
    ]
  );

  return (
    <AgencyOrdersContext.Provider value={value}>{children}</AgencyOrdersContext.Provider>
  );
}

export function useAgencyOrdersContext(): AgencyOrdersState {
  const ctx = useContext(AgencyOrdersContext);
  if (!ctx) {
    throw new Error('useAgencyOrdersContext debe usarse dentro de <AgencyOrdersProvider>');
  }
  return ctx;
}
