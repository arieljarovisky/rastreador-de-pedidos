import { env } from '../config/env.js';

export interface GoogleIdentity {
  googleId: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export function isGoogleAuthEnabled(): boolean {
  return Boolean(env.googleAuth.clientId);
}

/**
 * Verifica un ID token de Google Identity Services.
 * Usa el endpoint tokeninfo de Google (sin dependencia extra).
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const clientId = env.googleAuth.clientId;
  if (!clientId) {
    throw new Error('GOOGLE_AUTH_NOT_CONFIGURED');
  }

  const token = idToken.trim();
  if (!token) {
    throw new Error('INVALID_GOOGLE_TOKEN');
  }

  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
  );
  if (!res.ok) {
    throw new Error('INVALID_GOOGLE_TOKEN');
  }

  const payload = (await res.json()) as {
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    exp?: string;
  };

  if (!payload.aud || payload.aud !== clientId) {
    throw new Error('INVALID_GOOGLE_TOKEN');
  }
  if (!payload.sub || !payload.email) {
    throw new Error('INVALID_GOOGLE_TOKEN');
  }

  const emailVerified =
    payload.email_verified === true ||
    payload.email_verified === 'true';
  if (!emailVerified) {
    throw new Error('GOOGLE_EMAIL_NOT_VERIFIED');
  }

  if (payload.exp) {
    const expSec = Number(payload.exp);
    if (Number.isFinite(expSec) && expSec * 1000 < Date.now()) {
      throw new Error('INVALID_GOOGLE_TOKEN');
    }
  }

  return {
    googleId: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: (payload.name || '').trim(),
    emailVerified: true,
  };
}
