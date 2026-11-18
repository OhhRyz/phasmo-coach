import type { Ghost } from '../data/types'
import { lowerFirst } from './fiche'
import { copiesBehavior } from './filter'
import { fr, num, sanityClasses, speedClasses, speedText, type SanityClass, type SpeedClass } from './format'
import { hasSpeed } from './speeds'

/**
 * Le registre du Codex rangé par vitesse ou par seuil de chasse : trois classes côte à côte, et pour chaque
 * entité la valeur de sa fiche qui la met dans la classe. Rien n'est inventé ici : une entité est rangée dans
 * une colonne parce qu'une vitesse (ou un seuil) écrite sur sa fiche y tombe, et seulement pour cela.
 *
 * Ce n'est pas le filtre du carnet de preuves. Le filtre élimine (« j'entends des pas normaux : qui reste
 * possible ? ») et garde, comme celui de tybayn, une entité dont la plage traverse 1,7 m/s. Le registre, lui,
 * classe : le Hantu, le Moroi, le Thayé et le Deildegast vont de lent à rapide par paliers, ce ne sont pas des
 * entités normales, et ils ne figurent pas dans la colonne du milieu (retour du coach, 18 novembre 2026).
 */

/** L'ordre du registre : celui du journal du jeu (par défaut), par vitesse ou par seuil de chasse. */
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

export const SPEED_ORDER: readonly SpeedClass[] = ['slow', 'normal', 'fast']
export const SANITY_ORDER: readonly SanityClass[] = ['early', 'normal', 'late']

/**
 * D'où vient ce qu'on écrit sur la ligne :
 * - `values` : les valeurs de la fiche qui tombent dans la classe ;
 * - `low` / `high` : pour une plage (`isRange`), sa borne de ce côté (une plage n'a pas de ligne au milieu) ;
 * - `copy` : l'entité copie une autre entité (Mimic), le résumé de sa fiche le dit ;
 * - `unknown` : valeur inconnue (-1 dans les données).
 */
export type EntryKind = 'values' | 'low' | 'high' | 'copy' | 'unknown'

export interface GroupEntry {
  ghost: Ghost
  /** numéro dans le journal du jeu (à partir de 1) */
  n: number
  kind: EntryKind
  /** valeurs de la fiche, par ordre croissant (m/s ou %) ; vide pour `copy` et `unknown` */
  values: number[]
  /** l'entité figure dans plusieurs classes (« par moments ») ; sinon elle n'a que celle-ci (« toujours ») */
  several: boolean
}

export interface Group<C extends string> {
  id: C
  entries: GroupEntry[]
}

/** Les vitesses écrites sur la fiche : `min`, `max` et `alt`, sans les absentes. */
export function speedValues(g: Ghost): number[] {
  const s = g.speed
  if (s.min < 0) return []
  return [...new Set([s.min, s.max, s.alt].filter((v): v is number => v != null))].sort((a, b) => a - b)
}

/** Les seuils écrits sur la fiche : `low`, `normal` et `high`, sans les inconnus (-1). */
export function sanityValues(g: Ghost): number[] {
  const h = g.huntSanity
  return [...new Set([h.low, h.normal, h.high].filter((v) => v >= 0))].sort((a, b) => a - b)
}

const ALL_SPEEDS = new Set<SpeedClass>(SPEED_ORDER)

const speedClassOf = (v: number): SpeedClass => (v < STANDARD_SPEED ? 'slow' : v > STANDARD_SPEED ? 'fast' : 'normal')
const inSpeedClass = (v: number, c: SpeedClass) => speedClassOf(v) === c
const inSanityClass = (v: number, c: SanityClass) => (c === 'late' ? v < STANDARD_SANITY : c === 'early' ? v > STANDARD_SANITY : v === STANDARD_SANITY)

/**
 * Les classes de vitesse où ranger l'entité : celles des vitesses écrites sur sa fiche (`min`, `max`, `alt`).
 * « Normale » veut dire que 1,7 m/s est l'une de ces vitesses. Une plage (`isRange` : Hantu, Moroi, Thayé,
 * Deildegast) n'est rangée que par ses deux bornes : traverser 1,7 m/s en chemin ne fait pas une entité normale
 * (le filtre du carnet, lui, la garde quand on coche « normale » : voir speedClasses). Le Mimic copie la vitesse
 * de l'entité imitée : comme dans le filtre (copiesBehavior), il peut être dans les trois. Une vitesse inconnue
 * (aucune fiche aujourd'hui) : les classes du filtre.
 */
