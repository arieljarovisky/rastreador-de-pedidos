import { pool } from '../config/database.js';

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<Array<{ COLUMN_NAME: string } & import('mysql2').RowDataPacket>>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const [rows] = await pool.query<Array<{ TABLE_NAME: string } & import('mysql2').RowDataPacket>>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

export async function runMigrations(): Promise<void> {
  if (!(await columnExists('orders', 'external_source'))) {
    await pool.query('ALTER TABLE orders ADD COLUMN external_source VARCHAR(32) NULL AFTER seller_id');
  }
  if (!(await columnExists('orders', 'external_order_id'))) {
    await pool.query('ALTER TABLE orders ADD COLUMN external_order_id VARCHAR(100) NULL AFTER external_source');
  }
  if (!(await columnExists('orders', 'shipping_type'))) {
    await pool.query('ALTER TABLE orders ADD COLUMN shipping_type VARCHAR(32) NULL AFTER external_order_id');
  }

  const [indexRows] = await pool.query<Array<{ INDEX_NAME: string } & import('mysql2').RowDataPacket>>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_external'`
  );
  if (indexRows.length === 0) {
    await pool.query(
      'CREATE INDEX idx_orders_external ON orders (seller_id, external_source, external_order_id)'
    );
  }

  if (!(await columnExists('users', 'delivery_zone'))) {
    await pool.query('ALTER TABLE users ADD COLUMN delivery_zone VARCHAR(64) NULL AFTER departure_lng');
  }

  if (!(await tableExists('store_integrations'))) {
    await pool.query(`
      CREATE TABLE store_integrations (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        platform ENUM('mercadolibre', 'tiendanube') NOT NULL,
        external_user_id VARCHAR(100) NULL,
        external_store_id VARCHAR(100) NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NULL,
        token_expires_at DATETIME(3) NULL,
        metadata JSON NULL,
        connected_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        UNIQUE KEY uk_user_platform (user_id, platform),
        INDEX idx_integrations_user (user_id),
        CONSTRAINT fk_integrations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
}
