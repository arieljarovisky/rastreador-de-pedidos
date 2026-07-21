/**
 * Subestados ML que implican reintento otro día
 * (p. ej. “Envío reprogramado por el comprador” → buyer_rescheduled).
 */
export const ML_RESCHEDULE_SUBSTATUS_LIST = [
  'receiver_absent',
  'to_be_agreed',
  'buyer_rescheduled',
  'bad_address',
  'incorrect_address',
  'buyer_not_found',
  'delivery_failed',
  'rejected_by_receiver',
  'not_accessible',
  'dangerous_area',
] as const;

const ML_RESCHEDULE_SUBSTATUSES = new Set<string>(ML_RESCHEDULE_SUBSTATUS_LIST);

export function isMlRescheduleSubstatus(substatus?: string | null): boolean {
  const sub = (substatus ?? '').trim().toLowerCase();
  return Boolean(sub && ML_RESCHEDULE_SUBSTATUSES.has(sub));
}
