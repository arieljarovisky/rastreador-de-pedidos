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
import StatusBadge from './ui/StatusBadge.tsx';

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

const MAP_ZONES_STORAGE_KEY = 'lupo_map_show_zones';
const MAP_REPS_STORAGE_KEY = 'lupo_map_repartidor_ids';

type MapRepartidorPrefs =
  | { kind: 'default' }
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'some'; ids: Set<string> };

function loadShowMapZones(): boolean {
  try {
    const value = localStorage.getItem(MAP_ZONES_STORAGE_KEY);
    if (value === '0') return false;
    if (value === '1') return true;
  } catch {
    // ignore storage errors
  }
  return true;
}

function loadMapRepartidorPrefs(): MapRepartidorPrefs {
  try {
    const raw = localStorage.getItem(MAP_REPS_STORAGE_KEY);
    if (raw === null) return { kind: 'default' };
    if (raw === 'all') return { kind: 'all' };
    if (raw === 'none') return { kind: 'none' };
    if (raw === '[]') return { kind: 'default' };
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return { kind: 'default' };
      return {
        kind: 'some',
        ids: new Set(parsed.filter((id): id is string => typeof id === 'string')),
      };
    }
  } catch {
    // ignore storage errors
  }
  return { kind: 'default' };
}

function saveMapRepartidorPrefs(
  repartidores: User[],
  selectedIds: Set<string>
): void {
  try {
    if (repartidores.length === 0) return;
    const allSelected = repartidores.every((r) => selectedIds.has(r.id));
    if (allSelected) {
      localStorage.setItem(MAP_REPS_STORAGE_KEY, 'all');
      return;
    }
    if (selectedIds.size === 0) {
      localStorage.setItem(MAP_REPS_STORAGE_KEY, 'none');
      return;
    }
    localStorage.setItem(MAP_REPS_STORAGE_KEY, JSON.stringify([...selectedIds]));
  } catch {
    // ignore storage errors
  }
}

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
  const initialMapRepartidorPrefs = loadMapRepartidorPrefs();
  const storedPrefsKind = useRef(initialMapRepartidorPrefs.kind);
  const mapRepartidorPrefsReady = useRef(initialMapRepartidorPrefs.kind !== 'default');
  const mapDefaultApplied = useRef(false);

  // Estados para Filtros (mapa)
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapRepartidorIds, setMapRepartidorIds] = useState<Set<string>>(() => {
    if (initialMapRepartidorPrefs.kind === 'some') return initialMapRepartidorPrefs.ids;
    return new Set();
  });
  const [mapFilterOpen, setMapFilterOpen] = useState(false);
  const [showMapZones, setShowMapZones] = useState(loadShowMapZones);
  const mapFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(MAP_ZONES_STORAGE_KEY, showMapZones ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [showMapZones]);

  useEffect(() => {
    if (!mapRepartidorPrefsReady.current) return;
    saveMapRepartidorPrefs(repartidores, mapRepartidorIds);
  }, [mapRepartidorIds, repartidores]);

  useEffect(() => {
    if (activeOrderId) {
      setAdminMobileTab('map');
    }
  }, [activeOrderId]);

  useEffect(() => {
    setMapRepartidorIds((prev) => {
      const kind = storedPrefsKind.current;

      if (kind === 'default' && !mapDefaultApplied.current && repartidores.length > 0) {
        mapDefaultApplied.current = true;
        mapRepartidorPrefsReady.current = true;
        return new Set(repartidores.map((r) => r.id));
      }

      if (kind === 'all' && repartidores.length > 0) {
        const missingNew = repartidores.some((r) => !prev.has(r.id));
        if (missingNew || prev.size === 0) {
          return new Set(repartidores.map((r) => r.id));
        }
      }

      if (kind === 'none') {
        return prev.size === 0 ? prev : new Set();
      }

      const next = new Set(prev);
      let changed = false;

      for (const id of [...next]) {
        if (!repartidores.some((r) => r.id === id)) {
          next.delete(id);
          changed = true;
        }
      }

      const allCurrentSelected =
        repartidores.length > 0 && repartidores.every((r) => prev.has(r.id));
      if (allCurrentSelected) {
        for (const rep of repartidores) {
          if (!next.has(rep.id)) {
            next.add(rep.id);
            changed = true;
          }
        }
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
      <div className="lg:hidden flex bg-[var(--surface-panel-2)] p-1 border border-[var(--surface-border)] rounded shrink-0 gap-1">
        <button
          onClick={() => setAdminMobileTab('orders')}
          className={`flex-1 py-1.5 text-center text-[10px] font-mono font-bold uppercase tracking-wider transition rounded-[var(--radius-posta)] ${
            adminMobileTab === 'orders'
              ? 'posta-tab-active shadow-md'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--surface-panel)]'
          }`}
        >
          📋 Pedidos ({filteredOrders.length})
        </button>
        <button
          onClick={() => setAdminMobileTab('map')}
          className={`flex-1 py-1.5 text-center text-[10px] font-mono font-bold uppercase tracking-wider transition rounded-[var(--radius-posta)] ${
            adminMobileTab === 'map'
              ? 'posta-tab-active shadow-md'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--surface-panel)]'
          }`}
        >
          🗺️ Monitoreo GPS
        </button>
      </div>

      {/* SECCIÓN IZQUIERDA: LISTADOS Y CREACIÓN (5 COLUMNAS - HIGH DENSITY) */}
      <div className={`lg:col-span-5 flex flex-col h-full overflow-hidden posta-surface p-4 ${
        adminMobileTab !== 'orders' ? 'hidden lg:flex' : 'flex'
      }`}>
        
        {/* Cabecera, Búsqueda y Filtros */}
        <div className="shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm lg:text-base font-display font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                {userRole === UserRole.STORE_ADMIN ? '🛒 Posta Ventas (Local)' : userRole === UserRole.SUPER_ADMIN ? '👑 Posta Agencia (Super Admin)' : '⚙️ Posta Logística'}
              </h2>
              <p className="mono-label">
                {userRole === UserRole.STORE_ADMIN ? 'Carga de envíos' : 'Asignación de viajes y flota'}
              </p>
            </div>
            
            {userRole === UserRole.STORE_ADMIN && (
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                id="btn-toggle-create-form"
                className="px-2.5 py-1.5 rounded-[5px] bg-[var(--color-cta)] hover:brightness-110 text-[#F6F0E4] font-mono font-bold text-[11px] uppercase tracking-wider transition flex items-center gap-1 shadow-md"
              >
                <Plus className="w-3.5 h-3.5" /> Cargar envío
              </button>
            )}
          </div>

          {/* Tarjetas de Estadísticas Rápidas */}
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div className="bg-[var(--surface-panel-2)] border border-[var(--surface-border)]/80 p-1.5 rounded">
              <p className="text-[9px] text-[var(--color-text-muted)] font-mono font-bold uppercase tracking-tight">Total</p>
              <p className="text-sm lg:text-lg font-bold text-[var(--ink-soft)] mt-0.5 font-mono">{stats.total}</p>
            </div>
            <div className="bg-[var(--surface-panel-2)] border border-[var(--surface-border)]/80 p-1.5 rounded">
              <p className="text-[9px] text-[var(--color-text-muted)] font-mono font-bold uppercase tracking-tight">Pend.</p>
              <p className="text-sm lg:text-lg font-bold text-[var(--ink-soft)] mt-0.5 font-mono">{stats.pending}</p>
            </div>
            <div className="bg-[var(--color-warn)]/5 border border-[var(--color-warn)]/20 p-1.5 rounded">
              <p className="text-[9px] text-[var(--color-warn)] font-mono font-bold uppercase tracking-tight">Ruta</p>
              <p className="text-sm lg:text-lg font-bold text-[var(--color-warn)] mt-0.5 font-mono">{stats.delivering}</p>
            </div>
            <div className="bg-[var(--color-ok)]/5 border border-[var(--color-ok)]/20 p-1.5 rounded">
              <p className="text-[9px] text-[var(--color-ok)] font-mono font-bold uppercase tracking-tight">Listos</p>
              <p className="text-sm lg:text-lg font-bold text-[var(--color-ok)] mt-0.5 font-mono">{stats.delivered}</p>
            </div>
          </div>

          {userRole === UserRole.STORE_ADMIN && (
            <div className="posta-chip-accent border border-[var(--color-accent)]/25 rounded p-2 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-[var(--color-accent)] flex items-center gap-1">
                  🛒 Canal de Ventas Activo
                </p>
                <p className="text-[9px] text-[var(--color-text-muted)] font-mono mt-0.5">Tus envíos se sincronizan con la agencia de logística</p>
              </div>
              <div className="text-[10px] bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-mono font-bold px-1.5 py-0.5 rounded border border-[var(--color-accent)]/20 uppercase">
                Online
              </div>
            </div>
          )}

          {userRole === UserRole.STORE_ADMIN && (
            <div className="bg-[var(--input-bg)]/80 border border-[var(--surface-border)] rounded p-2 text-[10px] text-[var(--color-text-muted)] font-mono">
              Configurá tus puntos de colecta en la pestaña <span className="text-[var(--ink-soft)] font-bold">Configuración</span>.
            </div>
          )}

          {isAgencyAdmin(userRole) && (
            <div className="bg-[var(--input-bg)]/80 border border-[var(--surface-border)] rounded p-2 text-[10px] text-[var(--color-text-muted)] font-mono">
              Gestioná vendedores, repartidores y punto de salida desde la pestaña <span className="text-[var(--ink-soft)] font-bold">Configuración</span>.
            </div>
          )}

          {/* Buscador e hilos de estado */}
          <div className="space-y-1.5">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                placeholder="Buscar repartidor, pedido o dirección..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full posta-input px-2.5 py-1.5 pl-8 text-xs font-sans"
              />
            </div>

            {/* Selector de Tabs de Filtros */}
            <div className="flex bg-[var(--surface-panel-2)] p-0.5 rounded border border-[var(--surface-border)]/80 text-[10px]">
              <button
                onClick={() => setStatusFilter('all')}
                className={`flex-1 py-1 text-center font-bold uppercase tracking-wider rounded transition ${
                  statusFilter === 'all' ? 'bg-[var(--surface-panel-2)] text-[var(--color-text)]' : 'text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setStatusFilter(OrderStatus.PENDING)}
                className={`flex-1 py-1 text-center font-bold uppercase tracking-wider rounded transition ${
                  statusFilter === OrderStatus.PENDING ? 'bg-[var(--surface-panel-2)] text-[var(--color-text)]' : 'text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]'
                }`}
              >
                Pend.
              </button>
              <button
                onClick={() => setStatusFilter(OrderStatus.DELIVERING)}
                className={`flex-1 py-1 text-center font-bold uppercase tracking-wider rounded transition ${
                  statusFilter === OrderStatus.DELIVERING ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]'
                }`}
              >
                Ruta
              </button>
              <button
                onClick={() => setStatusFilter(OrderStatus.DELIVERED)}
                className={`flex-1 py-1 text-center font-bold uppercase tracking-wider rounded transition ${
                  statusFilter === OrderStatus.DELIVERED ? 'bg-[var(--color-ok)] text-[#F6F0E4]' : 'text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]'
                }`}
              >
                Listos
              </button>
            </div>
          </div>
        </div>

        {/* LISTADO DE PEDIDOS / FORMULARIO CREACIÓN (CON SCROLL) */}
        <div className="flex-1 overflow-y-auto mt-3 space-y-2 pr-1 scrollbar-thin">
          
          {/* Formulario de creación desplegable (HIGH DENSITY MODERN STYLE) */}
          {showCreateForm && userRole === UserRole.STORE_ADMIN && (
            <form onSubmit={handleSubmitOrder} className="bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded p-3.5 space-y-3 animate-slide-down shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--surface-border)] pb-2 mb-2">
                <h3 className="font-bold text-xs text-[var(--color-accent)] flex items-center gap-1">📝 Cargar nuevo envío</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] text-[10px] uppercase font-mono tracking-wider font-bold"
                >
                  [Cancelar]
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-mono tracking-wider text-[var(--color-text-muted)] uppercase mb-1">Nombre Cliente *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Marcelo"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded px-2.5 py-1.5 text-xs text-[var(--ink-soft)] focus:outline-none focus:border-[var(--color-accent)] transition-all placeholder:text-[var(--color-text-faint)]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-mono tracking-wider text-[var(--color-text-muted)] uppercase mb-1">Celular / Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej: +5411531234"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded px-2.5 py-1.5 text-xs text-[var(--ink-soft)] focus:outline-none focus:border-[var(--color-accent)] transition-all placeholder:text-[var(--color-text-faint)]"
                  />
                </div>
              </div>

              {/* Presets Rápidos de Direcciones */}
              <div>
                <span className="block text-[9px] font-mono tracking-wider text-[var(--color-text-muted)] uppercase mb-1">Sugerencias Rápidas de Destinos (Buenos Aires)</span>
                <div className="flex flex-wrap gap-1">
                  {DIRECTORY_PRESETS.map((preset, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="text-[9px] bg-[var(--surface-panel-2)] border border-[var(--surface-border)] hover:border-[var(--color-accent)] hover:text-white text-[var(--color-text-muted)] rounded px-1.5 py-0.5 transition font-mono"
                    >
                      📍 {preset.name.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-mono tracking-wider text-[var(--color-text-muted)] uppercase mb-1">Dirección de Entrega *</label>
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
                    className="flex-1 bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded px-2.5 py-1.5 text-xs text-[var(--ink-soft)] focus:outline-none focus:border-[var(--color-accent)] transition-all placeholder:text-[var(--color-text-faint)]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleLocateAddress()}
                    disabled={geocodeLoading || !address.trim()}
                    className="shrink-0 px-2.5 py-1.5 rounded bg-[var(--surface-panel-2)] border border-[var(--surface-border)] text-[10px] font-bold uppercase text-[var(--ink-soft)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
                  >
                    {geocodeLoading ? '...' : 'Ubicar'}
                  </button>
                </div>
                {geocodeMessage && (
                  <p
                    className={`mt-1 text-[10px] font-mono ${
                      coordsConfirmed ? 'text-[var(--color-ok)]' : 'text-[var(--color-warn)]'
                    }`}
                  >
                    {coordsConfirmed ? '✓ ' : '⚠ '}
                    {geocodeMessage}
                  </p>
                )}
                {coordsConfirmed && (
                  <p className="mt-0.5 text-[9px] text-[var(--color-text-faint)] font-mono">
                    Coordenadas: {lat.toFixed(4)}, {lng.toFixed(4)}
                  </p>
                )}
              </div>

              <div className="hidden">
                <input type="hidden" value={lat} readOnly />
                <input type="hidden" value={lng} readOnly />
              </div>

              <div>
                <label className="block text-[9px] font-mono tracking-wider text-[var(--color-text-muted)] uppercase mb-1">Indicaciones / Notas</label>
                <textarea
                  placeholder="Indicaciones para el timbre, ascensor, conserje..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded px-2.5 py-1.5 text-xs text-[var(--ink-soft)] focus:outline-none focus:border-[var(--color-accent)] transition-all placeholder:text-[var(--color-text-faint)]"
                />
              </div>

              <button
                type="submit"
                disabled={formLoading}
                className="w-full bg-[var(--color-cta)] hover:brightness-110 text-[#F6F0E4] font-mono font-bold py-2 rounded-[var(--radius-posta)] text-[11px] uppercase tracking-wider transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {formLoading ? 'Registrando...' : 'Confirmar y Guardar Pedido'}
              </button>
            </form>
          )}

          {/* Listado de pedidos filtrados (HIGH DENSITY STYLE) */}
          {filteredOrders.length === 0 ? (
            <div className="posta-empty">
              <span className="mono-label block mb-2">Sin resultados</span>
              <p>Ningún pedido coincide con los filtros aplicados.</p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isSelected = order.id === activeOrderId;

              const statusLabel =
                order.status === 'delivering'
                  ? '🚲 En Viaje'
                  : order.status === 'assigned'
                    ? '✓ Asignado'
                    : order.status === 'delivered'
                      ? '✓ Entregado'
                      : 'En Almacén';

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
                      ? 'bg-[var(--color-accent)]/5 border-l-2 border-[var(--color-accent)] border-t-[var(--surface-border)] border-r-[var(--surface-border)] border-b-[var(--surface-border)]'
                      : 'bg-[var(--surface-panel-2)]/40 border-[var(--surface-border)]/80 hover:bg-[var(--surface-panel)]/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="mono-label">ID: {order.id}</span>
                    <StatusBadge status={order.status} label={statusLabel} />
                  </div>

                  <h4 className="font-bold text-xs lg:text-sm text-[var(--ink-soft)] mt-2 group-hover:text-white transition">
                    {order.clientName}
                  </h4>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate leading-normal">
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
                        <span className="text-[var(--route-2,var(--color-accent))]">🛒 {order.sellerName}</span>
                      ) : (
                        <span className="text-[var(--color-warn)] font-bold">⚠️ Sin vendedor asignado</span>
                      )}
                    </p>
                  )}

                  {/* Telemetry info just like the design! */}
                  {order.status === OrderStatus.DELIVERING ? (
                    <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-[var(--surface-border)]/30 text-[9px] text-[var(--color-text-muted)] font-mono">
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[var(--color-text-muted)]">Activo</span>
                      </div>
                      <span>BATERÍA: {batteryValue}%</span>
                      <span>VEL: {speedValue}km/h</span>
                    </div>
                  ) : order.status === OrderStatus.ASSIGNED ? (
                    <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-[var(--surface-border)]/30 text-[9px] text-[var(--color-text-muted)] font-mono">
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                        <span className="text-[var(--color-text-muted)]">Preparando</span>
                      </div>
                      <span>Carga asignada</span>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--surface-border)]/30 text-[9px] text-[var(--color-text-muted)] font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[var(--color-text-faint)]" />
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {order.repartidorName ? (
                      <span className="text-[var(--color-accent)] font-semibold uppercase tracking-wider text-[8px] bg-[var(--color-accent)]/5 border border-[var(--color-accent)]/10 px-1 py-0.2 rounded">
                        🏍️ {order.repartidorName.split(' ')[0]}
                      </span>
                    ) : (
                      <span className="text-[var(--color-warn)] font-semibold text-[8px]">⚠️ SIN ASIGNAR</span>
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
                        className="bg-[var(--color-cta)] hover:brightness-110 text-[#F6F0E4] font-mono font-bold text-[9px] px-2 py-0.5 rounded-[var(--radius-posta)] transition uppercase tracking-wider"
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
        <div className="flex-1 min-h-[160px] lg:min-h-[250px] rounded-[var(--radius-posta)] border border-[var(--surface-border)] overflow-hidden relative">
          <div ref={mapFilterRef} className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5 w-44 sm:w-48">
            <button
              type="button"
              onClick={() => setShowMapZones((visible) => !visible)}
              title={showMapZones ? 'Ocultar áreas de entrega' : 'Mostrar áreas de entrega'}
              className={`w-full flex items-center justify-center gap-1.5 rounded-[var(--radius-posta)] px-2.5 py-2 border shadow-lg backdrop-blur-md transition text-[10px] font-semibold ${
                showMapZones
                  ? 'bg-[var(--color-accent)]/90 border-[var(--color-accent)] text-white hover:brightness-110'
                  : 'bg-[var(--surface-panel)]/95 border-[var(--surface-border)]/80 text-[var(--color-text-muted)] hover:border-[var(--color-accent)]'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              {showMapZones ? 'Ocultar áreas' : 'Ver áreas'}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMapFilterOpen((open) => !open)}
                className="w-full flex items-center gap-2 bg-[var(--surface-panel)]/95 backdrop-blur-md border border-[var(--surface-border)]/80 hover:border-[var(--color-accent)] rounded-[var(--radius-posta)] px-2.5 py-2 shadow-lg transition text-left"
                aria-expanded={mapFilterOpen}
                aria-haspopup="listbox"
              >
                <Users className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                <span className="flex-1 min-w-0 text-[11px] font-medium text-[var(--color-text)] truncate">
                  {mapFilterLabel}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[var(--color-text-muted)] shrink-0 transition-transform duration-200 ${mapFilterOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {mapFilterOpen && (
                <div className="absolute top-[calc(100%+0.4rem)] left-0 w-full bg-[var(--surface-panel)]/98 backdrop-blur-md border border-[var(--surface-border)]/80 rounded-[var(--radius-posta)] shadow-2xl overflow-hidden">
                  <div className="px-3 pt-3 pb-2.5 border-b border-[var(--surface-border)]">
                    <p className="text-[10px] font-semibold text-[var(--color-text-muted)] mb-2">Repartidores en mapa</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMapRepartidorIds(new Set(repartidores.map((r) => r.id)))}
                        className="py-1.5 rounded-[var(--radius-posta)] bg-[var(--surface-panel-2)] hover:bg-[var(--surface-panel)] text-[10px] font-semibold text-[var(--ink-soft)] transition"
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setMapRepartidorIds(new Set())}
                        className="py-1.5 rounded-[var(--radius-posta)] bg-[var(--surface-panel-2)] hover:bg-[var(--surface-panel)] text-[10px] font-semibold text-[var(--color-text-muted)] transition"
                      >
                        Ninguno
                      </button>
                    </div>
                  </div>
                  <ul className="py-1.5 max-h-36 overflow-y-auto scrollbar-thin">
                    {repartidores.length === 0 ? (
                      <li className="px-3 py-2 text-[11px] text-[var(--color-text-muted)]">No hay repartidores.</li>
                    ) : (
                      repartidores.map((rep) => (
                        <li key={rep.id}>
                          <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--surface-panel)]/80 cursor-pointer transition">
                            <input
                              type="checkbox"
                              checked={mapRepartidorIds.has(rep.id)}
                              onChange={() => toggleMapRepartidor(rep.id)}
                              className="w-3.5 h-3.5 shrink-0 rounded border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-accent)] accent-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:ring-offset-0"
                            />
                            <span className="flex-1 min-w-0 text-[11px] text-[var(--color-text)] truncate capitalize">
                              {rep.name}
                            </span>
                            {rep.currentLocation ? (
                              <span
                                className="shrink-0 w-2 h-2 rounded-full bg-[var(--color-ok)] ring-2 ring-[var(--color-ok)]/20"
                                title="GPS activo"
                              />
                            ) : (
                              <span className="shrink-0 text-[9px] text-[var(--color-text-faint)]" title="Sin GPS">
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
              <div className="w-full h-full flex items-center justify-center bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] text-xs font-mono">
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
        <div className="h-[190px] lg:h-[280px] shrink-0 posta-surface p-4 lg:p-5 overflow-hidden flex flex-col">
          {selectedOrder ? (
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-left scrollbar-thin">
              <div className="flex items-start justify-between border-b border-[var(--surface-border)] pb-2">
                <div>
                  <h3 className="font-bold text-xs lg:text-sm text-[var(--color-text)] flex items-center gap-1.5 uppercase font-mono tracking-wider">
                    📦 Envío {selectedOrder.id}
                  </h3>
                  <p className="text-[10px] text-[var(--color-text-muted)] font-sans mt-0.5">Destinatario: {selectedOrder.clientName}</p>
                </div>
                <button
                  onClick={() => onSelectOrder(null)}
                  className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]"
                >
                  [Cerrar]
                </button>
              </div>

              {/* Fila de Detalles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs lg:text-sm">
                {/* Info Cliente */}
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-[var(--ink-soft)] text-[11px]">
                    <MapPin className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                    <span className="font-semibold text-[var(--color-text-muted)]">Dirección:</span> {selectedOrder.address}
                  </p>
                  {selectedOrder.clientPhone && (
                    <p className="flex items-center gap-1.5 text-[var(--ink-soft)] text-[11px]">
                      <Phone className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                      <span className="font-semibold text-[var(--color-text-muted)]">Teléfono:</span> {selectedOrder.clientPhone}
                    </p>
                  )}
                  {selectedOrder.notes && (
                    <p className="flex items-start gap-1.5 text-[var(--color-text-muted)] bg-[var(--surface-panel-2)] border border-[var(--surface-border)]/80 p-2 rounded mt-1 text-[10px] font-sans">
                      <FileText className="w-3 h-3 text-[var(--color-text-muted)] shrink-0 mt-0.5" />
                      <span>{selectedOrder.notes}</span>
                    </p>
                  )}
                </div>

                {/* Info Repartidor / Asignador */}
                <div className="space-y-2">
                  {isAgencyAdmin(userRole) && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-semibold text-[var(--color-text-muted)]">Vendedor / tienda:</span>
                      {selectedOrder.sellerName ? (
                        <span className="bg-[var(--color-accent)]/10 text-[var(--route-2,var(--color-accent))] border border-[var(--color-accent)]/20 font-bold px-2 py-0.5 rounded text-[10px] uppercase font-mono tracking-wider">
                          🛒 {selectedOrder.sellerName}
                        </span>
                      ) : (
                        <span className="text-[var(--color-warn)] font-bold font-mono text-[10px] uppercase tracking-wider bg-[var(--color-warn)]/5 border border-[var(--color-warn)]/10 px-1.5 py-0.5 rounded">
                          SIN VENDEDOR
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-semibold text-[var(--color-text-muted)]">Repartidor asignado:</span>
                    {selectedOrder.repartidorName ? (
                      <span className="bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20 font-bold px-2 py-0.5 rounded text-[10px] uppercase font-mono tracking-wider">
                        🏍️ {selectedOrder.repartidorName}
                      </span>
                    ) : (
                      <span className="text-[var(--color-warn)] font-bold font-mono text-[10px] uppercase tracking-wider bg-[var(--color-warn)]/5 border border-[var(--color-warn)]/10 px-1.5 py-0.5 rounded">SIN ASIGNAR</span>
                    )}
                  </div>

                   {/* Asignar vendedor (logística) */}
                  {isAgencyAdmin(userRole) &&
                    onAssignOrderSeller &&
                    selectedOrder.status === OrderStatus.PENDING &&
                    (assigningOrderId === selectedOrder.id || !selectedOrder.sellerId) && (
                      <div className="bg-[var(--color-accent)]/8 border border-[var(--color-accent)]/20 p-2 rounded space-y-1">
                        <p className="text-[9px] font-mono font-bold uppercase text-[var(--route-2,var(--color-accent))]">
                          Asignar envío a vendedor:
                        </p>
                        {sellers.length === 0 ? (
                          <p className="text-[9px] text-[var(--color-text-muted)]">
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
                            className="w-full bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded p-1 text-[11px] text-[var(--ink-soft)] focus:outline-none"
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
                      <div className="posta-chip-accent border border-[var(--color-accent)]/25 p-2.5 rounded space-y-1">
                        <p className="text-[10px] font-bold text-[var(--color-accent)] flex items-center gap-1 uppercase font-mono">
                          ⚙️ Coordinado por Logística
                        </p>
                        <p className="text-[9px] text-[var(--color-text-muted)] leading-normal font-sans">
                          La asignación de repartidores y el ruteo están a cargo de la administración de logística de envíos.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-[var(--surface-panel-2)] border border-[var(--surface-border)] p-2 rounded space-y-1">
                        <p className="text-[9px] font-mono font-bold uppercase text-[var(--color-text-muted)]">Asignar repartidor al viaje:</p>
                        {(() => {
                          const orderZone = findZoneForPoint(selectedOrder.lat, selectedOrder.lng);
                          const suggestedRep = orderZone
                            ? repartidores.find((r) => r.deliveryZone === orderZone.id)
                            : null;
                          return (
                            <>
                              {orderZone && (
                                <p className="text-[9px] font-mono text-[var(--color-text-muted)]">
                                  Zona del pedido:{' '}
                                  <span style={{ color: orderZone.color }} className="font-bold">
                                    {orderZone.name}
                                  </span>
                                  {suggestedRep && (
                                    <span className="text-[var(--color-accent)]"> · Sugerido: {suggestedRep.name}</span>
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
                                  className="flex-1 bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded p-1 text-[11px] text-[var(--ink-soft)] focus:outline-none"
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
                        className="flex-1 text-center py-1 border border-[var(--color-danger)]/20 hover:border-[var(--color-danger)] bg-[var(--color-danger)]/5 text-[var(--color-danger)] font-bold text-[10px] uppercase tracking-wider rounded transition"
                      >
                        Cancelar Envío
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Historial de Eventos del Pedido */}
              <div className="border-t border-[var(--surface-border)] pt-2.5">
                <p className="text-[9px] font-mono font-bold uppercase text-[var(--color-text-muted)] mb-1.5">Bitácora de Eventos y Estados</p>
                <div className="space-y-1">
                  {selectedOrder.history.map((event, index) => (
                    <div key={index} className="flex items-start gap-2 text-[10px] text-[var(--color-text-muted)] font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-accent)] mt-0.5 shrink-0" />
                      <div>
                        <span className="font-bold text-[var(--ink-soft)]">[{event.status.toUpperCase()}]</span> - {event.comment || 'Cambio de estado'}
                        <span className="text-[var(--color-text-muted)] text-[9px] block">
                          Por: {event.updatedBy} | {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="posta-empty flex-1 flex flex-col items-center justify-center p-4">
              <Navigation className="w-6 h-6 text-[var(--color-text-faint)] mb-1.5 animate-pulse" />
              <p className="text-[11px] font-display font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Visor de Envíos Posta</p>
              <p className="text-[10px] text-[var(--color-text-faint)] mt-0.5 max-w-sm">
                Haz clic en cualquier pedido en la lista o en el mapa para auditar su trayectoria GPS y bitácora en tiempo real.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
