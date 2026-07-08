import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.js';
import { env } from '../config/env.js';
import {
  isMercadoPagoOAuthConfigured,
  isPostaMercadoPagoConfigured,
  getMercadoPagoOAuthUrl,
  getMercadoPagoWebhookUrl,
} from '../services/mercadopago.service.js';
import {
  agencyMpStatusPublic,
  connectAgencyMercadoPago,
  disconnectAgencyMercadoPago,
  getAgencyMercadoPagoAccount,
} from '../services/agency-mercadopago.service.js';
import { processBillingPaymentWebhook } from '../services/billing-payment.service.js';
import { processSubscriptionPaymentWebhook } from '../services/subscriptions.service.js';

const router = Router();

type OAuthClient = 'web' | 'mobile';

interface MpOAuthState {
  agencyId: string;
  userId: string;
  client?: OAuthClient;
  redirectUri?: string;
  returnOrigin?: string;
}

function isAllowedReturnOrigin(origin: string): boolean {
  const normalized = origin.replace(/\/$/, '');
  const allowed = new Set([
    ...env.corsOrigins.map((value) => value.replace(/\/$/, '')),
    env.frontendUrl.replace(/\/$/, ''),
  ]);
  return allowed.has(normalized);
}

function resolveReturnOrigin(req: Request): string | undefined {
  const fromQuery =
    typeof req.query.return_origin === 'string' ? req.query.return_origin.trim() : '';
  const fromHeader = req.get('origin')?.trim() ?? '';
  const candidate = fromQuery || fromHeader;
  if (!candidate || !isAllowedReturnOrigin(candidate)) return undefined;
  return candidate.replace(/\/$/, '');
}

function signMpOAuthState(
  agencyId: string,
  userId: string,
  client: OAuthClient = 'web',
  redirectUri?: string,
  returnOrigin?: string
): string {
  return jwt.sign(
    { agencyId, userId, client, redirectUri, returnOrigin } satisfies MpOAuthState,
    env.jwtSecret,
    { expiresIn: '15m' }
  );
}

function verifyMpOAuthState(state: string): MpOAuthState {
  const payload = jwt.verify(state, env.jwtSecret) as MpOAuthState;
  if (!payload.agencyId || !payload.userId) throw new Error('INVALID_STATE');
  return payload;
}

function redirectToFrontend(
  status: 'connected' | 'error',
  message?: string,
  returnOrigin?: string
): string {
  const base =
    returnOrigin && isAllowedReturnOrigin(returnOrigin)
      ? returnOrigin.replace(/\/$/, '')
      : env.frontendUrl.replace(/\/$/, '');
  const params = new URLSearchParams({
    tab: 'settings',
    integration: 'mercadopago',
    status,
  });
  if (message) params.set('message', message);
  params.set('integration_scope', 'agency');
  return `${base}/app?${params}`;
}

function redirectToMobile(
  status: 'connected' | 'error',
  message?: string,
  redirectUri?: string
): string {
  const base = redirectUri?.trim() || `${env.mobileApp.scheme}://oauth/callback`;
  const params = new URLSearchParams({ integration: 'mercadopago', status });
  if (message) params.set('message', message);
  return `${base}?${params}`;
}

function parseOAuthClient(value: unknown): OAuthClient {
  return value === 'mobile' ? 'mobile' : 'web';
}

router.get('/status', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Sin agencia asociada.' });
    return;
  }
  const account = await getAgencyMercadoPagoAccount(req.user.agencyId);
  res.json({
    configured: isMercadoPagoOAuthConfigured(),
    connected: Boolean(account),
    webhookUrl: getMercadoPagoWebhookUrl(),
    account: agencyMpStatusPublic(account),
  });
});

router.get('/oauth/connect', authenticate, requireAgencyAdmin(), (req: Request, res: Response) => {
  if (!isMercadoPagoOAuthConfigured()) {
    res.status(503).json({
      error: 'Mercado Pago no está configurado (MP_CLIENT_ID, MP_CLIENT_SECRET).',
    });
    return;
  }
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Sin agencia asociada.' });
    return;
  }
  const client = parseOAuthClient(req.query.client);
  const redirectUri =
    client === 'mobile' && typeof req.query.redirect_uri === 'string'
      ? req.query.redirect_uri.trim()
      : undefined;
  const returnOrigin = resolveReturnOrigin(req);
  const state = signMpOAuthState(
    req.user.agencyId,
    req.user.id,
    client,
    redirectUri,
    returnOrigin
  );
  res.json({ url: getMercadoPagoOAuthUrl(state) });
});

router.get('/oauth/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  let client: OAuthClient = 'web';
  let mobileRedirectUri: string | undefined;
  let returnOrigin: string | undefined;

  if (typeof state === 'string') {
    try {
      const payload = verifyMpOAuthState(state);
      client = parseOAuthClient(payload.client);
      mobileRedirectUri = payload.redirectUri;
      returnOrigin = payload.returnOrigin;
    } catch {
      // state inválido
    }
  }

  const redirect =
    client === 'mobile'
      ? (s: 'connected' | 'error', m?: string) => redirectToMobile(s, m, mobileRedirectUri)
      : (s: 'connected' | 'error', m?: string) => redirectToFrontend(s, m, returnOrigin);

  if (error || !code || typeof code !== 'string' || !state || typeof state !== 'string') {
    res.redirect(redirect('error', 'Autorización cancelada'));
    return;
  }

  try {
    const payload = verifyMpOAuthState(state);
    client = parseOAuthClient(payload.client);
    mobileRedirectUri = payload.redirectUri;
    returnOrigin = payload.returnOrigin;
    await connectAgencyMercadoPago(payload.agencyId, code);
    res.redirect(redirect('connected'));
  } catch {
    res.redirect(redirect('error', 'No se pudo conectar Mercado Pago'));
  }
});

router.delete('/oauth', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Sin agencia asociada.' });
    return;
  }
  await disconnectAgencyMercadoPago(req.user.agencyId);
  res.status(204).end();
});

async function handleMercadoPagoPaymentWebhook(req: Request): Promise<void> {
  const topic = req.query.topic ?? req.body?.type;
  const paymentId = req.body?.data?.id ?? req.query['data.id'] ?? req.query.id;
  if (topic !== 'payment' && req.body?.type !== 'payment') return;
  if (!paymentId) return;

  try {
    await processSubscriptionPaymentWebhook(paymentId);
  } catch (err) {
    console.error('[mercadopago] subscription webhook error:', err);
  }
  try {
    await processBillingPaymentWebhook(paymentId);
  } catch (err) {
    console.error('[mercadopago] billing webhook error:', err);
  }
}

router.post('/webhooks', async (req: Request, res: Response) => {
  res.status(200).send('OK');
  void handleMercadoPagoPaymentWebhook(req);
});

/** Compatibilidad con URLs antiguas */
router.post('/webhooks/billing', async (req: Request, res: Response) => {
  res.status(200).send('OK');
  void handleMercadoPagoPaymentWebhook(req);
});

router.post('/webhooks/subscription', async (req: Request, res: Response) => {
  res.status(200).send('OK');
  void handleMercadoPagoPaymentWebhook(req);
});

router.get('/webhooks', (_req: Request, res: Response) => {
  res.json({
    webhookUrl: getMercadoPagoWebhookUrl(),
    postaConfigured: isPostaMercadoPagoConfigured(),
    oauthConfigured: isMercadoPagoOAuthConfigured(),
  });
});

export default router;
