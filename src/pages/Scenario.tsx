import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EvidenceTracker, TrackerHow } from '../components/EvidenceTracker'
import { UvPrint } from '../components/journal/Charts'
import {
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
  Sticky,
  Tape,
  TapeButton,
  TypedLink,
} from '../components/journal/Journal'
import { GhostEvidence, Modal, Seg } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import { EVIDENCE } from '../data/evidence'
import type { EvidenceId, Ghost, ObservationStrength } from '../data/types'
import { createFootsteps, type Footsteps } from '../engine/audio'
import { de, le } from '../engine/cards'
import { EMPTY_FILTER, filterGhosts, possibleEvidence, type EvidenceMark, type FilterState } from '../engine/filter'
import { NBSP, NNBSP, fr, num, safeDate } from '../engine/format'
import { coachNameOf, coachNotes } from '../engine/notes'
import { WEAK_COUNT, weakestGhosts } from '../engine/progress'
import { createRng, weightedPick } from '../engine/random'
import {
  candidatesAfterEachClue,
  DIFFICULTIES,
  generateScenario,
  scoreScenario,
  WRONG_GUESS_PENALTY,
  type Clue,
  type Difficulty,
  type Scenario as S,
} from '../engine/scenario'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'
import { NoteText } from './Notebook'

type Style = CSSProperties & Record<`--${string}`, string | number>

const MAX_WRONG = 1

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const pad = (n: number) => String(n).padStart(2, '0')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** « 2 rapports », « 1 rapport » ; zéro s'écrit en toutes lettres (« aucune preuve »). */
const plural = (n: number, word: string, zero?: string) => (n === 0 && zero ? zero : `${n} ${word}${n > 1 ? 's' : ''}`)
const pts = (n: number) => `${n}${NBSP}pts`
/** Le libellé enregistré dans l'historique (les anciens contrats s'appelaient « Enquête : … »). */
const LABEL_PREFIX = /^(Enquête|Mise en situation)\s*:\s*/
/** Du plus guidé au plus exigeant : Professionnel (conseillé pour débuter), Cauchemar, Démence, 0 preuve. */
const DIFFICULTY_ORDER = [...DIFFICULTIES].sort((a, b) => b.count - a.count)
/** Tant que le joueur n'a pas fini ces contrats, on lui propose Professionnel ; ensuite, la dernière difficulté jouée. */
const BEGINNER_CONTRACTS = 3
const DIFFICULTY_KEY = 'phasmo-coach/difficulte'
/** Au-delà, il est temps de trancher : « Désigner l'entité » redevient l'action principale. */
const FEW_LEFT = 3

function lastDifficulty(): Difficulty | null {
  try {
    const v = localStorage.getItem(DIFFICULTY_KEY)
    return DIFFICULTIES.some((d) => d.id === v) ? (v as Difficulty) : null
  } catch {
    return null
  }
}
function rememberDifficulty(d: Difficulty) {
  try {
    localStorage.setItem(DIFFICULTY_KEY, d)
  } catch {
    /* navigation privée : on reproposera Professionnel */
  }
}

/** Les abréviations des fiches, en toutes lettres dans les rapports. */
const spell = (s: string) => s.replace(/\bLdV\b/g, 'ligne de vue')

/** Ce qu'un rapport de preuve demande de noter dans le carnet : cochée (trouvée) ou barrée (non trouvée). */
function expectedMark(c: Clue): EvidenceMark | null {
  if (!c.evidence) return null
  if (c.kind === 'evidence') return 'found'
  if (c.kind === 'no-evidence') return 'excluded'
  return null
}

/** Téléphone : le carnet de preuves est un volet replié au-dessus des onglets. */
const isPhone = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 759px)').matches

