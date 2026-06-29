import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { setActiveOrderId } from '../location/locationQueue';
import { flushLocationQueue, startLocationSyncListeners } from '../location/locationSync';
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from '../location/backgroundLocationTask';

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
 * Encola puntos sin conexión y los sincroniza al volver internet.
 * Mantiene el seguimiento en segundo plano con expo-task-manager.
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

      try {
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 8,
            timeInterval: 3000,
          },
          (pos) => {
            if (cancelled) return;
            setCoords({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
          }
        );
        subRef.current = sub;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo acceder al GPS.');
      }
    })();

    return () => {
      cancelled = true;
      subRef.current?.remove();
      subRef.current = null;
    };
  }, [token, activeOrderId, enabled]);

  return { coords, permissionDenied, error };
}
