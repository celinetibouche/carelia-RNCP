-- F3 Absences : motifs (table de référence) et absences déclarées pour un enfant.
-- Voir docs/besoins.md (règles RG1 à RG11) et docs/mcd/README.md (entités ABSENCE et MOTIF_ABSENCE).

CREATE TABLE IF NOT EXISTS absence_reasons (
    reason_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    -- Code stable en anglais, traduit par le front (comme moods ou nap_qualities).
    label VARCHAR(50) NOT NULL,
    -- Règle métier portée par la donnée : maladie et rendez-vous attendent un justificatif,
    -- une absence injustifiée n'en a pas (mais exige un commentaire, contrôlé par le back-end).
    requires_document BOOLEAN NOT NULL,
    CONSTRAINT uq_absence_reasons_label UNIQUE (label)
) ENGINE = InnoDB;

-- Valeurs indispensables au fonctionnement : insérées ici et non dans database/02_seed.sql,
-- qui ne s'exécute que sur une base vide. INSERT IGNORE évite une erreur si elles existent déjà.
INSERT IGNORE INTO absence_reasons (label, requires_document) VALUES
    ('ILLNESS', TRUE),
    ('APPOINTMENT', TRUE),
    ('UNJUSTIFIED', FALSE);

CREATE TABLE IF NOT EXISTS absences (
    absence_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    child_id BIGINT UNSIGNED NOT NULL,
    reason_id BIGINT UNSIGNED NOT NULL,
    -- Parent ou membre de l'équipe qui a déclaré l'absence (sert à la règle des 48 h, RG6).
    -- NULL si son compte a été supprimé depuis : l'absence, elle, est conservée.
    declared_by BIGINT UNSIGNED NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    comment VARCHAR(500) NULL,
    declared_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    -- Date de remise du justificatif papier ; NULL tant qu'il n'est pas reçu (RG11).
    document_received_at DATETIME(3) NULL,
    -- RG4 : la fin ne peut pas précéder le début. Les autres règles (date passée, chevauchement,
    -- délais de 48 h et 24 h) dépendent de la date du jour ou du rôle : elles sont dans le back-end.
    CONSTRAINT chk_absences_dates CHECK (end_date >= start_date),
    -- Absences d'un enfant : liste à venir et contrôle de chevauchement (RG8).
    KEY idx_absences_child_dates (child_id, start_date, end_date),
    -- Absents du jour : start_date <= aujourd'hui <= end_date.
    KEY idx_absences_dates (start_date, end_date),
    -- Un enfant supprimé emporte ses absences.
    CONSTRAINT fk_absences_child FOREIGN KEY (child_id)
        REFERENCES children (child_id) ON DELETE CASCADE,
    -- Un motif encore utilisé ne peut pas être supprimé.
    CONSTRAINT fk_absences_reason FOREIGN KEY (reason_id)
        REFERENCES absence_reasons (reason_id) ON DELETE RESTRICT,
    CONSTRAINT fk_absences_declared_by FOREIGN KEY (declared_by)
        REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE = InnoDB;
