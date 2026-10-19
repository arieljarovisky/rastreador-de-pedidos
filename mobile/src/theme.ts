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

/** Tema oscuro — dashboards operativos */
export const colors = {
  bg: '#1c1814',
  surface: '#26211c',
  surfaceAlt: '#312b24',
  border: '#413930',
  borderSoft: '#6e6a63',
  text: '#f3f0e8',
  textMuted: '#a39e94',
  textFaint: '#6e6a63',
  inputBg: '#312b24',

  accent: '#ff5a2a',
  accentBg: 'rgba(255, 90, 42, 0.14)',
  accentBorder: 'rgba(255, 90, 42, 0.35)',
  blue: '#ff5a2a',
  purple: '#9aa3b5',
  stamp: '#f3f0e8',
  ctaInk: '#12141a',
  stampBg: 'rgba(243, 240, 232, 0.08)',
  ember: '#ff5a2a',
  amber: '#e6b15a',
  amberBg: 'rgba(230, 177, 90, 0.14)',
  green: '#7dcea0',
  greenBg: 'rgba(125, 206, 160, 0.14)',
  greenBorder: 'rgba(125, 206, 160, 0.35)',
  red: '#e07a72',
  redBg: 'rgba(224, 122, 114, 0.14)',
  pending: '#8d887f',
  pendingBg: 'rgba(141, 136, 127, 0.14)',
};

/** Tema claro — login */
export const paper = {
  bg: '#f3f0e8',
  panel: '#faf8f4',
  panel2: '#ebe6dc',
  edge: '#ddd6c8',
  ink: '#1a1714',
  inkSoft: '#4a453d',
  muted: '#4a453d',
  faint: '#6d675e',
  stamp: '#1a1714',
  ctaInk: '#f6f1e6',
  accent: '#e23b16',
  accentBg: 'rgba(226, 59, 22, 0.1)',
  ok: '#2f6b45',
  okBg: 'rgba(47, 107, 69, 0.12)',
  warn: '#9a6410',
  danger: '#a33b32',
  dangerBg: 'rgba(163, 59, 50, 0.1)',
  inputBg: '#faf8f4',
  shadow: '#1a1714',
  ember: '#e23b16',
};

/**
 * Tema del panel de agencia — alineado con prototipo-panel-agencia.html
 */
export type AgencyPalette = {
  ink: string;
  ink2: string;
  ink3: string;
  paper: string;
  card: string;
  line: string;
  line2: string;
  sello: string;
  selloBg: string;
  verde: string;
  verdeBg: string;
  ambar: string;
  ambarBg: string;
  rojo: string;
  rojoBg: string;
  flat: string;
  barTrack: string;
  alertCalmBody: string;
  alertBody: string;
  markText: string;
  chipOnText: string;
  r: number;
};

export type ThemeMode = 'light' | 'dark';

export const agencyLight: AgencyPalette = {
  ink: '#1a1714',
  ink2: '#4a453d',
  ink3: '#6d675e',
  paper: '#f3f0e8',
  card: '#faf8f4',
  line: '#ddd6c8',
  line2: '#cfc6b6',
  sello: '#e23b16',
  selloBg: 'rgba(226, 59, 22, 0.1)',
  verde: '#2f6b45',
  verdeBg: 'rgba(47, 107, 69, 0.12)',
  ambar: '#9a6410',
  ambarBg: 'rgba(154, 100, 16, 0.12)',
  rojo: '#a33b32',
  rojoBg: 'rgba(163, 59, 50, 0.1)',
  flat: '#ebe6dc',
  barTrack: '#ddd6c8',
  alertCalmBody: '#2f6b45',
  alertBody: '#a33b32',
  markText: '#f6f1e6',
  chipOnText: '#f6f1e6',
  r: 12,
};

/** Oscuro operativo — alineado a tokens Posta (`colors`) */
export const agencyDark: AgencyPalette = {
  ink: '#f3f0e8',
  ink2: '#a39e94',
  ink3: '#6e6a63',
  paper: '#1c1814',
  card: '#26211c',
  line: '#413930',
  line2: '#524839',
  sello: '#ff5a2a',
  selloBg: 'rgba(255, 90, 42, 0.14)',
  verde: '#7dcea0',
  verdeBg: 'rgba(125, 206, 160, 0.14)',
  ambar: '#e6b15a',
  ambarBg: 'rgba(230, 177, 90, 0.14)',
  rojo: '#e07a72',
  rojoBg: 'rgba(224, 122, 114, 0.14)',
  flat: '#312b24',
  barTrack: '#413930',
  alertCalmBody: '#7dcea0',
  alertBody: '#e07a72',
  markText: '#12141a',
  chipOnText: '#12141a',
  r: 12,
};

/** @deprecated Preferí useTheme().palette — alias del modo claro */
export const agency = agencyLight;

export function agencyPaletteFor(mode: ThemeMode): AgencyPalette {
  return mode === 'dark' ? agencyDark : agencyLight;
}

export const radius = {
  posta: 12,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

/** Acentos por rol — coherencia visual entre tabs, headers y CTAs */
export const roleAccents = {
  repartidor: colors.accent,
  seller: colors.accent,
  agency: colors.accent,
} as const;

export const touchTarget = 44;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
  fab: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 10,
    elevation: 12,
  },
};

export const typography = {
  monoLabel(color: string = colors.textMuted): TextStyle {
    return {
      fontFamily: fonts.bodyMedium,
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 0.6,
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
      fontFamily: fonts.bodyMedium,
      fontSize: 15,
      fontWeight: '500',
      letterSpacing: -0.2,
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
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
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
