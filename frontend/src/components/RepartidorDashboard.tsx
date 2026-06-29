/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { Order, OrderStatus, User, LocationPoint, PickupPoint } from '../types.js';
import { Navigation, AlertTriangle, Play, Check, ShieldAlert, Sparkles, FileText } from 'lucide-react';
import { useModal } from '../context/ModalContext.tsx';
import MapComponent from './MapComponent.tsx';

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
  onOpenMercadoLibreLabel?: (orderId: string) => Promise<void>;
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
  onOpenMercadoLibreLabel,
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

  const selectedOrder = activeOrderId
    ? orders.find((o) => o.id === activeOrderId) ?? null
    : null;

  const deliveringOrder = myAssignedOrders.find((o) => o.status === OrderStatus.DELIVERING) ?? null;
  const gpsOrder = deliveringOrder ?? selectedOrder;
  const otherDelivering =
    deliveringOrder && deliveringOrder.id !== selectedOrder?.id ? deliveringOrder : null;

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
      gpsOrder &&
      (gpsOrder.status === OrderStatus.DELIVERING || gpsOrder.status === OrderStatus.ASSIGNED);

    if (trackLocation && 'geolocation' in navigator) {
      setGpsError(null);
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentCoords({ lat: latitude, lng: longitude });
          setGpsError(null);
          if (gpsOrder.status === OrderStatus.DELIVERING) {
            reportGps(gpsOrder.id, latitude, longitude);
          }
        },
        (error) => {
          console.error('Error de Geolocalización:', error);
          let errMsg = 'Error al leer el GPS.';
          if (error.code === error.PERMISSION_DENIED) {
            errMsg =
              gpsOrder.status === OrderStatus.DELIVERING
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
  }, [gpsOrder?.id, gpsOrder?.status]);

  const handleAutoPilotSimulation = async () => {
    if (!selectedOrder) return;

    if (selectedOrder.status === OrderStatus.ASSIGNED) {
      await onUpdateOrderStatus(selectedOrder.id, OrderStatus.DELIVERING, undefined, 'Viaje iniciado (Simulación de ruta)');
    }

    const startLat = currentCoords?.lat ?? departurePoint?.lat ?? -34.5885;
    const startLng = currentCoords?.lng ?? departurePoint?.lng ?? -58.4306;

    const destLat = selectedOrder.lat;
    const destLng = selectedOrder.lng;

    let count = 0;
    const interval = setInterval(async () => {
      count++;
      const ratio = count / 5;
      const stepLat = startLat + (destLat - startLat) * ratio;
      const stepLng = startLng + (destLng - startLng) * ratio;

      setCurrentCoords({ lat: stepLat, lng: stepLng });
      await onReportLocation(selectedOrder.id, stepLat, stepLng);

      if (count >= 5) {
        clearInterval(interval);
        await onUpdateOrderStatus(selectedOrder.id, OrderStatus.DELIVERED, undefined, 'Pedido entregado en destino final (Simulación completa)');
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

      <div className="grid grid-cols-2 bg-[var(--surface-panel-2)] p-0.5 border-b border-[var(--surface-border)] shrink-0 scroll-tabs">
        <button
          onClick={() => setActiveTab('assigned')}
          className={`py-1.5 sm:py-2 min-w-0 px-1 text-center text-[10px] sm:text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1 sm:gap-1.5 ${
            activeTab === 'assigned'
              ? 'text-[var(--color-accent)] border-b-2 border-blue-400 bg-[var(--color-accent)]/5'
              : 'text-[var(--color-text-muted)]'
          }`}
        >
          🏍️ <span className="truncate">Mis Envíos ({myAssignedOrders.length})</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('available');
            onSelectOrder(null);
          }}
          className={`py-1.5 sm:py-2 min-w-0 px-1 text-center text-[10px] sm:text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1 sm:gap-1.5 ${
            activeTab === 'available'
              ? 'text-[var(--color-accent)] border-b-2 border-purple-400 bg-[var(--color-accent)]/5'
              : 'text-[var(--color-text-muted)]'
          }`}
        >
          📦 <span className="truncate">Disponibles ({availableOrders.length})</span>
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-2 sm:gap-3 lg:gap-4 p-2 sm:p-3 lg:p-4 min-h-0">

        <div className={`w-full lg:w-[min(100%,22rem)] xl:w-1/3 flex flex-col min-h-0 flex-1 lg:flex-none lg:h-full bg-[var(--surface-panel)]/80 border border-[var(--surface-border)] rounded-[var(--radius-posta)] p-2.5 sm:p-3.5 overflow-hidden ${
          selectedOrder && activeTab === 'assigned' ? 'hidden lg:flex' : 'flex'
        }`}>
          <h3 className="font-bold text-[10px] text-[var(--color-text-muted)] mb-3 uppercase tracking-wider font-mono">
            {activeTab === 'assigned' ? 'Tareas en Proceso' : 'Pedidos en Almacén'}
          </h3>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
            {activeTab === 'assigned' ? (
              myAssignedOrders.length === 0 ? (
                <div className="text-center py-12 text-[var(--color-text-muted)] font-mono text-xs">
                  No tienes pedidos pendientes asignados. ¡Ve a la pestaña de Disponibles para tomar uno!
                </div>
              ) : (
                myAssignedOrders.map((order) => (
                  <div
                    key={order.id}
                    onClick={() => onSelectOrder(order.id)}
                    className={`p-3 rounded border text-left transition cursor-pointer ${
                      selectedOrder?.id === order.id
                        ? 'bg-[var(--color-accent)]/5 border-l-2 border-[var(--color-accent)] border-t-[var(--surface-border)] border-r-[var(--surface-border)] border-b-[var(--surface-border)]'
                        : 'bg-[var(--surface-panel-2)]/40 border-[var(--surface-border)]/80 hover:bg-[var(--surface-panel)]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-mono font-bold text-[var(--color-text-muted)]">{order.id}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        order.status === OrderStatus.DELIVERING ? 'bg-amber-500/10 text-[var(--color-warn)]' : 'bg-blue-500/10 text-[var(--color-accent)]'
                      }`}>
                        {order.status === OrderStatus.DELIVERING ? '🚲 En Viaje' : '✓ Pend. Salida'}
                      </span>
                    </div>
                    <h4 className="font-bold text-xs text-[var(--ink-soft)] mt-1.5">{order.clientName}</h4>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">📍 {order.address}</p>
                  </div>
                ))
              )
            ) : (
              availableOrders.length === 0 ? (
                <div className="text-center py-12 text-[var(--color-text-muted)] font-mono text-xs">
                  No hay pedidos pendientes para recoger por el momento.
                </div>
              ) : (
                availableOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-3 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)]/40 text-left space-y-2"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="font-bold text-[var(--color-text-muted)]">{order.id}</span>
                      <span className="text-[var(--color-accent)] truncate max-w-[120px]">
                        {getCollectLabel(order, pickupPoints, departurePoint)}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-[var(--ink-soft)]">{order.clientName}</h4>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-normal">📍 {order.address}</p>
                    </div>
                    <button
                      onClick={() => handleAcceptOrder(order.id)}
                      className="w-full py-1.5 bg-[var(--color-cta)] hover:brightness-110 text-[#F6F0E4] font-mono font-bold text-[10px] uppercase tracking-wider rounded-[5px] transition"
                    >
                      Tomar y Asignar Pedido
                    </button>
                  </div>
                ))
              )
            )}
          </div>
        </div>

        <div className={`flex-1 flex flex-col min-h-0 gap-2 sm:gap-3 lg:gap-4 overflow-hidden ${
          (!selectedOrder || activeTab !== 'assigned') ? 'hidden lg:flex' : 'flex'
        }`}>
          {selectedOrder && activeTab === 'assigned' ? (
            <div className="flex-1 flex flex-col gap-2 sm:gap-3 lg:gap-4 overflow-hidden min-h-0">

              <div className="flex-1 min-h-[140px] sm:min-h-[180px] md:min-h-[220px] lg:min-h-[240px] rounded-[var(--radius-posta)] border border-[var(--surface-border)] overflow-hidden relative">
                <MapComponent
                  orders={[selectedOrder]}
                  repartidores={repForMap}
                  departurePoint={departurePoint}
                  pickupPoints={pickupPoints}
                  activeOrderId={selectedOrder.id}
                  liveRepartidorLocation={currentCoords}
                  showDepartureHub={false}
                  interactive={true}
                />
                <div className="absolute inset-0 opacity-5 pointer-events-none map-grid-overlay"></div>
              </div>

              <div className="bg-[var(--surface-panel)]/80 border border-[var(--surface-border)] rounded-[var(--radius-posta)] p-2.5 sm:p-3.5 shrink-0 text-left max-h-[min(48dvh,420px)] overflow-y-auto scrollbar-thin safe-bottom">
                <div className="lg:hidden flex items-center justify-between pb-2 border-b border-[var(--surface-border)]/80 mb-2 shrink-0">
                  <button
                    onClick={() => onSelectOrder(null)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--surface-panel-2)] border border-[var(--surface-border)] text-[var(--ink-soft)] hover:text-white rounded text-[10px] font-bold uppercase tracking-wider transition"
                  >
                    ← Volver a la Lista
                  </button>
                  <span className="text-[10px] font-mono font-bold text-[var(--color-text-muted)]">
                    {selectedOrder.id}
                  </span>
                </div>

                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Destino de Entrega</span>
                    <h3 className="font-bold text-xs text-[var(--ink-soft)] uppercase font-mono tracking-wider">{selectedOrder.clientName}</h3>
                    <p className="text-xs text-[var(--color-accent)] mt-0.5 font-sans">📍 {selectedOrder.address}</p>
                  </div>

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedOrder.lat},${selectedOrder.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded bg-[var(--surface-panel-2)] border border-[var(--surface-border)] text-[var(--ink-soft)] hover:text-white transition flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold"
                  >
                    <Navigation className="w-3.5 h-3.5 text-blue-500" /> GPS Externo
                  </a>
                </div>

                {selectedOrder.externalSource === 'mercadolibre' && selectedOrder.externalOrderId ? (
                  <button
                    type="button"
                    onClick={() => void onOpenMercadoLibreLabel?.(selectedOrder.id)}
                    className="mt-2 bg-[var(--surface-panel-2)] border border-[var(--surface-border)]/60 hover:border-[var(--color-accent)]/50 rounded p-2 text-[10px] text-[var(--color-text-muted)] flex items-start gap-1.5 text-left w-full transition-colors cursor-pointer"
                    title="Ver etiqueta de envío de Mercado Libre"
                  >
                    <FileText className="w-3 h-3 text-[var(--color-accent)] shrink-0 mt-0.5" />
                    <span>
                      {selectedOrder.notes || `Mercado Libre · Orden #${selectedOrder.externalOrderId}`}
                      <span className="block text-[var(--color-accent)] mt-0.5 font-semibold">
                        Ver etiqueta de envío →
                      </span>
                    </span>
                  </button>
                ) : selectedOrder.notes ? (
                  <div className="mt-2 bg-[var(--surface-panel-2)] border border-[var(--surface-border)]/60 rounded p-2 text-[10px] text-[var(--color-text-muted)] flex items-start gap-1.5">
                    <FileText className="w-3 h-3 text-[var(--color-text-muted)] shrink-0 mt-0.5" />
                    <span>{selectedOrder.notes}</span>
                  </div>
                ) : null}

                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex gap-2">
                    {selectedOrder.status === OrderStatus.ASSIGNED && (
                      <button
                        disabled={!!otherDelivering}
                        onClick={async () => {
                          try {
                            await onUpdateOrderStatus(selectedOrder.id, OrderStatus.DELIVERING, undefined, 'Repartidor inició viaje al destino');
                            if (currentCoords) {
                              await onReportLocation(selectedOrder.id, currentCoords.lat, currentCoords.lng);
                            }
                          } catch (e) {
                            void showAlert({
                              title: 'No se pudo iniciar el viaje',
                              message: e instanceof Error ? e.message : 'Intentá de nuevo.',
                              variant: 'error',
                            });
                          }
                        }}
                        className="flex-1 py-2 bg-[var(--color-cta)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-[#F6F0E4] font-mono font-bold text-xs rounded-[5px] transition flex items-center justify-center gap-1.5 uppercase tracking-wider"
                      >
                        <Play className="w-4 h-4" /> Iniciar Viaje de Entrega
                      </button>
                    )}

                    {selectedOrder.status === OrderStatus.DELIVERING && (
                      <>
                        <button
                          onClick={async () => {
                            try {
                              await onUpdateOrderStatus(selectedOrder.id, OrderStatus.DELIVERED, undefined, 'Entregado en mano por repartidor');
                              onSelectOrder(null);
                            } catch (e) {
                              void showAlert({
                                title: 'Error',
                                message: e instanceof Error ? e.message : 'No se pudo confirmar la entrega.',
                                variant: 'error',
                              });
                            }
                          }}
                          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/10 uppercase tracking-wider"
                        >
                          <Check className="w-4 h-4" /> Confirmar Entrega
                        </button>

                        <button
                          onClick={async () => {
                            try {
                              await onUpdateOrderStatus(selectedOrder.id, OrderStatus.CANCELLED, undefined, 'Reportado con incidencia / Cancelado');
                              onSelectOrder(null);
                            } catch (e) {
                              void showAlert({
                                title: 'Error',
                                message: e instanceof Error ? e.message : 'No se pudo reportar la incidencia.',
                                variant: 'error',
                              });
                            }
                          }}
                          className="px-3 py-2 border border-red-500/20 hover:border-red-500 bg-red-500/5 hover:bg-red-500/10 text-[var(--color-danger)] rounded transition font-bold text-xs uppercase tracking-wider"
                        >
                          <AlertTriangle className="w-4 h-4" /> Incidencia
                        </button>
                      </>
                    )}
                  </div>

                  {otherDelivering && selectedOrder.status === OrderStatus.ASSIGNED && (
                    <p className="text-[10px] text-[var(--color-warn)] font-mono text-center">
                      Tenés un viaje en curso ({otherDelivering.id}). Finalizalo antes de iniciar otro.
                    </p>
                  )}

                  {selectedOrder.status === OrderStatus.ASSIGNED && currentCoords && (
                    <div className="bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded p-2 text-[10px] text-[var(--color-accent)] font-mono">
                      📍 Ruta por calles hacia el destino (línea azul en el mapa)
                    </div>
                  )}

                  {selectedOrder.status === OrderStatus.DELIVERING && (
                    <div className="bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded p-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[var(--ink-soft)]">📡 GPS En Vivo</span>
                        {!gpsError ? (
                          <span className="text-[var(--color-ok)] font-bold font-mono text-[9px] animate-pulse">● Compartiendo ubicación</span>
                        ) : (
                          <span className="text-[var(--color-warn)] font-mono text-[9px]">● Esperando señal GPS</span>
                        )}
                      </div>

                      <button
                        onClick={handleAutoPilotSimulation}
                        className="text-amber-500 font-bold text-[9px] flex items-center gap-1 hover:text-[var(--color-warn)] uppercase tracking-wider font-mono"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Simular Trayecto
                      </button>
                    </div>
                  )}

                  {gpsError && (
                    <p className="text-[10px] text-[var(--color-danger)] font-mono mt-1 text-center flex items-center gap-1 justify-center">
                      <ShieldAlert className="w-3.5 h-3.5" /> {gpsError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="posta-empty flex-1 flex flex-col items-center justify-center p-8">
              <p className="text-[var(--color-text-muted)] font-mono text-xs max-w-xs leading-relaxed">
                Asígnate una orden en la pestaña superior &quot;Disponibles&quot; para ver la ruta al destino en el mapa.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
