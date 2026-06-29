import React, { useMemo, useRef } from 'react';
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
  color: string;
}

export interface MapPolyline {
  points: MapPoint[];
  color?: string;
}

interface Props {
  markers: MapMarker[];
  polylines?: MapPolyline[];
  style?: StyleProp<ViewStyle>;
  emptyLabel?: string;
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

function buildLeafletHtml(markers: MapMarker[], polylines: MapPolyline[]): string {
  const payload = JSON.stringify({
    markers: markers.filter((m) => isValidCoord(m.lat, m.lng)),
    polylines: polylines
      .map((p) => ({
        color: p.color ?? '#E69A2E',
        points: p.points.filter((pt) => isValidCoord(pt.lat, pt.lng)),
      }))
      .filter((p) => p.points.length > 1),
    tileUrl: TILE_URL,
    fallbackUrl: OSM_FALLBACK,
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; padding: 0; background: #0b0f18; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .leaflet-control-attribution { font-size: 9px; background: rgba(20,26,40,0.85) !important; color: #8593ae !important; }
    .leaflet-bar a { background: #141a28 !important; color: #e9edf4 !important; border-color: #283246 !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const data = ${payload};
    let map;

    function post(type, detail) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, detail }));
      }
    }

    function pin(lat, lng, color, label) {
      const icon = L.divIcon({
        className: '',
        html: '<div style="width:16px;height:16px;border-radius:50%;background:' + color + ';border:2px solid #e9edf4;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      return L.marker([lat, lng], { icon }).addTo(map).bindPopup(label || '');
    }

    function initMap() {
      map = L.map('map', { zoomControl: true, attributionControl: true });
      const layer = L.tileLayer(data.tileUrl, {
        attribution: '&copy; OSM &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
      });
      layer.on('tileerror', function() {
        if (!map.hasLayer(fallback)) {
          fallback.addTo(map);
        }
      });
      layer.addTo(map);
      const fallback = L.tileLayer(data.fallbackUrl, { maxZoom: 19, attribution: '&copy; OSM' });

      const bounds = [];
      (data.markers || []).forEach(function(m) {
        pin(m.lat, m.lng, m.color, m.label || '');
        bounds.push([m.lat, m.lng]);
      });
      (data.polylines || []).forEach(function(line) {
        const coords = line.points.map(function(p) { return [p.lat, p.lng]; });
        L.polyline(coords, { color: line.color, weight: 4, opacity: 0.9 }).addTo(map);
        coords.forEach(function(c) { bounds.push(c); });
      });

      if (bounds.length === 0) {
        map.setView([-34.6037, -58.3816], 12);
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 15);
      } else {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }

      setTimeout(function() {
        map.invalidateSize(true);
        post('ready');
      }, 250);
    }

    if (document.readyState === 'complete') {
      initMap();
    } else {
      window.addEventListener('load', initMap);
    }
  </script>
</body>
</html>`;
}

/** Mapa Leaflet embebido — mismos tiles oscuros que la web. */
export default function PostaMap({ markers, polylines = [], style, emptyLabel }: Props) {
  const webRef = useRef<WebView>(null);
  const validMarkers = markers.filter((m) => isValidCoord(m.lat, m.lng));

  const html = useMemo(
    () => buildLeafletHtml(validMarkers, polylines),
    [validMarkers, polylines]
  );

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string };
      if (msg.type === 'ready') {
        webRef.current?.injectJavaScript('if (typeof map !== "undefined") { map.invalidateSize(true); } true;');
      }
    } catch {
      // ignore
    }
  };

  if (validMarkers.length === 0 && polylines.length === 0) {
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
        source={{ html, baseUrl: 'https://localhost' }}
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
