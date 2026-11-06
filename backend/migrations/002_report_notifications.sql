CREATE TABLE IF NOT EXISTS report_notifications (
    notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    report_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_report_notification_parent (report_id, parent_id),
    KEY idx_report_notifications_parent_created (parent_id, created_at DESC),
    CONSTRAINT fk_report_notifications_report FOREIGN KEY (report_id)
        REFERENCES daily_reports (daily_report_id) ON DELETE CASCADE,
    CONSTRAINT fk_report_notifications_parent FOREIGN KEY (parent_id)
        REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;
