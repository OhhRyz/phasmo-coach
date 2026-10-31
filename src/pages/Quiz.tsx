import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { EvidencePill, PageHeader, Progress, Seg } from '../components/ui'
import { GHOSTS, getGhost, MECHANICS } from '../data'
import { createRng } from '../engine/random'
import { buildQuiz, isCorrect, QUIZ_TOPICS, type Question, type QuizTopic } from '../engine/quiz'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'

type Pool = 'all' | 'weak' | 'one'

interface Answer {
  q: Question
  selected: string[]
  correct: boolean
}

export function Quiz() {
  const [params] = useSearchParams()
  const focusGhost = params.get('ghost')
  const mastery = useMastery()
  const { dispatch } = useStore()

  const topicParam = QUIZ_TOPICS.find((t) => t.id === params.get('topic'))?.id
  const [topics, setTopics] = useState<QuizTopic[]>(topicParam ? [topicParam] : ['evidence', 'speed', 'sanity', 'behavior'])
  const [count, setCount] = useState(10)
  const [pool, setPool] = useState<Pool>(focusGhost && getGhost(focusGhost) ? 'one' : 'all')
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [checked, setChecked] = useState(false)

  const weak = useMemo(
    () => [...GHOSTS].sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0)).slice(0, 8),
    [mastery],
  )
  const one = focusGhost ? getGhost(focusGhost) : undefined

  const start = () => {
    const ghosts = pool === 'one' && one ? [one] : pool === 'weak' ? weak : GHOSTS
    const qs = buildQuiz({
      topics: topics.length ? topics : ['evidence'],
      ghosts,
      allGhosts: GHOSTS,
      mechanics: MECHANICS,
      count,
      rng: createRng(Date.now() & 0xffffffff),
      mastery,
    })
    setQuestions(qs)
    setIndex(0)
    setAnswers([])
    setSelected([])
    setChecked(false)
  }

  const q = questions?.[index]

  const check = useCallback(
    (sel: string[]) => {
      if (!q || checked) return
      const ok = isCorrect(q, sel)
      setSelected(sel)
      setChecked(true)
      setAnswers((a) => [...a, { q, selected: sel, correct: ok }])
      const results = [{ key: `topic:${q.topic}`, correct: ok }]
      if (q.ghostId) results.push({ key: `ghost:${q.ghostId}`, correct: ok })
      dispatch({ type: 'answers', results, lapseCards: !ok && q.cardId ? [q.cardId] : [], now: Date.now() })
    },
    [q, checked, dispatch],
  )

  const next = useCallback(() => {
    if (!questions) return
    if (index + 1 >= questions.length) {
      const score = answers.filter((a) => a.correct).length
      dispatch({
        type: 'activity',
        activity: { t: Date.now(), kind: 'quiz', score, total: questions.length, label: 'Quiz' },
      })
      setIndex(questions.length)
      return
    }
    setIndex(index + 1)
    setSelected([])
    setChecked(false)
  }, [questions, index, answers, dispatch])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q) return
      if (e.key === 'Enter') {
        e.preventDefault()
        if (checked) next()
        else if (q.multi && selected.length) check(selected)
      } else if (!checked && /^[1-9]$/.test(e.key)) {
        const c = q.choices[Number(e.key) - 1]
        if (!c) return
        if (q.multi) setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))
        else check([c.id])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, checked, selected, next, check])

  /* ---------- configuration ---------- */
  if (!questions) {
    return (
      <div className="page narrow">
        <PageHeader eyebrow="S’entraîner" title="Quiz">
          Des questions générées à partir des fiches, centrées sur ce que tu maîtrises le moins. Chaque erreur fait revenir la
          carte correspondante en révision.
        </PageHeader>
        <section className="card card-pad stack">
          <div className="field">
            <span className="field-label">Thèmes</span>
            <div className="topic-grid">
              {QUIZ_TOPICS.map((t) => {
                const on = topics.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`topic-btn${on ? ' on' : ''}`}
                    aria-pressed={on}
                    onClick={() => setTopics(on ? topics.filter((x) => x !== t.id) : [...topics, t.id])}
                  >
                    <span className="topic-check">{on && <Icon name="check" size={14} strokeWidth={2.4} />}</span>
                    <span>
                      <strong>{t.label}</strong>
                      <small>{t.description}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-2">
            <div className="field">
              <span className="field-label">Nombre de questions</span>
              <Seg label="Nombre de questions" value={count} onChange={setCount} options={[5, 10, 20, 30].map((n) => ({ value: n, label: String(n) }))} />
            </div>
            <div className="field">
              <span className="field-label">Entités</span>
              <Seg
                label="Entités"
                value={pool}
                onChange={setPool}
                options={[
                  { value: 'all' as Pool, label: 'Toutes' },
                  { value: 'weak' as Pool, label: 'Points faibles' },
                  ...(one ? [{ value: 'one' as Pool, label: one.name }] : []),
                ]}
              />
            </div>
          </div>
          {pool === 'weak' && (
            <p className="faint" style={{ fontSize: '0.82rem' }}>
              Points faibles : {weak.map((g) => g.name).join(', ')}.
            </p>
          )}
          <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={!topics.length}>
            <Icon name="play" size={16} />
            Lancer le quiz
          </button>
        </section>
      </div>
    )
  }

  /* ---------- résultats ---------- */
  if (!q) {
    const score = answers.filter((a) => a.correct).length
    const pct = Math.round((score / Math.max(1, answers.length)) * 100)
    const byTopic = QUIZ_TOPICS.map((t) => {
      const list = answers.filter((a) => a.q.topic === t.id)
      return { t, total: list.length, ok: list.filter((a) => a.correct).length }
    }).filter((x) => x.total > 0)
    const mistakes = answers.filter((a) => !a.correct)
    return (
      <div className="page narrow">
        <PageHeader eyebrow="Quiz terminé" title={`${score} / ${answers.length}`}>
          {pct >= 90 ? 'Impressionnant, rien à redire.' : pct >= 70 ? 'Très bon résultat, encore quelques détails.' : pct >= 50 ? 'C’est en bonne voie, on consolide.' : 'On a trouvé ce qu’il faut retravailler : c’est le but.'}
        </PageHeader>
        <section className="card card-pad stack">
          {byTopic.map(({ t, total, ok }) => (
            <div key={t.id} className="topic-score">
              <span>{t.label}</span>
              <Progress value={ok / total} label={t.label} />
              <span className="mono">
                {ok}/{total}
              </span>
            </div>
          ))}
        </section>
        {mistakes.length > 0 && (
          <section className="stack" style={{ marginTop: 22 }}>
            <h2>À retenir ({mistakes.length})</h2>
            {mistakes.map((a, i) => (
              <article key={i} className="card card-pad mistake">
                <p className="mistake-q">{a.q.prompt}</p>
                {a.q.quote && <blockquote className="flash-quote small">{a.q.quote}</blockquote>}
                {a.q.evidenceShown && (
                  <div className="ev-list">
                    {a.q.evidenceShown.map((e) => (
                      <EvidencePill key={e} id={e} />
                    ))}
                  </div>
                )}
                <p>
                  <span className="chip chip-ok tiny">Réponse</span>{' '}
                  {a.q.choices
                    .filter((c) => a.q.correct.includes(c.id))
                    .map((c) => c.label)
                    .join(', ')}
                </p>
                <p className="muted">{a.q.explain}</p>
                {a.q.ghostId && (
                  <Link to={`/codex/${a.q.ghostId}`} className="flash-link">
                    Revoir la fiche <Icon name="arrowRight" size={14} />
                  </Link>
                )}
              </article>
            ))}
          </section>
        )}
        <div className="row" style={{ marginTop: 22 }}>
          <button type="button" className="btn btn-primary" onClick={start}>
            <Icon name="refresh" size={18} />
            Nouveau quiz
          </button>
          <button type="button" className="btn" onClick={() => setQuestions(null)}>
            Changer les réglages
          </button>
        </div>
      </div>
    )
  }

  /* ---------- question ---------- */
  const ok = checked && isCorrect(q, selected)
  return (
    <div className="page narrow">
      <div className="review-progress">
        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setQuestions(null)} aria-label="Quitter le quiz">
          <Icon name="x" size={18} />
        </button>
        <Progress value={index / questions.length} label="Progression du quiz" />
        <span className="mono faint">
          {index + 1} / {questions.length}
        </span>
      </div>

      <article className="card card-pad quiz-card">
        <div className="flash-meta">
          <span className="chip chip-accent">{QUIZ_TOPICS.find((t) => t.id === q.topic)?.label}</span>
          {q.multi && <span className="chip">Plusieurs réponses · {q.correct.length} à trouver</span>}
        </div>
        <h2 className="flash-front">{q.prompt}</h2>
        {q.quote && (
          <blockquote className="flash-quote">
            <Icon name="quote" size={18} />
            {q.quote}
          </blockquote>
        )}
        {q.evidenceShown && (
          <div className="ev-list">
            {q.evidenceShown.map((e) => (
              <EvidencePill key={e} id={e} />
            ))}
          </div>
        )}

        <div className={`choices${q.choices.length > 4 ? ' many' : ''}`}>
          {q.choices.map((c, i) => {
            const isSel = selected.includes(c.id)
            const isRight = q.correct.includes(c.id)
            const state = checked ? (isRight ? 'right' : isSel ? 'wrong' : 'idle') : isSel ? 'sel' : ''
            return (
              <button
                key={c.id}
                type="button"
                className={`choice ${state}`}
                disabled={checked}
                onClick={() => {
                  if (q.multi) setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))
                  else check([c.id])
                }}
              >
                <span className="choice-key">{i + 1}</span>
                {c.evidence && <Icon name={c.evidence} size={18} />}
                <span className="choice-label">{c.label}</span>
                {checked && isRight && <Icon name="check" size={18} className="choice-mark" />}
                {checked && isSel && !isRight && <Icon name="x" size={18} className="choice-mark" />}
              </button>
            )
          })}
        </div>

        {q.multi && !checked && (
          <button type="button" className="btn btn-primary btn-block" disabled={!selected.length} onClick={() => check(selected)}>
            Valider ({selected.length}/{q.correct.length}) <span className="kbd">Entrée</span>
          </button>
        )}

        {checked && (
          <div className={`feedback ${ok ? 'ok' : 'ko'}`}>
            <div className="row">
              <Icon name={ok ? 'check' : 'x'} size={20} />
              <strong>{ok ? 'Exact !' : 'Pas tout à fait.'}</strong>
            </div>
            <p>{q.explain}</p>
            <div className="row between">
              {q.ghostId ? (
                <Link to={`/codex/${q.ghostId}`} className="flash-link" target="_blank" rel="noreferrer">
                  Ouvrir la fiche <Icon name="arrowRight" size={14} />
                </Link>
              ) : (
                <span />
              )}
              <button type="button" className="btn btn-primary" onClick={next} autoFocus>
                {index + 1 >= questions.length ? 'Voir le résultat' : 'Question suivante'} <span className="kbd">Entrée</span>
              </button>
            </div>
          </div>
        )}
      </article>
    </div>
  )
}
