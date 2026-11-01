import type { Card } from './cards'
import { dayKey, startOfDay } from './format'
import { coachNameOf, sameName } from './notes'
import { createRng, hashString, shuffle, type Rng } from './random'
import { cardMastery, isDue, isLearned, type CardState } from './srs'
import type { Activity, AnswerStats, PersistedState, Profile, ReviewEntry, Settings } from '../store/schema'

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

/** Une carte tirée d'une note écrite par le coach (et non par la personne qui tient le carnet). */
export function isCoachCard(c: Card, profile: Profile | undefined): boolean {
  const coach = profile ? coachNameOf(profile) : ''
  return c.deck === 'coach' && !!coach && !!c.author && sameName(c.author, coach)
}

/**
 * Les nouvelles cartes, dans l'ordre où les découvrir : les notes du coach d'abord, puis ses propres
 * notes, puis l'ordre pédagogique (les entités ciblées seulement, si la personne en a choisi).
 */
export function unseenCards(deck: Card[], cards: Record<string, CardState>, settings: Settings, profile?: Profile): Card[] {
  const focus = settings.focus && settings.focus.length ? new Set(settings.focus) : null
  const rank = (c: Card) => (isCoachCard(c, profile) ? 0 : c.deck === 'coach' ? 1 : 2)
  return deck
    .filter((c) => !cards[c.id])
    .filter((c) => settings.includeMechanics || c.deck !== 'mechanics')
    .filter((c) => !focus || c.deck !== 'ghost' || (c.ghostId && focus.has(c.ghostId)))
    .sort((a, b) => rank(a) - rank(b) || a.order - b.order)
}

/**
 * Deux cartes qui posent la même question : le seuil (ou la vitesse) de deux entités standard se demande
 * pareil (« Laquelle de ces entités a un seuil de chasse habituel de 50 %… ? »), seule la bonne réponse
 * change. Leur clé commune, ou null pour une carte qui pose sa propre question.
 */
export function askKey(c: Card): string | null {
  return c.kind === 'sanity' || c.kind === 'speed' ? `${c.kind}|${c.back}` : null
}

/** Les nouvelles cartes d'une journée viennent d'au moins autant d'entités (trois cartes chacune pour 12 cartes). */
export const NEW_GHOSTS_PER_DAY = 4

/**
 * Les n premières nouvelles cartes à découvrir, dans l'ordre pédagogique, mais réparties entre plusieurs
 * entités : une carte de chacune à tour de rôle, parmi les NEW_GHOSTS_PER_DAY premières qui en ont encore (et
 * davantage si la limite du jour est haute). Les notes passent d'abord, telles quelles. Sans cela, les cartes
 * d'une même entité arriveraient d'un bloc : sa carte de signes, puis son seuil, sa vitesse, ses tests…,
 * chacune ayant pour réponse l'entité de la carte précédente. Une même question (askKey) ne se pose qu'une
 * fois par jour : `taken`, celles des cartes dues de la séance.
 */
export function pickNewCards(unseen: Card[], n: number, taken: Iterable<string> = []): Card[] {
  const out = unseen.filter((c) => c.deck === 'coach').slice(0, n)
  const groups: Card[][] = []
  const at = new Map<string, Card[]>()
  for (const c of unseen) {
    if (c.deck === 'coach') continue
    const key = c.ghostId ?? c.id
    let group = at.get(key)
    if (!group) {
      at.set(key, (group = []))
      groups.push(group)
    }
    group.push(c)
  }
  // les cartes d'une entité, une de chaque sorte à tour de rôle (signes, test, seuil, signe à reconnaître,
  // vitesse) : sinon la journée aligne seuils et vitesses, presque toujours la même question pour une entité
  // standard (« Laquelle de ces entités chasse à 50 %, comme une entité standard ? »)
  for (const group of groups) group.splice(0, group.length, ...byKindTurns(group))
  const width = Math.max(NEW_GHOSTS_PER_DAY, Math.ceil((n - out.length) / 3))
  const active = groups.splice(0, width)
  // une question déjà posée dans la journée ne revient pas pour une autre entité : jamais deux fois parmi les
  // nouvelles cartes, et celle d'une carte due seulement s'il ne reste rien d'autre à découvrir
  const fromDue = new Set(taken)
  const asked = new Set<string>()
  const free = (c: Card) => {
    const k = askKey(c)
    return !k || (!asked.has(k) && !fromDue.has(k))
  }
  const later: Card[] = []
  while (out.length < n && active.length) {
    for (let i = 0; i < active.length && out.length < n; i++) {
      const j = active[i].findIndex(free)
      if (j < 0) {
        // il ne lui reste aujourd'hui que des questions déjà posées : elles attendront
        later.push(...active[i])
        active[i] = []
      } else {
        const [c] = active[i].splice(j, 1)
        const k = askKey(c)
        if (k) asked.add(k)
        out.push(c)
      }
      if (!active[i].length) {
        // une entité épuisée laisse sa place à la suivante
        const next = groups.shift()
        if (next) active[i] = next
        else active.splice(i--, 1)
      }
    }
  }
  // plus rien d'autre à découvrir : la question d'une carte due, tenue à l'écart dans la séance (spreadByGhost)
  for (const c of later) {
    if (out.length >= n) break
    const k = askKey(c)
    if (k && asked.has(k)) continue
    if (k) asked.add(k)
    out.push(c)
  }
  return out
}

