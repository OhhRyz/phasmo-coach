/**
 * Les séries de l'exercice « À l'oreille » : quelles vitesses jouer, et quelles propositions montrer.
 * Fonctions pures (testées dans pages.test.ts) ; la page Ear.tsx s'occupe du son et de l'affichage.
 */
import type { Ghost } from '../data/types'
import { pick, shuffle, weightedPick, type Rng } from '../engine/random'
import { readRun } from './savedRun'

export type EarMode = 'class' | 'exact'
export type SpeedClassKey = 'slow' | 'normal' | 'fast'

export interface EarRound {
  speed: number
  choices: number[]
}

export const EAR_ROUNDS = 10
/** La vitesse de chasse standard, celle de la plupart des entités. */
export const BASE_SPEED = 1.7
/** Écart minimal entre deux propositions de l'exercice « vitesse exacte » (m/s). */
export const MIN_GAP = 0.2
/** Tolérance des calculs en virgule flottante (1,7 − 1,5 = 0,19999…). */
const EPS = 1e-6

/**
 * Part de chaque allure dans l'exercice par classes : la normale un peu plus souvent, parce que c'est
 * l'allure la plus fréquente en partie et la première à savoir reconnaître.
 */
const CLASS_WEIGHT: Record<SpeedClassKey, number> = { slow: 3, normal: 4, fast: 3 }
/** Chaque allure revient au moins deux fois par série (sinon on retire la série). */
const CLASS_MIN = 2

export function classOf(v: number): SpeedClassKey {
  if (v < BASE_SPEED - 0.05) return 'slow'
  if (v > BASE_SPEED + 0.05) return 'fast'
  return 'normal'
}

/** Toutes les vitesses distinctes présentes dans les fiches (au centième), plus la référence. */
export function allSpeeds(ghosts: readonly Ghost[]): number[] {
  const set = new Set<number>()
  for (const g of ghosts) {
    for (const v of [g.speed.min, g.speed.max, g.speed.alt]) if (v != null && v > 0.3) set.add(Math.round(v * 100) / 100)
  }
  set.add(BASE_SPEED)
  return [...set].sort((a, b) => a - b)
}

/** Les allures de la série : un tirage pondéré par écoute, chaque allure au moins CLASS_MIN fois. */
function drawClasses(rng: Rng, n: number): SpeedClassKey[] {
  const keys = Object.keys(CLASS_WEIGHT) as SpeedClassKey[]
  const min = Math.min(CLASS_MIN, Math.floor(n / keys.length))
  for (let tries = 0; tries < 200; tries++) {
    const list = Array.from({ length: n }, () => weightedPick(rng, keys, (k) => CLASS_WEIGHT[k]))
    if (keys.every((k) => list.filter((c) => c === k).length >= min)) return list
  }
  // filet de sécurité (jamais atteint en pratique) : la répartition attendue, mélangée
  const fixed = keys.flatMap((k) => Array<SpeedClassKey>(Math.round((n * CLASS_WEIGHT[k]) / 10)).fill(k))
  return shuffle(rng, fixed).slice(0, n)
}

/**
 * Trois mauvaises propositions pour « vitesse exacte » : toutes les propositions, la bonne comprise,
 * sont deux à deux à au moins MIN_GAP l'une de l'autre (deux vitesses jumelles se barreraient d'elles-mêmes).
 */
export function pickDistractors(rng: Rng, speed: number, speeds: readonly number[], n = 3): number[] {
  const far = (a: number, list: readonly number[]) => list.every((b) => Math.abs(a - b) >= MIN_GAP - EPS)
  const pool = speeds.filter((s) => far(s, [speed]))
  let best: number[] = []
  for (let tries = 0; tries < 50 && best.length < n; tries++) {
    const chosen: number[] = []
    for (const s of shuffle(rng, pool)) {
      if (far(s, [speed, ...chosen])) chosen.push(s)
      if (chosen.length === n) break
    }
    if (chosen.length > best.length) best = chosen
  }
  return best
}

/** La série : en « classes », l'allure d'abord puis une vitesse de cette allure ; en « exacte », une vitesse au hasard. */
export function makeRounds(mode: EarMode, rng: Rng, speeds: readonly number[], n = EAR_ROUNDS): EarRound[] {
  if (mode === 'exact') {
    return Array.from({ length: n }, () => {
      const speed = pick(rng, speeds)
      const choices = [speed, ...pickDistractors(rng, speed, speeds)].sort((a, b) => a - b)
      return { speed, choices }
    })
  }
  const byClass: Record<SpeedClassKey, number[]> = { slow: [], normal: [], fast: [] }
  for (const s of speeds) byClass[classOf(s)].push(s)
  if (!byClass.normal.length) byClass.normal.push(BASE_SPEED)
  // une pioche par allure : on ne rejoue une vitesse qu'après avoir entendu les autres de la même allure
  const decks: Record<SpeedClassKey, number[]> = { slow: [], normal: [], fast: [] }
  const draw = (c: SpeedClassKey): number => {
    if (!byClass[c].length) return BASE_SPEED
    if (!decks[c].length) decks[c] = shuffle(rng, byClass[c])
    return decks[c].pop()!
  }
  return drawClasses(rng, n).map((c) => ({ speed: draw(c), choices: [] }))
}

/* ---------- la série en cours, gardée pour l'onglet (voir savedRun) ---------- */

/** Une écoute de la série, pour le relevé de fin. */
export interface Heard {
  speed: number
  answer: string
  ok: boolean
}

/** La série en cours : reprise depuis la page de l'exercice après un détour, ou d'elle-même après un rechargement. */
export const SERIES_KEY = 'phasmo-coach/serie-oreille'

export interface SavedSeries {
  mode: EarMode
  rounds: EarRound[]
  i: number
  answer: string | null
  score: number
  heard: Heard[]
  /** l'entrée de l'historique où la série s'affiche : un rechargement (F5) sur cette entrée la reprend d'elle-même (comme au quiz) */
  entry?: string
}

/**
 * Une série affichée relue telle quelle : son mode, ses écoutes, l'écoute en cours dans la série, ses réponses
 * (aucune encore tant qu'on est sur la première écoute). Elle se garde dès son début : un rechargement sur sa page
 * (F5, nouvelle version de l'app) la rend même avant la première réponse.
 */
export const shownSeries = (r: SavedSeries): boolean =>
  !!r &&
  (r.entry === undefined || typeof r.entry === 'string') &&
  (r.mode === 'class' || r.mode === 'exact') &&
  Array.isArray(r.rounds) &&
  Array.isArray(r.heard) &&
  typeof r.i === 'number' &&
  r.i >= 0 &&
  r.i < r.rounds.length &&
  (r.heard.length > 0 || r.i === 0)

/** Une série à proposer à la reprise (« Reprendre la série ») : lisible, et commencée (au moins une réponse). */
export const validSeries = (r: SavedSeries): boolean => shownSeries(r) && r.heard.length > 0

/** La série affichée en dernier, même sans réponse : celle que reprend la page rechargée (voir shownSeries). */
export function readShownSeries(now = Date.now()): SavedSeries | null {
  return readRun<SavedSeries>(SERIES_KEY, shownSeries, now)
}
