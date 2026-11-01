import type { Card } from '../engine/cards'
import { startOfDay } from '../engine/format'
import { askKey, SAME_ASK_GAP, SAME_GHOST_GAP } from '../engine/progress'
import { LEARN_AHEAD, type CardState } from '../engine/srs'
import type { ReviewEntry } from '../store/schema'

/** Cartes nouvelles proposées d'un coup après la séance (« Apprendre 10 cartes »). */
export const LEARN_MORE = 10

/**
 * Une carte dont l'échéance tombe avant repasse dans la séance : une carte ratée (nouvelle : 1 min ; déjà
 * apprise : 10 min). Juste, une carte passe au lendemain ou plus loin, et ne repasse pas. C'est aussi
 * l'avance d'apprentissage (LEARN_AHEAD) : une carte ratée qui ne repasse plus dans cette séance est déjà due
 * pour la suivante.
 */
export const REQUEUE_WITHIN = LEARN_AHEAD

/** Une carte ratée repasse au moins autant de cartes plus loin (en dernier s'il en reste moins). */
export const REQUEUE_GAP = 5

/**
 * Une carte ratée repasse une fois dans la séance. Ratée encore, elle attend la séance suivante (« Continuer
 * avec N cartes » : elle est déjà due, voir LEARN_AHEAD) : sinon la fin de séance tournerait sur les deux ou
 * trois mêmes cartes.
 */
export const MAX_RETURNS = 1

/** La carte repasse-t-elle dans cette séance ? `returns` : combien de fois elle y est déjà repassée. */
export function comesBackInSession(next: CardState, at: number, returns = 0): boolean {
  return next.due - at < REQUEUE_WITHIN && returns < MAX_RETURNS
}

/** Combien de cartes au moins avant son retour : d'autant plus que son échéance est lointaine (une par minute). */
export function requeueGap(next: CardState, at: number): number {
  return Math.max(REQUEUE_GAP, Math.round((next.due - at) / 60_000))
}

/**
 * La file après une carte ratée : `rest`, les cartes qui suivent, et `card` remise au moins `gap` cartes plus
 * loin (en dernier s'il en reste moins). Parmi les places possibles, la première où elle n'a aucune carte de
 * la même entité à moins de SAME_GHOST_GAP cartes, ni la même question (askKey) à moins de SAME_ASK_GAP
 * cartes, ni une carte de la même sorte juste avant ou juste après (cherchée sur REQUEUE_GAP places au plus :
 * la sorte ne vaut pas d'attendre la fin de la séance) ; sinon la première sans voisine de la même entité ni
 * de la même question, puis sans voisine de la même entité ; sinon la première place possible. Insérer une
 * carte ne rapproche jamais deux autres cartes.
 */
export function requeue(rest: readonly Card[], card: Card, gap = REQUEUE_GAP): Card[] {
  const from = Math.min(rest.length, Math.max(0, gap))
  // la carte qu'on vient de répondre est juste avant rest[0] : c'est elle-même
  const at = (i: number) => (i < 0 ? card : rest[i])
  const near = (p: number, span: number, same: (c: Card) => boolean) => {
    for (let i = p - span; i < p + span; i++) if (i < rest.length && same(at(i))) return true
    return false
  }
  const ask = askKey(card)
  const ghostOk = (p: number) => !card.ghostId || !near(p, SAME_GHOST_GAP, (c) => c.ghostId === card.ghostId)
  const askOk = (p: number) => !ask || !near(p, SAME_ASK_GAP, (c) => askKey(c) === ask)
  const kindOk = (p: number) => at(p - 1).kind !== card.kind && (p >= rest.length || rest[p].kind !== card.kind)
  const rules: [((p: number) => boolean)[], number][] = [
    [[ghostOk, askOk, kindOk], Math.min(rest.length, from + REQUEUE_GAP)],
    [[ghostOk, askOk], rest.length],
    [[ghostOk], rest.length],
  ]
  let place = from
  search: for (const [rule, last] of rules) {
    for (let p = from; p <= last; p++) {
      if (rule.every((ok) => ok(p))) {
        place = p
        break search
      }
    }
  }
  return [...rest.slice(0, place), card, ...rest.slice(place)]
}

/**
 * Combien de fois chaque carte a déjà été répondue aujourd'hui avant `since` (le début de la séance) : une
 * carte ratée dans une séance précédente du jour revient posée autrement, comme dans la même séance.
 */
export function passesBefore(log: readonly ReviewEntry[], since: number): Record<string, number> {
  const start = startOfDay(since)
  const out: Record<string, number> = {}
  for (let i = log.length - 1; i >= 0 && log[i].t >= start; i--) if (log[i].t < since) out[log[i].id] = (out[log[i].id] ?? 0) + 1
  return out
}

/**
 * Combien de fois chaque carte a été répondue les jours d'avant (avant le jour de `since`) : à passer à
 * questionForCard (seen), une carte alterne ses façons de se poser d'un jour à l'autre aussi.
 */
export function answersBefore(log: readonly ReviewEntry[], since: number): Record<string, number> {
  const start = startOfDay(since)
  const out: Record<string, number> = {}
  for (const l of log) if (l.t < start) out[l.id] = (out[l.id] ?? 0) + 1
  return out
}

/**
 * Les cartes qui passeront encore dans la séance : toute la file, sauf la carte en cours une fois répondue
 * si elle ne repasse pas. La fiche de séance tait leur entité, comme l'en-tête de la carte : une carte ratée
 * qui revient trouverait sinon sa réponse écrite en face d'elle (« Poltergeist · Test sans preuve · À revoir »).
 */
export function stillToAsk(queue: readonly Card[], answered: { again: boolean } | null): Set<string> {
  const rest = answered && !answered.again ? queue.slice(1) : queue
  return new Set(rest.map((c) => c.id))
}

const cards = (n: number) => `${n} ${n > 1 ? 'cartes' : 'carte'}`

/**
 * Le bouton de fin de séance, d'après les séances que le clic lancera : `pending`, la file d'une séance
 * sans cartes en plus ; `learnable`, celle d'une séance avec LEARN_MORE cartes nouvelles en plus. Une même
 * question ne se pose qu'une fois par séance : une séance finie peut en laisser d'autres pour la suivante, et
 * la fin du fichier en promettre moins que LEARN_MORE. « Reprendre » seulement pour une séance interrompue
 * (des cartes restaient dans la file) ; null : plus rien à réviser ni à découvrir.
 */
export function nextSession(pending: number, learnable: number, interrupted: boolean): { label: string; extraNew: number } | null {
  if (pending > 0) return { label: interrupted ? 'Reprendre la séance' : `Continuer avec ${cards(pending)}`, extraNew: 0 }
  if (learnable > 0) return { label: `Apprendre ${cards(learnable)}`, extraNew: LEARN_MORE }
  return null
}
