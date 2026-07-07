const STALE_MS = 90_000;
const SEC_PER_DAY = 86_400;

export function isStaleLocation(timestamp?: string | null): boolean {
  if (!timestamp) return true;
  const at = new Date(timestamp).getTime();
  if (Number.isNaN(at)) return true;
  return Date.now() - at > STALE_MS;
}

export function formatLastReport(timestamp?: string | null): string {
  if (!timestamp) return 'Sin reportes GPS';
  const at = new Date(timestamp).getTime();
  if (Number.isNaN(at)) return 'Sin reportes GPS';

  const diffSec = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (diffSec < 10) return 'Ahora mismo';
  if (diffSec < 60) return `Hace ${diffSec} s`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;

  const diffDays = Math.floor(diffSec / SEC_PER_DAY);
  if (diffDays > 7) {
    return new Date(timestamp).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
  if (diffDays >= 1) {
    return diffDays === 1 ? 'Hace 1 día' : `Hace ${diffDays} días`;
  }

  const diffHr = Math.floor(diffMin / 60);
  return `Hace ${diffHr} h`;
}