export function Scenario() {
  const mastery = useMastery()
  const { state, deck, dispatch } = useStore()
  // Professionnel pour les premiers contrats ; ensuite, la dernière difficulté jouée
  const [chosen, setDifficulty] = useState<Difficulty>(() =>
    state.activity.filter((a) => a.kind === 'scenario').length >= BEGINNER_CONTRACTS ? (lastDifficulty() ?? 'pro') : 'pro',
  )
  const [pool, setPool] = useState<'all' | 'weak'>('all')
  const [scenario, setScenario] = useState<S | null>(null)
  const [revealed, setRevealed] = useState(1)
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER)
  const [struck, setStruck] = useState<string[]>([])
  const [wrong, setWrong] = useState<string[]>([])
  const [outcome, setOutcome] = useState<'solved' | 'dead' | null>(null)
  const [guessOpen, setGuessOpen] = useState(false)
  const [guess, setGuess] = useState<string>('')
  /** la fiche « Quelle est l'entité ? » propose toutes les entités, et non plus seulement celles du carnet */
  const [guessAll, setGuessAll] = useState(false)
  const [quitOpen, setQuitOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  /** téléphone : le carnet de preuves se replie en volet au-dessus des onglets */
  const [sheetOpen, setSheetOpen] = useState(false)
  /** le volet s'est ouvert de lui-même une fois dans ce contrat (première preuve d'un rapport) */
  const autoOpened = useRef(false)
  const steps = useRef<Footsteps | null>(null)
  const nextArea = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    steps.current = createFootsteps(() => setPlaying(false))
    return () => steps.current?.stop()
  }, [])

  // après « Rapport suivant », le nouveau rapport et les actions restent à l'écran
  useEffect(() => {
    if (revealed > 2) nextArea.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [revealed])

  // nouveau contrat, abandon ou verdict : on referme le volet et on remonte en haut du carnet
  useEffect(() => {
    setSheetOpen(false)
    window.scrollTo({ top: 0 })
  }, [scenario, outcome])
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheetOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  const ghost: Ghost | undefined = scenario ? getGhost(scenario.ghostId) : undefined
  /** les entités les moins maîtrisées (seulement parmi celles déjà travaillées) */
  const weak = useMemo(() => weakestGhosts(GHOSTS.map((g) => g.id), mastery, deck, state, WEAK_COUNT), [mastery, deck, state])

  const start = (difficulty: Difficulty = chosen) => {
    const rng = createRng((Date.now() ^ 0x5bd1e995) >>> 0)
    const candidates = pool === 'weak' && weak.started ? GHOSTS.filter((g) => weak.ids.includes(g.id)) : GHOSTS
    // en 0 preuve, il faut au moins deux indices forts utilisables sans preuve pour que l'enquête soit jouable
    const playable =
      difficulty === 'apocalypse'
        ? candidates.filter((g) => g.observations.filter((o) => !o.requires && o.strength !== 'hint').length >= 2)
        : candidates
    const g = weightedPick(rng, playable.length ? playable : candidates, (x) => 1.25 - (mastery[x.id] ?? 0))
    const s = generateScenario(g, difficulty, rng, GHOSTS)
    steps.current?.stop()
    rememberDifficulty(difficulty)
    autoOpened.current = false
    setScenario(s)
    setRevealed(2)
    setFilter({ ...EMPTY_FILTER, evidenceCount: s.evidenceCount })
    setStruck([])
    setWrong([])
    setOutcome(null)
    setGuess('')
    setQuitOpen(false)
  }

  const possibleGhosts = useMemo(() => filterGhosts(GHOSTS, filter), [filter])
  const candidates = useMemo(() => possibleGhosts.filter((g) => !struck.includes(g.id)), [possibleGhosts, struck])
  // même règle que le codex : une fois les preuves du contrat trouvées, les autres sont grisées
  const possible = useMemo(() => possibleEvidence(possibleGhosts, filter), [possibleGhosts, filter])
  const pastContracts = useMemo(() => state.activity.filter((a) => a.kind === 'scenario'), [state.activity])

  /** les preuves des rapports déjà lus qui ne sont pas (encore) notées comme le rapport le dit */
  const pending = useMemo(() => {
    if (!scenario) return []
    const out: { id: EvidenceId; mark: EvidenceMark }[] = []
    for (const c of scenario.clues.slice(0, revealed)) {
      const m = expectedMark(c)
      if (m && c.evidence && filter.evidence[c.evidence] !== m && !out.some((p) => p.id === c.evidence)) out.push({ id: c.evidence, mark: m })
    }
    return out
  }, [scenario, revealed, filter.evidence])

  /** cochées « trouvée » dans le carnet alors qu'aucun rapport lu ne les a signalées (le piège d'une case touchée par erreur) */
  const unsupported = useMemo(() => {
    if (!scenario) return []
    const seen = new Set(scenario.clues.slice(0, revealed).filter((c) => c.kind === 'evidence').map((c) => c.evidence))
    return (Object.entries(filter.evidence) as [EvidenceId, EvidenceMark][]).filter(([id, m]) => m === 'found' && !seen.has(id)).map(([id]) => id)
  }, [scenario, revealed, filter.evidence])

  const report = (id: EvidenceId, mark: EvidenceMark) => setFilter((f) => ({ ...f, evidence: { ...f.evidence, [id]: mark } }))

  // téléphone : la première fois qu'un rapport apporte une preuve, le carnet s'ouvre pour montrer où la noter,
  // une fois la ligne de preuve lue à l'écran (et pas avant : le volet cacherait le rapport)
  const firstPending = pending[0]?.id
  useEffect(() => {
    if (!scenario || outcome || autoOpened.current || !firstPending || !isPhone()) return
    const clue = scenario.clues.slice(0, revealed).find((c) => c.evidence === firstPending)
    const line = clue && document.querySelector(`[data-clue="${clue.id}"]`)
    if (!line || typeof IntersectionObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | undefined
    const io = new IntersectionObserver(
      ([e]) => {
        clearTimeout(timer)
        if (e.isIntersecting)
          timer = setTimeout(() => {
            autoOpened.current = true
            setSheetOpen(true)
          }, 1600)
      },
      { threshold: 1, rootMargin: '0px 0px -140px 0px' },
    )
    io.observe(line)
    return () => {
      clearTimeout(timer)
      io.disconnect()
    }
  }, [scenario, outcome, revealed, firstPending])

  const finish = (result: 'solved' | 'dead', wrongCount: number) => {
    if (!scenario || !ghost) return
    setOutcome(result)
    steps.current?.stop()
    const score = scoreScenario(revealed, scenario.clues.length, wrongCount, result === 'solved')
    dispatch({
      type: 'answers',
      results: [
        { key: `ghost:${ghost.id}`, correct: result === 'solved' && wrongCount === 0 },
        { key: 'topic:scenario', correct: result === 'solved' },
      ],
      now: Date.now(),
    })
    dispatch({
      type: 'activity',
      activity: { t: Date.now(), kind: 'scenario', score, total: 1000, label: `Mise en situation : ${ghost.name}`, ghostId: ghost.id },
    })
  }

  const openGuess = () => {
    setGuess('')
    setGuessAll(false)
    setSheetOpen(false)
    setGuessOpen(true)
  }

  const submitGuess = () => {
    // seulement un nom entouré dans la liste affichée (guessList, plus bas)
    if (!scenario || !guess || !guessList.some((g) => g.id === guess)) return
    setGuessOpen(false)
    if (guess === scenario.ghostId) {
      finish('solved', wrong.length)
    } else {
      const w = [...wrong, guess]
      setWrong(w)
      setStruck((s) => (s.includes(guess) ? s : [...s, guess]))
      if (w.length > MAX_WRONG) finish('dead', w.length)
    }
    setGuess('')
  }

  /** les rapports de chasse : indices de seuil et de vitesse, et observations « chasse » de l'entité */
  const isHunt = (c: Clue) => c.kind === 'hunt-sanity' || c.kind === 'hunt-speed' || !!c.hunt

  /* ---------- configuration : l'ordre de mission ---------- */
  if (!scenario || !ghost) {
    const recent = pastContracts.slice(-6).reverse()
    const allLabel = `Au hasard parmi les ${GHOSTS.length}`
    return (
      <Notebook className="sc sc--setup">
        <Page side="left" section="4" label="Mise en situation : ordre de mission">
          <FileHead>
            <Link to="/entrainement">‹ Exercices</Link>
            <span>Mise en situation</span>
            <span>
              Contrat n° <b>{pad(pastContracts.length + 1)}</b>
            </span>
          </FileHead>

          <header className="sc-entry">
            <h1 className="sc-title">
              <em>Mise en situation</em>
              Ordre de mission
            </h1>
            <Stamp thunk rotate={-7} delay={0.35}>
              Confidentiel
            </Stamp>
            <p className="sc-lead">
              Un contrat simulé, raconté rapport par rapport comme en partie. Note les preuves dans ton carnet, écarte des entités, et
              désigne la bonne au plus vite.
            </p>
          </header>

          <fieldset className="sc-field">
            <legend className="typed-label">
              <span className="sc-step">1</span>
              <span>
                Difficulté du contrat <span className="sc-legend-sub">· un seul choix</span>
              </span>
            </legend>
            <div className="sc-diff-grid">
              <div className="sc-diffs">
                {DIFFICULTY_ORDER.map((d) => (
                  <RadioLine
                    key={d.id}
                    name="difficulty"
                    checked={chosen === d.id}
                    onChange={() => setDifficulty(d.id)}
                    seed={`sc-diff-${d.id}`}
                    hint={d.description}
                    tag={
                      d.id === 'pro' ? (
                        <Stamp tone="violet" small rotate={-3} delay={0.5} className="sc-advice">
                          conseillé pour débuter
                        </Stamp>
                      ) : d.id === 'apocalypse' ? (
                        <span className="pencil-note sc-expert">pour joueurs confirmés</span>
                      ) : undefined
                    }
                  >
                    {d.label}
                  </RadioLine>
                ))}
              </div>
              <p className="pencil-note sc-warn">
                <svg className="draw sc-brace" viewBox="0 0 16 120" preserveAspectRatio="none" aria-hidden>
                  <path d="M13 3 C 5 6, 9 50, 3 60 C 9 70, 5 114, 13 117" pathLength={1} strokeWidth={1.6} />
                </svg>
                <span>
                  En Cauchemar et en Démence, une preuve absente ne prouve rien : elle peut être cachée. Les preuves forcées (Hantu,
                  Goryo…) restent visibles dans ces deux modes. En 0 preuve, seuls les orbes du Mimic apparaissent.
                </span>
              </p>
            </div>
          </fieldset>

          <div className="sc-field">
            <span className="typed-label" id="sc-pool-label">
              <span className="sc-step">2</span> Entité du contrat
            </span>
            {weak.started ? (
              <>
                <Seg
                  label="Entité du contrat"
                  value={pool}
                  onChange={setPool}
                  options={[
                    { value: 'all', label: allLabel },
                    { value: 'weak', label: weak.ids.length === 1 ? 'La moins maîtrisée' : `Les ${weak.ids.length} moins maîtrisées` },
                  ]}
                />
                <p className="pencil-note sc-hint">
                  {pool === 'weak'
                    ? weak.ids.map((id) => getGhost(id)?.name).join(', ')
                    : 'celles que tu maîtrises le moins sortent plus souvent'}
                </p>
              </>
            ) : (
              <>
                <p className="sc-pool-only">{allLabel}</p>
                <p className="pencil-note sc-hint">après ta première révision, tu pourras viser les moins maîtrisées</p>
              </>
            )}
          </div>

          <div className="sc-go">
            <Consigne>
              choisis une difficulté, puis touche <b>Commencer le contrat</b>. Tu liras les rapports un par un.
            </Consigne>
            <TapeButton onClick={() => start()}>Commencer le contrat</TapeButton>
            <p className="sc-rules-link">
              <TypedLink onClick={() => document.getElementById('h-rules')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                Lire les règles d’abord ↓
              </TypedLink>
            </p>
          </div>
        </Page>

        <Page side="right" section="4" label="Règlement et registre des contrats">
          <UvPrint style={{ right: 6, top: 300, width: 104, transform: 'rotate(14deg)', ['--ur' as string]: '210px' }} />
          <div className="coffee" style={{ right: 40, bottom: 46 }} />
          <FileHead>
            <span>Règlement</span>
            <span>
              {pastContracts.length === 0 ? (
                'Registre vide'
              ) : (
                <>
                  <b>{pastContracts.length}</b> contrat{pastContracts.length > 1 ? 's' : ''} au registre
                </>
              )}
            </span>
          </FileHead>

          <section aria-labelledby="h-rules">
            <H id="h-rules">Comment ça se joue</H>
            <ol className="sc-rules">
              <li>
                <span className="n">01</span>
                <p>Le contrat arrive rapport par rapport : preuves trouvées ou non, comportements, chasses, bruits de pas.</p>
              </li>
              <li>
                <span className="n">02</span>
                <p>
                  Reporte chaque preuve dans ton carnet de preuves (un lien sous le rapport le fait pour toi) et barre les entités que tu
                  écartes. Le carnet ne garde que celles qui restent possibles.
                </p>
              </li>
              <li>
                <span className="n">03</span>
                <p>
                  Quand tu es sûr·e, désigne l’entité. Plus tu tranches tôt, plus tu gagnes de points{NNBSP}: près de {num(1000)} au premier
                  rapport, 300 au dernier.
                </p>
              </li>
              <li>
                <span className="n">04</span>
                <p>Une erreur coûte {WRONG_GUESS_PENALTY} points. À la deuxième, le contrat échoue.</p>
              </li>
            </ol>
          </section>

          <section aria-labelledby="h-past">
            <H id="h-past" count={pastContracts.length > recent.length ? `les ${recent.length} derniers sur ${pastContracts.length}` : undefined}>
              Derniers contrats
            </H>
            {recent.length === 0 ? (
              <p className="sc-empty">Ton premier contrat terminé s’inscrira ici, avec sa date et sa prime.</p>
            ) : (
              <div className="libcard sc-libcard settle" style={{ '--r': '1.2deg', '--d': '.4s' } as Style}>
                <Tape />
                <h3>Fiche des contrats</h3>
                <div className="cols">
                  <span>Date</span>
                  <span>Entité</span>
                  <span>Prime</span>
                </div>
                <ol>
                  {recent.map((a, k) => (
                    <li key={`${a.t}-${k}`} style={{ '--r': `${[-2, 1, -1, 2, -1.5, 1.5][k]}deg` } as Style}>
                      <span className="d">{safeDate(SHORT, a.t)}</span>
                      <span className="sc-lib-name">{(a.ghostId && getGhost(a.ghostId)?.name) || a.label.replace(LABEL_PREFIX, '')}</span>
                      <span className={`res${a.score === 0 ? ' bad' : ''}`}>{a.score === 0 ? 'échec' : pts(a.score)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        </Page>
      </Notebook>
    )
  }

  const shown = scenario.clues.slice(0, revealed)
  const allShown = revealed >= scenario.clues.length
  const score = scoreScenario(revealed, scenario.clues.length, wrong.length, true)
  const diff = DIFFICULTIES.find((d) => d.id === scenario.difficulty)!
  const lives = MAX_WRONG + 1 - wrong.length
  /** le contexte (rapport 00) devient l'en-tête : les rapports numérotés commencent à 01 */
  const reportsTotal = scenario.clues.length - 1
  const reportsRead = revealed - 1
  const contractNo = pastContracts.length + (outcome ? 0 : 1)
  const evidenceLine = `${scenario.evidenceCount} preuve${scenario.evidenceCount > 1 ? 's' : ''}`

  /* ---------- résultat : le rapport de clôture ---------- */
  if (outcome) {
    const debrief = candidatesAfterEachClue(scenario, GHOSTS)
    const finalScore = scoreScenario(revealed, scenario.clues.length, wrong.length, outcome === 'solved')
    const solved = outcome === 'solved'
    const idx = GHOSTS.findIndex((g) => g.id === ghost.id)
    // seulement les vraies notes du coach sur cette entité (épinglées d'abord, puis les plus récentes)
    const coach = coachNameOf(state.profile)
    const ghostNotes = coachNotes(state.notes, state.profile, ghost.id).slice(0, 2)
    // carnet resté vide alors que les rapports lus suffisaient à réduire la liste : on le dit, chiffres à l'appui
    const carnetEmpty = !Object.values(filter.evidence).some((m) => m === 'found' || m === 'excluded')
    let tip: string | null = null
    if (carnetEmpty && scenario.evidenceCount > 0) {
      const read = debrief.slice(1, revealed)
      const k = read.findIndex((n) => n <= 1)
      const min = Math.min(...read)
      if (k >= 0) tip = `ici, il ne restait qu’une entité possible dès le rapport ${pad(k + 1)}.`
      else if (read.length && min < GHOSTS.length) tip = `ici, il ne restait que ${min} entités possibles au rapport ${pad(read.indexOf(min) + 1)}.`
    }
    // la suite logique : relire la fiche après un échec ou une erreur, monter d'un cran après un sans-faute
    const harder = DIFFICULTY_ORDER[DIFFICULTY_ORDER.findIndex((d) => d.id === scenario.difficulty) + 1]
    return (
      <Notebook className="sc sc--result">
        <Page side="left" section="4" label="Rapport de clôture">
          <FileHead>
            <span>Rapport de clôture</span>
            <span>
              Contrat n° <b>{pad(contractNo)}</b>
            </span>
            <span>{scenario.evidenceCount === 0 ? diff.label : `${diff.label} · ${evidenceLine}`}</span>
          </FileHead>

          <h1 className="sr-only">{solved ? `C’était bien ${ghost.name}.` : `Raté : c’était ${ghost.name}.`}</h1>
          <div className={`sc-verdict${solved ? ' is-solved' : ' is-dead'}`}>
            <Polaroid
              ghostId={ghost.id}
              to={`/codex/${ghost.id}`}
              caption={ghost.name}
              small={`n° ${idx + 1}`}
              rotate={-3.4}
              delay={0.05}
              label={ghost.name}
            />
            <div className="sc-verdict-side" aria-hidden>
              <Stamp thunk rotate={solved ? -7 : -9} delay={0.55} className="sc-big-stamp">
                {solved ? (
                  <>
                    <span className="l1">C’était bien</span>
                    <span className="l2">{ghost.name}</span>
                  </>
                ) : (
                  <span className="l2">Raté</span>
                )}
              </Stamp>
              {!solved && <p className="sc-was">C’était {le(ghost.name)}.</p>}
            </div>
            <p className="sc-score">
              <span className="sc-score-n">
                <RoughCircle seed={`sc-score-${finalScore}`} padX={0.14} padY={0.16} width={2.3} delay={1.1}>
                  {finalScore}
                </RoughCircle>
              </span>
              <span className="sc-score-of">sur {num(1000)} points</span>
            </p>
          </div>

          <p className="sc-lead sc-outcome">
            {solved
              ? `Trouvée en ${plural(reportsRead, 'rapport')} sur ${reportsTotal}${
                  wrong.length ? `, avec ${plural(wrong.length, 'erreur')}` : ', sans erreur'
                }.`
              : `Deux erreurs : le contrat échoue. Relis le contrat en entier : le nombre d’entités possibles est noté au crayon à chaque rapport.`}
          </p>
          {tip && (
            <p className="pencil-note sc-tip">
              Astuce{NNBSP}: ton carnet de preuves est resté vide. Coche les preuves dès qu’un rapport les signale{NNBSP}: {tip}
            </p>
          )}

          <dl className="sc-facts">
            <div>
              <dt>Entité</dt>
              <dd>
                <Link className="sc-ghost-link" to={`/codex/${ghost.id}`}>
                  {ghost.name}
                </Link>
                <span className="sc-summary">{ghost.summary}</span>
              </dd>
            </div>
            <div>
              <dt>Ses preuves</dt>
              <dd>
                <GhostEvidence ghost={ghost} />
              </dd>
            </div>
            {scenario.evidenceCount > 0 && scenario.evidenceCount < 3 && (
              <div>
                <dt>Visibles ici</dt>
                <dd>{scenario.visibleEvidence.map((e) => EVIDENCE[e].label).join(', ')}</dd>
              </div>
            )}
            {wrong.length > 0 && (
              <div>
                <dt>Fausses pistes</dt>
                <dd className="sc-wrongs">
                  {wrong.map((w) => (
                    <s key={w}>{getGhost(w)?.name}</s>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          {ghostNotes.length > 0 && (
            <section className="sc-notes" aria-labelledby="h-sc-notes">
              <H id="h-sc-notes" as="h3">
                Notes de {coach}
              </H>
              <div className="sc-notes-row">
                {ghostNotes.map((n, k) => (
                  <Sticky
                    key={n.id}
                    hand="coach"
                    rotate={k % 2 ? 1.6 : -1.4}
                    delay={0.8 + k * 0.15}
                    meta={safeDate(SHORT, n.createdAt, '')}
                    sign={`— ${n.author}`}
                  >
                    <NoteText note={n} />
                  </Sticky>
                ))}
              </div>
            </section>
          )}

          <EndActions className="sc-end-actions">
            <TapeButton onClick={() => start(scenario.difficulty)}>Recommencer un contrat</TapeButton>
            <TypedLink onClick={() => setScenario(null)}>Changer les réglages</TypedLink>
            <TypedLink to="/entrainement">Retour aux exercices</TypedLink>
            {solved && wrong.length === 0 && harder ? (
              <TypedLink
                onClick={() => {
                  setDifficulty(harder.id)
                  start(harder.id)
                }}
              >
                Essayer en {harder.label} →
              </TypedLink>
            ) : (
              <TypedLink to={`/codex/${ghost.id}`}>Relire la fiche {de(ghost.name)} →</TypedLink>
            )}
          </EndActions>
        </Page>

        <Page side="right" section="4" label="Le contrat en entier">
          <FileHead>
            <span>Rapport complet</span>
            <span>{cap(scenario.map)}</span>
          </FileHead>
          <section aria-labelledby="h-full">
            <H id="h-full" count={`${reportsRead} lu${reportsRead > 1 ? 's' : ''} sur ${reportsTotal}`}>
              Le contrat en entier
            </H>
            <p className="sc-intro">
              <span className="pencil-note">Au crayon</span>, le nombre d’entités encore possibles d’après les seules preuves à ce
              moment-là. Le reste du chemin se fait avec les comportements.
            </p>
            <ContractHeader scenario={scenario} label={diff.label} evidenceLine={evidenceLine} />
            <ol className="sc-log">
              {scenario.clues.map((c, i) =>
                i === 0 ? null : (
                  <Report
                    key={c.id}
                    n={i}
                    clue={c}
                    hunt={isHunt(c)}
                    dim={i >= revealed}
                    debrief
                    remaining={debrief[i]}
                    after={i === revealed - 1 && !allShown ? 'tu as tranché ici' : undefined}
                  />
                ),
              )}
            </ol>
          </section>
        </Page>
      </Notebook>
    )
  }

  /* ---------- enquête en cours : le rapport de terrain ---------- */
  const last = shown[shown.length - 1]
  const lastWrong = wrong.length ? getGhost(wrong[wrong.length - 1]) : undefined
  const found = Object.values(filter.evidence).filter((m) => m === 'found').length
  const eliminated = GHOSTS.length - possibleGhosts.length
  /** tant que la liste est longue et qu'il reste des rapports, lire la suite est l'action principale */
  const readOn = !allShown && candidates.length > FEW_LEFT
  const firstContract = pastContracts.length === 0
  /** quelque chose a été fait : abandonner demande confirmation */
  const engaged = revealed > 2 || wrong.length > 0 || struck.length > 0 || Object.values(filter.evidence).some((m) => m && m !== 'unknown')
  const abandon = () => {
    steps.current?.stop()
    setQuitOpen(false)
    setScenario(null)
  }
  const nextReport = () => setRevealed((r) => Math.min(scenario.clues.length, r + 1))
  // la fiche « Quelle est l'entité ? » : les entités du carnet, ou toutes (moins les fausses pistes) si le carnet se trompe
  const filtered = candidates.length > 0 && candidates.length < GHOSTS.length
  const guessList = guessAll || !candidates.length ? GHOSTS.filter((g) => !wrong.includes(g.id)) : candidates
  const pendingLine = pending.length ? `${plural(pending.length, 'preuve')} des rapports à reporter` : null

  return (
    <>
      <Notebook className="sc sc--play">
        <Page side="left" section="4" label="Rapport de terrain">
          <FileHead>
            <button type="button" className="link-btn sc-quit" onClick={() => (engaged ? setQuitOpen(true) : abandon())}>
              ‹ Abandonner
            </button>
            <span>Rapport de terrain</span>
            <span>
              Contrat n°{NBSP}<b>{pad(contractNo)}</b>
            </span>
          </FileHead>

          <header className="sc-case">
            <h1 className="sc-place">
              <em>Contrat en cours</em>
              {cap(scenario.map)}
            </h1>
            <Stamp tone="violet" rotate={5} delay={0.3} thunk>
              {diff.label}
            </Stamp>
            <dl className="sc-meta">
              <div>
                <dt>Preuves</dt>
                <dd>{scenario.evidenceCount}</dd>
              </div>
              <div>
                <dt>Pièce favorite</dt>
                <dd>{scenario.room}</dd>
              </div>
              <div className="sc-clock">
                <dt>Horloge</dt>
                <dd>T+{last.time}</dd>
              </div>
            </dl>
          </header>

          {firstContract && (
            <div className="sc-howto">
              <Sticky hand="mine" rotate={-1.1} meta="Mode d’emploi · premier contrat">
                <ol>
                  <li>Lis le rapport.</li>
                  <li>
                    Reporte sa preuve dans ton carnet de preuves{' '}
                    <span className="sc-howto-where">
                      (<span className="sc-on-desk">à droite</span>
                      <span className="sc-on-phone">en bas de l’écran</span>, ou avec le lien sous le rapport)
                    </span>
                    .
                  </li>
                  <li>
                    <b>Rapport suivant</b>… ou <b>Désigner l’entité</b> dès que tu es sûr·e{NNBSP}: plus tôt, plus de points.
                  </li>
                </ol>
              </Sticky>
            </div>
          )}

          <ol className="sc-log" aria-live="polite">
            {shown.map((c, i) =>
              i === 0 ? null : (
                <Report
                  key={c.id}
                  n={i}
                  clue={c}
                  hunt={isHunt(c)}
                  isNew={i === revealed - 1}
                  playing={playing}
                  mark={c.evidence ? filter.evidence[c.evidence] : undefined}
                  onReport={(id, m) => report(id, m)}
                  onPlay={
                    c.speed
                      ? () => {
                          if (playing) steps.current?.stop()
                          else {
                            steps.current?.play(c.speed!, 7)
                            setPlaying(true)
                          }
                        }
                      : undefined
                  }
                />
              ),
            )}
          </ol>

          {lastWrong && (
            <div className="sc-miss" key={wrong.length}>
              <Stamp thunk rotate={-6} delay={0.05} className="sc-miss-stamp">
                Fausse piste
              </Stamp>
              <span className="pencil-note">
                ce n’était pas {lastWrong.name} · {lives > 1 ? `encore ${lives} essais` : 'plus qu’un essai'}
              </span>
            </div>
          )}

          <div className="sc-next" ref={nextArea}>
            <Consigne>
              reporte chaque preuve dans ton carnet de preuves (<span className="sc-on-desk">à droite</span>
              <span className="sc-on-phone">en bas</span>), barre les entités écartées, puis lis le rapport suivant. Désigne l’entité quand tu
              es sûr·e.
            </Consigne>
            <div className="sc-actions">
              {/* les deux actions gardent leur place : seule la bande rouge passe de l'une à l'autre */}
              {!allShown &&
                (readOn ? (
                  <TapeButton onClick={nextReport}>Rapport suivant</TapeButton>
                ) : (
                  <PaperButton onClick={nextReport} rotate={-0.8}>
                    Rapport suivant
                  </PaperButton>
                ))}
              {readOn ? (
                <PaperButton onClick={openGuess} rotate={0.6}>
                  Désigner l’entité
                </PaperButton>
              ) : (
                <TapeButton onClick={openGuess}>Désigner l’entité</TapeButton>
              )}
            </div>
            {!readOn && !allShown && candidates.length > 0 && (
              <p className="pencil-note sc-decide">
                {candidates.length === 1 ? 'plus qu’une entité possible dans ton carnet' : `plus que ${candidates.length} entités possibles dans ton carnet`}
                {NNBSP}: à toi de trancher
              </p>
            )}
            <p className="sc-sealed">
              {allShown
                ? fr('Tous les rapports sont lus : désigne l’entité.')
                : `${plural(reportsTotal - reportsRead, 'rapport')} pas encore ${reportsTotal - reportsRead > 1 ? 'lus' : 'lu'} · gain possible${NNBSP}: ${pts(score)}`}
            </p>
          </div>
        </Page>

        <Page side="right" section="4" label="Mon carnet de preuves" className={`sc-board${sheetOpen ? ' is-open' : ''}`}>
          <button
            type="button"
            className="sc-sheet-toggle"
            aria-expanded={sheetOpen}
            aria-controls="sc-board-body"
            onClick={() => setSheetOpen((v) => !v)}
          >
            <span className="sc-sheet-title">Mon carnet de preuves</span>
            <span className={`sc-sheet-sum${pendingLine ? ' is-todo' : ''}`}>
              {pendingLine ?? `${plural(found, 'preuve', 'aucune preuve')} · ${plural(candidates.length, 'possible', 'aucune possible')}`}
            </span>
            <span className="sc-sheet-act">{sheetOpen ? 'fermer' : 'ouvrir'}</span>
          </button>
          <div className="sc-board-body" id="sc-board-body">
            <FileHead>
              <span>Pièces du dossier</span>
              <span>
                Gain possible <b>{score}</b>{NBSP}pts · <b>{lives}</b> essai{lives > 1 ? 's' : ''}
              </span>
            </FileHead>

            <section aria-labelledby="h-sc-ev">
              <H id="h-sc-ev" count={scenario.evidenceCount === 0 ? 'aucune au contrat' : `${scenario.evidenceCount} au contrat`}>
                Mon carnet de preuves
              </H>
              {pending.length > 0 && (
                <p className="pencil-note sc-todo" role="status">
                  lu dans les rapports, à reporter ici{NNBSP}:{' '}
                  {pending.map((p, k) => (
                    <span key={p.id} className="sc-todo-item">
                      {k > 0 && ' · '}
                      <b>
                        <span className="sc-on-desk">{EVIDENCE[p.id].label}</span>
                        <span className="sc-on-phone">{EVIDENCE[p.id].short}</span>
                      </b>{' '}
                      {p.mark === 'found' ? 'trouvée' : 'non trouvée'} (<span className="sc-on-mouse">clique</span>
                      <span className="sc-on-touch">touche</span> {p.mark === 'found' ? '1 fois' : '2 fois'} sa case)
                    </span>
                  ))}
                </p>
              )}
              {unsupported.length > 0 && (
                <p className="pencil-note sc-todo">
                  aucun rapport n’a signalé{NNBSP}: <b>{unsupported.map((id) => EVIDENCE[id].label).join(', ')}</b> (à vérifier)
                </p>
              )}
              {/* même consigne que le carnet de preuves du codex */}
              <Consigne className="sc-how">
                <TrackerHow />
              </Consigne>
              <EvidenceTracker value={filter.evidence} onChange={(evidence) => setFilter({ ...filter, evidence })} possible={possible} />
              {scenario.evidenceCount === 0 && (
                <p className="pencil-note sc-zero">
                  en 0 preuve, seuls les orbes du Mimic peuvent apparaître{NNBSP}: les autres cases sont grisées exprès. Tranche avec les
                  comportements.
                </p>
              )}
            </section>

            <section aria-labelledby="h-sc-cands">
              <H id="h-sc-cands" count={candidates.length === 0 ? 'aucune' : `${candidates.length} sur ${GHOSTS.length}`}>
                Encore possibles
              </H>
              <ul className="sc-cands">
                {possibleGhosts.map((g) => {
                  const isStruck = struck.includes(g.id)
                  const isWrong = wrong.includes(g.id)
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        className={`sc-cand${isStruck ? ' is-struck' : ''}${isWrong ? ' is-wrong' : ''}`}
                        disabled={isWrong}
                        aria-pressed={isStruck}
                        onClick={() => setStruck((s) => (isStruck ? s.filter((x) => x !== g.id) : [...s, g.id]))}
                        title={isWrong ? 'Fausse piste' : isStruck ? 'Rétablir' : 'Barrer'}
                      >
                        {g.name}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="pencil-note sc-how">
                <span className="sc-on-mouse">clique sur un nom pour le barrer</span>
                <span className="sc-on-touch">touche un nom pour le barrer</span>
                {eliminated > 0 && ` · ${eliminated} écartée${eliminated > 1 ? 's' : ''} par tes preuves`}
              </p>
            </section>
          </div>
        </Page>
        {sheetOpen && <button type="button" className="sc-scrim" aria-label="Fermer le carnet de preuves" onClick={() => setSheetOpen(false)} />}
      </Notebook>

      <Modal
        open={guessOpen}
        onClose={() => setGuessOpen(false)}
        title={`Quelle est l’entité${NNBSP}?`}
        actions={
          <>
            <TypedLink onClick={() => setGuessOpen(false)}>Retour au contrat</TypedLink>
            <TapeButton disabled={!guessList.some((g) => g.id === guess)} onClick={submitGuess} className="sc-validate" disabledHint="choisis un nom dans la liste">
              Valider
            </TapeButton>
          </>
        }
      >
        <p className="pencil-note sc-guess-note">
          Entoure un nom, puis valide.{' '}
          {wrong.length > 0
            ? `Attention${NNBSP}: ${lives > 1 ? `encore ${lives} essais` : 'plus qu’un essai'}.`
            : `Une erreur coûte ${WRONG_GUESS_PENALTY} points${NNBSP}; deux, et le contrat échoue.`}
        </p>
        {pending.length > 0 && (
          <p className="pencil-note sc-guess-warn">
            {pending.length === 1 ? 'Une preuve des rapports n’est' : `${pending.length} preuves des rapports ne sont`} pas encore dans ton carnet
            {NNBSP}: reporte-{pending.length === 1 ? 'la' : 'les'} d’abord, la liste se réduira.
          </p>
        )}
        {unsupported.length > 0 && (
          <p className="pencil-note sc-guess-warn">
            Ton carnet coche {unsupported.map((id) => EVIDENCE[id].label).join(', ')}, qu’aucun rapport n’a {unsupported.length > 1 ? 'signalées' : 'signalée'}
            {NNBSP}: la bonne entité a peut-être été écartée.
          </p>
        )}
        {filtered && !guessAll && (
          <p className="sc-guess-scope">
            {candidates.length === 1
              ? `La seule entité encore possible d’après ton carnet de preuves${NNBSP}:`
              : `Les ${candidates.length} entités encore possibles d’après ton carnet de preuves${NNBSP}:`}
          </p>
        )}
        <div className="sc-guess">
          <Seg label="Entité" value={guess} onChange={setGuess} options={guessList.map((g) => ({ value: g.id, label: g.name }))} />
        </div>
        {filtered && (
          <p className="sc-guess-all">
            {guessAll ? (
              <TypedLink
                onClick={() => {
                  setGuessAll(false)
                  // un nom pris hors du carnet n'y est plus affiché : il ne reste pas entouré en cachette
                  if (!candidates.some((g) => g.id === guess)) setGuess('')
                }}
              >
                revenir aux {candidates.length} entités de mon carnet
              </TypedLink>
            ) : (
              <TypedLink onClick={() => setGuessAll(true)}>
                mon carnet se trompe peut-être{NNBSP}: voir les {GHOSTS.length - wrong.length} entités
              </TypedLink>
            )}
          </p>
        )}
      </Modal>

      <Modal
        open={quitOpen}
        onClose={() => setQuitOpen(false)}
        title={`Abandonner le contrat${NNBSP}?`}
        actions={
          <>
            <TypedLink onClick={() => setQuitOpen(false)}>Continuer le contrat</TypedLink>
            <PaperButton onClick={abandon}>Abandonner</PaperButton>
          </>
        }
      >
        <p className="sc-quit-body">Il ne comptera pas dans tes contrats{NNBSP}: les rapports lus et ton carnet de preuves seront effacés.</p>
      </Modal>
    </>
  )
}

/** Choix exclusif sous forme de case du journal (vrai bouton radio, accessible au clavier). */
function RadioLine({
  name,
  checked,
  onChange,
  children,
  hint,
  tag,
  seed,
}: {
  name: string
  checked: boolean
  onChange: () => void
  children: ReactNode
  hint?: ReactNode
  /** tampon ou mot au crayon à côté du nom (« conseillé pour débuter ») */
  tag?: ReactNode
  seed: string
}) {
  return (
    <label className={`check-line sc-radio${checked ? ' is-on' : ''}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <JournalBox state={checked ? 'yes' : 'empty'} seed={seed} delay={0} />
      <span className="txt">
        <span className="sc-radio-name">
          <b>{children}</b>
          {tag}
        </span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  )
}

/** En-tête tapé du contrat (le rapport 00) pour le rapport complet. */
function ContractHeader({ scenario, label, evidenceLine }: { scenario: S; label: string; evidenceLine: string }) {
  return (
    <p className="sc-contract">
      <span className="sc-report-n">Rapport 00 · {scenario.clues[0].time}</span>
      <span>
        {scenario.evidenceCount === 0
          ? `${cap(scenario.map)}, partie à 0 preuve. Pièce favorite : ${scenario.room}.`
          : `${cap(scenario.map)}, difficulté ${label} (${evidenceLine}). Pièce favorite : ${scenario.room}.`}
      </span>
    </p>
  )
}

function StrengthStamp({ strength, k }: { strength: ObservationStrength; k: number }) {
  if (strength === 'definitive')
    return (
      <Stamp small rotate={k % 2 ? 3 : -4} delay={0.1}>
        Définitif
      </Stamp>
    )
  if (strength === 'strong')
    return (
      <Stamp small tone="violet" rotate={k % 2 ? -2 : 2} delay={0.1}>
        Fort
      </Stamp>
    )
  return (
    <Stamp small tone="pencil" rotate={-1} delay={0.1}>
      Indice
    </Stamp>
  )
}

/** Un rapport du journal de terrain. */
function Report({
  n,
  clue,
  hunt,
  dim,
  isNew,
  onPlay,
  playing,
  debrief,
  remaining,
  after,
  mark,
  onReport,
}: {
  n: number
  clue: Clue
  hunt?: boolean
  dim?: boolean
  isNew?: boolean
  onPlay?: () => void
  playing?: boolean
  /** ce que le carnet de preuves dit déjà de la preuve du rapport */
  mark?: EvidenceMark
  /** reporte la preuve du rapport dans le carnet (cochée ou barrée) */
  onReport?: (id: EvidenceId, mark: EvidenceMark) => void
  /** rapport complet : force des indices, preuves cachées, entités restantes */
  debrief?: boolean
  remaining?: number
  /** annotation au crayon sous le rapport */
  after?: string
}) {
  const ev = clue.evidence ? EVIDENCE[clue.evidence] : undefined
  const found = clue.kind === 'evidence'
  const want = expectedMark(clue)
  const reported = want != null && mark === want
  return (
    <li
      className={`sc-report${dim ? ' is-dim' : ''}${isNew ? ' is-new' : ''}${after ? ' has-after' : ''}`}
      style={ev ? ({ '--c': ev.color } as Style) : undefined}
    >
      <div className="sc-report-head">
        <span className="sc-report-n">
          Rapport {pad(n)} · {clue.time}
        </span>
        <span className="sc-report-marks">
          {hunt && (
            <Stamp small rotate={-4} delay={isNew ? 0.35 : 0.1} thunk={isNew}>
              Chasse
            </Stamp>
          )}
          {debrief && clue.strength && <StrengthStamp strength={clue.strength} k={n} />}
          {remaining != null && (
            <span className="pencil-note sc-remaining">
              {plural(remaining, 'possible', 'aucune possible')}
            </span>
          )}
        </span>
      </div>
      <p className="sc-report-text">{spell(clue.text)}</p>
      {ev && (
        <p className={`sc-ev${found ? ' is-found' : ' is-missing'}`} data-clue={clue.id}>
          <JournalBox state={found ? 'yes' : 'no'} color={ev.color} seed={`sc-${clue.id}-${clue.evidence}`} crossOut delay={isNew ? 0.25 : 0} />
          <span className="sc-ev-name">{ev.label}</span>
          <span className="pencil-note">
            {found ? 'trouvée' : debrief && clue.hidden ? 'non trouvée : cachée par la difficulté' : 'non trouvée'}
          </span>
        </p>
      )}
      {ev && onReport && want && clue.evidence && (
        <p className="sc-report-to">
          {reported ? (
            <span className="pencil-note sc-reported">reportée dans ton carnet</span>
          ) : (
            <TypedLink className="sc-report-link" onClick={() => onReport(clue.evidence!, want)}>
              reporter dans mon carnet de preuves →
            </TypedLink>
          )}
        </p>
      )}
      {onPlay && (
        <div className="sc-listen">
          <PaperButton onClick={onPlay} pressed={playing}>
            {playing ? 'Arrêter le son' : 'Écouter les pas'}
          </PaperButton>
        </div>
      )}
      {after && <p className="pencil-note sc-cut">{after}</p>}
    </li>
  )
}
