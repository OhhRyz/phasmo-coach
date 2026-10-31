import type { Card } from './cards'
import { dayKey, startOfDay } from './format'
import { cardMastery, isDue, isLearned, type CardState } from './srs'
import type { Activity, AnswerStats, PersistedState, ReviewEntry, Settings } from '../store/schema'

export function dueCards(deck: Card[], cards: Record<string, CardState>, now: number): Card[] {
  return deck
    .filter((c) => cards[c.id] && isDue(cards[c.id], now))
    .sort((a, b) => cards[a.id].due - cards[b.id].due)
}

export function newCardsIntroducedToday(log: ReviewEntry[], now: number): number {
  const start = startOfDay(now)
  const ids = new Set<string>()
  for (let i = log.length - 1; i >= 0 && log[i].t >= start; i--) if (log[i].isNew) ids.add(log[i].id)
  return ids.size
}

export function unseenCards(deck: Card[], cards: Record<string, CardState>, settings: Settings): Card[] {
  const focus = settings.focus && settings.focus.length ? new Set(settings.focus) : null
  return deck
    .filter((c) => !cards[c.id])
    .filter((c) => settings.includeMechanics || c.deck !== 'mechanics')
    .filter((c) => !focus || c.deck !== 'ghost' || (c.ghostId && focus.has(c.ghostId)))
    .sort((a, b) => {
      // notes du coach d'abord, puis entités ciblées, puis ordre pédagogique
      const pa = a.deck === 'coach' ? 0 : 1
      const pb = b.deck === 'coach' ? 0 : 1
      return pa - pb || a.order - b.order
    })
}

/** File de la séance : cartes dues + nouvelles cartes dans la limite du jour. */
export function buildReviewQueue(state: PersistedState, deck: Card[], now: number, extraNew = 0): Card[] {
  const due = dueCards(deck, state.cards, now)
  const remainingNew = Math.max(0, state.settings.newPerDay - newCardsIntroducedToday(state.log, now)) + extraNew
  const fresh = unseenCards(deck, state.cards, state.settings).slice(0, remainingNew)
  // on intercale les nouvelles cartes pour éviter un bloc monotone
  const out: Card[] = []
  let j = 0
  due.forEach((c, i) => {
    out.push(c)
    if ((i + 1) % 3 === 0 && j < fresh.length) out.push(fresh[j++])
  })
  while (j < fresh.length) out.push(fresh[j++])
  return out
}

export function answerAccuracy(s: AnswerStats | undefined): number | null {
  if (!s || s.recent.length < 3) return null
  return s.recent.reduce((a, b) => a + b, 0) / s.recent.length
}

/** Maîtrise d'une entité : cartes de révision (70 %) + réussite récente aux quiz/enquêtes (30 %). */
export function ghostMastery(ghostId: string, deck: Card[], state: PersistedState): number {
  const cards = deck.filter((c) => c.ghostId === ghostId && c.deck === 'ghost')
  const cardAvg = cards.length ? cards.reduce((s, c) => s + cardMastery(state.cards[c.id]), 0) / cards.length : 0
  const acc = answerAccuracy(state.answers[`ghost:${ghostId}`])
  return acc == null ? cardAvg : 0.7 * cardAvg + 0.3 * acc
}

export function allGhostMastery(ghostIds: string[], deck: Card[], state: PersistedState): Record<string, number> {
  return Object.fromEntries(ghostIds.map((id) => [id, ghostMastery(id, deck, state)]))
}

export interface MasteryLevel {
  label: string
  tone: 'none' | 'low' | 'mid' | 'good' | 'max'
}

export function masteryLevel(m: number): MasteryLevel {
  if (m < 0.08) return { label: 'À découvrir', tone: 'none' }
  if (m < 0.35) return { label: 'Découverte', tone: 'low' }
  if (m < 0.6) return { label: 'En cours', tone: 'mid' }
  if (m < 0.85) return { label: 'Solide', tone: 'good' }
  return { label: 'Acquise', tone: 'max' }
}

/** Nombre d'entités « les moins maîtrisées » proposées partout (accueil, quiz, mise en situation). */
export const WEAK_COUNT = 6

/**
 * Les entités les moins maîtrisées. On ne classe que celles déjà travaillées (au moins une carte vue ou
 * une réponse) : une entité jamais ouverte n'est pas un point faible. S'il n'y en a aucune, on renvoie
 * les premières entités à découvrir avec started = false.
 */
export function weakestGhosts(
  ghostIds: string[],
  mastery: Record<string, number>,
  deck: Card[],
  state: PersistedState,
  n = WEAK_COUNT,
): { ids: string[]; started: boolean } {
  const touched = (id: string) =>
    !!state.answers[`ghost:${id}`]?.recent?.length || deck.some((c) => c.ghostId === id && c.deck === 'ghost' && state.cards[c.id])
  const started = ghostIds.filter((id) => touched(id) && (mastery[id] ?? 0) < 0.85)
  if (started.length) {
    const ids = [...started].sort((a, b) => (mastery[a] ?? 0) - (mastery[b] ?? 0)).slice(0, n)
    return { ids, started: true }
  }
  return { ids: ghostIds.filter((id) => !touched(id)).slice(0, n), started: false }
}

export function learnedCount(deck: Card[], cards: Record<string, CardState>): number {
  return deck.filter((c) => isLearned(cards[c.id])).length
}

/** Jours consécutifs d'activité (aujourd'hui ou hier inclus). */
export function streak(state: PersistedState, now: number): number {
  const days = new Set<string>()
  state.log.forEach((l) => days.add(dayKey(l.t)))
  state.activity.forEach((a) => days.add(dayKey(a.t)))
  let count = 0
  // on recule jour par jour avec le calendrier (et non par tranches de 24 h, faussées au changement d'heure)
  const cursor = new Date(startOfDay(now))
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
  while (days.has(dayKey(cursor.getTime()))) {
    count++
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
}

export function activityByDay(state: PersistedState, now: number, days = 14): { key: string; count: number }[] {
  const counts = new Map<string, number>()
  state.log.forEach((l) => counts.set(dayKey(l.t), (counts.get(dayKey(l.t)) ?? 0) + 1))
  state.activity.forEach((a: Activity) => counts.set(dayKey(a.t), (counts.get(dayKey(a.t)) ?? 0) + Math.max(1, a.total)))
  const out: { key: string; count: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(startOfDay(now) - i * 86_400_000 + 3_600_000)
    out.push({ key: k, count: counts.get(k) ?? 0 })
  }
  return out
}

export function recordAnswer(prev: AnswerStats | undefined, correct: boolean): AnswerStats {
  const s = prev ?? { c: 0, t: 0, recent: [] }
  return { c: s.c + (correct ? 1 : 0), t: s.t + 1, recent: [...s.recent, correct ? 1 : 0].slice(-10) }
}
