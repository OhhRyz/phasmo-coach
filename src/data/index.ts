import type { Ghost, Mechanics } from './types'
import mechanicsJson from './mechanics.json'
import { fr } from '../engine/format'

/** Ordre canonique (ordre du journal du jeu, puis ajouts récents). */
export const GHOST_ORDER = [
  'spirit', 'wraith', 'phantom', 'poltergeist', 'banshee', 'jinn', 'mare', 'revenant',
  'shade', 'demon', 'yurei', 'oni', 'yokai', 'hantu', 'goryo', 'myling', 'onryo',
  'the-twins', 'raiju', 'obake', 'the-mimic', 'moroi', 'deogen', 'thaye',
  'gallu', 'obambo', 'dayan', 'aswang', 'kormos', 'deildegast',
]

const modules = import.meta.glob<Ghost>('./ghosts/*.json', { eager: true, import: 'default' })

/** Champs techniques à ne jamais retoucher (identifiants, preuves, sources). */
const RAW_KEYS = new Set(['id', 'with', 'evidence', 'forcedEvidence', 'fakeEvidence', 'requires', 'kind', 'sources', 'nameEn', 'icon'])

/** Applique la typographie française (apostrophes courbes, espaces fines) à tous les textes des données. */
function typeset<T>(value: T, key = ''): T {
  if (RAW_KEYS.has(key)) return value
  // « LdV » reste dans les résumés courts (tableaux, graphiques) ; ailleurs, en toutes lettres
  if (typeof value === 'string') return fr(key === 'summary' ? value : value.replace(/\bLdV\b/g, 'ligne de vue')) as T
  if (Array.isArray(value)) return value.map((v) => typeset(v)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeset(v, k)])) as T
  }
  return value
}

function normalize(g: Ghost): Ghost {
  return {
    ...g,
    forcedEvidence: g.forcedEvidence ?? null,
    fakeEvidence: g.fakeEvidence ?? null,
    keyTells: g.keyTells ?? [],
    tells: g.tells ?? [],
    behaviors: g.behaviors ?? [],
    abilities: g.abilities ?? [],
    confirmationTests: g.confirmationTests ?? [],
    eliminationTests: g.eliminationTests ?? [],
    confusions: g.confusions ?? [],
    observations: g.observations ?? [],
    quiz: g.quiz ?? [],
    changes: g.changes ?? [],
    sources: g.sources ?? [],
    uncertain: g.uncertain ?? [],
    speed: { ...g.speed, details: g.speed.details ?? [] },
    huntSanity: { ...g.huntSanity, details: g.huntSanity.details ?? [] },
  }
}

const rank = (id: string) => {
  const i = GHOST_ORDER.indexOf(id)
  return i === -1 ? GHOST_ORDER.length : i
}

export const GHOSTS: Ghost[] = Object.values(modules)
  .map((g) => typeset(normalize(g)))
  .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'fr'))

export const GHOST_BY_ID: Record<string, Ghost> = Object.fromEntries(GHOSTS.map((g) => [g.id, g]))

export function getGhost(id: string): Ghost | undefined {
  return GHOST_BY_ID[id]
}

export const MECHANICS = typeset(mechanicsJson as Mechanics)

export const DATA_INFO = {
  ghostCount: GHOSTS.length,
  gameVersionNote: 'Données à jour d’octobre 2026',
}
