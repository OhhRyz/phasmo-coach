import type { Card } from '../engine/cards'
import { dayKey, startOfDay } from '../engine/format'
import { askKey, SAME_ASK_GAP, SAME_GHOST_GAP } from '../engine/progress'
import { isDue, LEARN_AHEAD, type CardState } from '../engine/srs'
import { DEFAULT_NEW_PER_DAY, type ReviewEntry } from '../store/schema'

/** Cartes nouvelles proposées d'un coup après la séance (« Apprendre 10 cartes »). */
export const LEARN_MORE = 10

/**
 * Une carte dont l'échéance tombe avant repasse dans la séance : une carte ratée (nouvelle : 1 min ; déjà
 * apprise : 10 min). Juste, une carte passe au lendemain ou plus loin, et ne repasse pas. C'est aussi
 * l'avance d'apprentissage (LEARN_AHEAD) : une carte ratée qui ne repasse plus dans cette séance est déjà due
 * pour la suivante.
 */
export const REQUEUE_WITHIN = LEARN_AHEAD

/** Une carte ratée repasse au moins autant de cartes plus loin (en dernier s'il en reste moins, voir REQUEUE_MIN_OTHERS). */
export const REQUEUE_GAP = 5

/**
 * Une carte ratée repasse une fois dans la séance. Ratée encore, elle attend la séance suivante (« Continuer
 * avec N cartes » : elle est déjà due, voir LEARN_AHEAD) : sinon la fin de séance tournerait sur les deux ou
 * trois mêmes cartes.
 */
export const MAX_RETURNS = 1

/**
 * Une carte ratée ne repasse dans la séance que s'il reste au moins autant d'autres cartes avant la fin : sinon
 * elle reviendrait juste après sa correction, reconnaissable à sa formulation. Elle attend alors la séance
 * suivante : due une minute plus tard, elle est déjà comptée dans « Continuer avec N cartes » (LEARN_AHEAD).
 */
export const REQUEUE_MIN_OTHERS = 3

/**
 * La carte repasse-t-elle dans cette séance ? `returns` : combien de fois elle y est déjà repassée ;
 * `others` : combien d'autres cartes restent dans la séance (sans elle).
 */
