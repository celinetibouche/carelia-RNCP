# Carelia

Application web de suivi quotidien pour les crèches : bulletin quotidien et messagerie entre l'équipe et les parents.

## Démarrage rapide

```sh
docker compose up -d --build
```

Front : http://localhost:5173 — documentation à compléter.

## Feuille de route — titre RNCP « Concepteur développeur d'applications »

Travaux restant à réaliser sur Carelia pour le titre. Échéance : fin novembre 2026.

| # | Compétence | À réaliser | Effort | État |
| --- | --- | --- | --- | --- |
| C5 | Analyser les besoins et maquetter | Expression des besoins de **F3 Absences**, user stories, diagramme de cas d'utilisation, **maquettes Figma de toute l'application** (nouveau design) et leur enchaînement (exportés dans `docs/maquettes/`) | moyen | à faire |
| C7 | Concevoir une base de données relationnelle | **MCD/MLD** mis à jour (base actuelle + F3) + migration `008_absences.sql` (table `absences`) | moyen | à faire |
| C2, C3, C8 | Réaliser la fonctionnalité conçue | **F3 Absences** : un parent signale l'absence de son enfant, l'équipe voit les absents du jour, avec les règles métier et les droits par rôle | moyen | à faire |
| C2 | Refonte du front | D'après les maquettes : d'abord le socle visuel (couleurs, typographies, composants communs), puis les écrans prioritaires (connexion, accueil, Absences), puis les autres si le temps le permet | moyen à gros | à faire |
| C9 | Plan de tests et jeu d'essai | Plan de tests de F3, tests d'intégration de F3, **cahier de recette** (`docs/recette.md` : entrée, résultat attendu, résultat obtenu) | moyen | à faire |
| C10 | Préparer et documenter le déploiement | `compose.prod.yaml` (images de production, pas de port MySQL exposé, secrets en variables), front servi par nginx, `docs/deploiement.md` (installation, migrations, sauvegarde et restauration, retour arrière) | moyen | à faire |
| C11 | Mise en production DevOps | Pipeline **GitHub Actions** : lint, typecheck, `npm audit`, tests, build des images, puis **déploiement** sur un hébergeur | moyen à gros | à faire |
| C1 | Environnement de travail | Corriger `.env.example` et écrire la section « Installation » de ce README | petit | à faire |

### Ordre de réalisation

1. Import du projet et premier push.
2. Expression des besoins F3, user stories et maquettes de toute l'application (C5).
3. MCD/MLD et migration F3 (C7).
4. F3 Absences : back-end puis écrans (C3, C8, C2).
5. Refonte du front : socle visuel, puis écrans prioritaires (C2).
6. Plan de tests, tests F3 et cahier de recette (C9).
7. Pipeline GitHub Actions (C11).
8. Production : `compose.prod.yaml`, nginx, documentation (C10).
9. Mise en ligne et déploiement continu (C11).
10. `.env.example` et section « Installation » (C1).

À noter au fil de l'eau pour le dossier : la veille sur les failles de sécurité (sites, mots-clés, failles trouvées et corrigées).
