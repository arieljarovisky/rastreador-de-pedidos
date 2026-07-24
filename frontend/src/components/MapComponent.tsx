/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Satellite } from 'lucide-react';
import { Order, OrderStatus, User, LocationPoint, PickupPoint } from '../types.js';
import { type DeliveryZone, type Barrio } from '../config/deliveryZones.js';
import { buildCordonMapZones } from '../config/ambaCordonZones.js';
import { collectZoneGeoFeatures, loadAmbaGeoJson, sortZonesForMapPaint } from '../utils/zoneMapGeo.js';
import { fetchDrivingRoute } from '../utils/route.js';
import { formatLastReport, isStaleLocation } from '../utils/locationFreshness.js';
import { dedupeRepartidores, repartidorIdentityMatches, repartidorMarkerKey } from '../utils/repartidorLocation.js';
import { spreadOverlappingMarkers } from '../utils/markerSpread.js';
import { getPostaMapColors, getPostaStatusColors, MAP_TILE_URLS } from '../theme/colors.ts';
import { usePostaTheme, readPostaTheme } from '../theme/usePostaTheme.ts';
import * as L from 'leaflet';

const DEFAULT_HUB: [number, number] = [-34.5885, -58.4306];

/** Popup adaptado a móvil: más ancho útil y auto-pan lejos de los filtros. */
function getMapPopupOptions(kind: 'order' | 'pickup' = 'order'): L.PopupOptions {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const viewport = typeof window !== 'undefined' ? window.innerWidth : 360;
  // Reserva espacio a la derecha para Ver áreas / Filtros
  const maxWidth = isMobile ? Math.min(300, Math.max(220, viewport - 72)) : 300;
  const minWidth = isMobile ? Math.min(220, maxWidth - 8) : 240;
  return {
    autoPan: true,
    autoPanPaddingTopLeft: isMobile ? [12, 56] : [48, 48],
    autoPanPaddingBottomRight: isMobile ? [76, 48] : [180, 48],
    keepInView: true,
    maxWidth,
    minWidth,
    className: kind === 'pickup' ? 'posta-order-popup posta-pickup-popup' : 'posta-order-popup',
  };
}

const MAP_SVG = {
  pin: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-1px;margin-right:2px"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  bike: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-2px"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`,
  package: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-1px;margin-right:2px"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/></svg>`,
  store: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-1px;margin-right:2px"><path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"/><path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"/><path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"/></svg>`,
  storeMarker: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"/><path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"/><path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"/></svg>`,
  warn: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-1px;margin-right:2px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
} as const;

const MAP_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'PENDIENTE',
  [OrderStatus.ASSIGNED]: 'ASIGNADO',
  [OrderStatus.DELIVERING]: 'EN VIAJE',
  [OrderStatus.DELIVERED]: 'ENTREGADO',
  [OrderStatus.CANCELLED]: 'CANCELADO',
};

function isActiveDeliveryStatus(status: OrderStatus): boolean {
  return status === OrderStatus.ASSIGNED || status === OrderStatus.DELIVERING;
}

function getOrderStatusColor(order: Order, statusColors: ReturnType<typeof getPostaStatusColors>): {
  color: string;
  label: string;
  glow: boolean;
} {
  if (order.status === OrderStatus.ASSIGNED) {
    return { color: statusColors.assigned, label: 'A', glow: false };
  }
  if (order.status === OrderStatus.DELIVERING) {
    return { color: statusColors.delivering, label: 'E', glow: true };
  }
  if (order.status === OrderStatus.DELIVERED) {
    return { color: statusColors.delivered, label: '✓', glow: false };
  }
  if (order.status === OrderStatus.CANCELLED) {
    return { color: statusColors.cancelled, label: '✕', glow: false };
  }
  return { color: statusColors.pending, label: 'P', glow: false };
}

