import { env } from '../config/env.js';
import { dropAllTables, getConnection } from './reset-tables.js';
import { runSchema } from './run-schema.js';
import { seedDatabase } from './seed.js';

async function main(): Promise<void> {
  console.log(`Conectando a ${env.db.host}:${env.db.port}/${env.db.database}...`);

  const connection = await getConnection(env.db.database);

  console.log('Eliminando todas las tablas existentes...');
  await dropAllTables(connection);

  console.log('Creando tablas de LupoEnvios (tracking)...');
  await runSchema(connection);
  await connection.end();

  console.log('Cargando datos demo...');
  await seedDatabase();

  console.log('Base de datos de tracking lista.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error en db:reset:', err);
  process.exit(1);
});
