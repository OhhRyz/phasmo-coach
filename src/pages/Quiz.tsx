import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { GhostEvidence, Modal, Seg } from '../components/ui'
import {
  CheckLine,
  Consigne,
  EndActions,
  FileHead,
  H,
  JournalBox,
  Notebook,
  Page,
  PaperButton,
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
import { de, le } from '../engine/cards'
import { buildQuiz, DEFAULT_TOPICS, isCorrect, QUIZ_TOPICS, type Question, type QuizTopic } from '../engine/quiz'
import { NBSP, NNBSP, safeDate } from '../engine/format'
import { WEAK_COUNT, weakestGhosts } from '../engine/progress'
import { useMastery } from '../store/hooks'
import { ignoreKey } from '../engine/keys'
import { useStore } from '../store/store'

type Pool = 'all' | 'weak' | 'one'
type Style = CSSProperties & Record<`--${string}`, string | number>

const LETTERS = 'ABCDEFGHIJ'
// une seule définition pour toute l'app (accueil, quiz, mise en situation)
export { WEAK_COUNT } from '../engine/progress'

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const STAMP_DATE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' })

interface Answer {
  q: Question
  selected: string[]
  correct: boolean
  /** la carte liée, déjà apprise, revient dans la révision du jour */
  requeued: boolean
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

/** Au-delà, une réponse court sur plusieurs lignes : on entoure sa lettre, ou on la souligne, plutôt que tout le bloc. */
const SHORT_ANSWER = 22

const topicLabel = (id: QuizTopic) => QUIZ_TOPICS.find((t) => t.id === id)?.label ?? ''
const plural = (n: number, one: string, many = one + 's') => (n > 1 ? many : one)
const COUNTS = [5, 10, 20, 30]
/** Les abréviations des fiches, en toutes lettres sur la copie (« LdV » → « ligne de vue »). */
const spell = (s: string) => s.replace(/\bLdV\b/g, 'ligne de vue')
/** Paramètres d'adresse qui lancent la copie tout de suite (raccourcis de l'accueil, des fiches, des mécaniques). */
const QUICK_PARAMS = ['ghost', 'pool', 'topic', 'n']

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

/** « Ta réponse » : seules les cases cochées à tort sont barrées au rouge, les bonnes restent intactes. */
function MyAnswer({ a }: { a: Answer }) {
  const chosen = a.q.choices.filter((c) => a.selected.includes(c.id))
  if (!chosen.length) return <span className="qz-struck">sans réponse</span>
  if (!a.q.multi) return <span className="qz-struck">{chosen.map((c) => c.label).join(', ')}</span>
  return (
    <span className="qz-mine">
      {chosen.map((c, i) => {
        const ok = a.q.correct.includes(c.id)
        return (
          <Fragment key={c.id}>
            {i > 0 && ', '}
            <span className={ok ? 'qz-kept' : 'qz-struck'}>{c.label}</span>
            {!ok && <span className="sr-only"> (faux)</span>}
          </Fragment>
        )
      })}
    </span>
  )
}

/** « Réponse » d'une question à plusieurs cases : les réponses oubliées sont entourées (ou soulignées si longues). */
function RightAnswers({ a }: { a: Answer }) {
  const right = a.q.choices.filter((c) => a.q.correct.includes(c.id))
  return (
    <span className="qz-right qz-right--multi">
      {right.map((c, i) => {
        const missed = !a.selected.includes(c.id)
        return (
          <Fragment key={c.id}>
            {i > 0 && ', '}
            {!missed ? (
              <Digits text={c.label} />
            ) : c.label.length <= SHORT_ANSWER ? (
              <RoughCircle className="qz-circled" seed={`fix-${a.q.id}-${c.id}`} padX={0.05} padY={0.22} delay={0.5 + i * 0.15}>
                <Digits text={c.label} />
              </RoughCircle>
            ) : (
              <span className="qz-missed-long">
                <Digits text={c.label} />
              </span>
            )}
            {missed && <span className="sr-only"> (oubliée)</span>}
          </Fragment>
        )
      })}
    </span>
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
  if (pct >= 90) return 'très bien'
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
  const { state, deck, dispatch } = useStore()

  const topicParam = QUIZ_TOPICS.find((t) => t.id === params.get('topic'))?.id
  const [topics, setTopics] = useState<QuizTopic[]>(topicParam ? [topicParam] : DEFAULT_TOPICS)
  const countParam = Number(params.get('n'))
  const [count, setCount] = useState(COUNTS.includes(countParam) ? countParam : 10)
  const [pool, setPool] = useState<Pool>(focusGhost && getGhost(focusGhost) ? 'one' : params.get('pool') === 'weak' ? 'weak' : 'all')
  const [empty, setEmpty] = useState(false)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [checked, setChecked] = useState(false)
  /** fiche express ouverte depuis la correction (sans quitter la copie) */
  const [fiche, setFiche] = useState<string | null>(null)
  const [quitOpen, setQuitOpen] = useState(false)
  const nextRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const autoStarted = useRef(false)

  // les moins maîtrisées parmi les entités déjà travaillées ; sinon, les premières à découvrir
  const { weak, started } = useMemo(() => {
    const ids = GHOSTS.map((g) => g.id)
    const r = weakestGhosts(ids, mastery, deck, state)
    // cas limite : tout ce qui a été travaillé est acquis et rien n'est à découvrir
    const list = r.ids.length ? r.ids : [...ids].sort((a, b) => (mastery[a] ?? 0) - (mastery[b] ?? 0)).slice(0, WEAK_COUNT)
    return { weak: list.map((id) => getGhost(id)!).filter(Boolean), started: r.ids.length ? r.started : true }
  }, [mastery, deck, state])
  const one = focusGhost ? getGhost(focusGhost) : undefined

  const start = (only?: QuizTopic[]) => {
    const ghosts = pool === 'one' && one ? [one] : pool === 'weak' ? weak : GHOSTS
    if (only) setTopics(only)
    const qs = buildQuiz({
      topics: only ?? (topics.length ? topics : DEFAULT_TOPICS),
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
    // la copie s'écrit en toutes lettres : énoncé, réponses et corrigé
    setQuestions(
      qs.map((x) => ({
        ...x,
        prompt: spell(x.prompt),
        quote: x.quote && spell(x.quote),
        note: x.note && spell(x.note),
        explain: spell(x.explain),
        choices: x.choices.map((c) => ({ ...c, label: spell(c.label) })),
      })),
    )
    setIndex(0)
    setAnswers([])
    setSelected([])
    setChecked(false)
    setQuitOpen(false)
  }

  // venu d'un raccourci (« Me tester sur… », « quiz éclair », « Quiz sur ces entités ») : la copie est distribuée tout de suite
  useEffect(() => {
    if (autoStarted.current || !QUICK_PARAMS.some((k) => params.has(k))) return
    autoStarted.current = true
    start()
    // une seule fois, à l'arrivée sur la page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = questions?.[index]

  const check = useCallback(
    (sel: string[]) => {
      if (!q || checked) return
      const ok = isCorrect(q, sel)
      // le magasin ne ramène en révision qu'une carte déjà apprise (phase « review »)
      const requeued = !ok && !!q.cardId && state.cards[q.cardId]?.phase === 'review'
      setSelected(sel)
      setChecked(true)
      setAnswers((a) => [...a, { q, selected: sel, correct: ok, requeued }])
      const results = [{ key: `topic:${q.topic}`, correct: ok }]
      if (q.ghostId) results.push({ key: `ghost:${q.ghostId}`, correct: ok })
      dispatch({ type: 'answers', results, lapseCards: !ok && q.cardId ? [q.cardId] : [], now: Date.now() })
    },
    [q, checked, state.cards, dispatch],
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
      // une fiche est posée sur la copie : les touches sont à elle
      if (fiche || quitOpen) return
      // sur une case qui a le focus, les lettres restent actives ; Entrée y garde son rôle (cocher, ou répondre),
      // sauf sur une question à plusieurs réponses déjà cochées : Entrée valide, comme l'annonce la consigne
      const validates = e.key === 'Enter' && !!q?.multi && !checked && selected.length > 0
      if (ignoreKey(e, (el) => !!el.closest('.choice') && (e.key !== 'Enter' || validates))) return
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
  }, [q, checked, selected, next, check, fiche, quitOpen])

  // « Question suivante » prend le focus dès la correction (comme un autoFocus), et reste à l'écran :
  // sur téléphone, au-dessus de la barre d'onglets (scroll-padding de la page + marge de .qz-next)
  useEffect(() => {
    if (!checked) return
    const wrap = nextRef.current
    wrap?.querySelector<HTMLElement>('.btn-tape')?.focus({ preventScroll: true })
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    wrap?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
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
    const n = weak.length
    const weakLabel = started
      ? n > 1
        ? `les ${n} entités les moins maîtrisées`
        : 'l’entité la moins maîtrisée'
      : `${n} ${plural(n, 'entité')} à découvrir`
    const poolLabel = pool === 'one' && one ? one.name : pool === 'weak' ? weakLabel : `les ${GHOSTS.length} entités`
    const history = quizzes.slice(-5).reverse()
    const startLabel = `Commencer${NNBSP}: ${count} questions${pool === 'one' && one ? ` sur ${le(one.name)}` : ''}`
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
              <Link to="/entrainement">‹ Exercices</Link>
              <span>Quiz</span>
              <span>
                Copie n°{NBSP}<b>{String(quizzes.length + 1).padStart(2, '0')}</b>
              </span>
            </FileHead>

            <header className="qz-entry">
              <h1 className="qz-title">
                <em>Quiz</em>
                Interrogation écrite
              </h1>
              <p className="qz-lead">
                Des questions à choix multiple sur ce qui sert quand les preuves manquent{NNBSP}: comportements, vitesses, seuils de
                chasse, tests. Les questions visent plus souvent les entités que tu maîtrises le moins{NNBSP}; une erreur sur une carte
                déjà apprise la remet dans ta révision du jour.
              </p>
              <div className="qz-quick">
                <TapeButton type="submit" disabled={!topics.length} disabledHint="coche au moins un thème ↓">
                  {startLabel}
                </TapeButton>
                {topics.length > 0 && <p className="pencil-note qz-or">ou règle la copie juste en dessous ↓</p>}
              </div>
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
                <Seg label="Nombre de questions" value={count} onChange={setCount} options={COUNTS.map((n) => ({ value: n, label: String(n) }))} />
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
                    { value: 'weak' as Pool, label: started ? 'Les moins maîtrisées' : 'À découvrir' },
                    ...(one ? [{ value: 'one' as Pool, label: one.name }] : []),
                  ]}
                />
              </div>
            </div>
            {pool === 'weak' && (
              <p className="pencil-note qz-weak">
                {started ? 'Les moins maîtrisées' : 'À découvrir'}
                {NNBSP}: {weak.map((g) => g.name).join(', ')}.
              </p>
            )}
          </Page>

          <Page side="right" section="4" label="La copie">
            <FileHead>
              <span>Sujet du jour</span>
              <span>
                {quizzes.length === 0 ? (
                  'aucune copie rendue'
                ) : (
                  <>
                    <b>{quizzes.length}</b> {plural(quizzes.length, 'copie rendue', 'copies rendues')}
                  </>
                )}
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
                <span>Copie n°{NBSP}{String(quizzes.length + 1).padStart(2, '0')}</span>
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
                  <dt>Questions</dt>
                  <dd>{count}</dd>
                </div>
              </dl>
              <div className="qz-cover-note" aria-hidden>
                <span>Note</span>
                <span className="qz-blank" />
                <span>/ {count}</span>
              </div>
              <p className="qz-cover-rules">Coche la bonne case, ou les bonnes cases quand la question le précise. La correction s’affiche aussitôt.</p>
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
            <div className="qz-go">
              <TapeButton type="submit" disabled={!topics.length} disabledHint="coche au moins un thème dans la liste">
                Commencer le quiz ({count} questions)
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
                      <li key={`${a.t}-${k}`} style={{ '--r': `${[-2, 1, -1, 2, -1.5][k]}deg` } as Style}>
                        <span className="d">{safeDate(STAMP_DATE, a.t)}</span>
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
    // cartes réellement remises dans la révision du jour (déjà apprises), sans doublon
    const requeued = new Set(mistakes.filter((a) => a.requeued).map((a) => a.q.cardId)).size
    // le thème le plus fragile : plus faible taux de réussite, puis le plus d'erreurs
    const weakest = [...byTopic].sort((a, b) => a.ok / a.total - b.ok / b.total || b.total - b.ok - (a.total - a.ok))[0]
    const verdict =
      mistakes.length === 0
        ? 'Aucune erreur.'
        : byTopic.length > 1 && weakest
          ? `Thème le plus fragile${NNBSP}: ${weakest.t.label} (${weakest.ok}/${weakest.total}).`
          : `${mistakes.length} ${plural(mistakes.length, 'erreur')}, ${plural(mistakes.length, 'détaillée', 'détaillées')} dans le corrigé.`
    const label = (a: Answer, ids: string[]) =>
      a.q.choices
        .filter((c) => ids.includes(c.id))
        .map((c) => c.label)
        .join(', ')
    return (
      <Notebook className="qz qz-results">
        <Page side="left" section="4" label="Copie corrigée">
          <h1 className="sr-only">
            Quiz{NNBSP}: copie corrigée, {score} sur {answers.length}
          </h1>
          <FileHead>
            <span>Quiz · copie corrigée</span>
            <span>{SHORT.format(Date.now())}</span>
            <span>
              Copie n°{NBSP}<b>{String(Math.max(1, quizzes.length)).padStart(2, '0')}</b>
            </span>
          </FileHead>

          <div className="qz-stick">
          <Mimeo className="qz-graded settle" rotate={-0.6} label="Copie corrigée">
            <p className="qz-sheet-top">
              <span>Épreuve écrite</span>
              <span>Nom{NNBSP}: {student}</span>
            </p>
            <div className="qz-score" aria-label={`Note${NNBSP}: ${score} sur ${answers.length}`}>
              <span className="qz-score-n hand">
                {score}
                <span className="qz-score-of">/{answers.length}</span>
                <ScoreRule />
              </span>
              <span className="qz-score-word hand">{scoreWord(pct)}</span>
            </div>
            <p className="qz-verdict">{verdict}</p>
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

          <EndActions className="qz-end-actions">
            <TapeButton onClick={() => start()}>Recommencer un quiz</TapeButton>
            {/* venu d'une fiche (« Me tester sur… ») : on y retourne, pas vers des exercices jamais ouverts */}
            {one && <TypedLink to={`/codex/${one.id}`}>Retour à la fiche {de(one.name)}</TypedLink>}
            <TypedLink onClick={() => setQuestions(null)}>Changer les réglages</TypedLink>
            {!one && <TypedLink to="/entrainement">Retour aux exercices</TypedLink>}
            {requeued > 0 ? (
              <TypedLink to="/revision">
                Revoir {requeued > 1 ? `mes ${requeued} erreurs` : 'mon erreur'} dans la révision{NBSP}→
              </TypedLink>
            ) : mistakes.length > 0 && weakest ? (
              <TypedLink onClick={() => start([weakest.t.id])}>Refaire un quiz sur {weakest.t.label.toLowerCase()}{NBSP}→</TypedLink>
            ) : !topics.includes('expert') ? (
              <TypedLink onClick={() => start(['expert'])}>Essayer les questions expertes{NBSP}→</TypedLink>
            ) : null}
          </EndActions>
          </div>
        </Page>

        <Page side="right" section="4" label="Corrections">
          <FileHead>
            <span>Corrigé</span>
            <span>
              {mistakes.length === 0 ? (
                `aucune erreur sur ${answers.length}`
              ) : (
                <>
                  <b>{mistakes.length}</b> {plural(mistakes.length, 'erreur')} sur {answers.length}
                </>
              )}
            </span>
          </FileHead>
          <section aria-labelledby="h-qz-fix">
            <H id="h-qz-fix" count={requeued ? `${requeued} ${plural(requeued, 'carte')} à revoir aujourd’hui` : undefined}>
              À retenir
            </H>
            {mistakes.length === 0 ? (
              <div className="qz-clean">
                <Stamp thunk rotate={-6} delay={0.6}>
                  Sans faute
                </Stamp>
                <p>Aucune erreur sur cette copie. Monte d’un cran{NNBSP}: plus de questions, ou les questions expertes.</p>
              </div>
            ) : (
              <ol className="qz-fixes">
                {mistakes.map((a) => {
                  const n = answers.indexOf(a) + 1
                  const right = label(a, a.q.correct)
                  return (
                    <li key={a.q.id + n} className="qz-fix">
                      <p className="qz-fix-head">
                        <span>Question {n}</span>
                        <span>{topicLabel(a.q.topic)}</span>
                      </p>
                      <p className="qz-fix-q">{a.q.prompt}</p>
                      {a.q.quote && <blockquote className="qz-quote">{a.q.quote}</blockquote>}
                      {a.q.note && <p className="pencil-note">{a.q.note}</p>}
                      <p className="qz-fix-line">
                        <span className="qz-fix-k">Ta réponse</span>
                        <MyAnswer a={a} />
                      </p>
                      <p className="qz-fix-line">
                        <span className="qz-fix-k">Réponse</span>
                        {a.q.multi ? (
                          <RightAnswers a={a} />
                        ) : right.length <= SHORT_ANSWER ? (
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
                      <p className="qz-explain">{a.q.explain}</p>
                      {a.requeued && <p className="pencil-note qz-requeued">carte remise dans la révision du jour</p>}
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
  const ficheGhost = fiche ? getGhost(fiche) : undefined
  const quit = () => {
    setQuitOpen(false)
    setQuestions(null)
  }
  return (
    <>
    <Notebook single className="qz qz-run">
      <Page section="4" label={`Question ${index + 1} sur ${questions.length}`}>
        <h1 className="sr-only">
          Quiz{NNBSP}: question {index + 1} sur {questions.length}
        </h1>
        <FileHead>
          <button type="button" className="link-btn qz-quit" onClick={() => (answers.length ? setQuitOpen(true) : quit())}>
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
              <span>Nom{NNBSP}: {student}</span>
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
              {q.prompt}
            </h2>
            {q.quote && <blockquote className="qz-quote">{q.quote}</blockquote>}
            {q.note && <p className="pencil-note">{q.note}</p>}
          </div>

          <Consigne className="qz-consigne">
            {checked ? (
              <>
                lis la correction <span className="qz-on-desk">dans la marge</span>
                <span className="qz-on-phone">sous les réponses</span>, puis <b>{last ? 'Voir le résultat' : 'Question suivante'}</b>.
              </>
            ) : q.multi ? (
              <>
                coche {q.correct.length} réponses, puis <b>Valider</b>.{' '}
                <span className="qz-count">
                  ({selected.length === 0 ? 'aucune cochée' : `${selected.length} ${plural(selected.length, 'cochée')}`})
                </span>
              </>
            ) : (
              <>coche une seule réponse{NNBSP}: la correction s’affiche aussitôt.</>
            )}
          </Consigne>

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
                            {c.label}
                          </RoughCircle>
                        ) : (
                          c.label
                        )}
                      </span>
                      {checked && isRight && <span className="sr-only">{NNBSP}: bonne réponse</span>}
                      {checked && isSel && !isRight && <span className="sr-only">{NNBSP}: ton choix, faux</span>}
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
                  <p className="qz-explain">{q.explain}</p>
                  {q.ghostId && getGhost(q.ghostId) && (
                    <TypedLink onClick={() => setFiche(q.ghostId!)}>Voir la fiche {de(getGhost(q.ghostId)!.name)}</TypedLink>
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
              <TapeButton
                disabled={selected.length === 0}
                onClick={() => check(selected)}
                disabledHint={`coche ${q.correct.length} réponses pour valider`}
              >
                Valider
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

    <Modal
      open={!!ficheGhost}
      onClose={() => setFiche(null)}
      title={ficheGhost ? `Fiche express · ${ficheGhost.name}` : 'Fiche express'}
      actions={<TapeButton onClick={() => setFiche(null)}>Retour à la copie</TapeButton>}
    >
      {ficheGhost && (
        <div className="qz-fiche">
          <p className="qz-fiche-sum">{ficheGhost.summary}</p>
          <p className="qz-fiche-line">
            <span className="qz-fiche-k">Preuves</span>
            <GhostEvidence ghost={ficheGhost} />
          </p>
          <p className="qz-fiche-line">
            <span className="qz-fiche-k">Vitesse</span>
            <span>{spell(ficheGhost.speed.summary)}</span>
          </p>
          {ficheGhost.keyTells.length > 0 && (
            <>
              <p className="qz-fiche-k">À retenir</p>
              <ol className="qz-fiche-tells">
                {ficheGhost.keyTells.slice(0, 2).map((t, k) => (
                  <li key={k}>{spell(t)}</li>
                ))}
              </ol>
            </>
          )}
          <p className="pencil-note qz-fiche-more">la fiche complète est dans le Codex{NNBSP}: tu pourras la relire après la copie</p>
        </div>
      )}
    </Modal>

    <Modal
      open={quitOpen}
      onClose={() => setQuitOpen(false)}
      title="Quitter la copie ?"
      actions={
        <>
          <TypedLink onClick={() => setQuitOpen(false)}>Continuer la copie</TypedLink>
          <PaperButton onClick={quit}>Quitter</PaperButton>
        </>
      }
    >
      <p className="qz-quit-body">
        Tu as répondu à {answers.length} {plural(answers.length, 'question')} sur {questions.length}. Si tu quittes, la copie ne sera pas
        notée.
      </p>
    </Modal>
    </>
  )
}
