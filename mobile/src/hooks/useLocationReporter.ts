import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { GPS_HEARTBEAT_MS, GPS_THROTTLE_MS } from '../config';
import { setActiveOrderId } from '../location/locationQueue';
import {
  flushLocationQueue,
  reportLocationPoint,
  startLocationSyncListeners,
} from '../location/locationSync';
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from '../location/backgroundLocationTask';
import { locationWatchOptions } from '../location/locationTrackingOptions';

interface Coords {
  lat: number;
  lng: number;
}

interface UseLocationReporterResult {
  coords: Coords | null;
  permissionDenied: boolean;
  error: string | null;
}

/**
 * Sigue la posición del dispositivo y reporta GPS al backend.
 * Envía heartbeat periódico aunque el repartidor esté parado.
 */
export function useLocationReporter(
  token: string | null,
  activeOrderId: string | null,
  enabled: boolean
): UseLocationReporterResult {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const lastGpsSentAt = useRef(0);
  const lastHeartbeatAt = useRef(0);
  const coordsRef = useRef<Coords | null>(null);
  const activeOrderIdRef = useRef(activeOrderId);
  activeOrderIdRef.current = activeOrderId;

  const sendPoint = (lat: number, lng: number, timestamp: string) => {
    const now = Date.now();
    if (now - lastGpsSentAt.current < GPS_THROTTLE_MS) return;
    lastGpsSentAt.current = now;
    void reportLocationPoint(
      token!,
      { lat, lng, timestamp },
      activeOrderIdRef.current
    );
  };

  useEffect(() => {
    void setActiveOrderId(activeOrderId);
  }, [activeOrderId]);

  useEffect(() => {
    const unsubscribe = startLocationSyncListeners();
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        void flushLocationQueue();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!enabled || !token) {
      subRef.current?.remove();
      subRef.current = null;
      void stopBackgroundLocation();
      return;
    }

    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const runHeartbeat = async () => {
      if (cancelled || !token) return;

      const now = Date.now();
      if (now - lastHeartbeatAt.current < GPS_HEARTBEAT_MS - 1000) return;

      let point = coordsRef.current;
      if (!point) {
        try {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          coordsRef.current = point;
          setCoords(point);
        } catch {
          return;
        }
      }

      lastHeartbeatAt.current = now;
      lastGpsSentAt.current = now;
      await reportLocationPoint(
        token,
        {
          lat: point.lat,
          lng: point.lng,
          timestamp: new Date().toISOString(),
        },
        activeOrderIdRef.current
      );
    };

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setError('Permiso de ubicación denegado.');
        return;
      }
      setPermissionDenied(false);

      const bgStarted = await startBackgroundLocation();
      if (!bgStarted && !cancelled) {
        setError('No se pudo activar el seguimiento en segundo plano.');
      }

      void flushLocationQueue();
      void runHeartbeat();

      heartbeatTimer = setInterval(() => {
        void runHeartbeat();
      }, GPS_HEARTBEAT_MS);

      try {
        const sub = await Location.watchPositionAsync(locationWatchOptions, (pos) => {
          if (cancelled) return;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const next = { lat, lng };
          coordsRef.current = next;
          setCoords(next);
          sendPoint(lat, lng, new Date(pos.timestamp).toISOString());
        });
        subRef.current = sub;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo acceder al GPS.');
      }
    })();

    return () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      subRef.current?.remove();
      subRef.current = null;
    };
  }, [token, enabled]);

  return { coords, permissionDenied, error };
}
