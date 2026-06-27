/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, useCallback, useMemo, useRef } from 'react';
import { Order, OrderStatus, User, UserRole, LocationPoint, PickupPoint, isAgencyAdmin } from '../types.js';
import { Plus, Navigation, Clock, MapPin, Search, Phone, FileText, CheckCircle2, Users, ChevronDown, Layers } from 'lucide-react';
import { geocodeAddress } from '../utils/geocode.js';
import { findZoneForPoint, zoneLabel } from '../config/deliveryZones.js';
import OrderContextMenu, { ContextMenuItem } from './OrderContextMenu.tsx';
import { useModal } from '../context/ModalContext.tsx';

const MapComponent = React.lazy(() => import('./MapComponent.tsx'));

interface AdminDashboardProps {
  orders: Order[];
  repartidores: User[];
  sellers?: User[];
  departurePoint?: LocationPoint | null;
  pickupPoints?: PickupPoint[];
  activeOrderId: string | null;
  onSelectOrder: (orderId: string | null) => void;
  onCreateOrder: (orderData: Partial<Order> & { sellerId?: string }) => Promise<void>;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus, repartidorId?: string, comment?: string) => Promise<void>;
  onAssignOrderSeller?: (orderId: string, sellerId: string) => Promise<void>;
  onDeleteOrder?: (orderId: string) => Promise<void>;
  userRole?: UserRole;
}

// Direcciones preestablecidas de Buenos Aires para hacer rápida la creación de pruebas sin coordenadas difíciles
const DIRECTORY_PRESETS = [
  { name: 'Palermo Chico (Av. del Libertador 2400)', lat: -34.5802, lng: -58.4035 },
  { name: 'San Telmo (Defensa 800)', lat: -34.6186, lng: -58.3732 },
  { name: 'Flores (Av. Rivadavia 6500)', lat: -34.6305, lng: -58.4632 },
  { name: 'Chacarita (Av. Corrientes 6200)', lat: -34.5872, lng: -58.4445 },
  { name: 'Recoleta (Av. Las Heras 2100)', lat: -34.5877, lng: -58.3972 },
];

