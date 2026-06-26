/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { User, UserRole, Order, OrderStatus, AppNotification, LocationPoint, PickupPoint, isAgencyAdmin } from './types.js';
import LoginScreen from './components/LoginScreen.tsx';
import AdminDashboard from './components/AdminDashboard.tsx';
import SettingsPage from './components/SettingsPage.tsx';
import RepartidorDashboard from './components/RepartidorDashboard.tsx';
import NotificationHub, { playNotificationSound } from './components/NotificationHub.tsx';
import NotifsSidebar from './components/NotifsSidebar.tsx';
import AppSidebar, { SidebarAction } from './components/AppSidebar.tsx';
import { LogOut, Wifi, WifiOff, Bell, Settings, LayoutDashboard, Moon, Sun } from 'lucide-react';
import { apiUrl } from './api.ts';
import { useRealtimeSocket } from './useRealtimeSocket.ts';
import { useModal } from './context/ModalContext.tsx';
import { ui } from './styles/ui.ts';
import { useTheme } from './context/ThemeContext.tsx';

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
  const { isDark, toggleTheme } = useTheme();
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

  const setMobileTab = useCallback((tab: AppTab) => {
    setMobileTabState(tab);
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
  }, []);

  const [notifsSidebarOpen, setNotifsSidebarOpen] = useState(readNotifsSidebarOpen);
  const [adminView, setAdminView] = useState<'orders' | 'map'>('orders');

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

      if (user?.role === UserRole.STORE_ADMIN || isAgencyAdmin(user.role)) {
        const repsRes = await fetch(apiUrl('/api/repartidores'), { headers });
        if (repsRes.ok) {
          const data = await repsRes.json();
          setRepartidores(data);
        }

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
  };

  const handleCreateRepartidor = async (data: { username: string; password: string; name: string }) => {
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

      if (!res.ok) throw new Error('Error al actualizar pedido');
      
      // Sincronizar
      fetchData();
    } catch (e) {
      console.error(e);
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
  const activeOrdersCount = orders.filter(
    (o) => o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELLED
  ).length;

  const handleSidebarNavigate = useCallback(
    (action: SidebarAction) => {
      if (action === 'coming-soon') {
        void showAlert({
          title: 'Próximamente',
          message: 'Esta sección estará disponible en una próxima actualización.',
          variant: 'info',
        });
        return;
      }
      if (action === 'settings' || action === 'repartidores') {
        setMobileTab('settings');
        return;
      }
      setMobileTab('dashboard');
      if (action === 'map') setAdminView('map');
      else setAdminView('orders');
    },
    [setMobileTab, showAlert]
  );

  function MetricSparkline({ color }: { color: string }) {
    return (
      <svg className={ui.metricSparkline} viewBox="0 0 56 20" fill="none" aria-hidden>
        <path
          d="M2 14 L10 10 L18 12 L26 6 L34 8 L42 4 L54 2"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 14 L10 10 L18 12 L26 6 L34 8 L42 4 L54 2 V20 H2 Z"
          fill={color}
          fillOpacity="0.12"
        />
      </svg>
    );
  }

  useEffect(() => {
    if (!user) return;
    if (mobileTab === 'settings' && !showSettings) {
      setMobileTab('dashboard');
    }
  }, [user, mobileTab, showSettings, setMobileTab]);

  if (loading && !user) {
    return (
      <div className={ui.loadingScreen}>
        <svg className="animate-spin h-7 w-7 text-[var(--lupo-accent)]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-xs font-medium mt-4 tracking-wide text-[var(--lupo-text-muted)]">
          Cargando panel…
        </span>
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
    <div className={`${ui.shell} select-none`}>
      <AppSidebar
        activeTab={mobileTab}
        showSettings={showSettings}
        onNavigate={handleSidebarNavigate}
      />

      <div className={ui.content}>
      <header className={ui.header}>
        <div className="flex items-center gap-4 xl:hidden">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center font-bold text-white text-sm shadow-md shadow-purple-200">
            LP
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-[var(--lupo-text)] flex items-center gap-2 flex-wrap">
              LupoEnvios
              <span className="text-[var(--lupo-text-muted)] font-normal text-xs">v2.4</span>
              {isOnline ? (
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  wsConnected
                    ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                    : 'text-amber-600 bg-amber-50 border-amber-200'
                }`}>
                  <Wifi className="w-3 h-3 shrink-0" /> {wsConnected ? 'En vivo' : 'Online'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  <WifiOff className="w-3 h-3" /> Sin conexión
                </span>
              )}
            </h1>
            <p className="text-xs text-[var(--lupo-text-muted)] mt-0.5">
              {user.name}
            </p>
          </div>
        </div>

        <div className="hidden xl:block" />

        <div className="flex gap-4 md:gap-6 items-center">
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className={ui.metricLabel}>Pedidos activos</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`${ui.metricValue} ${ui.metricValueSuccess}`}>{activeOrdersCount}</span>
                <MetricSparkline color="#059669" />
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className={ui.metricLabel}>Repartidores</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`${ui.metricValue} ${ui.metricValueAccent}`}>
                  {String(repartidores.length).padStart(2, '0')}
                </span>
                <MetricSparkline color="#7c3aed" />
              </div>
            </div>
          </div>

          <div className="hidden sm:block h-8 w-px bg-[var(--lupo-border)]" />

          <div className="flex items-center gap-2.5">
            <div className="hidden xl:flex items-center gap-1.5">
              {showSettings && (
                <>
                  <button
                    type="button"
                    onClick={() => setMobileTab('dashboard')}
                    title="Panel principal"
                    className={mobileTab !== 'settings' ? ui.headerNavBtnActive : ui.headerNavBtn}
                  >
                    <LayoutDashboard className="w-3.5 h-3.5" /> Panel
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileTab('settings')}
                    title="Configuración"
                    className={mobileTab === 'settings' ? ui.headerNavBtnActive : ui.headerNavBtn}
                  >
                    <Settings className="w-3.5 h-3.5" /> Config
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={toggleNotifsSidebar}
                title={notifsSidebarOpen ? 'Ocultar alertas' : 'Mostrar alertas'}
                className={`relative ${notifsSidebarOpen ? ui.headerNavBtnPurple : ui.headerNavBtn}`}
              >
                <Bell className="w-3.5 h-3.5" /> Alertas
                {!notifsSidebarOpen && unreadNotifsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[var(--lupo-accent)] text-white font-bold text-[9px] min-w-[1rem] h-4 px-1 rounded-full flex items-center justify-center">
                    {unreadNotifsCount}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? 'Modo claro' : 'Modo oscuro'}
              className={`xl:hidden p-1.5 rounded-lg border border-[var(--lupo-border-subtle)] text-[var(--lupo-text-muted)] hover:text-[var(--lupo-text)] hover:bg-[var(--lupo-accent-soft)] transition`}
              aria-label="Alternar tema"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div
              className="relative cursor-pointer p-1.5 hover:bg-white/5 rounded-lg transition xl:hidden"
              title="Ver notificaciones"
              onClick={() => setMobileTab('notifications')}
              onKeyDown={(e) => e.key === 'Enter' && setMobileTab('notifications')}
              role="button"
              tabIndex={0}
            >
              <Bell className={`w-4 h-4 text-[var(--lupo-text-muted)] hover:text-[var(--lupo-text)] transition ${unreadNotifsCount > 0 ? 'animate-swing' : ''}`} />
              {unreadNotifsCount > 0 && (
                <span className="absolute top-0 right-0 bg-[var(--lupo-accent)] text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                  {unreadNotifsCount}
                </span>
              )}
            </div>

            <div className="hidden md:block text-right">
              <p className="text-xs lg:text-sm font-medium text-[var(--lupo-text)]">{user.name}</p>
              <p className={`${ui.hint} uppercase`}>{user.role}</p>
            </div>

            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-[var(--lupo-accent-soft)] border border-[#e9d5ff] flex items-center justify-center text-xs lg:text-sm font-semibold text-[var(--lupo-accent)] uppercase shrink-0">
              {user.name.slice(0, 2)}
            </div>

            <button
              onClick={handleLogout}
              id="btn-logout"
              title="Cerrar sesión"
              className={`${ui.btnGhost} ${ui.btnSm}`}
            >
              <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>
      
      <div className="xl:hidden flex shrink-0 h-11 z-40 border-b border-[var(--lupo-border-subtle)] bg-[var(--lupo-surface)]">
        <button
          onClick={() => setMobileTab('dashboard')}
          className={mobileTab === 'dashboard' ? ui.navTabActive : ui.navTab}
        >
          Panel
        </button>
        {showSettings && (
          <button
            onClick={() => setMobileTab('settings')}
            className={mobileTab === 'settings' ? ui.navTabNeutral : ui.navTab}
          >
            Configuración
          </button>
        )}
        <button
          onClick={() => setMobileTab('notifications')}
          className={`relative ${mobileTab === 'notifications' ? ui.navTabPurple : ui.navTab}`}
        >
          Alertas
          {unreadNotifsCount > 0 && (
            <span className="ml-1 bg-[var(--lupo-accent)] text-white font-bold text-[9px] min-w-[1rem] h-4 px-1 rounded-full inline-flex items-center justify-center">
              {unreadNotifsCount}
            </span>
          )}
        </button>
      </div>

      <main className={`${ui.main} h-[calc(100vh-140px)] xl:h-[calc(100vh-4.25rem-2.25rem)]`}>
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
                  userName={user.name}
                  adminView={adminView}
                  onGoToSettings={showSettings ? () => setMobileTab('settings') : undefined}
                />
              </div>
            )}

            {mobileTab === 'settings' && (
              <div className={`flex-1 min-w-0 h-full overflow-hidden ${ui.panel} transition-all duration-300 ease-out`}>
                <SettingsPage
                  user={user}
                  onBack={() => setMobileTab('dashboard')}
                  departurePoint={departurePoint}
                  repartidores={repartidores}
                  sellers={sellers}
                  pickupPoints={pickupPoints}
                  onUpdateDeparture={isAgencyAdmin(user.role) ? handleUpdateDeparture : undefined}
                  onCreateSeller={isAgencyAdmin(user.role) ? handleCreateSeller : undefined}
                  onCreateRepartidor={isAgencyAdmin(user.role) ? handleCreateRepartidor : undefined}
                  onDeleteRepartidor={isAgencyAdmin(user.role) ? handleDeleteRepartidor : undefined}
                  onCreatePickupPoint={handleCreatePickupPoint}
                  onUpdatePickupPoint={handleUpdatePickupPoint}
                  onDeletePickupPoint={handleDeletePickupPoint}
                  onTriggerSimulatorTick={isAgencyAdmin(user.role) ? handleTriggerSimulatorTick : undefined}
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

      <footer className={ui.footer}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className={ui.hint}>Sistema: {isOnline ? 'Operativo' : 'Local (sin conexión)'}</span>
          </div>
          <span className="text-[var(--lupo-border)]">|</span>
          <div className={`flex items-center gap-2 ${ui.hint}`}>
            WS:{' '}
            <span className={wsConnected ? 'text-emerald-400' : 'text-amber-400'}>
              {wsConnected ? 'Tiempo real' : 'Polling'}
            </span>
          </div>
        </div>
        <div className={`${ui.hint} flex items-center gap-1`}>
          <span>Sincronizado: {lastSyncAt.toLocaleTimeString()}</span>
        </div>
      </footer>
      </div>
    </div>
  );
}
