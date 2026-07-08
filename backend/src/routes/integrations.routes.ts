import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, requireRoles, requireAgencyAdmin } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import { AGENCY_ADMIN_ROLES } from '../utils/roles.js';
import { env } from '../config/env.js';
import {
  deleteIntegration,
  getAgencyMercadoLibreIntegration,
  getIntegration,
  integrationStatusPublic,
  listIntegrationsForUser,
  type IntegrationPlatform,
} from '../services/integrations.service.js';
import {
  exchangeMercadoLibreCode,
  getMercadoLibreAuthUrl,
  isMercadoLibreConfigured,
} from '../services/mercadolibre.service.js';
import {
  exchangeTiendaNubeCode,
  getTiendaNubeAuthUrl,
  isTiendaNubeConfigured,
} from '../services/tiendanube.service.js';
import {
  importMarketplaceShipments,
  importAgencyMarketplaceShipments,
  listAgencyImportableShipments,
  listImportableShipments,
} from '../services/marketplace-import.service.js';
import { parseTiendaNubeDateRange } from '../services/tiendanube.service.js';
import {
  getMercadoLibreWebhookUrl,
  ML_WEBHOOK_TOPICS,
  processMercadoLibreNotification,
  replayMercadoLibreMissedFeeds,
  type MercadoLibreNotificationPayload,
} from '../services/mercadolibre-webhook.service.js';
import {
  getTiendaNubePrivacyWebhookUrls,
  processTiendaNubeCustomerDataRequest,
  processTiendaNubeCustomerRedact,
  processTiendaNubeStoreRedact,
  type TiendaNubeCustomerDataRequestPayload,
  type TiendaNubeCustomerRedactPayload,
  type TiendaNubeStoreRedactPayload,
} from '../services/tiendanube-privacy.service.js';
import { ensureAgencyMlBridgeUser } from '../services/agency-ml.service.js';

const router = Router();

type OAuthClient = 'web' | 'mobile';

interface OAuthStatePayload {
  userId: string;
  platform: IntegrationPlatform;
  client?: OAuthClient;
  redirectUri?: string;
  returnOrigin?: string;
  integrationScope?: 'agency';
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

function signOAuthState(
  userId: string,
  platform: IntegrationPlatform,
  client: OAuthClient = 'web',
  redirectUri?: string,
  returnOrigin?: string,
  integrationScope?: 'agency'
): string {
  return jwt.sign(
    { userId, platform, client, redirectUri, returnOrigin, integrationScope } satisfies OAuthStatePayload,
    env.jwtSecret,
    { expiresIn: '15m' }
  );
}

function verifyOAuthState(state: string): OAuthStatePayload {
  const payload = jwt.verify(state, env.jwtSecret) as OAuthStatePayload;
  if (!payload.userId || !payload.platform) throw new Error('INVALID_STATE');
  return payload;
}

function redirectToFrontend(
  platform: IntegrationPlatform,
  status: 'connected' | 'error',
  message?: string,
  returnOrigin?: string,
  integrationScope?: 'agency'
) {
  const base =
    returnOrigin && isAllowedReturnOrigin(returnOrigin)
      ? returnOrigin.replace(/\/$/, '')
      : env.frontendUrl.replace(/\/$/, '');
  const params = new URLSearchParams({
    tab: 'settings',
    integration: platform,
    status,
  });
  if (message) params.set('message', message);
  if (integrationScope === 'agency') params.set('integration_scope', 'agency');
  return `${base}/app?${params}`;
}

function redirectToMobile(
  platform: IntegrationPlatform,
  status: 'connected' | 'error',
  message?: string,
  redirectUri?: string
) {
  const base = redirectUri?.trim() || `${env.mobileApp.scheme}://oauth/callback`;
  const params = new URLSearchParams({
    integration: platform,
    status,
  });
  if (message) params.set('message', message);
  return `${base}?${params}`;
}

function redirectAfterOAuth(
  platform: IntegrationPlatform,
  status: 'connected' | 'error',
  client: OAuthClient = 'web',
  message?: string,
  redirectUri?: string,
  returnOrigin?: string,
  integrationScope?: 'agency'
) {
  return client === 'mobile'
    ? redirectToMobile(platform, status, message, redirectUri)
    : redirectToFrontend(platform, status, message, returnOrigin, integrationScope);
}

function parseOAuthClient(value: unknown): OAuthClient {
  return value === 'mobile' ? 'mobile' : 'web';
}

router.get('/status', authenticate, requireRoles(UserRole.STORE_ADMIN), async (req: Request, res: Response) => {
  const integrations = await listIntegrationsForUser(req.user!.id);
  const ml = integrations.find((i) => i.platform === 'mercadolibre');
  const tn = integrations.find((i) => i.platform === 'tiendanube');
  res.json({
    mercadolibre: {
      configured: isMercadoLibreConfigured(),
      connected: Boolean(ml),
      webhookUrl: getMercadoLibreWebhookUrl(),
      webhookTopics: [...ML_WEBHOOK_TOPICS],
      account: ml ? integrationStatusPublic(ml) : null,
    },
    tiendanube: {
      configured: isTiendaNubeConfigured(),
      connected: Boolean(tn),
      privacyWebhooks: getTiendaNubePrivacyWebhookUrls(),
      account: tn ? integrationStatusPublic(tn) : null,
    },
  });
});

router.get('/agency/status', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Sin agencia asociada.' });
    return;
  }
  const agencyMl = await getAgencyMercadoLibreIntegration(req.user.agencyId);
  res.json({
    mercadolibre: {
      configured: isMercadoLibreConfigured(),
      connected: Boolean(agencyMl),
      webhookUrl: getMercadoLibreWebhookUrl(),
      webhookTopics: [...ML_WEBHOOK_TOPICS],
      account: agencyMl ? integrationStatusPublic(agencyMl) : null,
    },
  });
});

