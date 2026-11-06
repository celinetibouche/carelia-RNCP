CREATE TABLE IF NOT EXISTS auth_sessions (
    session_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_auth_sessions_token (token_hash),
    KEY idx_auth_sessions_user (user_id),
    KEY idx_auth_sessions_expiry (expires_at),
    CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS child_details (
    child_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    group_name VARCHAR(100) NULL,
    emergency_contact_name VARCHAR(150) NULL,
    emergency_contact_phone VARCHAR(30) NULL,
    CONSTRAINT fk_child_details_child FOREIGN KEY (child_id) REFERENCES children (child_id)
        ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS daily_report_content (
    daily_report_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    parent_note TEXT NULL,
    summary_override TEXT NULL,
    revision INT UNSIGNED NOT NULL DEFAULT 1,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_daily_report_content_report FOREIGN KEY (daily_report_id)
        REFERENCES daily_reports (daily_report_id) ON DELETE CASCADE,
    CONSTRAINT ck_daily_report_revision CHECK (revision > 0)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS daily_report_meals (
    daily_report_id BIGINT UNSIGNED NOT NULL,
    kind ENUM('MAIN', 'DESSERT', 'SNACK') NOT NULL,
    intake ENUM('ALL', 'MOST', 'LITTLE', 'NONE') NOT NULL,
    label VARCHAR(150) NULL,
    PRIMARY KEY (daily_report_id, kind),
    CONSTRAINT fk_daily_report_meals_report FOREIGN KEY (daily_report_id)
        REFERENCES daily_reports (daily_report_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS daily_report_activities (
    daily_report_id BIGINT UNSIGNED NOT NULL,
    label VARCHAR(100) NOT NULL,
    PRIMARY KEY (daily_report_id, label),
    CONSTRAINT fk_daily_report_activities_report FOREIGN KEY (daily_report_id)
        REFERENCES daily_reports (daily_report_id) ON DELETE CASCADE,
    CONSTRAINT ck_daily_report_activity_not_blank CHECK (TRIM(label) <> '')
) ENGINE = InnoDB;

INSERT IGNORE INTO roles (label) VALUES ('EJE'), ('AUXILIARY');
UPDATE users AS u
JOIN roles AS old_role ON old_role.role_id = u.role_id AND old_role.label = 'STAFF'
JOIN roles AS new_role ON new_role.label = 'AUXILIARY'
SET u.role_id = new_role.role_id;
DELETE FROM roles WHERE label = 'STAFF';

INSERT IGNORE INTO daily_report_content (daily_report_id)
SELECT daily_report_id FROM daily_reports;
