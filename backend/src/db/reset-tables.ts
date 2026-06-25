import { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

export async function getConnection(database?: string): Promise<mysql.Connection> {
  return mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database,
    multipleStatements: true,
  });
}

export async function listTables(connection: mysql.Connection): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT table_name AS tableName
     FROM information_schema.tables
     WHERE table_schema = ?
     ORDER BY table_name`,
    [env.db.database]
  );
  return rows.map((row) => String(row.tableName));
}

export async function dropAllTables(connection: mysql.Connection): Promise<number> {
  const tables = await listTables(connection);

  if (tables.length === 0) {
    console.log('No hay tablas para eliminar.');
    return 0;
  }

  console.log(`Tablas encontradas (${tables.length}):`, tables.join(', '));

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');

  for (const tableName of tables) {
    console.log(`Eliminando tabla: ${tableName}`);
    await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
  }

  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  const remaining = await listTables(connection);
  if (remaining.length > 0) {
    throw new Error(`Quedaron tablas sin borrar: ${remaining.join(', ')}`);
  }

  console.log(`Se eliminaron ${tables.length} tabla(s).`);
  return tables.length;
}
