import { env } from '../config/env.js';

const MP_API = 'https://api.mercadopago.com';
const MP_AUTH = 'https://auth.mercadopago.com.ar';

export interface MpTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number;
  public_key?: string;
}

export interface MpPreference {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
}

export interface MpPayment {
  id: number;
  status: string;
  status_detail: string;
  transaction_amount: number;
  external_reference?: string;
}

export function isMercadoPagoOAuthConfigured(): boolean {
  return Boolean(env.mercadopago.clientId && env.mercadopago.clientSecret);
}

export function isPostaMercadoPagoConfigured(): boolean {
  return Boolean(env.mercadopago.postaAccessToken);
}

export function getMercadoPagoOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.mercadopago.clientId,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: env.mercadopago.redirectUri,
  });
  return `${MP_AUTH}/authorization?${params}`;
}

export async function exchangeMercadoPagoCode(code: string): Promise<MpTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.mercadopago.clientId,
    client_secret: env.mercadopago.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.mercadopago.redirectUri,
  });
  const res = await fetch(`${MP_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[mercadopago] OAuth exchange failed:', err);
    throw new Error('MP_OAUTH_FAILED');
  }
  return (await res.json()) as MpTokenResponse;
}

export async function refreshMercadoPagoToken(refreshToken: string): Promise<MpTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.mercadopago.clientId,
    client_secret: env.mercadopago.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch(`${MP_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!res.ok) throw new Error('MP_REFRESH_FAILED');
  return (await res.json()) as MpTokenResponse;
}

export async function createCheckoutPreference(
  accessToken: string,
  options: {
    title: string;
    amount: number;
    externalReference: string;
    notificationUrl: string;
    backUrls: { success: string; failure: string; pending: string };
    payerEmail?: string;
  }
): Promise<MpPreference> {
  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [
        {
          title: options.title,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: options.amount,
        },
      ],
      external_reference: options.externalReference,
      notification_url: options.notificationUrl,
      back_urls: options.backUrls,
      auto_return: 'approved',
      payer: options.payerEmail ? { email: options.payerEmail } : undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[mercadopago] Preference failed:', err);
    throw new Error('MP_PREFERENCE_FAILED');
  }
  return (await res.json()) as MpPreference;
}

export async function getMercadoPagoPayment(
  paymentId: string | number,
  accessToken: string
): Promise<MpPayment> {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('MP_PAYMENT_NOT_FOUND');
  return (await res.json()) as MpPayment;
}

/** URL única para el panel de MP (suscripciones + pagos de vendedores). */
export function getMercadoPagoWebhookUrl(): string {
  return `${env.publicUrl}/api/mercadopago/webhooks`;
}

/** @deprecated Usar getMercadoPagoWebhookUrl */
export function getBillingWebhookUrl(): string {
  return getMercadoPagoWebhookUrl();
}

/** @deprecated Usar getMercadoPagoWebhookUrl */
export function getSubscriptionWebhookUrl(): string {
  return getMercadoPagoWebhookUrl();
}
