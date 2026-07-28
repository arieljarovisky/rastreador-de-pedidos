import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { syncMensajeriaGrAgency } from './sync-agency-bindings.js';
import {
  computeDeliveryDeadline,
  nextOperationalDeliveryDeadline,
} from '../utils/delivery-deadline.js';

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

  // Corte de ventas por vendedor (NULL = hereda el de la agencia; no puede superar el de la agencia).
  if (!(await columnExists('users', 'delivery_deadline_hour'))) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN delivery_deadline_hour TINYINT UNSIGNED NULL AFTER delivery_zone'
    );
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
        platform ENUM('mercadolibre', 'tiendanube', 'shopify', 'woocommerce') NOT NULL,
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
        INDEX idx_integrations_platform_store (platform, external_store_id),
        CONSTRAINT fk_integrations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } else {
    await pool.query(
      `ALTER TABLE store_integrations
       MODIFY COLUMN platform ENUM('mercadolibre', 'tiendanube', 'shopify', 'woocommerce') NOT NULL`
    );
    try {
      await pool.query(
        'CREATE INDEX idx_integrations_platform_store ON store_integrations (platform, external_store_id)'
      );
    } catch {
      // índice ya existe
    }
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
        driver_pay_flex DECIMAL(12,2) NOT NULL DEFAULT 1500.00,
        driver_pay_express DECIMAL(12,2) NOT NULL DEFAULT 1800.00,
        driver_pay_standard DECIMAL(12,2) NOT NULL DEFAULT 1200.00,
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

  if (!(await columnExists('agencies', 'ml_flex_mode'))) {
    await pool.query(
      `ALTER TABLE agencies ADD COLUMN ml_flex_mode ENUM('agency', 'repartidor') NOT NULL DEFAULT 'agency' AFTER name`
    );
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

  // Pago al repartidor por zona (cordón) y liquidación de flota
  if (!(await columnExists('delivery_zones', 'driver_pay_flex'))) {
    await pool.query(
      'ALTER TABLE delivery_zones ADD COLUMN driver_pay_flex DECIMAL(12,2) NOT NULL DEFAULT 1500.00 AFTER shipping_rate_standard'
    );
  }
  if (!(await columnExists('delivery_zones', 'driver_pay_express'))) {
    await pool.query(
      'ALTER TABLE delivery_zones ADD COLUMN driver_pay_express DECIMAL(12,2) NOT NULL DEFAULT 1800.00 AFTER driver_pay_flex'
    );
  }
  if (!(await columnExists('delivery_zones', 'driver_pay_standard'))) {
    await pool.query(
      'ALTER TABLE delivery_zones ADD COLUMN driver_pay_standard DECIMAL(12,2) NOT NULL DEFAULT 1200.00 AFTER driver_pay_express'
    );
  }
  if (!(await columnExists('agencies', 'driver_pay_flex'))) {
    await pool.query(
      'ALTER TABLE agencies ADD COLUMN driver_pay_flex DECIMAL(12,2) NOT NULL DEFAULT 1500.00 AFTER shipping_rate_standard'
    );
  }
  if (!(await columnExists('agencies', 'driver_pay_express'))) {
    await pool.query(
      'ALTER TABLE agencies ADD COLUMN driver_pay_express DECIMAL(12,2) NOT NULL DEFAULT 1800.00 AFTER driver_pay_flex'
    );
  }
  if (!(await columnExists('agencies', 'driver_pay_standard'))) {
    await pool.query(
      'ALTER TABLE agencies ADD COLUMN driver_pay_standard DECIMAL(12,2) NOT NULL DEFAULT 1200.00 AFTER driver_pay_express'
    );
  }
  if (!(await columnExists('orders', 'driver_pay_amount'))) {
    await pool.query(
      'ALTER TABLE orders ADD COLUMN driver_pay_amount DECIMAL(12,2) NULL AFTER billed_at'
    );
  }
  if (!(await columnExists('orders', 'driver_billed_at'))) {
    await pool.query(
      'ALTER TABLE orders ADD COLUMN driver_billed_at DATETIME(3) NULL AFTER driver_pay_amount'
    );
    await pool.query('CREATE INDEX idx_orders_driver_billed_at ON orders (driver_billed_at)');
  }
  if (!(await tableExists('driver_ledger_entries'))) {
    await pool.query(`
      CREATE TABLE driver_ledger_entries (
        id VARCHAR(36) PRIMARY KEY,
        agency_id VARCHAR(36) NOT NULL,
        repartidor_id VARCHAR(36) NOT NULL,
        order_id VARCHAR(36) NULL,
        entry_type ENUM('earning', 'payment', 'adjustment') NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        description VARCHAR(500) NOT NULL,
        created_by VARCHAR(255) NULL,
        created_at DATETIME(3) NOT NULL,
        INDEX idx_driver_ledger_agency_date (agency_id, created_at),
        INDEX idx_driver_ledger_repartidor_date (repartidor_id, created_at),
        INDEX idx_driver_ledger_order (order_id),
        CONSTRAINT fk_driver_ledger_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_driver_ledger_repartidor FOREIGN KEY (repartidor_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_driver_ledger_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  const [agencyRows] = await pool.query<Array<{ id: string } & import('mysql2').RowDataPacket>>(
    'SELECT id FROM agencies'
  );
  const { seedDefaultZonesForAgency, ensureCordonZonesForAgency } = await import('../services/delivery-zones.service.js');
  for (const agency of agencyRows) {
    await seedDefaultZonesForAgency(agency.id);
    await ensureCordonZonesForAgency(agency.id);
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

  if (!(await columnExists('agencies', 'delivery_deadline_hour'))) {
    await pool.query(
      'ALTER TABLE agencies ADD COLUMN delivery_deadline_hour TINYINT UNSIGNED NOT NULL DEFAULT 12 AFTER city'
    );
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

  if (!(await columnExists('orders', 'ml_shipment_status'))) {
    await pool.query(
      'ALTER TABLE orders ADD COLUMN ml_shipment_status VARCHAR(64) NULL AFTER delivery_deadline'
    );
  }
  if (!(await columnExists('orders', 'ml_shipment_substatus'))) {
    await pool.query(
      'ALTER TABLE orders ADD COLUMN ml_shipment_substatus VARCHAR(64) NULL AFTER ml_shipment_status'
    );
    // Pedidos abiertos con "ausente" en bitácora → badge Ausente + día siguiente
    const [absentRows] = await pool.query<
      Array<{ id: string; delivery_deadline: Date | null; created_at: Date } & import('mysql2').RowDataPacket>
    >(
      `SELECT DISTINCT o.id, o.delivery_deadline, o.created_at
       FROM orders o
       INNER JOIN order_history h ON h.order_id = o.id
       WHERE o.status NOT IN ('delivered', 'cancelled')
         AND o.ml_shipment_substatus IS NULL
         AND h.comment LIKE '%ausente%'`
    );
    for (const row of absentRows) {
      const base = row.delivery_deadline
        ? new Date(row.delivery_deadline)
        : new Date(row.created_at);
      const nextDeadline = nextOperationalDeliveryDeadline(base);
      await pool.query(
        `UPDATE orders
         SET ml_shipment_substatus = 'receiver_absent',
             delivery_deadline = ?,
             updated_at = ?
         WHERE id = ?`,
        [nextDeadline, new Date(), row.id]
      );
      await pool.query(
        `INSERT INTO order_history (order_id, status, updated_by, comment, created_at)
         SELECT id, status, 'Mercado Libre',
                'Mercado Libre Flex: Destinatario ausente · reprogramado para el día siguiente',
                ?
         FROM orders WHERE id = ?`,
        [new Date(), row.id]
      );
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

  if (!(await tableExists('subscription_plans'))) {
    await pool.query(`
      CREATE TABLE subscription_plans (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        min_monthly_shipments INT NOT NULL DEFAULT 0,
        max_monthly_shipments INT NULL,
        price_ars DECIMAL(12,2) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const plans = [
      ['plan_10', 'Hasta 10 repartidores', 0, 10, 20000, 1],
      ['plan_20', 'Hasta 20 repartidores', 11, 20, 35000, 2],
      ['plan_50', 'Más de 20 repartidores', 21, null, 50000, 3],
    ];
    for (const [id, name, minS, maxS, price, sort] of plans) {
      await pool.query(
        `INSERT INTO subscription_plans (id, name, min_monthly_shipments, max_monthly_shipments, price_ars, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, name, minS, maxS, price, sort]
      );
    }
  }

  if (!(await tableExists('agency_subscriptions'))) {
    await pool.query(`
      CREATE TABLE agency_subscriptions (
        agency_id VARCHAR(36) PRIMARY KEY,
        plan_id VARCHAR(36) NULL,
        status ENUM('trial', 'active', 'past_due', 'cancelled') NOT NULL DEFAULT 'trial',
        trial_ends_at DATETIME(3) NULL,
        current_period_start DATETIME(3) NULL,
        current_period_end DATETIME(3) NULL,
        last_shipment_count INT NOT NULL DEFAULT 0,
        mp_payment_id VARCHAR(64) NULL,
        updated_at DATETIME(3) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        INDEX idx_sub_status (status),
        INDEX idx_sub_period_end (current_period_end),
        CONSTRAINT fk_sub_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_sub_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await tableExists('agency_mercadopago_accounts'))) {
    await pool.query(`
      CREATE TABLE agency_mercadopago_accounts (
        agency_id VARCHAR(36) PRIMARY KEY,
        mp_user_id VARCHAR(64) NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NULL,
        token_expires_at DATETIME(3) NULL,
        public_key VARCHAR(128) NULL,
        nickname VARCHAR(255) NULL,
        connected_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        CONSTRAINT fk_mp_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await tableExists('billing_payment_intents'))) {
    await pool.query(`
      CREATE TABLE billing_payment_intents (
        id VARCHAR(36) PRIMARY KEY,
        agency_id VARCHAR(36) NOT NULL,
        seller_id VARCHAR(36) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        mp_preference_id VARCHAR(64) NULL,
        mp_payment_id VARCHAR(64) NULL,
        status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
        ledger_entry_id VARCHAR(36) NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        UNIQUE KEY uk_mp_payment (mp_payment_id),
        INDEX idx_intent_agency (agency_id),
        INDEX idx_intent_seller (seller_id),
        INDEX idx_intent_status (status),
        CONSTRAINT fk_intent_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_intent_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await tableExists('subscription_payment_intents'))) {
    await pool.query(`
      CREATE TABLE subscription_payment_intents (
        id VARCHAR(36) PRIMARY KEY,
        agency_id VARCHAR(36) NOT NULL,
        plan_id VARCHAR(36) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        shipment_count INT NOT NULL DEFAULT 0,
        mp_preference_id VARCHAR(64) NULL,
        mp_payment_id VARCHAR(64) NULL,
        status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        UNIQUE KEY uk_sub_mp_payment (mp_payment_id),
        INDEX idx_sub_intent_agency (agency_id),
        CONSTRAINT fk_sub_intent_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_sub_intent_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  const trialDays = Number(process.env.SUBSCRIPTION_TRIAL_DAYS || '14') || 14;
  const [agenciesWithoutSub] = await pool.query<Array<{ id: string } & RowDataPacket>>(
    `SELECT a.id FROM agencies a
     LEFT JOIN agency_subscriptions s ON s.agency_id = a.id
     WHERE s.agency_id IS NULL`
  );
  for (const row of agenciesWithoutSub) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);
    await pool.query(
      `INSERT INTO agency_subscriptions (agency_id, status, trial_ends_at, updated_at, created_at)
       VALUES (?, 'trial', ?, ?, ?)`,
      [row.id, trialEnd, new Date(), new Date()]
    );
  }

  if (await tableExists('subscription_plans')) {
    await pool.query(
      `UPDATE subscription_plans SET active = 0
       WHERE id NOT IN ('plan_10', 'plan_20', 'plan_50')`
    );
    const repartidorPlans = [
      ['plan_10', 'Hasta 10 repartidores', 0, 10, 20000, 1],
      ['plan_20', 'Hasta 20 repartidores', 11, 20, 35000, 2],
      ['plan_50', 'Más de 20 repartidores', 21, null, 50000, 3],
    ] as const;
    for (const [id, name, minR, maxR, price, sort] of repartidorPlans) {
      await pool.query(
        `INSERT INTO subscription_plans
          (id, name, min_monthly_shipments, max_monthly_shipments, price_ars, sort_order, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          min_monthly_shipments = VALUES(min_monthly_shipments),
          max_monthly_shipments = VALUES(max_monthly_shipments),
          price_ars = VALUES(price_ars),
          sort_order = VALUES(sort_order),
          active = 1`,
        [id, name, minR, maxR, price, sort]
      );
    }
  }

  if (!(await tableExists('password_reset_tokens'))) {
    await pool.query(`
      CREATE TABLE password_reset_tokens (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        used_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uk_password_reset_token_hash (token_hash),
        INDEX idx_password_reset_user (user_id),
        INDEX idx_password_reset_expires (expires_at),
        CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await columnExists('users', 'google_id'))) {
    await pool.query('ALTER TABLE users ADD COLUMN google_id VARCHAR(64) NULL AFTER password_hash');
    await pool.query('CREATE UNIQUE INDEX uk_users_google_id ON users (google_id)');
  }

  if (!(await columnExists('users', 'email_verified_at'))) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN email_verified_at DATETIME(3) NULL AFTER google_id'
    );
    // Cuentas existentes siguen pudiendo entrar
    await pool.query(
      `UPDATE users SET email_verified_at = COALESCE(created_at, NOW(3))
       WHERE email_verified_at IS NULL`
    );
  }

  // Permitir cuentas solo-Google (sin contraseña local)
  {
    const [colRows] = await pool.query<
      Array<{ IS_NULLABLE: string } & import('mysql2').RowDataPacket>
    >(
      `SELECT IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_hash'`
    );
    if (colRows[0]?.IS_NULLABLE === 'NO') {
      await pool.query('ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL');
    }
  }

  if (!(await tableExists('email_verification_tokens'))) {
    await pool.query(`
      CREATE TABLE email_verification_tokens (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        used_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uk_email_verification_token_hash (token_hash),
        INDEX idx_email_verification_user (user_id),
        INDEX idx_email_verification_expires (expires_at),
        CONSTRAINT fk_email_verification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await tableExists('price_lists'))) {
    await pool.query(`
      CREATE TABLE price_lists (
        id VARCHAR(36) PRIMARY KEY,
        agency_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        is_default TINYINT(1) NOT NULL DEFAULT 0,
        shipping_rate_flex DECIMAL(12,2) NOT NULL DEFAULT 2800.00,
        shipping_rate_express DECIMAL(12,2) NOT NULL DEFAULT 3200.00,
        shipping_rate_standard DECIMAL(12,2) NOT NULL DEFAULT 2500.00,
        driver_pay_flex DECIMAL(12,2) NOT NULL DEFAULT 1500.00,
        driver_pay_express DECIMAL(12,2) NOT NULL DEFAULT 1800.00,
        driver_pay_standard DECIMAL(12,2) NOT NULL DEFAULT 1200.00,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY uk_price_lists_agency_name (agency_id, name),
        INDEX idx_price_lists_agency (agency_id),
        CONSTRAINT fk_price_lists_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await tableExists('price_list_zone_rates'))) {
    await pool.query(`
      CREATE TABLE price_list_zone_rates (
        price_list_id VARCHAR(36) NOT NULL,
        zone_key VARCHAR(64) NOT NULL,
        shipping_rate_flex DECIMAL(12,2) NOT NULL,
        shipping_rate_express DECIMAL(12,2) NOT NULL,
        shipping_rate_standard DECIMAL(12,2) NOT NULL,
        driver_pay_flex DECIMAL(12,2) NOT NULL,
        driver_pay_express DECIMAL(12,2) NOT NULL,
        driver_pay_standard DECIMAL(12,2) NOT NULL,
        PRIMARY KEY (price_list_id, zone_key),
        CONSTRAINT fk_plzr_list FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await columnExists('users', 'price_list_id'))) {
    await pool.query('ALTER TABLE users ADD COLUMN price_list_id VARCHAR(36) NULL AFTER agency_id');
    await pool.query('CREATE INDEX idx_users_price_list ON users (price_list_id)');
    await pool.query(
      'ALTER TABLE users ADD CONSTRAINT fk_users_price_list FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE SET NULL'
    );
  }

  if (!(await tableExists('postal_code_geo_cache'))) {
    await pool.query(`
      CREATE TABLE postal_code_geo_cache (
        postal_code VARCHAR(16) NOT NULL PRIMARY KEY,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        zone_key VARCHAR(64) NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_postal_geo_zone (zone_key),
        INDEX idx_postal_geo_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  // Seed lista default por agencia a partir de tarifas actuales
  try {
    const { ensureDefaultPriceListsForAllAgencies } = await import(
      '../services/price-lists.service.js'
    );
    await ensureDefaultPriceListsForAllAgencies();
  } catch (err) {
    console.warn('[migrate] No se pudieron seedear listas de precios:', err);
  }

  // Deduplicar spam de reprogramación / ausente en bitácora (queda la primera entrada)
  await pool.query(
    `DELETE h FROM order_history h
     INNER JOIN order_history keep
       ON keep.order_id = h.order_id
      AND keep.comment = h.comment
      AND keep.updated_by = h.updated_by
      AND keep.id < h.id
     WHERE h.updated_by = 'Mercado Libre'
       AND (
         h.comment LIKE '%reprogramado para el día siguiente%'
         OR h.comment LIKE '%Destinatario ausente%'
       )`
  );

  // Ausentes/reprogramados EN EL PASADO → hoy (PED-2023 y similares).
  try {
    const { recalculateOpenOrdersDeliveryDeadlines } = await import(
      '../services/orders.service.js'
    );
    const updated = await recalculateOpenOrdersDeliveryDeadlines();
    console.log(`[migrate] Deadlines recalculados/forzados a hoy: ${updated}`);
  } catch (err) {
    console.warn('[migrate] No se pudieron recalcular deadlines abiertos:', err);
  }

  if (!(await tableExists('woocommerce_pairing_codes'))) {
    await pool.query(`
      CREATE TABLE woocommerce_pairing_codes (
        code VARCHAR(16) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        used_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL,
        INDEX idx_woo_pairing_user (user_id),
        INDEX idx_woo_pairing_expires (expires_at),
        CONSTRAINT fk_woo_pairing_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  // Logo y tipografía de etiqueta por vendedor (branding de la etiqueta de envío propia de Posta).
  if (!(await columnExists('users', 'logo_image'))) {
    await pool.query('ALTER TABLE users ADD COLUMN logo_image MEDIUMBLOB NULL AFTER delivery_deadline_hour');
  }
  if (!(await columnExists('users', 'logo_mime'))) {
    await pool.query('ALTER TABLE users ADD COLUMN logo_mime VARCHAR(32) NULL AFTER logo_image');
  }
  if (!(await columnExists('users', 'logo_updated_at'))) {
    await pool.query('ALTER TABLE users ADD COLUMN logo_updated_at DATETIME(3) NULL AFTER logo_mime');
  }
  if (!(await columnExists('users', 'label_font'))) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN label_font VARCHAR(20) NOT NULL DEFAULT 'helvetica' AFTER logo_updated_at"
    );
  }

  // Estado operativo de agencia (panel dueño de Posta). Suspendida = baja lógica.
  if (!(await columnExists('agencies', 'status'))) {
    await pool.query(
      "ALTER TABLE agencies ADD COLUMN status ENUM('active','suspended') NOT NULL DEFAULT 'active' AFTER city"
    );
    await pool.query('CREATE INDEX idx_agencies_status ON agencies (status)');
  }

  // Baja lógica de usuarios (panel dueño / administración).
  if (!(await columnExists('users', 'disabled_at'))) {
    await pool.query('ALTER TABLE users ADD COLUMN disabled_at DATETIME(3) NULL AFTER email_verified_at');
    await pool.query('CREATE INDEX idx_users_disabled ON users (disabled_at)');
  }

  if (!(await tableExists('platform_audit_log'))) {
    await pool.query(`
      CREATE TABLE platform_audit_log (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        actor_user_id VARCHAR(36) NOT NULL,
        actor_email VARCHAR(255) NOT NULL,
        agency_id VARCHAR(36) NULL,
        entity_type VARCHAR(64) NOT NULL,
        entity_id VARCHAR(64) NULL,
        action VARCHAR(64) NOT NULL,
        summary VARCHAR(500) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        INDEX idx_platform_audit_agency (agency_id),
        INDEX idx_platform_audit_created (created_at),
        INDEX idx_platform_audit_actor (actor_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  // Rol dueño de Posta (sin agencia).
  try {
    await pool.query(
      `ALTER TABLE users
       MODIFY COLUMN role ENUM('super_admin','store_admin','logistics_admin','repartidor','platform_owner') NOT NULL`
    );
  } catch (err) {
    console.warn('[migrate] No se pudo ampliar ENUM users.role (puede estar al día):', err);
  }

  // Bitácora personal del repartidor (paquetes sin vínculo ML/Posta).
  if (!(await tableExists('driver_scan_entries'))) {
    await pool.query(`
      CREATE TABLE driver_scan_entries (
        id VARCHAR(36) PRIMARY KEY,
        agency_id VARCHAR(36) NOT NULL,
        repartidor_id VARCHAR(36) NOT NULL,
        scan_code VARCHAR(255) NOT NULL,
        route_date DATE NOT NULL,
        status ENUM('pending', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
        note VARCHAR(500) NULL,
        scanned_at DATETIME(3) NOT NULL,
        delivered_at DATETIME(3) NULL,
        lat DECIMAL(10, 7) NULL,
        lng DECIMAL(10, 7) NULL,
        UNIQUE KEY uk_driver_scan_day_code (repartidor_id, route_date, scan_code),
        INDEX idx_driver_scan_repartidor_date (repartidor_id, route_date),
        INDEX idx_driver_scan_agency_date (agency_id, route_date),
        CONSTRAINT fk_driver_scan_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_driver_scan_repartidor FOREIGN KEY (repartidor_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
}
