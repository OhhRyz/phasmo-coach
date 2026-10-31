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
  sound: boolean
  /** entités à travailler en priorité (null = toutes) */
  focus: string[] | null
  includeMechanics: boolean
}

export interface Profile {
  name: string
  coachName: string
  role: 'student' | 'coach'
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

export const STORAGE_KEY = 'phasmo-coach/v1'
export const MAX_LOG = 6000
export const MAX_ACTIVITY = 400

export function initialState(now = Date.now()): PersistedState {
  return {
    version: 1,
    onboarded: false,
    profile: { name: '', coachName: '', role: 'student', createdAt: now },
    settings: { newPerDay: 12, sound: true, focus: null, includeMechanics: true },
    cards: {},
    log: [],
    answers: {},
    activity: [],
    notes: [],
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Fusionne un état chargé (localStorage ou import) avec les valeurs par défaut. */
export function hydrate(raw: unknown): PersistedState {
  const base = initialState()
  if (!isObject(raw) || raw.version !== 1) return base
  const r = raw as Partial<PersistedState>
  return {
    version: 1,
    onboarded: !!r.onboarded,
    profile: { ...base.profile, ...(isObject(r.profile) ? r.profile : {}) },
    settings: { ...base.settings, ...(isObject(r.settings) ? r.settings : {}) },
    cards: isObject(r.cards) ? (r.cards as PersistedState['cards']) : {},
    log: Array.isArray(r.log) ? r.log.slice(-MAX_LOG) : [],
    answers: isObject(r.answers) ? (r.answers as PersistedState['answers']) : {},
    activity: Array.isArray(r.activity) ? r.activity.slice(-MAX_ACTIVITY) : [],
    notes: Array.isArray(r.notes) ? r.notes : [],
  }
}

export function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? hydrate(JSON.parse(raw)) : initialState()
  } catch {
    return initialState()
  }
}

export function save(state: PersistedState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}
