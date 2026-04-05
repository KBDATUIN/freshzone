-- ============================================================
--  FRESHZONE — Complete DB Improvement Patch
--  Run in phpMyAdmin → freshzone_db → SQL tab
--  Safe to run — all use IF EXISTS / IF NOT EXISTS
-- ============================================================

USE freshzone_db;

-- ============================================================
--  1. Add known_devices table (for device verification)
-- ============================================================
CREATE TABLE IF NOT EXISTS known_devices (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    account_id      INT UNSIGNED    NOT NULL,
    device_hash     VARCHAR(64)     NOT NULL,
    device_label    VARCHAR(200)    DEFAULT NULL,
    ip_address      VARCHAR(45)     DEFAULT NULL,
    is_trusted      TINYINT(1)      NOT NULL DEFAULT 0,
    first_seen      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_account_device (account_id, device_hash),
    INDEX idx_device_hash (device_hash),
    INDEX idx_account_id  (account_id)
) ENGINE=InnoDB;

-- ============================================================
--  2. Add device_login_alerts table
-- ============================================================
CREATE TABLE IF NOT EXISTS device_login_alerts (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    account_id      INT UNSIGNED    NOT NULL,
    device_hash     VARCHAR(64)     NOT NULL,
    device_label    VARCHAR(200)    DEFAULT NULL,
    ip_address      VARCHAR(45)     DEFAULT NULL,
    email_sent      TINYINT(1)      NOT NULL DEFAULT 0,
    alerted_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    INDEX idx_alert_account (account_id),
    INDEX idx_alerted_at    (alerted_at)
) ENGINE=InnoDB;

-- ============================================================
--  3. Remove Zone 3 (3rd Floor Hallway) — keep only 2 zones
-- ============================================================
DELETE FROM detection_events WHERE node_id IN (SELECT id FROM sensor_nodes WHERE node_code = 'ESP32-ZONE3');
DELETE FROM sensor_readings  WHERE node_id IN (SELECT id FROM sensor_nodes WHERE node_code = 'ESP32-ZONE3');
DELETE FROM system_logs      WHERE node_id IN (SELECT id FROM sensor_nodes WHERE node_code = 'ESP32-ZONE3');
DELETE FROM sensor_nodes     WHERE node_code = 'ESP32-ZONE3';

-- ============================================================
--  4. Rebuild v_latest_readings — include pm1_0 and pm10
-- ============================================================
CREATE OR REPLACE VIEW v_latest_readings AS
SELECT
    sn.id             AS node_id,
    sn.node_code,
    sn.location_name,
    sn.is_active       AS node_active,
    sr.pm1_0,
    sr.pm2_5,
    sr.pm10,
    sr.aqi_value,
    sr.aqi_category,
    sr.smoke_detected,
    sr.led_color,
    sr.recorded_at
FROM sensor_nodes sn
LEFT JOIN sensor_readings sr
    ON sr.id = (
        SELECT id FROM sensor_readings
        WHERE node_id = sn.id
        ORDER BY recorded_at DESC
        LIMIT 1
    );

-- ============================================================
--  5. Rebuild v_open_events — include aqi_value
-- ============================================================
CREATE OR REPLACE VIEW v_open_events AS
SELECT
    de.id,
    de.location_name,
    de.pm2_5_value,
    de.aqi_value,
    de.aqi_category,
    de.event_status,
    de.detected_at,
    sn.node_code
FROM detection_events de
JOIN sensor_nodes sn ON sn.id = de.node_id
WHERE de.event_status = 'Detected'
ORDER BY de.detected_at DESC;

-- ============================================================
--  6. Remove placeholder admin if never changed
-- ============================================================
DELETE FROM accounts
WHERE email = 'admin@freshzone.local'
AND password_hash = '$2b$12$REPLACE_WITH_BCRYPT_HASH_OF_YOUR_ADMIN_PASSWORD';

-- ============================================================
--  7. VERIFY — show current state
-- ============================================================
SELECT 'sensor_nodes' AS tbl, node_code, location_name FROM sensor_nodes
UNION ALL
SELECT 'accounts', full_name, email FROM accounts
UNION ALL
SELECT 'tables', TABLE_NAME, '' FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'freshzone_db' ORDER BY tbl;