router.get('/repartidor/status', authenticate, requireRoles(UserRole.REPARTIDOR), async (req: Request, res: Response) => {
  const integrations = await listIntegrationsForUser(req.user!.id);
  const ml = integrations.find((i) => i.platform === 'mercadolibre');
  res.json({
    mercadolibre: {
      configured: isMercadoLibreConfigured(),
      connected: Boolean(ml),
      account: ml ? integrationStatusPublic(ml) : null,
    },
  });
});

router.get('/mercadolibre/connect', authenticate, requireRoles(UserRole.STORE_ADMIN, UserRole.REPARTIDOR), (req: Request, res: Response) => {
  if (!isMercadoLibreConfigured()) {
    res.status(503).json({ error: 'Mercado Libre no está configurado en el servidor (ML_APP_ID, ML_APP_SECRET).' });
    return;
  }
  const client = parseOAuthClient(req.query.client);
  const redirectUri =
    client === 'mobile' && typeof req.query.redirect_uri === 'string'
      ? req.query.redirect_uri.trim()
      : undefined;
  const returnOrigin = resolveReturnOrigin(req);
  const state = signOAuthState(req.user!.id, 'mercadolibre', client, redirectUri, returnOrigin);
  res.json({ url: getMercadoLibreAuthUrl(state) });
});

router.get('/agency/mercadolibre/connect', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  if (!isMercadoLibreConfigured()) {
    res.status(503).json({ error: 'Mercado Libre no está configurado en el servidor (ML_APP_ID, ML_APP_SECRET).' });
    return;
  }
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Sin agencia asociada.' });
    return;
  }
  const bridge = await ensureAgencyMlBridgeUser(req.user.agencyId);
  const client = parseOAuthClient(req.query.client);
  const redirectUri =
    client === 'mobile' && typeof req.query.redirect_uri === 'string'
      ? req.query.redirect_uri.trim()
      : undefined;
  const returnOrigin = resolveReturnOrigin(req);
  const state = signOAuthState(
    bridge.id,
    'mercadolibre',
    client,
    redirectUri,
    returnOrigin,
    'agency'
  );
  res.json({ url: getMercadoLibreAuthUrl(state) });
});

