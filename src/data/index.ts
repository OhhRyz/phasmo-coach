import type { Ghost, Mechanics } from './types'
import mechanicsJson from './mechanics.json'
import { fr } from '../engine/format'

/**
 * Ordre d'apprentissage : celui dans lequel la révision présente les entités, des plus classiques aux plus
 * récentes (l'ancien ordre du journal du jeu, puis les ajouts). Les moteurs (cartes, quiz, contrats) s'appuient
 * dessus. Ce que l'app AFFICHE suit l'ordre du journal actuel : voir JOURNAL_ORDER.
 */
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
  if (typeof value === 'string') return fr(value) as T
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

/**
 * L'ordre du journal du jeu, page « Preuves », lu ligne par ligne sur ses trois colonnes : Aswang, Banshee, Dayan /
 * Deildegast, Démon, Deogen / … / Spectre, Yokai, Yurei. C'est l'ordre alphabétique des noms anglais, gardé tel quel
 * dans le jeu en français (Djinn à la place de Jinn, Cauchemar à celle de Mare, Fantôme, Ombre, Esprit, Spectre).
 * Relevé sur une photo du journal en français envoyée par le coach le 18 novembre 2026 ; c'est aussi l'ordre des
 * cartes de tybayn. Tout ce que l'app affiche (registres, grilles, listes de noms) range les entités ainsi, pour
 * qu'elles soient à la même place que dans le jeu.
 */
export const JOURNAL_ORDER = [
  'aswang', 'banshee', 'dayan',
  'deildegast', 'demon', 'deogen',
  'gallu', 'goryo', 'hantu',
  'jinn', 'kormos', 'mare',
  'moroi', 'myling', 'obake',
  'obambo', 'oni', 'onryo',
  'phantom', 'poltergeist', 'raiju',
  'revenant', 'shade', 'spirit',
  'thaye', 'the-mimic', 'the-twins',
  'wraith', 'yokai', 'yurei',
]

/** Le journal du jeu range les entités sur trois colonnes, de gauche à droite puis de haut en bas. */
export const JOURNAL_COLUMNS = 3

const journalRank = (id: string) => {
  const i = JOURNAL_ORDER.indexOf(id)
  return i === -1 ? JOURNAL_ORDER.length : i
}

/** Les entités dans l'ordre du journal du jeu (les mêmes objets que GHOSTS) ; une entité pas encore placée vient à la fin, par nom anglais. */
export const JOURNAL_GHOSTS: Ghost[] = [...GHOSTS].sort((a, b) => journalRank(a.id) - journalRank(b.id) || (a.nameEn < b.nameEn ? -1 : a.nameEn > b.nameEn ? 1 : 0))

/** Sans prototype : un identifiant venu d'un lien (« constructor », « __proto__ »…) ne trouve rien. */
export const GHOST_BY_ID: Record<string, Ghost> = Object.assign(
  Object.create(null) as Record<string, Ghost>,
  Object.fromEntries(GHOSTS.map((g) => [g.id, g])),
)

export function getGhost(id: string): Ghost | undefined {
  return GHOST_BY_ID[id]
}

export const MECHANICS = typeset(mechanicsJson as Mechanics)

const TYBAYN_VERSION = 'v0.19.1.0'

export const DATA_INFO = {
  ghostCount: GHOSTS.length,
  /** version de la fiche de tybayn à laquelle les données ont été comparées */
  tybaynVersion: TYBAYN_VERSION,
  gameVersionNote: `Données comparées à la fiche de tybayn ${TYBAYN_VERSION} (novembre 2026)`,
  comparedShort: `Comparé à la fiche de tybayn ${TYBAYN_VERSION} (nov. 2026)`,
}
