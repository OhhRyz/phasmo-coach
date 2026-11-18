import type { Ghost } from '../data/types'
import { copiesBehavior } from './filter'
import { fr, speedText } from './format'

/**
 * Les quatre familles de vitesse : le classement du coach (18 novembre 2026), fait pour être retenu d'un coup
 * d'œil. Chaque entité n'a qu'UNE case : lente, normale, rapide, ou « change de vitesse ». La case dit ce qu'on
 * retient d'abord ; les quelques mots à côté du nom disent ce qui change sa vitesse, et eux viennent de la fiche
 * (tybayn) : « Thayé, rapide · ralentit en vieillissant ».
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
  moroi: { family: 'variable', note: 'accélère quand la santé mentale baisse' },
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
