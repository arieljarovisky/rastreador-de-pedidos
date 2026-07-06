import * as Location from 'expo-location';

const SCAN_GPS_TIMEOUT_MS = 8_000;

/** Ubicación al escanear una etiqueta (null si no hay permiso, GPS lento o error). */
export async function getScanGeolocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== 'granted') return null;
    }

    const pos = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SCAN_GPS_TIMEOUT_MS)),
    ]);

    if (!pos) return null;
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}
