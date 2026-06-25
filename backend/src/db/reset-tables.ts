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

export async function dropAllTables(connection: mysql.Connection): Promise<void> {
  const dbName = env.db.database;
  const [rows] = await connection.query<RowDataPacket[]>(`SHOW TABLES`);
  const tableKey = `Tables_in_${dbName}`;

  if (rows.length === 0) {
    console.log('No hay tablas para eliminar.');
    return;
  }

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');

  for (const row of rows) {
    const tableName = row[tableKey] as string;
    console.log(`Eliminando tabla: ${tableName}`);
    await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
  }

  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log(`Se eliminaron ${rows.length} tabla(s).`);
}
