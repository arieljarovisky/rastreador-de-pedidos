/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { Order, OrderStatus, User, UserRole, LocationPoint, PickupPoint, isAgencyAdmin } from '../types.js';
import { Plus, Navigation, Clock, MapPin, Search, Phone, FileText, CheckCircle2, Package, Truck, CheckCircle, SlidersHorizontal, ClipboardList, Send, ArrowRight, Settings } from 'lucide-react';
import { geocodeAddress } from '../utils/geocode.js';
import OrderContextMenu, { ContextMenuItem } from './OrderContextMenu.tsx';
import { useModal } from '../context/ModalContext.tsx';
import { ui, orderBadgeClass } from '../styles/ui.ts';

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
  userName?: string;
  adminView?: 'orders' | 'map';
  onGoToSettings?: () => void;
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
  userName = 'Usuario',
  adminView = 'orders',
  onGoToSettings,
}: AdminDashboardProps) {
  const [adminMobileTab, setAdminMobileTab] = useState<'orders' | 'map'>(adminView);
  const [contextMenu, setContextMenu] = useState<{ order: Order; x: number; y: number } | null>(null);
  const { confirm, alert: showAlert } = useModal();

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    setAdminMobileTab(adminView);
  }, [adminView]);

  useEffect(() => {
    if (activeOrderId) {
      setAdminMobileTab('map');
    }
  }, [activeOrderId]);

  // Estados para Filtros
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

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
    <div className="flex flex-col h-full overflow-hidden gap-3" id="admin-dashboard">
      {contextMenu && (
        <OrderContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildOrderMenuItems(contextMenu.order)}
          onClose={closeContextMenu}
        />
      )}

      <div className="hidden lg:block shrink-0 space-y-3">
        <div className={ui.welcome}>
          <h1 className={ui.welcomeTitle}>¡Bienvenido de vuelta, {userName}! 👋</h1>
          <p className={ui.welcomeSubtitle}>
            {userRole === UserRole.STORE_ADMIN
              ? 'Gestioná tus envíos y seguí el estado en tiempo real.'
              : 'Asigná viajes, monitoreá repartidores y optimizá la operación logística.'}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className={ui.statCard}>
            <div className={ui.statIconPurple}><Package className="w-4 h-4" /></div>
            <div>
              <p className={`${ui.metricValue} text-lg`}>{stats.total}</p>
              <p className={ui.metricLabel}>Total pedidos</p>
            </div>
          </div>
          <div className={ui.statCard}>
            <div className={ui.statIconAmber}><Clock className="w-4 h-4" /></div>
            <div>
              <p className={`${ui.metricValue} text-lg`}>{stats.pending}</p>
              <p className={ui.metricLabel}>Pendientes</p>
            </div>
          </div>
          <div className={ui.statCard}>
            <div className={ui.statIconBlue}><Truck className="w-4 h-4" /></div>
            <div>
              <p className={`${ui.metricValue} text-lg`}>{stats.delivering}</p>
              <p className={ui.metricLabel}>En ruta</p>
            </div>
          </div>
          <div className={ui.statCard}>
            <div className={ui.statIconGreen}><CheckCircle className="w-4 h-4" /></div>
            <div>
              <p className={`${ui.metricValueSuccess} text-lg`}>{stats.delivered}</p>
              <p className={ui.metricLabel}>Listos</p>
            </div>
          </div>
        </div>

        {onGoToSettings && (
          <div className={ui.ctaBanner}>
            <div className="flex items-center gap-2.5">
              <div className={`${ui.statIconPurple} w-8 h-8`}>
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--lupo-text)]">
                  {isAgencyAdmin(userRole)
                    ? 'Gestioná vendedores, repartidores y punto de salida'
                    : 'Configurá tus puntos de colecta'}
                </p>
                <p className={`${ui.hint} mt-0.5`}>Todo desde un solo lugar en Configuración</p>
              </div>
            </div>
            <button type="button" onClick={onGoToSettings} className={`${ui.btnPrimary} ${ui.btnSm} shrink-0`}>
              Ir a Configuración <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-3 lg:gap-4 flex-1 min-h-0 overflow-hidden">
      <div className="lg:hidden flex p-1 border border-[var(--lupo-border-subtle)] rounded-lg shrink-0 gap-1 bg-[var(--lupo-surface)]">
        <button
          onClick={() => setAdminMobileTab('orders')}
          className={adminMobileTab === 'orders' ? ui.segmentActive : ui.segment}
        >
          Pedidos ({filteredOrders.length})
        </button>
        <button
          onClick={() => setAdminMobileTab('map')}
          className={adminMobileTab === 'map' ? ui.segmentActive : ui.segment}
        >
          Mapa GPS
        </button>
      </div>

      <div className={`lg:col-span-5 flex flex-col h-full overflow-hidden ${ui.panel} ${
        adminMobileTab !== 'orders' ? 'hidden lg:flex' : 'flex'
      }`}>
        
        <div className="shrink-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className={ui.pageTitle}>Pedidos</h2>
              <p className={ui.pageSubtitle}>
                {filteredOrders.length} resultado{filteredOrders.length !== 1 ? 's' : ''}
              </p>
            </div>
            
            <div className="flex items-center gap-1.5">
              {userRole === UserRole.STORE_ADMIN && (
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  id="btn-toggle-create-form"
                  className={`${ui.btnPrimary} ${ui.btnSm}`}
                >
                  <Plus className="w-3.5 h-3.5" /> Cargar
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--lupo-text-muted)]">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                placeholder="Buscar pedido, cliente o dirección..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${ui.input} pl-8`}
              />
            </div>
            <button type="button" className={`${ui.btnSecondary} ${ui.btnSm} shrink-0`} title="Filtros">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filtros
            </button>
          </div>

          <div className={ui.segmentGroup}>
              <button
                onClick={() => setStatusFilter('all')}
                className={statusFilter === 'all' ? ui.segmentActive : ui.segment}
              >
                Todos
              </button>
              <button
                onClick={() => setStatusFilter(OrderStatus.PENDING)}
                className={statusFilter === OrderStatus.PENDING ? ui.segmentActive : ui.segment}
              >
                Pendientes
              </button>
              <button
                onClick={() => setStatusFilter(OrderStatus.DELIVERING)}
                className={statusFilter === OrderStatus.DELIVERING ? ui.segmentActive : ui.segment}
              >
                En ruta
              </button>
              <button
                onClick={() => setStatusFilter(OrderStatus.DELIVERED)}
                className={statusFilter === OrderStatus.DELIVERED ? ui.segmentActive : ui.segment}
              >
                Listos
              </button>
          </div>
        </div>

        {/* LISTADO DE PEDIDOS / FORMULARIO CREACIÓN (CON SCROLL) */}
        <div className="flex-1 overflow-y-auto mt-3 space-y-2 pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
          
          {showCreateForm && userRole === UserRole.STORE_ADMIN && (
            <form onSubmit={handleSubmitOrder} className={`${ui.card} p-3.5 space-y-3 animate-slide-down`}>
              <div className="flex items-center justify-between border-b border-[var(--lupo-border-subtle)] pb-2 mb-2">
                <h3 className="font-semibold text-xs text-[var(--lupo-accent)]">Cargar nuevo envío</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className={`${ui.btnGhost} ${ui.btnSm}`}
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={ui.label}>Nombre cliente *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Marcelo"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className={ui.input}
                  />
                </div>
                <div>
                  <label className={ui.label}>Celular / teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej: +5411531234"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className={ui.input}
                  />
                </div>
              </div>

              <div>
                <span className={ui.label}>Destinos sugeridos (CABA)</span>
                <div className="flex flex-wrap gap-1">
                  {DIRECTORY_PRESETS.map((preset, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`${ui.btnSecondary} ${ui.btnSm} text-[9px]`}
                    >
                      {preset.name.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={ui.label}>Dirección de entrega *</label>
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
                    className={`${ui.input} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => void handleLocateAddress()}
                    disabled={geocodeLoading || !address.trim()}
                    className={`${ui.btnSecondary} ${ui.btnSm} shrink-0`}
                  >
                    {geocodeLoading ? '...' : 'Ubicar'}
                  </button>
                </div>
                {geocodeMessage && (
                  <p className={`mt-1 text-[10px] ${coordsConfirmed ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {coordsConfirmed ? '✓ ' : '⚠ '}
                    {geocodeMessage}
                  </p>
                )}
                {coordsConfirmed && (
                  <p className={`${ui.hint} mt-0.5`}>
                    Coordenadas: {lat.toFixed(4)}, {lng.toFixed(4)}
                  </p>
                )}
              </div>

              <div className="hidden">
                <input type="hidden" value={lat} readOnly />
                <input type="hidden" value={lng} readOnly />
              </div>

              <div>
                <label className={ui.label}>Indicaciones / notas</label>
                <textarea
                  placeholder="Indicaciones para el timbre, ascensor, conserje..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className={ui.input}
                />
              </div>

              <button
                type="submit"
                disabled={formLoading}
                className={`${ui.btnPrimary} w-full`}
              >
                {formLoading ? 'Registrando...' : 'Confirmar y guardar pedido'}
              </button>
            </form>
          )}

          {filteredOrders.length === 0 ? (
            <div className={ui.emptyState}>
              <div className={ui.emptyIcon}>
                <ClipboardList className="w-8 h-8" />
              </div>
              <p className="text-sm font-medium text-[var(--lupo-text-secondary)]">No hay pedidos para mostrar</p>
              <p className={`${ui.hint} mt-1 max-w-xs`}>
                {searchQuery || statusFilter !== 'all'
                  ? 'Probá cambiar los filtros o la búsqueda.'
                  : userRole === UserRole.STORE_ADMIN
                    ? 'Cargá tu primer envío con el botón Cargar.'
                    : 'Los envíos aparecerán cuando los vendedores los registren.'}
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isSelected = order.id === activeOrderId;
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
                  className={`p-3.5 transition cursor-pointer text-left relative overflow-hidden group ${
                    isSelected ? ui.cardSelected : ui.cardInteractive
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`${ui.hint} font-mono`}>ID: {order.id}</span>
                    <span className={orderBadgeClass(order.status)}>
                      {order.status === 'delivering' ? 'En viaje' : order.status === 'assigned' ? 'Asignado' : order.status === 'delivered' ? 'Entregado' : order.status === 'cancelled' ? 'Cancelado' : 'En almacén'}
                    </span>
                  </div>

                  <h4 className="font-semibold text-xs lg:text-sm text-[var(--lupo-text)] mt-2 group-hover:text-white transition">
                    {order.clientName}
                  </h4>
                  <p className="text-[11px] text-[var(--lupo-text-secondary)] mt-0.5 truncate leading-normal flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0" /> {order.address}
                  </p>
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
        
        <div className={`flex-1 min-h-[160px] lg:min-h-[200px] ${ui.panel} ${ui.panelFlush} overflow-hidden relative`}>
          <div className="absolute top-3 left-3 z-[500] px-2.5 py-1 rounded-md bg-white/95 border border-[var(--lupo-border-subtle)] shadow-sm text-xs font-semibold text-[var(--lupo-text)]">
            Mapa en tiempo real
          </div>
          <Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center bg-[var(--lupo-bg)] text-[var(--lupo-text-muted)] text-xs">
                Cargando mapa…
              </div>
            }
          >
            <MapComponent
              orders={orders}
              repartidores={repartidores}
              departurePoint={departurePoint}
              pickupPoints={pickupPoints}
              activeOrderId={activeOrderId}
              onSelectOrder={onSelectOrder}
            />
          </Suspense>
          {/* Overlay Map Grid design like in the spec */}
          <div className="absolute inset-0 opacity-5 pointer-events-none map-grid-overlay"></div>
        </div>

        {/* Panel Inferior: Detalles de pedido activo o visor de repartidores */}
        <div className={`h-[190px] lg:h-[280px] shrink-0 ${ui.panel} overflow-hidden flex flex-col`}>
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
                        <div className="flex gap-1.5">
                          <select
                            id={`select-repartidor-${selectedOrder.id}`}
                            defaultValue=""
                            onChange={async (e) => {
                              if (!e.target.value) return;
                              await onUpdateOrderStatus(selectedOrder.id, OrderStatus.ASSIGNED, e.target.value, 'Pedido asignado desde panel de control');
                              setAssigningOrderId(null);
                            }}
                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded p-1 text-[11px] text-zinc-300 focus:outline-none"
                          >
                            <option value="" disabled>Seleccionar...</option>
                            {repartidores.map((rep) => (
                              <option key={rep.id} value={rep.id}>
                                {rep.name}
                              </option>
                            ))}
                          </select>
                        </div>
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
            <div className={`flex-1 flex flex-col items-center justify-center text-center p-4 ${ui.panel}`}>
              <div className="lupo-radar">
                <div className="lupo-radar-ring" />
                <div className="lupo-radar-ring" />
                <div className="lupo-radar-ring" />
                <div className="lupo-radar-center">
                  <Send className="w-5 h-5" />
                </div>
              </div>
              <p className="text-sm font-semibold text-[var(--lupo-text-secondary)]">Visor de envíos Lupo</p>
              <p className={`${ui.hint} mt-1 max-w-sm`}>
                Seleccioná un pedido en la lista o en el mapa para ver su trayectoria y bitácora en tiempo real.
              </p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
