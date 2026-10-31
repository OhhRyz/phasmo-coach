import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Evidence, Seg } from '../components/ui'
import {
  CheckLine,
  FileHead,
  H,
  JournalBox,
  Notebook,
  Page,
  Polaroid,
  RoughCircle,
  Stamp,
  Tape,
  TapeButton,
  TypedLink,
} from '../components/journal/Journal'
import { crossPath, roughLine, roughRng, tickPath } from '../components/journal/rough'
import { GHOSTS, getGhost, MECHANICS } from '../data'
import { createRng } from '../engine/random'
import { buildQuiz, isCorrect, QUIZ_TOPICS, type Choice, type Question, type QuizTopic } from '../engine/quiz'
import { useMastery } from '../store/hooks'
import { ignoreKey } from '../engine/keys'
import { useStore } from '../store/store'

type Pool = 'all' | 'weak' | 'one'
type Style = CSSProperties & Record<`--${string}`, string | number>

const LETTERS = 'ABCDEFGHIJ'
export const WEAK_COUNT = 6

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const STAMP_DATE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' })

interface Answer {
  q: Question
  selected: string[]
  correct: boolean
}

/** Les chiffres « elzéviriens » de Fell font lire « 0 » comme un « o » : on les compose en Caslon. */
function Digits({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d+)/).map((part, i) =>
        /^\d+$/.test(part) ? (
          <span key={i} className="qz-digits">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  )
}