export default function AdminDashboard({
  orders,
  repartidores,
  sellers = [],
  departurePoint = null,
  pickupPoints = [],
  activeOrderId,
  onSelectOrder,
  onCreateOrder,
  onUpdateOrderStatus,
  onAssignOrderSeller,
  onDeleteOrder,
  userRole = UserRole.STORE_ADMIN,
}: AdminDashboardProps) {
  const [adminMobileTab, setAdminMobileTab] = useState<'orders' | 'map'>('orders');
  const [contextMenu, setContextMenu] = useState<{ order: Order; x: number; y: number } | null>(null);
  const { confirm, alert: showAlert } = useModal();

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Estados para Filtros (mapa)
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapRepartidorIds, setMapRepartidorIds] = useState<Set<string>>(new Set());
  const [mapFilterOpen, setMapFilterOpen] = useState(false);
  const [showMapZones, setShowMapZones] = useState(true);
  const mapFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeOrderId) {
      setAdminMobileTab('map');
    }
  }, [activeOrderId]);

  useEffect(() => {
    setMapRepartidorIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const rep of repartidores) {
        if (!next.has(rep.id)) {
          next.add(rep.id);
          changed = true;
        }
      }
      for (const id of [...next]) {
        if (!repartidores.some((r) => r.id === id)) {
          next.delete(id);
          changed = true;
        }
      }
      if (prev.size === 0 && repartidores.length > 0) {
        return new Set(repartidores.map((r) => r.id));
      }
      return changed ? next : prev;
    });
  }, [repartidores]);

  useEffect(() => {
    if (!mapFilterOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (mapFilterRef.current && !mapFilterRef.current.contains(event.target as Node)) {
        setMapFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [mapFilterOpen]);

  // Estados del Formulario de Pedidos
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(-34.58);
  const [lng, setLng] = useState(-58.40);
  const [notes, setNotes] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);
  const [coordsConfirmed, setCoordsConfirmed] = useState(false);

  // Estados para Asignación Rápida
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);

  // Aplicar preset de dirección
  const applyPreset = (preset: typeof DIRECTORY_PRESETS[0]) => {
    setAddress(preset.name);
    setLat(preset.lat);
    setLng(preset.lng);
    setCoordsConfirmed(true);
    setGeocodeMessage(`Ubicación: ${preset.name.split('(')[0].trim()}`);
  };

  const resolveAddressCoords = async (rawAddress: string) => {
    const result = await geocodeAddress(rawAddress);
    setLat(result.lat);
    setLng(result.lng);
    setCoordsConfirmed(true);
    setGeocodeMessage(`Ubicación confirmada en el mapa`);
    return result;
  };

  const handleLocateAddress = async () => {
    if (!address.trim()) {
      setGeocodeMessage('Escribí la dirección antes de ubicarla.');
      return;
    }
    setGeocodeLoading(true);
    setGeocodeMessage(null);
    try {
      await resolveAddressCoords(address);
    } catch (err: unknown) {
      setCoordsConfirmed(false);
      const message = err instanceof Error ? err.message : 'No se pudo ubicar la dirección.';
      setGeocodeMessage(message);
    } finally {
      setGeocodeLoading(false);
    }
  };

  // Manejar envío del formulario
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName || !address) return;

    setFormLoading(true);
    setGeocodeMessage(null);
    try {
      let finalLat = lat;
      let finalLng = lng;

      if (!coordsConfirmed) {
        const result = await resolveAddressCoords(address);
        finalLat = result.lat;
        finalLng = result.lng;
      }

      await onCreateOrder({
        clientName,
        clientPhone,
        address,
        lat: finalLat,
        lng: finalLng,
        notes,
      });
      // Reset
      setClientName('');
      setClientPhone('');
      setAddress('');
      setLat(-34.58);
      setLng(-58.40);
      setNotes('');
      setCoordsConfirmed(false);
      setGeocodeMessage(null);
      setShowCreateForm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al crear el pedido.';
      setGeocodeMessage(message);
    } finally {
      setFormLoading(false);
    }
  };

  // Filtrar pedidos
  const filteredOrders = orders.filter((order) => {
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesSearch =
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.repartidorName && order.repartidorName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesStatus && matchesSearch;
  });

  const allRepartidoresOnMap = useMemo(
    () =>
      repartidores.length > 0 &&
      repartidores.every((r) => mapRepartidorIds.has(r.id)),
    [repartidores, mapRepartidorIds]
  );

  const mapRepartidores = useMemo(() => {
    if (mapRepartidorIds.size === 0) return [];
    if (allRepartidoresOnMap) return repartidores;
    return repartidores.filter((r) => mapRepartidorIds.has(r.id));
  }, [repartidores, mapRepartidorIds, allRepartidoresOnMap]);

  const mapOrders = useMemo(() => {
    if (allRepartidoresOnMap) return orders;
    if (mapRepartidorIds.size === 0) return [];
    return orders.filter((o) => o.repartidorId && mapRepartidorIds.has(o.repartidorId));
  }, [orders, mapRepartidorIds, allRepartidoresOnMap]);

  const mapFilterLabel = useMemo(() => {
    if (repartidores.length === 0) return 'Sin repartidores';
    if (allRepartidoresOnMap) return 'Todos';
    if (mapRepartidorIds.size === 0) return 'Ninguno';
    if (mapRepartidorIds.size === 1) {
      const id = [...mapRepartidorIds][0];
      return repartidores.find((r) => r.id === id)?.name ?? '1 repartidor';
    }
    return `${mapRepartidorIds.size} seleccionados`;
  }, [repartidores, mapRepartidorIds, allRepartidoresOnMap]);

  const toggleMapRepartidor = (id: string) => {
    setMapRepartidorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (allRepartidoresOnMap || !activeOrderId) return;
    const order = orders.find((o) => o.id === activeOrderId);
    if (order?.repartidorId && !mapRepartidorIds.has(order.repartidorId)) {
      onSelectOrder(null);
    }
  }, [mapRepartidorIds, allRepartidoresOnMap, activeOrderId, orders, onSelectOrder]);

  const selectedOrder = orders.find((o) => o.id === activeOrderId);

  const buildOrderMenuItems = (order: Order): ContextMenuItem[] => {
    const agency = isAgencyAdmin(userRole);
    const isSeller = userRole === UserRole.STORE_ADMIN;
    const canDelete =
      (agency && onDeleteOrder) ||
      (isSeller && onDeleteOrder && order.status === OrderStatus.PENDING);
    const canCancel =
      order.status !== OrderStatus.DELIVERED &&
      order.status !== OrderStatus.CANCELLED &&
      (agency || (isSeller && order.status === OrderStatus.PENDING));

    const items: ContextMenuItem[] = [
      {
        id: 'view',
        label: '📍 Ver en mapa',
        onClick: () => {
          onSelectOrder(order.id);
          setAdminMobileTab('map');
        },
      },
      {
        id: 'copy-id',
        label: '📋 Copiar ID',
        onClick: () => void navigator.clipboard.writeText(order.id),
      },
      {
        id: 'copy-address',
        label: '📫 Copiar dirección',
        onClick: () => void navigator.clipboard.writeText(order.address),
      },
    ];

    if (agency && order.status === OrderStatus.PENDING && onAssignOrderSeller) {
      items.push({
        id: 'assign-seller',
        label: '🛒 Asignar vendedor',
        onClick: () => {
          onSelectOrder(order.id);
          setAssigningOrderId(order.id);
          setAdminMobileTab('map');
        },
      });
    }

    if (agency && (order.status === OrderStatus.ASSIGNED || order.status === OrderStatus.DELIVERING)) {
      items.push({
        id: 'mark-delivered',
        label: '✓ Marcar como entregado',
        onClick: () =>
          void onUpdateOrderStatus(order.id, OrderStatus.DELIVERED, undefined, 'Marcado como entregado desde menú'),
      });
    }

    if (canCancel) {
      items.push({
        id: 'cancel',
        label: '✕ Cancelar pedido',
        onClick: () => {
          void confirm({
            title: 'Cancelar pedido',
            message: `¿Cancelar el pedido ${order.id}?\n\nEl envío dejará de estar activo en el panel.`,
            variant: 'warning',
            confirmText: 'Sí, cancelar',
            cancelText: 'Volver',
          }).then((ok) => {
            if (!ok) return;
            void onUpdateOrderStatus(order.id, OrderStatus.CANCELLED, undefined, 'Cancelado desde menú contextual');
          });
        },
      });
    }

    if (canDelete && onDeleteOrder) {
      items.push({ id: 'sep-delete', label: '', separator: true, onClick: () => {} });
      items.push({
        id: 'delete',
        label: '🗑️ Eliminar pedido',
        danger: true,
        onClick: () => {
          void confirm({
            title: 'Eliminar pedido',
            message: `¿Eliminar ${order.id} permanentemente?\n\nEsta acción no se puede deshacer.`,
            variant: 'danger',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
          }).then((ok) => {
            if (!ok) return;
            void onDeleteOrder(order.id);
          });
        },
      });
    }

    return items;
  };

  // Contadores para resúmenes estadísticos rápidos
  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === OrderStatus.PENDING).length,
    delivering: orders.filter((o) => o.status === OrderStatus.DELIVERING).length,
    delivered: orders.filter((o) => o.status === OrderStatus.DELIVERED).length,
  };

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 gap-3 lg:gap-4 h-full overflow-hidden" id="admin-dashboard">
      {contextMenu && (
        <OrderContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildOrderMenuItems(contextMenu.order)}
          onClose={closeContextMenu}
        />
      )}

      {/* Selector de sub-pestañas para panel de control admin (visible solo en móvil/tablet < lg) */}
      <div className="lg:hidden flex bg-zinc-950 p-1 border border-zinc-800 rounded shrink-0 gap-1">
        <button
          onClick={() => setAdminMobileTab('orders')}
          className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider transition rounded ${
            adminMobileTab === 'orders'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          📋 Pedidos ({filteredOrders.length})
        </button>
        <button
          onClick={() => setAdminMobileTab('map')}
          className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider transition rounded ${
            adminMobileTab === 'map'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          🗺️ Monitoreo GPS
        </button>
      </div>

      {/* SECCIÓN IZQUIERDA: LISTADOS Y CREACIÓN (5 COLUMNAS - HIGH DENSITY) */}
      <div className={`lg:col-span-5 flex flex-col h-full overflow-hidden bg-zinc-900/30 border border-zinc-800 rounded-2xl p-4 shadow-xl ${
        adminMobileTab !== 'orders' ? 'hidden lg:flex' : 'flex'
      }`}>
        
        {/* Cabecera, Búsqueda y Filtros */}
        <div className="shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm lg:text-base font-bold text-zinc-100 flex items-center gap-1.5">
                {userRole === UserRole.STORE_ADMIN ? '🛒 Lupo Ventas (Local)' : userRole === UserRole.SUPER_ADMIN ? '👑 Lupo Agencia (Super Admin)' : '⚙️ Lupo Logística'}
              </h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">
                {userRole === UserRole.STORE_ADMIN ? 'Carga de envíos' : 'Asignación de viajes y flota'}
              </p>
            </div>
            
            {userRole === UserRole.STORE_ADMIN && (
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                id="btn-toggle-create-form"
                className="px-2.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] uppercase tracking-wider transition flex items-center gap-1 shadow-md shadow-blue-600/10"
              >
                <Plus className="w-3.5 h-3.5" /> Cargar envío
              </button>
            )}
          </div>

          {/* Tarjetas de Estadísticas Rápidas */}
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div className="bg-zinc-950 border border-zinc-800/80 p-1.5 rounded">
              <p className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-tight">Total</p>
              <p className="text-sm lg:text-lg font-bold text-zinc-200 mt-0.5 font-mono">{stats.total}</p>
            </div>
            <div className="bg-zinc-950 border border-zinc-800/80 p-1.5 rounded">
              <p className="text-[9px] text-zinc-400 font-mono font-bold uppercase tracking-tight">Pend.</p>
              <p className="text-sm lg:text-lg font-bold text-zinc-300 mt-0.5 font-mono">{stats.pending}</p>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/20 p-1.5 rounded">
              <p className="text-[9px] text-amber-500 font-mono font-bold uppercase tracking-tight">Ruta</p>
              <p className="text-sm lg:text-lg font-bold text-amber-400 mt-0.5 font-mono">{stats.delivering}</p>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/20 p-1.5 rounded">
              <p className="text-[9px] text-emerald-500 font-mono font-bold uppercase tracking-tight">Listos</p>
              <p className="text-sm lg:text-lg font-bold text-emerald-400 mt-0.5 font-mono">{stats.delivered}</p>
            </div>
          </div>

          {userRole === UserRole.STORE_ADMIN && (
            <div className="bg-blue-950/20 border border-blue-900/30 rounded p-2 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-blue-400 flex items-center gap-1">
                  🛒 Canal de Ventas Activo
                </p>
                <p className="text-[9px] text-zinc-400 font-mono mt-0.5">Tus envíos se sincronizan con la agencia de logística</p>
              </div>
              <div className="text-[10px] bg-blue-500/10 text-blue-400 font-mono font-bold px-1.5 py-0.5 rounded border border-blue-500/20 uppercase">
                Online
              </div>
            </div>
          )}

          {userRole === UserRole.STORE_ADMIN && (
            <div className="bg-zinc-950/60 border border-zinc-800 rounded p-2 text-[10px] text-zinc-500 font-mono">
              Configurá tus puntos de colecta en la pestaña <span className="text-zinc-300 font-bold">Configuración</span>.
            </div>
          )}

          {isAgencyAdmin(userRole) && (
            <div className="bg-zinc-950/60 border border-zinc-800 rounded p-2 text-[10px] text-zinc-500 font-mono">
              Gestioná vendedores, repartidores y punto de salida desde la pestaña <span className="text-zinc-300 font-bold">Configuración</span>.
            </div>
          )}

          {/* Buscador e hilos de estado */}
          <div className="space-y-1.5">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                placeholder="Buscar repartidor, pedido o dirección..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 pl-8 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 placeholder:text-zinc-600 font-sans"
              />
            </div>

            {/* Selector de Tabs de Filtros */}
            <div className="flex bg-zinc-950 p-0.5 rounded border border-zinc-800/80 text-[10px]">
              <button
                onClick={() => setStatusFilter('all')}
                className={`flex-1 py-1 text-center font-bold uppercase tracking-wider rounded transition ${
                  statusFilter === 'all' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setStatusFilter(OrderStatus.PENDING)}
                className={`flex-1 py-1 text-center font-bold uppercase tracking-wider rounded transition ${
                  statusFilter === OrderStatus.PENDING ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Pend.
              </button>
              <button
                onClick={() => setStatusFilter(OrderStatus.DELIVERING)}
                className={`flex-1 py-1 text-center font-bold uppercase tracking-wider rounded transition ${
                  statusFilter === OrderStatus.DELIVERING ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Ruta
              </button>
              <button
                onClick={() => setStatusFilter(OrderStatus.DELIVERED)}
                className={`flex-1 py-1 text-center font-bold uppercase tracking-wider rounded transition ${
                  statusFilter === OrderStatus.DELIVERED ? 'bg-emerald-600 text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Listos
              </button>
            </div>
          </div>
        </div>

        {/* LISTADO DE PEDIDOS / FORMULARIO CREACIÓN (CON SCROLL) */}
        <div className="flex-1 overflow-y-auto mt-3 space-y-2 pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
          
          {/* Formulario de creación desplegable (HIGH DENSITY MODERN STYLE) */}
          {showCreateForm && userRole === UserRole.STORE_ADMIN && (
            <form onSubmit={handleSubmitOrder} className="bg-zinc-950 border border-zinc-800 rounded p-3.5 space-y-3 animate-slide-down shadow-xl">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2">
                <h3 className="font-bold text-xs text-blue-400 flex items-center gap-1">📝 Cargar nuevo envío</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="text-zinc-500 hover:text-zinc-300 text-[10px] uppercase font-mono tracking-wider font-bold"
                >
                  [Cancelar]
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-mono tracking-wider text-zinc-500 uppercase mb-1">Nombre Cliente *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Marcelo"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 transition-all placeholder:text-zinc-700"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-mono tracking-wider text-zinc-500 uppercase mb-1">Celular / Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej: +5411531234"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 transition-all placeholder:text-zinc-700"
                  />
                </div>
              </div>

              {/* Presets Rápidos de Direcciones */}
              <div>
                <span className="block text-[9px] font-mono tracking-wider text-zinc-500 uppercase mb-1">Sugerencias Rápidas de Destinos (Buenos Aires)</span>
                <div className="flex flex-wrap gap-1">
                  {DIRECTORY_PRESETS.map((preset, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="text-[9px] bg-zinc-900 border border-zinc-800 hover:border-blue-500 hover:text-white text-zinc-400 rounded px-1.5 py-0.5 transition font-mono"
                    >
                      📍 {preset.name.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-mono tracking-wider text-zinc-500 uppercase mb-1">Dirección de Entrega *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Ej: Av. Santa Fe 3200, Palermo"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setCoordsConfirmed(false);
                      setGeocodeMessage(null);
                    }}
                    onBlur={() => {
                      if (address.trim().length > 8 && !coordsConfirmed) {
                        void handleLocateAddress();
                      }
                    }}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 transition-all placeholder:text-zinc-700"
                  />
                  <button
                    type="button"
                    onClick={() => void handleLocateAddress()}
                    disabled={geocodeLoading || !address.trim()}
                    className="shrink-0 px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-[10px] font-bold uppercase text-zinc-300 hover:border-blue-500 hover:text-blue-300 disabled:opacity-50"
                  >
                    {geocodeLoading ? '...' : 'Ubicar'}
                  </button>
                </div>
                {geocodeMessage && (
                  <p
                    className={`mt-1 text-[10px] font-mono ${
                      coordsConfirmed ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {coordsConfirmed ? '✓ ' : '⚠ '}
                    {geocodeMessage}
                  </p>
                )}
                {coordsConfirmed && (
                  <p className="mt-0.5 text-[9px] text-zinc-600 font-mono">
                    Coordenadas: {lat.toFixed(4)}, {lng.toFixed(4)}
                  </p>
                )}
              </div>

              <div className="hidden">
                <input type="hidden" value={lat} readOnly />
                <input type="hidden" value={lng} readOnly />
              </div>

              <div>
                <label className="block text-[9px] font-mono tracking-wider text-zinc-500 uppercase mb-1">Indicaciones / Notas</label>
                <textarea
                  placeholder="Indicaciones para el timbre, ascensor, conserje..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 transition-all placeholder:text-zinc-700"
                />
              </div>

              <button
                type="submit"
                disabled={formLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded text-[11px] uppercase tracking-wider transition disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/10"
              >
                {formLoading ? 'Registrando...' : 'Confirmar y Guardar Pedido'}
              </button>
            </form>
          )}

          {/* Listado de pedidos filtrados (HIGH DENSITY STYLE) */}
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 font-mono text-xs">
              Ningún pedido coincide con los filtros aplicados.
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isSelected = order.id === activeOrderId;
              
              // Estilos de badges (High Density)
              let badgeColor = 'bg-zinc-950 text-zinc-500 border-zinc-800';
              if (order.status === OrderStatus.ASSIGNED) badgeColor = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
              else if (order.status === OrderStatus.DELIVERING) badgeColor = 'bg-blue-500/20 text-blue-400 border-blue-500/25';
              else if (order.status === OrderStatus.DELIVERED) badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
              else if (order.status === OrderStatus.CANCELLED) badgeColor = 'bg-red-500/10 text-red-400 border-red-500/20';

              // Deterministic fake stats for telemetry based on order ID
              const batteryValue = Math.floor(45 + (parseInt(order.id.replace(/\D/g, '')) || 42) % 50);
              const speedValue = order.status === OrderStatus.DELIVERING ? Math.floor(12 + (parseInt(order.id.replace(/\D/g, '')) || 7) % 20) : 0;

              return (
                <div
                  key={order.id}
                  onClick={() => onSelectOrder(order.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ order, x: e.clientX, y: e.clientY });
                  }}
                  className={`p-3.5 rounded border transition cursor-pointer text-left relative overflow-hidden group ${
                    isSelected
                      ? 'bg-blue-500/5 border-l-2 border-blue-500 border-t-zinc-800 border-r-zinc-800 border-b-zinc-800'
                      : 'bg-zinc-950/40 border-zinc-800/80 hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-zinc-500">ID: {order.id}</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badgeColor}`}>
                      {order.status === 'delivering' ? '🚲 En Viaje' : order.status === 'assigned' ? '✓ Asignado' : order.status === 'delivered' ? '✓ Entregado' : 'En Almacén'}
                    </span>
                  </div>

                  <h4 className="font-bold text-xs lg:text-sm text-zinc-200 mt-2 group-hover:text-white transition">
                    {order.clientName}
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5 truncate leading-normal">
                    📍 {order.address}
                  </p>
                  {isAgencyAdmin(userRole) && (() => {
                    const orderZone = findZoneForPoint(order.lat, order.lng);
                    if (!orderZone) return null;
                    return (
                      <p className="text-[9px] mt-1 font-mono font-bold uppercase tracking-wider" style={{ color: orderZone.color }}>
                        🗺️ {orderZone.name}
                      </p>
                    );
                  })()}
                  {isAgencyAdmin(userRole) && (
                    <p className="text-[10px] mt-1 font-mono">
                      {order.sellerName ? (
                        <span className="text-purple-300">🛒 {order.sellerName}</span>
                      ) : (
                        <span className="text-amber-500 font-bold">⚠️ Sin vendedor asignado</span>
                      )}
                    </p>
                  )}

                  {/* Telemetry info just like the design! */}
                  {order.status === OrderStatus.DELIVERING ? (
                    <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-zinc-800/30 text-[9px] text-zinc-500 font-mono">
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-zinc-400">Activo</span>
                      </div>
                      <span>BATERÍA: {batteryValue}%</span>
                      <span>VEL: {speedValue}km/h</span>
                    </div>
                  ) : order.status === OrderStatus.ASSIGNED ? (
                    <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-zinc-800/30 text-[9px] text-zinc-500 font-mono">
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                        <span className="text-zinc-400">Preparando</span>
                      </div>
                      <span>Carga asignada</span>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800/30 text-[9px] text-zinc-500 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-zinc-600" />
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {order.repartidorName ? (
                      <span className="text-blue-400 font-semibold uppercase tracking-wider text-[8px] bg-blue-500/5 border border-blue-500/10 px-1 py-0.2 rounded">
                        🏍️ {order.repartidorName.split(' ')[0]}
                      </span>
                    ) : (
                      <span className="text-amber-500/90 font-semibold text-[8px]">⚠️ SIN ASIGNAR</span>
                    )}
                  </div>

                  {/* Acciones rápidas flotantes en hover */}
                  {order.status === OrderStatus.PENDING && isAgencyAdmin(userRole) && (
                    <div className="absolute right-3 bottom-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssigningOrderId(order.id);
                        }}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-[9px] px-2 py-0.5 rounded transition uppercase tracking-wider"
                      >
                        Gestionar
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* SECCIÓN DERECHA: MAPA E HISTORIAL (7 COLUMNAS - HIGH DENSITY) */}
      <div className={`lg:col-span-7 flex flex-col h-full gap-3 lg:gap-4 overflow-hidden ${
        adminMobileTab !== 'map' ? 'hidden lg:flex' : 'flex'
      }`}>
        
        {/* Mapa Interactivo */}
        <div className="flex-1 min-h-[160px] lg:min-h-[250px] rounded-2xl border border-zinc-800 overflow-hidden relative">
          <div ref={mapFilterRef} className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5 w-44 sm:w-48">
            <button
              type="button"
              onClick={() => setShowMapZones((visible) => !visible)}
              title={showMapZones ? 'Ocultar áreas de entrega' : 'Mostrar áreas de entrega'}
              className={`w-full flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 border shadow-lg backdrop-blur-md transition text-[10px] font-semibold ${
                showMapZones
                  ? 'bg-blue-600/90 border-blue-500 text-white hover:bg-blue-500'
                  : 'bg-zinc-950/95 border-zinc-700/80 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              {showMapZones ? 'Ocultar áreas' : 'Ver áreas'}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMapFilterOpen((open) => !open)}
                className="w-full flex items-center gap-2 bg-zinc-950/95 backdrop-blur-md border border-zinc-700/80 hover:border-zinc-500 rounded-xl px-2.5 py-2 shadow-lg transition text-left"
                aria-expanded={mapFilterOpen}
                aria-haspopup="listbox"
              >
                <Users className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="flex-1 min-w-0 text-[11px] font-medium text-zinc-100 truncate">
                  {mapFilterLabel}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-200 ${mapFilterOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {mapFilterOpen && (
                <div className="absolute top-[calc(100%+0.4rem)] left-0 w-full bg-zinc-950/98 backdrop-blur-md border border-zinc-700/80 rounded-xl shadow-2xl overflow-hidden">
                  <div className="px-3 pt-3 pb-2.5 border-b border-zinc-800">
                    <p className="text-[10px] font-semibold text-zinc-400 mb-2">Repartidores en mapa</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMapRepartidorIds(new Set(repartidores.map((r) => r.id)))}
                        className="py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-semibold text-zinc-200 transition"
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setMapRepartidorIds(new Set())}
                        className="py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-semibold text-zinc-400 transition"
                      >
                        Ninguno
                      </button>
                    </div>
                  </div>
                  <ul className="py-1.5 max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                    {repartidores.length === 0 ? (
                      <li className="px-3 py-2 text-[11px] text-zinc-500">No hay repartidores.</li>
                    ) : (
                      repartidores.map((rep) => (
                        <li key={rep.id}>
                          <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-900/80 cursor-pointer transition">
                            <input
                              type="checkbox"
                              checked={mapRepartidorIds.has(rep.id)}
                              onChange={() => toggleMapRepartidor(rep.id)}
                              className="w-3.5 h-3.5 shrink-0 rounded border-zinc-600 bg-zinc-900 text-blue-500 accent-blue-500 focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-0"
                            />
                            <span className="flex-1 min-w-0 text-[11px] text-zinc-100 truncate capitalize">
                              {rep.name}
                            </span>
                            {rep.currentLocation ? (
                              <span
                                className="shrink-0 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/20"
                                title="GPS activo"
                              />
                            ) : (
                              <span className="shrink-0 text-[9px] text-zinc-600" title="Sin GPS">
                                off
                              </span>
                            )}
                          </label>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
          <Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center bg-zinc-950 text-zinc-500 text-xs font-mono">
                Cargando mapa…
              </div>
            }
          >
            <MapComponent
              orders={mapOrders}
              repartidores={mapRepartidores}
              departurePoint={departurePoint}
              pickupPoints={pickupPoints}
              activeOrderId={activeOrderId}
              onSelectOrder={onSelectOrder}
              showDeliveryZones={showMapZones}
            />
          </Suspense>
          {/* Overlay Map Grid design like in the spec */}
          <div className="absolute inset-0 opacity-5 pointer-events-none map-grid-overlay"></div>
        </div>

        {/* Panel Inferior: Detalles de pedido activo o visor de repartidores */}
        <div className="h-[190px] lg:h-[280px] shrink-0 bg-zinc-900/30 border border-zinc-800 rounded-2xl p-4 lg:p-5 overflow-hidden flex flex-col">
          {selectedOrder ? (
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-left scrollbar-thin scrollbar-thumb-zinc-800">
              <div className="flex items-start justify-between border-b border-zinc-800 pb-2">
                <div>
                  <h3 className="font-bold text-xs lg:text-sm text-zinc-100 flex items-center gap-1.5 uppercase font-mono tracking-wider">
                    📦 Envío {selectedOrder.id}
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-sans mt-0.5">Destinatario: {selectedOrder.clientName}</p>
                </div>
                <button
                  onClick={() => onSelectOrder(null)}
                  className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
                >
                  [Cerrar]
                </button>
              </div>

              {/* Fila de Detalles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs lg:text-sm">
                {/* Info Cliente */}
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-zinc-300 text-[11px]">
                    <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="font-semibold text-zinc-400">Dirección:</span> {selectedOrder.address}
                  </p>
                  {selectedOrder.clientPhone && (
                    <p className="flex items-center gap-1.5 text-zinc-300 text-[11px]">
                      <Phone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="font-semibold text-zinc-400">Teléfono:</span> {selectedOrder.clientPhone}
                    </p>
                  )}
                  {selectedOrder.notes && (
                    <p className="flex items-start gap-1.5 text-zinc-400 bg-zinc-950 border border-zinc-800/80 p-2 rounded mt-1 text-[10px] font-sans">
                      <FileText className="w-3 h-3 text-zinc-500 shrink-0 mt-0.5" />
                      <span>{selectedOrder.notes}</span>
                    </p>
                  )}
                </div>

                {/* Info Repartidor / Asignador */}
                <div className="space-y-2">
                  {isAgencyAdmin(userRole) && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-semibold text-zinc-400">Vendedor / tienda:</span>
                      {selectedOrder.sellerName ? (
                        <span className="bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold px-2 py-0.5 rounded text-[10px] uppercase font-mono tracking-wider">
                          🛒 {selectedOrder.sellerName}
                        </span>
                      ) : (
                        <span className="text-amber-500 font-bold font-mono text-[10px] uppercase tracking-wider bg-amber-500/5 border border-amber-500/10 px-1.5 py-0.5 rounded">
                          SIN VENDEDOR
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-semibold text-zinc-400">Repartidor asignado:</span>
                    {selectedOrder.repartidorName ? (
                      <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold px-2 py-0.5 rounded text-[10px] uppercase font-mono tracking-wider">
                        🏍️ {selectedOrder.repartidorName}
                      </span>
                    ) : (
                      <span className="text-amber-500 font-bold font-mono text-[10px] uppercase tracking-wider bg-amber-500/5 border border-amber-500/10 px-1.5 py-0.5 rounded">SIN ASIGNAR</span>
                    )}
                  </div>

                   {/* Asignar vendedor (logística) */}
                  {isAgencyAdmin(userRole) &&
                    onAssignOrderSeller &&
                    selectedOrder.status === OrderStatus.PENDING &&
                    (assigningOrderId === selectedOrder.id || !selectedOrder.sellerId) && (
                      <div className="bg-purple-950/20 border border-purple-900/30 p-2 rounded space-y-1">
                        <p className="text-[9px] font-mono font-bold uppercase text-purple-300">
                          Asignar envío a vendedor:
                        </p>
                        {sellers.length === 0 ? (
                          <p className="text-[9px] text-zinc-500">
                            Creá primero un vendedor en el panel superior.
                          </p>
                        ) : (
                          <select
                            defaultValue={selectedOrder.sellerId ?? ''}
                            onChange={async (e) => {
                              if (!e.target.value) return;
                              try {
                                await onAssignOrderSeller(selectedOrder.id, e.target.value);
                                setAssigningOrderId(null);
                              } catch (err: unknown) {
                                const message = err instanceof Error ? err.message : 'No se pudo asignar el vendedor';
                                void showAlert({ title: 'Error al asignar', message, variant: 'error' });
                              }
                            }}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded p-1 text-[11px] text-zinc-300 focus:outline-none"
                          >
                            <option value="" disabled>
                              Seleccionar vendedor...
                            </option>
                            {sellers.map((seller) => (
                              <option key={seller.id} value={seller.id}>
                                {seller.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}

                   {/* Selector de Asignación de repartidor */}
                  {(selectedOrder.status === OrderStatus.PENDING || assigningOrderId === selectedOrder.id) && (
                    userRole === UserRole.STORE_ADMIN ? (
                      <div className="bg-blue-950/20 border border-blue-900/30 p-2.5 rounded space-y-1">
                        <p className="text-[10px] font-bold text-blue-400 flex items-center gap-1 uppercase font-mono">
                          ⚙️ Coordinado por Logística
                        </p>
                        <p className="text-[9px] text-zinc-400 leading-normal font-sans">
                          La asignación de repartidores y el ruteo están a cargo de la administración de logística de envíos.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-zinc-950 border border-zinc-800 p-2 rounded space-y-1">
                        <p className="text-[9px] font-mono font-bold uppercase text-zinc-500">Asignar repartidor al viaje:</p>
                        {(() => {
                          const orderZone = findZoneForPoint(selectedOrder.lat, selectedOrder.lng);
                          const suggestedRep = orderZone
                            ? repartidores.find((r) => r.deliveryZone === orderZone.id)
                            : null;
                          return (
                            <>
                              {orderZone && (
                                <p className="text-[9px] font-mono text-zinc-400">
                                  Zona del pedido:{' '}
                                  <span style={{ color: orderZone.color }} className="font-bold">
                                    {orderZone.name}
                                  </span>
                                  {suggestedRep && (
                                    <span className="text-blue-400"> · Sugerido: {suggestedRep.name}</span>
                                  )}
                                </p>
                              )}
                              <div className="flex gap-1.5">
                                <select
                                  id={`select-repartidor-${selectedOrder.id}`}
                                  defaultValue={suggestedRep?.id ?? ''}
                                  onChange={async (e) => {
                                    if (!e.target.value) return;
                                    await onUpdateOrderStatus(selectedOrder.id, OrderStatus.ASSIGNED, e.target.value, 'Pedido asignado desde panel de control');
                                    setAssigningOrderId(null);
                                  }}
                                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded p-1 text-[11px] text-zinc-300 focus:outline-none"
                                >
                                  <option value="" disabled>
                                    Seleccionar...
                                  </option>
                                  {repartidores.map((rep) => (
                                    <option key={rep.id} value={rep.id}>
                                      {rep.name}
                                      {rep.deliveryZone ? ` (${zoneLabel(rep.deliveryZone)})` : ''}
                                      {suggestedRep?.id === rep.id ? ' ★' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )
                  )}

                  {/* Estado del pedido y canceladores */}
                  {selectedOrder.status !== OrderStatus.DELIVERED && selectedOrder.status !== OrderStatus.CANCELLED && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onUpdateOrderStatus(selectedOrder.id, OrderStatus.CANCELLED, undefined, 'Cancelado manualmente por el administrador')}
                        className="flex-1 text-center py-1 border border-red-500/20 hover:border-red-500 bg-red-500/5 text-red-400 font-bold text-[10px] uppercase tracking-wider rounded transition"
                      >
                        Cancelar Envío
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Historial de Eventos del Pedido */}
              <div className="border-t border-zinc-800 pt-2.5">
                <p className="text-[9px] font-mono font-bold uppercase text-zinc-500 mb-1.5">Bitácora de Eventos y Estados</p>
                <div className="space-y-1">
                  {selectedOrder.history.map((event, index) => (
                    <div key={index} className="flex items-start gap-2 text-[10px] text-zinc-400 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-bold text-zinc-300">[{event.status.toUpperCase()}]</span> - {event.comment || 'Cambio de estado'}
                        <span className="text-zinc-500 text-[9px] block">
                          Por: {event.updatedBy} | {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500 font-mono p-4">
              <Navigation className="w-6 h-6 text-zinc-700 mb-1.5 animate-pulse" />
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Visor de Envíos Lupo</p>
              <p className="text-[10px] text-zinc-600 mt-0.5 max-w-sm">
                Haz clic en cualquier pedido en la lista o en el mapa para auditar su trayectoria GPS y bitácora en tiempo real.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
