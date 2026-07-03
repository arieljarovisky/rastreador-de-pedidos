import {
  getArHourMinute,
  getOperationalDateKey,
} from '../utils/delivery-deadline.js';
import {
  sendDeadlineMissedAlerts,
  sendDeadlineUrgentAlerts,
  sendDeadlineWarnings,
} from './delivery-dashboard.service.js';

const WARNING_HOUR = 18;
const URGENT_HOUR = 20;
const MISSED_HOUR = 21;

let lastWarningDate: string | null = null;
let lastUrgentDate: string | null = null;
let lastMissedDate: string | null = null;

async function tick(): Promise<void> {
  const dateKey = getOperationalDateKey();
  const { hour, minute } = getArHourMinute();

  if (hour === WARNING_HOUR && minute === 0 && lastWarningDate !== dateKey) {
    lastWarningDate = dateKey;
    try {
      await sendDeadlineWarnings(dateKey);
      console.log(`[delivery-scheduler] Avisos de corte enviados (${dateKey})`);
    } catch (err) {
      console.error('[delivery-scheduler] Error enviando avisos:', err);
    }
  }

  if (hour === URGENT_HOUR && minute === 0 && lastUrgentDate !== dateKey) {
    lastUrgentDate = dateKey;
    try {
      await sendDeadlineUrgentAlerts(dateKey);
      console.log(`[delivery-scheduler] Avisos urgentes (20:00) enviados (${dateKey})`);
    } catch (err) {
      console.error('[delivery-scheduler] Error enviando avisos urgentes:', err);
    }
  }

  if (hour === MISSED_HOUR && minute === 0 && lastMissedDate !== dateKey) {
    lastMissedDate = dateKey;
    try {
      await sendDeadlineMissedAlerts(dateKey);
      console.log(`[delivery-scheduler] Alertas de corte enviadas (${dateKey})`);
    } catch (err) {
      console.error('[delivery-scheduler] Error enviando alertas de corte:', err);
    }
  }

  if (hour === 0 && minute === 0) {
    if (lastWarningDate !== dateKey) lastWarningDate = null;
    if (lastUrgentDate !== dateKey) lastUrgentDate = null;
    if (lastMissedDate !== dateKey) lastMissedDate = null;
  }
}

export function startDeliveryScheduler(): void {
  void tick();
  setInterval(() => {
    void tick();
  }, 60_000);
  console.log('[delivery-scheduler] Programador de corte 21:00 activo (avisos 18:00, 20:00 y 21:00)');
}
