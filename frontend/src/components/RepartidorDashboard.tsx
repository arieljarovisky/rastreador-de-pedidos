/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Order, OrderStatus, User, LocationPoint, PickupPoint } from '../types.js';
import { Navigation, AlertTriangle, Play, Check, ShieldAlert, Sparkles, FileText } from 'lucide-react';
import { useModal } from '../context/ModalContext.tsx';

const MapComponent = lazy(() => import('./MapComponent.tsx'));

function getCollectLabel(
  order: Order,
  pickupPoints: PickupPoint[],
  departurePoint: LocationPoint | null
): string {
  if (order.sellerId) {
    const pickup = pickupPoints.find((p) => p.userId === order.sellerId);
    if (pickup?.label) return pickup.label;
  }
  if (departurePoint?.address) {
    const short = departurePoint.address.split(',')[0]?.trim();
    if (short) return short;
  }
  return 'Punto de salida';
}

interface RepartidorDashboardProps {
  orders: Order[];
  currentUser: User;
  activeOrderId: string | null;
  departurePoint?: LocationPoint | null;
  pickupPoints?: PickupPoint[];
  onSelectOrder: (orderId: string | null) => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus, repartidorId?: string, comment?: string) => Promise<void>;
  onReportLocation: (orderId: string, lat: number, lng: number) => Promise<void>;
}

