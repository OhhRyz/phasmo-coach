# Direction artistique : « Le journal d’enquête »

L’app est le carnet d’enquête du joueur, posé sur un bureau. Sur ordinateur : une double page reliée,
avec des intercalaires colorés comme navigation. Sur téléphone : un carnet de reporter à spirale, les
intercalaires deviennent des onglets en bas. Le thème clair est la lumière du jour (fenêtre) ; le thème
sombre, le même bureau la nuit, éclairé par une lampe torche qui suit le pointeur (le disjoncteur
« Lumière ON/OFF » bascule entre les deux).

Feuilles de style : `src/styles/journal.css` (système complet, issu de la maquette), `src/styles/app.css`
(éléments propres à l’app), `src/styles/pages/<page>.css` (une feuille par écran).

## Les trois voix (règle d’or)

| Voix | Police | Sert à |
|------|--------|--------|
| Imprimé | IM Fell English (titres, noms) + Libre Caslon Text (lecture) | le savoir : fiches, explications |
| Tapé | Special Elite + Courier Prime | le dossier : données, en-têtes, compteurs, boutons |
| Manuscrit | Caveat | la main : **stylo rouge** = le coach (ses vraies notes) et la correction (notes, cercles, « acquise ») ; **crayon** = les annotations de l’app |

- On n’invente jamais de phrase au nom du coach : l’écriture rouge signée n’affiche que ses notes réelles.
- Tout ce qui juge ou évalue est un tampon, un cercle au stylo ou une coche, jamais une pastille ni une
  tuile de statistiques.
- L’action principale d’un écran est toujours la bande Dymo rouge (`TapeButton`). Les actions
  secondaires : `TypedLink` (texte tapé souligné au stylo rouge) ou `PaperButton` (étiquette collée).
- Pas d’icônes décoratives, pas d’emoji, pas de dégradés « techno ».

## Composants (`src/components/journal/Journal.tsx`)

- Mise en page : `Notebook` (double page : deux `Page side="left|right"` ; `single` pour une seule page),
  `Page` (`section="1…6"` = couleur de l’intercalaire : 1 Aujourd’hui, 2 Réviser, 3 Codex,
  4 S’entraîner, 5 Mécaniques, 6 Carnet), `FileHead` (bandeau tapé en haut de page), `H` (titre imprimé +
  compteur tapé), `MarginNote` (note dans la marge, positionnée en absolu sur ordinateur, en flux sur mobile).
- Matière : `IndexCard` (fiche bristol lignée, trombone facultatif), `Sticky` (post-it du coach),
  `Envelope` (enveloppe kraft vers un exercice), `Polaroid` (photo générée d’une entité), `Tape`,
  `Stamp` (`tone` red/violet/pencil/ink, `small`, `thunk` pour l’arrivée tamponnée).
- Traits : `RoughCircle` (cercle au stylo autour d’un contenu), `RoughUnderline`, `JournalBox` (case du
  journal : vide, cochée dans la couleur de la preuve, ou barrée au crayon), `CircledNumber`, `Tally`.
- Formulaires : `CheckLine` (case à cocher du journal), `PaperButton`, et dans `components/ui.tsx` :
  `Seg` (options entourées au stylo), `Modal` (fiche bristol posée), `Empty`, `Evidence` / `GhostEvidence`
  (nom de preuve souligné dans sa couleur), `Mastery` (coup de surligneur), `ProgressBar` (trait rouge).
- Graphiques : `components/journal/Charts.tsx` (`SanityChart`, `SpeedChart`, `UvPrint` pour une empreinte
  UV visible seulement sous la lampe torche, `HatchDefs` pour les hachures).
- Carnet de preuves : `components/EvidenceTracker.tsx` (cases du journal cliquables, 3 états).

Classes utiles de `journal.css` : `.entry`, `.entry-date`, `.plan`, `.registry`, `.ev-list/.ev`, `.tells`,
`.protocol`, `.elim`, `.conf`, `.obs`, `.libcard`, `.measure`, `.chart`, `.desk-shelf`, `.envelopes`,
`.notes`, `.sources`, `.folio`, `.hand`, `.typed`, `.mono`, `.fell`, `.link`, `.btn-tape`. Dans `app.css` :
`.opts/.opt`, `.field`, `.input/.textarea/.select`, `.check-line`, `.paper-btn`, `.modal`, `.toast`,
`.tracker`, `.mastery`, `.pbar`, `.pencil-note`, `.prose`, `.typed-label`, `.stack`, `.row`.

## Animation et accessibilité

- Les traits se dessinent (`.draw` + `pathLength={1}`), les tampons tombent (`thunk`), les papiers se
  posent (`.settle` avec `--r` et `--d`). Tout est coupé sous `prefers-reduced-motion`.
- Texte courant ≥ 16,5 px ; le contraste ne dépend jamais de la lampe torche.
- Cibles tactiles ≥ 40 px sur mobile ; aucune barre de défilement horizontale à 390 px.
- Les cases et options restent de vrais `button` / `input` (clavier, lecteurs d’écran).
