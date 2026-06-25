/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Order, OrderStatus, User, UserRole } from '../types.js';
import { Plus, Navigation, Clock, UserCheck, Eye, Sparkles, MapPin, Search, Phone, FileText, CheckCircle2, RefreshCw, Play, Pause } from 'lucide-react';
import MapComponent from './MapComponent.tsx';

interface AdminDashboardProps {
  orders: Order[];
  repartidores: User[];
  activeOrderId: string | null;
  onSelectOrder: (orderId: string | null) => void;
  onCreateOrder: (orderData: Partial<Order>) => Promise<void>;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus, repartidorId?: string, comment?: string) => Promise<void>;
  onTriggerSimulatorTick: () => Promise<void>;
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
  activeOrderId,
  onSelectOrder,
  onCreateOrder,
  onUpdateOrderStatus,
  onTriggerSimulatorTick,
  userRole = UserRole.STORE_ADMIN,
}: AdminDashboardProps) {
  const [adminMobileTab, setAdminMobileTab] = useState<'orders' | 'map'>('orders');

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

  // Estados del Simulador
  const [isSimulating, setIsSimulating] = useState(false);
  const [simInterval, setSimInterval] = useState<number | null>(null);

  // Estados para Asignación Rápida
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);

  // Efecto para el tick automático del simulador
  useEffect(() => {
    if (isSimulating) {
      const interval = window.setInterval(() => {
        onTriggerSimulatorTick();
      }, 3000);
      setSimInterval(interval);
    } else {
      if (simInterval) {
        clearInterval(simInterval);
        setSimInterval(null);
      }
    }
    return () => {
      if (simInterval) clearInterval(simInterval);
    };
  }, [isSimulating]);

  // Aplicar preset de dirección
  const applyPreset = (preset: typeof DIRECTORY_PRESETS[0]) => {
    setAddress(preset.name);
    setLat(preset.lat);
    setLng(preset.lng);
  };

  // Manejar envío del formulario
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName || !address) return;

    setFormLoading(true);
    try {
      await onCreateOrder({
        clientName,
        clientPhone,
        address,
        lat,
        lng,
        notes,
      });
      // Reset
      setClientName('');
      setClientPhone('');
      setAddress('');
      setLat(-34.58);
      setLng(-58.40);
      setNotes('');
      setShowCreateForm(false);
    } catch (err) {
      alert('Error al crear el pedido.');
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

  // Contadores para resúmenes estadísticos rápidos
  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === OrderStatus.PENDING).length,
    delivering: orders.filter((o) => o.status === OrderStatus.DELIVERING).length,
    delivered: orders.filter((o) => o.status === OrderStatus.DELIVERED).length,
  };

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 gap-3 lg:gap-4 h-full overflow-hidden" id="admin-dashboard">
      
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
      <div className={`lg:col-span-5 flex flex-col h-full overflow-hidden bg-zinc-900/30 border border-zinc-800 rounded-lg p-4 shadow-xl ${
        adminMobileTab !== 'orders' ? 'hidden lg:flex' : 'flex'
      }`}>
        
        {/* Cabecera, Búsqueda y Filtros */}
        <div className="shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm lg:text-base font-bold text-zinc-100 flex items-center gap-1.5">
                {userRole === UserRole.STORE_ADMIN ? '🛒 Lupo Ventas (Local)' : '⚙️ Lupo Logística'}
              </h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">
                {userRole === UserRole.STORE_ADMIN ? 'Registro de Pedidos' : 'Gestión de Logística'}
              </p>
            </div>
            
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              id="btn-toggle-create-form"
              className="px-2.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] uppercase tracking-wider transition flex items-center gap-1 shadow-md shadow-blue-600/10"
            >
              <Plus className="w-3.5 h-3.5" /> Nuevo Pedido
            </button>
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

          {/* Controles del Simulador de GPS o Panel de Ventas */}
          {userRole === UserRole.STORE_ADMIN ? (
            <div className="bg-blue-950/20 border border-blue-900/30 rounded p-2 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-blue-400 flex items-center gap-1">
                  🛒 Canal de Ventas Activo
                </p>
                <p className="text-[9px] text-zinc-400 font-mono mt-0.5">Los envíos se sincronizan con Logística automáticamente</p>
              </div>
              <div className="text-[10px] bg-blue-500/10 text-blue-400 font-mono font-bold px-1.5 py-0.5 rounded border border-blue-500/20 uppercase">
                Online
              </div>
            </div>
          ) : (
            <div className="bg-zinc-950 border border-zinc-800 rounded p-2 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-zinc-200 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Simulador GPS Realtime
                </p>
                <p className="text-[9px] text-zinc-500 font-mono mt-0.5">Mueve dinámicamente la flota activa</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={onTriggerSimulatorTick}
                  id="btn-simulator-step"
                  title="Avanzar paso manual"
                  className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsSimulating(!isSimulating)}
                  id="btn-simulator-toggle"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded font-bold text-[10px] uppercase tracking-wider transition ${
                    isSimulating 
                      ? 'bg-amber-500 text-zinc-950 hover:bg-amber-400' 
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {isSimulating ? (
                    <>
                      <Pause className="w-3 h-3" /> Pausar
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" /> Autoplay
                    </>
                  )}
                </button>
              </div>
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
          {showCreateForm && (
            <form onSubmit={handleSubmitOrder} className="bg-zinc-950 border border-zinc-800 rounded p-3.5 space-y-3 animate-slide-down shadow-xl">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2">
                <h3 className="font-bold text-xs text-blue-400 flex items-center gap-1">📝 Registrar Nuevo Envío</h3>
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
                <input
                  type="text"
                  required
                  placeholder="Calle, altura, departamento, barrio"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 transition-all placeholder:text-zinc-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-mono tracking-wider text-zinc-500 uppercase mb-1">Latitud GPS</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={lat}
                    onChange={(e) => setLat(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-mono tracking-wider text-zinc-500 uppercase mb-1">Longitud GPS</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={lng}
                    onChange={(e) => setLng(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 transition-all font-mono"
                  />
                </div>
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
                  {order.status === OrderStatus.PENDING && userRole === UserRole.LOGISTICS_ADMIN && (
                    <div className="absolute right-3 bottom-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssigningOrderId(order.id);
                        }}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-[9px] px-2 py-0.5 rounded transition uppercase tracking-wider"
                      >
                        Asignar
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
        <div className="flex-1 min-h-[160px] lg:min-h-[250px] rounded-lg border border-zinc-800 overflow-hidden relative">
          <MapComponent
            orders={orders}
            repartidores={repartidores}
            activeOrderId={activeOrderId}
            onSelectOrder={onSelectOrder}
          />
          {/* Overlay Map Grid design like in the spec */}
          <div className="absolute inset-0 opacity-5 pointer-events-none map-grid-overlay"></div>
        </div>

        {/* Panel Inferior: Detalles de pedido activo o visor de repartidores */}
        <div className="h-[190px] lg:h-[280px] shrink-0 bg-zinc-900/30 border border-zinc-800 rounded-lg p-4 lg:p-5 overflow-hidden flex flex-col">
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

                   {/* Selector de Asignación en el Panel de Detalles */}
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
                        <p className="text-[9px] font-mono font-bold uppercase text-zinc-500">Asignar Repartidor Lupo:</p>
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
