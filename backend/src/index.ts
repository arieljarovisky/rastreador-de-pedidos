import app from './app.js';
import { env } from './config/env.js';
import { resetDatabase } from './db/reset-database.js';

async function start(): Promise<void> {
  if (process.env.DB_RESET_ON_START === 'true') {
    console.log('[startup] DB_RESET_ON_START=true → reseteando base de datos...');
    await resetDatabase();
    console.log('[startup] Reset completado. Desactivá DB_RESET_ON_START después de este deploy.');
  }

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`Backend LupoEnvios corriendo en http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
