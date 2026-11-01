import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  FileHead,
  H,
  IndexCard,
  JournalBox,
  Notebook,
  Page,
  PaperButton,
  RoughCircle,
  Stamp,
  Tape,
  TapeButton,
  TypedLink,
} from '../components/journal/Journal'
import { ProgressBar } from '../components/ui'
import { getGhost, GHOSTS, MECHANICS } from '../data'
import { namesGhost, type Card, type CardKind, type CoachNote } from '../engine/cards'
import { dayKey, fr, NBSP, NNBSP, relativeDays, safeDate } from '../engine/format'
import { isCoachNote, isOwnNote } from '../engine/notes'
import { buildReviewQueue, sessionGhosts, studiedGhosts, unseenCards } from '../engine/progress'
import { questionForCard, type Question } from '../engine/quiz'
import { humanDuration, isDue, schedule, type CardState, type Grade } from '../engine/srs'
import { ignoreKey } from '../engine/keys'
import type { Profile } from '../store/schema'
import { useStore } from '../store/store'
import { answersBefore, comesBackInSession, LEARN_MORE, nextSession, passesBefore, requeue, requeueGap, stillToAsk } from './reviewSession'

type Style = CSSProperties & Record<`--${string}`, string | number>

/** Juste : la carte s'espace (« Bien ») ; faux ou « Je ne sais pas » : elle revient vite (« À revoir »). */
const RIGHT: Grade = 3
const WRONG: Grade = 1
/** L'explication de la répétition espacée, montrée pendant la première séance, jusqu'à ce qu'on la ferme. */
const HELP_KEY = 'phasmo-coach/aide-revision'

const LETTERS = 'ABCD'
/** Au-delà, une réponse court sur plusieurs lignes : on entoure sa lettre plutôt que tout le bloc. */
const SHORT_ANSWER = 18

/** Ce que demande la carte, tapé en haut à droite de la fiche. */
const KIND_LABEL: Record<CardKind, string> = {
  sanity: 'Seuil de chasse',
  speed: 'Vitesse',
  tells: 'Signes clés',
  reverse: 'Signe à reconnaître',
  test: 'Test sans preuve',
  fact: 'Mécanique',
  note: 'Note',
}

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const STAMP_DATE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

/** Épaisseur de la pile sous la carte : des tranches de 3 px, qui s'amenuisent avec les cartes restantes. */
const pileLayers = (left: number) => (left <= 0 ? 0 : Math.min(14, Math.ceil(Math.sqrt(left) * 2.4)))

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Le mot seul, accordé au nombre (le nombre est composé à part, souvent en gras). */
const word = (n: number, one: string, many = one + 's') => (n > 1 ? many : one)

/** « 10 min », « 4 j » : le nombre ne quitte pas son unité. */
const dur = (ms: number) => humanDuration(ms).replace(' ', NBSP)

/**
 * Quand la carte revient : « demain », « dans 3 jours »… ; en apprentissage, « à ta prochaine séance » (elle est
 * déjà due pour la séance suivante, voir LEARN_AHEAD), sinon « dans 25 min ».
 */
function comesBack(s: CardState, now: number): string {
  if (s.phase === 'review') return relativeDays(s.due, now).replace(/(\d) /u, `$1${NBSP}`)
  return isDue(s, now) ? 'à ta prochaine séance' : `dans ${dur(s.due - now)}`
}

/** Ce que devient la carte qu'on vient de noter : « repasse plus loin dans cette séance », « revient demain »… */
function returnLine(o: { ok: boolean; again: boolean; next: CardState; at: number }): string {
  if (o.again) return 'repasse plus loin dans cette séance'
  // ratée encore après son retour : elle attend la séance suivante (MAX_RETURNS)
  if (!o.ok) return 'reviendra à ta prochaine séance'
  return `revient ${comesBack(o.next, o.at)}`
}

function readHelpDismissed(): boolean {
  try {
    return localStorage.getItem(HELP_KEY) === '1'
  } catch {
    return false
  }
}

/** Qui a écrit la note : le coach (stylo rouge), la personne qui tient le carnet, ou quelqu'un d'autre. */
type Hand = 'coach' | 'mine' | 'other'
function handOf(note: CoachNote | undefined, profile: Profile): Hand {
  if (!note) return 'other'
  if (isCoachNote(note, profile)) return 'coach'
  if (isOwnNote(note, profile)) return 'mine'
  return 'other'
}
function noteLabel(note: CoachNote | undefined, profile: Profile): string {
  if (handOf(note, profile) === 'mine') return 'Ma note'
  return note?.author ? `Note de ${note.author}` : 'Note du carnet'
}

