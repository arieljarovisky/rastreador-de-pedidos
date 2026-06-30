import path from 'path';
import { fileURLToPath } from 'url';
import { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  label: string;
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value !== '');
}

function readDbConfig(prefix: 'PROD' | 'LOCAL' | 'DB'): DbConfig {
  const isProd = prefix === 'PROD';
  const isLocal = prefix === 'LOCAL';

  const host = isProd
    ? firstDefined(process.env.PROD_DB_HOST, process.env.DB_HOST, process.env.MYSQLHOST)
    : isLocal
      ? firstDefined(process.env.LOCAL_DB_HOST, process.env.DB_HOST, process.env.MYSQLHOST)
      : firstDefined(process.env.DB_HOST, process.env.MYSQLHOST);

  const port = Number(
    isProd
      ? firstDefined(process.env.PROD_DB_PORT, process.env.DB_PORT, process.env.MYSQLPORT) || '3306'
      : isLocal
        ? firstDefined(process.env.LOCAL_DB_PORT, process.env.DB_PORT, process.env.MYSQLPORT) || '3306'
        : firstDefined(process.env.DB_PORT, process.env.MYSQLPORT) || '3306'
  );

  const user = isProd
    ? firstDefined(process.env.PROD_DB_USER, process.env.DB_USER, process.env.MYSQLUSER)
    : isLocal
      ? firstDefined(process.env.LOCAL_DB_USER, process.env.DB_USER, process.env.MYSQLUSER) || 'root'
      : firstDefined(process.env.DB_USER, process.env.MYSQLUSER) || 'root';

  const password = isProd
    ? firstDefined(process.env.PROD_DB_PASSWORD, process.env.DB_PASSWORD, process.env.MYSQLPASSWORD) ?? ''
    : isLocal
      ? firstDefined(process.env.LOCAL_DB_PASSWORD, process.env.DB_PASSWORD, process.env.MYSQLPASSWORD) ?? ''
      : firstDefined(process.env.DB_PASSWORD, process.env.MYSQLPASSWORD) ?? '';

  const database = isProd
    ? firstDefined(process.env.PROD_DB_NAME, process.env.DB_NAME, process.env.MYSQLDATABASE)
    : isLocal
      ? firstDefined(process.env.LOCAL_DB_NAME, process.env.DB_NAME, process.env.MYSQLDATABASE) || 'lupo_tracking'
      : firstDefined(process.env.DB_NAME, process.env.MYSQLDATABASE) || 'lupo_tracking';

  if (!host || !user || !database) {
    throw new Error(
      `Faltan credenciales para ${prefix}. Definí ${prefix}_DB_HOST, ${prefix}_DB_USER y ${prefix}_DB_NAME (o DB_* / MYSQL*).`
    );
  }

  return { host, port, user, password, database, label: prefix };
}

function sameTargetAsSource(source: DbConfig, target: DbConfig): boolean {
  return (
    source.host === target.host &&
    source.port === target.port &&
    source.database === target.database &&
    source.user === target.user
  );
}

function looksLikeProduction(config: DbConfig): boolean {
  const host = config.host.toLowerCase();
  return (
    host.includes('railway') ||
    host.includes('rlwy.net') ||
    host.includes('amazonaws.com') ||
    config.database === 'railway'
  );
}

async function createConnection(config: DbConfig, withDatabase = true): Promise<mysql.Connection> {
  return mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: withDatabase ? config.database : undefined,
    multipleStatements: true,
  });
}

async function listTables(connection: mysql.Connection, database: string): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT table_name AS tableName
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [database]
  );
  return rows.map((row) => String(row.tableName));
}

async function ensureLocalDatabase(target: DbConfig): Promise<void> {
  const admin = await createConnection(target, false);
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${target.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await admin.end();
  }
}