export function speedGroupsOf(g: Ghost): Set<SpeedClass> {
  if (copiesBehavior(g)) return new Set(ALL_SPEEDS)
  const values = speedValues(g)
  if (!values.length) return speedClasses(g)
  const written = g.speed.isRange ? [values[0], values[values.length - 1]] : values
  return new Set(written.map(speedClassOf))
}

/**
 * Les entités dont la vitesse change par paliers et passe par 1,7 m/s ou tout près (à 0,05 m/s, l'écart que
 * l'oreille ne sépare pas, voir hasSpeed : 1,75 pour le Hantu, 1,66 et 1,749 pour le Moroi, 1,7 pile pour le Thayé
 * et le Deildegast). Le filtre du carnet de preuves les garde quand on coche « normale », alors que le registre
 * ne les range pas parmi les normales : la page le dit à ce moment-là.
 */
export function nearStandardRanges(ghosts: readonly Ghost[]): Ghost[] {
  return ghosts.filter((g) => g.speed.isRange && !copiesBehavior(g) && hasSpeed(g, STANDARD_SPEED))
}

/** Les classes de seuil où ranger l'entité : celles de sanityClasses (le Mimic, de 10 à 100 %, y est déjà dans les trois). */
export function sanityGroupsOf(g: Ghost): Set<SanityClass> {
  return sanityClasses(g)
}

function speedEntry(g: Ghost, n: number, c: SpeedClass, several: boolean): GroupEntry {
  const base = { ghost: g, n, several }
  if (copiesBehavior(g)) return { ...base, kind: 'copy', values: [] }
  const values = speedValues(g)
  if (!values.length) return { ...base, kind: 'unknown', values: [] }
  if (g.speed.isRange) {
    // une plage : sa borne du côté de la classe (speedGroupsOf ne la range jamais ailleurs que par ses bornes)
    const lo = values[0]
    const hi = values[values.length - 1]
    return inSpeedClass(lo, c) ? { ...base, kind: 'low', values: [lo] } : { ...base, kind: 'high', values: [hi] }
  }
  return { ...base, kind: 'values', values: values.filter((v) => inSpeedClass(v, c)) }
}

function sanityEntry(g: Ghost, n: number, c: SanityClass, several: boolean): GroupEntry {
  const base = { ghost: g, n, several }
  if (copiesBehavior(g)) return { ...base, kind: 'copy', values: [] }
  const values = sanityValues(g)
  if (!values.length) return { ...base, kind: 'unknown', values: [] }
  return { ...base, kind: 'values', values: values.filter((v) => inSanityClass(v, c)) }
}

/** Les 30 entités rangées par vitesse : lentes, normales, rapides ; chacune dans chaque classe où tombe une vitesse de sa fiche (voir speedGroupsOf), dans l'ordre reçu. */
export function speedGroups(ghosts: readonly Ghost[]): Group<SpeedClass>[] {
  return SPEED_ORDER.map((id) => ({
    id,
    entries: ghosts.flatMap((g, i) => {
      const cls = speedGroupsOf(g)
      return cls.has(id) ? [speedEntry(g, i + 1, id, cls.size > 1)] : []
    }),
  }))
}

/** Les 30 entités rangées par seuil de chasse : tôt, normal, tard ; même règle que speedGroups. */
export function sanityGroups(ghosts: readonly Ghost[]): Group<SanityClass>[] {
  return SANITY_ORDER.map((id) => ({
    id,
    entries: ghosts.flatMap((g, i) => {
      const cls = sanityGroupsOf(g)
      return cls.has(id) ? [sanityEntry(g, i + 1, id, cls.size > 1)] : []
    }),
  }))
}

