import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { runSchema } from './run-schema.js';
import { seedDatabase } from './seed.js';

async function main(): Promise<void> {
  const adminConnection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
  });

  try {
    await adminConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch {
    console.log('Usando base de datos existente (sin permiso para CREATE DATABASE).');
  }
  await adminConnection.end();

  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    multipleStatements: true,
  });

  console.log('Ejecutando schema.sql...');
  await runSchema(connection);
  await connection.end();

  console.log('Ejecutando seed...');
  await seedDatabase();

  console.log('Base de datos lista.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error en db:setup:', err);
  process.exit(1);
});
