import { pool } from '../config/database.js';

async function addColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
  const [rows] = await pool.query<Array<{ cnt: number } & import('mysql2').RowDataPacket>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (Number(rows[0]?.cnt ?? 0) > 0) return;
  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function runMigrations(): Promise<void> {
  await addColumnIfMissing('agencies', 'ml_flex_mode', "ENUM('agency', 'repartidor') NOT NULL DEFAULT 'agency'");
  await addColumnIfMissing('agencies', 'website', 'VARCHAR(500) NULL');
  await addColumnIfMissing('agencies', 'instagram', 'VARCHAR(255) NULL');
  await addColumnIfMissing('agencies', 'city', 'VARCHAR(255) NULL');
  await addColumnIfMissing('agencies', 'province', 'VARCHAR(255) NULL');
  await addColumnIfMissing('agencies', 'shipping_services', 'JSON NULL');
  await addColumnIfMissing('agencies', 'coverage_areas', 'JSON NULL');
  await addColumnIfMissing('agencies', 'logo_url', 'TEXT NULL');
  await addColumnIfMissing('agencies', 'description', 'TEXT NULL');
  await addColumnIfMissing('agencies', 'cutoff_time', 'VARCHAR(10) NULL');
  await addColumnIfMissing('agencies', 'repartidores_count', 'INT NULL');
  await addColumnIfMissing('agencies', 'contact_phone', 'VARCHAR(32) NULL');
  await addColumnIfMissing('agencies', 'contact_email', 'VARCHAR(255) NULL');

  await addColumnIfMissing('users', 'preferred_agency_id', 'VARCHAR(36) NULL');
  await addColumnIfMissing('users', 'city', 'VARCHAR(255) NULL');
  await addColumnIfMissing('users', 'province', 'VARCHAR(255) NULL');
  await addColumnIfMissing('users', 'monthly_orders', 'VARCHAR(32) NULL');
  await addColumnIfMissing('users', 'seller_categories', 'JSON NULL');

  await addColumnIfMissing('orders', 'agency_id', 'VARCHAR(36) NULL');
  await addColumnIfMissing('orders', 'seller_id', 'VARCHAR(36) NULL');
  await addColumnIfMissing('orders', 'external_source', 'VARCHAR(32) NULL');
  await addColumnIfMissing('orders', 'external_order_id', 'VARCHAR(100) NULL');
  await addColumnIfMissing('orders', 'shipping_type', 'VARCHAR(32) NULL');
  await addColumnIfMissing('orders', 'archived', 'TINYINT(1) NOT NULL DEFAULT 0');
}
