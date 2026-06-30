import { User, UserLocation, UserRole } from '../types';

/** Actualiza la posición de flota de un repartidor (crea entrada mínima si falta). */
export function mergeRepartidorLocation(
  prev: User[],
  repartidorId: string,
  location: UserLocation,
  name?: string | null
): User[] {
  const idx = prev.findIndex((r) => r.id === repartidorId);
  if (idx === -1) {
    return [
      ...prev,
      {
        id: repartidorId,
        username: repartidorId,
        name: name?.trim() || 'Repartidor',
        role: UserRole.REPARTIDOR,
        currentLocation: location,
      },
    ];
  }
  return prev.map((rep) =>
    rep.id === repartidorId
      ? { ...rep, name: name?.trim() || rep.name, currentLocation: location }
      : rep
  );
}
