import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { api } from '../api';
import { GPS_THROTTLE_MS } from '../config';

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
 * Sigue la posición del dispositivo y, si hay un pedido en viaje
 * (activeOrderId), reporta el GPS al backend con el mismo throttle que la web.
 * Si no hay pedido en viaje pero sí token, reporta la ubicación general.
 */
export function useLocationReporter(
  token: string | null,
  activeOrderId: string | null,
  enabled: boolean
): UseLocationReporterResult {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSentAt = useRef(0);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!enabled || !token) {
      subRef.current?.remove();
      subRef.current = null;
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

      try {
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 8, // metros
            timeInterval: 3000,
          },
          (pos) => {
            if (cancelled) return;
            const next = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            };
            setCoords(next);

            const now = Date.now();
            if (now - lastSentAt.current < GPS_THROTTLE_MS) return;
            lastSentAt.current = now;

            if (activeOrderId) {
              api
                .reportOrderLocation(token, activeOrderId, next.lat, next.lng)
                .catch(() => {});
            } else {
              api.reportUserLocation(token, next.lat, next.lng).catch(() => {});
            }
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