/**
 * La vitesse écrite sur la ligne : « 1,53 m/s », « 1,2 m/s », « copie la vitesse de l’entité imitée ». Pour une plage,
 * sa borne sans dire dans quel sens l'entité la parcourt (le Thayé part de 2,75 m/s et ne fait que ralentir, le
 * Moroi part de 1,5 m/s et accélère) : « 1,4 m/s au plus lent », « 2,7 m/s au plus rapide ».
 */
export function speedEntryText(e: GroupEntry): string {
  const v = e.values.map(num)
  switch (e.kind) {
    case 'copy':
      return fr(lowerFirst(e.ghost.speed.summary))
    case 'unknown':
      return 'vitesse inconnue'
    case 'low':
      return fr(`${v[0]} m/s au plus lent`)
    case 'high':
      return fr(`${v[0]} m/s au plus rapide`)
    default:
      return fr(`${v.join(' ou ')} m/s`)
  }
}

/** Le seuil écrit sur la ligne : « 60 % », « 70 % ou 100 % », « copie le seuil de l’entité imitée (10 à 100 %) ». */
export function sanityEntryText(e: GroupEntry): string {
  if (e.kind === 'copy') return fr(lowerFirst(e.ghost.huntSanity.summary))
  if (e.kind === 'unknown') return 'seuil inconnu'
  return fr(e.values.map((v) => `${v} %`).join(' ou '))
}

/** L'accélération en ligne de vue, d'après `speed.los` et `speed.losVaries` ; null pour une entité qui en copie une autre. */
export type Los = 'yes' | 'no' | 'varies'
export function losOf(g: Ghost): Los | null {
  if (copiesBehavior(g)) return null
  if (g.speed.min < 0 || g.speed.losVaries) return 'varies'
  return g.speed.los ? 'yes' : 'no'
}

const LOS_TEXT: Record<Los, string> = {
  yes: 'accélère en ligne de vue',
  no: 'n’accélère pas en ligne de vue',
  varies: 'accélère en ligne de vue selon les conditions',
}

/** « accélère en ligne de vue », « n’accélère pas en ligne de vue », « accélère en ligne de vue selon les conditions » ; rien pour le Mimic. */
export function losEntryText(g: Ghost): string | null {
  const los = losOf(g)
  return los ? LOS_TEXT[los] : null
}

/** Le mot du registre, à côté de la vitesse : « lente », « normale », « rapide » ; « variable » dès que l'entité peut être dans plusieurs classes. */
export type SpeedWord = 'lente' | 'normale' | 'rapide' | 'variable'
const WORD: Record<SpeedClass, SpeedWord> = { slow: 'lente', normal: 'normale', fast: 'rapide' }
export function speedWord(g: Ghost): SpeedWord {
  const cls = speedGroupsOf(g)
  return cls.size === 1 ? WORD[[...cls][0]] : 'variable'
}

/**
 * La vitesse d'une ligne du registre par numéro, après le mot : les m/s de la fiche. L'entité qui en copie une
 * autre (Mimic) n'y écrit pas ses propres 1,7 m/s, que le mot « variable » contredirait : elle dit qu'elle copie,
 * comme dans le registre rangé par vitesse.
 */
export function rowSpeedText(g: Ghost): string {
  return copiesBehavior(g) ? 'copie l’entité imitée' : speedText(g)
}

/**
 * Dans chaque colonne, deux parties : d'abord les entités qui n'ont que cette classe (« toujours »), puis celles
 * qui en changent et figurent aussi dans une autre colonne (« par moments »). D'un coup d'œil, « Normales ·
 * toujours » donne les entités qui ne quittent jamais 1,7 m/s, et rien d'autre.
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

export const SPEED_COPY: Record<SpeedClass, GroupCopy> = {
  slow: { title: 'Lentes', def: fr('moins de 1,7 m/s'), play: 'des pas plus lents que la normale', label: 'Entités lentes', none: 'aucune entité n’est toujours lente' },
  normal: {
    title: 'Normales',
    def: fr('1,7 m/s'),
    play: 'les pas de référence, ceux de la plupart des entités',
    label: 'Entités à vitesse normale',
    none: 'aucune entité n’est toujours normale',
  },
  fast: { title: 'Rapides', def: fr('plus de 1,7 m/s'), play: 'des pas plus rapides que la normale', label: 'Entités rapides', none: 'aucune entité n’est toujours rapide' },
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
