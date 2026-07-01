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
  await addColumnIfMissing('agencies', 'coverage_areas', 'JSON NULL');
  await addColumnIfMissing('users', 'monthly_orders', 'VARCHAR(32) NULL');
  await addColumnIfMissing('users', 'seller_categories', 'JSON NULL');
}
