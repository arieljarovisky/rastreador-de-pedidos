/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { User, UserRole, Order, OrderStatus, AppNotification, LocationPoint, PickupPoint, isAgencyAdmin, SellerDetail, MarketplaceIntegrationStatus, MarketplaceShipmentPreview } from './types.js';
import LoginScreen from './components/LoginScreen.tsx';
import AdminDashboard from './components/AdminDashboard.tsx';
import SettingsPage from './components/SettingsPage.tsx';
import RepartidorDashboard from './components/RepartidorDashboard.tsx';
import NotificationHub, { playNotificationSound } from './components/NotificationHub.tsx';
import NotifsSidebar from './components/NotifsSidebar.tsx';
import { LogOut, Bell, Settings, LayoutDashboard } from 'lucide-react';
import PostaLogo from './components/ui/PostaLogo.tsx';
import ConnectionIndicator from './components/ui/ConnectionIndicator.tsx';
import { applyPostaTheme, readPostaTheme, type PostaTheme } from './theme/usePostaTheme.ts';
import ThemeToggle from './components/ui/ThemeToggle.tsx';
import { apiUrl } from './api.ts';
import { useRealtimeSocket } from './useRealtimeSocket.ts';
import { useModal } from './context/ModalContext.tsx';

type AppTab = 'dashboard' | 'notifications' | 'settings';
const ACTIVE_TAB_KEY = 'lupo_active_tab';
const NOTIFS_SIDEBAR_KEY = 'lupo_notifs_sidebar';

function readSavedTab(): AppTab {
  const saved = localStorage.getItem(ACTIVE_TAB_KEY);
  if (saved === 'dashboard' || saved === 'notifications' || saved === 'settings') {
    return saved;
  }
  return 'dashboard';
}

function readNotifsSidebarOpen(): boolean {
  return localStorage.getItem(NOTIFS_SIDEBAR_KEY) !== 'closed';
}

