/**
 * Colores Posta para uso en JS (Leaflet, canvas, etc.)
 */
import type { PostaTheme } from './usePostaTheme.ts';

export const POSTA_MAP_DARK = {
  route: '#FF5A2A',
  destination: '#FF5A2A',
  departure: '#FF5A2A',
  departureRing: 'rgba(255, 90, 42, 0.25)',
  pickup: '#9AA3B5',
} as const;

export const POSTA_MAP_PAPER = {
  route: '#E23B16',
  destination: '#E23B16',
  departure: '#E23B16',
  departureRing: 'rgba(226, 59, 22, 0.2)',
  pickup: '#6D675E',
} as const;

export const POSTA_STATUS_DARK = {
  pending: '#8D887F',
  assigned: '#FF5A2A',
  delivering: '#E6B15A',
  delivered: '#7DCEA0',
  cancelled: '#E07A72',
} as const;

export const POSTA_STATUS_PAPER = {
  pending: '#6D675E',
  assigned: '#E23B16',
  delivering: '#9A6410',
  delivered: '#2F6B45',
  cancelled: '#A33B32',
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

function withCartoKey(url: string): string {
  const key = import.meta.env.VITE_CARTO_API_KEY?.trim();
  return key ? `${url}?key=${encodeURIComponent(key)}` : url;
}

/** PNG 1x (sin {r}): los tiles retina pesan ~4× y traban el pan/zoom. */
export const MAP_TILE_URLS: Record<PostaTheme, string> = {
  dark: withCartoKey('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'),
  paper: withCartoKey(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  ),
};

/** Pedir tiles al soltar el gesto, no en cada frame del zoom. */
export const CARTO_TILE_OPTIONS = {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
  updateWhenIdle: true,
  updateWhenZooming: false,
  keepBuffer: 4,
} as const;
