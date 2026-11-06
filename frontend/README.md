# Frontend Carelia

Application React/Vite commune aux trois profils : direction, équipe éducative et parents. Les écrans de connexion, enfants, bulletins, notifications et messagerie sont reliés aux API et à MySQL. Le rendu mobile est limité à 448 px, avec zones tactiles et marges adaptées à l'iPhone.

Le proxy de développement dans `vite.config.ts` envoie `/api/*` vers les cinq services Docker et `/socket.io` vers l'API Users.

La maquette comporte aussi des écrans sans API complète dans cette branche (agenda, santé, documents, menus globaux, présences, planning). Ils ne sont pas présentés comme données réelles.
