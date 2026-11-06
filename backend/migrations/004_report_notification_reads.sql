ALTER TABLE report_notifications
    ADD COLUMN read_at DATETIME(3) NULL;

CREATE INDEX idx_report_notifications_parent_unread
    ON report_notifications (parent_id, read_at, created_at);
