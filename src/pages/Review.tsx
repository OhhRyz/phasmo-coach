import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Evidence, PageHead, ProgressBar } from '../components/ui'
import { getGhost, MECHANICS } from '../data'
import type { Card } from '../engine/cards'
import { buildReviewQueue, unseenCards } from '../engine/progress'
import { previewInterval, schedule, type Grade } from '../engine/srs'
import { ignoreKey } from '../engine/keys'
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

  const learnMore = () => {
    const extra = buildReviewQueue(state, deck, Date.now(), 10)
    setQueue(extra)
    setFinished(false)
  }

  if (!card || finished) {
    return (
      <div className="page narrow">
        <PageHead title={finished ? 'Séance terminée' : 'Tout est à jour'}>
          {finished && done > 0
            ? `${done} carte${done > 1 ? 's' : ''} révisée${done > 1 ? 's' : ''}, dont ${good} jugée${good > 1 ? 's' : ''} « Bien » ou « Facile ». Les cartes difficiles reviendront plus tôt, les autres s’espaceront.`
            : 'Les cartes reviennent au moment où tu risques de les oublier. Rien à revoir pour l’instant : reviens demain, ou avance un peu.'}
        </PageHead>
        <div className="row">
          {remainingNew > 0 && (
            <button type="button" className="btn btn-primary" onClick={learnMore}>
              Apprendre 10 nouvelles cartes
            </button>
          )}
          <Link to="/quiz" className="btn">
            Faire un quiz
          </Link>
          <Link to="/enquete" className="btn">
            Lancer une enquête
          </Link>
        </div>
        {remainingNew > 0 && (
          <p className="faint small" style={{ marginTop: 14 }}>
            {remainingNew} carte{remainingNew > 1 ? 's' : ''} pas encore découverte{remainingNew > 1 ? 's' : ''}.
          </p>
        )}
      </div>
    )
  }

  const ghost = card.ghostId ? getGhost(card.ghostId) : undefined
  const total = Math.max(startedWith, done + queue.length)

  return (
    <div className="page narrow">
      <div className="session-bar">
        <span className="faint small">Révision du jour</span>
        <ProgressBar value={done / Math.max(1, total)} label="Progression de la séance" />
        <span className="pct">
          {done} / {total}
        </span>
      </div>

      <article className="flashcard" aria-live="polite">
        <p className="flash-meta">
          {deckLabel(card)}
          {!cardState && ' · nouvelle carte'}
          {cardState?.phase === 'relearning' && ' · à consolider'}
        </p>

        <h2 className="flash-front">{card.front}</h2>
        {card.quote && <blockquote className="quote">{card.quote}</blockquote>}

        {revealed ? (
          <div className="flash-back">
            {card.evidence && card.evidence.length > 0 && (
              <p className="evi-list">
                {card.evidence.map((e) => (
                  <Evidence key={e} id={e} forced={ghost?.forcedEvidence === e && card.kind === 'evidence'} />
                ))}
              </p>
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
              <p className="small">
                <Link to={`/codex/${ghost.id}`}>Relire la fiche {ghost.name}</Link>
              </p>
            )}
          </div>
        ) : (
          <button type="button" className="btn btn-lg btn-block flash-reveal" onClick={() => setRevealed(true)}>
            Afficher la réponse <span className="kbd">Espace</span>
          </button>
        )}
      </article>

      {revealed && (
        <div className="grades" role="group" aria-label="Comment ça s’est passé ?">
          {GRADES.map(({ g, label, cls }) => (
            <button key={g} type="button" className={`grade ${cls}`} onClick={() => grade(g)}>
              <span>{label}</span>
              <small>revient dans {previewInterval(cardState, g, now)}</small>
            </button>
          ))}
        </div>
      )}

      <div className="row between session-foot">
        <span className="faint small">
          {queue.length - 1 > 0 ? `Encore ${queue.length - 1} carte${queue.length - 1 > 1 ? 's' : ''}` : 'Dernière carte'}
          {revealed && <span className="kbd-hint"> · touches 1 à 4</span>}
        </span>
        <button type="button" className="link-btn muted-link small" onClick={() => finish(done, good)}>
          Terminer la séance
        </button>
      </div>
    </div>
  )
}
