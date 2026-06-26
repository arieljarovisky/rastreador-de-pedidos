/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useCallback } from 'react';
import { Order, OrderStatus, User, LocationPoint, PickupPoint } from '../types.js';
import { Plus, Minus, Crosshair } from 'lucide-react';
import * as L from 'leaflet';
import { ui } from '../styles/ui.ts';

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

function popupHtml(title: string, body: string, accent = 'var(--lupo-accent)'): string {
  return `
    <div style="font-family:inherit;padding:4px;font-size:11px;max-width:200px;color:var(--lupo-text)">
      <div style="font-weight:700;font-size:12px;color:${accent};border-bottom:1px solid var(--lupo-border-subtle);padding-bottom:4px;margin-bottom:4px">${title}</div>
      ${body}
    </div>
  `;
}

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
        zoomControl: false,
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
          <div class="absolute w-8 h-8 rounded-full bg-violet-500 opacity-25 animate-pulse"></div>
          <div class="w-8 h-8 rounded-full bg-violet-600 border-2 border-white flex items-center justify-center text-white text-[9px] font-bold shadow">
            S
          </div>
          <div class="absolute -bottom-6 bg-violet-700 border border-violet-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow-md whitespace-nowrap">
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
      .bindPopup(popupHtml('Punto de salida', `<p style="margin:0;color:var(--lupo-text-secondary);font-size:10px">📍 ${departurePoint.address}</p>`, '#7c3aed'));
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
        color = '#8b5cf6'; // Purple (Assigned)
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
          .bindPopup(popupHtml(
            `📦 ${order.id}`,
            `
              <p style="margin:0 0 4px;font-weight:600">${order.clientName}</p>
              <p style="margin:0 0 6px;color:var(--lupo-text-muted);font-size:10px">📍 ${order.address}</p>
              <span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;color:#fff;background:${color}">${order.status.toUpperCase()}</span>
              ${order.repartidorName ? `<p style="margin:6px 0 0;font-size:10px;color:#7c3aed;font-weight:600">🏍️ ${order.repartidorName}</p>` : ''}
              <button id="btn-map-select-${order.id}" style="margin-top:8px;width:100%;padding:6px;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer">
                Ver detalles
              </button>
            `,
            color
          ));

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
          .bindPopup(popupHtml(
            `🛒 ${point.label}`,
            `
              ${point.sellerName ? `<p style="margin:0 0 4px;font-size:10px;color:#7c3aed">${point.sellerName}</p>` : ''}
              <p style="margin:0;color:var(--lupo-text-muted);font-size:10px">📍 ${point.address}</p>
            `,
            '#059669'
          ));
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
          .bindPopup(popupHtml(
            `🏍️ ${rep.name}`,
            `<p style="margin:0;color:var(--lupo-text-muted);font-size:10px">Último reporte: ${new Date(rep.currentLocation.timestamp).toLocaleTimeString()}</p>`,
            '#2563eb'
          ));
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

  const handleZoomIn = useCallback(() => {
    mapInstanceRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    mapInstanceRef.current?.zoomOut();
  }, []);

  const handleLocate = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (departurePoint) {
      map.setView([departurePoint.lat, departurePoint.lng], 14, { animate: true });
      return;
    }

    const validCoords = orders
      .filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lng))
      .map((o) => [o.lat, o.lng] as [number, number]);

    if (validCoords.length > 0) {
      map.fitBounds(L.latLngBounds(validCoords), { padding: [40, 40], animate: true });
      return;
    }

    map.setView(DEFAULT_HUB, 12, { animate: true });
  }, [departurePoint, orders]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className={ui.mapLiveBadge}>
        <span className="lupo-map-live-dot" />
        En vivo
      </div>

      {interactive && (
        <div className={ui.mapControls}>
          <button type="button" className={ui.mapControlBtn} onClick={handleZoomIn} title="Acercar">
            <Plus className="w-4 h-4" />
          </button>
          <button type="button" className={ui.mapControlBtn} onClick={handleZoomOut} title="Alejar">
            <Minus className="w-4 h-4" />
          </button>
          <button type="button" className={ui.mapControlBtn} onClick={handleLocate} title="Centrar mapa">
            <Crosshair className="w-4 h-4" />
          </button>
        </div>
      )}

      <div ref={mapContainerRef} className="w-full h-full" id="leaflet-map-element" />
    </div>
  );
}
