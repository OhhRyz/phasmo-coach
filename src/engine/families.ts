import type { Ghost } from '../data/types'
import { copiesBehavior } from './filter'
import { fr, speedText } from './format'

/**
 * Les deux classements du coach (18 novembre 2026), faits pour être retenus d'un coup d'œil : les quatre familles
 * de vitesse, puis, plus bas, les quatre familles de seuil de chasse. Dans chacun, une entité n'a qu'UNE case.
 *
 * Les vitesses : lente, normale, rapide, ou « change de vitesse ». La case dit ce qu'on retient d'abord ; les
 * quelques mots à côté du nom disent ce qui change sa vitesse, et eux viennent de la fiche (tybayn) : « Thayé,
 * rapide · ralentit en vieillissant ».
 *
 * Ce n'est pas le filtre du carnet de preuves, qui élimine (« j'entends des pas normaux : qui reste possible ? »)
 * et garde une entité partout où sa vitesse peut tomber : voir speedClasses.
 */
export type SpeedFamily = 'lente' | 'rapide' | 'variable' | 'normale'

/** L'ordre des cases : les trois qu'il faut retenir, puis « toutes les autres ». */
export const FAMILY_ORDER: readonly SpeedFamily[] = ['lente', 'rapide', 'variable', 'normale']

/**
 * Le classement du coach, entité par entité, avec ce qui change sa vitesse (fiche de l'entité). Une entité absente
 * de ce tableau est normale : toujours 1,7 m/s.
 */
const CHOSEN: Record<string, { family: Exclude<SpeedFamily, 'normale'>; note: string }> = {
  aswang: { family: 'lente', note: 'toujours un peu plus lent' },
  hantu: { family: 'lente', note: 'rapide dans le froid' },
  'the-twins': { family: 'lente', note: 'un jumeau lent, un jumeau rapide' },
  obambo: { family: 'lente', note: 'rapide quand il est agressif' },
  dayan: { family: 'lente', note: 'près d’elle : lente si tu restes immobile, rapide si tu bouges' },
  revenant: { family: 'rapide', note: 'lent tant qu’il ne te détecte pas' },
  thaye: { family: 'rapide', note: 'ralentit en vieillissant' },
  deildegast: { family: 'rapide', note: 'ralentit quand les joueurs utilisent des objets' },
  deogen: { family: 'rapide', note: 'très lent tout près de sa cible' },
  moroi: { family: 'rapide', note: 'plus lent quand la santé mentale est haute' },
  jinn: { family: 'variable', note: 'accélère de loin quand il te voit, disjoncteur allumé' },
  raiju: { family: 'variable', note: 'accélère près d’un appareil électronique allumé' },
  kormos: { family: 'variable', note: 'accélère s’il te détecte à plus de 5 m' },
  gallu: { family: 'variable', note: 'rapide enragé, lent affaibli' },
  'the-mimic': { family: 'variable', note: 'copie la vitesse de l’entité imitée' },
}

/** Les entités que le coach a rangées lui-même (les autres sont normales) : pour vérifier qu'aucune n'a disparu des fiches. */
export const CHOSEN_IDS: readonly string[] = Object.keys(CHOSEN)

/** La famille de vitesse de l'entité : sa case dans le classement du coach. */
export function speedFamily(g: Pick<Ghost, 'id'>): SpeedFamily {
  return CHOSEN[g.id]?.family ?? 'normale'
}

/** À côté du nom : ce qui change la vitesse de l'entité, en quelques mots ; rien pour une entité normale. */
export function speedFamilyNote(g: Pick<Ghost, 'id'>): string | null {
  const note = CHOSEN[g.id]?.note
  return note ? fr(note) : null
}

/** Le mot du registre, à côté de la vitesse : « lente », « normale », « rapide », ou « variable » pour une entité qui change de vitesse. */
export type SpeedWord = 'lente' | 'normale' | 'rapide' | 'variable'
export function speedWord(g: Pick<Ghost, 'id'>): SpeedWord {
  return speedFamily(g)
}

/**
 * La vitesse d'une ligne du registre, après le mot : les m/s de la fiche. L'entité qui en copie une autre (Mimic)
 * n'y écrit pas ses propres 1,7 m/s, que le mot « variable » contredirait : elle dit qu'elle copie.
 */
export function rowSpeedText(g: Ghost): string {
  return copiesBehavior(g) ? 'copie l’entité imitée' : speedText(g)
}

export interface FamilyCopy {
  /** le titre de la case */
  title: string
  /** sous le titre, tapé petit */
  def: string
  /** le nom du groupe pour les lecteurs d'écran */
  label: string
}

export const FAMILY_COPY: Record<SpeedFamily, FamilyCopy> = {
  lente: { title: 'Lentes', def: 'moins vite que la normale', label: 'Entités lentes' },
  rapide: { title: 'Rapides', def: 'plus vite que la normale', label: 'Entités rapides' },
  variable: { title: 'Changent de vitesse', def: 'selon la situation', label: 'Entités qui changent de vitesse' },
  normale: { title: 'Normales', def: fr('toujours 1,7 m/s'), label: 'Entités à vitesse normale' },
}