export default function RepartidorDashboard({
  orders,
  currentUser,
  activeOrderId,
  departurePoint = null,
  pickupPoints = [],
  onSelectOrder,
  onUpdateOrderStatus,
  onReportLocation,
}: RepartidorDashboardProps) {
  const { alert: showAlert } = useModal();
  const [activeTab, setActiveTab] = useState<'assigned' | 'available'>('assigned');
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const lastGpsSentAt = useRef(0);

  const reportGps = (orderId: string, latitude: number, longitude: number) => {
    const now = Date.now();
    if (now - lastGpsSentAt.current < 2000) return;
    lastGpsSentAt.current = now;
    onReportLocation(orderId, latitude, longitude);
  };

  const myAssignedOrders = orders.filter(
    (o) => o.repartidorId === currentUser.id && o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELLED
  );

  const availableOrders = orders.filter((o) => o.status === OrderStatus.PENDING);

  const activeOrder = orders.find((o) => o.id === activeOrderId) || myAssignedOrders[0] || null;

  const repForMap = useMemo(
    () => [
      {
        ...currentUser,
        currentLocation: currentCoords
          ? { lat: currentCoords.lat, lng: currentCoords.lng, timestamp: new Date().toISOString() }
          : currentUser.currentLocation,
      },
    ],
    [currentUser, currentCoords]
  );

  // GPS en vivo: preview en assigned, reporte al servidor en delivering
  useEffect(() => {
    let watchId: number | null = null;

    const trackLocation =
      activeOrder &&
      (activeOrder.status === OrderStatus.DELIVERING || activeOrder.status === OrderStatus.ASSIGNED);

    if (trackLocation && 'geolocation' in navigator) {
      setGpsError(null);
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentCoords({ lat: latitude, lng: longitude });
          setGpsError(null);
          if (activeOrder.status === OrderStatus.DELIVERING) {
            reportGps(activeOrder.id, latitude, longitude);
          }
        },
        (error) => {
          console.error('Error de Geolocalización:', error);
          let errMsg = 'Error al leer el GPS.';
          if (error.code === error.PERMISSION_DENIED) {
            errMsg =
              activeOrder.status === OrderStatus.DELIVERING
                ? 'Permiso de GPS denegado. Activá la ubicación en el navegador para continuar el viaje.'
                : 'Permiso de GPS denegado. Activá la ubicación para ver la ruta al destino.';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            errMsg = 'Ubicación GPS no disponible.';
          }
          setGpsError(errMsg);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
      );
    } else if (!trackLocation) {
      setGpsError(null);
    } else {
      setGpsError('Este dispositivo no soporta geolocalización.');
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [activeOrder?.id, activeOrder?.status]);

  const handleAutoPilotSimulation = async () => {
    if (!activeOrder) return;

    if (activeOrder.status === OrderStatus.ASSIGNED) {
      await onUpdateOrderStatus(activeOrder.id, OrderStatus.DELIVERING, undefined, 'Viaje iniciado (Simulación de ruta)');
    }

    const startLat = currentCoords?.lat ?? departurePoint?.lat ?? -34.5885;
    const startLng = currentCoords?.lng ?? departurePoint?.lng ?? -58.4306;

    const destLat = activeOrder.lat;
    const destLng = activeOrder.lng;

    let count = 0;
    const interval = setInterval(async () => {
      count++;
      const ratio = count / 5;
      const stepLat = startLat + (destLat - startLat) * ratio;
      const stepLng = startLng + (destLng - startLng) * ratio;

      setCurrentCoords({ lat: stepLat, lng: stepLng });
      await onReportLocation(activeOrder.id, stepLat, stepLng);

      if (count >= 5) {
        clearInterval(interval);
        await onUpdateOrderStatus(activeOrder.id, OrderStatus.DELIVERED, undefined, 'Pedido entregado en destino final (Simulación completa)');
        setCurrentCoords(null);
        void showAlert({
          title: 'Simulación completada',
          message: 'El pedido fue entregado exitosamente.',
          variant: 'success',
        });
      }
    }, 1500);
  };

  const handleAcceptOrder = async (orderId: string) => {
    try {
      await onUpdateOrderStatus(orderId, OrderStatus.ASSIGNED, currentUser.id, `Pedido tomado por el repartidor ${currentUser.name}`);
      onSelectOrder(orderId);
      setActiveTab('assigned');
    } catch {
      void showAlert({
        title: 'Error',
        message: 'No se pudo tomar el pedido. Intentá de nuevo.',
        variant: 'error',
      });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" id="repartidor-dashboard">

      <div className="grid grid-cols-2 bg-zinc-950 p-0.5 border-b border-zinc-800 shrink-0">
        <button
          onClick={() => {
            setActiveTab('assigned');
            if (myAssignedOrders.length > 0) onSelectOrder(myAssignedOrders[0].id);
          }}
          className={`py-2 text-center text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5 ${
            activeTab === 'assigned'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
              : 'text-zinc-500'
          }`}
        >
          🏍️ Mis Envíos ({myAssignedOrders.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('available');
            onSelectOrder(null);
          }}
          className={`py-2 text-center text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5 ${
            activeTab === 'available'
              ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/5'
              : 'text-zinc-500'
          }`}
        >
          📦 Disponibles ({availableOrders.length})
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row gap-4 p-4">

        <div className={`w-full md:w-1/3 flex flex-col h-full bg-zinc-900/30 border border-zinc-800 rounded-2xl p-3.5 overflow-hidden ${
          activeOrder && activeTab === 'assigned' ? 'hidden md:flex' : 'flex'
        }`}>
          <h3 className="font-bold text-[10px] text-zinc-500 mb-3 uppercase tracking-wider font-mono">
            {activeTab === 'assigned' ? 'Tareas en Proceso' : 'Pedidos en Almacén'}
          </h3>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
            {activeTab === 'assigned' ? (
              myAssignedOrders.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 font-mono text-xs">
                  No tienes pedidos pendientes asignados. ¡Ve a la pestaña de Disponibles para tomar uno!
                </div>
              ) : (
                myAssignedOrders.map((order) => (
                  <div
                    key={order.id}
                    onClick={() => onSelectOrder(order.id)}
                    className={`p-3 rounded border text-left transition cursor-pointer ${
                      activeOrder?.id === order.id
                        ? 'bg-blue-500/5 border-l-2 border-blue-500 border-t-zinc-800 border-r-zinc-800 border-b-zinc-800'
                        : 'bg-zinc-950/40 border-zinc-800/80 hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-mono font-bold text-zinc-500">{order.id}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        order.status === OrderStatus.DELIVERING ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {order.status === OrderStatus.DELIVERING ? '🚲 En Viaje' : '✓ Pend. Salida'}
                      </span>
                    </div>
                    <h4 className="font-bold text-xs text-zinc-200 mt-1.5">{order.clientName}</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5 truncate">📍 {order.address}</p>
                  </div>
                ))
              )
            ) : (
              availableOrders.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 font-mono text-xs">
                  No hay pedidos pendientes para recoger por el momento.
                </div>
              ) : (
                availableOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-3 rounded border border-zinc-800 bg-zinc-950/40 text-left space-y-2"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="font-bold text-zinc-500">{order.id}</span>
                      <span className="text-purple-400 truncate max-w-[120px]">
                        {getCollectLabel(order, pickupPoints, departurePoint)}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-zinc-200">{order.clientName}</h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5 leading-normal">📍 {order.address}</p>
                    </div>
                    <button
                      onClick={() => handleAcceptOrder(order.id)}
                      className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] uppercase tracking-wider rounded transition"
                    >
                      Tomar y Asignar Pedido
                    </button>
                  </div>
                ))
              )
            )}
          </div>
        </div>

        <div className={`flex-1 flex flex-col h-full gap-4 overflow-hidden ${
          (!activeOrder || activeTab !== 'assigned') ? 'hidden md:flex' : 'flex'
        }`}>
          {activeOrder && activeTab === 'assigned' ? (
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">

              <div className="flex-1 min-h-[180px] rounded-2xl border border-zinc-800 overflow-hidden relative">
                <Suspense
                  fallback={
                    <div className="w-full h-full flex items-center justify-center bg-zinc-950 text-zinc-500 text-xs font-mono">
                      Cargando mapa…
                    </div>
                  }
                >
                  <MapComponent
                    orders={[activeOrder]}
                    repartidores={repForMap}
                    departurePoint={departurePoint}
                    pickupPoints={pickupPoints}
                    activeOrderId={activeOrder.id}
                    liveRepartidorLocation={currentCoords}
                    showDepartureHub={false}
                    interactive={true}
                  />
                </Suspense>
                <div className="absolute inset-0 opacity-5 pointer-events-none map-grid-overlay"></div>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-3.5 shrink-0 text-left">
                <div className="md:hidden flex items-center justify-between pb-2 border-b border-zinc-800/80 mb-2 shrink-0">
                  <button
                    onClick={() => onSelectOrder(null)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider transition"
                  >
                    ← Volver a la Lista
                  </button>
                  <span className="text-[10px] font-mono font-bold text-zinc-500">
                    {activeOrder.id}
                  </span>
                </div>

                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-500">Destino de Entrega</span>
                    <h3 className="font-bold text-xs text-zinc-200 uppercase font-mono tracking-wider">{activeOrder.clientName}</h3>
                    <p className="text-xs text-blue-400 mt-0.5 font-sans">📍 {activeOrder.address}</p>
                  </div>

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${activeOrder.lat},${activeOrder.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white transition flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold"
                  >
                    <Navigation className="w-3.5 h-3.5 text-blue-500" /> GPS Externo
                  </a>
                </div>

                {activeOrder.notes && (
                  <div className="mt-2 bg-zinc-950 border border-zinc-800/60 rounded p-2 text-[10px] text-zinc-400 flex items-start gap-1.5">
                    <FileText className="w-3 h-3 text-zinc-500 shrink-0 mt-0.5" />
                    <span>{activeOrder.notes}</span>
                  </div>
                )}

                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex gap-2">
                    {activeOrder.status === OrderStatus.ASSIGNED && (
                      <button
                        onClick={() => onUpdateOrderStatus(activeOrder.id, OrderStatus.DELIVERING, undefined, 'Repartidor inició viaje al destino')}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded transition flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/10 uppercase tracking-wider"
                      >
                        <Play className="w-4 h-4" /> Iniciar Viaje de Entrega
                      </button>
                    )}

                    {activeOrder.status === OrderStatus.DELIVERING && (
                      <>
                        <button
                          onClick={() => onUpdateOrderStatus(activeOrder.id, OrderStatus.DELIVERED, undefined, 'Entregado en mano por repartidor')}
                          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/10 uppercase tracking-wider"
                        >
                          <Check className="w-4 h-4" /> Confirmar Entrega
                        </button>

                        <button
                          onClick={() => onUpdateOrderStatus(activeOrder.id, OrderStatus.CANCELLED, undefined, 'Reportado con incidencia / Cancelado')}
                          className="px-3 py-2 border border-red-500/20 hover:border-red-500 bg-red-500/5 hover:bg-red-500/10 text-red-400 rounded transition font-bold text-xs uppercase tracking-wider"
                        >
                          <AlertTriangle className="w-4 h-4" /> Incidencia
                        </button>
                      </>
                    )}
                  </div>

                  {activeOrder.status === OrderStatus.ASSIGNED && currentCoords && (
                    <div className="bg-zinc-950 border border-zinc-800 rounded p-2 text-[10px] text-blue-400 font-mono">
                      📍 Ruta al destino visible en el mapa (línea azul)
                    </div>
                  )}

                  {activeOrder.status === OrderStatus.DELIVERING && (
                    <div className="bg-zinc-950 border border-zinc-800 rounded p-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-zinc-300">📡 GPS En Vivo</span>
                        {!gpsError ? (
                          <span className="text-emerald-400 font-bold font-mono text-[9px] animate-pulse">● Compartiendo ubicación</span>
                        ) : (
                          <span className="text-amber-400 font-mono text-[9px]">● Esperando señal GPS</span>
                        )}
                      </div>

                      <button
                        onClick={handleAutoPilotSimulation}
                        className="text-amber-500 font-bold text-[9px] flex items-center gap-1 hover:text-amber-400 uppercase tracking-wider font-mono"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Simular Trayecto
                      </button>
                    </div>
                  )}

                  {gpsError && (
                    <p className="text-[10px] text-red-400 font-mono mt-1 text-center flex items-center gap-1 justify-center">
                      <ShieldAlert className="w-3.5 h-3.5" /> {gpsError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-zinc-900/20 border border-zinc-800/50 border-dashed rounded-2xl">
              <p className="text-zinc-500 font-mono text-xs max-w-xs leading-relaxed">
                Asígnate una orden en la pestaña superior &quot;Disponibles&quot; para ver la ruta al destino en el mapa.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
