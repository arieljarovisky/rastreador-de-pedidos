import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { resetDatabase } from './db/reset-database.js';
import { runMigrations } from './db/migrate.js';
import { setupSocket } from './realtime/socket.js';
import { startDeliveryScheduler } from './services/delivery-scheduler.js';
import { replayMercadoLibreMissedFeeds } from './services/mercadolibre-webhook.service.js';

async function start(): Promise<void> {
  if (process.env.DB_RESET_ON_START === 'true') {
    console.log('[startup] DB_RESET_ON_START=true → reseteando base de datos...');
    await resetDatabase();
    console.log('[startup] Reset completado. Desactivá DB_RESET_ON_START después de este deploy.');
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

    if (env.mercadolibre.appId) {
      void replayMercadoLibreMissedFeeds({ topic: 'shipments', limit: 30 })
        .then(({ replayed, errors }) => {
          if (replayed > 0 || errors > 0) {
            console.log(`[ml-webhook] missed_feeds al arranque: ${replayed} reprocesadas, ${errors} errores`);
          }
        })
        .catch((err) => {
          console.warn('[ml-webhook] missed_feeds al arranque falló:', err);
        });
    }
  });
}

start().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