function deckLabel(c: Card): string {
  if (c.deck === 'mechanics') return MECHANICS.topics.find((t) => t.id === c.topicId)?.title ?? 'Mécaniques'
  return getGhost(c.ghostId ?? '')?.name ?? 'Entité'
}

/**
 * Titre court d'une carte pour la fiche de séance. Une carte qui repassera dans la séance (`masked`) n'y
 * nomme pas son entité, comme l'en-tête de la carte : elle se lirait en face de la question.
 */
function cardTitle(c: Card, notes: CoachNote[], profile: Profile, masked: boolean): { name: string; kind: string } {
  if (c.deck === 'coach') {
    const note = notes.find((n) => `n:${n.id}` === c.id)
    return { name: noteLabel(note, profile), kind: masked ? '' : (getGhost(c.ghostId ?? '')?.name ?? '') }
  }
  if (c.deck === 'mechanics') return { name: deckLabel(c), kind: 'Mécanique' }
  return { name: masked ? 'Entité inconnue' : deckLabel(c), kind: KIND_LABEL[c.kind] }
}

/** Fiche de séance : chaque réponse y reçoit son tampon. `ahead` : les cartes qui repasseront dans la séance. */
function SessionCard({
  rows,
  closed,
  ahead,
  notes,
  profile,
}: {
  rows: { id: string; t: number; g: Grade; card: Card }[]
  closed?: boolean
  ahead?: ReadonlySet<string>
  notes: CoachNote[]
  profile: Profile
}) {
  const shown = rows.slice(-7)
  const hidden = rows.length - shown.length
  return (
    <div className="libcard rv-session settle" style={{ '--r': '-1deg', '--d': '.2s' } as Style}>
      <Tape />
      <h3>Fiche de séance</h3>
      <div className="cols">
        <span>Carte</span>
        <span>Réponse</span>
      </div>
      <ol>
        {hidden > 0 && (
          <li className="rv-more-rows">
            <span className="rv-s-name">
              … et {hidden} {word(hidden, 'réponse')} plus tôt
            </span>
            <span />
          </li>
        )}
        {shown.length === 0 && (
          <li>
            <span className="rv-s-name rv-s-empty">aucune réponse pour l’instant</span>
            <span />
          </li>
        )}
        {shown.map((r, k) => {
          const { name, kind } = cardTitle(r.card, notes, profile, !closed && !!ahead?.has(r.id))
          const ok = r.g >= 3
          return (
            <li key={`${r.id}-${r.t}`}>
              <span className="rv-s-name">
                {name}
                {kind && <small>{kind}</small>}
              </span>
              <Stamp small tone={ok ? 'ink' : 'red'} plain={ok} rotate={[-3, 2, -1.5, 3][k % 4]} thunk={k === shown.length - 1} delay={0.05}>
                {ok ? 'Exact' : 'À revoir'}
              </Stamp>
            </li>
          )
        })}
      </ol>
      {closed && (
        <Stamp thunk rotate={-9} delay={0.7} className="rv-libstamp">
          Séance close
        </Stamp>
      )}
    </div>
  )
}

/** La réponse donnée à la carte en cours (la note est déjà enregistrée : on lit la correction). */
interface Outcome {
  cardId: string
  /** le choix touché ; null pour « Je ne sais pas » */
  choice: string | null
  ok: boolean
  /** la carte revient plus loin dans la séance */
  again: boolean
  next: CardState
  at: number
}

/** Une ligne de choix, comme une case de la copie : cochée quand on la touche, puis corrigée au stylo rouge. */
function ChoiceRow({
  q,
  c,
  i,
  outcome,
  onPick,
}: {
  q: Question
  c: Question['choices'][number]
  i: number
  outcome: Outcome | null
  onPick: (id: string) => void
}) {
  const answered = !!outcome
  const picked = outcome?.choice === c.id
  const right = q.correct.includes(c.id)
  const long = c.label.length > SHORT_ANSWER
  const st = !answered ? '' : right ? 'right' : picked ? 'wrong' : 'idle'
  return (
    <li>
      <button
        type="button"
        className={`rv-choice ${st}`}
        disabled={answered}
        aria-keyshortcuts={`${i + 1} ${LETTERS[i].toLowerCase()}`}
        onClick={() => onPick(c.id)}
      >
        <JournalBox state={picked ? 'yes' : 'empty'} seed={`${q.id}-${c.id}`} delay={0.05 + i * 0.04} />
        <span className="rv-letter">
          {answered && right && long ? (
            <RoughCircle seed={`${q.id}-${c.id}-ok`} padX={0.3} padY={0.12} delay={0.2} width={2}>
              {LETTERS[i]}
            </RoughCircle>
          ) : (
            LETTERS[i]
          )}
          .
        </span>
        <span className="rv-label">
          {answered && right && !long ? (
            <RoughCircle seed={`${q.id}-${c.id}-ok`} padX={0.06} padY={0.22} delay={0.2} width={2}>
              {c.label}
            </RoughCircle>
          ) : (
            c.label
          )}
        </span>
        {answered && right && <span className="sr-only">{NNBSP}: bonne réponse</span>}
        {picked && !right && <span className="sr-only">{NNBSP}: ton choix, faux</span>}
      </button>
    </li>
  )
}