function getRepartidorPosition(
  order: Order,
  repartidores: User[],
  liveLocation?: { lat: number; lng: number } | null
): [number, number] | null {
  const rep = repartidores.find(
    (r) =>
      r.id === order.repartidorId ||
      r.username === order.repartidorId ||
      repartidorIdentityMatches(r, order.repartidorId ?? '')
  );
  if (liveLocation && isActiveDeliveryStatus(order.status)) {
    return [liveLocation.lat, liveLocation.lng];
  }
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
  barrios?: Barrio[];
  activeOrderId: string | null;
  onSelectOrder?: (orderId: string) => void;
  interactive?: boolean;
  /** Ubicación GPS en vivo del repartidor activo (antes de sincronizar con el servidor) */
  liveRepartidorLocation?: { lat: number; lng: number } | null;
  /** Ocultar marcador de salida cuando el foco es la ruta al cliente */
  showDepartureHub?: boolean;
  /** Dibujar zonas asignadas a repartidores */
  showDeliveryZones?: boolean;
  /** Si hay filtro de cordón, pintar solo esa zona */
  focusZoneId?: string | null;
  /**
   * Vista repartidor (panel más chico): padding de fitBounds razonable,
   * sin leyenda de zonas y chrome liviano para que los tiles llenen el mapa.
   */
  compact?: boolean;
}

// Configuración de Pines Personalizados con SVGs para evitar enlaces rotos de Leaflet
function bindOrderMarkerSelect(
  marker: L.Marker,
  orderId: string,
  onSelect?: (orderId: string) => void
) {
  // No usar marker.off('click'): eso elimina el handler interno de Leaflet que abre el popup.
  marker.off('popupopen');

  // El click del marcador abre el preview (bindPopup); "Ver detalles" selecciona el pedido.
  marker.on('popupopen', () => {
    window.setTimeout(() => {
      const btn = document.getElementById(`btn-map-select-${orderId}`);
      if (btn && onSelect) {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelect(orderId);
          marker.closePopup();
        };
      }
    }, 50);
  });
}

function buildOrderPopupHtml(
  order: Order,
  badgeColor: string,
  ctaColor: string
): string {
  return `
    <div class="posta-map-popup" style="color:var(--text)">
      <div class="posta-map-popup__head">
        <span class="posta-map-popup__id">${MAP_SVG.package}<span>${order.id}</span></span>
        <span class="posta-map-popup__badge" style="background-color:${badgeColor}">
          ${MAP_STATUS_LABELS[order.status]}
        </span>
      </div>
      <p class="posta-map-popup__name">${order.clientName}</p>
      <p class="posta-map-popup__addr">${MAP_SVG.pin}<span>${order.address}</span></p>
      ${
        order.repartidorName
          ? `<p class="posta-map-popup__rep" style="color:var(--accent)">${MAP_SVG.bike}<span>REPARTIDOR: ${order.repartidorName.toUpperCase()}</span></p>`
          : ''
      }
      <button type="button" id="btn-map-select-${order.id}" class="posta-map-popup__cta" style="background:${ctaColor}">
        Ver detalles
      </button>
    </div>
  `;
}

function buildPickupPopupHtml(point: PickupPoint): string {
  const name = point.sellerName || point.label || 'Sucursal';
  const subtitle = point.sellerName && point.label && point.label !== point.sellerName
    ? point.label
    : 'Punto de colecta';
  return `
    <div class="posta-map-popup" style="color:var(--text)">
      <div class="posta-map-popup__head">
        <span class="posta-map-popup__id">${MAP_SVG.store}<span>Sucursal</span></span>
        <span class="posta-map-popup__badge" style="background-color:var(--accent,#5C87EB)">Colecta</span>
      </div>
      <p class="posta-map-popup__name">${name}</p>
      ${subtitle !== name ? `<p class="posta-map-popup__meta">${subtitle}</p>` : ''}
      <p class="posta-map-popup__addr">${MAP_SVG.pin}<span>${point.address}</span></p>
    </div>
  `;
}

