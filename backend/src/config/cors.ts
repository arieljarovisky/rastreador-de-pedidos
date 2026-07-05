import { Request, Response } from 'express';
import { env } from './env.js';

export function isAllowedCorsOrigin(origin: string): boolean {
  if (env.corsOrigins.includes(origin)) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'https:') return false;
    if (hostname === 'enviosposta.com.ar' || hostname.endsWith('.enviosposta.com.ar')) {
      return true;
    }
    return hostname.endsWith('.vercel.app') && hostname.startsWith('rastreador-de-pedidos');
  } catch {
    return false;
  }
}

/** Aplica headers CORS si el Origin está permitido. Devuelve true si se aplicaron. */
export function applyCorsHeaders(req: Request, res: Response): boolean {
  const origin = req.headers.origin;
  if (!origin || !isAllowedCorsOrigin(origin)) {
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  return true;
}

export const corsMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] as const;
