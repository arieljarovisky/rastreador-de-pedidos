import { randomInt } from 'crypto';
import { env } from '../config/env.js';

/** Alfabeto sin 0/O/1/I para leer bien en voz alta / WhatsApp. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Código público de seguimiento Posta (pedidos que no son Mercado Libre).
 * Formato: PST + 8 caracteres → ej. PST4K8M2N9Q
 */
export function generatePublicTrackingCode(): string {
  let body = '';
  for (let i = 0; i < 8; i += 1) {
    body += ALPHABET[randomInt(ALPHABET.length)]!;
  }
  // Garantiza al menos un dígito (validación del endpoint público).
  if (!/\d/.test(body)) {
    const digitPos = randomInt(8);
    body =
      body.slice(0, digitPos) +
      ALPHABET[randomInt(8)]! + // 0..7 del alfabeto son dígitos 2-9
      body.slice(digitPos + 1);
  }
  return `PST${body}`;
}

export function buildPublicTrackingUrl(code: string): string {
  const base = env.frontendUrl.replace(/\/$/, '');
  return `${base}/seguimiento?ref=${encodeURIComponent(code)}`;
}

export function normalizePublicTrackingCode(raw: string): string {
  return raw.trim().replace(/^#/, '').toUpperCase();
}

export function looksLikePublicTrackingCode(raw: string): boolean {
  return /^PST[2-9A-HJ-NP-Z]{8}$/i.test(raw.trim().replace(/^#/, ''));
}