router.get('/mercadolibre/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  let client: OAuthClient = 'web';
  let mobileRedirectUri: string | undefined;
  let returnOrigin: string | undefined;
  let integrationScope: 'agency' | undefined;
  if (typeof state === 'string') {
    try {
      const payload = verifyOAuthState(state);
      client = parseOAuthClient(payload.client);
      mobileRedirectUri = payload.redirectUri;
      returnOrigin = payload.returnOrigin;
      integrationScope = payload.integrationScope;
    } catch {
      // state inválido o expirado
    }
  }

  if (error || !code || typeof code !== 'string' || !state || typeof state !== 'string') {
    res.redirect(
      redirectAfterOAuth(
        'mercadolibre',
        'error',
        client,
        'Autorización cancelada',
        mobileRedirectUri,
        returnOrigin,
        integrationScope
      )
    );
    return;
  }

  try {
    const payload = verifyOAuthState(state);
    client = parseOAuthClient(payload.client);
    mobileRedirectUri = payload.redirectUri;
    returnOrigin = payload.returnOrigin;
    integrationScope = payload.integrationScope;
    await exchangeMercadoLibreCode(payload.userId, code);
    res.redirect(
      redirectAfterOAuth(
        'mercadolibre',
        'connected',
        client,
        undefined,
        mobileRedirectUri,
        returnOrigin,
        integrationScope
      )
    );
  } catch {
    res.redirect(
      redirectAfterOAuth(
        'mercadolibre',
        'error',
        client,
        'No se pudo conectar Mercado Libre',
        mobileRedirectUri,
        returnOrigin,
        integrationScope
      )
    );
  }
});

router.get('/tiendanube/connect', authenticate, requireRoles(UserRole.STORE_ADMIN), (req: Request, res: Response) => {
  if (!isTiendaNubeConfigured()) {
    res.status(503).json({
      error: 'Tienda Nube no está configurado en el servidor (TN_APP_ID, TN_APP_SECRET).',
    });
    return;
  }
  const client = parseOAuthClient(req.query.client);
  const redirectUri =
    client === 'mobile' && typeof req.query.redirect_uri === 'string'
      ? req.query.redirect_uri.trim()
      : undefined;
  const returnOrigin = resolveReturnOrigin(req);
  const state = signOAuthState(req.user!.id, 'tiendanube', client, redirectUri, returnOrigin);
  res.json({ url: getTiendaNubeAuthUrl(state) });
});

router.get('/tiendanube/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  let client: OAuthClient = 'web';
  let mobileRedirectUri: string | undefined;
  let returnOrigin: string | undefined;
  if (typeof state === 'string') {
    try {
      const payload = verifyOAuthState(state);
      client = parseOAuthClient(payload.client);
      mobileRedirectUri = payload.redirectUri;
      returnOrigin = payload.returnOrigin;
    } catch {
      // state inválido o expirado
    }
  }

  if (error || !code || typeof code !== 'string' || !state || typeof state !== 'string') {
    res.redirect(
      redirectAfterOAuth(
        'tiendanube',
        'error',
        client,
        'Autorización cancelada',
        mobileRedirectUri,
        returnOrigin
      )
    );
    return;
  }

  try {
    const payload = verifyOAuthState(state);
    client = parseOAuthClient(payload.client);
    mobileRedirectUri = payload.redirectUri;
    returnOrigin = payload.returnOrigin;
    await exchangeTiendaNubeCode(payload.userId, code);
    res.redirect(
      redirectAfterOAuth('tiendanube', 'connected', client, undefined, mobileRedirectUri, returnOrigin)
    );
  } catch {
    res.redirect(
      redirectAfterOAuth(
        'tiendanube',
        'error',
        client,
        'No se pudo conectar Tienda Nube',
        mobileRedirectUri,
        returnOrigin
      )
    );
  }
});

