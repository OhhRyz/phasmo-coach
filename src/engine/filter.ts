import type { EvidenceId, Ghost } from '../data/types'
import { sanityClasses, speedClasses, type SanityClass, type SpeedClass } from './format'

export type EvidenceMark = 'unknown' | 'found' | 'excluded'

export interface FilterState {
  /** Nombre de preuves de la partie : 3 (Pro), 2 (Cauchemar), 1 (Démence), 0 (Apocalypse / 0 preuve) */
  evidenceCount: 0 | 1 | 2 | 3
  evidence: Partial<Record<EvidenceId, EvidenceMark>>
  speed: SpeedClass[]
  sanity: SanityClass[]
  /** null = indifférent */
  los: boolean | null
}

export const EMPTY_FILTER: FilterState = {
  evidenceCount: 3,
  evidence: {},
  speed: [],
  sanity: [],
  los: null,
}

/** Le Mimic copie vitesse, seuil et comportement d'autres entités : il passe tous les filtres comportementaux. */
const WILDCARD_BEHAVIOR = new Set(['the-mimic'])

export function marked(state: FilterState, mark: EvidenceMark): EvidenceId[] {
  return (Object.entries(state.evidence) as [EvidenceId, EvidenceMark][])
    .filter(([, m]) => m === mark)
    .map(([id]) => id)
}

/** Vérifie si une entité est compatible avec les preuves notées, selon le nombre de preuves de la partie. */
export function matchesEvidence(g: Ghost, state: FilterState): boolean {
  const n = state.evidenceCount
  const found = marked(state, 'found')
  const excluded = new Set(marked(state, 'excluded'))

  // Fausse preuve (orbes du Mimic) : toujours présente, ne compte pas dans le total.
  if (g.fakeEvidence && excluded.has(g.fakeEvidence)) return false
  const realFound = found.filter((e) => e !== g.fakeEvidence)

  if (realFound.length > n) return false
  if (!realFound.every((e) => g.evidence.includes(e))) return false

  // L'entité doit encore pouvoir montrer n preuves avec ce qui n'est pas exclu.
  const remaining = g.evidence.filter((e) => !excluded.has(e))
  if (remaining.length < n) return false

  // Preuve forcée : toujours parmi les preuves visibles quand le nombre de preuves est réduit.
  if (n > 0 && n < 3 && g.forcedEvidence) {
    if (excluded.has(g.forcedEvidence)) return false
    if (realFound.length === n && !realFound.includes(g.forcedEvidence)) return false
  }
  return true
}

export function matchesBehavior(g: Ghost, state: FilterState): boolean {
  if (WILDCARD_BEHAVIOR.has(g.id)) return true
  if (state.speed.length) {
    const cls = speedClasses(g)
    if (!state.speed.some((c) => cls.has(c))) return false
  }
  if (state.sanity.length) {
    const cls = sanityClasses(g)
    if (!state.sanity.some((c) => cls.has(c))) return false
  }
  if (state.los !== null && g.speed.min >= 0 && g.speed.los !== state.los) return false
  return true
}

export function filterGhosts(ghosts: Ghost[], state: FilterState): Ghost[] {
  return ghosts.filter((g) => matchesEvidence(g, state) && matchesBehavior(g, state))
}

/**
 * Preuves encore possibles parmi les entités restantes (pour griser celles qui ne peuvent plus apparaître).
 */
export function possibleEvidence(candidates: Ghost[]): Set<EvidenceId> {
  const out = new Set<EvidenceId>()
  for (const g of candidates) {
    g.evidence.forEach((e) => out.add(e))
    if (g.fakeEvidence) out.add(g.fakeEvidence)
  }
  return out
}

export function cycleMark(m: EvidenceMark | undefined): EvidenceMark {
  if (!m || m === 'unknown') return 'found'
  if (m === 'found') return 'excluded'
  return 'unknown'
}
