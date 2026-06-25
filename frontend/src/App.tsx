/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { User, UserRole, Order, OrderStatus, AppNotification, LocationPoint, PickupPoint, isAgencyAdmin } from './types.js';
import LoginScreen from './components/LoginScreen.tsx';
import AdminDashboard from './components/AdminDashboard.tsx';
import RepartidorDashboard from './components/RepartidorDashboard.tsx';
import NotificationHub, { playNotificationSound } from './components/NotificationHub.tsx';
import { LogOut, Wifi, WifiOff, Bell, User as UserIcon } from 'lucide-react';
import { apiUrl } from './api.ts';
import { useRealtimeSocket } from './useRealtimeSocket.ts';

export default function App() {
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
  const [mobileTab, setMobileTab] = useState<'dashboard' | 'notifications'>('dashboard');

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
    setToken(null);
    setUser(null);
    setOrders([]);
    setNotifications([]);
    setActiveOrderId(null);
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
      alert('Error de conexión al crear pedido.');
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

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-4">
        <svg className="animate-spin h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider font-bold mt-3">Sincronizando Sistema...</span>
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

  const unreadNotifsCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans select-none overflow-hidden h-screen">
      
      {/* NAVEGACIÓN Y CABECERA PRINCIPAL (HIGH DENSITY STYLE) */}
      <header className="h-16 lg:h-[4.5rem] flex items-center justify-between px-6 border-b border-zinc-800 bg-zinc-900/50 shrink-0 relative z-40">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 lg:w-10 lg:h-10 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-md shadow-blue-600/20 text-sm lg:text-base">
            LP
          </div>
          <div>
            <h1 className="text-sm lg:text-lg font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
              LupoEnvios
              <span className="text-zinc-500 font-normal text-xs lg:text-sm">v2.4.0</span>
              {isOnline ? (
                <span className={`flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded font-bold border ${
                  wsConnected
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                }`}>
                  <Wifi className="w-2.5 h-2.5 shrink-0" /> {wsConnected ? 'LIVE' : 'ONLINE'}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[9px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded font-bold">
                  <WifiOff className="w-2.5 h-2.5 text-red-400 shrink-0" /> OFFLINE
                </span>
              )}
            </h1>
            <p className="text-[10px] text-zinc-500 font-mono">
              Operador: <span className="text-zinc-300 font-bold">{user.name}</span>
            </p>
          </div>
        </div>

        {/* METRICS & QUICK CONTROLS (HIGH DENSITY) */}
        <div className="flex gap-4 md:gap-8 items-center">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">Pedidos Activos</span>
            <span className="text-base lg:text-xl font-mono text-emerald-400 font-semibold leading-none mt-0.5">
              {orders.filter(o => o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELLED).length}
            </span>
          </div>
          
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">Repartidores</span>
            <span className="text-base lg:text-xl font-mono text-blue-400 font-semibold leading-none mt-0.5">
              {repartidores.length > 0 ? String(repartidores.length).padStart(2, '0') : '04'}
            </span>
          </div>

          <div className="hidden sm:block h-8 w-[1px] bg-zinc-800 mx-1"></div>

          <div className="flex items-center gap-3">
            {/* Indicador de alertas rápido */}
            <div className="relative cursor-pointer p-1.5 hover:bg-zinc-800/50 rounded-lg transition" title="Ver notificaciones">
              <Bell className={`w-4 h-4 text-zinc-400 hover:text-white transition ${unreadNotifsCount > 0 ? 'animate-swing' : ''}`} />
              {unreadNotifsCount > 0 && (
                <span className="absolute top-0 right-0 bg-blue-500 text-zinc-950 font-extrabold text-[9px] w-4 h-4 rounded-full flex items-center justify-center border border-[#09090b]">
                  {unreadNotifsCount}
                </span>
              )}
            </div>

            <div className="hidden md:block text-right">
              <p className="text-xs lg:text-sm font-medium text-zinc-200">{user.name}</p>
              <p className="text-[9px] text-zinc-500 uppercase font-mono">{user.role}</p>
            </div>

            {/* Avatar circle */}
            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs lg:text-sm font-bold text-zinc-300 uppercase shrink-0">
              {user.name.slice(0, 2)}
            </div>

            <button
              onClick={handleLogout}
              id="btn-logout"
              title="Cerrar sesión"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-zinc-950 hover:bg-red-950/20 border border-zinc-800 hover:border-red-900 text-zinc-400 hover:text-red-400 font-bold text-[11px] transition"
            >
              <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>
      
      {/* Selector de pestañas para vista mobile/tablet */}
      <div className="xl:hidden bg-zinc-950 border-b border-zinc-800 flex shrink-0 h-11 z-40">
        <button
          onClick={() => setMobileTab('dashboard')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
            mobileTab === 'dashboard'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <span>📊 Panel Principal</span>
        </button>
        <button
          onClick={() => setMobileTab('notifications')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-all relative ${
            mobileTab === 'notifications'
              ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/5'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <span>🔔 Alertas PWA</span>
          {unreadNotifsCount > 0 && (
            <span className="absolute top-2.5 right-[30%] bg-blue-500 text-zinc-950 font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
              {unreadNotifsCount}
            </span>
          )}
        </button>
      </div>

      {/* CUERPO PRINCIPAL DEL PANEL (HIGH DENSITY HEIGHT) */}
      <main className="flex-1 overflow-hidden p-3 md:p-4 relative h-[calc(100vh-140px)] xl:h-[calc(100vh-96px)]">
        {(user.role === UserRole.STORE_ADMIN || isAgencyAdmin(user.role)) ? (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 h-full overflow-hidden">
            {/* Admin Dashboard */}
            <div className={`xl:col-span-9 h-full overflow-hidden ${mobileTab !== 'dashboard' ? 'hidden xl:block' : ''}`}>
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
                onUpdateDeparture={isAgencyAdmin(user.role) ? handleUpdateDeparture : undefined}
                onCreatePickupPoint={handleCreatePickupPoint}
                onDeletePickupPoint={handleDeletePickupPoint}
                onTriggerSimulatorTick={handleTriggerSimulatorTick}
                onCreateSeller={isAgencyAdmin(user.role) ? handleCreateSeller : undefined}
                onCreateRepartidor={isAgencyAdmin(user.role) ? handleCreateRepartidor : undefined}
                userRole={user.role}
              />
            </div>

            {/* Sidebar con Centro de Notificaciones PWA */}
            <div className={`xl:col-span-3 h-full overflow-hidden flex flex-col ${mobileTab !== 'notifications' ? 'hidden xl:block' : ''}`}>
              <NotificationHub
                notifications={notifications}
                onMarkAllRead={handleMarkAllRead}
                activeUserId={user.id}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 h-full overflow-hidden">
            {/* Repartidor Dashboard */}
            <div className={`xl:col-span-9 h-full overflow-hidden ${mobileTab !== 'dashboard' ? 'hidden xl:block' : ''}`}>
              <RepartidorDashboard
                orders={orders}
                currentUser={user}
                activeOrderId={activeOrderId}
                onSelectOrder={setActiveOrderId}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                onReportLocation={handleReportLocation}
              />
            </div>

            {/* Sidebar con Centro de Notificaciones PWA */}
            <div className={`xl:col-span-3 h-full overflow-hidden flex flex-col ${mobileTab !== 'notifications' ? 'hidden xl:block' : ''}`}>
              <NotificationHub
                notifications={notifications}
                onMarkAllRead={handleMarkAllRead}
                activeUserId={user.id}
              />
            </div>
          </div>
        )}
      </main>

      {/* FOOTER STATUS BAR (HIGH DENSITY DESIGN) */}
      <footer className="h-8 bg-zinc-950 border-t border-zinc-800 px-6 flex items-center justify-between shrink-0 select-none z-40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-[9px] text-zinc-500 uppercase tracking-tighter">Sistema: {isOnline ? 'Operativo' : 'Local (Sin Conexión)'}</span>
          </div>
          <span className="text-[9px] text-zinc-800 uppercase tracking-tighter">|</span>
          <div className="flex items-center gap-2 text-[9px] text-zinc-500 uppercase tracking-tighter">
            WS Protocol:{' '}
            <span className={`font-mono ${wsConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
              {wsConnected ? 'Tiempo real (WebSocket)' : 'Respaldo (Polling)'}
            </span>
          </div>
        </div>
        <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-tighter flex items-center gap-1">
          <span>Sincronizado: {lastSyncAt.toLocaleTimeString()}</span>
        </div>
      </footer>
    </div>
  );
}
