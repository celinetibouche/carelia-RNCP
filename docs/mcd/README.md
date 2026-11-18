# Modèle de données : MCD et MLD

Méthode Merise, outil **Mocodo** (le MCD s'écrit en texte, Mocodo le dessine et en déduit le MLD).

| Fichier | Contenu |
| --- | --- |
| `MCD.mcd` | MCD complet (référence du MLD) |
| `vue-structure-absences.mcd` / `.png` | Vue 1 : crèche, utilisateurs, rôles, enfants et **F3 Absences** |
| `vue-bulletin.mcd` / `.png` | Vue 2 : F1 bulletin quotidien |
| `vue-messagerie.mcd` / `.png` | Vue 3 : F2 messagerie |

Le MCD complet compte 17 entités et 23 associations : dessiné d'un seul tenant, il est illisible.
Il est donc présenté en **trois vues par domaine**. ENFANT et UTILISATEUR, partagés, sont détaillés
dans la vue 1 et réduits à leur identifiant dans les vues 2 et 3.

Base de départ : MCD du projet de groupe, qui ne couvrait que le premier bulletin. Il a été vérifié
face à la base réelle (`database/01_schema.sql` + `backend/migrations/`), complété (repas, activités,
notifications, messagerie, détails de l'enfant et du bulletin), puis enrichi de F3 Absences.

## Choix de modélisation

- **Le MCD ne contient que les données métier**, telles qu'une directrice de crèche les décrirait.
  Les tables techniques n'y figurent pas (voir plus bas).
- **Tables de complément fusionnées** : `child_details` (groupe, contact d'urgence) et
  `daily_report_content` (mot aux parents) sont des relations 1-1 ajoutées par migration pour ne pas
  modifier les tables d'origine. Conceptuellement, ce sont des attributs de ENFANT et de BULLETIN.
- **Entités faibles** (identifiant relatif, cardinalité `_11`) : un REPAS ou une ACTIVITE n'existe
  qu'à l'intérieur d'un bulletin. Un repas est identifié par son bulletin **et** son type
  (plat, dessert, goûter) : un seul plat par bulletin.
- **Tables de référence** pour les listes de valeurs : HUMEUR, QUALITE_SIESTE, TYPE_CHANGE, ROLE et
  MOTIF_ABSENCE. Pour MOTIF_ABSENCE, l'attribut `a_justifier` porte une règle métier dans les données.
- **Associations porteuses de données** : LIER_PARENT_ENFANT (lien de parenté), NOTIFIER (dates de
  notification et de lecture), RECEVOIR (date de lecture d'un message).

### F3 Absences

- ABSENCE est reliée à l'ENFANT concerné (1,1), à l'UTILISATEUR qui l'a déclarée (1,1 : parent ou
  membre de l'équipe) et à son MOTIF_ABSENCE (1,1).
- `date_reception_justificatif` vide = justificatif non reçu ; la date sert à la règle des 7 jours (RG11).
- `date_declaration` + le rôle du déclarant servent à la règle des 48 h (RG6).
- Une absence annulée est **supprimée** : pas d'historique (choix fonctionnel).

## Passage du MCD au MLD (règles appliquées par Mocodo)

1. Chaque **entité** devient une table ; son identifiant devient la clé primaire.
2. Association **(1,1) – (0,N)** : la table du côté (1,1) reçoit une **clé étrangère** vers l'autre
   (ex. `ABSENCE.#id_enfant`).
3. Association **(0,N) – (0,N)** : elle devient une **table d'association**, dont la clé primaire est
   formée des deux clés étrangères (ex. `LIER_PARENT_ENFANT`, `NOTIFIER`, `RECEVOIR`).
4. **Entité faible** : sa clé primaire = clé étrangère de l'entité forte + discriminant
   (ex. `REPAS (#id_bulletin, type_repas)`).

## MLD

Clé primaire soulignée, clé étrangère précédée de `#`.

- **CRECHE** (<u>id_creche</u>, nom)
- **ROLE** (<u>id_role</u>, libelle)
- **UTILISATEUR** (<u>id_utilisateur</u>, email, mot_de_passe_hache, nom, prenom, telephone, adresse, actif, #id_creche, #id_role)
- **ENFANT** (<u>id_enfant</u>, prenom, nom, date_naissance, actif, groupe, contact_urgence_nom, contact_urgence_tel, #id_creche)
- **LIER_PARENT_ENFANT** (<u>#id_enfant</u>, <u>#id_utilisateur</u>, lien)
- **BULLETIN** (<u>id_bulletin</u>, date, resume, statut, date_publication, note_parents, #id_enfant)
- **PUBLIER_BULLETIN** (<u>#id_bulletin</u>, <u>#id_utilisateur</u>)
- **NOTIFIER** (<u>#id_bulletin</u>, <u>#id_utilisateur</u>, date_notification, date_lecture)
- **SIESTE** (<u>id_sieste</u>, heure_debut, heure_fin, commentaire, #id_bulletin, #id_qualite_sieste)
- **QUALITE_SIESTE** (<u>id_qualite_sieste</u>, libelle)
- **CHANGE** (<u>id_change</u>, heure_change, commentaire, #id_bulletin, #id_type_change)
- **TYPE_CHANGE** (<u>id_type_change</u>, libelle)
- **OBSERVATION_HUMEUR** (<u>id_observation_humeur</u>, heure, commentaire, #id_bulletin, #id_humeur)
- **HUMEUR** (<u>id_humeur</u>, libelle)
- **REPAS** (<u>#id_bulletin</u>, <u>type_repas</u>, quantite_mangee, libelle)
- **ACTIVITE** (<u>#id_bulletin</u>, <u>libelle</u>)
- **CONVERSATION** (<u>id_conversation</u>, date_creation, date_derniere_activite, #id_enfant, #id_utilisateur)
- **MESSAGE** (<u>id_message</u>, contenu, date_envoi, #id_conversation, #id_utilisateur)
- **RECEVOIR** (<u>#id_message</u>, <u>#id_utilisateur</u>, date_lecture)
- **ABSENCE** (<u>id_absence</u>, date_debut, date_fin, commentaire, date_declaration, date_reception_justificatif, #id_enfant, #id_utilisateur, #id_motif)
- **MOTIF_ABSENCE** (<u>id_motif</u>, libelle, a_justifier)

## Du MLD aux tables réelles (MySQL, noms en anglais)

| MLD | Table réelle | Écart et justification |
| --- | --- | --- |
| CRECHE, ROLE, UTILISATEUR, ENFANT | `daycares`, `roles`, `users`, `children` | ENFANT est découpé en `children` + `child_details` (ajout par migration sans toucher la table d'origine) |
| LIER_PARENT_ENFANT | `parent_child_links` | |
| BULLETIN | `daily_reports` + `daily_report_content` | Même découpage ; `daily_report_content.revision` sert à détecter les modifications concurrentes (technique) |
| PUBLIER_BULLETIN | `daily_report_publishers` | |
| NOTIFIER | `report_notifications` | Clé technique `notification_id` + contrainte `UNIQUE (report_id, parent_id)`, équivalente à la clé composée du MLD |
| SIESTE, CHANGE, OBSERVATION_HUMEUR | `naps`, `diaper_changes`, `mood_observations` | |
| QUALITE_SIESTE, TYPE_CHANGE, HUMEUR | `nap_qualities`, `diaper_change_types`, `moods` | |
| REPAS, ACTIVITE | `daily_report_meals`, `daily_report_activities` | `type_repas` et `quantite_mangee` en `ENUM` (listes fixes, sans règle associée) |
| CONVERSATION | `official_conversations` | Ajoute `daycare_id` (redondant, déductible via l'enfant) pour filtrer vite par crèche ; `UNIQUE (child_id, parent_id)` : une conversation par couple enfant-parent |
| MESSAGE, RECEVOIR | `official_messages`, `official_message_recipients` | |
| ABSENCE, MOTIF_ABSENCE | `absences`, `absence_reasons` | À créer : migration `008_absences.sql` |

### Contraintes qui ne se voient pas sur le MCD

- Un seul bulletin par enfant et par jour : `UNIQUE (child_id, report_date)`.
- E-mail unique par utilisateur ; libellés uniques dans les tables de référence.
- Absences (à créer) : `date_fin >= date_debut` (RG4) ; le non-chevauchement (RG8) et les délais
  (RG5, RG6, RG10) sont vérifiés par le back-end, car ils dépendent de la date du jour et du rôle.

### Tables techniques (hors MCD)

| Table | Rôle |
| --- | --- |
| `auth_sessions` | Sessions de connexion (empreinte du jeton, expiration) |
| `report_events` | Journal des changements de bulletin, pour le temps réel |
| `official_message_events` | Journal des événements de messagerie, pour le temps réel |
| `official_message_audit` | Traces d'audit de la messagerie (sécurité, suppression des messages) |

Elles servent au fonctionnement de l'application (authentification, synchronisation, traçabilité)
et ne décrivent pas le métier de la crèche : elles n'ont pas leur place dans un MCD.
