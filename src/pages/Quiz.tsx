import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Evidence, PageHead, ProgressBar, Seg } from '../components/ui'
import { GHOSTS, getGhost, MECHANICS } from '../data'
import { createRng } from '../engine/random'
import { buildQuiz, isCorrect, QUIZ_TOPICS, type Question, type QuizTopic } from '../engine/quiz'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'

type Pool = 'all' | 'weak' | 'one'

const LETTERS = 'ABCDEFGHIJ'

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
      } else if (!checked && /^[1-9a-j]$/i.test(e.key)) {
        const k = /\d/.test(e.key) ? Number(e.key) - 1 : e.key.toLowerCase().charCodeAt(0) - 97
        const c = q.choices[k]
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
        <PageHead title="Quiz">
          Des questions tirées des fiches, en priorité sur ce que tu maîtrises le moins. Chaque erreur fait revenir la carte
          correspondante en révision.
        </PageHead>
        <form
          className="stack"
          style={{ '--gap': '26px' } as React.CSSProperties}
          onSubmit={(e) => {
            e.preventDefault()
            start()
          }}
        >
          <fieldset className="fieldset">
            <legend className="field-label">Thèmes</legend>
            <div className="topic-list">
              {QUIZ_TOPICS.map((t) => (
                <label key={t.id} className="check">
                  <input
                    type="checkbox"
                    checked={topics.includes(t.id)}
                    onChange={(e) => setTopics(e.target.checked ? [...topics, t.id] : topics.filter((x) => x !== t.id))}
                  />
                  <span>
                    {t.label}
                    <span className="faint small" style={{ display: 'block' }}>
                      {t.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid-2">
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
          {pool === 'weak' && <p className="faint small">Points faibles : {weak.map((g) => g.name).join(', ')}.</p>}
          <div>
            <button type="submit" className="btn btn-primary btn-lg" disabled={!topics.length}>
              Lancer le quiz
            </button>
          </div>
        </form>
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
        <PageHead title={`${score} sur ${answers.length}`}>
          {pct >= 90
            ? 'Impressionnant, rien à redire.'
            : pct >= 70
              ? 'Très bon résultat, il reste quelques détails.'
              : pct >= 50
                ? 'C’est en bonne voie, on consolide.'
                : 'On a trouvé ce qu’il faut retravailler, c’est le but.'}
        </PageHead>
        <table className="score-table">
          <tbody>
            {byTopic.map(({ t, total, ok }) => (
              <tr key={t.id}>
                <th scope="row">{t.label}</th>
                <td>
                  <ProgressBar value={ok / total} label={t.label} />
                </td>
                <td className="pct">
                  {ok}/{total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {mistakes.length > 0 && (
          <section className="section">
            <h2>À retenir</h2>
            <ul className="list">
              {mistakes.map((a, i) => (
                <li key={i} className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
                  <p>
                    <strong>{a.q.prompt}</strong>
                  </p>
                  {a.q.quote && <blockquote className="quote small">{a.q.quote}</blockquote>}
                  {a.q.evidenceShown && (
                    <p className="evi-list">
                      {a.q.evidenceShown.map((e) => (
                        <Evidence key={e} id={e} />
                      ))}
                    </p>
                  )}
                  <p>
                    Réponse :{' '}
                    {a.q.choices
                      .filter((c) => a.q.correct.includes(c.id))
                      .map((c) => c.label)
                      .join(', ')}
                  </p>
                  <p className="muted small">{a.q.explain}</p>
                  {a.q.ghostId && (
                    <p className="small">
                      <Link to={`/codex/${a.q.ghostId}`}>Relire la fiche</Link>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="row" style={{ marginTop: 28 }}>
          <button type="button" className="btn btn-primary" onClick={start}>
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
      <div className="session-bar">
        <button type="button" className="link-btn muted-link small" onClick={() => setQuestions(null)}>
          Quitter
        </button>
        <ProgressBar value={index / questions.length} label="Progression du quiz" />
        <span className="pct">
          {index + 1} / {questions.length}
        </span>
      </div>

      <article className="flashcard">
        <p className="flash-meta">
          {QUIZ_TOPICS.find((t) => t.id === q.topic)?.label}
          {q.multi && ` · ${q.correct.length} réponses à trouver`}
        </p>
        <h2 className="flash-front">{q.prompt}</h2>
        {q.quote && <blockquote className="quote">{q.quote}</blockquote>}
        {q.evidenceShown && (
          <p className="evi-list">
            {q.evidenceShown.map((e) => (
              <Evidence key={e} id={e} />
            ))}
          </p>
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
                aria-pressed={q.multi ? isSel : undefined}
                onClick={() => {
                  if (q.multi) setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))
                  else check([c.id])
                }}
              >
                <span className="choice-key">{LETTERS[i]}</span>
                <span className="choice-label">{c.evidence ? <Evidence id={c.evidence} /> : c.label}</span>
                {checked && isRight && <span className="choice-mark">bonne réponse</span>}
                {checked && isSel && !isRight && <span className="choice-mark">ton choix</span>}
              </button>
            )
          })}
        </div>

        {q.multi && !checked && (
          <button type="button" className="btn btn-primary btn-block" disabled={!selected.length} onClick={() => check(selected)}>
            Valider ({selected.length} sur {q.correct.length}) <span className="kbd">Entrée</span>
          </button>
        )}

        {checked && (
          <div className={`feedback ${ok ? 'ok' : 'ko'}`}>
            <p className="feedback-title">{ok ? 'Exact.' : 'Pas tout à fait.'}</p>
            <p>{q.explain}</p>
            <div className="row between">
              {q.ghostId ? (
                <Link to={`/codex/${q.ghostId}`} className="small" target="_blank" rel="noreferrer">
                  Ouvrir la fiche
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