export default function App() {
  const { alert: showAlert } = useModal();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Estados de datos
  const [orders, setOrders] = useState<Order[]>([]);
  const [repartidores, setRepartidores] = useState<User[]>([]);
  const [sellers, setSellers] = useState<User[]>([]);
  const [departurePoint, setDeparturePoint] = useState<LocationPoint | null>(null);
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [mobileTab, setMobileTabState] = useState<AppTab>(readSavedTab);
  const [integrationStatus, setIntegrationStatus] = useState<MarketplaceIntegrationStatus | null>(null);
  const [integrationStatusLoading, setIntegrationStatusLoading] = useState(false);

  const setMobileTab = useCallback((tab: AppTab) => {
    setMobileTabState(tab);
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const integration = params.get('integration');
    const status = params.get('status');
    const message = params.get('message');
    const tab = params.get('tab');
    if (tab === 'settings') setMobileTabState('settings');
    if (integration && status) {
      setMobileTabState('settings');
      const platformLabel = integration === 'mercadolibre' ? 'Mercado Libre' : 'Tienda Nube';
      if (status === 'connected') {
        void showAlert({
          title: 'Cuenta conectada',
          message: `Tu cuenta de ${platformLabel} fue vinculada correctamente.`,
          variant: 'success',
        });
      } else {
        void showAlert({
          title: 'Error de conexión',
          message: message || `No se pudo conectar ${platformLabel}.`,
          variant: 'error',
        });
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [showAlert]);

  const [notifsSidebarOpen, setNotifsSidebarOpen] = useState(readNotifsSidebarOpen);
  const [theme, setThemeState] = useState<PostaTheme>(() => readPostaTheme());

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: PostaTheme = prev === 'dark' ? 'paper' : 'dark';
      applyPostaTheme(next);
      return next;
    });
  }, []);

  const toggleNotifsSidebar = useCallback(() => {
    setNotifsSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem(NOTIFS_SIDEBAR_KEY, next ? 'open' : 'closed');
      return next;
    });
  }, []);

  // Estado de red
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date>(new Date());

  // Al iniciar, verificar sesión guardada en LocalStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('lupo_token');
    const savedUser = localStorage.getItem('lupo_user');

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);

    // Escuchar cambios de conectividad de red
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (!token) return;

    try {
      const headers = { Authorization: `Bearer ${token}` };

      const ordersRes = await fetch(apiUrl('/api/orders'), { headers });
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data);
      }

      const notifsRes = await fetch(apiUrl('/api/notifications'), { headers });
      if (notifsRes.ok) {
        const data = await notifsRes.json();
        setNotifications(data);
      }

      if (user?.role === UserRole.STORE_ADMIN || isAgencyAdmin(user.role) || user?.role === UserRole.REPARTIDOR) {
        const depRes = await fetch(apiUrl('/api/accounts/agency/departure'), { headers });
        if (depRes.ok) {
          const data = await depRes.json();
          setDeparturePoint(data);
        }

        const ppRes = await fetch(apiUrl('/api/accounts/pickup-points'), { headers });
        if (ppRes.ok) {
          const data = await ppRes.json();
          setPickupPoints(data);
        }
      }

      if (user?.role === UserRole.STORE_ADMIN || isAgencyAdmin(user.role)) {
        const repsRes = await fetch(apiUrl('/api/repartidores'), { headers });
        if (repsRes.ok) {
          const data = await repsRes.json();
          setRepartidores(data);
        }
      }

      if (isAgencyAdmin(user.role)) {
        const sellersRes = await fetch(apiUrl('/api/accounts/sellers'), { headers });
        if (sellersRes.ok) {
          const data = await sellersRes.json();
          setSellers(data);
        }
      }

      setLastSyncAt(new Date());
    } catch (e) {
      console.warn('Error syncing data from server.', e);
    }
  }, [token, user?.role]);

  const mergeOrder = useCallback((order: Order) => {
    setOrders((prev) => {
      const index = prev.findIndex((o) => o.id === order.id);
      if (index === -1) return [order, ...prev];
      const next = [...prev];
      next[index] = order;
      return next;
    });
    setLastSyncAt(new Date());
  }, []);

  const removeOrder = useCallback((orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    setActiveOrderId((current) => (current === orderId ? null : current));
    setLastSyncAt(new Date());
  }, []);

  const applyOrderLocation = useCallback(
    (payload: {
      orderId: string;
      repartidorId: string;
      point: { lat: number; lng: number; timestamp: string };
    }) => {
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

      setRepartidores((prev) =>
        prev.map((rep) =>
          rep.id === payload.repartidorId
            ? { ...rep, currentLocation: payload.point }
            : rep
        )
      );
      setLastSyncAt(new Date());
    },
    []
  );

  useRealtimeSocket({
    token,
    activeOrderId,
    onOrderUpdated: mergeOrder,
    onOrderDeleted: removeOrder,
    onOrderLocation: applyOrderLocation,
    onRepartidorLocation: (payload) => {
      setRepartidores((prev) =>
        prev.map((rep) =>
          rep.id === payload.repartidorId
            ? { ...rep, currentLocation: payload.location }
            : rep
        )
      );
      setLastSyncAt(new Date());
    },
    onConnectionChange: setWsConnected,
  });

  // Sincronización inicial + respaldo si WebSocket cae
  useEffect(() => {
    if (!token) return;

    fetchData();

    const intervalMs = wsConnected ? 45000 : 8000;
    const interval = setInterval(() => {
      if (navigator.onLine) {
        fetchData();
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [token, wsConnected, fetchData]);

  // Almacenar en caché local para soporte offline
  useEffect(() => {
    if (orders.length > 0) {
      localStorage.setItem('cached_orders', JSON.stringify(orders));
    }
  }, [orders]);

  useEffect(() => {
    if (notifications.length > 0) {
      localStorage.setItem('cached_notifications', JSON.stringify(notifications));
    }
  }, [notifications]);

  // Recuperar caché si se inicia offline
  useEffect(() => {
    if (!isOnline) {
      const cachedOrders = localStorage.getItem('cached_orders');
      const cachedNotifs = localStorage.getItem('cached_notifications');
      if (cachedOrders) setOrders(JSON.parse(cachedOrders));
      if (cachedNotifs) setNotifications(JSON.parse(cachedNotifs));
    }
  }, [isOnline]);

  const handleLogin = async (username: string, password: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Credenciales incorrectas');
      }

      const data = await res.json();
      localStorage.setItem('lupo_token', data.token);
      localStorage.setItem('lupo_user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      if (data.user.departurePoint) {
        setDeparturePoint(data.user.departurePoint);
      }
      if (data.user.pickupPoints) {
        setPickupPoints(data.user.pickupPoints);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Error en la conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (
    endpoint: '/api/auth/register/agency',
    data: { username: string; password: string; name: string }
  ) => {
    setLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'No se pudo crear la cuenta.');
      }

      const result = await res.json();
      localStorage.setItem('lupo_token', result.token);
      localStorage.setItem('lupo_user', JSON.stringify(result.user));
      setToken(result.token);
      setUser(result.user);
    } catch (err: any) {
      setAuthError(err.message || 'Error al registrar la cuenta.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSeller = async (data: {
    username: string;
    password: string;
    name: string;
    pickupLabel?: string;
    pickupAddress?: string;
    pickupLat?: number;
    pickupLng?: number;
  }) => {
    if (!token) return;
    const res = await fetch(apiUrl('/api/accounts/sellers'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo crear el vendedor');
    }
    const created = await res.json();
    setSellers((prev) => [...prev, created]);
    if (created.pickupPoints?.length) {
      setPickupPoints((prev) => [...prev, ...created.pickupPoints]);
    } else {
      fetchData();
    }
    return created;
  };

  const handleFetchSellerDetail = async (sellerId: string): Promise<SellerDetail> => {
    if (!token) throw new Error('Sin sesión');
    const res = await fetch(apiUrl(`/api/accounts/sellers/${sellerId}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo cargar el vendedor');
    }
    return res.json();
  };

  const handleUpdateSellerPassword = async (sellerId: string, password: string) => {
    if (!token) return;
    const res = await fetch(apiUrl(`/api/accounts/sellers/${sellerId}/password`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo actualizar la contraseña');
    }
  };

  const handleCreateRepartidor = async (data: {
    username: string;
    password: string;
    name: string;
    deliveryZone?: string | null;
  }) => {
    if (!token) return;
    const res = await fetch(apiUrl('/api/accounts/repartidores'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo crear el repartidor');
    }
    const created = await res.json();
    setRepartidores((prev) => [...prev, created]);
  };

  const handleUpdateRepartidorZone = async (repartidorId: string, deliveryZone: string | null) => {
    if (!token) return;
    const res = await fetch(apiUrl(`/api/accounts/repartidores/${repartidorId}/zone`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ deliveryZone }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo actualizar la zona');
    }
    const updated = await res.json();
    setRepartidores((prev) => prev.map((r) => (r.id === repartidorId ? updated : r)));
  };

  const handleDeleteRepartidor = async (id: string): Promise<{ finalizedOrders: number }> => {
    if (!token) return { finalizedOrders: 0 };
    const res = await fetch(apiUrl(`/api/accounts/repartidores/${id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo eliminar el repartidor');
    }
    const data = (await res.json()) as { finalizedOrders: number };
    setRepartidores((prev) => prev.filter((r) => r.id !== id));
    await fetchData();
    return data;
  };

  const handleAssignOrderSeller = async (orderId: string, sellerId: string) => {
    if (!token) return;
    const res = await fetch(apiUrl(`/api/orders/${orderId}/seller`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sellerId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo asignar el vendedor');
    }
    fetchData();
  };

  const handleUpdateDeparture = async (data: LocationPoint) => {
    if (!token) return;
    const res = await fetch(apiUrl('/api/accounts/agency/departure'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo guardar el punto de salida');
    }
    const point = await res.json();
    setDeparturePoint(point);
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, departurePoint: point };
      localStorage.setItem('lupo_user', JSON.stringify(next));
      return next;
    });
  };

  const handleCreatePickupPoint = async (data: {
    label?: string;
    address: string;
    lat: number;
    lng: number;
    sellerId?: string;
  }) => {
    if (!token) return;
    const res = await fetch(apiUrl('/api/accounts/pickup-points'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo crear el punto de colecta');
    }
    const point = await res.json();
    setPickupPoints((prev) => [...prev, point]);
    if (user?.role === UserRole.STORE_ADMIN) {
      setUser((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          pickupPoints: [...(prev.pickupPoints ?? []), point],
        };
        localStorage.setItem('lupo_user', JSON.stringify(next));
        return next;
      });
    } else {
      fetchData();
    }
  };

  const handleUpdatePickupPoint = async (
    id: string,
    data: { label?: string; address: string; lat: number; lng: number }
  ) => {
    if (!token) return;
    const res = await fetch(apiUrl(`/api/accounts/pickup-points/${id}`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo actualizar el punto de colecta');
    }
    const updated = await res.json();
    setPickupPoints((prev) => prev.map((p) => (p.id === id ? updated : p)));
    if (user?.role === UserRole.STORE_ADMIN) {
      setUser((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          pickupPoints: (prev.pickupPoints ?? []).map((p) => (p.id === id ? updated : p)),
        };
        localStorage.setItem('lupo_user', JSON.stringify(next));
        return next;
      });
    }
  };

  const handleDeletePickupPoint = async (id: string) => {
    if (!token) return;
    const res = await fetch(apiUrl(`/api/accounts/pickup-points/${id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo eliminar el punto de colecta');
    }
    setPickupPoints((prev) => prev.filter((p) => p.id !== id));
    if (user?.role === UserRole.STORE_ADMIN) {
      setUser((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          pickupPoints: (prev.pickupPoints ?? []).filter((p) => p.id !== id),
        };
        localStorage.setItem('lupo_user', JSON.stringify(next));
        return next;
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('lupo_token');
    localStorage.removeItem('lupo_user');
    localStorage.removeItem(ACTIVE_TAB_KEY);
    setToken(null);
    setUser(null);
    setOrders([]);
    setNotifications([]);
    setActiveOrderId(null);
    setMobileTabState('dashboard');
  };

  // Crear nuevo pedido (Admin)
  const handleCreateOrder = async (orderData: Partial<Order>) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/orders'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(orderData),
      });

      if (!res.ok) throw new Error('Error al guardar pedido');
      
      // Sincronizar inmediatamente
      fetchData();
    } catch (e) {
      console.error(e);
      void showAlert({
        title: 'Error al crear pedido',
        message: 'No se pudo guardar el envío. Verificá la conexión e intentá de nuevo.',
        variant: 'error',
      });
    }
  };

  const fetchIntegrationStatus = useCallback(async () => {
    if (!token) return;
    setIntegrationStatusLoading(true);
    try {
      const res = await fetch(apiUrl('/api/integrations/status'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setIntegrationStatus(await res.json());
      }
    } finally {
      setIntegrationStatusLoading(false);
    }
  }, [token]);

  const connectMarketplace = async (platform: 'mercadolibre' | 'tiendanube') => {
    if (!token) throw new Error('Sin sesión');
    const res = await fetch(apiUrl(`/api/integrations/${platform}/connect`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'No se pudo iniciar la conexión');
    window.location.href = body.url;
  };

  const disconnectMarketplace = async (platform: 'mercadolibre' | 'tiendanube') => {
    if (!token) return;
    const res = await fetch(apiUrl(`/api/integrations/${platform}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'No se pudo desconectar');
    }
    await fetchIntegrationStatus();
  };

  const fetchMarketplaceShipments = async (
    platform: 'mercadolibre' | 'tiendanube',
    options?: { dateFrom?: string; dateTo?: string }
  ): Promise<MarketplaceShipmentPreview[]> => {
    if (!token) throw new Error('Sin sesión');
    const params = new URLSearchParams();
    if (platform === 'tiendanube' && options?.dateFrom) params.set('dateFrom', options.dateFrom);
    if (platform === 'tiendanube' && options?.dateTo) params.set('dateTo', options.dateTo);
    const query = params.toString();
    const res = await fetch(
      apiUrl(`/api/integrations/${platform}/shipments${query ? `?${query}` : ''}`),
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'No se pudieron cargar los envíos');
    return body;
  };

  const importMarketplaceShipments = async (
    platform: 'mercadolibre' | 'tiendanube',
    externalIds?: string[],
    options?: { dateFrom?: string; dateTo?: string }
  ) => {
    if (!token) throw new Error('Sin sesión');
    const res = await fetch(apiUrl(`/api/integrations/${platform}/import`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        externalIds,
        dateFrom: platform === 'tiendanube' ? options?.dateFrom : undefined,
        dateTo: platform === 'tiendanube' ? options?.dateTo : undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'No se pudo importar');
    fetchData();
    return body as { imported: number; skipped: number; errors?: string[] };
  };

  // Actualizar estado de pedido (Asignar, Entregar, etc.)
  const handleUpdateOrderStatus = async (
    orderId: string,
    status: OrderStatus,
    repartidorId?: string,
    comment?: string
  ) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/status`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, repartidorId, comment }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Error al actualizar pedido');
      }

      fetchData();
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/api/orders/${orderId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.json();
        throw new Error(err.error || 'No se pudo eliminar el pedido');
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      if (activeOrderId === orderId) setActiveOrderId(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'No se pudo eliminar el pedido';
      void showAlert({ title: 'No se pudo eliminar', message, variant: 'error' });
    }
  };

  // Enviar ubicación de repartidor (Repartidor)
  const handleReportLocation = async (orderId: string, lat: number, lng: number) => {
    if (!token) return;
    try {
      await fetch(apiUrl(`/api/orders/${orderId}/location`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lat, lng }),
      });
    } catch (e) {
      console.warn('Error reportando GPS:', e);
    }
  };

  // Forzar una llamada al tick del simulador
  const handleTriggerSimulatorTick = async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/simulator/tick'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Marcar todas las notificaciones como leídas
  const handleMarkAllRead = async () => {
    if (!token) return;
    try {
      await fetch(apiUrl('/api/notifications/read'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      // Marcar localmente de inmediato para mejorar feedback visual
      setNotifications(notifications.map(n => ({ ...n, read: true })));
    } catch (e) {
      console.error(e);
    }
  };

  const unreadNotifsCount = notifications.filter((n) => !n.read).length;
  const showSettings =
    user?.role === UserRole.STORE_ADMIN || (user ? isAgencyAdmin(user.role) : false);

  useEffect(() => {
    if (!user) return;
    if (mobileTab === 'settings' && !showSettings) {
      setMobileTab('dashboard');
    }
  }, [user, mobileTab, showSettings, setMobileTab]);

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-[var(--surface-bg)] flex flex-col items-center justify-center p-4" data-theme="dark">
        <svg className="animate-spin h-6 w-6 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-[var(--color-text-muted)] font-mono text-[10px] uppercase tracking-wider font-bold mt-3">Sincronizando Sistema...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onRegisterAgency={(data) => handleRegister('/api/auth/register/agency', data)}
        loading={loading}
        error={authError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-bg)] text-[var(--color-text)] flex flex-col font-sans select-none overflow-hidden h-screen">
      
      {/* CABECERA PRINCIPAL */}
      <header className="min-h-[4.25rem] lg:min-h-[5.25rem] flex items-center justify-between gap-4 px-5 lg:px-8 py-3 lg:py-4 border-b border-[var(--surface-border)] bg-[var(--surface-panel)]/80 shrink-0 relative z-40">
        {/* Marca + sesión */}
        <div className="flex items-center gap-4 lg:gap-5 min-w-0 flex-1">
          <PostaLogo
            size={40}
            showWordmark={false}
            variant={theme === 'paper' ? 'paper' : 'dark'}
            className="shrink-0 lg:[&_svg]:w-11 lg:[&_svg]:h-11"
          />

          <div className="flex flex-col justify-center gap-1 min-w-0">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h1 className="text-lg lg:text-xl font-display font-bold tracking-[-0.02em] text-[var(--color-text)] leading-none">
                Posta
              </h1>
              <span className="text-xs lg:text-sm text-[var(--color-text-muted)] font-sans font-normal leading-none">
                v2.4.0
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] truncate md:hidden">
              <span className="font-medium text-[var(--color-text)]">{user.name}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 sm:pl-2 lg:pl-3 sm:border-l sm:border-[var(--surface-border)] sm:ml-1">
            <ConnectionIndicator isOnline={isOnline} wsConnected={wsConnected} />
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </div>

        {/* Métricas y controles */}
        <div className="flex gap-3 md:gap-6 lg:gap-8 items-center shrink-0">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-widest font-mono">Pedidos Activos</span>
            <span className="text-base lg:text-xl font-mono text-[var(--color-ok)] font-semibold leading-none mt-0.5">
              {orders.filter(o => o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELLED).length}
            </span>
          </div>
          
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-widest font-mono">Repartidores</span>
            <span className="text-base lg:text-xl font-mono text-[var(--color-accent)] font-semibold leading-none mt-0.5">
              {String(repartidores.length).padStart(2, '0')}
            </span>
          </div>

          <div className="hidden sm:block h-8 w-[1px] bg-[var(--surface-border)] mx-1"></div>

          <div className="flex items-center gap-3">
            <div className="hidden xl:flex items-center gap-1">
              {showSettings && (
                <>
                  <button
                    type="button"
                    onClick={() => setMobileTab('dashboard')}
                    title="Panel principal y mapa"
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[5px] border font-bold text-[11px] transition ${
                      mobileTab !== 'settings'
                        ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/40 text-[var(--color-accent)]'
                        : 'bg-[var(--surface-panel-2)] border-[var(--surface-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    <LayoutDashboard className="w-3.5 h-3.5" /> Panel
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileTab('settings')}
                    title="Configuración"
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[5px] border font-bold text-[11px] transition ${
                      mobileTab === 'settings'
                        ? 'bg-[var(--surface-panel-2)] border-[var(--color-text-muted)] text-[var(--color-text)]'
                        : 'bg-[var(--surface-panel-2)] border-[var(--surface-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5" /> Config
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={toggleNotifsSidebar}
                title={notifsSidebarOpen ? 'Ocultar panel de alertas' : 'Mostrar panel de alertas'}
                className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-[5px] border font-bold text-[11px] transition ${
                  notifsSidebarOpen
                    ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/40 text-[var(--color-accent)]'
                    : 'bg-[var(--surface-panel-2)] border-[var(--surface-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                <Bell className="w-3.5 h-3.5" /> Alertas
                {!notifsSidebarOpen && unreadNotifsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[var(--color-cta)] text-[#F6F0E4] font-black text-[9px] min-w-[1rem] h-4 px-1 rounded-full flex items-center justify-center border border-[var(--surface-bg)]">
                    {unreadNotifsCount}
                  </span>
                )}
              </button>
            </div>

            <div
              className="relative cursor-pointer p-1.5 hover:bg-[var(--surface-panel-2)] rounded-2xl transition xl:hidden"
              title="Ver notificaciones"
              onClick={() => setMobileTab('notifications')}
              onKeyDown={(e) => e.key === 'Enter' && setMobileTab('notifications')}
              role="button"
              tabIndex={0}
            >
              <Bell className={`w-4 h-4 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition ${unreadNotifsCount > 0 ? 'animate-swing' : ''}`} />
              {unreadNotifsCount > 0 && (
                <span className="absolute top-0 right-0 bg-[var(--color-cta)] text-[#F6F0E4] font-extrabold text-[9px] w-4 h-4 rounded-full flex items-center justify-center border border-[var(--surface-bg)]">
                  {unreadNotifsCount}
                </span>
              )}
            </div>

            <div className="hidden md:block text-right">
              <p className="text-xs lg:text-sm font-medium text-[var(--color-text)]">{user.name}</p>
              <p className="text-[9px] text-[var(--color-text-muted)] uppercase font-mono">{user.role}</p>
            </div>

            {/* Avatar circle */}
            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-[var(--surface-panel-2)] border border-[var(--surface-border)] flex items-center justify-center text-xs lg:text-sm font-bold text-[var(--color-text-muted)] uppercase shrink-0">
              {user.name.slice(0, 2)}
            </div>

            <button
              onClick={handleLogout}
              id="btn-logout"
              title="Cerrar sesión"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-[5px] bg-[var(--surface-panel-2)] hover:bg-[var(--color-danger)]/10 border border-[var(--surface-border)] hover:border-[var(--color-danger)]/40 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] font-bold text-[11px] transition"
            >
              <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>
      
      {/* Selector de pestañas para vista mobile/tablet */}
      <div className="xl:hidden bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)] flex shrink-0 h-11 z-40">
        <button
          onClick={() => setMobileTab('dashboard')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            mobileTab === 'dashboard'
              ? 'text-[var(--color-accent)] border-b-2 border-[var(--color-accent)] bg-[var(--color-accent)]/5'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          <span>📊 Panel Principal</span>
        </button>
        {showSettings && (
          <button
            onClick={() => setMobileTab('settings')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-all ${
              mobileTab === 'settings'
                ? 'text-[var(--color-text)] border-b-2 border-[var(--color-text-muted)] bg-[var(--surface-panel)]/50'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            <span>⚙️ Configuración</span>
          </button>
        )}
        <button
          onClick={() => setMobileTab('notifications')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-all relative ${
            mobileTab === 'notifications'
              ? 'text-[var(--color-accent)] border-b-2 border-[var(--color-accent)] bg-[var(--color-accent)]/5'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          <span>🔔 Alertas PWA</span>
          {unreadNotifsCount > 0 && (
            <span className="absolute top-2.5 right-[30%] bg-[var(--color-cta)] text-[#F6F0E4] font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
              {unreadNotifsCount}
            </span>
          )}
        </button>
      </div>

      {/* CUERPO PRINCIPAL DEL PANEL (HIGH DENSITY HEIGHT) */}
      <main className="flex-1 overflow-hidden p-3 md:p-4 relative min-h-0">
        {(user.role === UserRole.STORE_ADMIN || isAgencyAdmin(user.role)) ? (
          <div
            className={`flex flex-col xl:flex-row h-full overflow-hidden ${
              notifsSidebarOpen ? 'xl:gap-4' : 'xl:gap-0'
            }`}
          >
            {mobileTab !== 'settings' && (
              <div
                className={`flex-1 min-w-0 h-full overflow-hidden transition-all duration-300 ease-out ${
                  mobileTab !== 'dashboard' ? 'hidden xl:block' : ''
                }`}
              >
                <AdminDashboard
                  orders={orders}
                  repartidores={repartidores}
                  sellers={sellers}
                  departurePoint={departurePoint}
                  pickupPoints={pickupPoints}
                  activeOrderId={activeOrderId}
                  onSelectOrder={setActiveOrderId}
                  onCreateOrder={handleCreateOrder}
                  onUpdateOrderStatus={handleUpdateOrderStatus}
                  onAssignOrderSeller={handleAssignOrderSeller}
                  onDeleteOrder={handleDeleteOrder}
                  userRole={user.role}
                />
              </div>
            )}

            {mobileTab === 'settings' && (
              <div className="flex-1 min-w-0 h-full overflow-hidden transition-all duration-300 ease-out">
                <SettingsPage
                  user={user}
                  onBack={() => setMobileTab('dashboard')}
                  departurePoint={departurePoint}
                  repartidores={repartidores}
                  sellers={sellers}
                  pickupPoints={pickupPoints}
                  onUpdateDeparture={isAgencyAdmin(user.role) ? handleUpdateDeparture : undefined}
                  onCreateSeller={isAgencyAdmin(user.role) ? handleCreateSeller : undefined}
                  onFetchSellerDetail={isAgencyAdmin(user.role) ? handleFetchSellerDetail : undefined}
                  onUpdateSellerPassword={isAgencyAdmin(user.role) ? handleUpdateSellerPassword : undefined}
                  onCreateRepartidor={isAgencyAdmin(user.role) ? handleCreateRepartidor : undefined}
                  onUpdateRepartidorZone={isAgencyAdmin(user.role) ? handleUpdateRepartidorZone : undefined}
                  onDeleteRepartidor={isAgencyAdmin(user.role) ? handleDeleteRepartidor : undefined}
                  onCreatePickupPoint={handleCreatePickupPoint}
                  onUpdatePickupPoint={handleUpdatePickupPoint}
                  onDeletePickupPoint={handleDeletePickupPoint}
                  onTriggerSimulatorTick={isAgencyAdmin(user.role) ? handleTriggerSimulatorTick : undefined}
                  integrationStatus={integrationStatus}
                  integrationStatusLoading={integrationStatusLoading}
                  onRefreshIntegrationStatus={fetchIntegrationStatus}
                  onConnectMarketplace={user.role === UserRole.STORE_ADMIN ? connectMarketplace : undefined}
                  onDisconnectMarketplace={user.role === UserRole.STORE_ADMIN ? disconnectMarketplace : undefined}
                  onFetchMarketplaceShipments={user.role === UserRole.STORE_ADMIN ? fetchMarketplaceShipments : undefined}
                  onImportMarketplaceShipments={user.role === UserRole.STORE_ADMIN ? importMarketplaceShipments : undefined}
                />
              </div>
            )}

            <NotifsSidebar open={notifsSidebarOpen} mobileShow={mobileTab === 'notifications'}>
              <NotificationHub
                notifications={notifications}
                onMarkAllRead={handleMarkAllRead}
                activeUserId={user.id}
                onToggleCollapse={toggleNotifsSidebar}
                showCollapseButton
              />
            </NotifsSidebar>
          </div>
        ) : (
          <div
            className={`flex flex-col xl:flex-row h-full overflow-hidden ${
              notifsSidebarOpen ? 'xl:gap-4' : 'xl:gap-0'
            }`}
          >
            <div
              className={`flex-1 min-w-0 h-full overflow-hidden transition-all duration-300 ease-out ${
                mobileTab !== 'dashboard' ? 'hidden xl:block' : ''
              }`}
            >
              <RepartidorDashboard
                orders={orders}
                currentUser={user}
                activeOrderId={activeOrderId}
                departurePoint={departurePoint}
                pickupPoints={pickupPoints}
                onSelectOrder={setActiveOrderId}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                onReportLocation={handleReportLocation}
              />
            </div>

            <NotifsSidebar open={notifsSidebarOpen} mobileShow={mobileTab === 'notifications'}>
              <NotificationHub
                notifications={notifications}
                onMarkAllRead={handleMarkAllRead}
                activeUserId={user.id}
                onToggleCollapse={toggleNotifsSidebar}
                showCollapseButton
              />
            </NotifsSidebar>
          </div>
        )}
      </main>

      {/* FOOTER STATUS BAR (HIGH DENSITY DESIGN) */}
      <footer className="h-8 bg-[var(--surface-panel-2)] border-t border-[var(--surface-border)] px-6 flex items-center justify-between shrink-0 select-none z-40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-[var(--color-ok)] animate-pulse' : 'bg-[var(--color-danger)]'}`}></div>
            <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-tighter font-mono">Sistema: {isOnline ? 'Operativo' : 'Local (Sin Conexión)'}</span>
          </div>
          <span className="text-[9px] text-[var(--surface-border)] uppercase tracking-tighter">|</span>
          <div className="flex items-center gap-2 text-[9px] text-[var(--color-text-muted)] uppercase tracking-tighter font-mono">
            WS Protocol:{' '}
            <span className={wsConnected ? 'text-[var(--color-ok)]' : 'text-[var(--color-accent)]'}>
              {wsConnected ? 'Tiempo real (WebSocket)' : 'Respaldo (Polling)'}
            </span>
          </div>
        </div>
        <div className="text-[9px] text-[var(--color-text-muted)] font-mono uppercase tracking-tighter flex items-center gap-1">
          <span>Sincronizado: {lastSyncAt.toLocaleTimeString()}</span>
        </div>
      </footer>
    </div>
  );
}