router.post('/mercadolibre/notifications', async (req: Request, res: Response) => {
  res.status(200).send('OK');
  console.log('[ml-webhook] POST hit', {
    contentType: req.headers['content-type'],
    hasBody: Boolean(req.body),
    bodyType: typeof req.body,
  });
  const body = req.body as
    | MercadoLibreNotificationPayload
    | Record<string, unknown>
    | string
    | undefined;
  let payload: MercadoLibreNotificationPayload | undefined;
  if (typeof body === 'string') {
    try {
      payload = JSON.parse(body) as MercadoLibreNotificationPayload;
    } catch {
      payload = undefined;
    }
  } else {
    payload = body as MercadoLibreNotificationPayload;
  }
  if (!payload?.resource || !payload?.user_id || !payload?.topic) {
    console.warn('[ml-webhook] POST ignorado: payload incompleto', {
      topic: payload?.topic,
      user_id: payload?.user_id,
      resource: payload?.resource,
      _id: payload?._id,
      contentType: req.headers['content-type'],
    });
    return;
  }
  console.log('[ml-webhook] POST recibido', {
    topic: payload.topic,
    user_id: payload.user_id,
    resource: payload.resource,
    _id: payload._id,
    attempts: payload.attempts,
  });
  void processMercadoLibreNotification(payload);
});

router.get('/mercadolibre/notifications', (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    webhook: getMercadoLibreWebhookUrl(),
    topics: [...ML_WEBHOOK_TOPICS],
  });
});

router.post(
  '/mercadolibre/missed-feeds/replay',
  authenticate,
  requireRoles(...AGENCY_ADMIN_ROLES),
  async (req: Request, res: Response) => {
    if (!isMercadoLibreConfigured()) {
      res.status(400).json({ error: 'Mercado Libre no está configurado en el servidor.' });
      return;
    }
    const topic = typeof req.body?.topic === 'string' ? req.body.topic : undefined;
    const limit = typeof req.body?.limit === 'number' ? req.body.limit : undefined;
    try {
      const result = await replayMercadoLibreMissedFeeds({ topic, limit });
      res.json(result);
    } catch (err) {
      console.error('[ml-webhook] missed-feeds replay:', err);
      res.status(502).json({ error: 'No se pudieron reprocesar las notificaciones perdidas de ML.' });
    }
  }
);

router.post('/tiendanube/webhooks/store-redact', (req: Request, res: Response) => {
  res.status(200).send('OK');
  void processTiendaNubeStoreRedact(req.body as TiendaNubeStoreRedactPayload).catch((err) => {
    console.error('[TN LGPD] store-redact:', err);
  });
});

router.post('/tiendanube/webhooks/customers-redact', (req: Request, res: Response) => {
  res.status(200).send('OK');
  void processTiendaNubeCustomerRedact(req.body as TiendaNubeCustomerRedactPayload).catch((err) => {
    console.error('[TN LGPD] customers-redact:', err);
  });
});

router.post('/tiendanube/webhooks/customers-data-request', (req: Request, res: Response) => {
  res.status(200).send('OK');
  void processTiendaNubeCustomerDataRequest(req.body as TiendaNubeCustomerDataRequestPayload).catch((err) => {
    console.error('[TN LGPD] customers-data-request:', err);
  });
});

router.post('/mercadolibre/scan-import', authenticate, requireRoles(...AGENCY_ADMIN_ROLES, UserRole.REPARTIDOR), (_req: Request, res: Response) => {
  res.status(403).json({
    error:
      'El escaneo de etiquetas se hace solo en la app Mercado Envíos Flex. Posta se actualiza automáticamente cuando escaneás ahí.',
    code: 'SCAN_ONLY_IN_FLEX_APP',
  });
});

