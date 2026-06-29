import { OrderStatus } from './types';

/** Paleta oscura operativa Posta — alineada con la PWA web. */
export const colors = {
  bg: '#0B0F18',
  surface: '#141A28',
  surfaceAlt: '#1A2336',
  border: '#283246',
  borderSoft: '#5C6986',
  text: '#E9EDF4',
  textMuted: '#8593AE',
  textFaint: '#5C6986',

  accent: '#5C87EB',
  accentBg: 'rgba(92, 135, 235, 0.12)',
  stamp: '#E8431F',
  stampBg: 'rgba(232, 67, 31, 0.12)',
  amber: '#E69A2E',
  amberBg: 'rgba(230, 154, 46, 0.12)',
  green: '#3FAE63',
  greenBg: 'rgba(63, 174, 99, 0.12)',
  red: '#E5564F',
  redBg: 'rgba(229, 86, 79, 0.12)',
  pending: '#A99B85',
  pendingBg: 'rgba(169, 155, 133, 0.12)',
};

export const radius = {
  sm: 4,
  md: 5,
  lg: 8,
  xl: 12,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

interface StatusStyle {
  label: string;
  fg: string;
  bg: string;
}

export function statusStyle(status: OrderStatus): StatusStyle {
  switch (status) {
    case OrderStatus.PENDING:
      return { label: 'Pendiente', fg: colors.pending, bg: colors.pendingBg };
    case OrderStatus.ASSIGNED:
      return { label: 'Asignado', fg: colors.accent, bg: colors.accentBg };
    case OrderStatus.DELIVERING:
      return { label: 'En viaje', fg: colors.amber, bg: colors.amberBg };
    case OrderStatus.DELIVERED:
      return { label: 'Entregado', fg: colors.green, bg: colors.greenBg };
    case OrderStatus.CANCELLED:
      return { label: 'Cancelado', fg: colors.red, bg: colors.redBg };
    default:
      return { label: status, fg: colors.textMuted, bg: colors.surfaceAlt };
  }
}
