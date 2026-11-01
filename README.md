# Phasmo Coach

**En ligne : https://phasmo-coach.vercel.app** (à ouvrir dans Safari ou Chrome, puis « Sur l’écran d’accueil »).

Application web d’entraînement **hors-jeu** pour Phasmophobia, pour tout le monde : apprendre les
entités, leurs preuves, vitesses, seuils de chasse et tests 0 preuve, puis s’en servir en situation. Elle
marche seule ; un coach peut s’y ajouter (page *Coaching*) pour ne pas avoir à tout répéter d’une séance
à l’autre.

L’app prend la forme d’un **carnet d’enquête posé sur un bureau** : une double page reliée avec des
intercalaires sur ordinateur, un carnet à spirale sur téléphone. Le jour, la lumière vient de la fenêtre ;
la nuit, c’est une lampe torche qui suit le doigt ou la souris. Le stylo rouge est réservé aux vraies notes
du coach et aux corrections. Les règles de cette direction artistique sont dans `docs/design.md`.

- **Codex** des 30 entités, en français, avec le filtre d’élimination (preuves trouvées / exclues, nombre de
  preuves de la partie, vitesse, seuil de chasse, ligne de vue).
- **Réviser** (révision espacée) : chaque jour, des questions à choix multiple tirées des fiches. Une
  question bien répondue revient de plus en plus tard (1 j, 3 j, 8 j, 20 j…), une erreur revient vite.
  C’est la « mémoire » de l’app : on ne revoit que ce qui commence à s’effacer.
- **Quiz** générés à partir des fiches, centrés sur ce qui sert sans preuve : comportements, vitesse et
  ligne de vue, seuils de chasse, tests sans preuve, comment distinguer deux entités, questions expertes,
  vrai/faux sur les mécaniques. Les preuves restent dans le codex et les fiches, sans être à apprendre par
  cœur. Les questions visent d’abord les entités les moins maîtrisées. Une erreur ramène dans la révision du jour la carte correspondante, si elle était déjà apprise.
- **Mises en situation** : un contrat raconté rapport par rapport en Professionnel (conseillé pour
  débuter), Cauchemar, Démence ou 0 preuve, avec carnet de preuves, élimination et désignation de l’entité.
- **À l’oreille** : reconnaître la vitesse d’une entité au rythme de ses pas (sons synthétisés).
- **Mes notes** : chacun y écrit ses notes (une astuce, une erreur à ne plus refaire…), qui peuvent
  revenir en révision ; export / import de sauvegarde.
- **Coaching** (facultatif, lien en bas de chaque page) : le carnet à deux. Les notes du coach se
  partagent par simple lien (aucun serveur) et sont les seules écrites au stylo rouge ; en retour, un
  **bilan de progression** par lien (maîtrise de chaque entité, série, notes du coach retenues ou à
  reprendre).
- **Jour ou nuit** : le disjoncteur « Lumière » en haut de l’écran bascule le thème (ou dans le profil :
  comme l’appareil, jour, nuit).
- **Installable** sur téléphone (PWA) et utilisable hors ligne.

Tout est stocké dans le navigateur de l’appareil (`localStorage`) : pas de compte, pas de serveur.

### Se repérer

- **Onglets** (les mêmes mots partout) : *Accueil · Réviser · Codex · Exercices · Mécaniques · Mes notes*
  sur ordinateur ; sur téléphone *Accueil · Réviser · Codex · Exercices · Notes* (les Mécaniques sont
  rangées dans *Exercices*).
- **Mode d’emploi** : à la première ouverture, une fiche en trois étapes (Réviser chaque jour, les
  Exercices dans les enveloppes, le Codex pendant une partie) ; on la range d’un clic et on la rouvre par
  le lien « Mode d’emploi » en bas de chaque page.
- **Exercices** : les enveloppes disent ce qu’on y fait, combien de temps, et le geste pour l’ouvrir ;
  « À faire » (révision, contrat, quiz, oreille) puis « À lire » (mécaniques, codex). Chaque exercice
  commence par une ligne « Consigne » et finit par « et maintenant ? ».
- **Vocabulaire** : « carnet de preuves » désigne seulement les cases à cocher du codex et de la mise en
  situation ; les notes personnelles sont « Mes notes ».

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

L’app marche seule pour n’importe qui : un nouveau carnet demande seulement un prénom. Le coaching est
facultatif et se règle sur la page **Coaching**, ouverte depuis le lien en bas de chaque page (ou depuis
le profil) : « Seul·e », « Je suis coaché·e » ou « Je coache quelqu’un ».

1. **La personne qui s’entraîne** installe l’app sur son téléphone (iPhone : Safari → bouton
   *Partager* → *Sur l’écran d’accueil* ; Android : menu de Chrome → *Installer l’application*) et fait
   sa *Révision du jour* (≈ 5 à 10 min, réglable dans le profil). Une fois installée, l’app marche hors ligne.
   L’app le rappelle elle-même tant qu’elle tourne dans un onglet : sur iPhone, Safari peut effacer les
   données d’un site non installé après 7 jours sans visite.
2. **Le coach** ouvre l’app sur son propre appareil, choisit « Je coache quelqu’un » sur la page
   *Coaching*, écrit ses explications dans *Mes notes* en cochant la case de révision, puis
   *Coaching → Partager mes notes*. Par défaut, le lien ne contient que ses propres notes, nouvelles ou
   modifiées depuis le dernier envoi (pour rester assez court pour Discord) ; « Toutes mes notes » envoie
   l’ensemble.
3. **La personne coachée** ouvre le lien reçu. Si l’app est installée sur l’écran d’accueil, elle copie le
   lien et le colle dans *Coaching → Coller un lien reçu* : sur iPhone, un lien touché dans Discord ou
   Messages s’ouvre dans Safari, qui n’a pas la même mémoire que l’app installée. Un carnet « seul·e » qui
   reçoit des notes passe de lui-même en « coaché·e », avec l’expéditeur comme coach. Les notes du coach
   s’écrivent au stylo rouge dans ses notes et reviennent d’elles-mêmes en révision.
4. Elle renvoie un **bilan** (*Coaching → Envoyer ma progression à …*) : maîtrise de chaque entité, série
   de jours, dernières séances et notes du coach retenues ou à reprendre. Le coach l’ouvre d’un simple
   clic (ou le colle dans *Coaching → Coller un bilan reçu*).

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

- **Vercel** (mise en ligne actuelle) : le projet Vercel est relié à ce dépôt. Chaque push sur `main` est
  mis en ligne automatiquement ; chaque autre branche obtient son adresse d’aperçu. Réglages dans
  `vercel.json` (build `npm run build`, dossier `dist`, pas de cache sur le service worker).
- **Vérifications** : le workflow `.github/workflows/ci.yml` lance les tests et le build à chaque push.
- **Ailleurs** (Netlify, GitHub Pages…) : commande `npm run build`, dossier `dist`.

`SOURCE_REPO_URL` dans `src/config.ts` est le lien vers le code source affiché dans *À propos*, requis par
la licence AGPL : il doit toujours pointer vers ce dépôt public.

Les icônes de l’app se régénèrent avec `node scripts/make-icons.cjs` (Playwright requis).

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
