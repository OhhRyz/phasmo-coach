import type { Ghost } from '../data/types'
import { lowerFirst } from './fiche'
import { copiesBehavior } from './filter'
import { fr, sanityClasses, type SanityClass } from './format'
import { hasSpeed } from './speeds'

/**
 * Le registre du Codex rangé par seuil de chasse : trois classes côte à côte, et pour chaque entité le seuil de sa
 * fiche qui la met dans la classe. Rien n'est inventé ici : une entité est rangée dans une colonne parce qu'un seuil
 * écrit sur sa fiche y tombe, et seulement pour cela. Le classement par vitesse, lui, est celui du coach : quatre
 * familles, une seule par entité (voir engine/families).
 */

/** L'ordre du registre : celui du journal du jeu (par défaut), les quatre familles de vitesse, ou par seuil de chasse. */
export type Rank = 'numero' | 'vitesse' | 'seuil'
/** Le paramètre d'adresse qui porte l'ordre choisi (`/codex?rang=vitesse`) : il tient au rechargement, au retour arrière, et se donne en lien. */
export const RANK_PARAM = 'rang'

/** L'ordre demandé par l'adresse ; une valeur absente ou inconnue : l'ordre du journal du jeu. */
export function rankFromSearch(params: URLSearchParams): Rank {
  const v = params.get(RANK_PARAM)
  return v === 'vitesse' || v === 'seuil' ? v : 'numero'
}

/** Les paramètres de l'adresse avec cet ordre : l'ordre par défaut ne s'écrit pas, les autres paramètres restent. */
export function withRank(params: URLSearchParams, rank: Rank): URLSearchParams {
  const next = new URLSearchParams(params)
  if (rank === 'numero') next.delete(RANK_PARAM)
  else next.set(RANK_PARAM, rank)
  return next
}

/** L'adresse du Codex rangé dans cet ordre (lien d'une fiche vers « voir les entités par vitesse »). */
export function codexRankPath(rank: Rank): string {
  const q = withRank(new URLSearchParams(), rank).toString()
  return q ? `/codex?${q}` : '/codex'
}

/** La vitesse standard (tybayn) : en dessous une entité est lente, au-dessus rapide (voir speedClasses). */
export const STANDARD_SPEED = 1.7
/** Le seuil de chasse standard, en % de santé mentale moyenne (voir sanityClasses). */
export const STANDARD_SANITY = 50

export const SANITY_ORDER: readonly SanityClass[] = ['early', 'normal', 'late']

/**
 * D'où vient ce qu'on écrit sur la ligne :
 * - `values` : les seuils de la fiche qui tombent dans la classe ;
 * - `copy` : l'entité copie une autre entité (Mimic), le résumé de sa fiche le dit ;
 * - `unknown` : valeur inconnue (-1 dans les données).
 */
export type EntryKind = 'values' | 'copy' | 'unknown'

export interface GroupEntry {
  ghost: Ghost
  /** numéro dans le journal du jeu (à partir de 1) */
  n: number
  kind: EntryKind
  /** seuils de la fiche, par ordre croissant (%) ; vide pour `copy` et `unknown` */
  values: number[]
  /** l'entité figure dans plusieurs classes (« par moments ») ; sinon elle n'a que celle-ci (« toujours ») */
  several: boolean
}

export interface Group<C extends string> {
  id: C
  entries: GroupEntry[]
}

/** Les seuils écrits sur la fiche : `low`, `normal` et `high`, sans les inconnus (-1). */
export function sanityValues(g: Ghost): number[] {
  const h = g.huntSanity
  return [...new Set([h.low, h.normal, h.high].filter((v) => v >= 0))].sort((a, b) => a - b)
}

const inSanityClass = (v: number, c: SanityClass) => (c === 'late' ? v < STANDARD_SANITY : c === 'early' ? v > STANDARD_SANITY : v === STANDARD_SANITY)

