import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Evidence } from '../components/ui'
import { FileHead, H, IndexCard, Notebook, Page, PaperButton, Stamp, Tape, TapeButton, TypedLink } from '../components/journal/Journal'
import { getGhost, MECHANICS } from '../data'
import type { Card, CardKind } from '../engine/cards'
import { buildReviewQueue, unseenCards } from '../engine/progress'
import { previewInterval, schedule, type Grade } from '../engine/srs'
import { ignoreKey } from '../engine/keys'
import { useStore } from '../store/store'

type Style = CSSProperties & Record<`--${string}`, string | number>

const GRADES: { g: Grade; label: string; cls: string; tone: 'red' | 'violet' | 'ink'; rotate: number }[] = [
  { g: 1, label: 'À revoir', cls: 'again', tone: 'red', rotate: -4 },
  { g: 2, label: 'Difficile', cls: 'hard', tone: 'violet', rotate: 2.5 },
  { g: 3, label: 'Bien', cls: 'good', tone: 'ink', rotate: -2 },
  { g: 4, label: 'Facile', cls: 'easy', tone: 'ink', rotate: 3.5 },
]

const REQUEUE_WITHIN = 20 * 60_000

/** Ce que demande la carte, tapé en haut à droite de la fiche. */
const KIND_LABEL: Record<CardKind, string> = {
  evidence: 'Preuves',
  forced: 'Preuve forcée',
  sanity: 'Seuil de chasse',
  speed: 'Vitesse',
  tells: 'Signes clés',
  reverse: 'Signe à reconnaître',
  test: 'Test sans preuve',
  fact: 'Mécanique',
  note: 'Carte du coach',
}

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const STAMP_DATE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

/** Épaisseur de la pile sous la carte : des tranches de 3 px, qui s'amenuisent avec les cartes restantes. */
const pileLayers = (left: number) => (left <= 0 ? 0 : Math.min(14, Math.ceil(Math.sqrt(left) * 2.4)))

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function deckLabel(c: Card): string {
  if (c.deck === 'coach') return 'Note du coach'
  if (c.deck === 'mechanics') return MECHANICS.topics.find((t) => t.id === c.topicId)?.title ?? 'Mécaniques'
  return getGhost(c.ghostId ?? '')?.name ?? 'Entité'
}

const plural = (n: number, one: string, many = one + 's') => (n > 1 ? many : one)

