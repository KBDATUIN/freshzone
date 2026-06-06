-- ============================================================
--  schema.sql — FreshZone Database Schema (Aiven MySQL)
--  Run this once after creating the Aiven MySQL service.
-- ============================================================

CREATE TABLE IF NOT EXISTS accounts (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    employee_id     VARCHAR(50)     NOT NULL,
    full_name       VARCHAR(200)    NOT NULL,
    email           VARCHAR(255)    NOT NULL,
    contact_number  VARCHAR(50)     DEFAULT NULL,
    position        VARCHAR(100)    NOT NULL DEFAULT 'Staff / Teachers',
    photo_url       VARCHAR(500)    DEFAULT NULL,
    emergency_contact VARCHAR(255)  DEFAULT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    date_joined     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login      DATETIME        DEFAULT NULL,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_email (email),
    UNIQUE KEY uq_employee_id (employee_id),
    INDEX idx_is_active (is_active),
    INDEX idx_position (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sensor_nodes (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    node_code       VARCHAR(50)     NOT NULL,
    location_name   VARCHAR(200)    NOT NULL,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    last_seen       DATETIME        DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_node_code (node_code),
    INDEX idx_node_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sensor_readings (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    node_id         INT UNSIGNED    NOT NULL,
    pm1_0           DECIMAL(8,2)    NOT NULL,
    pm2_5           DECIMAL(8,2)    DEFAULT NULL,
    pm10            DECIMAL(8,2)    DEFAULT NULL,
    aqi_value       INT             DEFAULT NULL,
    aqi_category    VARCHAR(100)    DEFAULT NULL,
    smoke_detected  TINYINT(1)      NOT NULL DEFAULT 0,
    led_color       VARCHAR(20)     DEFAULT 'green',
    recorded_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES sensor_nodes(id) ON DELETE CASCADE,
    INDEX idx_node_id (node_id),
    INDEX idx_recorded_at (recorded_at),
    INDEX idx_smoke_detected (smoke_detected)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS detection_events (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    node_id         INT UNSIGNED    NOT NULL,
    reading_id      BIGINT UNSIGNED DEFAULT NULL,
    location_name   VARCHAR(200)    NOT NULL,
    pm2_5_value     DECIMAL(8,2)    DEFAULT NULL,
    aqi_value       INT             DEFAULT NULL,
    aqi_category    VARCHAR(100)    DEFAULT NULL,
    event_status    VARCHAR(50)     NOT NULL DEFAULT 'Detected',
    detected_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at DATETIME        DEFAULT NULL,
    acknowledged_by INT UNSIGNED    DEFAULT NULL,
    resolved_at     DATETIME        DEFAULT NULL,
    notes           TEXT            DEFAULT NULL,
    last_escalated_at DATETIME      DEFAULT NULL,
    FOREIGN KEY (node_id) REFERENCES sensor_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (acknowledged_by) REFERENCES accounts(id) ON DELETE SET NULL,
    INDEX idx_event_status (event_status),
    INDEX idx_detected_at (detected_at),
    INDEX idx_node_status (node_id, event_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS push_notifications (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    event_id        INT UNSIGNED    DEFAULT NULL,
    recipient_email VARCHAR(255)    NOT NULL,
    recipient_name  VARCHAR(200)    DEFAULT NULL,
    subject         VARCHAR(255)    DEFAULT NULL,
    location_name   VARCHAR(200)    DEFAULT NULL,
    pm1_for_email   DECIMAL(8,2)    DEFAULT NULL,
    aqi_category    VARCHAR(100)    DEFAULT NULL,
    send_status     VARCHAR(50)     NOT NULL DEFAULT 'pending',
    sent_at         DATETIME        DEFAULT NULL,
    error_message   TEXT            DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES detection_events(id) ON DELETE CASCADE,
    INDEX idx_send_status (send_status),
    INDEX idx_recipient_email (recipient_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    account_id      INT UNSIGNED    NOT NULL,
    endpoint        VARCHAR(500)    NOT NULL,
    subscription_data TEXT          NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_account_endpoint (account_id, endpoint(255)),
    INDEX idx_endpoint (endpoint(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_attempts (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255)    NOT NULL,
    ip_address      VARCHAR(45)     DEFAULT NULL,
    success         TINYINT(1)      NOT NULL DEFAULT 0,
    attempted_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_attempted_at (attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS system_logs (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id      INT UNSIGNED    DEFAULT NULL,
    action          VARCHAR(100)    NOT NULL,
    description     TEXT            DEFAULT NULL,
    ip_address      VARCHAR(45)     DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    INDEX idx_account_id (account_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contact_tickets (
    id              INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    ticket_ref      VARCHAR(50)     NOT NULL,
    account_id      INT UNSIGNED    DEFAULT NULL,
    submitter_name  VARCHAR(200)    NOT NULL,
    submitter_email VARCHAR(255)    NOT NULL,
    subject         VARCHAR(200)    NOT NULL,
    message         TEXT            NOT NULL,
    ticket_status   VARCHAR(50)     NOT NULL DEFAULT 'Open',
    resolved_by     INT UNSIGNED    DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at     DATETIME        DEFAULT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by) REFERENCES accounts(id) ON DELETE SET NULL,
    INDEX idx_ticket_status (ticket_status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_otp_store (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255)    NOT NULL,
    otp_code        VARCHAR(10)     NOT NULL,
    otp_type        ENUM('signup', 'reset') NOT NULL,
    expires_at      DATETIME        NOT NULL,
    attempts        INT             NOT NULL DEFAULT 0,
    payload_json    JSON            DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_auth_otp_email_type (email, otp_type),
    INDEX idx_auth_otp_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_key_store (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    node_id         BIGINT          NOT NULL,
    key_id          VARCHAR(64)     NOT NULL,
    secret_key      VARCHAR(255)    NOT NULL,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_node_key (node_id, key_id),
    INDEX idx_device_key_store_node_id (node_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
    INDEX idx_account_id (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
    INDEX idx_alerted_at (alerted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
--  Views
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
WHERE de.event_status IN ('Detected', 'Acknowledged')
ORDER BY de.detected_at DESC;

-- ============================================================
--  Stored Procedure: sp_run_all_retention_cleanups
--  Run this separately in Aiven Console or mysql CLI:
--    mysql -h mysql-1346b84f-freshzone-db.g.aivencloud.com -P 12272 -u avnadmin -p defaultdb < schema.sql
-- ============================================================

-- The stored procedure is defined at the end to avoid affecting
-- the CREATE TABLE statements above when run through Node.js.
-- To create it, paste the following into Aiven Console's SQL tab:
--
-- DROP PROCEDURE IF EXISTS sp_run_all_retention_cleanups;
-- CREATE PROCEDURE sp_run_all_retention_cleanups()
-- BEGIN
--     DELETE FROM sensor_readings WHERE recorded_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
--     DELETE FROM detection_events WHERE detected_at < DATE_SUB(NOW(), INTERVAL 90 DAY) AND event_status = 'Cleared';
--     DELETE FROM push_notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
--     DELETE FROM system_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
--     DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
--     DELETE FROM auth_otp_store WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY);
-- END
