import { OrderStatus } from '../../types.js';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'En almacén',
  [OrderStatus.ASSIGNED]: 'Asignado',
  [OrderStatus.DELIVERING]: 'En viaje',
  [OrderStatus.DELIVERED]: 'Entregado',
  [OrderStatus.CANCELLED]: 'Cancelado',
};

const LABELS = ORDER_STATUS_LABELS;

interface StatusBadgeProps {
  status: OrderStatus;
  /** Activa mix-blend-mode:multiply (tema papel) */
  paper?: boolean;
  className?: string;
  label?: string;
  /** 'warn' pinta excepciones (ausente / reprogramado) sin cambiar el status real. */
  tone?: 'warn';
}

export default function StatusBadge({
  status,
  paper = false,
  className = '',
  label,
  tone,
}: StatusBadgeProps) {
  return (
    <span
      className={`status-badge ${paper ? 'status-badge--paper' : ''} ${className}`.trim()}
      data-status={tone === 'warn' ? 'warn' : status}
    >
      {label ?? LABELS[status]}
    </span>
  );
}
