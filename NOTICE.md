# Notice

Phasmo Coach — application d’entraînement hors-jeu pour Phasmophobia.
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

Conformément à la demande de l’auteur, aucune URL externe présente dans son code (API, fichiers hébergés)
n’est utilisée par Phasmo Coach, et aucun de ses visuels n’est repris.

## Marques

Phasmophobia, le logo Phasmophobia et les informations, images et sons du jeu sont des marques ou
propriétés de Kinetic Games Limited. Phasmo Coach n’est ni créé, ni affilié, ni approuvé par Kinetic
Games. Il s’agit d’un outil éducatif de fan.

## Polices

Inter (Rasmus Andersson), Fraunces (Undercase Type) et JetBrains Mono (JetBrains) — SIL Open Font
License 1.1. Les licences sont incluses dans `src/assets/fonts/`.
