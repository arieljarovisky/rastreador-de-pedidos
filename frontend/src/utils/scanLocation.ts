/**
 * Obtiene la ubicación GPS del dispositivo al escanear una etiqueta.
 * Devuelve null si el usuario deniega permisos o el GPS no está disponible.
 */
export async function getScanGeolocation(): Promise<{ lat: number; lng: number } | null> {
  if (!('geolocation' in navigator)) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 }
    );
  });
}
