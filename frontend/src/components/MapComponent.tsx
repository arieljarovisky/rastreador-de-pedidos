/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { Order, OrderStatus, User, LocationPoint, PickupPoint } from '../types.js';
import { getDeliveryZone, type DeliveryZone } from '../config/deliveryZones.js';
import { fetchDrivingRoute } from '../utils/route.js';
import { formatLastReport, isStaleLocation } from '../utils/locationFreshness.js';
import { getPostaMapColors, getPostaStatusColors, MAP_TILE_URLS } from '../theme/colors.ts';
import { usePostaTheme, readPostaTheme } from '../theme/usePostaTheme.ts';
import * as L from 'leaflet';

const DEFAULT_HUB: [number, number] = [-34.5885, -58.4306];

function getRepartidorPosition(
  order: Order,
  repartidores: User[],
  liveLocation?: { lat: number; lng: number } | null
): [number, number] | null {
  const rep = repartidores.find((r) => r.id === order.repartidorId);
  if (liveLocation) return [liveLocation.lat, liveLocation.lng];
  if (rep?.currentLocation) return [rep.currentLocation.lat, rep.currentLocation.lng];
  if (order.status === OrderStatus.DELIVERING && order.locationHistory.length > 0) {
    const last = order.locationHistory[order.locationHistory.length - 1];
    return [last.lat, last.lng];
  }
  return null;
}

function upsertPolyline(
  map: L.Map,
  store: { [key: string]: L.Polyline },
  key: string,
  coords: [number, number][],
  style: L.PolylineOptions
) {
  if (coords.length < 2) {
    if (store[key]) {
      store[key].remove();
      delete store[key];
    }
    return;
  }
  if (store[key]) {
    store[key].setLatLngs(coords);
    store[key].setStyle(style);
  } else {
    store[key] = L.polyline(coords, style).addTo(map);
  }
}

const MARKER_ANIM_MS = 1800;

function animateMarkerTo(
  marker: L.Marker,
  to: [number, number],
  animStore: { [key: string]: number },
  key: string,
  duration = MARKER_ANIM_MS
) {
  const from = marker.getLatLng();
  if (Math.abs(from.lat - to[0]) < 1e-6 && Math.abs(from.lng - to[1]) < 1e-6) return;

  if (animStore[key]) cancelAnimationFrame(animStore[key]);

  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    marker.setLatLng([
      from.lat + (to[0] - from.lat) * ease,
      from.lng + (to[1] - from.lng) * ease,
    ]);
    if (t < 1) animStore[key] = requestAnimationFrame(step);
    else delete animStore[key];
  };
  animStore[key] = requestAnimationFrame(step);
}

