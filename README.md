# Phasmo Coach

Application web d’entraînement **hors-jeu** pour Phasmophobia, pensée pour un coach et un·e joueur·se :
apprendre les entités, leurs preuves, vitesses, seuils de chasse et tests 0 preuve, puis s’en servir en
situation, sans avoir à tout répéter d’une séance à l’autre.

L’app prend la forme d’un **carnet d’enquête posé sur un bureau** : une double page reliée avec des
intercalaires sur ordinateur, un carnet à spirale sur téléphone. Le jour, la lumière vient de la fenêtre ;
la nuit, c’est une lampe torche qui suit le doigt ou la souris. Le stylo rouge est réservé aux vraies notes
du coach et aux corrections. Les règles de cette direction artistique sont dans `docs/design.md`.

- **Codex** des 30 entités, en français, avec le filtre d’élimination (preuves trouvées / exclues, nombre de
  preuves de la partie, vitesse, seuil de chasse, ligne de vue).
- **Révision espacée** : chaque fiche est découpée en cartes qui reviennent juste avant d’être oubliées
  (1 j, 3 j, 8 j, 20 j…). C’est la « mémoire » de l’app : on ne revoit que ce qui commence à s’effacer.
- **Quiz** générés à partir des fiches (preuves, vitesses & LdV, seuils, comportements, tests 0 preuve,
  questions expertes, vrai/faux sur les mécaniques), orientés vers les entités les moins maîtrisées.
  Chaque erreur fait revenir la carte correspondante en révision.
- **Mises en situation** : une enquête simulée en Professionnel, Cauchemar, Démence ou 0 preuve, avec
  journal d’indices chronologique, carnet de preuves, élimination et désignation de l’entité.
- **À l’oreille** : reconnaître la vitesse d’une entité au rythme de ses pas (sons synthétisés).
- **Carnet du coach** : chaque explication du coach peut devenir une carte de révision ; le carnet se
  partage par simple lien (aucun serveur).
- **Bilan de progression** partageable par lien, export / import de sauvegarde.
- **Jour ou nuit** : le disjoncteur « Lumière » en haut de l’écran bascule le thème (ou dans le profil :
  comme l’appareil, jour, nuit).
- **Installable** sur téléphone (PWA) et utilisable hors ligne.

Tout est stocké dans le navigateur de l’appareil (`localStorage`) : pas de compte, pas de serveur.

## Démarrer

```bash
npm install
npm run dev        # serveur de développement
npm test           # tests du moteur + validation des données
npm run build      # build de production dans dist/
npm run preview    # sert le build
```

Node 22 recommandé (`.nvmrc`).

## Utilisation à deux

1. **La personne qui s’entraîne** installe l’app sur son téléphone (iPhone : Safari → bouton
   *Partager* → *Sur l’écran d’accueil* ; Android : menu de Chrome → *Installer l’application*) et fait
   sa *Révision du jour* (≈ 10 min, réglable dans le profil). Une fois installée, l’app marche hors ligne.
2. **Le coach** écrit ses explications dans le *Carnet du coach* (sur son propre appareil ou directement
   sur celui de l’élève), coche « Ajouter à la révision espacée », puis *Partager par lien*. En ouvrant le
   lien, l’élève importe les notes : elles reviendront d’elles-mêmes en révision.
3. L’élève peut renvoyer un **bilan** (Profil → *Envoyer ma progression au coach*) : maîtrise de chaque
   entité, série de jours, dernières séances.

## Organisation du code

```
src/
  data/          fiches des entités (ghosts/*.json), mécaniques, types, preuves
  engine/        logique pure et testée : SRS, cartes, quiz, enquêtes, filtre, audio, partage
  store/         état persistant (localStorage), actions, hooks
  components/    mise en page (bureau, intercalaires), carnet de preuves, éditeur de notes…
    journal/     le matériel du carnet : fiches, tampons, post-it, polaroïds, traits au stylo, graphiques
  pages/         écrans
  styles/        journal.css (système complet), app.css (éléments de l’app), pages/*.css (un par écran)
  assets/fonts/  polices embarquées (aucune requête externe)
```

### Mettre à jour les données

Chaque entité est un fichier `src/data/ghosts/<id>.json` (schéma : `src/data/types.ts`). Après une
modification, lancer `npm test` : `src/data/data.test.ts` vérifie la cohérence (3 preuves valides,
combinaisons uniques, seuils et vitesses plausibles, questions valides, confusions existantes…).
Une nouvelle entité doit aussi être ajoutée à `GHOST_ORDER` dans `src/data/index.ts`.

## Déploiement

L’app est statique (`dist/`) et fonctionne sur n’importe quel hébergeur, y compris dans un sous-dossier
(routage par `#`).

- **GitHub Pages** : le workflow `.github/workflows/deploy.yml` construit, teste et publie à chaque push
  sur `main` (activer *Settings → Pages → Source : GitHub Actions*).
- **Vercel / Netlify** : commande `npm run build`, dossier `dist`.

## Migrer vers un dépôt dédié

Le projet est autonome dans le dossier `phasmo-coach/` de la branche `phasmo-coach`. Pour le sortir avec
son historique :

```bash
git subtree split --prefix=phasmo-coach -b phasmo-coach-standalone
git push git@github.com:<compte>/phasmo-coach.git phasmo-coach-standalone:main
```

Puis mettre à jour `SOURCE_REPO_URL` dans `src/config.ts` (lien vers le code source affiché dans l’app,
requis par la licence AGPL).

## Pistes pour la suite

- **Pièges du coach** : le coach (700 h de jeu) fournira des situations vécues en partie, pour en faire
  des questions pièges et des enquêtes avec indice trompeur volontaire, expliqué à la fin.
- **Trois tests à trancher** : le site de tybayn marque comme définitifs trois tests que l’app garde
  pour l’instant comme simples indices, faute de certitude (le sel du Spectre face au Gallu,
  les changements de vitesse du Hantu face à l’Obambo, les tests du Moroi face aux Jumeaux et au Gallu).
  L’expérience de jeu du coach tranchera.

Les fiches ont été comparées au site public de la Cheat Sheet (version du jeu v0.19.1.0, octobre 2026),
lu comme le ferait un visiteur : toutes les données de base concordent. L’app n’appelle jamais ce site.

## Sources, crédits et licence

- Données dérivées de l’[Unofficial Phasmo Cheat Sheet](https://github.com/tybayn/phasmo-cheat-sheet) de
  **Ty Bayn (Zero-Network)**, sous licence GNU AGPL v3 : sauvegarde des fiches et textes du wiki,
  traduits en français, complétés pour les entités récentes et vérifiés point par point. La formule
  vitesse → cadence des pas reprend celle de son métronome.
- Phasmo Coach est distribué sous **GNU AGPL v3** (voir `LICENSE` et `NOTICE.md`).
- Phasmophobia, son logo et les informations du jeu appartiennent à **Kinetic Games Limited**. Projet de
  fan à but éducatif, non créé ni approuvé par Kinetic Games. Aucune image ni aucun son du jeu n’est
  utilisé : les bruits de pas sont synthétisés.
- Polices embarquées (`src/assets/fonts/`, licences incluses) : IM Fell English, Libre Caslon Text,
  Courier Prime et Caveat sous SIL Open Font License 1.1 ; Special Elite sous Apache 2.0.