router.delete('/agency/mercadolibre', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  if (!req.user?.agencyId) {
    res.status(403).json({ error: 'Sin agencia asociada.' });
    return;
  }
  const bridge = await ensureAgencyMlBridgeUser(req.user.agencyId);
  const existing = await getIntegration(bridge.id, 'mercadolibre');
  if (!existing) {
    res.status(404).json({ error: 'No hay cuenta de Mercado Libre conectada para la agencia.' });
    return;
  }
  await deleteIntegration(bridge.id, 'mercadolibre');
  res.status(204).send();
});

router.get('/agency/mercadolibre/shipments', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  try {
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
    const shipments = await listAgencyImportableShipments(req.user!, 'mercadolibre', {
      dateFrom,
      dateTo,
    });
    res.json(shipments);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'ML_INVALID_DATE') {
      res.status(400).json({ error: 'Las fechas deben tener formato AAAA-MM-DD.' });
      return;
    }
    if (message === 'ML_INVALID_DATE_RANGE') {
      res.status(400).json({ error: 'La fecha desde no puede ser posterior a la fecha hasta.' });
      return;
    }
    if (message === 'ML_NOT_CONNECTED') {
      res.status(400).json({ error: 'Conectá la cuenta de Mercado Libre de la agencia antes de importar envíos.' });
      return;
    }
    if (message === 'ML_API_ERROR') {
      res.status(502).json({ error: 'No se pudo consultar Mercado Libre. Reconectá la cuenta de la agencia.' });
      return;
    }
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tenés permiso para importar envíos.' });
      return;
    }
    throw err;
  }
});

router.post('/agency/mercadolibre/import', authenticate, requireAgencyAdmin(), async (req: Request, res: Response) => {
  const { externalIds, mlRefs, dateFrom, dateTo } = req.body as {
    externalIds?: string[];
    mlRefs?: string[];
    dateFrom?: string;
    dateTo?: string;
  };

  try {
    const result = await importAgencyMarketplaceShipments(req.user!, 'mercadolibre', externalIds, {
      dateFrom,
      dateTo,
      mlRefs,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'ML_INVALID_DATE') {
      res.status(400).json({ error: 'Las fechas deben tener formato AAAA-MM-DD.' });
      return;
    }
    if (message === 'ML_INVALID_DATE_RANGE') {
      res.status(400).json({ error: 'La fecha desde no puede ser posterior a la fecha hasta.' });
      return;
    }
    if (message === 'ML_NOT_CONNECTED') {
      res.status(400).json({ error: 'Conectá la cuenta de Mercado Libre de la agencia antes de importar envíos.' });
      return;
    }
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tenés permiso para importar envíos.' });
      return;
    }
    throw err;
  }
});

router.delete('/:platform', authenticate, requireRoles(UserRole.STORE_ADMIN, ...AGENCY_ADMIN_ROLES, UserRole.REPARTIDOR), async (req: Request, res: Response) => {
  const platform = req.params.platform as IntegrationPlatform;
  if (platform !== 'mercadolibre' && platform !== 'tiendanube') {
    res.status(400).json({ error: 'Plataforma inválida.' });
    return;
  }
  if (req.user!.role === UserRole.REPARTIDOR && platform !== 'mercadolibre') {
    res.status(403).json({ error: 'No tenés permiso para desconectar esa integración.' });
    return;
  }
  const existing = await getIntegration(req.user!.id, platform);
  if (!existing) {
    res.status(404).json({ error: 'No hay cuenta conectada.' });
    return;
  }
  await deleteIntegration(req.user!.id, platform);
  res.status(204).send();
});

