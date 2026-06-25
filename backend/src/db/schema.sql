CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM('store_admin', 'logistics_admin', 'repartidor') NOT NULL,
  current_lat DECIMAL(10, 7) NULL,
  current_lng DECIMAL(10, 7) NULL,
  location_updated_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(36) PRIMARY KEY,
  seller_id VARCHAR(36) NULL,
  client_name VARCHAR(255) NOT NULL,
  client_phone VARCHAR(50) NOT NULL DEFAULT '',
  address VARCHAR(500) NOT NULL,
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  status ENUM('pending', 'assigned', 'delivering', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
  repartidor_id VARCHAR(36) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_orders_status (status),
  INDEX idx_orders_seller (seller_id),
  INDEX idx_orders_repartidor (repartidor_id),
  CONSTRAINT fk_orders_seller FOREIGN KEY (seller_id) REFERENCES users(id),
  CONSTRAINT fk_orders_repartidor FOREIGN KEY (repartidor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  status ENUM('pending', 'assigned', 'delivering', 'delivered', 'cancelled') NOT NULL,
  updated_by VARCHAR(255) NOT NULL,
  comment TEXT NULL,
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
