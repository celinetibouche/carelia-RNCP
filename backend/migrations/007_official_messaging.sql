CREATE TABLE IF NOT EXISTS official_conversations (
    conversation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    daycare_id BIGINT UNSIGNED NOT NULL,
    child_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_activity_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_conversation_child_parent (child_id, parent_id),
    KEY idx_official_conversations_daycare_activity (daycare_id, last_activity_at DESC, conversation_id DESC),
    KEY idx_official_conversations_parent_activity (parent_id, last_activity_at DESC, conversation_id DESC),
    CONSTRAINT fk_official_conversations_daycare FOREIGN KEY (daycare_id) REFERENCES daycares (daycare_id),
    CONSTRAINT fk_official_conversations_child FOREIGN KEY (child_id) REFERENCES children (child_id) ON DELETE CASCADE,
    CONSTRAINT fk_official_conversations_parent FOREIGN KEY (parent_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS official_messages (
    message_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    conversation_id BIGINT UNSIGNED NOT NULL,
    sender_id BIGINT UNSIGNED NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_official_messages_page (conversation_id, message_id DESC),
    KEY idx_official_messages_created (created_at),
    CONSTRAINT fk_official_messages_conversation FOREIGN KEY (conversation_id)
        REFERENCES official_conversations (conversation_id) ON DELETE CASCADE,
    CONSTRAINT fk_official_messages_sender FOREIGN KEY (sender_id)
        REFERENCES users (user_id),
    CONSTRAINT ck_official_messages_body CHECK (CHAR_LENGTH(TRIM(body)) BETWEEN 1 AND 2000)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS official_message_recipients (
    message_id BIGINT UNSIGNED NOT NULL,
    recipient_id BIGINT UNSIGNED NOT NULL,
    read_at DATETIME(3) NULL,
    PRIMARY KEY (message_id, recipient_id),
    KEY idx_official_message_recipients_unread (recipient_id, read_at, message_id),
    CONSTRAINT fk_official_message_recipients_message FOREIGN KEY (message_id)
        REFERENCES official_messages (message_id) ON DELETE CASCADE,
    CONSTRAINT fk_official_message_recipients_user FOREIGN KEY (recipient_id)
        REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS official_message_events (
    event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    conversation_id BIGINT UNSIGNED NOT NULL,
    message_id BIGINT UNSIGNED NULL,
    event_type ENUM('CREATED', 'MESSAGE', 'READ') NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_official_message_events_conversation FOREIGN KEY (conversation_id)
        REFERENCES official_conversations (conversation_id) ON DELETE CASCADE,
    CONSTRAINT fk_official_message_events_message FOREIGN KEY (message_id)
        REFERENCES official_messages (message_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS official_message_audit (
    audit_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    actor_id BIGINT UNSIGNED NULL,
    conversation_id BIGINT UNSIGNED NULL,
    action ENUM('CONVERSATION_CREATED', 'MESSAGE_SENT', 'MESSAGE_READ', 'MESSAGES_PURGED') NOT NULL,
    occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_official_message_audit_occurred (occurred_at),
    CONSTRAINT fk_official_message_audit_actor FOREIGN KEY (actor_id)
        REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_official_message_audit_conversation FOREIGN KEY (conversation_id)
        REFERENCES official_conversations (conversation_id) ON DELETE SET NULL
) ENGINE = InnoDB;
