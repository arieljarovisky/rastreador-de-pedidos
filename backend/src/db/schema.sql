CREATE TABLE IF NOT EXISTS agencies (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  ml_flex_mode ENUM('agency', 'repartidor') NOT NULL DEFAULT 'agency',
  departure_address VARCHAR(500) NULL,
  departure_lat DECIMAL(10, 7) NULL,
  departure_lng DECIMAL(10, 7) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM('super_admin', 'store_admin', 'logistics_admin', 'repartidor') NOT NULL,
  agency_id VARCHAR(36) NULL,
  current_lat DECIMAL(10, 7) NULL,
  current_lng DECIMAL(10, 7) NULL,
  location_updated_at DATETIME(3) NULL,
  departure_address VARCHAR(500) NULL,
  departure_lat DECIMAL(10, 7) NULL,
  departure_lng DECIMAL(10, 7) NULL,
  delivery_zone VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_users_agency (agency_id),
  CONSTRAINT fk_users_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS delivery_zones (
  id VARCHAR(64) PRIMARY KEY,
  agency_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(7) NOT NULL,
  south DECIMAL(10, 7) NOT NULL,
  west DECIMAL(10, 7) NOT NULL,
  north DECIMAL(10, 7) NOT NULL,
  east DECIMAL(10, 7) NOT NULL,
  barrios JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_delivery_zones_agency (agency_id),
  CONSTRAINT fk_delivery_zones_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pickup_points (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  label VARCHAR(255) NOT NULL DEFAULT '',
  address VARCHAR(500) NOT NULL,
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_pickup_user (user_id),
  CONSTRAINT fk_pickup_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(36) PRIMARY KEY,
  agency_id VARCHAR(36) NULL,
  seller_id VARCHAR(36) NULL,
  external_source VARCHAR(32) NULL,
  external_order_id VARCHAR(100) NULL,
  shipping_type VARCHAR(32) NULL,
  client_name VARCHAR(255) NOT NULL,
  client_phone VARCHAR(50) NOT NULL DEFAULT '',
  address VARCHAR(500) NOT NULL,
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  status ENUM('pending', 'assigned', 'delivering', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
  archived TINYINT(1) NOT NULL DEFAULT 0,
  repartidor_id VARCHAR(36) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_orders_status (status),
  INDEX idx_orders_archived (archived),
  INDEX idx_orders_agency (agency_id),
  INDEX idx_orders_seller (seller_id),
  INDEX idx_orders_external (seller_id, external_source, external_order_id),
  INDEX idx_orders_repartidor (repartidor_id),
  CONSTRAINT fk_orders_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_orders_seller FOREIGN KEY (seller_id) REFERENCES users(id),
  CONSTRAINT fk_orders_repartidor FOREIGN KEY (repartidor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_integrations (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  status ENUM('pending', 'assigned', 'delivering', 'delivered', 'cancelled') NOT NULL,
  updated_by VARCHAR(255) NOT NULL,
  comment TEXT NULL,
  lat DECIMAL(10, 7) NULL,
  lng DECIMAL(10, 7) NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_order_history_order (order_id),
  CONSTRAINT fk_order_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_location_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_order_location_order (order_id),
  CONSTRAINT fk_order_location_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS repartidor_location_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_rep_location_user (user_id),
  INDEX idx_rep_location_user_time (user_id, created_at),
  CONSTRAINT fk_rep_location_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type ENUM('order_assigned', 'order_delivered', 'location_update', 'info') NOT NULL DEFAULT 'info',
  order_id VARCHAR(36) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_notifications_user (user_id),
  CONSTRAINT fk_notifications_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_dismissals (
  user_id VARCHAR(36) NOT NULL,
  notification_id VARCHAR(64) NOT NULL,
  dismissed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, notification_id),
  INDEX idx_dismissals_notification (notification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
