import { OrderStatus } from '../../types.js';

const LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'En almacén',
  [OrderStatus.ASSIGNED]: 'Asignado',
  [OrderStatus.DELIVERING]: 'En viaje',
  [OrderStatus.DELIVERED]: 'Entregado',
  [OrderStatus.CANCELLED]: 'Cancelado',
};

interface StatusBadgeProps {
  status: OrderStatus;
  /** Activa mix-blend-mode:multiply (tema papel) */
  paper?: boolean;
  className?: string;
  label?: string;
}

export default function StatusBadge({ status, paper = false, className = '', label }: StatusBadgeProps) {
  return (
    <span
      className={`status-badge ${paper ? 'status-badge--paper' : ''} ${className}`.trim()}
      data-status={status}
    >
      {label ?? LABELS[status]}
    </span>
  );
}
