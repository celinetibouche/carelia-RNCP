# Carelia

Application web de suivi quotidien pour les crèches : bulletin quotidien et messagerie entre l'équipe et les parents.

## Démarrage rapide

```sh
docker compose up -d --build
```

Front : http://localhost:5173 — documentation à compléter.

## Feuille de route — titre RNCP « Concepteur développeur d'applications »

Travaux prévus pour couvrir les 11 compétences du titre (échéance : fin novembre 2026).

| # | Compétence | À réaliser | Effort | État |
| --- | --- | --- | --- | --- |
| C1 | Installer et configurer son environnement de travail | Corriger `.env.example` (aligné sur `compose.yaml`) et rédiger la section « Installation » de ce README | petit | à faire |
| C2 | Développer des interfaces utilisateur | Écrans **F3 Événements** : liste, détail, inscription d'un parent | moyen | à faire |
| C3 | Développer des composants métier | Back-end **F3** : règles d'inscription, places limitées, droits par rôle | gros | à faire |
| C4 | Contribuer à la gestion d'un projet informatique | Issues, tableau et jalons GitHub (une issue par tâche, fermée par le commit correspondant) ; commits au format `feat:` / `fix:` / `docs:` | petit, en continu | à faire |
| C5 | Analyser les besoins et maquetter une application | Expression des besoins, user stories de F3, diagramme de cas d'utilisation, **maquettes Figma** (exportées dans `docs/maquettes/`) | moyen | à faire |
| C6 | Définir l'architecture logicielle | `docs/architecture.md` : schéma à jour (Redis, production) et justification des choix | petit | à faire |
| C7 | Concevoir et mettre en place une base de données relationnelle | **MCD/MLD** complets (avec F3) + migration `008_events.sql` (`events`, `event_registrations`) | moyen | à faire |
| C8 | Développer des composants d'accès aux données SQL et NoSQL | Repository F3 avec transactions + **Redis** pour limiter les tentatives de connexion sur `POST /api/auth/login` (réponse 429) | moyen | à faire |
| C9 | Préparer et exécuter les plans de tests | Plan de tests ; tests d'intégration de `users.routes.ts` (mot de passe < 8 ou > 72 caractères → 400, hash bcrypt stocké, `roleId` inexistant → 400) et de F3 ; tests e2e Playwright ; cahier de recette (`docs/recette.md`) ; mesure de couverture | moyen | à faire |
| C10 | Préparer et documenter le déploiement | `compose.prod.yaml` (images de production, pas de port MySQL exposé, secrets en variables), Dockerfiles avec étapes `build`/`production` (front servi par nginx), `docs/deploiement.md` (installation, migrations, sauvegarde et restauration, retour arrière) | moyen | à faire |
| C11 | Contribuer à la mise en production dans une démarche DevOps | Pipeline **GitHub Actions** : lint, typecheck, `npm audit`, tests, build des images, puis **déploiement** sur un hébergeur | moyen à gros | à faire |

### Ordre de réalisation

1. Import du projet et premier push.
2. Pipeline GitHub Actions (C11) : elle vérifie automatiquement la suite.
3. Tests de `users.routes.ts` (C9).
4. Expression des besoins, user stories et maquettes F3 (C5).
5. MCD/MLD et migration F3 (C7).
6. Back-end F3 (C3, C8), puis écrans F3 (C2).
7. Redis pour la limitation des connexions (C8 NoSQL).
8. Production : `compose.prod.yaml`, nginx, documentation (C10).
9. Mise en ligne et déploiement continu (C11).
10. Cahier de recette, documentation d'architecture, README (C9, C6, C1).

Version minimale de F3 si le temps manque : créer un événement, s'y inscrire, voir les inscrits.
