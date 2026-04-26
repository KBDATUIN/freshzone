-- ============================================================
-- FreshZone Data Retention Policy Migration
-- Implements automated data retention for GDPR/Privacy compliance
-- ============================================================
-- Run this in phpMyAdmin SQL tab (select your railway DB first)
-- Safe to re-run on MariaDB 10.4+ and MySQL 5.7+
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 0. ADD MISSING COLUMNS TO EXISTING TABLES (safe to re-run)
-- ═══════════════════════════════════════════════════════════════
-- MariaDB 10.4 does NOT support IF NOT EXISTS in ALTER TABLE
-- We use stored procedure checks instead

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS _add_col_if_missing(
    IN p_table VARCHAR(64),
    IN p_column VARCHAR(64),
    IN p_definition VARCHAR(255)
)
BEGIN
    SET @sql = CONCAT(
        'ALTER TABLE ', p_table,
        ' ADD COLUMN ', p_column, ' ', p_definition
    );
    SET @check_sql = CONCAT(
        'SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS ',
        'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ''', p_table, ''' ',
        'AND COLUMN_NAME = ''', p_column, ''''
    );
    PREPARE stmt FROM @check_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    IF @col_exists = 0 THEN
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SELECT CONCAT('Added column ', p_column, ' to ', p_table) AS result;
    ELSE
        SELECT CONCAT('Column ', p_column, ' already exists in ', p_table) AS result;
    END IF;
END //

CREATE PROCEDURE IF NOT EXISTS _add_index_if_missing(
    IN p_table VARCHAR(64),
    IN p_index VARCHAR(64),
    IN p_columns VARCHAR(255)
)
BEGIN
    SET @sql = CONCAT(
        'ALTER TABLE ', p_table,
        ' ADD INDEX ', p_index, ' (', p_columns, ')'
    );
    SET @check_sql = CONCAT(
        'SELECT COUNT(*) INTO @idx_exists FROM information_schema.STATISTICS ',
        'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ''', p_table, ''' ',
        'AND INDEX_NAME = ''', p_index, ''''
    );
    PREPARE stmt FROM @check_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    IF @idx_exists = 0 THEN
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SELECT CONCAT('Added index ', p_index, ' to ', p_table) AS result;
    ELSE
        SELECT CONCAT('Index ', p_index, ' already exists in ', p_table) AS result;
    END IF;
END //

DELIMITER ;

-- Add deleted_at to accounts for soft-delete support
CALL _add_col_if_missing('accounts', 'deleted_at', 'DATETIME NULL');
CALL _add_col_if_missing('accounts', 'deletion_reason', 'VARCHAR(255) NULL');
CALL _add_index_if_missing('accounts', 'idx_accounts_deleted', 'deleted_at');

-- Add created_at to push_notifications if missing
CALL _add_col_if_missing('push_notifications', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
CALL _add_index_if_missing('push_notifications', 'idx_push_notifications_created', 'created_at');

-- Add created_at to system_logs if missing
CALL _add_col_if_missing('system_logs', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
CALL _add_index_if_missing('system_logs', 'idx_system_logs_created', 'created_at');

-- Add created_at to contact_tickets if missing
CALL _add_col_if_missing('contact_tickets', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
CALL _add_index_if_missing('contact_tickets', 'idx_contact_tickets_created', 'created_at');

-- Add created_at to push_subscriptions for retention tracking
CALL _add_col_if_missing('push_subscriptions', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
CALL _add_index_if_missing('push_subscriptions', 'idx_push_subscriptions_created', 'created_at');

-- Drop helper procedures (optional — keeps DB clean)
DROP PROCEDURE IF EXISTS _add_col_if_missing;
DROP PROCEDURE IF EXISTS _add_index_if_missing;

-- ═══════════════════════════════════════════════════════════════
-- 1. DATA RETENTION CONFIGURATION TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS data_retention_config (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL UNIQUE,
    retention_days INT NOT NULL COMMENT 'Number of days to retain data',
    retention_column VARCHAR(50) NOT NULL COMMENT 'Column name containing the date for retention calculation',
    description TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_table_name (table_name),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Clear old config to prevent duplicates on re-run
DELETE FROM data_retention_config;

-- Insert default retention policies based on Privacy Policy
INSERT INTO data_retention_config (table_name, retention_days, retention_column, description) VALUES
('login_attempts', 1, 'attempted_at', 'Login attempts are retained for 24 hours for rate limiting and security monitoring'),
('sensor_readings', 90, 'recorded_at', 'Sensor readings (PM values) retained for 90 days for historical analysis'),
('detection_events', 365, 'detected_at', 'Detection events retained for 1 year for compliance and incident reporting'),
('push_notifications', 30, 'created_at', 'Push notification logs retained for 30 days for delivery verification'),
('auth_otp_store', 1, 'expires_at', 'OTP codes deleted immediately after expiration (15 minutes typical)'),
('accounts', 30, 'deleted_at', 'Deleted accounts retained for 30 days for recovery (soft delete)'),
('system_logs', 90, 'created_at', 'System audit logs retained for 90 days'),
('contact_tickets', 365, 'created_at', 'Support tickets retained for 1 year for customer service'),
('device_login_alerts', 90, 'alerted_at', 'Device login alerts retained for 90 days'),
('push_subscriptions', 180, 'created_at', 'Inactive push subscriptions retained for 180 days');

-- ═══════════════════════════════════════════════════════════════
-- 2. DATA RETENTION AUDIT LOG TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS data_retention_audit (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    records_deleted INT NOT NULL DEFAULT 0,
    deletion_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    retention_days_applied INT NOT NULL,
    cutoff_date DATETIME NOT NULL COMMENT 'Date before which records were deleted',
    executed_by VARCHAR(100) DEFAULT 'automated_cron' COMMENT 'Who/what executed the deletion',
    status ENUM('completed', 'failed', 'partial') DEFAULT 'completed',
    error_message TEXT NULL,
    INDEX idx_table_name (table_name),
    INDEX idx_deletion_date (deletion_date),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════
-- 3. STORED PROCEDURE FOR DATA CLEANUP
-- ═══════════════════════════════════════════════════════════════

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS sp_cleanup_expired_data(
    IN p_table_name VARCHAR(100),
    OUT p_records_deleted INT,
    OUT p_status VARCHAR(20),
    OUT p_error_message TEXT
)
BEGIN
    DECLARE v_retention_days INT;
    DECLARE v_retention_column VARCHAR(50);
    DECLARE v_cutoff_date DATETIME;
    DECLARE v_table_exists INT DEFAULT 0;

    -- Error handler
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        SET p_status = 'failed';
        SET p_error_message = 'SQL Error during cleanup';
        SET p_records_deleted = 0;
        ROLLBACK;
    END;

    -- Get retention config
    SELECT retention_days, retention_column
    INTO v_retention_days, v_retention_column
    FROM data_retention_config
    WHERE table_name = p_table_name AND is_active = 1;

    -- If no config found, return
    IF v_retention_days IS NULL THEN
        SET p_status = 'completed';
        SET p_records_deleted = 0;
        SET p_error_message = 'No active retention config found';
    ELSE
        -- Calculate cutoff date
        SET v_cutoff_date = DATE_SUB(NOW(), INTERVAL v_retention_days DAY);
        SET p_records_deleted = 0;

        START TRANSACTION;

        -- Check if table exists
        SELECT COUNT(*) INTO v_table_exists
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = p_table_name;

        IF v_table_exists = 1 THEN
            -- Special handling for accounts (soft delete → hard delete)
            IF p_table_name = 'accounts' THEN
                SET @v_sql = CONCAT(
                    'DELETE FROM ', p_table_name,
                    ' WHERE deleted_at IS NOT NULL AND deleted_at < ?'
                );
            ELSE
                -- Standard DELETE for other tables
                SET @v_sql = CONCAT(
                    'DELETE FROM ', p_table_name,
                    ' WHERE ', v_retention_column, ' < ?'
                );
            END IF;

            SET @cutoff = v_cutoff_date;
            PREPARE stmt FROM @v_sql;
            EXECUTE stmt USING @cutoff;
            DEALLOCATE PREPARE stmt;

            -- Get count of deleted records
            SET p_records_deleted = ROW_COUNT();
            SET p_status = 'completed';
            SET p_error_message = NULL;

            COMMIT;
        ELSE
            SET p_status = 'completed';
            SET p_records_deleted = 0;
            SET p_error_message = 'Table does not exist';
        END IF;

        -- Log the cleanup operation
        INSERT INTO data_retention_audit (
            table_name, records_deleted, retention_days_applied,
            cutoff_date, status, error_message
        ) VALUES (
            p_table_name, p_records_deleted, v_retention_days,
            v_cutoff_date, p_status, p_error_message
        );
    END IF;
END //

DELIMITER ;

-- ═══════════════════════════════════════════════════════════════
-- 4. MASTER CLEANUP PROCEDURE
-- ═══════════════════════════════════════════════════════════════

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS sp_run_all_retention_cleanups()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_table_name VARCHAR(100);
    DECLARE v_records_deleted INT;
    DECLARE v_status VARCHAR(20);
    DECLARE v_error_message TEXT;
    DECLARE v_total_deleted INT DEFAULT 0;

    -- Cursor for all active retention configs
    DECLARE config_cursor CURSOR FOR
        SELECT table_name FROM data_retention_config WHERE is_active = 1;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    OPEN config_cursor;

    read_loop: LOOP
        FETCH config_cursor INTO v_table_name;
        IF done THEN
            LEAVE read_loop;
        END IF;

        -- Run cleanup for each table
        CALL sp_cleanup_expired_data(v_table_name, v_records_deleted, v_status, v_error_message);

        SET v_total_deleted = v_total_deleted + COALESCE(v_records_deleted, 0);

        -- Log to server console if significant deletions
        IF v_records_deleted > 100 THEN
            SELECT CONCAT('Cleaned ', v_records_deleted, ' records from ', v_table_name) AS cleanup_log;
        END IF;
    END LOOP;

    CLOSE config_cursor;

    -- Summary log
    SELECT CONCAT('Total records cleaned: ', v_total_deleted) AS cleanup_summary;
END //

DELIMITER ;

-- ═══════════════════════════════════════════════════════════════
-- 5. PROCEDURE TO SOFT DELETE USER ACCOUNT
-- ═══════════════════════════════════════════════════════════════

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS sp_soft_delete_account(
    IN p_user_id BIGINT,
    IN p_reason VARCHAR(255)
)
BEGIN
    -- Mark account as deleted
    UPDATE accounts
    SET deleted_at = NOW(),
        deletion_reason = p_reason,
        is_active = 0
    WHERE id = p_user_id AND deleted_at IS NULL;

    -- Log the deletion
    INSERT INTO data_retention_audit (
        table_name, records_deleted, retention_days_applied,
        cutoff_date, status, executed_by
    ) VALUES (
        'accounts', ROW_COUNT(), 30, NOW(), 'completed', 'user_request'
    );

    SELECT ROW_COUNT() AS affected_rows;
END //

DELIMITER ;

-- ═══════════════════════════════════════════════════════════════
-- 6. PROCEDURE TO HARD DELETE USER DATA (Right to Erasure / GDPR)
-- ═══════════════════════════════════════════════════════════════

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS sp_hard_delete_user_data(
    IN p_user_id BIGINT,
    OUT p_status VARCHAR(20),
    OUT p_message TEXT
)
BEGIN
    DECLARE v_email VARCHAR(255);
    DECLARE v_records_deleted INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        SET p_status = 'failed';
        SET p_message = 'Error during data deletion';
        ROLLBACK;
    END;

    START TRANSACTION;

    -- Get user email for logging
    SELECT email INTO v_email FROM accounts WHERE id = p_user_id;

    IF v_email IS NULL THEN
        SET p_status = 'completed';
        SET p_message = 'User not found';
    ELSE
        -- Delete user's push subscriptions
        DELETE FROM push_subscriptions WHERE account_id = p_user_id;
        SET v_records_deleted = v_records_deleted + ROW_COUNT();

        -- Delete user's device login alerts
        DELETE FROM device_login_alerts WHERE account_id = p_user_id;
        SET v_records_deleted = v_records_deleted + ROW_COUNT();

        -- Delete user's known devices
        DELETE FROM known_devices WHERE account_id = p_user_id;
        SET v_records_deleted = v_records_deleted + ROW_COUNT();

        -- Delete user's push notifications (by email)
        DELETE FROM push_notifications WHERE recipient_email = v_email;
        SET v_records_deleted = v_records_deleted + ROW_COUNT();

        -- Anonymize user's detection events (keep data but remove personal link)
        UPDATE detection_events
        SET acknowledged_by = NULL
        WHERE acknowledged_by = p_user_id;

        -- Delete user's login attempts
        DELETE FROM login_attempts WHERE email = v_email;
        SET v_records_deleted = v_records_deleted + ROW_COUNT();

        -- Delete user's system logs
        DELETE FROM system_logs WHERE account_id = p_user_id;
        SET v_records_deleted = v_records_deleted + ROW_COUNT();

        -- Delete user's contact tickets
        DELETE FROM contact_tickets WHERE account_id = p_user_id;
        SET v_records_deleted = v_records_deleted + ROW_COUNT();

        -- Hard delete the account
        DELETE FROM accounts WHERE id = p_user_id;
        SET v_records_deleted = v_records_deleted + 1;

        -- Log the deletion
        INSERT INTO data_retention_audit (
            table_name, records_deleted, retention_days_applied,
            cutoff_date, status, executed_by, error_message
        ) VALUES (
            'accounts', v_records_deleted, 0, NOW(), 'completed', 'gdpr_erasure',
            CONCAT('User data erased for: ', v_email)
        );

        COMMIT;
        SET p_status = 'completed';
        SET p_message = CONCAT('Successfully deleted ', v_records_deleted, ' records for user: ', v_email);
    END IF;
END //

DELIMITER ;

-- ═══════════════════════════════════════════════════════════════
-- 7. VIEW FOR DATA RETENTION STATUS
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_data_retention_status AS
SELECT
    rc.table_name,
    rc.retention_days,
    rc.retention_column,
    rc.description,
    rc.is_active,
    COALESCE(MAX(a.records_deleted), 0) AS last_cleanup_count,
    MAX(a.deletion_date) AS last_cleanup_date,
    COALESCE(
        (SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = rc.table_name), 0
    ) AS table_exists
FROM data_retention_config rc
LEFT JOIN data_retention_audit a ON rc.table_name = a.table_name
GROUP BY rc.id, rc.table_name, rc.retention_days, rc.retention_column, rc.description, rc.is_active;

-- ═══════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════

-- To verify the migration:
-- SELECT * FROM data_retention_config;
-- SELECT * FROM v_data_retention_status;

-- To run manual cleanup:
-- CALL sp_run_all_retention_cleanups();

-- To check audit log:
-- SELECT * FROM data_retention_audit ORDER BY deletion_date DESC LIMIT 10;
