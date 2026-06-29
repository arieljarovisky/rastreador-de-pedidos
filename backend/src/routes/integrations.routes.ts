import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, requireRoles, requireAgencyAdmin } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import { AGENCY_ADMIN_ROLES } from '../utils/roles.js';
import { env } from '../config/env.js';
import {
  deleteIntegration,
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
  importMercadoLibreByScanForAgency,
  listImportableShipments,
  parseScanLocation,
} from '../services/marketplace-import.service.js';
import { parseTiendaNubeDateRange } from '../services/tiendanube.service.js';
import {
  getMercadoLibreWebhookUrl,
  processMercadoLibreNotification,
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

const router = Router();

interface OAuthStatePayload {
  userId: string;
  platform: IntegrationPlatform;
}

function signOAuthState(userId: string, platform: IntegrationPlatform): string {
  return jwt.sign({ userId, platform } satisfies OAuthStatePayload, env.jwtSecret, {
    expiresIn: '15m',
  });
}

function verifyOAuthState(state: string): OAuthStatePayload {
  const payload = jwt.verify(state, env.jwtSecret) as OAuthStatePayload;
  if (!payload.userId || !payload.platform) throw new Error('INVALID_STATE');
  return payload;
}

function redirectToFrontend(platform: IntegrationPlatform, status: 'connected' | 'error', message?: string) {
  const params = new URLSearchParams({
    tab: 'settings',
    integration: platform,
    status,
  });
  if (message) params.set('message', message);
  return `${env.frontendUrl}/app?${params}`;
}

router.get('/status', authenticate, requireRoles(UserRole.STORE_ADMIN), async (req: Request, res: Response) => {
  const integrations = await listIntegrationsForUser(req.user!.id);
  res.json({
    mercadolibre: {
      configured: isMercadoLibreConfigured(),
      connected: integrations.some((i) => i.platform === 'mercadolibre'),
      webhookUrl: getMercadoLibreWebhookUrl(),
      account: integrations.find((i) => i.platform === 'mercadolibre')
        ? integrationStatusPublic(integrations.find((i) => i.platform === 'mercadolibre')!)
        : null,
    },
    tiendanube: {
      configured: isTiendaNubeConfigured(),
      connected: integrations.some((i) => i.platform === 'tiendanube'),
      privacyWebhooks: getTiendaNubePrivacyWebhookUrls(),
      account: integrations.find((i) => i.platform === 'tiendanube')
        ? integrationStatusPublic(integrations.find((i) => i.platform === 'tiendanube')!)
        : null,
    },
  });
});

router.get('/mercadolibre/connect', authenticate, requireRoles(UserRole.STORE_ADMIN), (req: Request, res: Response) => {
  if (!isMercadoLibreConfigured()) {
    res.status(503).json({ error: 'Mercado Libre no está configurado en el servidor (ML_APP_ID, ML_APP_SECRET).' });
    return;
  }
  const state = signOAuthState(req.user!.id, 'mercadolibre');
  res.json({ url: getMercadoLibreAuthUrl(state) });
});

router.get('/mercadolibre/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  if (error || !code || typeof code !== 'string' || !state || typeof state !== 'string') {
    res.redirect(redirectToFrontend('mercadolibre', 'error', 'Autorización cancelada'));
    return;
  }

  try {
    const { userId } = verifyOAuthState(state);
    await exchangeMercadoLibreCode(userId, code);
    res.redirect(redirectToFrontend('mercadolibre', 'connected'));
  } catch {
    res.redirect(redirectToFrontend('mercadolibre', 'error', 'No se pudo conectar Mercado Libre'));
  }
});

router.get('/tiendanube/connect', authenticate, requireRoles(UserRole.STORE_ADMIN), (req: Request, res: Response) => {
  if (!isTiendaNubeConfigured()) {
    res.status(503).json({
      error: 'Tienda Nube no está configurado en el servidor (TN_APP_ID, TN_APP_SECRET).',
    });
    return;
  }
  const state = signOAuthState(req.user!.id, 'tiendanube');
  res.json({ url: getTiendaNubeAuthUrl(state) });
});

