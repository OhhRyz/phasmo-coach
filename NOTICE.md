# Notice

Phasmo Coach — application d’entraînement hors-jeu pour Phasmophobia.
Copyright (C) 2026 les auteurs de Phasmo Coach.
Licence : GNU Affero General Public License v3.0 (fichier `LICENSE`).

## Œuvre dérivée

Les fiches des entités (`src/data/ghosts/*.json`) et les fiches de mécaniques (`src/data/mechanics.json`)
sont dérivées du projet **Unofficial Phasmo Cheat Sheet** de Ty Bayn (Zero-Network) :
https://github.com/tybayn/phasmo-cheat-sheet — GNU AGPL v3.

Éléments repris et transformés :

- la sauvegarde structurée des fiches (`backup-data/ghosts_backup.json`, historique du dépôt, version de
  jeu b0.11.1.1), traduite en français et mise à jour ;
- les textes du wiki (`lang-v10/*/wiki.json`), utilisés comme source pour les entités récentes et les
  mécaniques ;
- la relation vitesse → cadence des pas du métronome (`scripts-v10/metronome-v7.js`).

Les fiches ont ensuite été comparées, en octobre 2026, au site public de la Cheat Sheet (version du jeu
v0.19.1.0), consulté comme une page web ordinaire, sans utiliser son API.

Conformément à la demande de l’auteur, aucune URL externe présente dans son code (API, fichiers hébergés)
n’est utilisée par Phasmo Coach, et aucun de ses visuels n’est repris.

## Marques

Phasmophobia, le logo Phasmophobia et les informations, images et sons du jeu sont des marques ou
propriétés de Kinetic Games Limited. Phasmo Coach n’est ni créé, ni affilié, ni approuvé par Kinetic
Games. Il s’agit d’un outil éducatif de fan.

## Polices

Les polices sont embarquées dans `src/assets/fonts/`, avec leurs licences (aussi publiées avec le site,
dans `licences/`) :

- IM Fell English (Igino Marini) — SIL Open Font License 1.1 ;
- Libre Caslon Text (Pablo Impallari, Rodrigo Fuenzalida) — SIL Open Font License 1.1 ;
- Courier Prime (Quote-Unquote Apps) — SIL Open Font License 1.1 ;
- Caveat (Impallari Type) — SIL Open Font License 1.1 ;
- Special Elite (Astigmatic) — Apache License 2.0.

## Code d’autres projets

- qrcode-generator 2.0.4 (Kazuhiko Arase) — licence MIT ; dessine sur l’appareil le code QR de la page
  « Installer l’app ». Texte de la licence dans `public/licences/LICENSE-qrcode-generator.txt` (publié
  avec le site, dans `licences/`).
