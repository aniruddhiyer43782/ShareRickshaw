-- Mumbai Share Auto Database Schema

-- Create database (run manually if needed)
-- CREATE DATABASE IF NOT EXISTS mumbai_share_auto;
-- USE mumbai_share_auto;

-- Table: users
-- Purpose: Store user accounts for authentication (admin, regular users, autowalas)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  role ENUM('admin', 'user', 'autowala') DEFAULT 'user' NOT NULL,
  phone_number VARCHAR(15),
  full_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: autowala_details
-- Purpose: Store autowala-specific information (driver and auto details)
CREATE TABLE IF NOT EXISTS autowala_details (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  license_plate VARCHAR(20) NOT NULL UNIQUE,
  driver_name VARCHAR(100) NOT NULL,
  operating_location VARCHAR(100),
  driver_phone VARCHAR(15),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_autowala_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: emergency_contacts
-- Purpose: Store emergency contacts for regular users
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  contact_name VARCHAR(100) NOT NULL,
  contact_phone VARCHAR(15) NOT NULL,
  contact_email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_emergency_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  INDEX idx_user_id (user_id),
  INDEX idx_contact_email (contact_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: stands
-- Purpose: Store share auto stand locations and details
CREATE TABLE IF NOT EXISTS stands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  operating_hours VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Constraints for Mumbai coordinates
  CHECK (latitude BETWEEN 18.8 AND 19.3),
  CHECK (longitude BETWEEN 72.7 AND 73.0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: routes
-- Purpose: Store route information for each stand
CREATE TABLE IF NOT EXISTS routes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stand_id INT NOT NULL,
  destination VARCHAR(100) NOT NULL,
  fare DECIMAL(6,2) NOT NULL,
  travel_time VARCHAR(20) NOT NULL,
  destination_lat DECIMAL(10,8) NOT NULL,
  destination_lng DECIMAL(11,8) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Foreign key constraint
  CONSTRAINT fk_stand
    FOREIGN KEY (stand_id)
    REFERENCES stands(id)
    ON DELETE CASCADE,

  -- Index for faster lookups
  INDEX idx_stand_id (stand_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: bookings
-- Purpose: Store booking/reservation information for auto rides
CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  driver_id INT NULL,
  pickup_latitude DECIMAL(10,8) NOT NULL,
  pickup_longitude DECIMAL(11,8) NOT NULL,
  destination_latitude DECIMAL(10,8) NOT NULL,
  destination_longitude DECIMAL(11,8) NOT NULL,
  pickup_address VARCHAR(255) NOT NULL,
  destination_address VARCHAR(255) NOT NULL,
  estimated_fare DECIMAL(10,2) NOT NULL,
  status ENUM('requested', 'accepted', 'in_transit', 'completed', 'cancelled') DEFAULT 'requested' NOT NULL,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  cancelled_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_booking_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_booking_driver
    FOREIGN KEY (driver_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  INDEX idx_user_id (user_id),
  INDEX idx_driver_id (driver_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: driver_status
-- Purpose: Track driver online/offline status and real-time location for WebSocket broadcasts
CREATE TABLE IF NOT EXISTS driver_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  driver_id INT NOT NULL UNIQUE,
  is_online BOOLEAN DEFAULT FALSE,
  availability_status ENUM('available', 'busy') DEFAULT 'available',
  current_latitude DECIMAL(10,8) NULL,
  current_longitude DECIMAL(11,8) NULL,
  last_location_update TIMESTAMP NULL,
  current_booking_id INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_driver_status_user
    FOREIGN KEY (driver_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_driver_status_booking
    FOREIGN KEY (current_booking_id)
    REFERENCES bookings(id)
    ON DELETE SET NULL,

  INDEX idx_driver_id (driver_id),
  INDEX idx_is_online (is_online)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: booking_messages
-- Purpose: Store chat messages between user and driver for a specific booking
CREATE TABLE IF NOT EXISTS booking_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  sender_id INT NOT NULL,
  sender_role ENUM('user', 'driver') NOT NULL,
  message_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_message_booking
    FOREIGN KEY (booking_id)
    REFERENCES bookings(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_message_sender
    FOREIGN KEY (sender_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  INDEX idx_booking_id (booking_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: sos_logs
-- Purpose: Track SOS triggers for safety audit and debugging
CREATE TABLE IF NOT EXISTS sos_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  accuracy DECIMAL(8,2),
  contacts_count INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_sos_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: auto_captures
-- Purpose: Store AI-assisted license-plate captures for passenger safety audit trails
CREATE TABLE IF NOT EXISTS auto_captures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  license_plate VARCHAR(20) NOT NULL,
  capture_latitude DECIMAL(10,8) NOT NULL,
  capture_longitude DECIMAL(11,8) NOT NULL,
  location_address VARCHAR(500),
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_auto_capture_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  INDEX idx_auto_capture_user_id (user_id),
  INDEX idx_auto_capture_plate (license_plate),
  INDEX idx_auto_capture_time (captured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: night_location_logs
-- Purpose: Persist opt-in night-safety location updates for post-trip audit
CREATE TABLE IF NOT EXISTS night_location_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  auto_number VARCHAR(20),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  accuracy DECIMAL(8,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_night_location_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  INDEX idx_night_location_user_id (user_id),
  INDEX idx_night_location_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;