router.get('/:platform/shipments', authenticate, requireRoles(UserRole.STORE_ADMIN), async (req: Request, res: Response) => {
  const platform = req.params.platform as IntegrationPlatform;
  if (platform !== 'mercadolibre' && platform !== 'tiendanube') {
    res.status(400).json({ error: 'Plataforma inválida.' });
    return;
  }

  try {
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
    const tnDateRange =
      platform === 'tiendanube' ? parseTiendaNubeDateRange(dateFrom, dateTo) : undefined;

    const shipments = await listImportableShipments(req.user!.id, platform, {
      dateFrom: platform === 'mercadolibre' ? dateFrom : tnDateRange?.dateFrom,
      dateTo: platform === 'mercadolibre' ? dateTo : tnDateRange?.dateTo,
    });
    res.json(shipments);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'TN_INVALID_DATE') {
      res.status(400).json({ error: 'Las fechas deben tener formato AAAA-MM-DD.' });
      return;
    }
    if (message === 'TN_INVALID_DATE_RANGE') {
      res.status(400).json({ error: 'La fecha desde no puede ser posterior a la fecha hasta.' });
      return;
    }
    if (message === 'TN_DATE_RANGE_TOO_LONG') {
      res.status(400).json({ error: 'El período máximo de búsqueda es de 90 días.' });
      return;
    }
    if (message === 'ML_INVALID_DATE') {
      res.status(400).json({ error: 'Las fechas deben tener formato AAAA-MM-DD.' });
      return;
    }
    if (message === 'ML_INVALID_DATE_RANGE') {
      res.status(400).json({ error: 'La fecha desde no puede ser posterior a la fecha hasta.' });
      return;
    }
    if (message === 'ML_NOT_CONNECTED' || message === 'TN_NOT_CONNECTED') {
      res.status(400).json({ error: 'Conectá tu cuenta antes de importar envíos.' });
      return;
    }
    if (message === 'ML_API_ERROR' || message === 'TN_API_ERROR') {
      res.status(502).json({ error: 'No se pudo consultar la plataforma. Reconectá tu cuenta.' });
      return;
    }
    throw err;
  }
});

router.post('/:platform/import', authenticate, requireRoles(UserRole.STORE_ADMIN), async (req: Request, res: Response) => {
  const platform = req.params.platform as IntegrationPlatform;
  if (platform !== 'mercadolibre' && platform !== 'tiendanube') {
    res.status(400).json({ error: 'Plataforma inválida.' });
    return;
  }

  const { externalIds, mlRefs, dateFrom, dateTo } = req.body as {
    externalIds?: string[];
    mlRefs?: string[];
    dateFrom?: string;
    dateTo?: string;
  };

  try {
    const tnDateRange =
      platform === 'tiendanube' ? parseTiendaNubeDateRange(dateFrom, dateTo) : undefined;
    const result = await importMarketplaceShipments(req.user!, platform, externalIds, {
      dateFrom: platform === 'mercadolibre' ? dateFrom : tnDateRange?.dateFrom,
      dateTo: platform === 'mercadolibre' ? dateTo : tnDateRange?.dateTo,
      mlRefs: platform === 'mercadolibre' ? mlRefs : undefined,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'TN_INVALID_DATE') {
      res.status(400).json({ error: 'Las fechas deben tener formato AAAA-MM-DD.' });
      return;
    }
    if (message === 'TN_INVALID_DATE_RANGE') {
      res.status(400).json({ error: 'La fecha desde no puede ser posterior a la fecha hasta.' });
      return;
    }
    if (message === 'TN_DATE_RANGE_TOO_LONG') {
      res.status(400).json({ error: 'El período máximo de búsqueda es de 90 días.' });
      return;
    }
    if (message === 'ML_INVALID_DATE') {
      res.status(400).json({ error: 'Las fechas deben tener formato AAAA-MM-DD.' });
      return;
    }
    if (message === 'ML_INVALID_DATE_RANGE') {
      res.status(400).json({ error: 'La fecha desde no puede ser posterior a la fecha hasta.' });
      return;
    }
    if (message === 'ML_NOT_CONNECTED' || message === 'TN_NOT_CONNECTED') {
      res.status(400).json({ error: 'Conectá tu cuenta antes de importar envíos.' });
      return;
    }
    if (message === 'SELLER_NO_AGENCY') {
      res.status(400).json({
        error:
          'Tu cuenta de vendedor no está asociada a una agencia. Pedile a tu agencia que verifique tu usuario.',
      });
      return;
    }
    throw err;
  }
});

export default router;
