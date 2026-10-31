import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { FileHead, H, IndexCard, Notebook, Page, PaperButton, Stamp, Tape, TapeButton, TypedLink } from '../components/journal/Journal'
import { getGhost, MECHANICS } from '../data'
import type { Card, CardKind, CoachNote } from '../engine/cards'
import { fr, NBSP, NNBSP, relativeDays, safeDate } from '../engine/format'
import { isCoachNote, isOwnNote } from '../engine/notes'
import { buildReviewQueue, unseenCards } from '../engine/progress'
import { humanDuration, isDue, schedule, type Grade } from '../engine/srs'
import { ignoreKey } from '../engine/keys'
import type { Profile } from '../store/schema'
import { useStore } from '../store/store'

type Style = CSSProperties & Record<`--${string}`, string | number>

const GRADES: { g: Grade; label: string; cls: string; tone: 'red' | 'violet' | 'ink'; rotate: number }[] = [
  { g: 1, label: 'À revoir', cls: 'again', tone: 'red', rotate: -4 },
  { g: 2, label: 'Difficile', cls: 'hard', tone: 'violet', rotate: 2.5 },
  { g: 3, label: 'Bien', cls: 'good', tone: 'ink', rotate: -2 },
  { g: 4, label: 'Facile', cls: 'easy', tone: 'ink', rotate: 3.5 },
]

const REQUEUE_WITHIN = 20 * 60_000
/** Cartes nouvelles proposées d'un coup après la séance. */
const LEARN_MORE = 10

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
const narrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 759px)').matches

/** Le mot seul, accordé au nombre (le nombre est composé à part, souvent en gras). */
const word = (n: number, one: string, many = one + 's') => (n > 1 ? many : one)

/** « 10 min », « 4 j » : le nombre ne quitte pas son unité. */
const dur = (ms: number) => humanDuration(ms).replace(' ', NBSP)

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

/** Titre court d'une carte pour la fiche de séance. */
function cardTitle(c: Card, notes: CoachNote[], profile: Profile): { name: string; kind: string } {
  if (c.deck === 'coach') {
    const note = notes.find((n) => `n:${n.id}` === c.id)
    return { name: noteLabel(note, profile), kind: getGhost(c.ghostId ?? '')?.name ?? '' }
  }
  if (c.deck === 'mechanics') return { name: deckLabel(c), kind: 'Mécanique' }
  return { name: deckLabel(c), kind: KIND_LABEL[c.kind] }
}

