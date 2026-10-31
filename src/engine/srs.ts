/**
 * Répétition espacée (variante de SM-2 avec étapes d'apprentissage, proche d'Anki).
 * Toutes les fonctions sont pures : l'état est stocké dans le store.
 */

export type Grade = 1 | 2 | 3 | 4 // 1 = À revoir, 2 = Difficile, 3 = Bien, 4 = Facile

export type Phase = 'learning' | 'review' | 'relearning'

export interface CardState {
  phase: Phase
  /** index de l'étape d'apprentissage */
  step: number
  /** intervalle en jours (phase review) */
  interval: number
  ease: number
  due: number
  reps: number
  lapses: number
  last: number
}

const MIN = 60_000
const DAY = 86_400_000

export const LEARNING_STEPS = [1 * MIN, 10 * MIN]
export const RELEARNING_STEPS = [10 * MIN]
export const START_EASE = 2.5
export const MIN_EASE = 1.3
const GRADUATE_DAYS = 1
const EASY_GRADUATE_DAYS = 4
const MAX_INTERVAL = 365

export function newCardState(now: number): CardState {
  return { phase: 'learning', step: 0, interval: 0, ease: START_EASE, due: now, reps: 0, lapses: 0, last: 0 }
}

function graduate(s: CardState, now: number, days: number): CardState {
  const interval = Math.min(MAX_INTERVAL, days)
  return { ...s, phase: 'review', step: 0, interval, due: now + interval * DAY }
}

export function schedule(prev: CardState | undefined, grade: Grade, now: number): CardState {
  const s: CardState = { ...(prev ?? newCardState(now)), reps: (prev?.reps ?? 0) + 1, last: now }

  if (s.phase === 'learning' || s.phase === 'relearning') {
    const steps = s.phase === 'learning' ? LEARNING_STEPS : RELEARNING_STEPS
    // après une rechute, on repart d'un intervalle déjà réduit
    const graduateDays = s.phase === 'relearning' ? Math.max(1, s.interval) : GRADUATE_DAYS
    switch (grade) {
      case 1:
        return { ...s, step: 0, due: now + steps[0] }
      case 2: {
        const cur = steps[Math.min(s.step, steps.length - 1)]
        const next = steps[Math.min(s.step + 1, steps.length - 1)]
        return { ...s, due: now + Math.round((cur + next) / 2) }
      }
      case 3: {
        const step = s.step + 1
        if (step >= steps.length) return graduate(s, now, graduateDays)
        return { ...s, step, due: now + steps[step] }
      }
      case 4:
        return graduate(s, now, s.phase === 'relearning' ? graduateDays + 1 : EASY_GRADUATE_DAYS)
    }
  }

  // phase review : « Difficile » < « Bien » < « Facile », toujours strictement
  const ivl = Math.max(1, s.interval)
  const hardI = Math.min(MAX_INTERVAL, Math.max(ivl + 1, Math.round(ivl * 1.2)))
  const goodI = Math.min(MAX_INTERVAL, Math.max(hardI + 1, Math.round(ivl * s.ease)))
  const easyI = Math.min(MAX_INTERVAL, Math.max(goodI + 1, Math.round(ivl * s.ease * 1.3)))
  switch (grade) {
    case 1:
      return {
        ...s,
        phase: 'relearning',
        step: 0,
        lapses: s.lapses + 1,
        ease: Math.max(MIN_EASE, s.ease - 0.2),
        interval: Math.max(1, Math.round(ivl * 0.3)),
        due: now + RELEARNING_STEPS[0],
      }
    case 2:
      return { ...s, ease: Math.max(MIN_EASE, s.ease - 0.15), interval: hardI, due: now + hardI * DAY }
    case 3:
      return { ...s, interval: goodI, due: now + goodI * DAY }
    case 4:
      return { ...s, ease: s.ease + 0.15, interval: easyI, due: now + easyI * DAY }
  }
}

/** Libellé de l'intervalle prévu pour chaque bouton (affiché sous les boutons). */
export function previewInterval(prev: CardState | undefined, grade: Grade, now: number): string {
  const next = schedule(prev, grade, now)
  return humanDuration(next.due - now)
}

export function humanDuration(ms: number): string {
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} min`
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))} h`
  const d = Math.round(ms / DAY)
  if (d < 31) return `${d} j`
  if (d < 365) return `${Math.round(d / 30)} mois`
  return `${Math.round(d / 365)} an`
}

export function endOfDay(now: number): number {
  const d = new Date(now)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/** Une carte en apprentissage est due à l'instant prévu ; une carte en révision dès le jour prévu. */
export function isDue(s: CardState, now: number): boolean {
  if (s.phase === 'review') return s.due <= endOfDay(now)
  return s.due <= now
}

/** Maîtrise d'une carte entre 0 et 1. */
export function cardMastery(s: CardState | undefined): number {
  if (!s) return 0
  if (s.phase === 'learning') return 0.1 + 0.05 * s.step
  if (s.phase === 'relearning') return 0.2
  return Math.min(1, 0.35 + 0.65 * (s.interval / 30))
}

export function isLearned(s: CardState | undefined): boolean {
  return !!s && s.phase === 'review'
}
