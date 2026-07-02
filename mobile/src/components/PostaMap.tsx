import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { colors, typography } from '../theme';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const OSM_FALLBACK = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface MapMarker extends MapPoint {
  id?: string;
  color: string;
  /** Mueve el marcador con interpolación suave (ideal para repartidores). */
  animated?: boolean;
}

export interface MapPolyline {
  id?: string;
  points: MapPoint[];
  color?: string;
}

interface Props {
  markers: MapMarker[];
  polylines?: MapPolyline[];
  style?: StyleProp<ViewStyle>;
  emptyLabel?: string;
  /** Sigue al marcador animado en pantalla (estilo Uber/Rappi). */
  followDriver?: boolean;
}

function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function markerKey(m: MapMarker, index: number): string {
  return m.id ?? `m_${index}_${m.label ?? ''}_${m.color}`;
}

function polylineKey(p: MapPolyline, index: number): string {
  return p.id ?? `p_${index}_${p.color ?? ''}`;
}

const MAP_SHELL_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; padding: 0; background: ${colors.bg}; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .leaflet-control-attribution { font-size: 9px; background: rgba(20,18,16,0.9) !important; color: ${colors.textMuted} !important; }
    .leaflet-bar a { background: ${colors.surface} !important; color: ${colors.text} !important; border-color: ${colors.border} !important; }
    .driver-pin { position: relative; }
    .driver-pulse {
      position: absolute; inset: -6px; border-radius: 50%;
      animation: pulse 2s ease-out infinite;
      opacity: 0.35;
    }
    @keyframes pulse {
      0% { transform: scale(0.6); opacity: 0.5; }
      70% { transform: scale(1.6); opacity: 0; }
      100% { transform: scale(1.6); opacity: 0; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const TILE_URL = ${JSON.stringify(TILE_URL)};
    const FALLBACK_URL = ${JSON.stringify(OSM_FALLBACK)};
    const ANIM_MS = 1800;

    let map = null;
    let fallbackLayer = null;
    let initialFitDone = false;
    let followDriverId = null;
    const markers = {};
    const polylines = {};
    const animations = {};

    function post(type, detail) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, detail }));
      }
    }

    function cancelAnim(id) {
      if (animations[id]) {
        cancelAnimationFrame(animations[id]);
        delete animations[id];
      }
    }

    function makePin(color, label, animated) {
      const pulse = animated
        ? '<div class="driver-pulse" style="background:' + color + ';"></div>'
        : '';
      return L.divIcon({
        className: '',
        html:
          '<div class="driver-pin" style="width:18px;height:18px;border-radius:50%;background:' +
          color +
          ';border:2px solid #e9edf4;box-shadow:0 2px 8px rgba(0,0,0,0.5);">' +
          pulse +
          '</div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
    }

    function animateMarker(id, marker, toLat, toLng, color, label, animated) {
      const from = marker.getLatLng();
      if (Math.abs(from.lat - toLat) < 0.000001 && Math.abs(from.lng - toLng) < 0.000001) return;

      cancelAnim(id);
      const start = performance.now();
      function step(now) {
        const t = Math.min(1, (now - start) / ANIM_MS);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const lat = from.lat + (toLat - from.lat) * ease;
        const lng = from.lng + (toLng - from.lng) * ease;
        marker.setLatLng([lat, lng]);
        if (followDriverId === id && map) {
          map.panTo([lat, lng], { animate: false, duration: 0 });
        }
        if (t < 1) {
          animations[id] = requestAnimationFrame(step);
        } else {
          delete animations[id];
        }
      }
      animations[id] = requestAnimationFrame(step);
      marker.setIcon(makePin(color, label, animated));
      if (label) marker.setPopupContent(label);
    }

    function upsertMarker(m) {
      const id = m.id;
      const icon = makePin(m.color, m.label || '', m.animated);
      if (markers[id]) {
        if (m.animated) {
          animateMarker(id, markers[id], m.lat, m.lng, m.color, m.label || '', m.animated);
        } else {
          markers[id].setLatLng([m.lat, m.lng]);
          markers[id].setIcon(icon);
          if (m.label) markers[id].setPopupContent(m.label);
        }
      } else {
        const marker = L.marker([m.lat, m.lng], { icon }).addTo(map);
        if (m.label) marker.bindPopup(m.label);
        markers[id] = marker;
      }
    }

    function upsertPolyline(p) {
      const id = p.id;
      const coords = p.points.map(function(pt) { return [pt.lat, pt.lng]; });
      const style = { color: p.color || '#E69A2E', weight: 4, opacity: 0.9 };
      if (polylines[id]) {
        polylines[id].setLatLngs(coords);
        polylines[id].setStyle(style);
      } else if (coords.length > 1) {
        polylines[id] = L.polyline(coords, style).addTo(map);
      }
    }

    function fitAll(data) {
      const bounds = [];
      (data.markers || []).forEach(function(m) { bounds.push([m.lat, m.lng]); });
      (data.polylines || []).forEach(function(line) {
        line.points.forEach(function(p) { bounds.push([p.lat, p.lng]); });
      });
      if (bounds.length === 0) {
        map.setView([-34.6037, -58.3816], 12);
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 15);
      } else {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    }

    window.__postaMap = {
      update: function(payload) {
        if (!map) return;
        followDriverId = payload.followDriverId || null;

        const nextMarkerIds = new Set((payload.markers || []).map(function(m) { return m.id; }));
        Object.keys(markers).forEach(function(id) {
          if (!nextMarkerIds.has(id)) {
            cancelAnim(id);
            markers[id].remove();
            delete markers[id];
          }
        });

        (payload.markers || []).forEach(upsertMarker);

        const nextPolyIds = new Set((payload.polylines || []).map(function(p) { return p.id; }));
        Object.keys(polylines).forEach(function(id) {
          if (!nextPolyIds.has(id)) {
            polylines[id].remove();
            delete polylines[id];
          }
        });

        (payload.polylines || []).forEach(upsertPolyline);

        if (!initialFitDone && (payload.markers || []).length > 0) {
          fitAll(payload);
          initialFitDone = true;
        }

        setTimeout(function() {
          map.invalidateSize(true);
        }, 50);
      },
    };

    function initMap() {
      map = L.map('map', { zoomControl: true, attributionControl: true });
      const layer = L.tileLayer(TILE_URL, {
        attribution: '&copy; OSM &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
      });
      fallbackLayer = L.tileLayer(FALLBACK_URL, { maxZoom: 19, attribution: '&copy; OSM' });
      layer.on('tileerror', function() {
        if (!map.hasLayer(fallbackLayer)) fallbackLayer.addTo(map);
      });
      layer.addTo(map);
      map.setView([-34.6037, -58.3816], 12);
      setTimeout(function() {
        map.invalidateSize(true);
        post('ready');
      }, 200);
    }

    if (document.readyState === 'complete') initMap();
    else window.addEventListener('load', initMap);
  </script>
</body>
</html>`;

/** Mapa Leaflet embebido con actualización en vivo (sin recargar el WebView). */
export default function PostaMap({
  markers,
  polylines = [],
  style,
  emptyLabel,
  followDriver = false,
}: Props) {
  const webRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const lastPayloadRef = useRef<string>('');

  const validMarkers = useMemo(
    () =>
      markers
        .filter((m) => isValidCoord(m.lat, m.lng))
        .map((m, i) => ({ ...m, id: markerKey(m, i) })),
    [markers]
  );

  const validPolylines = useMemo(
    () =>
      polylines
        .map((p, i) => ({
          id: polylineKey(p, i),
          color: p.color ?? '#E69A2E',
          points: p.points.filter((pt) => isValidCoord(pt.lat, pt.lng)),
        }))
        .filter((p) => p.points.length > 1),
    [polylines]
  );

  const followDriverId = useMemo(() => {
    if (!followDriver) return null;
    const driver = validMarkers.find((m) => m.animated);
    return driver?.id ?? null;
  }, [followDriver, validMarkers]);

  const pushUpdate = useCallback(() => {
    if (!mapReady || !webRef.current) return;

    const payload = {
      markers: validMarkers,
      polylines: validPolylines,
      followDriverId,
    };
    const serialized = JSON.stringify(payload);
    if (serialized === lastPayloadRef.current) return;
    lastPayloadRef.current = serialized;

    webRef.current.injectJavaScript(`
      if (window.__postaMap && window.__postaMap.update) {
        window.__postaMap.update(${serialized});
      }
      true;
    `);
  }, [mapReady, validMarkers, validPolylines, followDriverId]);

  useEffect(() => {
    pushUpdate();
  }, [pushUpdate]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string };
      if (msg.type === 'ready') {
        setMapReady(true);
        lastPayloadRef.current = '';
      }
    } catch {
      // ignore
    }
  };

  if (validMarkers.length === 0 && validPolylines.length === 0) {
    return (
      <View style={[styles.empty, style]}>
        <Text style={typography.body(13, colors.textMuted)}>
          {emptyLabel ?? 'Sin ubicaciones para mostrar en el mapa.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={webRef}
        source={{ html: MAP_SHELL_HTML, baseUrl: 'https://localhost' }}
        style={styles.webview}
        originWhitelist={['*']}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        onMessage={onMessage}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
        onError={() => undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: Platform.OS === 'web' ? 240 : 200,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    minHeight: 120,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
});
