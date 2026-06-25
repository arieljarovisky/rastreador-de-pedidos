import { resetDatabase } from './reset-database.js';

/**
 * Instalación limpia: borra todas las tablas, recrea el schema y carga el seed demo.
 * Equivalente a `npm run db:reset`.
 */
async function main(): Promise<void> {
  await resetDatabase();
  console.log('Base de datos lista (instalación limpia).');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error en db:setup:', err);
  process.exit(1);
});
