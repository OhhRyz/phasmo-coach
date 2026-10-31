import type { Ghost, Mechanics } from './types'
import mechanicsJson from './mechanics.json'

/** Ordre canonique (ordre du journal du jeu, puis ajouts récents). */
export const GHOST_ORDER = [
  'spirit', 'wraith', 'phantom', 'poltergeist', 'banshee', 'jinn', 'mare', 'revenant',
  'shade', 'demon', 'yurei', 'oni', 'yokai', 'hantu', 'goryo', 'myling', 'onryo',
  'the-twins', 'raiju', 'obake', 'the-mimic', 'moroi', 'deogen', 'thaye',
  'gallu', 'obambo', 'dayan', 'aswang', 'kormos', 'deildegast',
]

const modules = import.meta.glob<Ghost>('./ghosts/*.json', { eager: true, import: 'default' })

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
  .map(normalize)
  .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'fr'))

export const GHOST_BY_ID: Record<string, Ghost> = Object.fromEntries(GHOSTS.map((g) => [g.id, g]))

export function getGhost(id: string): Ghost | undefined {
  return GHOST_BY_ID[id]
}

export const MECHANICS = mechanicsJson as Mechanics

export const DATA_INFO = {
  ghostCount: GHOSTS.length,
  gameVersionNote: 'Données à jour d’octobre 2026',
}