const createSvgIcon = (color: string, iconText: string, glow: boolean = false) => {
  const shadowClass = glow ? 'filter drop-shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse' : 'filter drop-shadow-md';
  return L.divIcon({
    html: `
      <div class="relative w-8 h-8 flex items-center justify-center ${shadowClass}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" class="w-8 h-8 absolute">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
        <span class="z-10 text-white font-bold text-[10px] mb-2.5">${iconText}</span>
      </div>
    `,
    className: 'custom-leaflet-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

/** Marcador de sucursal / punto de colecta — forma distinta al pin de pedido. */
const createPickupIcon = (color: string) => {
  return L.divIcon({
    html: `
      <div class="relative flex flex-col items-center filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.28)]" style="width:40px;height:44px">
        <div class="w-9 h-9 rounded-[10px] border-2 border-white flex items-center justify-center shadow" style="background:${color}">
          ${MAP_SVG.storeMarker}
        </div>
        <div class="absolute bottom-0 font-mono font-bold text-[8px] leading-none px-1 py-0.5 rounded shadow-md whitespace-nowrap" style="background:var(--panel);border:1px solid var(--line);color:var(--text)">
          SUCURSAL
        </div>
      </div>
    `,
    className: 'pickup-leaflet-icon',
    iconSize: [40, 44],
    iconAnchor: [20, 36],
    popupAnchor: [0, -36],
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
          ${MAP_SVG.bike}
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
  barrios = [],
  activeOrderId,
  onSelectOrder,
  interactive = true,
  liveRepartidorLocation = null,
  showDepartureHub = true,
  showDeliveryZones = true,
  focusZoneId = null,
  compact = false,
}: MapComponentProps) {
  const theme = usePostaTheme();
  const mapColors = getPostaMapColors(theme);
  const statusColors = getPostaStatusColors(theme);

  const rootRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const polylinesRef = useRef<{ [key: string]: L.Polyline }>({});
  const markerAnimRef = useRef<Record<string, number>>({});
  const lastRouteFetchRef = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const zoneLayersRef = useRef<L.Layer[]>([]);
  const hubMarkerRef = useRef<L.Marker | null>(null);
  const initialFitDoneRef = useRef(false);
  const lastCenteredOrderIdRef = useRef<string | null>(null);
  const userInteractedRef = useRef(false);
  const popupOpenedForOrderRef = useRef<string | null>(null);
  const ordersRef = useRef(orders);
  const repartidoresRef = useRef(repartidores);
  const lastSizeRef = useRef({ w: 0, h: 0 });
  /** Incrementa al crear el mapa (init async) para re-disparar efectos de markers/fit. */
  const [mapEpoch, setMapEpoch] = useState(0);

  ordersRef.current = orders;
  repartidoresRef.current = repartidores;

  const refreshMapSize = useCallback(() => {
    const map = mapInstanceRef.current;
    const root = rootRef.current;
    const el = mapContainerRef.current;
    if (!map || !root || !el) return;
    const w = Math.floor(root.getBoundingClientRect().width);
    const h = Math.floor(root.getBoundingClientRect().height);
    if (w < 40 || h < 40) return;

    // Leaflet suele quedar con _size viejo en layouts flex; fijar px y forzar redibujado.
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    map.invalidateSize({ animate: false, pan: false });

    const prev = lastSizeRef.current;
    if (Math.abs(prev.w - w) > 2 || Math.abs(prev.h - h) > 2) {
      lastSizeRef.current = { w, h };
      // Tras un cambio grande de tamaño, recalcular tiles del viewport.
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
          layer.redraw();
        }
      });
    }
  }, []);

  // Inicializar mapa cuando el contenedor ya tiene tamaño real (flex layout).
  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const timers: number[] = [];
    let resizeObserver: ResizeObserver | null = null;

    const teardownMap = () => {
      for (const marker of Object.values(markersRef.current) as L.Marker[]) {
        marker.remove();
      }
      markersRef.current = {};
      for (const line of Object.values(polylinesRef.current) as L.Polyline[]) {
        line.remove();
      }
      polylinesRef.current = {};
      zoneLayersRef.current.forEach((layer) => layer.remove());
      zoneLayersRef.current = [];
      if (hubMarkerRef.current) {
        hubMarkerRef.current.remove();
        hubMarkerRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      tileLayerRef.current = null;
      initialFitDoneRef.current = false;
      lastCenteredOrderIdRef.current = null;
      lastSizeRef.current = { w: 0, h: 0 };
    };

    const createMap = () => {
      if (cancelled || mapInstanceRef.current || !mapContainerRef.current || !rootRef.current) {
        return;
      }
      const root = rootRef.current;
      if (root.clientWidth < 40 || root.clientHeight < 40) {
        rafId = requestAnimationFrame(createMap);
        return;
      }

      const initialCenter: [number, number] = departurePoint
        ? [departurePoint.lat, departurePoint.lng]
        : DEFAULT_HUB;

      // Flota admin: AMBA amplio (CABA + cordones 1–3, incl. Campana/Zárate/La Plata).
      // Repartidor (compact): se puede alejar a toda Argentina.
      const gbaBounds = L.latLngBounds([-35.2, -59.4], [-33.85, -57.6]);
      const arBounds = L.latLngBounds([-55.2, -73.6], [-21.7, -53.5]);

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: compact ? 13 : 12,
        minZoom: compact ? 5 : 8,
        maxZoom: 18,
        maxBounds: compact ? arBounds : gbaBounds,
        maxBoundsViscosity: compact ? 0.4 : 0.7,
        zoomControl: interactive,
        scrollWheelZoom: interactive,
        dragging: interactive,
        touchZoom: interactive,
        attributionControl: false,
      });

      map.on('zoomstart', () => {
        userInteractedRef.current = true;
      });
      map.on('movestart', () => {
        userInteractedRef.current = true;
      });

      tileLayerRef.current = L.tileLayer(MAP_TILE_URLS[readPostaTheme()], {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
        updateWhenIdle: false,
        updateWhenZooming: true,
        keepBuffer: 2,
      }).addTo(map);

      mapInstanceRef.current = map;
      lastSizeRef.current = { w: root.clientWidth, h: root.clientHeight };
      setMapEpoch((n) => n + 1);

      // Tras el layout flex (sidebar + panel), el ancho suele asentar más tarde.
      for (const ms of [0, 50, 120, 300, 600, 1200]) {
        timers.push(
          window.setTimeout(() => {
            if (!cancelled) refreshMapSize();
          }, ms)
        );
      }

      resizeObserver = new ResizeObserver(() => {
        refreshMapSize();
      });
      resizeObserver.observe(root);
    };

    createMap();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      timers.forEach((id) => clearTimeout(id));
      resizeObserver?.disconnect();
      teardownMap();
    };
    // Recrear si cambian interactividad o compact (minZoom / bounds distintos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, compact, refreshMapSize]);

  // Cada vez que cambia el pedido activo o modo compact, recalcular tamaño.
  useEffect(() => {
    const timers = [0, 80, 200, 450].map((ms) =>
      window.setTimeout(() => refreshMapSize(), ms)
    );
    return () => timers.forEach((id) => clearTimeout(id));
  }, [activeOrderId, compact, refreshMapSize]);

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
          <p class="text-[10px] mt-0.5" style="color:var(--text-muted)">${MAP_SVG.pin} ${departurePoint.address}</p>
        </div>
      `);
  }, [departurePoint, showDepartureHub, mapColors]);

  // Zonas de entrega pintadas por polígonos (partidos / comunas)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    zoneLayersRef.current.forEach((layer) => layer.remove());
    zoneLayersRef.current = [];

    if (!showDeliveryZones) return;

    let cancelled = false;

    void (async () => {
      try {
        await loadAmbaGeoJson();
      } catch {
        return;
      }
      if (cancelled) return;

      const allZones = sortZonesForMapPaint(buildCordonMapZones(deliveryZones, barrios));
      const paintZones = focusZoneId
        ? allZones.filter(
            (z) =>
              z.id === focusZoneId ||
              z.id.endsWith(`_${focusZoneId}`) ||
              focusZoneId.endsWith(`_${z.id}`)
          )
        : allZones;

      for (const zone of paintZones) {
        const features = collectZoneGeoFeatures(zone, barrios);
        if (features.length === 0) continue;

        const layer = L.geoJSON(features, {
          interactive: false,
          style: {
            color: zone.color,
            weight: 1,
            fillColor: zone.color,
            fillOpacity: 0.38,
            opacity: 0.85,
          },
        }).addTo(map);

        zoneLayersRef.current.push(layer);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showDeliveryZones, deliveryZones, barrios, focusZoneId]);

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
        order.status === OrderStatus.DELIVERING
      ) {
        activePolylineKeys.add(`${order.id}__route`);
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
      const statusStyle = getOrderStatusColor(order, statusColors);
      let { color, label, glow } = statusStyle;
      const badgeColor = statusStyle.color;

      if (isSelected && isActiveDeliveryStatus(order.status)) {
        color = mapColors.destination;
        glow = true;
      }

      const icon = createSvgIcon(color, label, glow);

      if (markersRef.current[order.id]) {
        const marker = markersRef.current[order.id];
        marker.setLatLng([order.lat, order.lng]);
        marker.setIcon(icon);
        if (compact) {
          marker.closePopup();
          marker.unbindPopup();
          marker.off('click');
          marker.off('popupopen');
          marker.on('click', () => onSelectOrder?.(order.id));
        } else {
          const popupHtml = buildOrderPopupHtml(order, badgeColor, mapColors.destination);
          marker.bindPopup(popupHtml, getMapPopupOptions('order'));
          bindOrderMarkerSelect(marker, order.id, onSelectOrder);
        }
      } else {
        const marker = L.marker([order.lat, order.lng], { icon }).addTo(map);
        if (compact) {
          marker.on('click', () => onSelectOrder?.(order.id));
        } else {
          const popupHtml = buildOrderPopupHtml(order, badgeColor, mapColors.destination);
          marker.bindPopup(popupHtml, getMapPopupOptions('order'));
          bindOrderMarkerSelect(marker, order.id, onSelectOrder);
        }
        markersRef.current[order.id] = marker;
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
      const icon = createPickupIcon(mapColors.pickup);
      const popupHtml = buildPickupPopupHtml(point);

      if (markersRef.current[markerId]) {
        const marker = markersRef.current[markerId];
        marker.setLatLng([point.lat, point.lng]);
        marker.setIcon(icon);
        marker.bindPopup(popupHtml, getMapPopupOptions('pickup'));
      } else {
        const marker = L.marker([point.lat, point.lng], { icon })
          .addTo(map)
          .bindPopup(popupHtml, getMapPopupOptions('pickup'));
        markersRef.current[markerId] = marker;
      }
    });

    // --- 3. PROCESAR REPARTIDORES ---
    const activeOrder = activeOrderId
      ? orders.find((o) => o.id === activeOrderId)
      : null;

    let fleetRepartidores = dedupeRepartidores(repartidores);

    if (liveRepartidorLocation && activeOrder?.repartidorId && isActiveDeliveryStatus(activeOrder.status)) {
      fleetRepartidores = fleetRepartidores.map((rep) =>
        repartidorIdentityMatches(rep, activeOrder.repartidorId!)
          ? {
              ...rep,
              currentLocation: {
                lat: liveRepartidorLocation.lat,
                lng: liveRepartidorLocation.lng,
                timestamp: new Date().toISOString(),
              },
            }
          : rep
      );
    }

    const activeRepartidorKeys = new Set(
      fleetRepartidores
        .filter((r) => r.currentLocation)
        .flatMap((r) => [r.id, r.username].map((value) => value.trim().toLowerCase()))
    );

    Object.keys(markersRef.current).forEach((id) => {
      if (!id.startsWith('rep_')) return;
      const suffix = id.slice(4).toLowerCase();
      if (!activeRepartidorKeys.has(suffix)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    const repsWithLocation = fleetRepartidores
      .filter((rep) => rep.currentLocation)
      .map((rep) => ({
        rep,
        lat: rep.currentLocation!.lat,
        lng: rep.currentLocation!.lng,
      }));

    const spreadReps = spreadOverlappingMarkers(repsWithLocation);

    spreadReps.forEach(({ rep, displayLat, displayLng }) => {
      if (!rep.currentLocation) return;
      const markerId = `rep_${repartidorMarkerKey(rep)}`;
      const displayPos: [number, number] = [displayLat, displayLng];
      const stale = isStaleLocation(rep.currentLocation.timestamp);
      const icon = createRepartidorIcon(rep.name, mapColors, stale);
      const reportLabel = formatLastReport(rep.currentLocation.timestamp);
      const repPopup = `
            <div class="font-sans p-1 text-[11px]" style="color:var(--text)">
              <h4 class="font-bold uppercase tracking-wider font-mono flex items-center gap-1" style="color:${stale ? 'var(--text-muted)' : 'var(--accent)'}">${MAP_SVG.bike} ${rep.name}</h4>
              <p class="text-[10px] mt-0.5" style="color:${stale ? 'var(--warn)' : 'var(--text-muted)'}">${stale ? `${MAP_SVG.warn} GPS desactualizado · ` : ''}${reportLabel}</p>
              ${stale ? '<p class="text-[9px] mt-1" style="color:var(--text-muted)">El repartidor debe tener la app abierta con ubicación activa.</p>' : ''}
            </div>
          `;

      // Eliminar marcadores alias (p. ej. id viejo vs uuid) del mismo repartidor
      Object.keys(markersRef.current).forEach((id) => {
        if (!id.startsWith('rep_') || id === markerId) return;
        const suffix = id.slice(4);
        if (repartidorIdentityMatches(rep, suffix)) {
          markersRef.current[id].remove();
          delete markersRef.current[id];
        }
      });

      if (markersRef.current[markerId]) {
        animateMarkerTo(
          markersRef.current[markerId],
          displayPos,
          markerAnimRef.current,
          markerId
        );
        markersRef.current[markerId].setIcon(icon);
        markersRef.current[markerId].setPopupContent(repPopup);
      } else {
        const marker = L.marker(displayPos, { icon })
          .addTo(map)
          .bindPopup(repPopup);
        markersRef.current[markerId] = marker;
      }
    });
  }, [orders, repartidores, pickupPoints, departurePoint, onSelectOrder, activeOrderId, liveRepartidorLocation, theme, mapColors, statusColors, mapEpoch, compact]);

  // Ruta por calles hacia el próximo destino (OSRM)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !activeOrderId) return;

    const order = orders.find((o) => o.id === activeOrderId);
    const routeKey = activeOrderId ? `${activeOrderId}__route` : null;

    if (
      !order ||
      order.status !== OrderStatus.DELIVERING
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
  }, [activeOrderId, orders, repartidores, liveRepartidorLocation, theme, mapColors.route, mapEpoch]);

  // Al seleccionar un pedido (lista o "Ver detalles"), cerrar popup preview:
  // el panel inferior ya muestra el detalle y evita solapar UI en el mapa.
  useEffect(() => {
    if (compact) {
      popupOpenedForOrderRef.current = null;
      const map = mapInstanceRef.current;
      map?.closePopup();
      return;
    }
    if (!activeOrderId) {
      popupOpenedForOrderRef.current = null;
      return;
    }
    if (popupOpenedForOrderRef.current === activeOrderId) return;

    const map = mapInstanceRef.current;
    const marker = markersRef.current[activeOrderId];
    popupOpenedForOrderRef.current = activeOrderId;
    if (marker?.isPopupOpen()) {
      marker.closePopup();
    } else {
      map?.closePopup();
    }
  }, [activeOrderId, compact, mapEpoch]);

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

    const rep = repartidoresRef.current.find(
      (r) =>
        r.id === activeOrder.repartidorId ||
        repartidorIdentityMatches(r, activeOrder.repartidorId ?? '')
    );
    const repPos = getRepartidorPosition(activeOrder, repartidoresRef.current, liveRepartidorLocation);
    const dest: [number, number] = [activeOrder.lat, activeOrder.lng];

    // En flota admin hay panel inferior → más padding abajo. En repartidor el mapa es bajo:
    // un padding grande (280px) deja huecos negros y tiles mal centrados.
    const mapPadding = compact
      ? {
          paddingTopLeft: [40, 48] as [number, number],
          paddingBottomRight: [40, 56] as [number, number],
        }
      : {
          paddingTopLeft: [48, 48] as [number, number],
          paddingBottomRight: [48, 280] as [number, number],
        };

    if (repPos && activeOrder.status === OrderStatus.DELIVERING) {
      map.fitBounds(L.latLngBounds([repPos, dest]), {
        ...mapPadding,
        animate: true,
        maxZoom: compact ? 16 : 15,
      });
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
        { ...mapPadding, animate: true, maxZoom: compact ? 15 : 14 }
      );
    } else {
      map.setView(dest, compact ? 15 : 14, { animate: true });
    }

    // Tras fitBounds el tamaño del contenedor flex puede cambiar: forzar tiles.
    requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
    });
  }, [activeOrderId, liveRepartidorLocation, departurePoint, showDepartureHub, compact, mapEpoch]);

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
  }, [orders.length, activeOrderId, mapEpoch]);

  const zoneLegend =
    showDeliveryZones && !compact
      ? sortZonesForMapPaint(buildCordonMapZones(deliveryZones, barrios)).filter((z) =>
          focusZoneId
            ? z.id === focusZoneId ||
              z.id.endsWith(`_${focusZoneId}`) ||
              focusZoneId.endsWith(`_${z.id}`)
            : true
        )
      : [];

  return (
    <div
      ref={rootRef}
      className={`relative w-full h-full min-h-0 overflow-hidden bg-[var(--surface-bg)] ${
        compact
          ? 'rounded-[inherit]'
          : 'rounded-lg border border-[var(--surface-border)] shadow-2xl'
      }`}
    >
      {!compact && (
        <div className="absolute top-3 left-12 sm:left-14 z-[1000] bg-[var(--surface-panel)]/90 backdrop-blur-sm px-2 py-1 rounded-[5px] text-[9px] font-mono border border-[var(--surface-border)] text-[var(--color-text-muted)] uppercase tracking-wider font-bold flex items-center gap-1 pointer-events-none max-w-[calc(100%-11rem)] sm:max-w-[calc(100%-13rem)] truncate">
          <Satellite className="w-3 h-3 shrink-0" />
          <span className="truncate">MAPA REALTIME POSTA</span>
        </div>
      )}
      {zoneLegend.length > 0 && (
        <div className="absolute bottom-3 right-3 z-[1000] bg-[var(--surface-panel)]/95 backdrop-blur-md border border-[var(--surface-border)] rounded-[var(--radius-posta)] px-3 py-2 shadow-lg min-w-[9.5rem]">
          <p className="text-[9px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
            Zonas de entrega
          </p>
          <ul className="space-y-1">
            {zoneLegend.map((zone) => (
              <li key={zone.id} className="flex items-center gap-2">
                <span
                  className="shrink-0 w-3.5 h-3.5 rounded-sm border border-white/20"
                  style={{ backgroundColor: zone.color, opacity: 0.85 }}
                />
                <span className="text-[10px] font-medium text-[var(--color-text)] leading-tight">
                  {zone.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div
        className={`absolute z-[1000] bg-[var(--surface-panel)]/90 backdrop-blur-sm px-2 py-1.5 rounded-[5px] text-[8px] font-mono border border-[var(--surface-border)] text-[var(--color-text-faint)] pointer-events-none ${
          compact ? 'bottom-2 left-2' : 'bottom-3 left-3'
        }`}
      >
        <div>
          <span className="inline-block w-3 h-0.5 bg-[var(--color-accent)] mr-1 align-middle" />
          Ruta en reparto
        </div>
      </div>
      {/* w/h 100% (no absolute): Leaflet mide mal con absolute+flex y deja franja vacía */}
      <div ref={mapContainerRef} className="block w-full h-full" style={{ minHeight: '100%' }} />
    </div>
  );
}
