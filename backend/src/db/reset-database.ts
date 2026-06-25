import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { dropAllTables, getConnection } from './reset-tables.js';
import { runSchema } from './run-schema.js';
import { seedDatabase } from './seed.js';

export async function resetDatabase(): Promise<void> {
  if (!env.db.host || !env.db.user || !env.db.database) {
    throw new Error('Faltan variables de base de datos (DB_HOST, DB_USER, DB_NAME o MYSQL*).');
  }

  console.log(`[db:reset] Conectando a ${env.db.host}:${env.db.port}/${env.db.database}...`);

  // Asegurar que la base exista (Railway ya la crea; en local puede faltar)
  const adminConnection = await getConnection();
  try {
    await adminConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch {
    console.log('[db:reset] Sin permiso CREATE DATABASE; usando base existente.');
  }
  await adminConnection.end();

  const connection = await getConnection(env.db.database);

  console.log('[db:reset] Eliminando todas las tablas existentes...');
  const dropped = await dropAllTables(connection);

  console.log('[db:reset] Creando tablas de LupoEnvios (tracking)...');
  await runSchema(connection);
  await connection.end();

  await pool.query('SELECT 1');

  console.log('[db:reset] Cargando datos demo...');
  await seedDatabase();

  console.log(`[db:reset] Listo. Se reemplazaron ${dropped} tabla(s) anteriores.`);
}