export function Review() {
  const { state, deck, review, dispatch } = useStore()
  const [queue, setQueue] = useState<Card[]>(() => buildReviewQueue(state, deck, Date.now()))
  // les entités de la séance, fixées au départ : une ou deux d'entre elles parmi les mauvaises réponses des
  // QCM, pour que la bonne ne soit pas « l'entité de la carte d'avant »
  const [peers, setPeers] = useState<string[]>(() => sessionGhosts(queue))
  // les entités déjà étudiées au début de la séance : hors de la séance, les autres mauvaises réponses
  const [known, setKnown] = useState<string[]>(() => studiedGhosts(deck, state.cards))
  const [done, setDone] = useState(0)
  const [good, setGood] = useState(0)
  const [finished, setFinished] = useState(false)
  // début de séance : relit dans le journal les réponses données depuis, et fixe le jour des choix
  const [since, setSince] = useState(() => Date.now())
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  // carte sans choix : la réponse est retournée, on dit si on savait
  const [revealed, setRevealed] = useState(false)
  // carte sans choix, déjà notée : quand elle revient (dit sur la carte suivante)
  const [previous, setPrevious] = useState<string | null>(null)
  // passages de chaque carte dans la séance : une carte qui revient se pose autrement (voir questionForCard)
  const [passes, setPasses] = useState<Record<string, number>>({})
  const [helpOpen, setHelpOpen] = useState(() => !readHelpDismissed())
  // « 4 cartes terminées sur 12 » : les cartes distinctes de la séance (une carte qui repasse ne l'allonge pas)
  const [total, setTotal] = useState(queue.length)
  // cartes terminées pour la séance (leur dernière réponse ne les fait pas repasser) : le trait d'avancement
  const [settled, setSettled] = useState(0)

  const card = queue[0]
  const now = Date.now()
  const remainingNew = useMemo(() => unseenCards(deck, state.cards, state.settings).length, [deck, state.cards, state.settings])
  const graded = useMemo(() => {
    const byId = new Map(deck.map((c) => [c.id, c]))
    return state.log
      .filter((l) => l.t >= since)
      .map((l) => ({ ...l, card: byId.get(l.id) }))
      .filter((l): l is typeof l & { card: Card } => !!l.card)
  }, [state.log, deck, since])
  // première séance : rien au journal avant elle
  const firstSession = useMemo(() => !state.log.some((l) => l.t < since), [state.log, since])

  const day = useMemo(() => dayKey(since), [since])
  // une carte déjà répondue plus tôt dans la journée (séance précédente) compte ces passages-là aussi
  const earlier = useMemo(() => passesBefore(state.log, since), [since])
  // et les jours d'avant : d'un jour à l'autre aussi, une carte alterne ses façons de se poser
  const before = useMemo(() => answersBefore(state.log, since), [since])
  const pass = card ? (earlier[card.id] ?? 0) + (passes[card.id] ?? 0) : 0
  const seen = card ? (before[card.id] ?? 0) : 0
  const question = useMemo(
    () => (card ? questionForCard(card, { allGhosts: GHOSTS, mechanics: MECHANICS, notes: state.notes, day, pass, seen, peers, known }) : null),
    [card, day, pass, seen, state.notes, peers, known],
  )
  // l'état de la carte quand elle arrive : « Nouvelle » ne disparaît pas sous les yeux une fois la réponse notée
  const cardKey = card ? `${card.id}#${pass}` : ''
  const arrival = useMemo(() => (card ? state.cards[card.id] : undefined), [cardKey])

  const finish = useCallback(
    (reviewed: number, correct: number) => {
      setFinished(true)
      if (reviewed > 0) {
        dispatch({
          type: 'activity',
          activity: { t: Date.now(), kind: 'review', score: correct, total: reviewed, label: 'Révision' },
        })
      }
    },
    [dispatch],
  )

  /** Carte suivante ; une carte ratée repart plus loin dans la pile (au moins REQUEUE_GAP cartes, voir requeue). */
  const advance = useCallback(
    (o: Outcome, reviewed: number, correct: number) => {
      let rest = queue.slice(1)
      if (o.again && queue[0]) {
        rest = requeue(rest, queue[0], requeueGap(o.next, o.at))
        setPasses((p) => ({ ...p, [o.cardId]: (p[o.cardId] ?? 0) + 1 }))
      }
      setOutcome(null)
      setRevealed(false)
      setQueue(rest)
      if (rest.length === 0) finish(reviewed, correct)
    },
    [queue, finish],
  )

  /**
   * Note la carte : juste → « Bien » (elle s'espace), faux ou « Je ne sais pas » → « À revoir » (elle revient vite).
   * Un QCM montre ensuite la correction ; une carte sans choix passe aussitôt à la suivante.
   */
  const record = useCallback(
    (g: Grade, choice?: string | null) => {
      if (!card || finished || outcome) return
      const at = Date.now()
      const next = schedule(state.cards[card.id], g, at)
      review(card.id, g)
      const reviewed = done + 1
      const correct = good + (g >= 3 ? 1 : 0)
      setDone(reviewed)
      setGood(correct)
      const o: Outcome = { cardId: card.id, choice: choice ?? null, ok: g >= 3, again: comesBackInSession(next, at, passes[card.id] ?? 0), next, at }
      if (!o.again) setSettled((n) => n + 1)
      if (choice === undefined) {
        setPrevious(`la carte précédente ${returnLine(o)}`)
        advance(o, reviewed, correct)
      } else {
        setPrevious(null)
        setOutcome(o)
      }
    },
    [card, finished, outcome, state.cards, review, done, good, advance, passes],
  )

  const pick = useCallback(
    (id: string | null) => {
      if (!question) return
      record(id != null && question.correct.includes(id) ? RIGHT : WRONG, id)
    },
    [question, record],
  )
  const goOn = useCallback(() => {
    if (outcome) advance(outcome, done, good)
  }, [outcome, advance, done, good])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // sur un choix ou « Je ne sais pas », les chiffres et lettres restent actifs ; Entrée et Espace y gardent leur rôle
      if (ignoreKey(e, (el) => !!el.closest('.rv-card') && e.key !== 'Enter' && e.key !== ' ')) return
      // fin de séance : la carte suivante est encore en tête de file, mais hors de l'écran
      if (!card || finished) return
      const key = e.key.toLowerCase()
      if (question) {
        if (outcome) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            goOn()
          }
          return
        }
        const k = /^[1-4]$/.test(key) ? Number(key) - 1 : /^[a-d]$/.test(key) ? key.charCodeAt(0) - 97 : -1
        const c = question.choices[k]
        if (c) {
          e.preventDefault()
          pick(c.id)
        }
      } else if (!revealed) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          setRevealed(true)
        }
      } else if (key === 'o') record(RIGHT)
      else if (key === 'n') record(WRONG)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, finished, question, outcome, revealed, goOn, pick, record])

  const pileRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLHeadingElement>(null)
  const actRef = useRef<HTMLDivElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // nouvelle carte : elle revient en haut de l'écran, et le focus sur sa question (Tab mène aux choix)
  useEffect(() => {
    if (done === 0 || !cardKey) return
    const el = pileRef.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
    promptRef.current?.focus({ preventScroll: true })
  }, [cardKey])

  // réponse donnée (ou carte retournée) : l'action suivante prend le focus et reste à l'écran, au-dessus
  // de la barre d'onglets du téléphone (scroll-padding de la page, marge de .rv-act)
  useEffect(() => {
    if (!outcome && !revealed) return
    const act = actRef.current
    if (outcome) act?.querySelector<HTMLElement>('.btn-tape')?.focus({ preventScroll: true })
    else answerRef.current?.focus({ preventScroll: true })
    const behavior: ScrollBehavior = reducedMotion() ? 'auto' : 'smooth'
    const show = () => {
      if (!act?.isConnected) return
      // téléphone : le bouton colle au bas de l'écran ; on fait monter la correction (tampon et premières lignes) au-dessus de lui
      const back = act.parentElement?.querySelector<HTMLElement>('.rv-feedback .rv-back')
      if (back && getComputedStyle(act).position === 'sticky') {
        const b = back.getBoundingClientRect()
        const dy = Math.min(b.bottom, b.top + 150) - (act.getBoundingClientRect().top - 12)
        if (dy > 0) window.scrollBy({ top: Math.min(dy, b.top - 12), behavior })
      } else act.scrollIntoView({ block: 'nearest', behavior })
    }
    show()
    // la bonne réponse passe en gras : une police pas encore chargée peut allonger la fiche après coup
    document.fonts?.ready.then(show)
  }, [outcome, revealed])

  useEffect(() => {
    if (!finished) return
    window.scrollTo({ top: 0 })
    titleRef.current?.focus({ preventScroll: true })
  }, [finished])

  /** Nouvelle séance : les compteurs repartent de zéro (la précédente est déjà au registre). */
  const restart = (extraNew: number) => {
    const fresh = buildReviewQueue(state, deck, Date.now(), extraNew)
    setQueue(fresh)
    setPeers(sessionGhosts(fresh))
    setKnown(studiedGhosts(deck, state.cards))
    setTotal(fresh.length)
    setSettled(0)
    setDone(0)
    setGood(0)
    setOutcome(null)
    setRevealed(false)
    setPrevious(null)
    setPasses({})
    setSince(Date.now())
    setFinished(false)
  }

  const closeHelp = () => {
    setHelpOpen(false)
    try {
      localStorage.setItem(HELP_KEY, '1')
    } catch {
      /* navigation privée : elle se refermera pour cette séance seulement */
    }
  }

  /* ---------- fin de séance, ou rien à revoir ---------- */
  if (!card || finished) {
    const ended = finished && done > 0
    const title = finished ? 'Séance terminée' : 'Tout est à jour'
    const sessions = state.activity.filter((a) => a.kind === 'review').slice(-5)
    // cartes encore dues (séance interrompue, ou questions laissées pour une autre séance) : on propose de
    // continuer plutôt que d'en apprendre d'autres ; le bouton annonce la séance que le clic lancera
    const pending = buildReviewQueue(state, deck, now).length
    const learnable = pending > 0 ? 0 : buildReviewQueue(state, deck, now, LEARN_MORE).length
    const next = nextSession(pending, learnable, finished && stillToAsk(queue, outcome).size > 0)
    // quand revient la prochaine carte ? (en apprentissage : à la minute ; en révision : le jour prévu)
    const inDeck = new Set(deck.map((c) => c.id))
    let nextDue = Infinity
    let nextPhase = ''
    for (const [id, s] of Object.entries(state.cards)) {
      if (inDeck.has(id) && !isDue(s, now) && s.due < nextDue) {
        nextDue = s.due
        nextPhase = s.phase
      }
    }
    const nextWhen =
      nextDue === Infinity ? '' : nextPhase === 'review' ? relativeDays(nextDue, now).replace(/(\d) /, `$1${NBSP}`) : `dans ${dur(nextDue - now)}`
    // ce qui revient quand : les cartes vues pendant la séance, groupées par retour
    const returns: { when: string; due: number; n: number }[] = []
    if (ended) {
      for (const id of new Set(graded.map((r) => r.id))) {
        const s = state.cards[id]
        if (!s) continue
        const when = comesBack(s, now)
        const row = returns.find((r) => r.when === when)
        if (row) {
          row.n++
          row.due = Math.min(row.due, s.due)
        } else returns.push({ when, due: s.due, n: 1 })
      }
      returns.sort((a, b) => a.due - b.due)
    }
    const missed = done - good
    // les cartes de la séance encore à revoir (ratées deux fois : déjà dues pour la séance suivante)
    const again = returns.filter((r) => r.when === 'à ta prochaine séance').reduce((n, r) => n + r.n, 0)
    return (
      <Notebook className="rv rv-done">
        <Page side="left" section="2" label={title}>
          <FileHead>
            <span>Fichier de révision</span>
            <span>Séance du {SHORT.format(now)}</span>
          </FileHead>

          <h1 className="rv-title" ref={titleRef} tabIndex={-1}>
            <em>Révision du jour</em>
            {title}
          </h1>
          {ended ? (
            <>
              <p className="rv-count">
                <b>{done}</b>
                <span>{word(done, 'réponse', 'réponses')}</span>
              </p>
              <p className="rv-lead">
                {good === 0 ? 'Aucune juste' : `${good} ${word(good, 'juste')}`}
                {', '}
                {missed === 0 ? 'aucune erreur' : `${missed} ${word(missed, 'erreur')}`}.{' '}
                {again > 0
                  ? `${again} ${word(again, 'carte ratée deux fois repasse', 'cartes ratées deux fois repassent')} à ta prochaine séance, les autres reviendront plus tard`
                  : 'Les cartes reviendront plus tard, juste avant que tu les oublies'}
                {NNBSP}: c’est ce qui les fixe en mémoire.
              </p>
              {returns.length > 0 && (
                <section className="rv-returns" aria-labelledby="h-rv-returns">
                  <h2 id="h-rv-returns">Prochains retours</h2>
                  <ul>
                    {returns.map((r) => (
                      <li key={r.when}>
                        <span>{r.when.charAt(0).toUpperCase() + r.when.slice(1)}</span>
                        <span>
                          {r.n} {word(r.n, 'carte')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : finished && pending > 0 ? (
            <p className="rv-lead">Séance interrompue avant la première réponse{NNBSP}: les cartes du jour t’attendent toujours.</p>
          ) : (
            <p className="rv-lead">
              Les cartes reviennent au moment où tu risques de les oublier. Rien à revoir pour l’instant
              {nextWhen ? `${NNBSP}: la prochaine revient ${nextWhen}.` : '.'}
              {remainingNew > 0 && ' En attendant, tu peux apprendre quelques nouvelles cartes.'}
            </p>
          )}
          <div className="rv-next">
            {next ? (
              <TapeButton onClick={() => restart(next.extraNew)}>{next.label}</TapeButton>
            ) : (
              <TapeButton to="/quiz">Faire un quiz</TapeButton>
            )}
            <div className="rv-next-links">
              {next && <TypedLink to="/quiz">Faire un quiz</TypedLink>}
              <TypedLink to="/enquete">Lancer une mise en situation</TypedLink>
            </div>
          </div>
          {remainingNew > 0 && (
            <p className="pencil-note rv-unseen">
              {remainingNew} {word(remainingNew, 'carte pas encore découverte', 'cartes pas encore découvertes')} dans le fichier
            </p>
          )}
        </Page>

        <Page side="right" section="2" label="Registre des séances">
          <FileHead>
            <span>Registre</span>
            <span>
              {sessions.length === 0 ? (
                'aucune séance'
              ) : (
                <>
                  <b>{sessions.length}</b> {word(sessions.length, 'séance récente', 'séances récentes')}
                </>
              )}
            </span>
          </FileHead>
          {graded.length > 0 && <SessionCard rows={graded} closed notes={state.notes} profile={state.profile} />}

          <section className="rv-history" aria-labelledby="h-rv-hist">
            <H id="h-rv-hist" as="h2">
              Relevé des séances
            </H>
            <div className="libcard rv-libcard settle" style={{ '--r': '1.4deg', '--d': '.35s' } as Style}>
              <Tape />
              <h3>Fiche de révision</h3>
              <div className="cols">
                <span>Date</span>
                <span>Réponses</span>
                <span>Justes</span>
              </div>
              <ol>
                {sessions.length === 0 && (
                  <li>
                    <span className="d">—</span>
                    <span className="n">pas encore de séance</span>
                    <span />
                  </li>
                )}
                {sessions.map((s, k) => {
                  const current = ended && k === sessions.length - 1
                  return (
                    <li key={`${s.t}-${k}`} className={current ? 'is-now' : undefined} style={{ '--r': `${[-2, 1, -1.5, 2, -1][k % 5]}deg` } as Style}>
                      <span className="d">{safeDate(STAMP_DATE, s.t)}</span>
                      <span className="n">{s.total}</span>
                      <span className={current ? 'res hand' : 'n'}>
                        {s.score}/{s.total}
                      </span>
                    </li>
                  )
                })}
              </ol>
              {graded.length === 0 && (
                <Stamp thunk tone={finished ? 'red' : 'violet'} rotate={-8} delay={0.7} className="rv-libstamp">
                  {finished ? 'Séance close' : 'À jour'}
                </Stamp>
              )}
            </div>
          </section>
        </Page>
      </Notebook>
    )
  }

  /* ---------- la carte ---------- */
  const ghost = card.ghostId ? getGhost(card.ghostId) : undefined
  const isNote = card.deck === 'coach'
  const note = isNote ? state.notes.find((n) => `n:${n.id}` === card.id) : undefined
  // seules les vraies notes du coach sont au stylo rouge ; une note de l'élève reste à l'encre
  const hand = isNote ? handOf(note, state.profile) : undefined
  // le texte d'une note reste tel qu'il a été écrit ; le reste reçoit la typographie française
  const text = (s: string) => (isNote ? s : fr(s))
  const answered = !!outcome
  const shown = answered || revealed
  // l'en-tête ne souffle jamais la réponse : l'entité n'y paraît qu'une fois nommée par la question, ou après la réponse
  const prompt = question ? question.prompt : text(card.front)
  const quote = question ? question.quote : card.quote ? text(card.quote) : undefined
  const hides = !isNote && !!ghost && !namesGhost(`${prompt} ${quote ?? ''}`, ghost) && card.deck === 'ghost'
  const headLeft = isNote ? noteLabel(note, state.profile) : hides && !shown ? 'Entité inconnue' : deckLabel(card)
  const headRight = isNote ? (shown ? (ghost?.name ?? '') : '') : KIND_LABEL[card.kind]

  // le compteur ne recule jamais : le numéro de la question dans la séance (une carte qui repasse en est une
  // nouvelle), et les cartes terminées, celles qui ne repasseront plus aujourd'hui
  const asked = done + (outcome ? 0 : 1)
  const last = queue.length === 1 && !outcome?.again
  const left = queue.length - 1

  // le verso : ce qui n'est pas déjà écrit dans la bonne réponse ou dans la citation
  const rightLabel = question?.choices.find((c) => question.correct.includes(c.id))?.label
  const backText = card.kind === 'test' && question ? question.explain : text(card.back)
  const showBack = backText !== rightLabel && backText !== quote
  const instruction = question
    ? answered
      ? 'Lis la correction, puis passe à la carte suivante.'
      : 'Touche la bonne réponse.'
    : revealed
      ? `Dis honnêtement si tu savais${NNBSP}: la carte reviendra plus tôt sinon.`
      : `Cherche la réponse de tête, puis touche «${NNBSP}Voir la réponse${NNBSP}».`

  // première séance : la révision espacée en deux phrases, au crayon (en haut sur téléphone, sur la page de droite sinon)
  const help = (where: string) =>
    helpOpen &&
    firstSession && (
      <aside className={`rv-help ${where}`} aria-label="La révision espacée">
        <p className="pencil-note">
          La révision espacée te repose chaque carte juste avant que tu l’oublies. Bonne réponse{NNBSP}: elle revient plus tard, demain
          puis de plus en plus loin. Erreur{NNBSP}: elle repasse quelques cartes plus loin dans la séance, souvent posée autrement.
        </p>
        <TypedLink onClick={closeHelp}>Compris</TypedLink>
      </aside>
    )

  const verso = (
    <>
      {showBack && (isNote ? <p className="rv-hand hand">{backText}</p> : <p className="rv-answer">{backText}</p>)}
      {card.backList && card.backList.length > 0 && (
        <ul className={isNote ? 'rv-list rv-list--hand' : 'rv-list'}>
          {card.backList.map((b, i) => (
            <li key={i} className={isNote ? 'hand' : undefined}>
              {text(b)}
            </li>
          ))}
        </ul>
      )}
      {isNote && note?.author && <p className="rv-sign hand">— {note.author}</p>}
      {ghost && (
        <p className="rv-more">
          <TypedLink to={`/codex/${ghost.id}`}>Relire la fiche {ghost.name}</TypedLink>
        </p>
      )}
    </>
  )

  return (
    <Notebook className="rv">
      <Page side="left" section="2" label="La carte">
        <FileHead>
          <span>Fichier de révision</span>
          <span>Séance du {SHORT.format(now)}</span>
        </FileHead>

        <H as="h1">Révision du jour</H>

        <div className="rv-progress">
          <p className="rv-step" aria-live="polite">
            Question <b>{asked}</b>
            {pass > 0 && <span className="rv-again"> · carte déjà vue</span>}
          </p>
          <ProgressBar value={total ? settled / total : 0} label="Cartes terminées pour cette séance" />
          <p className="rv-settled">
            <b>{settled}</b> {settled > 1 ? 'cartes terminées' : 'carte terminée'} sur {total}
          </p>
        </div>

        {help('rv-help--top')}
        {previous && <p className="pencil-note rv-requeued">{previous}</p>}

        <div ref={pileRef} className="rv-pile" style={{ '--left': pileLayers(left) } as Style}>
          <IndexCard
            key={cardKey}
            className={`rv-card settle${isNote ? ' rv-card--note' : ''}${hand && hand !== 'coach' ? ' rv-card--mine' : ''}`}
            head={headLeft}
            right={headRight}
            clip={isNote}
            rotate={-0.4}
          >
            <div className="rv-instr-line">
              <p className="rv-instr">{instruction}</p>
              {!arrival && (
                <Stamp small tone="violet" rotate={4}>
                  Nouvelle
                </Stamp>
              )}
              {arrival?.phase === 'relearning' && (
                <Stamp small tone="pencil" rotate={-3}>
                  À consolider
                </Stamp>
              )}
            </div>
            <h2 className="rv-question" ref={promptRef} tabIndex={-1}>
              {prompt}
            </h2>
            {quote && <blockquote className="rv-quote">{quote}</blockquote>}
            {question?.note && <p className="pencil-note">{question.note}</p>}

            {question ? (
              <>
                <ol className="rv-choices" aria-label="Réponses possibles">
                  {question.choices.map((c, i) => (
                    <ChoiceRow key={c.id} q={question} c={c} i={i} outcome={outcome} onPick={pick} />
                  ))}
                </ol>
                {!answered && (
                  <div className="rv-dunno">
                    <TypedLink onClick={() => pick(null)}>Je ne sais pas</TypedLink>
                    <span className="rv-keys" aria-hidden>
                      touches 1 à {question.choices.length}, ou A à {LETTERS[question.choices.length - 1]}
                    </span>
                  </div>
                )}
              </>
            ) : (
              !revealed && (
                <div className="rv-front-foot">
                  <PaperButton onClick={() => setRevealed(true)} rotate={-0.8}>
                    Voir la réponse <span className="kbd">Espace</span>
                  </PaperButton>
                </div>
              )
            )}

            <div className="rv-feedback" aria-live="polite">
              {outcome && (
                <div className="rv-back">
                  <div className="rv-verdict">
                    <Stamp thunk tone="red" rotate={outcome.ok ? -5 : -7} delay={0.1}>
                      {outcome.ok ? 'Exact' : 'À revoir'}
                    </Stamp>
                    <p className="pencil-note rv-return">
                      {outcome.ok ? `elle ${returnLine(outcome)}` : `la bonne réponse est entourée · elle ${returnLine(outcome)}`}
                    </p>
                  </div>
                  {verso}
                </div>
              )}
              {!question && revealed && (
                <div className="rv-back" ref={answerRef} tabIndex={-1}>
                  <p className="rv-verso">La réponse</p>
                  {isNote ? (
                    <p className="rv-hand hand">{card.back}</p>
                  ) : (
                    <p className="rv-answer">{fr(card.back)}</p>
                  )}
                  {card.backList && card.backList.length > 0 && (
                    <ul className={isNote ? 'rv-list rv-list--hand' : 'rv-list'}>
                      {card.backList.map((b, i) => (
                        <li key={i} className={isNote ? 'hand' : undefined}>
                          {text(b)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {isNote && note?.author && <p className="rv-sign hand">— {note.author}</p>}
                </div>
              )}
            </div>
          </IndexCard>
        </div>

        {(answered || (!question && revealed)) && (
          <div ref={actRef} className={`rv-act${answered ? '' : ' rv-act--self'}`}>
            {answered ? (
              <>
                <TapeButton onClick={goOn}>{last ? 'Terminer la séance' : 'Carte suivante'}</TapeButton>
                <span className="rv-keys" aria-hidden>
                  Entrée pour continuer
                </span>
              </>
            ) : (
              <div className="rv-self" role="group" aria-label={`As-tu su répondre${NNBSP}?`}>
                <button type="button" className="rv-self-btn" onClick={() => record(RIGHT)} aria-keyshortcuts="o">
                  Je savais <span className="kbd">O</span>
                </button>
                <button type="button" className="rv-self-btn" onClick={() => record(WRONG)} aria-keyshortcuts="n">
                  Je ne savais pas <span className="kbd">N</span>
                </button>
              </div>
            )}
          </div>
        )}
      </Page>

      <Page side="right" section="2" label="Fiche de séance">
        <FileHead>
          <span>Séance</span>
          <span>
            {done === 0 ? (
              'aucune réponse'
            ) : (
              <>
                <b>{good}</b> {word(good, 'juste')} sur {done}
              </>
            )}
          </span>
        </FileHead>

        {help('rv-help--side')}
        <section className={`rv-log${graded.length ? '' : ' is-empty'}`} aria-label="Réponses de la séance">
          <SessionCard rows={graded} ahead={stillToAsk(queue, outcome)} notes={state.notes} profile={state.profile} />
        </section>

        <div className="rv-foot">
          <TypedLink onClick={() => finish(done, good)}>Terminer la séance</TypedLink>
        </div>
      </Page>
    </Notebook>
  )
}
