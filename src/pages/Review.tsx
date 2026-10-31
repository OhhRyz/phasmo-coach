import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty, EvidencePill, PageHeader, Progress } from '../components/ui'
import { getGhost, MECHANICS } from '../data'
import type { Card } from '../engine/cards'
import { buildReviewQueue, unseenCards } from '../engine/progress'
import { previewInterval, schedule, type Grade } from '../engine/srs'
import { useStore } from '../store/store'

const GRADES: { g: Grade; label: string; cls: string }[] = [
  { g: 1, label: 'À revoir', cls: 'again' },
  { g: 2, label: 'Difficile', cls: 'hard' },
  { g: 3, label: 'Bien', cls: 'good' },
  { g: 4, label: 'Facile', cls: 'easy' },
]

const REQUEUE_WITHIN = 20 * 60_000

function deckLabel(c: Card): string {
  if (c.deck === 'coach') return 'Note du coach'
  if (c.deck === 'mechanics') return MECHANICS.topics.find((t) => t.id === c.topicId)?.title ?? 'Mécaniques'
  return getGhost(c.ghostId ?? '')?.name ?? 'Entité'
}

export function Review() {
  const { state, deck, review, dispatch } = useStore()
  const [queue, setQueue] = useState<Card[]>(() => buildReviewQueue(state, deck, Date.now()))
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  const [good, setGood] = useState(0)
  const [finished, setFinished] = useState(false)
  const [startedWith] = useState(queue.length)

  const card = queue[0]
  const cardState = card ? state.cards[card.id] : undefined
  const now = Date.now()
  const remainingNew = useMemo(() => unseenCards(deck, state.cards, state.settings).length, [deck, state.cards, state.settings])

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
        // la carte revient un peu plus loin dans la séance
        rest.splice(Math.min(rest.length, 3), 0, card)
      }
      setQueue(rest)
      if (rest.length === 0) finish(reviewed, correct)
    },
    [card, revealed, state.cards, review, done, good, queue, finish],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
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

  const learnMore = () => {
    const extra = buildReviewQueue(state, deck, Date.now(), 10)
    setQueue(extra)
    setFinished(false)
  }

  if (!card || finished) {
    return (
      <div className="page narrow">
        <PageHeader eyebrow="Révision espacée" title={finished ? 'Séance terminée' : 'Tout est à jour'} />
        <div className="card card-pad">
          <Empty icon={finished ? 'trophy' : 'sparkles'} title={finished ? `${done} carte${done > 1 ? 's' : ''} révisée${done > 1 ? 's' : ''}` : 'Rien à réviser pour le moment'}>
            {finished && done > 0 && (
              <p>
                {good} réponse{good > 1 ? 's' : ''} sur {done} jugée{done > 1 ? 's' : ''} « Bien » ou « Facile ». Les cartes
                difficiles reviendront plus tôt, les autres s’espaceront.
              </p>
            )}
            {!finished && <p>Les cartes reviennent au moment où tu risques de les oublier. Reviens demain, ou avance un peu :</p>}
            <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
              {remainingNew > 0 && (
                <button type="button" className="btn btn-primary" onClick={learnMore}>
                  <Icon name="plus" size={18} />
                  Apprendre 10 nouvelles cartes
                </button>
              )}
              <Link to="/quiz" className="btn">
                <Icon name="quiz" size={18} />
                Faire un quiz
              </Link>
            </div>
            {remainingNew > 0 && (
              <p className="faint" style={{ fontSize: '0.8rem' }}>
                {remainingNew} carte{remainingNew > 1 ? 's' : ''} pas encore découverte{remainingNew > 1 ? 's' : ''}.
              </p>
            )}
          </Empty>
        </div>
      </div>
    )
  }

  const ghost = card.ghostId ? getGhost(card.ghostId) : undefined
  const total = Math.max(startedWith, done + queue.length)

  return (
    <div className="page narrow">
      <PageHeader eyebrow="Révision espacée" title="Révision du jour">
        Réponds dans ta tête, retourne la carte, puis sois honnête : c’est ce qui règle le rythme de révision.
      </PageHeader>

      <div className="review-progress">
        <Progress value={done / Math.max(1, total)} label="Progression de la séance" />
        <span className="mono faint">
          {done} / {total}
        </span>
      </div>

      <article className={`card flashcard${revealed ? ' revealed' : ''}`} aria-live="polite">
        <div className="flash-meta">
          <span className={`chip${card.deck === 'coach' ? ' chip-lantern' : card.deck === 'mechanics' ? '' : ' chip-accent'}`}>
            <Icon name={card.deck === 'coach' ? 'notebook' : card.deck === 'mechanics' ? 'compass' : 'ghost'} size={13} />
            {deckLabel(card)}
          </span>
          {!cardState && <span className="chip chip-ok">Nouvelle</span>}
          {cardState?.phase === 'relearning' && <span className="chip chip-bad">À consolider</span>}
        </div>

        <h2 className="flash-front">{card.front}</h2>
        {card.quote && (
          <blockquote className="flash-quote">
            <Icon name="quote" size={18} />
            {card.quote}
          </blockquote>
        )}

        {revealed ? (
          <div className="flash-back">
            <div className="divider" />
            {card.evidence && card.evidence.length > 0 && (
              <div className="ev-list" style={{ marginBottom: 4 }}>
                {card.evidence.map((e) => (
                  <EvidencePill key={e} id={e} forced={ghost?.forcedEvidence === e && card.kind === 'evidence'} />
                ))}
              </div>
            )}
            <p className="flash-answer">{card.back}</p>
            {card.backList && card.backList.length > 0 && (
              <ul className="bullets">
                {card.backList.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
            {ghost && (
              <Link to={`/codex/${ghost.id}`} className="flash-link">
                Voir la fiche {ghost.name} <Icon name="arrowRight" size={14} />
              </Link>
            )}
          </div>
        ) : (
          <button type="button" className="btn btn-lg btn-block flash-reveal" onClick={() => setRevealed(true)}>
            <Icon name="eye" size={18} />
            Afficher la réponse <span className="kbd">Espace</span>
          </button>
        )}
      </article>

      {revealed && (
        <div className="grade-row" role="group" aria-label="Évalue ta réponse">
          {GRADES.map(({ g, label, cls }) => (
            <button key={g} type="button" className={`grade-btn ${cls}`} onClick={() => grade(g)}>
              <span>{label}</span>
              <small className="mono">{previewInterval(cardState, g, now)}</small>
              <span className="kbd">{g}</span>
            </button>
          ))}
        </div>
      )}

      <div className="row between review-foot">
        <span className="faint" style={{ fontSize: '0.8rem' }}>
          {queue.length - 1 > 0 ? `Encore ${queue.length - 1} carte${queue.length - 1 > 1 ? 's' : ''}` : 'Dernière carte'}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => finish(done, good)}>
          Terminer la séance
        </button>
      </div>
    </div>
  )
}