const NEW_KIND_TURNS: Card['kind'][] = ['tells', 'test', 'sanity', 'reverse', 'speed']

/** Une carte de chaque sorte à tour de rôle, dans l'ordre NEW_KIND_TURNS (les autres sortes à la fin, dans leur ordre). */
function byKindTurns(cards: readonly Card[]): Card[] {
  const queues = NEW_KIND_TURNS.map((k) => cards.filter((c) => c.kind === k))
  const out: Card[] = []
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift()!)
  return [...out, ...cards.filter((c) => !NEW_KIND_TURNS.includes(c.kind))]
}

/** Combien de cartes au moins séparent deux cartes d'une même entité dans la séance (quand c'est possible). */
export const SAME_GHOST_GAP = 3
/** Combien de cartes au moins séparent deux cartes qui posent la même question (askKey), quand c'est possible. */
export const SAME_ASK_GAP = 5

/**
 * La séance dans un ordre tiré pour la journée, où deux cartes d'une même entité ne se suivent pas de moins
 * de SAME_GHOST_GAP cartes : la carte d'avant ne souffle pas la réponse (son entité, nommée dans la
 * correction), et des cartes apprises ensemble ne reviennent pas ensemble dans le même ordre. À chaque pas,
 * l'entité qui a le plus de cartes à placer passe d'abord ; à égalité, une carte d'une autre sorte que la
 * précédente (signes, seuil, vitesse, test…).
 */
export function spreadByGhost(cards: readonly Card[], rng: Rng): Card[] {
  const rest = shuffle(rng, cards)
  const out: Card[] = []
  const left = new Map<string, number>()
  const keyOf = (c: Card) => c.ghostId ?? ''
  for (const c of rest) left.set(keyOf(c), (left.get(keyOf(c)) ?? 0) + 1)
  while (rest.length) {
    const recent = new Set(out.slice(-SAME_GHOST_GAP).map(keyOf).filter(Boolean))
    const recentAsks = new Set(out.slice(-SAME_ASK_GAP).map(askKey).filter(Boolean))
    const lastKind = out.at(-1)?.kind
    // à égalité, une autre sorte de carte que la précédente : pas deux seuils de suite
    const rank = (c: Card) => 2 * (left.get(keyOf(c)) ?? 0) + (c.kind !== lastKind ? 1 : 0)
    let best = -1
    // d'abord sans voisin de la même entité ni de la même question, puis sans voisin de la même entité
    for (const strict of [true, false]) {
      for (let i = 0; i < rest.length; i++) {
        const k = keyOf(rest[i])
        if (k && recent.has(k)) continue
        const a = askKey(rest[i])
        if (strict && a && recentAsks.has(a)) continue
        if (best < 0 || rank(rest[i]) > rank(rest[best])) best = i
      }
      if (best >= 0) break
    }
    // plus de place sans voisin de la même entité : celle qu'on a placée le plus tôt
    if (best < 0) {
      const last = (k: string) => out.map(keyOf).lastIndexOf(k)
      best = rest.reduce((b, c, i) => (last(keyOf(c)) < last(keyOf(rest[b])) ? i : b), 0)
    }
    const [c] = rest.splice(best, 1)
    left.set(keyOf(c), (left.get(keyOf(c)) ?? 1) - 1)
    out.push(c)
  }
  return out
}

/**
 * File de la séance : cartes dues + nouvelles cartes dans la limite du jour (réparties entre plusieurs
 * entités, voir pickNewCards). Une note du coach toute neuve passe avant tout ; le reste, cartes dues et
 * nouvelles mêlées, suit un ordre tiré pour la journée, sans deux cartes d'une même entité à moins de
 * SAME_GHOST_GAP cartes l'une de l'autre (voir spreadByGhost).
 */
export function buildReviewQueue(state: PersistedState, deck: Card[], now: number, extraNew = 0): Card[] {
  const due = dueCards(deck, state.cards, now)
  const remainingNew = Math.max(0, state.settings.newPerDay - newCardsIntroducedToday(state.log, now)) + extraNew
  const all = pickNewCards(
    unseenCards(deck, state.cards, state.settings, state.profile),
    remainingNew,
    due.map(askKey).filter((k): k is string => !!k),
  )
  const coach = all.filter((c) => isCoachCard(c, state.profile))
  const fresh = all.filter((c) => !isCoachCard(c, state.profile))
  const rng = createRng(parseInt(hashString(`séance|${dayKey(now)}`), 36))
  return [...coach, ...spreadByGhost([...due, ...fresh], rng)]
}

/**
 * Les entités d'une séance, à passer à questionForCard (peers) : ses QCM prennent d'abord leurs mauvaises
 * réponses parmi elles.
 */
export function sessionGhosts(queue: readonly Card[]): string[] {
  return [...new Set(queue.map((c) => c.ghostId).filter((id): id is string => !!id))].sort()
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
