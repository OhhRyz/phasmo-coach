import { requestPersistentStorage } from '../engine/device'
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { GHOSTS, MECHANICS } from '../data'
import { buildDeck, type Card, type CoachNote } from '../engine/cards'
import { recordAnswer } from '../engine/progress'
import { schedule, type Grade } from '../engine/srs'
import {
  hydrate,
  initialState,
  load,
  sanitizeNotes,
  MAX_ACTIVITY,
  MAX_LOG,
  save,
  STORAGE_KEY,
  type Activity,
  type PersistedState,
  type Profile,
  type Settings,
} from './schema'

type Action =
  | { type: 'review'; cardId: string; grade: Grade; now: number }
  | { type: 'answers'; results: { key: string; correct: boolean }[]; lapseCards?: string[]; now: number }
  | { type: 'activity'; activity: Activity }
  | { type: 'profile'; profile: Partial<Profile> }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'onboard'; profile: Partial<Profile> }
  | { type: 'note:upsert'; note: CoachNote }
  | { type: 'note:delete'; id: string }
  | { type: 'notes:import'; notes: CoachNote[]; from?: string }
  | { type: 'replace'; state: PersistedState }
  | { type: 'reset-progress' }
  | { type: 'reset-all' }

function reducer(state: PersistedState, action: Action): PersistedState {
  switch (action.type) {
    case 'review': {
      const prev = state.cards[action.cardId]
      const next = schedule(prev, action.grade, action.now)
      return {
        ...state,
        cards: { ...state.cards, [action.cardId]: next },
        log: [...state.log, { id: action.cardId, t: action.now, g: action.grade, isNew: !prev }].slice(-MAX_LOG),
      }
    }
    case 'answers': {
      const answers = { ...state.answers }
      for (const r of action.results) answers[r.key] = recordAnswer(answers[r.key], r.correct)
      // une erreur en quiz remet la carte liée en révision (si elle était déjà apprise)
      const cards = { ...state.cards }
      for (const id of action.lapseCards ?? []) {
        const c = cards[id]
        if (c && c.phase === 'review') cards[id] = { ...c, due: Math.min(c.due, action.now) }
      }
      return { ...state, answers, cards }
    }
    case 'activity':
      return { ...state, activity: [...state.activity, action.activity].slice(-MAX_ACTIVITY) }
    case 'profile': {
      const profile = { ...state.profile, ...action.profile }
      // le prénom change : les notes écrites sous l'ancien prénom (ou sans prénom) restent les siennes
      const before = state.profile.name.trim()
      const after = profile.name.trim()
      if (!before || !after || before === after) return { ...state, profile }
      const notes = state.notes.map((n) => (n.author.trim() === before ? { ...n, author: after } : n))
      return { ...state, profile, notes }
    }
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.settings } }
    case 'onboard':
      return { ...state, onboarded: true, profile: { ...state.profile, ...action.profile } }
    case 'note:upsert': {
      const exists = state.notes.some((n) => n.id === action.note.id)
      return {
        ...state,
        notes: exists ? state.notes.map((n) => (n.id === action.note.id ? action.note : n)) : [action.note, ...state.notes],
      }
    }
    case 'note:delete': {
      const cards = { ...state.cards }
      delete cards[`n:${action.id}`]
      return { ...state, notes: state.notes.filter((n) => n.id !== action.id), cards }
    }
    case 'notes:import': {
      const byId = new Map(state.notes.map((n) => [n.id, n]))
      for (const n of sanitizeNotes(action.notes)) {
        const cur = byId.get(n.id)
        // l'épinglage est propre à chaque appareil : on garde celui d'ici
        if (!cur) byId.set(n.id, { ...n, pinned: false })
        else if (cur.updatedAt < n.updatedAt) byId.set(n.id, { ...n, pinned: cur.pinned })
      }
      const notes = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt)
      // une élève sans nom de coach : celui qui envoie le lien devient son coach
      const from = action.from?.trim().slice(0, 80)
      const profile =
        from && state.profile.role === 'student' && !state.profile.coachName.trim() && from !== state.profile.name.trim()
          ? { ...state.profile, coachName: from }
          : state.profile
      return { ...state, notes, profile }
    }
    case 'replace':
      return action.state
    case 'reset-progress':
      return { ...state, cards: {}, log: [], answers: {}, activity: [] }
    case 'reset-all':
      return initialState()
  }
}

interface StoreValue {
  state: PersistedState
  deck: Card[]
  dispatch: (a: Action) => void
  review: (cardId: string, grade: Grade) => void
  /** dernier enregistrement impossible (stockage plein ou bloqué) */
  saveFailed: boolean
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(load)
  const [state, dispatch] = useReducer(reducer, initial.state)
  const [saveFailed, setSaveFailed] = useState(false)
  const latest = useRef(state)
  const dirty = useRef(false)
  const first = useRef(true)

  const flush = useCallback(() => {
    if (!dirty.current) return
    dirty.current = false
    setSaveFailed(!save(latest.current))
  }, [])

  // On n'écrit qu'après un vrai changement : un état chargé (ou des données illisibles) n'est jamais réécrit tel quel.
  useEffect(() => {
    latest.current = state
    if (first.current) {
      first.current = false
      return
    }
    dirty.current = true
    const t = window.setTimeout(flush, 150)
    return () => window.clearTimeout(t)
  }, [state, flush])

  // un carnet ouvert demande au navigateur de ne pas effacer ses données
  useEffect(() => {
    if (state.onboarded) void requestPersistentStorage()
  }, [state.onboarded])

  // fermeture de l'onglet ou mise en arrière-plan de l'app : on enregistre tout de suite
  useEffect(() => {
    const onHide = () => flush()
    const onVisibility = () => document.visibilityState === 'hidden' && flush()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])

  // synchronisation entre onglets (seulement des données que l'on sait lire)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      try {
        const parsed = JSON.parse(e.newValue)
        if (parsed?.version !== 1) return
        first.current = true // l'état reçu est déjà enregistré : ne pas le réécrire
        dispatch({ type: 'replace', state: hydrate(parsed) })
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const deck = useMemo(() => buildDeck(GHOSTS, MECHANICS, state.notes), [state.notes])
  const review = useCallback((cardId: string, grade: Grade) => dispatch({ type: 'review', cardId, grade, now: Date.now() }), [])

  const value = useMemo(() => ({ state, deck, dispatch, review, saveFailed }), [state, deck, review, saveFailed])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext)
  if (!v) throw new Error('useStore hors StoreProvider')
  return v
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