/** Espaces insécables de la typographie française : « ? » ou « : » ne partent pas seuls à la ligne. */
const fr = (s: string) => s.replace(/ ([?!:;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0')

/** Au-delà, une réponse court sur plusieurs lignes : on entoure sa lettre, ou on la souligne, plutôt que tout le bloc. */
const SHORT_ANSWER = 22

const topicLabel = (id: QuizTopic) => QUIZ_TOPICS.find((t) => t.id === id)?.label ?? ''
const plural = (n: number, one: string, many = one + 's') => (n > 1 ? many : one)

/** Libellé d'une réponse (une preuve est soulignée dans sa couleur). */
function ChoiceText({ c }: { c: Choice }) {
  return c.evidence ? <Evidence id={c.evidence} /> : <>{c.label}</>
}

/** Petite marque de correction au stylo rouge (coche ou trait) dans la grille de la copie. */
function GridMark({ ok, seed }: { ok: boolean; seed: string }) {
  const r = roughRng(seed)
  const d = ok ? tickPath(14, r) : crossPath(14, r)
  return (
    <svg className="draw qz-grid-mark" viewBox="0 0 30 30" aria-hidden>
      <path d={d} pathLength={1} strokeWidth={ok ? 2.4 : 1.9} style={{ '--d': '.05s', '--dur': '.35s' } as Style} />
    </svg>
  )
}

/** Double trait rouge sous la note, comme au bas d'une copie. */
function ScoreRule() {
  const r = roughRng('qz-score-rule')
  return (
    <svg className="draw qz-score-rule" viewBox="0 0 220 18" preserveAspectRatio="none" aria-hidden>
      <path d={roughLine(4, 6, 214, 4, r, 1.6)} pathLength={1} strokeWidth={2.4} style={{ '--d': '.9s', '--dur': '.45s' } as Style} />
      <path d={roughLine(14, 14, 206, 12, r, 1.6)} pathLength={1} strokeWidth={2} style={{ '--d': '1.2s', '--dur': '.4s' } as Style} />
    </svg>
  )
}

/** Mot du correcteur à côté de la note. */
function scoreWord(pct: number): string {
  if (pct >= 90) return 'propre !'
  if (pct >= 70) return 'bien'
  if (pct >= 50) return 'en progrès'
  return 'à reprendre'
}

/** Feuille ronéotypée (encre violette) : sujet, copie, corrigé. */
function Mimeo({
  className = '',
  children,
  rotate = -0.5,
  label,
  ref,
}: {
  className?: string
  children: ReactNode
  rotate?: number
  label?: string
  ref?: Ref<HTMLElement>
}) {
  return (
    <article ref={ref} className={`mimeo ${className}`} style={{ '--r': `${rotate}deg` } as Style} aria-label={label}>
      {children}
    </article>
  )
}

export function Quiz() {
  const [params] = useSearchParams()
  const focusGhost = params.get('ghost')
  const mastery = useMastery()
  const { state, dispatch } = useStore()

  const topicParam = QUIZ_TOPICS.find((t) => t.id === params.get('topic'))?.id
  const [topics, setTopics] = useState<QuizTopic[]>(topicParam ? [topicParam] : ['evidence', 'speed', 'sanity', 'behavior'])
  const [count, setCount] = useState(10)
  const [pool, setPool] = useState<Pool>(focusGhost && getGhost(focusGhost) ? 'one' : params.get('pool') === 'weak' ? 'weak' : 'all')
  const [empty, setEmpty] = useState(false)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [checked, setChecked] = useState(false)
  const nextRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLElement>(null)

  const weak = useMemo(
    () => [...GHOSTS].sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0)).slice(0, WEAK_COUNT),
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
    // aucun contenu pour ces thèmes (ex. pas de test 0 preuve définitif pour cette entité)
    if (!qs.length) {
      setEmpty(true)
      setQuestions(null)
      return
    }
    setEmpty(false)
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
      // Entrée sur un bouton qui a le focus garde son comportement normal, sauf « Question suivante »
      if (ignoreKey(e, (el) => !!el.closest('.choice') && e.key !== 'Enter')) return
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

  // « Question suivante » prend le focus dès la correction (comme un autoFocus)
  useEffect(() => {
    if (checked) nextRef.current?.querySelector<HTMLElement>('.btn-tape')?.focus()
  }, [checked, index])

  // présentation seulement : chaque nouvelle feuille (sujet, question, corrigé) s'ouvre par le haut
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [questions])
  useEffect(() => {
    if (index === 0) return
    const el = sheetRef.current
    if (!el) window.scrollTo({ top: 0 })
    else if (el.getBoundingClientRect().top < 0) {
      const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
    }
  }, [index])

  const quizzes = state.activity.filter((a) => a.kind === 'quiz')
  const student = state.profile.name || 'sans nom'

  /* ---------- configuration ---------- */
  if (!questions) {
    const poolLabel = pool === 'one' && one ? one.name : pool === 'weak' ? `tes ${WEAK_COUNT} points faibles` : `les ${GHOSTS.length} entités`
    const history = quizzes.slice(-5).reverse()
    return (
      <form
        className="qz qz-setup"
        onSubmit={(e) => {
          e.preventDefault()
          start()
        }}
      >
        <Notebook>
          <Page side="left" section="4" label="Préparer le quiz">
            <FileHead>
              <Link to="/entrainement">‹ S’entraîner</Link>
              <span>Quiz</span>
              <span>
                Copie n° <b>{String(quizzes.length + 1).padStart(2, '0')}</b>
              </span>
            </FileHead>

            <header className="qz-entry">
              <h1 className="qz-title">
                <em>Quiz</em>
                Interrogation écrite
              </h1>
              <p className="qz-lead">
                Des questions tirées des fiches, en priorité sur ce que tu maîtrises le moins. Chaque erreur fait revenir la carte
                correspondante en révision.
              </p>
            </header>

            <fieldset className="qz-field">
              <legend className="typed-label">
                <span className="qz-step">1</span> Thèmes
              </legend>
              <div className="qz-topics">
                {QUIZ_TOPICS.map((t) => (
                  <CheckLine
                    key={t.id}
                    seed={`qz-topic-${t.id}`}
                    checked={topics.includes(t.id)}
                    onChange={(v) => setTopics(v ? [...topics, t.id] : topics.filter((x) => x !== t.id))}
                    hint={t.description}
                  >
                    <span className="qz-topic-name">
                      <Digits text={t.label} />
                    </span>
                  </CheckLine>
                ))}
              </div>
            </fieldset>

            <div className="qz-field qz-field--row">
              <div>
                <span className="typed-label">
                  <span className="qz-step">2</span> Nombre de questions
                </span>
                <Seg label="Nombre de questions" value={count} onChange={setCount} options={[5, 10, 20, 30].map((n) => ({ value: n, label: String(n) }))} />
              </div>
              <div>
                <span className="typed-label">
                  <span className="qz-step">3</span> Entités
                </span>
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
            {pool === 'weak' && <p className="pencil-note qz-weak">Points faibles : {weak.map((g) => g.name).join(', ')}.</p>}
          </Page>

          <Page side="right" section="4" label="La copie">
            <FileHead>
              <span>Sujet du jour</span>
              <span>
                <b>{quizzes.length}</b> {plural(quizzes.length, 'copie rendue', 'copies rendues')}
              </span>
            </FileHead>

            <Mimeo className="qz-cover settle" rotate={-0.8} label="Aperçu de la copie">
              {pool === 'one' && one && (
                <div className="qz-cover-photo">
                  <Polaroid ghostId={one.id} caption={one.name} rotate={5} delay={0.3} />
                </div>
              )}
              <p className="qz-sheet-top">
                <span>Épreuve écrite</span>
                <span>Copie n° {String(quizzes.length + 1).padStart(2, '0')}</span>
              </p>
              <h2 className="qz-cover-title">Connaissance des entités</h2>
              <dl className="qz-cover-fields">
                <div>
                  <dt>Nom</dt>
                  <dd>{student}</dd>
                </div>
                <div>
                  <dt>Sujet</dt>
                  <dd>{topics.length ? QUIZ_TOPICS.filter((t) => topics.includes(t.id)).map((t) => t.label).join(', ') : 'aucun thème coché'}</dd>
                </div>
                <div>
                  <dt>Entités</dt>
                  <dd>{poolLabel}</dd>
                </div>
                <div>
                  <dt>Durée</dt>
                  <dd>{count} questions</dd>
                </div>
              </dl>
              <div className="qz-cover-note" aria-hidden>
                <span>Note</span>
                <span className="qz-blank" />
                <span>/ {count}</span>
              </div>
              <p className="qz-cover-rules">Coche la bonne case, ou les bonnes cases quand la question le précise.</p>
            </Mimeo>

            {empty && (
              <p className="qz-empty" role="alert">
                <Stamp small tone="pencil" rotate={-2}>
                  Rien à tirer
                </Stamp>
                <span>
                  Pas de question disponible avec ces réglages (par exemple, cette entité n’a pas de test sans preuve définitif). Ajoute un
                  autre thème.
                </span>
              </p>
            )}
            {!topics.length && <p className="pencil-note qz-need">coche au moins un thème</p>}
            <div className="qz-go">
              <TapeButton type="submit" disabled={!topics.length}>
                Distribuer la copie
              </TapeButton>
            </div>

            {history.length > 0 && (
              <section className="qz-history" aria-labelledby="h-qz-hist">
                <H id="h-qz-hist" as="h2" count={`${quizzes.length} au total`}>
                  Copies rendues
                </H>
                <div className="libcard qz-libcard settle" style={{ '--r': '1.2deg', '--d': '.4s' } as Style}>
                  <Tape />
                  <h3>Relevé de notes</h3>
                  <div className="cols">
                    <span>Date</span>
                    <span>Note</span>
                  </div>
                  <ol>
                    {history.map((a, k) => (
                      <li key={a.t} style={{ '--r': `${[-2, 1, -1, 2, -1.5][k]}deg` } as Style}>
                        <span className="d">{STAMP_DATE.format(a.t)}</span>
                        <span className="res">
                          {a.score}/{a.total}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            )}
          </Page>
        </Notebook>
      </form>
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
    const label = (a: Answer, ids: string[]) =>
      a.q.choices
        .filter((c) => ids.includes(c.id))
        .map((c) => c.label)
        .join(', ')
    return (
      <Notebook className="qz qz-results">
        <Page side="left" section="4" label="Copie corrigée">
          <FileHead>
            <span>Quiz · copie corrigée</span>
            <span>{SHORT.format(Date.now())}</span>
            <span>
              Copie n° <b>{String(Math.max(1, quizzes.length)).padStart(2, '0')}</b>
            </span>
          </FileHead>

          <div className="qz-stick">
          <Mimeo className="qz-graded settle" rotate={-0.6} label="Copie corrigée">
            <p className="qz-sheet-top">
              <span>Épreuve écrite</span>
              <span>Nom : {student}</span>
            </p>
            <div className="qz-score" aria-label={`Note : ${score} sur ${answers.length}`}>
              <span className="qz-score-n hand">
                {score}
                <span className="qz-score-of">/{answers.length}</span>
                <ScoreRule />
              </span>
              <span className="qz-score-word hand">{scoreWord(pct)}</span>
            </div>
            <p className="qz-verdict">
              {pct >= 90
                ? 'Impressionnant, rien à redire.'
                : pct >= 70
                  ? 'Très bon résultat, il reste quelques détails.'
                  : pct >= 50
                    ? 'C’est en bonne voie, on consolide.'
                    : 'On a trouvé ce qu’il faut retravailler, c’est le but.'}
            </p>
            <table className="qz-breakdown">
              <caption className="sr-only">Résultat par thème</caption>
              <tbody>
                {byTopic.map(({ t, total, ok }, k) => (
                  <tr key={t.id}>
                    <th scope="row">{t.label}</th>
                    <td className="qz-bar-cell">
                      <span className="qz-bar" style={{ '--m': ok / total, '--i': k } as Style} aria-hidden />
                    </td>
                    <td className="qz-bar-n">
                      {ok}/{total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Mimeo>

          <div className="qz-end-actions">
            <TapeButton onClick={start}>Nouvelle copie</TapeButton>
            <TypedLink onClick={() => setQuestions(null)}>Changer les réglages</TypedLink>
          </div>
          </div>
        </Page>

        <Page side="right" section="4" label="Corrections">
          <FileHead>
            <span>Corrigé</span>
            <span>
              <b>{mistakes.length}</b> {plural(mistakes.length, 'erreur')} sur {answers.length}
            </span>
          </FileHead>
          <section aria-labelledby="h-qz-fix">
            <H id="h-qz-fix" count={mistakes.length ? `${mistakes.length} ${plural(mistakes.length, 'carte')} en révision` : undefined}>
              À retenir
            </H>
            {mistakes.length === 0 ? (
              <div className="qz-clean">
                <Stamp thunk rotate={-6} delay={0.6}>
                  Sans faute
                </Stamp>
                <p>Aucune erreur sur cette copie. Monte d’un cran : plus de questions, ou les questions expertes.</p>
              </div>
            ) : (
              <ol className="qz-fixes">
                {mistakes.map((a) => {
                  const n = answers.indexOf(a) + 1
                  const mine = label(a, a.selected)
                  const right = label(a, a.q.correct)
                  return (
                    <li key={a.q.id + n} className="qz-fix">
                      <p className="qz-fix-head">
                        <span>Question {n}</span>
                        <span>{topicLabel(a.q.topic)}</span>
                      </p>
                      <p className="qz-fix-q">{fr(a.q.prompt)}</p>
                      {a.q.quote && <blockquote className="qz-quote">{fr(a.q.quote)}</blockquote>}
                      {a.q.evidenceShown && (
                        <p className="qz-evi">
                          {a.q.evidenceShown.map((e) => (
                            <Evidence key={e} id={e} />
                          ))}
                        </p>
                      )}
                      <p className="qz-fix-line">
                        <span className="qz-fix-k">Ta réponse</span>
                        <span className="qz-struck">{mine || 'sans réponse'}</span>
                      </p>
                      <p className="qz-fix-line">
                        <span className="qz-fix-k">Réponse</span>
                        {right.length <= SHORT_ANSWER ? (
                          <span className="qz-right">
                            <RoughCircle seed={`fix-${a.q.id}`} padX={0.05} padY={0.22} delay={0.5}>
                              <Digits text={right} />
                            </RoughCircle>
                          </span>
                        ) : (
                          <span className="qz-right qz-right--long">
                            <Digits text={right} />
                          </span>
                        )}
                      </p>
                      <p className="qz-explain">{fr(a.q.explain)}</p>
                      {a.q.ghostId && (
                        <p className="qz-fix-more">
                          <TypedLink to={`/codex/${a.q.ghostId}`}>Relire la fiche</TypedLink>
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </Page>
      </Notebook>
    )
  }

  /* ---------- question ---------- */
  const ok = checked && isCorrect(q, selected)
  const last = index + 1 >= questions.length
  return (
    <Notebook single className="qz qz-run">
      <Page section="4" label={`Question ${index + 1} sur ${questions.length}`}>
        <FileHead>
          <button type="button" className="link-btn qz-quit" onClick={() => setQuestions(null)}>
            ‹ Quitter la copie
          </button>
          <span>Quiz · {topicLabel(q.topic)}</span>
          <span>
            Question <b>{index + 1}</b> / {questions.length}
          </span>
        </FileHead>

        <Mimeo ref={sheetRef} className="qz-sheet" rotate={-0.35} label={`Question ${index + 1}`}>
          <header className="qz-sheet-head">
            <p className="qz-sheet-top">
              <span>Épreuve écrite</span>
              <span>Nom : {student}</span>
            </p>
            <ol className="qz-grid" aria-hidden>
              {questions.map((qq, i) => {
                const a = answers[i]
                const cls = a ? (a.correct ? 'is-ok' : 'is-ko') : i === index ? 'is-now' : undefined
                return (
                  <li key={qq.id + i} className={cls}>
                    <span>{i + 1}</span>
                    {a && <GridMark ok={a.correct} seed={`grid-${qq.id}-${i}`} />}
                  </li>
                )
              })}
            </ol>
          </header>

          <div className="qz-q">
            <h2 className="qz-prompt">
              <span className="qz-num">{index + 1}.</span>
              {fr(q.prompt)}
            </h2>
            {q.multi && (
              <p className="qz-instr">
                {q.correct.length} réponses à cocher{!checked && ` · ${selected.length} cochée${selected.length > 1 ? 's' : ''}`}
              </p>
            )}
            {q.quote && <blockquote className="qz-quote">{fr(q.quote)}</blockquote>}
            {q.evidenceShown && (
              <p className="qz-evi">
                {q.evidenceShown.map((e) => (
                  <Evidence key={e} id={e} />
                ))}
              </p>
            )}
          </div>

          <div className={`qz-body${checked ? ' is-checked' : ''}`}>
            <ol className={`qz-choices${q.choices.length > 4 ? ' many' : ''}`} key={q.id}>
              {q.choices.map((c, i) => {
                const isSel = selected.includes(c.id)
                const isRight = q.correct.includes(c.id)
                const circleLetter = checked && isRight && c.label.length > SHORT_ANSWER
                const st = checked ? (isRight ? (isSel ? 'right' : 'missed') : isSel ? 'wrong' : 'idle') : isSel ? 'sel' : ''
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`choice qz-choice ${st}`}
                      disabled={checked}
                      aria-pressed={q.multi ? isSel : undefined}
                      aria-keyshortcuts={LETTERS[i].toLowerCase()}
                      onClick={() => {
                        if (q.multi) setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))
                        else check([c.id])
                      }}
                    >
                      <JournalBox state={isSel ? 'yes' : 'empty'} seed={`${q.id}-${c.id}`} delay={0.05 + i * 0.04} />
                      <span className="qz-letter">
                        {circleLetter ? (
                          <RoughCircle seed={`${q.id}-${c.id}-ok`} padX={0.3} padY={0.12} delay={0.25} width={2}>
                            {LETTERS[i]}
                          </RoughCircle>
                        ) : (
                          LETTERS[i]
                        )}
                        .
                      </span>
                      <span className="qz-label">
                        {checked && isRight && !circleLetter ? (
                          <RoughCircle seed={`${q.id}-${c.id}-ok`} padX={0.05} padY={0.2} delay={0.25} width={2}>
                            <ChoiceText c={c} />
                          </RoughCircle>
                        ) : (
                          <ChoiceText c={c} />
                        )}
                      </span>
                      {checked && isRight && <span className="sr-only"> : bonne réponse</span>}
                      {checked && isSel && !isRight && <span className="sr-only"> : ton choix, faux</span>}
                    </button>
                  </li>
                )
              })}
            </ol>

            <aside className="qz-margin" aria-live="polite" aria-label="Correction">
              {checked ? (
                <div className="qz-correction">
                  <Stamp thunk tone={ok ? 'ink' : 'red'} rotate={ok ? -5 : -7} delay={0.1}>
                    {ok ? 'Exact' : 'À revoir'}
                  </Stamp>
                  <p className="qz-explain">{fr(q.explain)}</p>
                  {q.ghostId && (
                    <Link to={`/codex/${q.ghostId}`} className="link" target="_blank" rel="noreferrer">
                      Ouvrir la fiche
                    </Link>
                  )}
                </div>
              ) : (
                <p className="qz-margin-empty">Réservé à la correction</p>
              )}
            </aside>
          </div>

          <div className="qz-actions">
            {!checked && (
              <p className="qz-keys" aria-hidden>
                touches A à {LETTERS[q.choices.length - 1]}
                {q.multi && ', puis Entrée'}
              </p>
            )}
            {q.multi && !checked && (
              <TapeButton disabled={!selected.length} onClick={() => check(selected)}>
                Valider · {selected.length} sur {q.correct.length}
              </TapeButton>
            )}
            {checked && (
              <>
                <p className="qz-keys" aria-hidden>
                  Entrée pour continuer
                </p>
                <div ref={nextRef} className="qz-next">
                  <TapeButton onClick={next}>{last ? 'Voir le résultat' : 'Question suivante'}</TapeButton>
                </div>
              </>
            )}
          </div>
        </Mimeo>
      </Page>
    </Notebook>
  )
}
