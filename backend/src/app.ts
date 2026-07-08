import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors, { CorsOptions } from 'cors';
import { env } from './config/env.js';
import { applyCorsHeaders, corsMethods, isAllowedCorsOrigin } from './config/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import accountsRoutes from './routes/accounts.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import usersRoutes from './routes/users.routes.js';
import repartidoresRoutes from './routes/repartidores.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import simulatorRoutes from './routes/simulator.routes.js';
import geocodeRoutes from './routes/geocode.routes.js';
import integrationsRoutes from './routes/integrations.routes.js';
import { isMercadoLibreConfigured } from './services/mercadolibre.service.js';
import { isTiendaNubeConfigured } from './services/tiendanube.service.js';
import deliveryZonesRoutes from './routes/delivery-zones.routes.js';
import appRoutes from './routes/app.routes.js';
import billingRoutes from './routes/billing.routes.js';
import publicRoutes from './routes/public.routes.js';
import mercadopagoRoutes from './routes/mercadopago.routes.js';
import subscriptionsRoutes from './routes/subscriptions.routes.js';
import {
  isMercadoPagoOAuthConfigured,
  isPostaMercadoPagoConfigured,
} from './services/mercadopago.service.js';
import { requireAgencySubscription } from './middleware/subscription.js';

const app = express();

function corsPreflight(req: Request, res: Response, next: NextFunction): void {
  applyCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (isAllowedCorsOrigin(origin)) {
      callback(null, origin);
      return;
    }
    console.warn(`[cors] Origen rechazado: ${origin}`);
    callback(null, false);
  },
  methods: [...corsMethods],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
};

app.use(corsPreflight);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    corsOrigins: env.corsOrigins,
    integrations: {
      mercadolibre: {
        configured: isMercadoLibreConfigured(),
        hasAppId: Boolean(env.mercadolibre.appId),
        hasAppSecret: Boolean(env.mercadolibre.appSecret),
        redirectUri: env.mercadolibre.redirectUri,
      },
      tiendanube: {
        configured: isTiendaNubeConfigured(),
        hasAppId: Boolean(env.tiendanube.appId),
        hasAppSecret: Boolean(env.tiendanube.appSecret),
        redirectUri: env.tiendanube.redirectUri,
      },
      mercadopago: {
        oauthConfigured: isMercadoPagoOAuthConfigured(),
        postaConfigured: isPostaMercadoPagoConfigured(),
        redirectUri: env.mercadopago.redirectUri,
      },
    },
  });
});

app.use('/api/app', appRoutes);
app.use('/api/delivery-zones', requireAgencySubscription, deliveryZonesRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/accounts', requireAgencySubscription, accountsRoutes);
app.use('/api/orders', requireAgencySubscription, ordersRoutes);
app.use('/api/users', requireAgencySubscription, usersRoutes);
app.use('/api/repartidores', requireAgencySubscription, repartidoresRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/simulator', simulatorRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/mercadopago', mercadopagoRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/public', publicRoutes);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const downloadsDir = path.join(__dirname, '..', 'downloads');

app.use(
  '/downloads',
  express.static(downloadsDir, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.apk')) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', 'attachment; filename="posta-repartidor.apk"');
      }
    },
  })
);

app.use(errorHandler);

export default app;