/**
 * Les entités dont la vitesse change par paliers et passe par 1,7 m/s ou tout près (à 0,05 m/s, l'écart que
 * l'oreille ne sépare pas, voir hasSpeed : 1,75 pour le Hantu, 1,66 et 1,749 pour le Moroï, 1,7 pile pour le Thayé
 * et le Deildegast). Le filtre du carnet de preuves les garde quand on coche « normale », alors qu'aucune n'est une
 * entité normale : la page le dit à ce moment-là.
 */
export function nearStandardRanges(ghosts: readonly Ghost[]): Ghost[] {
  return ghosts.filter((g) => g.speed.isRange && !copiesBehavior(g) && hasSpeed(g, STANDARD_SPEED))
}

/** Les classes de seuil où ranger l'entité : celles de sanityClasses (le Mimic, de 10 à 100 %, y est déjà dans les trois). */
export function sanityGroupsOf(g: Ghost): Set<SanityClass> {
  return sanityClasses(g)
}

function sanityEntry(g: Ghost, n: number, c: SanityClass, several: boolean): GroupEntry {
  const base = { ghost: g, n, several }
  if (copiesBehavior(g)) return { ...base, kind: 'copy', values: [] }
  const values = sanityValues(g)
  if (!values.length) return { ...base, kind: 'unknown', values: [] }
  return { ...base, kind: 'values', values: values.filter((v) => inSanityClass(v, c)) }
}

/** Les 30 entités rangées par seuil de chasse : tôt, normal, tard ; chacune dans chaque classe où tombe un seuil de sa fiche, dans l'ordre reçu. */
export function sanityGroups(ghosts: readonly Ghost[]): Group<SanityClass>[] {
  return SANITY_ORDER.map((id) => ({
    id,
    entries: ghosts.flatMap((g, i) => {
      const cls = sanityGroupsOf(g)
      return cls.has(id) ? [sanityEntry(g, i + 1, id, cls.size > 1)] : []
    }),
  }))
}

/** Le seuil écrit sur la ligne : « 60 % », « 70 % ou 100 % », « copie le seuil de l’entité imitée (10 à 100 %) ». */
export function sanityEntryText(e: GroupEntry): string {
  if (e.kind === 'copy') return fr(lowerFirst(e.ghost.huntSanity.summary))
  if (e.kind === 'unknown') return 'seuil inconnu'
  return fr(e.values.map((v) => `${v} %`).join(' ou '))
}

/**
 * Dans chaque colonne, deux parties : d'abord les entités qui n'ont que cette classe (« toujours »), puis celles
 * qui en changent et figurent aussi dans une autre colonne (« par moments »).
 */
export type Part = 'always' | 'sometimes'
export const PART_ORDER: readonly Part[] = ['always', 'sometimes']
export const PART_LABEL: Record<Part, string> = { always: 'toujours', sometimes: 'par moments' }
export const partOf = (e: Pick<GroupEntry, 'several'>): Part => (e.several ? 'sometimes' : 'always')

/** Ce que disent les titres des colonnes : le nom de la classe, sa définition, ce qu'elle veut dire en partie, et le nom du groupe pour les lecteurs d'écran. */
export interface GroupCopy {
  title: string
  def: string
  play: string
  label: string
  /** écrit sous « toujours » quand aucune entité n'a que cette classe : un fait du jeu, pas un effet du carnet de preuves */
  none: string
}

export const SANITY_COPY: Record<SanityClass, GroupCopy> = {
  early: {
    title: 'Tôt',
    def: fr('peut chasser au-dessus de 50 %'),
    play: 'une chasse alors que l’équipe a encore plus de la moitié de sa santé mentale',
    label: 'Entités qui peuvent chasser tôt',
    none: 'aucune entité ne chasse toujours tôt',
  },
  normal: { title: 'Normal', def: fr('50 %'), play: 'le seuil de la plupart des entités', label: 'Entités au seuil de chasse normal', none: 'aucune entité n’a toujours ce seuil' },
  late: {
    title: 'Tard',
    def: fr('sous 50 %'),
    play: 'la santé mentale moyenne doit descendre plus bas avant une chasse',
    label: 'Entités qui peuvent chasser tard',
    none: 'aucune entité ne chasse toujours tard',
  },
}