/** Les quatre cases, dans l'ordre, avec leurs entités dans l'ordre reçu (celui du journal du jeu). */
export function speedFamilies(ghosts: readonly Ghost[]): { id: SpeedFamily; ghosts: Ghost[] }[] {
  return FAMILY_ORDER.map((id) => ({ id, ghosts: ghosts.filter((g) => speedFamily(g) === id) }))
}

/* ---------- les seuils de chasse ---------- */

/**
 * Les quatre familles de seuil de chasse : le même classement simple que pour les vitesses, validé par le coach
 * (18 novembre 2026). Chaque entité n'a qu'UNE case : chasse tôt (au-dessus de 50 % de santé mentale moyenne),
 * chasse tard (en dessous), seuil qui change selon la situation, ou normale (50 %). À côté du nom, le seuil de la
 * fiche et ce qui le change : « Démon, 70 % · à toute santé mentale avec sa capacité ».
 *
 * Ce n'est pas le critère « peut chasser au-dessus de… » du carnet de preuves, qui élimine : voir sanityClasses.
 */
export type SanityFamily = 'tot' | 'tard' | 'variable' | 'normale'

/** L'ordre des cases : les trois qu'il faut retenir, puis « toutes les autres ». */
export const SANITY_FAMILY_ORDER: readonly SanityFamily[] = ['tot', 'tard', 'variable', 'normale']

/**
 * Le classement du coach, entité par entité, avec le seuil de sa fiche et ce qui le change. Une entité absente de
 * ce tableau est normale : 50 %, sans condition.
 */
const SANITY_CHOSEN: Record<string, { family: Exclude<SanityFamily, 'normale'>; note: string }> = {
  demon: { family: 'tot', note: '70 % · à toute santé mentale avec sa capacité' },
  onryo: { family: 'tot', note: '60 % · à toute santé mentale après 3 flammes éteintes' },
  thaye: { family: 'tot', note: '75 % jeune · de plus en plus tard en vieillissant' },
  deogen: { family: 'tard', note: '40 %' },
  shade: { family: 'tard', note: '35 %' },
  banshee: { family: 'variable', note: '50 % de sa cible, pas de l’équipe' },
  mare: { family: 'variable', note: '60 % lumière éteinte · 40 % allumée' },
  dayan: { family: 'variable', note: '65 % si tu marches près d’elle · 45 % si tu restes immobile' },
  gallu: { family: 'variable', note: '60 % enragé · 40 % affaibli' },
  kormos: { family: 'variable', note: '70 % si quelqu’un sprinte dans sa pièce' },
  obambo: { family: 'variable', note: '65 % agressif · 10 % calme' },
  raiju: { family: 'variable', note: '65 % près d’un appareil électronique allumé' },
  yokai: { family: 'variable', note: 'jusqu’à 80 % si quelqu’un parle dans sa pièce' },
  'the-mimic': { family: 'variable', note: 'copie le seuil de l’entité imitée' },
}

/** Les entités que le coach a rangées lui-même (les autres sont normales) : pour vérifier qu'aucune n'a disparu des fiches. */
export const SANITY_CHOSEN_IDS: readonly string[] = Object.keys(SANITY_CHOSEN)

/** La famille de seuil de chasse de l'entité : sa case dans le classement du coach. */
export function sanityFamily(g: Pick<Ghost, 'id'>): SanityFamily {
  return SANITY_CHOSEN[g.id]?.family ?? 'normale'
}

/** À côté du nom : le seuil de la fiche et ce qui le change, en quelques mots ; rien pour une entité normale. */
export function sanityFamilyNote(g: Pick<Ghost, 'id'>): string | null {
  const note = SANITY_CHOSEN[g.id]?.note
  return note ? fr(note) : null
}

export const SANITY_FAMILY_COPY: Record<SanityFamily, FamilyCopy> = {
  tot: { title: 'Chassent tôt', def: fr('au-dessus de 50 %'), label: 'Entités qui chassent tôt' },
  tard: { title: 'Chassent tard', def: fr('sous 50 %'), label: 'Entités qui chassent tard' },
  variable: { title: 'Seuil qui change', def: 'selon la situation', label: 'Entités dont le seuil de chasse change' },
  normale: { title: 'Normales', def: fr('toujours 50 %'), label: 'Entités au seuil de chasse normal' },
}

/** Les quatre cases, dans l'ordre, avec leurs entités dans l'ordre reçu (celui du journal du jeu). */
export function sanityFamilies(ghosts: readonly Ghost[]): { id: SanityFamily; ghosts: Ghost[] }[] {
  return SANITY_FAMILY_ORDER.map((id) => ({ id, ghosts: ghosts.filter((g) => sanityFamily(g) === id) }))
}