export function comesBackInSession(next: CardState, at: number, returns = 0, others = Infinity): boolean {
  return next.due - at < REQUEUE_WITHIN && returns < MAX_RETURNS && others >= REQUEUE_MIN_OTHERS
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
 * Elle s'y lit « Entité à trouver » (HIDDEN_GHOST) jusqu'à sa dernière réponse de la séance, puis se nomme.
 */
export function stillToAsk(queue: readonly Card[], answered: { again: boolean } | null): Set<string> {
  const rest = answered && !answered.again ? queue.slice(1) : queue
  return new Set(rest.map((c) => c.id))
}

/**
 * Les cartes d'une séance close qui peuvent encore se poser quand on la reprend : ni répondues depuis la clôture
 * (`closedAt` ; un autre onglet partage la progression), ni plus dues. Sinon la reprise reposerait une carte
 * répondue ailleurs quelques minutes plus tôt, et la noterait trop tôt. Une carte jamais vue reste.
 */
export function stillFresh(
  queue: readonly Card[],
  log: readonly ReviewEntry[],
  cards: Readonly<Record<string, CardState>>,
  closedAt: number,
  now: number,
): Card[] {
  const since = new Set(log.filter((l) => l.t > closedAt).map((l) => l.id))
  return queue.filter((c) => !since.has(c.id) && (!cards[c.id] || isDue(cards[c.id], now)))
}

/**
 * Ce qui tient lieu du nom de l'entité, dans l'en-tête de la carte et sur la fiche de séance, tant que ce nom
 * serait la réponse : un mot d'enquête, pas un « inconnu » qui ferait croire à une fiche cassée.
 */
export const HIDDEN_GHOST = 'Entité à trouver'

/** Une carte nouvelle : les deux premières de chaque séance disent qu'on n'est pas censé la connaître… */
export const FRAMED_PER_SESSION = 2
/** … pendant les trois premiers jours de cartes nouvelles (au réglage par défaut) ; ensuite, le tampon « Nouvelle » suffit. */
export const FRAMED_UNTIL = 3 * DEFAULT_NEW_PER_DAY

/**
 * Une carte nouvelle se pose en QCM avant qu'on ait rien appris : sa consigne le dit en toutes lettres
 * (« si tu ne sais pas, réponds au hasard… »), mais pas à chaque carte, ce serait du bruit. `inSession` :
 * les cartes nouvelles déjà répondues dans la séance ; `ever` : depuis le début du carnet.
 */
export function framesNewCard(inSession: number, ever: number): boolean {
  return inSession < FRAMED_PER_SESSION && ever < FRAMED_UNTIL
}

/** Marge entre la correction et le haut de l'écran, ou la barre d'action. */
export const CORRECTION_GAP = 12
/** Une correction trop longue pour l'écran : on en montre au moins le tampon et les premières lignes. */
export const CORRECTION_FIRST_LINES = 150

/**
 * Téléphone, réponse donnée : où amener la correction (`top`, `bottom` : sa place à l'écran), sachant que la
 * barre d'action collée au bas de l'écran commence à `barTop`. Entière entre le haut de l'écran et la barre,
 * elle y monte tout entière, et la barre reste collée. Plus longue, elle monte jusqu'à ses premières lignes,
 * et la barre suit la carte (`flows`) : collée, elle couvrirait la suite du texte pendant la lecture.
 * `right` : la bonne réponse entourée, après une erreur (la correction dit « la bonne réponse est entourée ») ;
 * elle fait alors partie du bloc à montrer et ne sort jamais par le haut de l'écran. Si elle ne tient pas avec
 * toute la correction au-dessus de la barre, la barre suit la carte et ne couvre rien.
 * `dy` : de combien faire défiler la page (jamais au-delà du haut de la correction, ni de la bonne réponse) ;
 * négatif, de combien remonter jusqu'à la bonne réponse, si elle est déjà au-dessus de l'écran.
 */
export function placeCorrection(
  back: { top: number; bottom: number },
  barTop: number,
  right?: { top: number; bottom: number },
): { flows: boolean; dy: number } {
  const room = barTop - 2 * CORRECTION_GAP
  const top = right ? Math.min(right.top, back.top) : back.top
  const flows = back.bottom - top > room
  // la correction seule tient au-dessus de la barre : elle monte tout entière, autant que la bonne réponse le permet
  const target = back.bottom - back.top > room ? Math.min(back.bottom, back.top + CORRECTION_FIRST_LINES) : back.bottom
  const dy = Math.max(0, Math.min(target - (barTop - CORRECTION_GAP), top - CORRECTION_GAP))
  // la bonne réponse est déjà passée au-dessus de l'écran (on avait fait défiler pour répondre) : on remonte jusqu'à elle
  return { flows, dy: right && right.top < CORRECTION_GAP ? right.top - CORRECTION_GAP : dy }
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

/** La séance en cours, gardée pour l'onglet : un détour (fiche, autre onglet, retour, rechargement) n'y fait rien perdre. */
export const SAVED_SESSION_KEY = 'phasmo-coach/seance-revision'

/**
 * Le paramètre des liens qui demandent une séance (« Commencer la révision », « Revoir mes erreurs dans la
 * révision »…) : ils lancent une séance, là où l'onglet, le retour ou un détour par une fiche rouvrent le bilan
 * d'une séance close.
 */
export const START_PARAM = 'seance'
/** Le lien qui demande une séance de révision (voir START_PARAM). */
export const START_REVIEW = `/revision?${START_PARAM}=nouvelle`

/**
 * La séance gardée à reprendre en ouvrant la page. `startNow` : on vient d'un lien qui demande une séance.
 * Une séance en cours reprend toujours, là où elle en était ; une séance close ne rouvre son bilan qu'en
 * revenant sur la page, pas quand un lien demande à réviser (la page repart alors sur les cartes dues).
 */
export function restoreSaved<T extends { finished: boolean }>(resumed: T | null, startNow: boolean): T | null {
  return resumed?.finished && startNow ? null : resumed
}

/** Ce qu'il faut pour reprendre une séance là où on l'a laissée (les cartes par leur identifiant). */
export interface SavedSession<O = unknown> {
  /** le jour de la séance : le lendemain, on repart sur les cartes du jour */
  day: string
  since: number
  queue: string[]
  peers: string[]
  known: string[]
  done: number
  good: number
  passes: Record<string, number>
  total: number
  settled: number
  /** la réponse donnée à la carte en tête de file, dont on lisait la correction */
  outcome: O | null
  revealed: boolean
  previous: string | null
  /** la séance est close : revenir sur la page rouvre son bilan, le jour même */
  finished?: boolean
  /** l'heure de la clôture : le bilan ne compte que les réponses données avant */
  ended?: number | null
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)

/**
 * La séance gardée, si elle se reprend : du même jour, avec au moins une réponse, et dont les réponses sont
 * bien au journal (une remise à zéro ou une sauvegarde importée entre-temps la rend caduque). En cours, il lui
 * reste des cartes ; close (`finished`), elle rouvre son bilan, avec les seules réponses données avant sa
 * clôture. Les cartes sorties du paquet (note supprimée…) sont retirées de la file.
 */
export function resumeSession<O extends { cardId: string }>(
  raw: unknown,
  deck: readonly Card[],
  log: readonly ReviewEntry[],
  now: number,
): (Omit<SavedSession<O>, 'queue' | 'finished' | 'ended'> & { queue: Card[]; finished: boolean; ended: number | null }) | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<SavedSession<O>>
  if (s.day !== dayKey(now) || typeof s.since !== 'number' || s.since > now) return null
  const done = count(s.done)
  if (done === 0) return null
  const since = s.since
  const finished = s.finished === true
  const ended = finished && typeof s.ended === 'number' && Number.isFinite(s.ended) && s.ended >= since && s.ended <= now ? s.ended : null
  if (finished && ended == null) return null
  const byId = new Map(deck.map((c) => [c.id, c]))
  const queue = strings(s.queue)
    .map((id) => byId.get(id))
    .filter((c): c is Card => !!c)
  if (!queue.length && !finished) return null
  if (log.filter((l) => l.t >= since && (ended == null || l.t <= ended)).length < done) return null
  const passes: Record<string, number> = {}
  if (s.passes && typeof s.passes === 'object') for (const [id, n] of Object.entries(s.passes)) passes[id] = count(n)
  // la correction gardée ne vaut que pour la carte en tête de file
  const outcome = s.outcome && typeof s.outcome === 'object' && queue.length > 0 && s.outcome.cardId === queue[0].id ? s.outcome : null
  return {
    day: s.day,
    since,
    queue,
    peers: strings(s.peers),
    known: strings(s.known),
    done,
    good: Math.min(count(s.good), done),
    passes,
    total: Math.max(count(s.total), queue.length),
    settled: count(s.settled),
    outcome,
    revealed: s.revealed === true && !outcome,
    previous: typeof s.previous === 'string' ? s.previous : null,
    finished,
    ended,
  }
}
