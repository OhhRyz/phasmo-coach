import { GHOST_BY_ID } from '../data'
import type { CoachNote } from '../engine/cards'
import type { CardState, Grade } from '../engine/srs'

export type ActivityKind = 'review' | 'quiz' | 'scenario' | 'ear'

export interface Activity {
  t: number
  kind: ActivityKind
  score: number
  total: number
  label: string
  ghostId?: string
}

export interface ReviewEntry {
  id: string
  t: number
  g: Grade
  isNew: boolean
}

export interface AnswerStats {
  c: number
  t: number
  /** 10 dernières réponses (1 = juste) */
  recent: number[]
}

export interface Settings {
  newPerDay: number
  /** entités à travailler en priorité (null = toutes) */
  focus: string[] | null
  includeMechanics: boolean
  /** dernier partage du carnet par lien (pour n'envoyer ensuite que les notes nouvelles ou modifiées) */
  lastSharedAt?: number
}

/**
 * Qui tient le carnet : seul·e (par défaut, l'app sert à tout le monde), coaché·e par quelqu'un, ou
 * coach de quelqu'un. Le coaching se règle sur la page « Coaching ».
 */
export type Role = 'solo' | 'student' | 'coach'
export const ROLES: readonly Role[] = ['solo', 'student', 'coach']

export interface Profile {
  name: string
  /** le coach de la personne coachée (gardé si elle repasse seule, pour le retrouver ensuite) */
  coachName: string
  role: Role
  createdAt: number
}

export interface PersistedState {
  version: 1
  onboarded: boolean
  profile: Profile
  settings: Settings
  cards: Record<string, CardState>
  log: ReviewEntry[]
  answers: Record<string, AnswerStats>
  activity: Activity[]
  notes: CoachNote[]
}

/** Nouvelles questions par jour d'un carnet neuf (réglable dans le profil). */
export const DEFAULT_NEW_PER_DAY = 12

export const STORAGE_KEY = 'phasmo-coach/v1'
export const MAX_LOG = 6000
export const MAX_ACTIVITY = 400

export function initialState(now = Date.now()): PersistedState {
  return {
    version: 1,
    onboarded: false,
    profile: { name: '', coachName: '', role: 'solo', createdAt: now },
    settings: { newPerDay: DEFAULT_NEW_PER_DAY, focus: null, includeMechanics: true },
    cards: {},
    log: [],
    answers: {},
    activity: [],
    notes: [],
  }
}

/**
 * Ajoute une activité au registre, ou remplace celle de la même séance (même début, même exercice) : une
 * révision s'y inscrit dès la première réponse, puis se met à jour à chaque réponse. Une séance laissée en
 * route reste ainsi au registre, au bilan et au profil.
 */
export function upsertActivity(list: readonly Activity[], a: Activity): Activity[] {
  const i = list.findIndex((x) => x.t === a.t && x.kind === a.kind)
  if (i < 0) return [...list, a].slice(-MAX_ACTIVITY)
  const out = list.slice()
  out[i] = a
  return out
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Fusionne un état chargé (localStorage ou import) avec les valeurs par défaut. */
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback)

/** Nettoie des notes venues d'un lien, d'un fichier ou du stockage (les entrées invalides sont ignorées). */
/** Titre d'une note sans titre : sa première ligne, coupée proprement. */
function firstLine(body: string): string {
  const line = body.trim().split(/\n/)[0].trim()
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line
}

/** Les mauvaises réponses d'une note posée en QCM : 3 au plus, sans blancs, 200 caractères chacune. */
function wrongAnswers(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = raw
    .filter((w): w is string => typeof w === 'string')
    .map((w) => w.trim().slice(0, 200).trim())
    .filter(Boolean)
    .slice(0, 3)
  return out.length ? out : undefined
}

export function sanitizeNotes(raw: unknown): CoachNote[] {
  if (!Array.isArray(raw)) return []
  const out: CoachNote[] = []
  for (const n of raw) {
    if (!isObject(n) || typeof n.id !== 'string' || !n.id) continue
    const title = str(n.title).slice(0, 200)
    const body = str(n.body).slice(0, 8000)
    if (!title && !body) continue
    // dates bornées : une valeur absurde venue d'un lien ou d'un fichier ne doit rien casser à l'affichage
    const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 4102444800000 ? v : null)
    const createdAt = time(n.createdAt) ?? Date.now()
    out.push({
      id: n.id.slice(0, 64),
      createdAt,
      updatedAt: time(n.updatedAt) ?? createdAt,
      ghostId: typeof n.ghostId === 'string' && GHOST_BY_ID[n.ghostId] ? n.ghostId : null,
      title: title || firstLine(body),
      body,
      asCard: n.asCard !== false,
      question: typeof n.question === 'string' && n.question.trim() ? n.question.slice(0, 500) : undefined,
      answer: typeof n.answer === 'string' && n.answer.trim() ? n.answer.slice(0, 2000) : undefined,
      wrong: wrongAnswers(n.wrong),
      author: str(n.author).slice(0, 80),
      pinned: n.pinned === true,
    })
  }
  return out
}

/** Un profil chargé : chaque champ vérifié ; un rôle absent ou inconnu devient « seul·e ». */
function readProfile(raw: unknown, base: Profile): Profile {
  if (!isObject(raw)) return base
  const role = ROLES.find((r) => r === raw.role) ?? 'solo'
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : base.createdAt
  return { ...base, name: str(raw.name).slice(0, 80), coachName: str(raw.coachName).slice(0, 80), role, createdAt }
}

export function hydrate(raw: unknown): PersistedState {
  const base = initialState()
  if (!isObject(raw) || raw.version !== 1) return base
  const r = raw as Partial<PersistedState>
  return {
    version: 1,
    onboarded: !!r.onboarded,
    profile: readProfile(r.profile, base.profile),
    settings: { ...base.settings, ...(isObject(r.settings) ? r.settings : {}) },
    cards: isObject(r.cards) ? (r.cards as PersistedState['cards']) : {},
    log: Array.isArray(r.log) ? r.log.slice(-MAX_LOG) : [],
    answers: isObject(r.answers) ? (r.answers as PersistedState['answers']) : {},
    activity: Array.isArray(r.activity) ? r.activity.slice(-MAX_ACTIVITY) : [],
    notes: sanitizeNotes(r.notes),
  }
}

/**
 * Une sauvegarde complète (fichier exporté depuis le profil, ou progression copiée-collée), passée par le
 * même nettoyage que le stockage de l'appareil. null : ce n'est pas une sauvegarde complète.
 */
export function readBackup(raw: unknown): PersistedState | null {
  if (!isObject(raw) || raw.version !== 1 || !isObject(raw.cards)) return null
  return hydrate(raw)
}

export interface Loaded {
  state: PersistedState
  /** false si des données existaient mais n'ont pas pu être lues (elles ne doivent pas être écrasées) */
  ok: boolean
}

export function load(): Loaded {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return { state: initialState(), ok: true }
  }
  if (!raw) return { state: initialState(), ok: true }
  try {
    const parsed = JSON.parse(raw)
    if (isObject(parsed) && parsed.version === 1) return { state: hydrate(parsed), ok: true }
  } catch {
    /* illisible */
  }
  // données inconnues (corrompues ou d'une version plus récente) : on les met de côté avant toute écriture
  try {
    localStorage.setItem(`${STORAGE_KEY}-sauvegarde-${Date.now()}`, raw)
  } catch {
    /* tant pis */
  }
  return { state: initialState(), ok: false }
}

export function save(state: PersistedState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}
