import { TextStyle, ViewStyle } from 'react-native';
import { OrderStatus } from './types';

/** Tokens alineados con frontend/src/theme/tokens.css */

export const fonts = {
  display: 'BricolageGrotesque_700Bold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  displayRegular: 'BricolageGrotesque_400Regular',
  body: 'IBMPlexSans_400Regular',
  bodyMedium: 'IBMPlexSans_500Medium',
  bodySemiBold: 'IBMPlexSans_600SemiBold',
  mono: 'SpaceMono_700Bold',
  monoRegular: 'SpaceMono_400Regular',
};

/** Tema oscuro — dashboards operativos (data-theme="dark") */
export const colors = {
  bg: '#0B0F18',
  surface: '#141A28',
  surfaceAlt: '#1A2336',
  border: '#283246',
  borderSoft: '#5C6986',
  text: '#E9EDF4',
  textMuted: '#8593AE',
  textFaint: '#5C6986',
  inputBg: '#1A2336',

  accent: '#5C87EB',
  accentBg: 'rgba(92, 135, 235, 0.12)',
  accentBorder: 'rgba(92, 135, 235, 0.28)',
  blue: '#5C87EB',
  purple: '#9B7EDE',
  stamp: '#E8431F',
  stampBg: 'rgba(232, 67, 31, 0.12)',
  amber: '#E69A2E',
  amberBg: 'rgba(230, 154, 46, 0.12)',
  green: '#3FAE63',
  greenBg: 'rgba(63, 174, 99, 0.12)',
  greenBorder: 'rgba(63, 174, 99, 0.28)',
  red: '#E5564F',
  redBg: 'rgba(229, 86, 79, 0.12)',
  pending: '#A99B85',
  pendingBg: 'rgba(169, 155, 133, 0.12)',
};

/** Tema papel — login y superficies tipo comprobante (data-theme="paper") */
export const paper = {
  bg: '#EFE7D8',
  panel: '#F6F0E4',
  panel2: '#E7DDCB',
  edge: '#D8CCB5',
  ink: '#1C1814',
  inkSoft: '#544A3C',
  muted: '#897C68',
  faint: '#A99B85',
  stamp: '#D8401E',
  accent: '#2B3A55',
  accentBg: 'rgba(43, 58, 85, 0.1)',
  ok: '#2E6B45',
  okBg: 'rgba(46, 107, 69, 0.12)',
  warn: '#B5670E',
  danger: '#B0301C',
  dangerBg: 'rgba(176, 48, 28, 0.1)',
  inputBg: '#EFE7D8',
  shadow: '#1C1814',
};

export const radius = {
  posta: 5,
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

export const typography = {
  monoLabel(color: string = colors.textMuted): TextStyle {
    return {
      fontFamily: fonts.mono,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color,
    };
  },
  displayTitle(size = 22, color: string = colors.text): TextStyle {
    return {
      fontFamily: fonts.display,
      fontSize: size,
      fontWeight: '700',
      letterSpacing: -0.4,
      color,
    };
  },
  displaySection(size = 14, color: string = colors.text): TextStyle {
    return {
      fontFamily: fonts.displaySemi,
      fontSize: size,
      fontWeight: '600',
      letterSpacing: -0.2,
      color,
    };
  },
  body(size = 14, color: string = colors.text): TextStyle {
    return {
      fontFamily: fonts.body,
      fontSize: size,
      letterSpacing: -0.15,
      color,
    };
  },
  bodyMedium(size = 14, color: string = colors.text): TextStyle {
    return {
      fontFamily: fonts.bodyMedium,
      fontSize: size,
      letterSpacing: -0.15,
      color,
    };
  },
  buttonLabel(color: string): TextStyle {
    return {
      fontFamily: fonts.mono,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.66,
      textTransform: 'uppercase',
      color,
    };
  },
};

export function surfaceCard(): ViewStyle {
  return {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.posta,
  };
}

export function paperCardShadow(): ViewStyle {
  return {
    shadowColor: paper.shadow,
    shadowOffset: { width: 4, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 0,
    elevation: 4,
  };
}

interface StatusStyle {
  label: string;
  fg: string;
  bg: string;
}

export function statusStyle(status: OrderStatus): StatusStyle {
  switch (status) {
    case OrderStatus.PENDING:
      return { label: 'En almacén', fg: colors.pending, bg: colors.pendingBg };
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