/** Espaces insécables de la typographie française : « ? » ou « : » ne partent pas seuls à la ligne. */
const fr = (s: string) => s.replace(/ ([?!:;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0')

/** Titre court d'une carte pour la fiche de séance. */
function cardTitle(c: Card, author?: string): { name: string; kind: string } {
  if (c.deck === 'coach') return { name: author ? `Note de ${author}` : 'Note du coach', kind: getGhost(c.ghostId ?? '')?.name ?? '' }
  if (c.deck === 'mechanics') return { name: deckLabel(c), kind: 'Mécanique' }
  return { name: deckLabel(c), kind: KIND_LABEL[c.kind] }
}

/** Fiche de séance : chaque carte notée y reçoit son tampon. */
function SessionCard({ rows, closed, notes }: { rows: { id: string; t: number; g: Grade; card: Card }[]; closed?: boolean; notes: { id: string; author: string }[] }) {
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
            <span className="rv-s-name">… et {hidden} {plural(hidden, 'carte')} plus tôt</span>
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
          const author = r.card.deck === 'coach' ? notes.find((n) => `n:${n.id}` === r.card.id)?.author : undefined
          const { name, kind } = cardTitle(r.card, author)
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
  const [startedWith] = useState(queue.length)
  // début de séance : sert seulement à relire, dans le journal, les cartes notées depuis
  const [since] = useState(() => Date.now())

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
      if (!card || !revealed) return
      const at = Date.now()
      const next = schedule(state.cards[card.id], g, at)
      review(card.id, g)
      const reviewed = done + 1
      const correct = good + (g >= 3 ? 1 : 0)
      setDone(reviewed)
      setGood(correct)
      setRevealed(false)
      const rest = queue.slice(1)
      if (next.due - at < REQUEUE_WITHIN) {
        // la carte revient plus loin dans la séance, d'autant plus loin que son échéance est lointaine
        const gap = Math.max(3, Math.round((next.due - at) / 60_000))
        rest.splice(Math.min(rest.length, gap), 0, card)
      }
      setQueue(rest)
      if (rest.length === 0) finish(reviewed, correct)
    },
    [card, revealed, state.cards, review, done, good, queue, finish],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // les boutons de note restent utilisables au clavier (1 à 4) même s'ils ont le focus
      if (ignoreKey(e, (el) => !!el.closest('.grades, .flash-reveal'))) return
      if (!card) return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setRevealed(true)
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        grade(Number(e.key) as Grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, revealed, grade])

  // présentation seulement : la nouvelle carte revient à l'écran (sur téléphone, on note sous la carte)
  const pileRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = pileRef.current
    if (el && done > 0 && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [done])
  useEffect(() => {
    if (finished) window.scrollTo({ top: 0 })
  }, [finished])

  const learnMore = () => {
    const extra = buildReviewQueue(state, deck, Date.now(), 10)
    setQueue(extra)
    setFinished(false)
  }

  /* ---------- fin de séance, ou rien à revoir ---------- */
  if (!card || finished) {
    const ended = finished && done > 0
    const title = finished ? 'Séance terminée' : 'Tout est à jour'
    const sessions = state.activity.filter((a) => a.kind === 'review').slice(-5)
    return (
      <Notebook className="rv rv-done">
        <Page side="left" section="2" label={title}>
          <FileHead>
            <span>Fichier de révision</span>
            <span>Séance du {SHORT.format(now)}</span>
          </FileHead>

          <h1 className="rv-title">
            <em>Révision du jour</em>
            {title}
          </h1>
          {ended ? (
            <>
              <p className="rv-count">
                <b>{done}</b>
                <span>{plural(done, 'carte révisée', 'cartes révisées')}</span>
              </p>
              <p className="rv-lead">
                Dont {good} {plural(good, 'jugée', 'jugées')} « Bien » ou « Facile ». Les cartes difficiles reviendront plus tôt, les autres
                s’espaceront.
              </p>
            </>
          ) : finished && queue.length > 0 ? (
            <p className="rv-lead">Séance interrompue avant la première note : les cartes du jour t’attendent toujours.</p>
          ) : (
            <p className="rv-lead">
              Les cartes reviennent au moment où tu risques de les oublier. Rien à revoir pour l’instant : reviens demain, ou avance un
              peu.
            </p>
          )}
          <div className="rv-next">
            {remainingNew > 0 ? (
              <TapeButton onClick={learnMore}>Apprendre 10 cartes</TapeButton>
            ) : (
              <TapeButton to="/quiz">Faire un quiz</TapeButton>
            )}
            <div className="rv-next-links">
              {remainingNew > 0 && <TypedLink to="/quiz">Faire un quiz</TypedLink>}
              <TypedLink to="/enquete">Lancer une enquête</TypedLink>
            </div>
          </div>
          {remainingNew > 0 && (
            <p className="pencil-note rv-unseen">
              {remainingNew} {plural(remainingNew, 'carte pas encore découverte', 'cartes pas encore découvertes')} dans le fichier
            </p>
          )}
        </Page>

        <Page side="right" section="2" label="Registre des séances">
          <FileHead>
            <span>Registre</span>
            <span>
              <b>{sessions.length}</b> {plural(sessions.length, 'séance récente', 'séances récentes')}
            </span>
          </FileHead>
          {graded.length > 0 && <SessionCard rows={graded} closed notes={state.notes} />}

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
                    <li key={s.t} className={current ? 'is-now' : undefined} style={{ '--r': `${[-2, 1, -1.5, 2, -1][k % 5]}deg` } as Style}>
                      <span className="d">{STAMP_DATE.format(s.t)}</span>
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
  const total = Math.max(startedWith, done + queue.length)
  const left = queue.length - 1
  const note = card.deck === 'coach' ? state.notes.find((n) => `n:${n.id}` === card.id) : undefined
  const isCoach = card.deck === 'coach'
  // une carte « quelle entité ? » ne doit pas donner la réponse dans son en-tête
  const headLeft = isCoach
    ? note?.author
      ? `Note de ${note.author}`
      : deckLabel(card)
    : card.kind === 'reverse' && !revealed
      ? 'Entité inconnue'
      : deckLabel(card)
  const headRight = isCoach ? (ghost?.name ?? '') : KIND_LABEL[card.kind]

  return (
    <Notebook className="rv">
      <Page side="left" section="2" label="La carte">
        <FileHead>
          <span>Fichier de révision</span>
          <span>Séance du {SHORT.format(now)}</span>
        </FileHead>

        <H as="h1" count={`carte ${done + 1} / ${total}`}>
          Révision du jour
        </H>

        <div ref={pileRef} className="rv-pile" style={{ '--left': pileLayers(left) } as Style} aria-live="polite">
          <IndexCard key={card.id} className={`rv-card settle${isCoach ? ' rv-card--coach' : ''}`} head={headLeft} right={headRight} clip={isCoach} rotate={-0.4}>
            <div className="rv-front">
              <h2 className="rv-question">{fr(card.front)}</h2>
              {card.quote && <blockquote className="rv-quote">{fr(card.quote)}</blockquote>}
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
              <div className="rv-back">
                <p className="rv-verso">Au dos</p>
                {isCoach ? (
                  <p className="rv-hand hand">{fr(card.back)}</p>
                ) : card.evidence && card.evidence.length > 0 ? (
                  <p className="rv-evidence">
                    {card.evidence.map((e) => (
                      <Evidence key={e} id={e} forced={ghost?.forcedEvidence === e && card.kind === 'evidence'} />
                    ))}
                  </p>
                ) : (
                  <p className="rv-answer">{fr(card.back)}</p>
                )}
                {card.backList && card.backList.length > 0 && (
                  <ul className={isCoach ? 'rv-list rv-list--hand' : 'rv-list'}>
                    {card.backList.map((b, i) => (
                      <li key={i} className={isCoach ? 'hand' : undefined}>
                        {fr(b)}
                      </li>
                    ))}
                  </ul>
                )}
                {isCoach && note?.author && <p className="rv-sign hand">— {note.author}</p>}
                {ghost && (
                  <p className="rv-more">
                    <TypedLink to={`/codex/${ghost.id}`}>Relire la fiche {ghost.name}</TypedLink>
                  </p>
                )}
              </div>
            )}
          </IndexCard>
        </div>
        <p className="rv-pile-n">
          {left > 0 ? `encore ${left} ${plural(left, 'carte')} dans la pile` : 'dernière carte de la pile'}
        </p>
      </Page>

      <Page side="right" section="2" label="Notation">
        <FileHead>
          <span>Notation</span>
          <span>
            <b>{done}</b> {plural(done, 'carte notée', 'cartes notées')}
          </span>
        </FileHead>

        <section className={`grades rv-grades${revealed ? '' : ' is-idle'}`} role="group" aria-labelledby="h-rv-grade">
          <H id="h-rv-grade" as="h2">
            Comment ça s’est passé ?
          </H>
          <p className="pencil-note rv-hint" aria-hidden>
            {revealed ? (
              <span className="rv-keys">touches 1 à 4</span>
            ) : (
              'retourne d’abord la carte, puis tamponne ta réponse'
            )}
          </p>
          <div className="rv-stamps">
            {GRADES.map(({ g, label, cls, tone, rotate }) => {
              const when = previewInterval(cardState, g, now)
              return (
                <button
                  key={g}
                  type="button"
                  className={`rv-grade ${cls}`}
                  onClick={() => grade(g)}
                  disabled={!revealed}
                  aria-label={`${label} : la carte revient dans ${when}`}
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
          <SessionCard rows={graded} notes={state.notes} />
        </section>

        <div className="rv-foot">
          <span>{total - done > 1 ? `${total - done} cartes à noter` : 'plus qu’une carte'}</span>
          <TypedLink onClick={() => finish(done, good)}>Terminer la séance</TypedLink>
        </div>
      </Page>
    </Notebook>
  )
}
