/**
 * Colores Posta para uso en JS (Leaflet, canvas, etc.)
 */
import type { PostaTheme } from './usePostaTheme.ts';

export const POSTA_MAP_DARK = {
  route: '#5C87EB',
  destination: '#E8431F',
  departure: '#5C87EB',
  departureRing: 'rgba(92, 135, 235, 0.25)',
  pickup: '#3FAE63',
} as const;

export const POSTA_MAP_PAPER = {
  route: '#2B3A55',
  destination: '#D8401E',
  departure: '#2B3A55',
  departureRing: 'rgba(43, 58, 85, 0.2)',
  pickup: '#2E6B45',
} as const;

export const POSTA_STATUS_DARK = {
  pending: '#A99B85',
  assigned: '#5C87EB',
  delivering: '#E69A2E',
  delivered: '#3FAE63',
  cancelled: '#E5564F',
} as const;

export const POSTA_STATUS_PAPER = {
  pending: '#7A6E59',
  assigned: '#2B3A55',
  delivering: '#B5670E',
  delivered: '#2E6B45',
  cancelled: '#B0301C',
} as const;

/** @deprecated usar getPostaMapColors */
export const POSTA_MAP = POSTA_MAP_DARK;
/** @deprecated usar getPostaStatusColors */
export const POSTA_STATUS_COLORS = POSTA_STATUS_DARK;

export function getPostaMapColors(theme: PostaTheme) {
  return theme === 'paper' ? POSTA_MAP_PAPER : POSTA_MAP_DARK;
}

export function getPostaStatusColors(theme: PostaTheme) {
  return theme === 'paper' ? POSTA_STATUS_PAPER : POSTA_STATUS_DARK;
}

export const MAP_TILE_URLS: Record<PostaTheme, string> = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  paper: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
};
