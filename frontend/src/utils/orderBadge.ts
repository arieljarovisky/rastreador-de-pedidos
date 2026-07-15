import { Order, OrderStatus } from '../types.js';

/** Badge de excepción ML (ausente / reprogramado) sobre el estado operativo. */
export function getOrderExceptionBadge(order: Order): { label: string; tone: 'warn' } | null {
  if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
    return null;
  }

  const sub = (order.mlShipmentSubstatus ?? '').trim().toLowerCase();
  if (sub === 'receiver_absent') return { label: 'Ausente', tone: 'warn' };
  if (sub === 'to_be_agreed') return { label: 'Reprogramado', tone: 'warn' };
  if (sub === 'bad_address' || sub === 'incorrect_address') {
    return { label: 'Dir. incorrecta', tone: 'warn' };
  }
  if (sub === 'rejected_by_receiver') return { label: 'Rechazado', tone: 'warn' };
  if (sub === 'delivery_failed' || sub === 'buyer_not_found' || sub === 'not_accessible') {
    return { label: 'Reprogramado', tone: 'warn' };
  }

  // Fallback para pedidos ya sincronizados antes de persistir ml_shipment_substatus
  const lastAbsent = [...order.history]
    .reverse()
    .find((e) => /ausente/i.test(e.comment ?? ''));
  if (lastAbsent) return { label: 'Ausente', tone: 'warn' };

  const lastReschedule = [...order.history]
    .reverse()
    .find((e) => /reprogramad/i.test(e.comment ?? ''));
  if (lastReschedule) return { label: 'Reprogramado', tone: 'warn' };

  return null;
}
