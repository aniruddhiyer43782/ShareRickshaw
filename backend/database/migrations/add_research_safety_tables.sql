-- Adds tables used by the safety and evaluation-ready research prototype.
-- Run this against existing databases that were created before schema.sql
-- included auto_captures and night_location_logs.

CREATE TABLE IF NOT EXISTS auto_captures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  license_plate VARCHAR(20) NOT NULL,
  capture_latitude DECIMAL(10,8) NOT NULL,
  capture_longitude DECIMAL(11,8) NOT NULL,
  location_address VARCHAR(500),
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auto_capture_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_auto_capture_user_id (user_id),
  INDEX idx_auto_capture_plate (license_plate),
  INDEX idx_auto_capture_time (captured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS night_location_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  auto_number VARCHAR(20),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  accuracy DECIMAL(8,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_night_location_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_night_location_user_id (user_id),
  INDEX idx_night_location_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;