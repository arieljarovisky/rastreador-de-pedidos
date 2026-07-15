import {
  getArHourMinute,
  getOperationalDateKey,
} from '../utils/delivery-deadline.js';
import {
  sendDeadlineMissedAlerts,
  sendDeadlineUrgentAlerts,
  sendDeadlineWarnings,
} from './delivery-dashboard.service.js';
import { listAgenciesDeadlineHours } from './agencies.service.js';

/** Evita reenviar el mismo aviso a la misma agencia el mismo día. */
const sentKeys = new Set<string>();

function markSent(kind: string, agencyId: string, dateKey: string): boolean {
  const key = `${kind}:${agencyId}:${dateKey}`;
  if (sentKeys.has(key)) return false;
  sentKeys.add(key);
  return true;
}

function pruneOldKeys(dateKey: string): void {
  for (const key of [...sentKeys]) {
    if (!key.endsWith(`:${dateKey}`)) {
      sentKeys.delete(key);
    }
  }
}

async function tick(): Promise<void> {
  const dateKey = getOperationalDateKey();
  const { hour, minute } = getArHourMinute();
  if (minute !== 0) return;

  pruneOldKeys(dateKey);

  const agencies = await listAgenciesDeadlineHours();
  const warningAgencyIds: string[] = [];
  const urgentAgencyIds: string[] = [];
  const missedAgencyIds: string[] = [];

  for (const agency of agencies) {
    const deadlineHour = agency.deliveryDeadlineHour;
    const warningHour = Math.max(0, deadlineHour - 3);
    const urgentHour = Math.max(0, deadlineHour - 1);

    if (hour === warningHour && markSent('warning', agency.id, dateKey)) {
      warningAgencyIds.push(agency.id);
    }
    if (hour === urgentHour && markSent('urgent', agency.id, dateKey)) {
      urgentAgencyIds.push(agency.id);
    }
    if (hour === deadlineHour && markSent('missed', agency.id, dateKey)) {
      missedAgencyIds.push(agency.id);
    }
  }

  if (warningAgencyIds.length > 0) {
    try {
      await sendDeadlineWarnings(dateKey, warningAgencyIds);
      console.log(
        `[delivery-scheduler] Avisos de corte enviados (${dateKey}) agencias=${warningAgencyIds.length}`
      );
    } catch (err) {
      console.error('[delivery-scheduler] Error enviando avisos:', err);
    }
  }

  if (urgentAgencyIds.length > 0) {
    try {
      await sendDeadlineUrgentAlerts(dateKey, urgentAgencyIds);
      console.log(
        `[delivery-scheduler] Avisos urgentes enviados (${dateKey}) agencias=${urgentAgencyIds.length}`
      );
    } catch (err) {
      console.error('[delivery-scheduler] Error enviando avisos urgentes:', err);
    }
  }

  if (missedAgencyIds.length > 0) {
    try {
      await sendDeadlineMissedAlerts(dateKey, missedAgencyIds);
      console.log(
        `[delivery-scheduler] Alertas de corte enviadas (${dateKey}) agencias=${missedAgencyIds.length}`
      );
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
    '[delivery-scheduler] Programador de corte activo (avisos por agencia: -3h, -1h y hora de corte)'
  );
}