async function copyTableStructure(
  source: mysql.Connection,
  target: mysql.Connection,
  tableName: string
): Promise<void> {
  const [rows] = await source.query<RowDataPacket[]>(`SHOW CREATE TABLE \`${tableName}\``);
  const createSql = String(rows[0]?.['Create Table'] ?? rows[0]?.['Create View'] ?? '');
  if (!createSql) {
    throw new Error(`No se pudo leer el DDL de la tabla ${tableName}`);
  }
  await target.query(`DROP TABLE IF EXISTS \`${tableName}\``);
  await target.query(createSql);
}

async function copyTableData(
  source: mysql.Connection,
  target: mysql.Connection,
  tableName: string
): Promise<number> {
  const [countRows] = await source.query<RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM \`${tableName}\``);
  const total = Number(countRows[0]?.cnt ?? 0);
  if (total === 0) return 0;

  const batchSize = 500;
  let copied = 0;

  for (let offset = 0; offset < total; offset += batchSize) {
    const [rows] = await source.query<RowDataPacket[]>(
      `SELECT * FROM \`${tableName}\` LIMIT ? OFFSET ?`,
      [batchSize, offset]
    );
    if (rows.length === 0) break;

    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES (${placeholders})`;

    for (const row of rows) {
      const values = columns.map((column) => row[column]);
      await target.query(sql, values);
      copied += 1;
    }
  }

  return copied;
}

async function dropTargetTables(connection: mysql.Connection, database: string): Promise<void> {
  const tables = await listTables(connection, database);
  if (tables.length === 0) return;

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const tableName of tables) {
    await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function cloneProductionDatabase(): Promise<void> {
  if (process.env.CONFIRM_CLONE !== 'true') {
    console.error(
      'Abortado: definí CONFIRM_CLONE=true para confirmar que querés copiar producción → local.'
    );
    process.exit(1);
  }

  const source = readDbConfig('PROD');
  const target = readDbConfig('LOCAL');

  if (sameTargetAsSource(source, target) && process.env.FORCE_CLONE !== 'true') {
    console.error(
      'Abortado: origen y destino apuntan al mismo host/base. ' +
        'Configurá LOCAL_DB_* distinto de PROD_DB_* o usá FORCE_CLONE=true si es intencional.'
    );
    process.exit(1);
  }

  if (looksLikeProduction(target) && process.env.FORCE_CLONE !== 'true') {
    console.error(
      'Abortado: el destino parece ser producción. ' +
        'Solo se permite clonar hacia una base local (LOCAL_DB_HOST=localhost).'
    );
    process.exit(1);
  }

  console.log(`[clone] Origen : ${source.user}@${source.host}:${source.port}/${source.database}`);
  console.log(`[clone] Destino: ${target.user}@${target.host}:${target.port}/${target.database}`);

  const sourceConn = await createConnection(source);
  await ensureLocalDatabase(target);
  const targetConn = await createConnection(target);

  try {
    const tables = await listTables(sourceConn, source.database);
    if (tables.length === 0) {
      throw new Error(`La base de producción ${source.database} no tiene tablas.`);
    }

    console.log(`[clone] Tablas a copiar (${tables.length}): ${tables.join(', ')}`);

    console.log('[clone] Limpiando destino...');
    await dropTargetTables(targetConn, target.database);

    console.log('[clone] Copiando estructura...');
    await targetConn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const tableName of tables) {
      process.stdout.write(`  · ${tableName} (DDL)... `);
      await copyTableStructure(sourceConn, targetConn, tableName);
      console.log('ok');
    }
    await targetConn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('[clone] Copiando datos...');
    let totalRows = 0;
    for (const tableName of tables) {
      process.stdout.write(`  · ${tableName} (datos)... `);
      const rows = await copyTableData(sourceConn, targetConn, tableName);
      totalRows += rows;
      console.log(`${rows} fila(s)`);
    }

    console.log(`[clone] Listo. ${tables.length} tabla(s), ${totalRows} fila(s) copiadas.`);
  } finally {
    await sourceConn.end();
    await targetConn.end();
  }
}

cloneProductionDatabase().catch((err) => {
  console.error('[clone] Error:', err);
  process.exit(1);
});
