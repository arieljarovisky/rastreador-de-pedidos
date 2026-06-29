import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { syncMensajeriaGrAgency } from './sync-agency-bindings.js';

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

  if (!(await columnExists('orders', 'archived'))) {
    await pool.query('ALTER TABLE orders ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0 AFTER status');
    await pool.query('CREATE INDEX idx_orders_archived ON orders (archived)');
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

  if (!(await tableExists('agencies'))) {
    await pool.query(`
      CREATE TABLE agencies (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        departure_address VARCHAR(500) NULL,
        departure_lat DECIMAL(10, 7) NULL,
        departure_lng DECIMAL(10, 7) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await columnExists('users', 'agency_id'))) {
    await pool.query('ALTER TABLE users ADD COLUMN agency_id VARCHAR(36) NULL AFTER role');
    await pool.query('CREATE INDEX idx_users_agency ON users (agency_id)');
    await pool.query(
      'ALTER TABLE users ADD CONSTRAINT fk_users_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)'
    );
  }

  if (!(await columnExists('orders', 'agency_id'))) {
    await pool.query('ALTER TABLE orders ADD COLUMN agency_id VARCHAR(36) NULL AFTER id');
    await pool.query('CREATE INDEX idx_orders_agency ON orders (agency_id)');
    await pool.query(
      'ALTER TABLE orders ADD CONSTRAINT fk_orders_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)'
    );
  }

  const [agencyCount] = await pool.query<Array<{ cnt: number } & import('mysql2').RowDataPacket>>(
    'SELECT COUNT(*) AS cnt FROM agencies'
  );
  if (Number(agencyCount[0]?.cnt ?? 0) === 0) {
    const [adminRows] = await pool.query<
      (RowDataPacket & {
        id: string;
        name: string;
        departure_address: string | null;
        departure_lat: number | null;
        departure_lng: number | null;
      })[]
    >(
      `SELECT id, name, departure_address, departure_lat, departure_lng
       FROM users
       WHERE role IN ('super_admin', 'logistics_admin')
       ORDER BY FIELD(role, 'super_admin', 'logistics_admin')
       LIMIT 1`
    );
    const admin = adminRows[0];
    const agencyId = 'ag_default';
    const agencyName = admin?.name ?? 'Agencia principal';
    await pool.query(
      `INSERT INTO agencies (id, name, departure_address, departure_lat, departure_lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        agencyName,
        admin?.departure_address ?? null,
        admin?.departure_lat ?? null,
        admin?.departure_lng ?? null,
        new Date(),
      ]
    );
    await pool.query('UPDATE users SET agency_id = ? WHERE agency_id IS NULL', [agencyId]);
    await pool.query('UPDATE orders SET agency_id = ? WHERE agency_id IS NULL', [agencyId]);
  } else {
    const [orphanUsers] = await pool.query<Array<{ cnt: number } & import('mysql2').RowDataPacket>>(
      'SELECT COUNT(*) AS cnt FROM users WHERE agency_id IS NULL'
    );
    if (Number(orphanUsers[0]?.cnt ?? 0) > 0) {
      const [firstAgency] = await pool.query<Array<{ id: string } & import('mysql2').RowDataPacket>>(
        'SELECT id FROM agencies ORDER BY created_at ASC LIMIT 1'
      );
      const agencyId = firstAgency[0]?.id;
      if (agencyId) {
        await pool.query('UPDATE users SET agency_id = ? WHERE agency_id IS NULL', [agencyId]);
        await pool.query(
          `UPDATE orders o
           LEFT JOIN users s ON s.id = o.seller_id
           SET o.agency_id = COALESCE(s.agency_id, ?)
           WHERE o.agency_id IS NULL`,
          [agencyId]
        );
      }
    }
  }

  await pool.query(
    `UPDATE orders o
     INNER JOIN users s ON s.id = o.seller_id
     SET o.agency_id = s.agency_id
     WHERE o.agency_id IS NULL AND s.agency_id IS NOT NULL`
  );

  await syncMensajeriaGrAgency();

  if (!(await tableExists('notification_dismissals'))) {
    await pool.query(`
      CREATE TABLE notification_dismissals (
        user_id VARCHAR(36) NOT NULL,
        notification_id VARCHAR(64) NOT NULL,
        dismissed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (user_id, notification_id),
        INDEX idx_dismissals_notification (notification_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
}
