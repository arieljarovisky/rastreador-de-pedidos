import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { resetDatabase } from './db/reset-database.js';
import { runMigrations } from './db/migrate.js';
import { setupSocket } from './realtime/socket.js';
import { startDeliveryScheduler } from './services/delivery-scheduler.js';
import { replayMercadoLibreMissedFeeds, getMercadoLibreWebhookUrl } from './services/mercadolibre-webhook.service.js';

async function start(): Promise<void> {
  if (process.env.DB_RESET_ON_START === 'true') {
    console.log('[startup] DB_RESET_ON_START=true → reseteando base de datos...');
    await resetDatabase();
    console.log('[startup] Reset completado. Desactivá DB_RESET_ON_START después de este deploy.');
  } else if (process.env.DEMO_SEED_ON_START === 'true') {
    console.log('[startup] DEMO_SEED_ON_START=true → cargando perfil demo (ag_demo)...');
    const { seedDatabase } = await import('./db/seed.js');
    await seedDatabase();
    console.log('[startup] Perfil demo aplicado. Desactivá DEMO_SEED_ON_START después de este deploy.');
  }

  await runMigrations();

  const server = http.createServer(app);
  setupSocket(server);
  startDeliveryScheduler();

  server.listen(env.port, '0.0.0.0', () => {
    console.log(`Backend LupoEnvios corriendo en http://localhost:${env.port} (HTTP + WebSocket)`);
    console.log(
      `[startup] Integraciones ML=${env.mercadolibre.appId ? 'appId ok' : 'SIN appId'}, ` +
        `secret=${env.mercadolibre.appSecret ? 'ok' : 'SIN secret'} | ` +
        `TN=${env.tiendanube.appId ? 'appId ok' : 'SIN appId'}, ` +
        `secret=${env.tiendanube.appSecret ? 'ok' : 'SIN secret'}`
    );

    console.log(
      `[startup] Webhook ML: ${getMercadoLibreWebhookUrl()} (tópicos: flex-handshakes, shipments, orders_v2)`
    );

    if (env.mercadolibre.appOwnerAccessToken) {
      void replayMercadoLibreMissedFeeds({ topic: 'flex-handshakes', limit: 30 })
        .then(({ replayed, errors }) => {
          if (replayed > 0 || errors > 0) {
            console.log(
              `[ml-webhook] missed_feeds flex-handshakes: ${replayed} reprocesadas, ${errors} errores`
            );
          }
        })
        .catch((err) => {
          console.warn('[ml-webhook] missed_feeds flex-handshakes falló:', err);
        });
    } else {
      console.log(
        '[startup] missed_feeds omitido (opcional): configurá ML_APP_OWNER_ACCESS_TOKEN si querés reprocesar notificaciones perdidas de ML'
      );
    }
  });
}

start().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
