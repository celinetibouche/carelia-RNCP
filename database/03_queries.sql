USE carelia;

-- 1. Active children in a daycare
SELECT c.child_id, c.first_name, c.last_name, c.birth_date
FROM children AS c
JOIN daycares AS d ON d.daycare_id = c.daycare_id
WHERE d.name = 'Carelia Demo Daycare' AND c.is_active
ORDER BY c.last_name, c.first_name;

-- 2. A child's complete daily report for a given date
SELECT dr.daily_report_id, dr.report_date, dr.summary, dr.status,
       c.first_name, c.last_name,
       n.start_time, n.end_time, nq.label AS nap_quality,
       mo.observed_time, m.label AS mood,
       dc.change_time, dct.label AS diaper_change_type
FROM daily_reports AS dr
JOIN children AS c ON c.child_id = dr.child_id
LEFT JOIN naps AS n ON n.daily_report_id = dr.daily_report_id
LEFT JOIN nap_qualities AS nq ON nq.nap_quality_id = n.nap_quality_id
LEFT JOIN mood_observations AS mo ON mo.daily_report_id = dr.daily_report_id
LEFT JOIN moods AS m ON m.mood_id = mo.mood_id
LEFT JOIN diaper_changes AS dc ON dc.daily_report_id = dr.daily_report_id
LEFT JOIN diaper_change_types AS dct
    ON dct.diaper_change_type_id = dc.diaper_change_type_id
WHERE c.child_id = 1 AND dr.report_date = CURRENT_DATE;

-- 3. Published reports visible to a parent
SELECT dr.daily_report_id, dr.report_date, dr.summary, dr.published_at,
       c.child_id, c.first_name, c.last_name
FROM users AS u
JOIN parent_child_links AS pcl ON pcl.parent_id = u.user_id
JOIN children AS c ON c.child_id = pcl.child_id
JOIN daily_reports AS dr ON dr.child_id = c.child_id
WHERE u.email = 'parent@carelia.test'
  AND dr.status = 'PUBLISHED'
ORDER BY dr.report_date DESC;

-- 4. Create tomorrow's draft without duplicating child/date
INSERT INTO daily_reports (child_id, report_date, status)
VALUES (1, CURRENT_DATE + INTERVAL 1 DAY, 'DRAFT')
ON DUPLICATE KEY UPDATE daily_report_id = LAST_INSERT_ID(daily_report_id);

SELECT *
FROM daily_reports
WHERE daily_report_id = LAST_INSERT_ID();