router.get('/tiendanube/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  if (error || !code || typeof code !== 'string' || !state || typeof state !== 'string') {
    res.redirect(redirectToFrontend('tiendanube', 'error', 'Autorización cancelada'));
    return;
  }

  try {
    const { userId } = verifyOAuthState(state);
    await exchangeTiendaNubeCode(userId, code);
    res.redirect(redirectToFrontend('tiendanube', 'connected'));
  } catch {
    res.redirect(redirectToFrontend('tiendanube', 'error', 'No se pudo conectar Tienda Nube'));
  }
});

router.post('/mercadolibre/notifications', async (req: Request, res: Response) => {
  res.status(200).send('OK');
  const payload = req.body as MercadoLibreNotificationPayload;
  if (!payload?.resource || !payload?.user_id || !payload?.topic) return;
  void processMercadoLibreNotification(payload);
});

router.get('/mercadolibre/notifications', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, webhook: getMercadoLibreWebhookUrl() });
});

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

router.post('/mercadolibre/scan-import', authenticate, requireRoles(...AGENCY_ADMIN_ROLES, UserRole.REPARTIDOR), async (req: Request, res: Response) => {
  const { code, sellerId, lat, lng } = req.body as {
    code?: string;
    sellerId?: string;
    lat?: number;
    lng?: number;
  };
  if (!code?.trim()) {
    res.status(400).json({ error: 'Escaneá o ingresá el código de la etiqueta.' });
    return;
  }

  try {
    const scanLocation = parseScanLocation(lat, lng);
    const result = await importMercadoLibreByScanForAgency(
      req.user!,
      code.trim(),
      sellerId,
      scanLocation
    );
    res.status(result.alreadyImported ? 200 : 201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'ML_SCAN_INVALID') {
      res.status(400).json({ error: 'El código escaneado no es válido. Usá la etiqueta de Mercado Libre Flex.' });
      return;
    }
    if (message === 'ML_NO_SELLERS_CONNECTED') {
      res.status(400).json({
        error: 'Ningún vendedor de tu agencia tiene Mercado Libre conectado.',
      });
      return;
    }
    if (message === 'ML_SELLER_NOT_CONNECTED') {
      res.status(400).json({ error: 'Ese vendedor no tiene Mercado Libre conectado.' });
      return;
    }
    if (message === 'ML_SCAN_NOT_FOUND') {
      res.status(404).json({
        error:
          'No se encontró un envío Flex con ese código entre los vendedores de tu agencia. Verificá la etiqueta o que el vendedor tenga ML vinculado.',
      });
      return;
    }
    if (message === 'GEOCODE_UNAVAILABLE') {
      res.status(503).json({ error: 'No se pudo ubicar la dirección en el mapa. Intentá de nuevo.' });
      return;
    }
    if (message === 'EXTERNAL_ORDER_EXISTS') {
      res.status(409).json({ error: 'Ese pedido de Mercado Libre ya fue importado.' });
      return;
    }
    if (message === 'SELLER_NOT_FOUND') {
      res.status(400).json({ error: 'Vendedor no encontrado en tu agencia.' });
      return;
    }
    if (message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Pedido no encontrado en tu agencia.' });
      return;
    }
    if (message === 'FORBIDDEN') {
      res.status(403).json({ error: 'No tenés permiso para importar envíos.' });
      return;
    }
    throw err;
  }
});

router.delete('/:platform', authenticate, requireRoles(UserRole.STORE_ADMIN), async (req: Request, res: Response) => {
  const platform = req.params.platform as IntegrationPlatform;
  if (platform !== 'mercadolibre' && platform !== 'tiendanube') {
    res.status(400).json({ error: 'Plataforma inválida.' });
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
      dateFrom: tnDateRange?.dateFrom,
      dateTo: tnDateRange?.dateTo,
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

  const { externalIds, dateFrom, dateTo } = req.body as {
    externalIds?: string[];
    dateFrom?: string;
    dateTo?: string;
  };

  try {
    const tnDateRange =
      platform === 'tiendanube' ? parseTiendaNubeDateRange(dateFrom, dateTo) : undefined;
    const result = await importMarketplaceShipments(req.user!, platform, externalIds, {
      dateFrom: tnDateRange?.dateFrom,
      dateTo: tnDateRange?.dateTo,
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
