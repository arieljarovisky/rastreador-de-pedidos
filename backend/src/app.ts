import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors, { CorsOptions } from 'cors';
import { env } from './config/env.js';
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
import marketplaceRoutes from './routes/marketplace.routes.js';

const app = express();

function isAllowedCorsOrigin(origin: string): boolean {
  if (env.corsOrigins.includes(origin)) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'https:') return false;
    return hostname.endsWith('.vercel.app') && hostname.startsWith('rastreador-de-pedidos');
  } catch {
    return false;
  }
}

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || isAllowedCorsOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS no permitido para: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

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
    },
  });
});

app.use('/api/app', appRoutes);
app.use('/api/delivery-zones', deliveryZonesRoutes);

app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/repartidores', repartidoresRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/simulator', simulatorRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/integrations', integrationsRoutes);

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