interface MapComponentProps {
  orders: Order[];
  repartidores?: User[];
  departurePoint?: LocationPoint | null;
  pickupPoints?: PickupPoint[];
  deliveryZones?: DeliveryZone[];
  activeOrderId: string | null;
  onSelectOrder?: (orderId: string) => void;
  interactive?: boolean;
  /** Ubicación GPS en vivo del repartidor activo (antes de sincronizar con el servidor) */
  liveRepartidorLocation?: { lat: number; lng: number } | null;
  /** Ocultar marcador de salida cuando el foco es la ruta al cliente */
  showDepartureHub?: boolean;
  /** Dibujar zonas asignadas a repartidores */
  showDeliveryZones?: boolean;
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

const createRepartidorIcon = (
  name: string,
  mapColors: ReturnType<typeof getPostaMapColors>,
  stale = false
) => {
  const color = stale ? '#7A6F60' : mapColors.departure;
  const ping = stale ? '' : `<div class="absolute w-full h-full rounded-full opacity-25 animate-ping" style="background:${color}"></div>`;
  return L.divIcon({
    html: `
      <div class="relative w-9 h-9 flex items-center justify-center filter drop-shadow-[0_2px_5px_rgba(0,0,0,0.25)]">
        ${ping}
        <div class="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs font-mono" style="background:var(--panel);border-color:${color};color:${color};${stale ? 'opacity:0.75;' : ''}">
          🏍️
        </div>
        <div class="absolute -bottom-6 border font-mono font-medium text-[9px] px-1 rounded shadow-md whitespace-nowrap" style="background:var(--panel);border-color:var(--line);color:var(--text)">
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

export default function MapComponent({
  orders,
  repartidores = [],
  departurePoint = null,
  pickupPoints = [],
  deliveryZones = [],
  activeOrderId,
  onSelectOrder,
  interactive = true,
  liveRepartidorLocation = null,
  showDepartureHub = true,
  showDeliveryZones = true,
}: MapComponentProps) {
  const theme = usePostaTheme();
  const mapColors = getPostaMapColors(theme);
  const statusColors = getPostaStatusColors(theme);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const polylinesRef = useRef<{ [key: string]: L.Polyline }>({});
  const markerAnimRef = useRef<Record<string, number>>({});
  const lastRouteFetchRef = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const zoneLayersRef = useRef<L.Rectangle[]>([]);
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

      // Capa base — oscura o clara según tema Posta
      tileLayerRef.current = L.tileLayer(MAP_TILE_URLS[readPostaTheme()], {
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

  // Cambiar tiles al alternar modo claro / oscuro
  useEffect(() => {
    tileLayerRef.current?.setUrl(MAP_TILE_URLS[theme]);
  }, [theme]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (hubMarkerRef.current) {
      hubMarkerRef.current.remove();
      hubMarkerRef.current = null;
    }

    if (!departurePoint || !showDepartureHub) {
      if (hubMarkerRef.current) {
        hubMarkerRef.current.remove();
        hubMarkerRef.current = null;
      }
      return;
    }

    const hubIcon = L.divIcon({
      html: `
        <div class="relative w-10 h-10 flex items-center justify-center filter drop-shadow-md">
          <div class="absolute w-8 h-8 rounded-full animate-pulse" style="background:${mapColors.departureRing}"></div>
          <div class="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-sm shadow" style="background:${mapColors.departure}">
            🏬
          </div>
          <div class="absolute -bottom-6 font-mono font-bold text-[9px] px-1 rounded shadow-md whitespace-nowrap" style="background:var(--panel);border:1px solid var(--line);color:var(--text)">
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
        <div class="font-sans p-1 text-[11px]" style="color:var(--text)">
          <h4 class="font-bold text-xs" style="color:var(--accent)">Punto de salida</h4>
          <p class="text-[10px] mt-0.5" style="color:var(--text-muted)">📍 ${departurePoint.address}</p>
        </div>
      `);
  }, [departurePoint, showDepartureHub, mapColors]);

  // Zonas de entrega asignadas a repartidores
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    zoneLayersRef.current.forEach((layer) => layer.remove());
    zoneLayersRef.current = [];

    if (!showDeliveryZones) return;

    const zoneReps = new Map<string, string[]>();
    repartidores.forEach((rep) => {
      if (!rep.deliveryZone) return;
      const list = zoneReps.get(rep.deliveryZone) ?? [];
      list.push(rep.name.split(' ')[0]);
      zoneReps.set(rep.deliveryZone, list);
    });

    zoneReps.forEach((names, zoneId) => {
      const zone = getDeliveryZone(deliveryZones, zoneId);
      if (!zone) return;

      const rect = L.rectangle(
        [
          [zone.south, zone.west],
          [zone.north, zone.east],
        ],
        {
          color: zone.color,
          weight: 2,
          fillColor: zone.color,
          fillOpacity: 0.1,
          dashArray: '10, 6',
        }
      )
        .addTo(map)
        .bindTooltip(`<strong>${zone.name}</strong><br/>🏍️ ${names.join(', ')}`, {
          sticky: true,
          direction: 'center',
          className: 'zone-map-tooltip',
        });

      zoneLayersRef.current.push(rect);
    });
  }, [repartidores, showDeliveryZones, deliveryZones]);

  // Observer de redimensionamiento
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
    const activePolylineKeys = new Set<string>();
    orders.forEach((order) => {
      if (
        order.id === activeOrderId &&
        (order.status === OrderStatus.ASSIGNED || order.status === OrderStatus.DELIVERING)
      ) {
        activePolylineKeys.add(`${order.id}__route`);
      }
      if (
        order.id === activeOrderId &&
        order.status === OrderStatus.DELIVERING &&
        order.locationHistory.length > 1
      ) {
        activePolylineKeys.add(`${order.id}__trail`);
      }
    });
    Object.keys(polylinesRef.current).forEach((key) => {
      if (!activePolylineKeys.has(key)) {
        polylinesRef.current[key].remove();
        delete polylinesRef.current[key];
      }
    });

    orders.forEach((order) => {
      const isSelected = order.id === activeOrderId;

      // Color según estado del pedido
      let color: string = statusColors.pending;
      let label = 'P';
      let glow = false;

      if (order.status === OrderStatus.ASSIGNED) {
        color = statusColors.assigned;
        label = 'A';
      } else if (order.status === OrderStatus.DELIVERING) {
        color = statusColors.delivering;
        label = 'E';
        glow = true;
      } else if (order.status === OrderStatus.DELIVERED) {
        color = statusColors.delivered;
        label = '✓';
      } else if (order.status === OrderStatus.CANCELLED) {
        color = statusColors.cancelled;
        label = '✕';
      }

      if (isSelected) {
        color = mapColors.destination;
        glow = true;
      }

      const icon = createSvgIcon(color, label, glow);
      const popupHtml = `
            <div class="font-sans p-1 text-[11px] max-w-[200px]" style="color:var(--text)">
              <div class="flex items-center gap-1 font-bold border-b pb-1 mb-1" style="color:var(--text-muted);border-color:var(--line)">
                <span>📦 ${order.id}</span>
                <span class="ml-auto px-1.5 py-0.5 rounded text-[9px] text-white font-bold uppercase tracking-wider font-mono" style="background-color:${color}">
                  ${order.status.toUpperCase()}
                </span>
              </div>
              <p class="font-bold mt-1" style="color:var(--text)">${order.clientName}</p>
              <p class="text-[10px] mt-0.5" style="color:var(--text-muted)">📍 ${order.address}</p>
              ${order.repartidorName ? `<p class="mt-1.5 font-bold text-[10px] font-mono" style="color:var(--accent)">🏍️ REPARTIDOR: ${order.repartidorName.toUpperCase()}</p>` : ''}
              <button id="btn-map-select-${order.id}" class="mt-2 w-full text-center py-1 text-white rounded text-[9px] font-bold uppercase tracking-wider transition cursor-pointer font-mono" style="background:${mapColors.destination}">
                Ver Detalles
              </button>
            </div>
          `;

      if (markersRef.current[order.id]) {
        markersRef.current[order.id].setLatLng([order.lat, order.lng]);
        markersRef.current[order.id].setIcon(icon);
        markersRef.current[order.id].setPopupContent(popupHtml);
      } else {
        // Crear nuevo
        const marker = L.marker([order.lat, order.lng], { icon })
          .addTo(map)
          .bindPopup(popupHtml);

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

      if (
        order.id === activeOrderId &&
        order.status === OrderStatus.DELIVERING &&
        order.locationHistory.length > 1
      ) {
        const trailCoords = order.locationHistory.map(
          (p) => [p.lat, p.lng] as [number, number]
        );
        upsertPolyline(map, polylinesRef.current, `${order.id}__trail`, trailCoords, {
          color: mapColors.route,
          weight: 3,
          opacity: 0.7,
          dashArray: '6, 8',
        });
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
      const icon = createSvgIcon(mapColors.pickup, 'C', false);

      if (markersRef.current[markerId]) {
        markersRef.current[markerId].setLatLng([point.lat, point.lng]);
        markersRef.current[markerId].setIcon(icon);
      } else {
        const marker = L.marker([point.lat, point.lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div class="font-sans p-1 text-[11px]" style="color:var(--text)">
              <h4 class="font-bold" style="color:var(--ok)">🛒 ${point.label}</h4>
              ${point.sellerName ? `<p class="text-[10px]" style="color:var(--accent)">${point.sellerName}</p>` : ''}
              <p class="text-[10px] mt-0.5" style="color:var(--text-muted)">📍 ${point.address}</p>
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
      const stale = isStaleLocation(rep.currentLocation.timestamp);
      const icon = createRepartidorIcon(rep.name, mapColors, stale);
      const reportLabel = formatLastReport(rep.currentLocation.timestamp);
      const repPopup = `
            <div class="font-sans p-1 text-[11px]" style="color:var(--text)">
              <h4 class="font-bold uppercase tracking-wider font-mono" style="color:${stale ? 'var(--text-muted)' : 'var(--accent)'}">🏍️ ${rep.name}</h4>
              <p class="text-[10px] mt-0.5" style="color:${stale ? 'var(--warn)' : 'var(--text-muted)'}">${stale ? '⚠️ GPS desactualizado · ' : ''}${reportLabel}</p>
              ${stale ? '<p class="text-[9px] mt-1" style="color:var(--text-muted)">El repartidor debe tener la app abierta con ubicación activa.</p>' : ''}
            </div>
          `;

      if (markersRef.current[markerId]) {
        animateMarkerTo(
          markersRef.current[markerId],
          [rep.currentLocation.lat, rep.currentLocation.lng],
          markerAnimRef.current,
          markerId
        );
        markersRef.current[markerId].setIcon(icon);
        markersRef.current[markerId].setPopupContent(repPopup);
      } else {
        const marker = L.marker([rep.currentLocation.lat, rep.currentLocation.lng], { icon })
          .addTo(map)
          .bindPopup(repPopup);
        markersRef.current[markerId] = marker;
      }
    });
  }, [orders, repartidores, pickupPoints, departurePoint, onSelectOrder, activeOrderId, liveRepartidorLocation, theme, mapColors, statusColors]);

  // Ruta por calles hacia el próximo destino (OSRM)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !activeOrderId) return;

    const order = orders.find((o) => o.id === activeOrderId);
    const routeKey = activeOrderId ? `${activeOrderId}__route` : null;

    if (
      !order ||
      (order.status !== OrderStatus.ASSIGNED && order.status !== OrderStatus.DELIVERING)
    ) {
      if (routeKey && polylinesRef.current[routeKey]) {
        polylinesRef.current[routeKey].remove();
        delete polylinesRef.current[routeKey];
      }
      return;
    }

    const repPos = getRepartidorPosition(order, repartidores, liveRepartidorLocation);
    const dest: [number, number] = [order.lat, order.lng];

    if (!repPos) {
      if (polylinesRef.current[`${order.id}__route`]) {
        polylinesRef.current[`${order.id}__route`].remove();
        delete polylinesRef.current[`${order.id}__route`];
      }
      return;
    }

    const now = Date.now();
    const last = lastRouteFetchRef.current;
    const movedKm =
      last == null
        ? Infinity
        : Math.hypot(repPos[0] - last.lat, repPos[1] - last.lng) * 111;
    const shouldRefetch =
      !last || now - last.at > 15000 || movedKm > 0.08;

    if (!shouldRefetch) return;

    lastRouteFetchRef.current = { at: now, lat: repPos[0], lng: repPos[1] };

    let cancelled = false;

    void fetchDrivingRoute(repPos, dest).then((pathCoords) => {
      if (cancelled || !mapInstanceRef.current) return;
      upsertPolyline(mapInstanceRef.current, polylinesRef.current, `${order.id}__route`, pathCoords, {
        color: mapColors.route,
        weight: 4,
        opacity: 0.88,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeOrderId, orders, repartidores, liveRepartidorLocation, theme, mapColors.route]);

  // Centrar solo al elegir un pedido
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
    const repPos = getRepartidorPosition(activeOrder, repartidoresRef.current, liveRepartidorLocation);
    const dest: [number, number] = [activeOrder.lat, activeOrder.lng];

    if (repPos) {
      map.fitBounds(L.latLngBounds([repPos, dest]), { padding: [50, 50], animate: true });
    } else if (
      activeOrder.status === OrderStatus.ASSIGNED &&
      departurePoint &&
      showDepartureHub
    ) {
      map.fitBounds(
        L.latLngBounds([
          [departurePoint.lat, departurePoint.lng],
          dest,
        ]),
        { padding: [50, 50], animate: true }
      );
    } else {
      map.setView(dest, 15, { animate: true });
    }
  }, [activeOrderId, liveRepartidorLocation, departurePoint, showDepartureHub]);

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
    <div className="relative w-full h-full rounded-lg overflow-hidden border border-[var(--surface-border)] shadow-2xl">
      <div className="absolute top-3 left-12 z-[1000] bg-[var(--surface-panel)]/90 backdrop-blur-sm px-2 py-1 rounded-[5px] text-[9px] font-mono border border-[var(--surface-border)] text-[var(--color-text-muted)] uppercase tracking-wider font-bold">
        🛰️ MAPA REALTIME POSTA
      </div>
      <div className="absolute bottom-3 left-3 z-[1000] bg-[var(--surface-panel)]/90 backdrop-blur-sm px-2 py-1.5 rounded-[5px] text-[8px] font-mono border border-[var(--surface-border)] text-[var(--color-text-faint)]">
        <div><span className="inline-block w-3 h-0.5 bg-[var(--color-accent)] mr-1 align-middle" /> Ruta estimada al destino</div>
        <div><span className="inline-block w-3 h-0.5 border-t border-dashed border-[var(--color-accent)] mr-1 align-middle" /> Recorrido GPS en vivo</div>
      </div>
      <div ref={mapContainerRef} className="w-full h-full" id="leaflet-map-element" />
    </div>
  );
}
