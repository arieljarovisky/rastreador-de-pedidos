import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { getConnection, listTables } from './reset-tables.js';
import { runSchema } from './run-schema.js';
import { seedDatabase } from './seed.js';

/**
 * En cada deploy: si la base está vacía, crea todas las tablas (schema.sql)
 * y carga datos demo. Si ya hay tablas, no hace nada destructivo.
 */
export async function ensureDatabaseSchema(): Promise<void> {
  if (!env.db.host || !env.db.user || !env.db.database) {
    throw new Error('Faltan variables de base de datos (DB_HOST, DB_USER, DB_NAME o MYSQL*).');
  }

  const connection = await getConnection(env.db.database);
  try {
    const tables = await listTables(connection);
    if (tables.length > 0) {
      console.log(`[db:init] Base con ${tables.length} tabla(s), omitiendo creación de schema.`);
      return;
    }

    console.log('[db:init] Base vacía → ejecutando schema.sql...');
    await runSchema(connection);
    console.log('[db:init] Tablas creadas.');

    await pool.query('SELECT 1');

    const [userRows] = await pool.query<Array<{ cnt: number } & RowDataPacket>>(
      'SELECT COUNT(*) AS cnt FROM users'
    );
    if (Number(userRows[0]?.cnt ?? 0) === 0) {
      console.log('[db:init] Cargando datos demo...');
      await seedDatabase();
      console.log('[db:init] Datos demo listos.');
    }
  } finally {
    await connection.end();
  }
}