/** Fiche de séance : chaque carte notée y reçoit son tampon. */
function SessionCard({
  rows,
  closed,
  notes,
  profile,
}: {
  rows: { id: string; t: number; g: Grade; card: Card }[]
  closed?: boolean
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
        <span>Note</span>
      </div>
      <ol>
        {hidden > 0 && (
          <li className="rv-more-rows">
            <span className="rv-s-name">
              … et {hidden} {word(hidden, 'carte')} plus tôt
            </span>
            <span />
          </li>
        )}
        {shown.length === 0 && (
          <li>
            <span className="rv-s-name rv-s-empty">aucune carte notée pour l’instant</span>
            <span />
          </li>
        )}
        {shown.map((r, k) => {
          const { name, kind } = cardTitle(r.card, notes, profile)
          const gr = GRADES.find((x) => x.g === r.g)!
          return (
            <li key={`${r.id}-${r.t}`}>
              <span className="rv-s-name">
                {name}
                {kind && <small>{kind}</small>}
              </span>
              <Stamp small tone={gr.tone} plain rotate={[-3, 2, -1.5, 3][k % 4]} thunk={k === shown.length - 1} delay={0.05}>
                {gr.label}
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

export function Review() {
  const { state, deck, review, dispatch } = useStore()
  const [queue, setQueue] = useState<Card[]>(() => buildReviewQueue(state, deck, Date.now()))
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  const [good, setGood] = useState(0)
  const [finished, setFinished] = useState(false)
  // la carte qu'on vient de noter revient plus loin dans la pile (« À revoir », « Difficile »…)
  const [requeued, setRequeued] = useState(false)
  // début de séance : sert seulement à relire, dans le journal, les cartes notées depuis
  const [since, setSince] = useState(() => Date.now())

  const card = queue[0]
  const cardState = card ? state.cards[card.id] : undefined
  const now = Date.now()
  const remainingNew = useMemo(() => unseenCards(deck, state.cards, state.settings).length, [deck, state.cards, state.settings])
  const graded = useMemo(() => {
    const byId = new Map(deck.map((c) => [c.id, c]))
    return state.log
      .filter((l) => l.t >= since)
      .map((l) => ({ ...l, card: byId.get(l.id) }))
      .filter((l): l is typeof l & { card: Card } => !!l.card)
  }, [state.log, deck, since])

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

  const grade = useCallback(
    (g: Grade) => {
      if (!card || !revealed || finished) return
      const at = Date.now()
      const next = schedule(state.cards[card.id], g, at)
      review(card.id, g)
      const reviewed = done + 1
      const correct = good + (g >= 3 ? 1 : 0)
      setDone(reviewed)
      setGood(correct)
      setRevealed(false)
      const rest = queue.slice(1)
      const again = next.due - at < REQUEUE_WITHIN
      if (again) {
        // la carte revient plus loin dans la séance, d'autant plus loin que son échéance est lointaine
        const gap = Math.max(3, Math.round((next.due - at) / 60_000))
        rest.splice(Math.min(rest.length, gap), 0, card)
      }
      setRequeued(again && rest[0]?.id !== card.id)
      setQueue(rest)
      if (rest.length === 0) finish(reviewed, correct)
    },
    [card, revealed, finished, state.cards, review, done, good, queue, finish],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // les boutons de note restent utilisables au clavier (1 à 4) même s'ils ont le focus
      if (ignoreKey(e, (el) => !!el.closest('.grades, .flash-reveal'))) return
      // fin de séance : la carte suivante est encore en tête de file, mais hors de l'écran
      if (!card || finished) return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setRevealed(true)
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        grade(Number(e.key) as Grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, revealed, finished, grade])

  // présentation seulement : la nouvelle carte revient à l'écran (sur téléphone, on note sous la carte)
  const pileRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const gradesRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const el = pileRef.current
    if (el && done > 0 && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
    // le focus suit la carte : le bouton « Retourner la carte » de la suivante (les tampons sont désactivés)
    if (done > 0) document.querySelector<HTMLElement>('.rv-pile .flash-reveal button')?.focus({ preventScroll: true })
  }, [done])

  // carte retournée : le focus passe au verso (lu par les lecteurs d'écran, Tab mène ensuite aux tampons) ;
  // sur téléphone, les tampons remontent au-dessus de la barre d'onglets sans faire sortir le verso par le haut
  useEffect(() => {
    if (!revealed) return
    const back = backRef.current
    back?.focus({ preventScroll: true })
    const grades = gradesRef.current
    if (!back || !grades || !narrow()) return
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) || 0
    const want = grades.getBoundingClientRect().bottom - (window.innerHeight - pad)
    const room = back.getBoundingClientRect().top - 12
    const dy = Math.min(want, room)
    if (dy > 0) window.scrollBy({ top: dy, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [revealed])

  useEffect(() => {
    if (!finished) return
    window.scrollTo({ top: 0 })
    titleRef.current?.focus({ preventScroll: true })
  }, [finished])

  /** Nouvelle séance : les compteurs repartent de zéro (la précédente est déjà au registre). */
  const restart = (extraNew: number) => {
    setQueue(buildReviewQueue(state, deck, Date.now(), extraNew))
    setDone(0)
    setGood(0)
    setRequeued(false)
    setRevealed(false)
    setSince(Date.now())
    setFinished(false)
  }

  /* ---------- fin de séance, ou rien à revoir ---------- */
  if (!card || finished) {
    const ended = finished && done > 0
    const title = finished ? 'Séance terminée' : 'Tout est à jour'
    const sessions = state.activity.filter((a) => a.kind === 'review').slice(-5)
    // cartes encore dues (séance interrompue) : on propose de reprendre plutôt que d'en apprendre d'autres
    const pending = buildReviewQueue(state, deck, now).length
    const learn = Math.min(LEARN_MORE, remainingNew)
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
                <span>{word(done, 'carte révisée', 'cartes révisées')}</span>
              </p>
              <p className="rv-lead">
                {good === 0
                  ? `Aucune jugée «${NNBSP}Bien${NNBSP}» ou «${NNBSP}Facile${NNBSP}».`
                  : `Dont ${good} ${word(good, 'jugée', 'jugées')} «${NNBSP}Bien${NNBSP}» ou «${NNBSP}Facile${NNBSP}».`}{' '}
                Les cartes difficiles reviendront plus tôt, les autres s’espaceront.
              </p>
            </>
          ) : finished && pending > 0 ? (
            <p className="rv-lead">Séance interrompue avant la première note{NNBSP}: les cartes du jour t’attendent toujours.</p>
          ) : (
            <p className="rv-lead">
              Les cartes reviennent au moment où tu risques de les oublier. Rien à revoir pour l’instant
              {nextWhen ? `${NNBSP}: la prochaine revient ${nextWhen}.` : '.'}
              {remainingNew > 0 && ' En attendant, tu peux apprendre quelques nouvelles cartes.'}
            </p>
          )}
          <div className="rv-next">
            {pending > 0 ? (
              <TapeButton onClick={() => restart(0)}>Reprendre la séance</TapeButton>
            ) : learn > 0 ? (
              <TapeButton onClick={() => restart(LEARN_MORE)}>
                Apprendre {learn} {word(learn, 'carte')}
              </TapeButton>
            ) : (
              <TapeButton to="/quiz">Faire un quiz</TapeButton>
            )}
            <div className="rv-next-links">
              {(pending > 0 || learn > 0) && <TypedLink to="/quiz">Faire un quiz</TypedLink>}
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
                <span>Cartes</span>
                <span>Réussies</span>
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

  const ghost = card.ghostId ? getGhost(card.ghostId) : undefined
  const left = queue.length - 1
  const isNote = card.deck === 'coach'
  const note = isNote ? state.notes.find((n) => `n:${n.id}` === card.id) : undefined
  // seules les vraies notes du coach sont au stylo rouge ; une note de l'élève reste à l'encre
  const hand = isNote ? handOf(note, state.profile) : undefined
  // le texte d'une note reste tel qu'il a été écrit ; le reste reçoit la typographie française
  const text = (s: string) => (isNote ? s : fr(s))
  // l'en-tête ne doit jamais souffler la réponse : pas d'entité avant de retourner la carte
  const headLeft = isNote ? noteLabel(note, state.profile) : card.kind === 'reverse' && !revealed ? 'Entité inconnue' : deckLabel(card)
  const headRight = isNote ? (revealed ? (ghost?.name ?? '') : '') : KIND_LABEL[card.kind]

  return (
    <Notebook className="rv">
      <Page side="left" section="2" label="La carte">
        <FileHead>
          <span>Fichier de révision</span>
          <span>Séance du {SHORT.format(now)}</span>
        </FileHead>

        <H as="h1" count={`carte ${done + 1}`}>
          Révision du jour
        </H>

        <div ref={pileRef} className="rv-pile" style={{ '--left': pileLayers(left) } as Style} aria-live="polite">
          <IndexCard
            key={card.id}
            className={`rv-card settle${isNote ? ' rv-card--note' : ''}${hand && hand !== 'coach' ? ' rv-card--mine' : ''}`}
            head={headLeft}
            right={headRight}
            clip={isNote}
            rotate={-0.4}
          >
            <div className="rv-front">
              <h2 className="rv-question">{text(card.front)}</h2>
              {card.quote && <blockquote className="rv-quote">{text(card.quote)}</blockquote>}
              <div className="rv-front-foot">
                {!revealed && (
                  <span className="flash-reveal">
                    <PaperButton onClick={() => setRevealed(true)} rotate={-0.8}>
                      Retourner la carte <span className="kbd">Espace</span>
                    </PaperButton>
                  </span>
                )}
                {!cardState && (
                  <Stamp small tone="violet" rotate={4}>
                    Nouvelle
                  </Stamp>
                )}
                {cardState?.phase === 'relearning' && (
                  <Stamp small tone="pencil" rotate={-3}>
                    À consolider
                  </Stamp>
                )}
              </div>
            </div>

            {revealed && (
              <div className="rv-back" ref={backRef} tabIndex={-1}>
                <p className="rv-verso">Au dos</p>
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
                {ghost && (
                  <p className="rv-more">
                    <TypedLink to={`/codex/${ghost.id}`}>Relire la fiche {ghost.name}</TypedLink>
                  </p>
                )}
              </div>
            )}
          </IndexCard>
        </div>
        <p className="rv-pile-n">{left > 0 ? `encore ${left} ${word(left, 'carte')} dans la pile` : 'dernière carte de la pile'}</p>
        {requeued && <p className="pencil-note rv-requeued">la précédente revient plus loin dans la pile</p>}
      </Page>

      <Page side="right" section="2" label="Notation">
        <FileHead>
          <span>Notation</span>
          <span>
            {done === 0 ? (
              'aucune carte notée'
            ) : (
              <>
                <b>{done}</b> {word(done, 'carte notée', 'cartes notées')}
              </>
            )}
          </span>
        </FileHead>

        <section ref={gradesRef} className={`grades rv-grades${revealed ? '' : ' is-idle'}`} role="group" aria-labelledby="h-rv-grade">
          <H id="h-rv-grade" as="h2">
            Comment ça s’est passé{NNBSP}?
          </H>
          <p className="pencil-note rv-hint" aria-hidden>
            {revealed ? <span className="rv-keys">touches 1 à 4</span> : 'retourne d’abord la carte, puis tamponne ta réponse'}
          </p>
          <div className="rv-stamps">
            {GRADES.map(({ g, label, cls, tone, rotate }) => {
              const when = dur(schedule(cardState, g, now).due - now)
              return (
                <button
                  key={g}
                  type="button"
                  className={`rv-grade ${cls}`}
                  onClick={() => grade(g)}
                  disabled={!revealed}
                  aria-label={`${label}${NNBSP}: la carte revient dans ${when}`}
                  aria-keyshortcuts={String(g)}
                >
                  <Stamp tone={tone} plain={g === 3} rotate={rotate}>
                    {label}
                  </Stamp>
                  <span className="rv-when">revient dans {when}</span>
                  <span className="kbd" aria-hidden>
                    {g}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className={`rv-log${graded.length ? '' : ' is-empty'}`} aria-label="Cartes notées pendant la séance">
          <SessionCard rows={graded} notes={state.notes} profile={state.profile} />
        </section>

        <div className="rv-foot">
          <TypedLink onClick={() => finish(done, good)}>Terminer la séance</TypedLink>
        </div>
      </Page>
    </Notebook>
  )
}
