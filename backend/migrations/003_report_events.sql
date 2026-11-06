CREATE TABLE IF NOT EXISTS report_events (
    event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    report_id BIGINT UNSIGNED NOT NULL,
    child_id BIGINT UNSIGNED NOT NULL,
    revision INT UNSIGNED NOT NULL,
    status ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_report_events_created (created_at),
    CONSTRAINT fk_report_events_report FOREIGN KEY (report_id)
        REFERENCES daily_reports (daily_report_id) ON DELETE CASCADE
) ENGINE = InnoDB;
