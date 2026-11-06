-- Carelia - MySQL 8.4 schema
-- Initialisation d'une base vide seulement. Le schema effectif inclut ensuite
-- backend/migrations/*.sql.
CREATE DATABASE IF NOT EXISTS carelia
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE carelia;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE daycares (
    daycare_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(150) NOT NULL,
    PRIMARY KEY (daycare_id),
    CONSTRAINT uq_daycares_name UNIQUE (name),
    CONSTRAINT ck_daycares_name_not_blank CHECK (TRIM(name) <> '')
) ENGINE = InnoDB;

CREATE TABLE roles (
    role_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    label VARCHAR(50) NOT NULL,
    PRIMARY KEY (role_id),
    CONSTRAINT uq_roles_label UNIQUE (label),
    CONSTRAINT ck_roles_label_not_blank CHECK (TRIM(label) <> '')
) ENGINE = InnoDB;

CREATE TABLE users (
    user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    daycare_id BIGINT UNSIGNED NOT NULL,
    role_id BIGINT UNSIGNED NOT NULL,
    email VARCHAR(320) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30) NULL,
    address TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_users_daycare
        FOREIGN KEY (daycare_id) REFERENCES daycares (daycare_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_users_role
        FOREIGN KEY (role_id) REFERENCES roles (role_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_email_normalized CHECK (email = LOWER(TRIM(email))),
    CONSTRAINT ck_users_email_format CHECK (email LIKE '%_@_%._%'),
    CONSTRAINT ck_users_password_hash_not_blank CHECK (TRIM(password_hash) <> ''),
    CONSTRAINT ck_users_last_name_not_blank CHECK (TRIM(last_name) <> ''),
    CONSTRAINT ck_users_first_name_not_blank CHECK (TRIM(first_name) <> '')
) ENGINE = InnoDB;

CREATE TABLE children (
    child_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    daycare_id BIGINT UNSIGNED NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    birth_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (child_id),
    CONSTRAINT fk_children_daycare
        FOREIGN KEY (daycare_id) REFERENCES daycares (daycare_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT ck_children_first_name_not_blank CHECK (TRIM(first_name) <> ''),
    CONSTRAINT ck_children_last_name_not_blank CHECK (TRIM(last_name) <> '')
) ENGINE = InnoDB;

CREATE TABLE parent_child_links (
    child_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NOT NULL,
    relationship VARCHAR(50) NOT NULL,
    PRIMARY KEY (child_id, parent_id),
    CONSTRAINT fk_parent_child_links_child
        FOREIGN KEY (child_id) REFERENCES children (child_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_parent_child_links_parent
        FOREIGN KEY (parent_id) REFERENCES users (user_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT ck_parent_child_links_relationship_not_blank
        CHECK (TRIM(relationship) <> '')
) ENGINE = InnoDB;

CREATE TABLE daily_reports (
    daily_report_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    child_id BIGINT UNSIGNED NOT NULL,
    report_date DATE NOT NULL,
    summary TEXT NULL,
    status ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    published_at DATETIME NULL,
    PRIMARY KEY (daily_report_id),
    CONSTRAINT fk_daily_reports_child
        FOREIGN KEY (child_id) REFERENCES children (child_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT uq_daily_reports_child_date UNIQUE (child_id, report_date),
    CONSTRAINT ck_daily_reports_publication
        CHECK ((status = 'PUBLISHED' AND published_at IS NOT NULL)
            OR status <> 'PUBLISHED')
) ENGINE = InnoDB;

CREATE TABLE daily_report_publishers (
    daily_report_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (daily_report_id, user_id),
    CONSTRAINT fk_daily_report_publishers_report
        FOREIGN KEY (daily_report_id) REFERENCES daily_reports (daily_report_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_daily_report_publishers_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE nap_qualities (
    nap_quality_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    label VARCHAR(50) NOT NULL,
    PRIMARY KEY (nap_quality_id),
    CONSTRAINT uq_nap_qualities_label UNIQUE (label),
    CONSTRAINT ck_nap_qualities_label_not_blank CHECK (TRIM(label) <> '')
) ENGINE = InnoDB;

CREATE TABLE naps (
    nap_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    daily_report_id BIGINT UNSIGNED NOT NULL,
    nap_quality_id BIGINT UNSIGNED NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    comment TEXT NULL,
    PRIMARY KEY (nap_id),
    CONSTRAINT fk_naps_daily_report
        FOREIGN KEY (daily_report_id) REFERENCES daily_reports (daily_report_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_naps_quality
        FOREIGN KEY (nap_quality_id) REFERENCES nap_qualities (nap_quality_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT ck_naps_time_order CHECK (end_time > start_time)
) ENGINE = InnoDB;

CREATE TABLE moods (
    mood_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    label VARCHAR(50) NOT NULL,
    PRIMARY KEY (mood_id),
    CONSTRAINT uq_moods_label UNIQUE (label),
    CONSTRAINT ck_moods_label_not_blank CHECK (TRIM(label) <> '')
) ENGINE = InnoDB;

CREATE TABLE mood_observations (
    mood_observation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    daily_report_id BIGINT UNSIGNED NOT NULL,
    mood_id BIGINT UNSIGNED NOT NULL,
    observed_time TIME NOT NULL,
    comment TEXT NULL,
    PRIMARY KEY (mood_observation_id),
    CONSTRAINT fk_mood_observations_daily_report
        FOREIGN KEY (daily_report_id) REFERENCES daily_reports (daily_report_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_mood_observations_mood
        FOREIGN KEY (mood_id) REFERENCES moods (mood_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE diaper_change_types (
    diaper_change_type_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    label VARCHAR(50) NOT NULL,
    PRIMARY KEY (diaper_change_type_id),
    CONSTRAINT uq_diaper_change_types_label UNIQUE (label),
    CONSTRAINT ck_diaper_change_types_label_not_blank CHECK (TRIM(label) <> '')
) ENGINE = InnoDB;

CREATE TABLE diaper_changes (
    diaper_change_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    daily_report_id BIGINT UNSIGNED NOT NULL,
    diaper_change_type_id BIGINT UNSIGNED NOT NULL,
    change_time TIME NOT NULL,
    comment TEXT NULL,
    PRIMARY KEY (diaper_change_id),
    CONSTRAINT fk_diaper_changes_daily_report
        FOREIGN KEY (daily_report_id) REFERENCES daily_reports (daily_report_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_diaper_changes_type
        FOREIGN KEY (diaper_change_type_id)
        REFERENCES diaper_change_types (diaper_change_type_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE INDEX idx_users_daycare ON users (daycare_id);
CREATE INDEX idx_users_role ON users (role_id);
CREATE INDEX idx_children_daycare_active ON children (daycare_id, is_active);
CREATE INDEX idx_parent_child_links_parent ON parent_child_links (parent_id);
CREATE INDEX idx_daily_reports_date ON daily_reports (report_date DESC);
CREATE INDEX idx_daily_report_publishers_user ON daily_report_publishers (user_id);
CREATE INDEX idx_naps_daily_report ON naps (daily_report_id);
CREATE INDEX idx_mood_observations_report_time
    ON mood_observations (daily_report_id, observed_time);
CREATE INDEX idx_diaper_changes_report_time
    ON diaper_changes (daily_report_id, change_time);
