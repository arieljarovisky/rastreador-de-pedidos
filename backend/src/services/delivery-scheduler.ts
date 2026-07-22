import {
  getArHourMinute,
  getOperationalDateKey,
} from '../utils/delivery-deadline.js';
import {
  sendDeadlineMissedAlerts,
  sendDeadlineUrgentAlerts,
  sendDeadlineWarnings,
} from './delivery-dashboard.service.js';

/** Evita reenviar el mismo tipo de aviso el mismo día (a nivel proceso). */
const sentKeys = new Set<string>();

function markSent(kind: string, dateKey: string, hour: number): boolean {
  const key = `${kind}:${dateKey}:${hour}`;
  if (sentKeys.has(key)) return false;
  sentKeys.add(key);
  return true;
}

function pruneOldKeys(dateKey: string): void {
  for (const key of [...sentKeys]) {
    if (!key.includes(`:${dateKey}:`)) {
      sentKeys.delete(key);
    }
  }
}

async function tick(): Promise<void> {
  const dateKey = getOperationalDateKey();
  const { hour, minute } = getArHourMinute();
  if (minute !== 0) return;

  pruneOldKeys(dateKey);

  // Cada hora se evalúan agencias y vendedores; cada uno usa su propio corte.
  if (markSent('warning', dateKey, hour)) {
    try {
      await sendDeadlineWarnings(dateKey, undefined, hour);
      console.log(`[delivery-scheduler] Avisos de corte evaluados (${dateKey} ${hour}:00)`);
    } catch (err) {
      console.error('[delivery-scheduler] Error enviando avisos:', err);
    }
  }

  if (markSent('urgent', dateKey, hour)) {
    try {
      await sendDeadlineUrgentAlerts(dateKey, undefined, hour);
      console.log(`[delivery-scheduler] Avisos urgentes evaluados (${dateKey} ${hour}:00)`);
    } catch (err) {
      console.error('[delivery-scheduler] Error enviando avisos urgentes:', err);
    }
  }

  if (markSent('missed', dateKey, hour)) {
    try {
      await sendDeadlineMissedAlerts(dateKey, undefined, hour);
      console.log(`[delivery-scheduler] Alertas de corte evaluadas (${dateKey} ${hour}:00)`);
    } catch (err) {
      console.error('[delivery-scheduler] Error enviando alertas de corte:', err);
    }
  }
}

export function startDeliveryScheduler(): void {
  void tick();
  setInterval(() => {
    void tick();
  }, 60_000);
  console.log(
    '[delivery-scheduler] Programador de corte activo (avisos por vendedor/agencia: -3h, -1h y hora de corte)'
  );
}
