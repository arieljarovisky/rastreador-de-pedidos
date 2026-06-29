import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useOrders } from '../hooks/useOrders';
import { api } from '../api';
import { MarketplaceImportResult, MarketplacePlatform, Order, User } from '../types';

interface CreateOrderInput {
  clientName: string;
  clientPhone?: string;
  address: string;
  lat: number;
  lng: number;
  notes?: string;
}

interface SellerOrdersState {
  orders: Order[];
  repartidores: User[];
  loading: boolean;
  refreshing: boolean;
  connected: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getOrder: (orderId: string) => Order | undefined;
  createOrder: (data: CreateOrderInput) => Promise<Order>;
  cancelOrder: (orderId: string) => Promise<Order>;
  deleteOrder: (orderId: string) => Promise<void>;
  archiveOrder: (orderId: string, archived: boolean) => Promise<Order>;
  importShipments: (
    platform: MarketplacePlatform,
    externalIds: string[]
  ) => Promise<MarketplaceImportResult>;
}

const SellerOrdersContext = createContext<SellerOrdersState | undefined>(undefined);

export function SellerOrdersProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { orders, repartidores, loading, refreshing, connected, error, refresh } = useOrders(
    token,
    { trackRepartidores: true }
  );

  const getOrder = useMemo(
    () => (orderId: string) => orders.find((o) => o.id === orderId),
    [orders]
  );

  const createOrder = useMemo(
    () => async (data: CreateOrderInput) => {
      if (!token) throw new Error('Sin sesión');
      const order = await api.createOrder(token, data);
      await refresh();
      return order;
    },
    [token, refresh]
  );

  const cancelOrder = useMemo(
    () => async (orderId: string) => {
      if (!token) throw new Error('Sin sesión');
      const order = await api.cancelOrder(token, orderId);
      await refresh();
      return order;
    },
    [token, refresh]
  );

  const deleteOrder = useMemo(
    () => async (orderId: string) => {
      if (!token) throw new Error('Sin sesión');
      await api.deleteOrder(token, orderId);
      await refresh();
    },
    [token, refresh]
  );

  const archiveOrder = useMemo(
    () => async (orderId: string, archived: boolean) => {
      if (!token) throw new Error('Sin sesión');
      const order = await api.archiveOrder(token, orderId, archived);
      await refresh();
      return order;
    },
    [token, refresh]
  );

  const importShipments = useMemo(
    () => async (platform: MarketplacePlatform, externalIds: string[]) => {
      if (!token) throw new Error('Sin sesión');
      const result = await api.importMarketplaceShipments(token, platform, externalIds);
      await refresh();
      return result;
    },
    [token, refresh]
  );

  const value = useMemo<SellerOrdersState>(
    () => ({
      orders,
      repartidores,
      loading,
      refreshing,
      connected,
      error,
      refresh,
      getOrder,
      createOrder,
      cancelOrder,
      deleteOrder,
      archiveOrder,
      importShipments,
    }),
    [
      orders,
      repartidores,
      loading,
      refreshing,
      connected,
      error,
      refresh,
      getOrder,
      createOrder,
      cancelOrder,
      deleteOrder,
      archiveOrder,
      importShipments,
    ]
  );

  return (
    <SellerOrdersContext.Provider value={value}>{children}</SellerOrdersContext.Provider>
  );
}

export function useSellerOrdersContext(): SellerOrdersState {
  const ctx = useContext(SellerOrdersContext);
  if (!ctx) {
    throw new Error('useSellerOrdersContext debe usarse dentro de <SellerOrdersProvider>');
  }
  return ctx;
}
