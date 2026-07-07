import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { syncMensajeriaGrAgency } from './sync-agency-bindings.js';
import { computeDeliveryDeadline } from '../utils/delivery-deadline.js';

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

  if (!(await columnExists('users', 'session_token'))) {
    await pool.query('ALTER TABLE users ADD COLUMN session_token VARCHAR(64) NULL AFTER delivery_zone');
  }

  if (!(await columnExists('orders', 'archived'))) {
    await pool.query('ALTER TABLE orders ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0 AFTER status');
    await pool.query('CREATE INDEX idx_orders_archived ON orders (archived)');
  }

  if (!(await columnExists('order_history', 'lat'))) {
    await pool.query('ALTER TABLE order_history ADD COLUMN lat DECIMAL(10, 7) NULL AFTER comment');
  }
  if (!(await columnExists('order_history', 'lng'))) {
    await pool.query('ALTER TABLE order_history ADD COLUMN lng DECIMAL(10, 7) NULL AFTER lat');
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
        contact_email VARCHAR(255) NULL,
        contact_phone VARCHAR(32) NULL,
        cuit VARCHAR(13) NULL,
        city VARCHAR(100) NULL,
        ml_flex_mode ENUM('agency', 'repartidor') NOT NULL DEFAULT 'agency',
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
    // Multi-agencia: no reasignar usuarios huérfanos a la primera agencia (mezclaría flotas).
    // Solo sincronizamos pedidos con la agencia de su vendedor (más abajo).
    const [orphanUsers] = await pool.query<Array<{ cnt: number } & import('mysql2').RowDataPacket>>(
      'SELECT COUNT(*) AS cnt FROM users WHERE agency_id IS NULL AND role IN (?, ?, ?, ?)',
      ['super_admin', 'logistics_admin', 'store_admin', 'repartidor']
    );
    const orphanCount = Number(orphanUsers[0]?.cnt ?? 0);
    if (orphanCount > 0) {
      console.warn(
        `[migrate] ${orphanCount} usuario(s) sin agency_id. Asigná cada uno a su agencia manualmente o con POST /api/auth/register/agency.`
      );
    }
  }

  await pool.query(
    `UPDATE orders o
     INNER JOIN users s ON s.id = o.seller_id
     SET o.agency_id = s.agency_id
     WHERE o.agency_id IS NULL AND s.agency_id IS NOT NULL`
  );

  await syncMensajeriaGrAgency();

  if (!(await tableExists('delivery_zones'))) {
    await pool.query(`
      CREATE TABLE delivery_zones (
        id VARCHAR(64) PRIMARY KEY,
        agency_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        color VARCHAR(7) NOT NULL,
        south DECIMAL(10, 7) NOT NULL,
        west DECIMAL(10, 7) NOT NULL,
        north DECIMAL(10, 7) NOT NULL,
        east DECIMAL(10, 7) NOT NULL,
        barrios JSON NULL,
        shipping_rate_flex DECIMAL(12,2) NOT NULL DEFAULT 2800.00,
        shipping_rate_express DECIMAL(12,2) NOT NULL DEFAULT 3200.00,
        shipping_rate_standard DECIMAL(12,2) NOT NULL DEFAULT 2500.00,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_delivery_zones_agency (agency_id),
        CONSTRAINT fk_delivery_zones_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await columnExists('delivery_zones', 'barrios'))) {
    await pool.query('ALTER TABLE delivery_zones ADD COLUMN barrios JSON NULL AFTER east');
  }

  if (!(await columnExists('delivery_zones', 'shipping_rate_flex'))) {
    await pool.query(
      'ALTER TABLE delivery_zones ADD COLUMN shipping_rate_flex DECIMAL(12,2) NOT NULL DEFAULT 2800.00 AFTER barrios'
    );
  }
  if (!(await columnExists('delivery_zones', 'shipping_rate_express'))) {
    await pool.query(
      'ALTER TABLE delivery_zones ADD COLUMN shipping_rate_express DECIMAL(12,2) NOT NULL DEFAULT 3200.00 AFTER shipping_rate_flex'
    );
  }
  if (!(await columnExists('delivery_zones', 'shipping_rate_standard'))) {
    await pool.query(
      'ALTER TABLE delivery_zones ADD COLUMN shipping_rate_standard DECIMAL(12,2) NOT NULL DEFAULT 2500.00 AFTER shipping_rate_express'
    );
  }

  const [agencyRows] = await pool.query<Array<{ id: string } & import('mysql2').RowDataPacket>>(
    'SELECT id FROM agencies'
  );
  const { seedDefaultZonesForAgency } = await import('../services/delivery-zones.service.js');
  for (const agency of agencyRows) {
    await seedDefaultZonesForAgency(agency.id);
  }

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

  if (!(await columnExists('agencies', 'ml_flex_mode'))) {
    await pool.query(
      `ALTER TABLE agencies ADD COLUMN ml_flex_mode ENUM('agency', 'repartidor') NOT NULL DEFAULT 'agency' AFTER name`
    );
  }

  if (!(await columnExists('agencies', 'contact_email'))) {
    await pool.query('ALTER TABLE agencies ADD COLUMN contact_email VARCHAR(255) NULL AFTER name');
  }
  if (!(await columnExists('agencies', 'contact_phone'))) {
    await pool.query('ALTER TABLE agencies ADD COLUMN contact_phone VARCHAR(32) NULL AFTER contact_email');
  }
  if (!(await columnExists('agencies', 'cuit'))) {
    await pool.query('ALTER TABLE agencies ADD COLUMN cuit VARCHAR(13) NULL AFTER contact_phone');
  }
  if (!(await columnExists('agencies', 'city'))) {
    await pool.query('ALTER TABLE agencies ADD COLUMN city VARCHAR(100) NULL AFTER cuit');
  }

  if (!(await tableExists('repartidor_location_history'))) {
    await pool.query(`
      CREATE TABLE repartidor_location_history (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        lat DECIMAL(10, 7) NOT NULL,
        lng DECIMAL(10, 7) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        INDEX idx_rep_location_user (user_id),
        INDEX idx_rep_location_user_time (user_id, created_at),
        CONSTRAINT fk_rep_location_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await columnExists('orders', 'delivery_deadline'))) {
    await pool.query(
      'ALTER TABLE orders ADD COLUMN delivery_deadline DATETIME(3) NULL AFTER updated_at'
    );
    await pool.query('CREATE INDEX idx_orders_delivery_deadline ON orders (delivery_deadline)');

    const [orderRows] = await pool.query<
      Array<{ id: string; created_at: Date } & import('mysql2').RowDataPacket>
    >('SELECT id, created_at FROM orders WHERE delivery_deadline IS NULL');
    for (const row of orderRows) {
      const deadline = computeDeliveryDeadline(new Date(row.created_at));
      await pool.query('UPDATE orders SET delivery_deadline = ? WHERE id = ?', [deadline, row.id]);
    }
  }

  const [notifTypeCol] = await pool.query<
    Array<{ COLUMN_TYPE: string } & import('mysql2').RowDataPacket>
  >(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'type'`
  );
  const notifType = notifTypeCol[0]?.COLUMN_TYPE ?? '';
  if (notifType && !notifType.includes('deadline_urgent')) {
    await pool.query(
      `ALTER TABLE notifications MODIFY COLUMN type
       ENUM('order_assigned', 'order_delivered', 'location_update', 'info', 'deadline_warning', 'deadline_urgent', 'deadline_missed')
       NOT NULL DEFAULT 'info'`
    );
  }

  if (!(await tableExists('push_tokens'))) {
    await pool.query(`
      CREATE TABLE push_tokens (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        expo_push_token VARCHAR(255) NOT NULL,
        platform VARCHAR(16) NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        UNIQUE KEY uk_push_token (expo_push_token),
        INDEX idx_push_user (user_id),
        CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await columnExists('agencies', 'shipping_rate_flex'))) {
    await pool.query(
      'ALTER TABLE agencies ADD COLUMN shipping_rate_flex DECIMAL(12,2) NOT NULL DEFAULT 2800.00 AFTER ml_flex_mode'
    );
  }
  if (!(await columnExists('agencies', 'shipping_rate_express'))) {
    await pool.query(
      'ALTER TABLE agencies ADD COLUMN shipping_rate_express DECIMAL(12,2) NOT NULL DEFAULT 3200.00 AFTER shipping_rate_flex'
    );
  }
  if (!(await columnExists('agencies', 'shipping_rate_standard'))) {
    await pool.query(
      'ALTER TABLE agencies ADD COLUMN shipping_rate_standard DECIMAL(12,2) NOT NULL DEFAULT 2500.00 AFTER shipping_rate_express'
    );
  }

  if (!(await columnExists('orders', 'shipping_cost'))) {
    await pool.query('ALTER TABLE orders ADD COLUMN shipping_cost DECIMAL(12,2) NULL AFTER shipping_type');
  }
  if (!(await columnExists('orders', 'billed_at'))) {
    await pool.query('ALTER TABLE orders ADD COLUMN billed_at DATETIME(3) NULL AFTER shipping_cost');
    await pool.query('CREATE INDEX idx_orders_billed_at ON orders (billed_at)');
  }

  if (!(await tableExists('billing_ledger_entries'))) {
    await pool.query(`
      CREATE TABLE billing_ledger_entries (
        id VARCHAR(36) PRIMARY KEY,
        agency_id VARCHAR(36) NOT NULL,
        seller_id VARCHAR(36) NOT NULL,
        order_id VARCHAR(36) NULL,
        entry_type ENUM('charge', 'payment', 'adjustment') NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        description VARCHAR(500) NOT NULL,
        created_by VARCHAR(255) NULL,
        created_at DATETIME(3) NOT NULL,
        INDEX idx_billing_agency_date (agency_id, created_at),
        INDEX idx_billing_seller_date (seller_id, created_at),
        INDEX idx_billing_order (order_id),
        CONSTRAINT fk_billing_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_billing_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_billing_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
}
