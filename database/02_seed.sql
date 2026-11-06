USE carelia;

START TRANSACTION;

INSERT INTO roles (label) VALUES
    ('DAYCARE_ADMIN'),
    ('EJE'),
    ('AUXILIARY'),
    ('PARENT');

INSERT INTO nap_qualities (label) VALUES
    ('GOOD'),
    ('AVERAGE'),
    ('RESTLESS');

INSERT INTO moods (label) VALUES
    ('HAPPY'),
    ('CALM'),
    ('TIRED'),
    ('SAD');

INSERT INTO diaper_change_types (label) VALUES
    ('WET'),
    ('SOILED'),
    ('WET_AND_SOILED'),
    ('CLEAN');

INSERT INTO daycares (name) VALUES ('Carelia Demo Daycare');

-- These placeholders cannot authenticate. Set a local password explicitly with
-- `docker compose exec -e CARELIA_ADMIN_PASSWORD=... users npm run bootstrap:admin`.
INSERT INTO users
    (daycare_id, role_id, email, password_hash, last_name, first_name, phone, is_active)
VALUES
    ((SELECT daycare_id FROM daycares WHERE name = 'Carelia Demo Daycare'),
     (SELECT role_id FROM roles WHERE label = 'DAYCARE_ADMIN'),
     'admin@carelia.test', '$argon2id$UNUSABLE_DEMO_HASH', 'Martin', 'Alice',
     '0600000001', TRUE),
    ((SELECT daycare_id FROM daycares WHERE name = 'Carelia Demo Daycare'),
     (SELECT role_id FROM roles WHERE label = 'PARENT'),
     'parent@carelia.test', '$argon2id$UNUSABLE_DEMO_HASH', 'Durand', 'Camille',
     '0600000002', TRUE);

INSERT INTO children (daycare_id, first_name, last_name, birth_date, is_active)
VALUES (
    (SELECT daycare_id FROM daycares WHERE name = 'Carelia Demo Daycare'),
    'Lina', 'Durand', '2023-05-14', TRUE
);

INSERT INTO parent_child_links (child_id, parent_id, relationship)
VALUES (
    (SELECT child_id FROM children WHERE first_name = 'Lina' AND last_name = 'Durand'),
    (SELECT user_id FROM users WHERE email = 'parent@carelia.test'),
    'PARENT'
);

INSERT INTO daily_reports (child_id, report_date, summary, status, published_at)
VALUES (
    (SELECT child_id FROM children WHERE first_name = 'Lina' AND last_name = 'Durand'),
    CURRENT_DATE,
    'Overall, Lina had a good day.',
    'PUBLISHED',
    CURRENT_TIMESTAMP
);

INSERT INTO daily_report_publishers (daily_report_id, user_id)
VALUES (
    (SELECT daily_report_id FROM daily_reports
     WHERE child_id = (SELECT child_id FROM children
                       WHERE first_name = 'Lina' AND last_name = 'Durand')
       AND report_date = CURRENT_DATE),
    (SELECT user_id FROM users WHERE email = 'admin@carelia.test')
);

INSERT INTO naps
    (daily_report_id, nap_quality_id, start_time, end_time, comment)
VALUES (
    (SELECT daily_report_id FROM daily_reports
     WHERE child_id = (SELECT child_id FROM children
                       WHERE first_name = 'Lina' AND last_name = 'Durand')
       AND report_date = CURRENT_DATE),
    (SELECT nap_quality_id FROM nap_qualities WHERE label = 'GOOD'),
    '13:10:00', '14:35:00', 'Fell asleep quickly.'
);

INSERT INTO mood_observations
    (daily_report_id, mood_id, observed_time, comment)
VALUES (
    (SELECT daily_report_id FROM daily_reports
     WHERE child_id = (SELECT child_id FROM children
                       WHERE first_name = 'Lina' AND last_name = 'Durand')
       AND report_date = CURRENT_DATE),
    (SELECT mood_id FROM moods WHERE label = 'HAPPY'),
    '10:15:00', 'Participated well in the games.'
);

INSERT INTO diaper_changes
    (daily_report_id, diaper_change_type_id, change_time, comment)
VALUES (
    (SELECT daily_report_id FROM daily_reports
     WHERE child_id = (SELECT child_id FROM children
                       WHERE first_name = 'Lina' AND last_name = 'Durand')
       AND report_date = CURRENT_DATE),
    (SELECT diaper_change_type_id FROM diaper_change_types WHERE label = 'WET'),
    '11:30:00', NULL
);

COMMIT;
