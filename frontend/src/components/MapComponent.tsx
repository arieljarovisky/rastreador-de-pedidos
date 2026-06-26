/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { Order, OrderStatus, User, LocationPoint, PickupPoint } from '../types.js';
import * as L from 'leaflet';

interface MapComponentProps {
  orders: Order[];
  repartidores?: User[];
  departurePoint?: LocationPoint | null;
  pickupPoints?: PickupPoint[];
  activeOrderId: string | null;
  onSelectOrder?: (orderId: string) => void;
  interactive?: boolean;
}

// Configuración de Pines Personalizados con SVGs para evitar enlaces rotos de Leaflet
const createSvgIcon = (color: string, iconText: string, glow: boolean = false) => {
  const shadowClass = glow ? 'filter drop-shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse' : 'filter drop-shadow-md';
  return L.divIcon({
    html: `
      <div class="relative w-8 h-8 flex items-center justify-center ${shadowClass}">
        <!-- SVG Pin Shape -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" class="w-8 h-8 absolute">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
        <!-- Icon Badge -->
        <span class="z-10 text-white font-bold text-[10px] mb-2.5">${iconText}</span>
      </div>
    `,
    className: 'custom-leaflet-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

const createRepartidorIcon = (name: string) => {
  const initial = name.charAt(0).toUpperCase();
  return L.divIcon({
    html: `
      <div class="relative w-9 h-9 flex items-center justify-center filter drop-shadow-[0_2px_5px_rgba(0,0,0,0.5)]">
        <!-- Outer Glowing Ring -->
        <div class="absolute w-full h-full rounded-full bg-sky-500 opacity-25 animate-ping"></div>
        <!-- Inner Ring -->
        <div class="w-8 h-8 rounded-full bg-slate-800 border-2 border-sky-400 flex items-center justify-center text-sky-400 font-bold text-xs font-mono">
          🏍️
        </div>
        <!-- Tooltip Label -->
        <div class="absolute -bottom-6 bg-slate-900 border border-slate-700 text-white font-mono font-medium text-[9px] px-1 rounded shadow-md whitespace-nowrap">
          ${name.split(' ')[0]}
        </div>
      </div>
    `,
    className: 'repartidor-leaflet-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
};

const DEFAULT_HUB: [number, number] = [-34.5885, -58.4306];

export default function MapComponent({
  orders,
  repartidores = [],
  departurePoint = null,
  pickupPoints = [],
  activeOrderId,
  onSelectOrder,
  interactive = true,
}: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const polylinesRef = useRef<{ [key: string]: L.Polyline }>({});
  const hubMarkerRef = useRef<L.Marker | null>(null);
  const initialFitDoneRef = useRef(false);
  const lastCenteredOrderIdRef = useRef<string | null>(null);
  const userInteractedRef = useRef(false);
  const ordersRef = useRef(orders);
  const repartidoresRef = useRef(repartidores);

  ordersRef.current = orders;
  repartidoresRef.current = repartidores;

  // Inicializar mapa
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Crear el mapa si no existe
    if (!mapInstanceRef.current) {
      const initialCenter: [number, number] = departurePoint
        ? [departurePoint.lat, departurePoint.lng]
        : DEFAULT_HUB;
      const initialZoom = 12;

      // Límites estrictos para Gran Buenos Aires (GBA) y Capital Federal
      const gbaBounds = L.latLngBounds(
        [-34.95, -59.00], // Sudoeste (zona sur/oeste de GBA)
        [-34.25, -57.90]  // Noreste (Río de la Plata y zona norte de GBA)
      );

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        minZoom: 9,
        maxZoom: 18,
        maxBounds: gbaBounds,
        maxBoundsViscosity: 0.85,
        zoomControl: interactive,
        scrollWheelZoom: interactive,
        dragging: interactive,
        touchZoom: interactive,
      });

      map.on('zoomstart', () => {
        userInteractedRef.current = true;
      });
      map.on('movestart', () => {
        userInteractedRef.current = true;
      });

      // Capa de mapa (CartoDB Dark Matter o OpenStreetMap de noche)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    }

    // Cleanup al desmontar
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [interactive]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (hubMarkerRef.current) {
      hubMarkerRef.current.remove();
      hubMarkerRef.current = null;
    }

    if (!departurePoint) return;

    const hubIcon = L.divIcon({
      html: `
        <div class="relative w-10 h-10 flex items-center justify-center filter drop-shadow-md">
          <div class="absolute w-8 h-8 rounded-full bg-indigo-500 opacity-20 animate-pulse"></div>
          <div class="w-8 h-8 rounded-full bg-indigo-600 border-2 border-white flex items-center justify-center text-white text-sm shadow">
            🏬
          </div>
          <div class="absolute -bottom-6 bg-indigo-900 border border-indigo-700 text-white font-mono font-bold text-[9px] px-1 rounded shadow-md whitespace-nowrap">
            SALIDA
          </div>
        </div>
      `,
      className: 'hub-leaflet-icon',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    hubMarkerRef.current = L.marker([departurePoint.lat, departurePoint.lng], { icon: hubIcon })
      .addTo(map)
      .bindPopup(`
        <div class="text-zinc-100 font-sans p-1 text-[11px]">
          <h4 class="font-bold text-xs text-indigo-400">Punto de salida</h4>
          <p class="text-[10px] text-zinc-400 mt-0.5">📍 ${departurePoint.address}</p>
        </div>
      `);
  }, [departurePoint]);

  // Observer de redimensionamiento para evitar problemas de tiles negros en layouts responsivos (flex/tabs)
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });

    resizeObserver.observe(mapContainerRef.current);

    // Ejecutar invalidateSize adicional con un delay para mayor seguridad
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 300);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // Actualizar marcadores de pedidos, repartidores y polilíneas cuando cambian los props
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // --- 1. PROCESAR PEDIDOS ---
    // Limpiar marcadores obsoletos
    const activeOrderIds = new Set(orders.map((o) => o.id));
    Object.keys(markersRef.current).forEach((id) => {
      if (!id.startsWith('rep_') && !id.startsWith('pickup_') && !activeOrderIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Limpiar polilíneas obsoletas
    Object.keys(polylinesRef.current).forEach((id) => {
      if (!activeOrderIds.has(id)) {
        polylinesRef.current[id].remove();
        delete polylinesRef.current[id];
      }
    });

    orders.forEach((order) => {
      const isSelected = order.id === activeOrderId;

      // Color según estado del pedido
      let color = '#94a3b8'; // Slate (Pending)
      let label = 'P';
      let glow = false;

      if (order.status === OrderStatus.ASSIGNED) {
        color = '#a855f7'; // Purple (Assigned)
        label = 'A';
      } else if (order.status === OrderStatus.DELIVERING) {
        color = '#f59e0b'; // Amber (Delivering)
        label = 'E';
        glow = true;
      } else if (order.status === OrderStatus.DELIVERED) {
        color = '#10b981'; // Emerald (Delivered)
        label = '✓';
      } else if (order.status === OrderStatus.CANCELLED) {
        color = '#ef4444'; // Red (Cancelled)
        label = '✕';
      }

      // Si es el activo, podemos hacerlo brillar o destacar
      if (isSelected) {
        glow = true;
      }

      const icon = createSvgIcon(color, label, glow);

      if (markersRef.current[order.id]) {
        // Actualizar existente
        markersRef.current[order.id].setLatLng([order.lat, order.lng]);
        markersRef.current[order.id].setIcon(icon);
      } else {
        // Crear nuevo
        const marker = L.marker([order.lat, order.lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div class="text-zinc-100 font-sans p-1 text-[11px] max-w-[200px]">
              <div class="flex items-center gap-1 font-bold text-zinc-300 border-b border-zinc-800 pb-1 mb-1">
                <span>📦 ${order.id}</span>
                <span class="ml-auto px-1.5 py-0.5 rounded text-[9px] text-white font-bold uppercase tracking-wider" style="background-color: ${color}">
                  ${order.status.toUpperCase()}
                </span>
              </div>
              <p class="font-bold text-zinc-200 mt-1">${order.clientName}</p>
              <p class="text-zinc-400 text-[10px] mt-0.5">📍 ${order.address}</p>
              ${order.repartidorName ? `<p class="mt-1.5 font-bold text-blue-400 text-[10px] font-mono">🏍️ REPARTIDOR: ${order.repartidorName.toUpperCase()}</p>` : ''}
              <button id="btn-map-select-${order.id}" class="mt-2 w-full text-center py-1 bg-blue-600 text-white rounded text-[9px] font-bold uppercase tracking-wider hover:bg-blue-500 transition cursor-pointer">
                Ver Detalles
              </button>
            </div>
          `);

        // Vincular popup event para click
        marker.on('popupopen', () => {
          setTimeout(() => {
            const btn = document.getElementById(`btn-map-select-${order.id}`);
            if (btn && onSelectOrder) {
              btn.onclick = () => {
                onSelectOrder(order.id);
                marker.closePopup();
              };
            }
          }, 50);
        });

        markersRef.current[order.id] = marker;
      }

      // Dibujar polilínea de trayectoria si tiene historial de localización y está activo
      if (order.status === OrderStatus.DELIVERING && order.locationHistory.length > 0) {
        const hubCoords: [number, number] = departurePoint
          ? [departurePoint.lat, departurePoint.lng]
          : DEFAULT_HUB;
        const pathCoords: [number, number][] = [
          hubCoords,
          ...order.locationHistory.map((pt) => [pt.lat, pt.lng] as [number, number]),
        ];

        if (polylinesRef.current[order.id]) {
          polylinesRef.current[order.id].setLatLngs(pathCoords);
        } else {
          const polyline = L.polyline(pathCoords, {
            color: '#fbbf24', // Amber/Yellow
            weight: 3.5,
            opacity: 0.8,
            dashArray: '6, 6',
          }).addTo(map);

          polylinesRef.current[order.id] = polyline;
        }
      }
    });

    // --- 2b. PUNTOS DE COLECTA ---
    const activePickupIds = new Set(pickupPoints.map((p) => `pickup_${p.id}`));
    Object.keys(markersRef.current).forEach((id) => {
      if (id.startsWith('pickup_') && !activePickupIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    pickupPoints.forEach((point) => {
      const markerId = `pickup_${point.id}`;
      const icon = createSvgIcon('#10b981', 'C', false);

      if (markersRef.current[markerId]) {
        markersRef.current[markerId].setLatLng([point.lat, point.lng]);
      } else {
        const marker = L.marker([point.lat, point.lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div class="text-zinc-100 font-sans p-1 text-[11px]">
              <h4 class="font-bold text-emerald-400">🛒 ${point.label}</h4>
              ${point.sellerName ? `<p class="text-[10px] text-purple-300">${point.sellerName}</p>` : ''}
              <p class="text-zinc-400 text-[10px] mt-0.5">📍 ${point.address}</p>
            </div>
          `);
        markersRef.current[markerId] = marker;
      }
    });

    // --- 3. PROCESAR REPARTIDORES ---
    // Limpiar repartidores existentes en marcadores temporales
    const activeRepartidorIds = new Set(repartidores.filter(r => r.currentLocation).map(r => `rep_${r.id}`));
    Object.keys(markersRef.current).forEach((id) => {
      if (id.startsWith('rep_') && !activeRepartidorIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Dibujar repartidores activos
    repartidores.forEach((rep) => {
      if (!rep.currentLocation) return;
      const markerId = `rep_${rep.id}`;
      const icon = createRepartidorIcon(rep.name);

      if (markersRef.current[markerId]) {
        // Actualizar posición del repartidor con animación suave de Leaflet
        markersRef.current[markerId].setLatLng([rep.currentLocation.lat, rep.currentLocation.lng]);
      } else {
        // Crear nuevo marcador de repartidor
        const marker = L.marker([rep.currentLocation.lat, rep.currentLocation.lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div class="text-zinc-100 font-sans p-1 text-[11px]">
              <h4 class="font-bold text-blue-400 uppercase tracking-wider font-mono">🏍️ ${rep.name}</h4>
              <p class="text-zinc-400 text-[10px] mt-0.5">Último reporte: ${new Date(rep.currentLocation.timestamp).toLocaleTimeString()}</p>
            </div>
          `);
        markersRef.current[markerId] = marker;
      }
    });
  }, [orders, repartidores, pickupPoints, departurePoint, onSelectOrder]);

  // Centrar solo al elegir un pedido (no en cada actualización GPS)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !activeOrderId) return;

    if (lastCenteredOrderIdRef.current === activeOrderId && userInteractedRef.current) {
      return;
    }

    const activeOrder = ordersRef.current.find((o) => o.id === activeOrderId);
    if (!activeOrder || !markersRef.current[activeOrderId]) return;

    if (lastCenteredOrderIdRef.current !== activeOrderId) {
      lastCenteredOrderIdRef.current = activeOrderId;
      userInteractedRef.current = false;
    }

    const rep = repartidoresRef.current.find((r) => r.id === activeOrder.repartidorId);
    if (activeOrder.status === OrderStatus.DELIVERING && rep?.currentLocation) {
      const bounds = L.latLngBounds([
        [activeOrder.lat, activeOrder.lng],
        [rep.currentLocation.lat, rep.currentLocation.lng],
      ]);
      map.fitBounds(bounds, { padding: [50, 50], animate: true });
    } else {
      map.setView([activeOrder.lat, activeOrder.lng], 15, { animate: true });
    }
  }, [activeOrderId]);

  // Ajuste inicial una sola vez al cargar pedidos
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || initialFitDoneRef.current || activeOrderId) return;

    const validCoords = orders
      .filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lng))
      .map((o) => [o.lat, o.lng] as [number, number]);

    if (validCoords.length === 0) return;

    const bounds = L.latLngBounds(validCoords);
    map.fitBounds(bounds, { padding: [40, 40] });
    initialFitDoneRef.current = true;
  }, [orders.length, activeOrderId]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl">
      {/* Indicador de mapa oscuro */}
      <div className="absolute top-3 left-12 z-[1000] bg-zinc-950/90 backdrop-blur-sm px-2 py-1 rounded text-[9px] font-mono border border-zinc-800 text-zinc-400 uppercase tracking-wider font-bold">
        🛰️ MAPA REALTIME LUPO
      </div>
      <div ref={mapContainerRef} className="w-full h-full" id="leaflet-map-element" />
    </div>
  );
}
