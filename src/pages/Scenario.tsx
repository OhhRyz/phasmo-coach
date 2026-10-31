import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EvidenceTracker } from '../components/EvidenceTracker'
import { UvPrint } from '../components/journal/Charts'
import {
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
import type { Ghost, ObservationStrength } from '../data/types'
import { createFootsteps, type Footsteps } from '../engine/audio'
import { EMPTY_FILTER, filterGhosts, possibleEvidence, type FilterState } from '../engine/filter'
import { redactGhostName } from '../engine/format'
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

type Style = CSSProperties & Record<`--${string}`, string | number>

const MAX_WRONG = 1

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const pad = (n: number) => String(n).padStart(2, '0')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

export function Scenario() {
  const mastery = useMastery()
  const { state, dispatch } = useStore()
  const [difficulty, setDifficulty] = useState<Difficulty>('pro')
  const [pool, setPool] = useState<'all' | 'weak'>('all')
  const [scenario, setScenario] = useState<S | null>(null)
  const [revealed, setRevealed] = useState(1)
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER)
  const [struck, setStruck] = useState<string[]>([])
  const [wrong, setWrong] = useState<string[]>([])
  const [outcome, setOutcome] = useState<'solved' | 'dead' | null>(null)
  const [guessOpen, setGuessOpen] = useState(false)
  const [guess, setGuess] = useState<string>('')
  const [playing, setPlaying] = useState(false)
  /** téléphone : le carnet de preuves se replie en volet au-dessus des onglets */
  const [sheetOpen, setSheetOpen] = useState(false)
  const steps = useRef<Footsteps | null>(null)
  const timelineEnd = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    steps.current = createFootsteps(() => setPlaying(false))
    return () => steps.current?.stop()
  }, [])

  useEffect(() => {
    if (revealed > 2) timelineEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [revealed])

  useEffect(() => setSheetOpen(false), [scenario, outcome])
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheetOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  const ghost: Ghost | undefined = scenario ? getGhost(scenario.ghostId) : undefined

  const start = () => {
    const rng = createRng((Date.now() ^ 0x5bd1e995) >>> 0)
    const sorted = [...GHOSTS].sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0))
    const candidates = pool === 'weak' ? sorted.slice(0, 8) : GHOSTS
    // en 0 preuve, il faut au moins deux indices forts utilisables sans preuve pour que l'enquête soit jouable
    const playable =
      difficulty === 'apocalypse'
        ? candidates.filter((g) => g.observations.filter((o) => !o.requires && o.strength !== 'hint').length >= 2)
        : candidates
    const g = weightedPick(rng, playable.length ? playable : candidates, (x) => 1.25 - (mastery[x.id] ?? 0))
    const s = generateScenario(g, difficulty, rng, GHOSTS)
    steps.current?.stop()
    setScenario(s)
    setRevealed(2)
    setFilter({ ...EMPTY_FILTER, evidenceCount: s.evidenceCount })
    setStruck([])
    setWrong([])
    setOutcome(null)
    setGuess('')
  }

  const possibleGhosts = useMemo(() => filterGhosts(GHOSTS, filter), [filter])
  const candidates = useMemo(() => possibleGhosts.filter((g) => !struck.includes(g.id)), [possibleGhosts, struck])
  const possible = useMemo(() => possibleEvidence(possibleGhosts), [possibleGhosts])
  /** les rapports de chasse : indices de seuil et de vitesse, et observations « chasse » de l'entité */
  const huntTexts = useMemo(
    () => new Set(ghost ? ghost.observations.filter((o) => o.kind === 'hunt').map((o) => redactGhostName(o.text, ghost)) : []),
    [ghost],
  )
  const pastContracts = useMemo(() => state.activity.filter((a) => a.kind === 'scenario'), [state.activity])

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
      activity: { t: Date.now(), kind: 'scenario', score, total: 1000, label: `Enquête : ${ghost.name}`, ghostId: ghost.id },
    })
  }

  const submitGuess = () => {
    if (!scenario || !guess) return
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

  const isHunt = (c: Clue) => c.kind === 'hunt-sanity' || c.kind === 'hunt-speed' || (c.kind === 'observation' && huntTexts.has(c.text))

  /* ---------- configuration : l'ordre de mission ---------- */
  if (!scenario || !ghost) {
    const recent = pastContracts.slice(-6).reverse()
    return (
      <Notebook className="sc sc--setup">
        <Page side="left" section="4" label="Mise en situation : ordre de mission">
          <FileHead>
            <Link to="/entrainement">‹ S’entraîner</Link>
            <span>Mise en situation</span>
            <span>
              Contrat n° <b>{pad(pastContracts.length + 1)}</b>
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
              Une enquête simulée : les rapports arrivent au fil du contrat, comme en partie. Note tes preuves, élimine, et désigne
              l’entité avec le moins de rapports possible.
            </p>
          </header>

          <fieldset className="sc-field">
            <legend className="typed-label">
              <span className="sc-step">1</span> Difficulté du contrat
            </legend>
            <div className="sc-diff-grid">
              <div className="sc-diffs">
                {DIFFICULTIES.map((d) => (
                  <RadioLine
                    key={d.id}
                    name="difficulty"
                    checked={difficulty === d.id}
                    onChange={() => setDifficulty(d.id)}
                    seed={`sc-diff-${d.id}`}
                    hint={d.description}
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
                  En Cauchemar et en Démence, une preuve absente ne prouve rien : elle peut être cachée. Les preuves forcées (Hantu,
                  Goryo…) restent toujours visibles. En 0 preuve, seuls les orbes du Mimic apparaissent.
                </span>
              </p>
            </div>
          </fieldset>

          <div className="sc-field">
            <span className="typed-label" id="sc-pool-label">
              <span className="sc-step">2</span> Entité tirée au sort parmi
            </span>
            <Seg
              label="Entités"
              value={pool}
              onChange={setPool}
              options={[
                { value: 'all', label: `Les ${GHOSTS.length}` },
                { value: 'weak', label: 'Mes 8 points faibles' },
              ]}
            />
            <p className="pencil-note sc-hint">celles que tu maîtrises le moins sortent plus souvent</p>
          </div>

          <div className="sc-go">
            <TapeButton onClick={start}>Ouvrir le contrat</TapeButton>
          </div>
        </Page>

        <Page side="right" section="4" label="Règlement et registre des contrats">
          <UvPrint style={{ right: 6, top: 300, width: 104, transform: 'rotate(14deg)', ['--ur' as string]: '210px' }} />
          <FileHead>
            <span>Règlement</span>
            <span>
              <b>{pastContracts.length}</b> contrat{pastContracts.length > 1 ? 's' : ''} au registre
            </span>
          </FileHead>

          <section aria-labelledby="h-rules">
            <H id="h-rules">Comment ça se joue</H>
            <ol className="sc-rules">
              <li>
                <span className="n">01</span>
                <p>Le contrat arrive rapport par rapport : preuves trouvées ou non, comportements, chasses, bruits de pas.</p>
              </li>
              <li>
                <span className="n">02</span>
                <p>Coche tes preuves et barre les entités que tu écartes. Le carnet ne garde que celles qui restent possibles.</p>
              </li>
              <li>
                <span className="n">03</span>
                <p>Plus tu tranches tôt, plus la prime est grosse : près de 1000 points au premier rapport, 300 au dernier.</p>
              </li>
              <li>
                <span className="n">04</span>
                <p>Une erreur coûte {WRONG_GUESS_PENALTY} points. À la deuxième, le contrat échoue.</p>
              </li>
            </ol>
          </section>

          <section aria-labelledby="h-past">
            <H id="h-past" count={recent.length ? `les ${recent.length} derniers` : undefined}>
              Derniers contrats
            </H>
            {recent.length === 0 ? (
              <p className="sc-empty">Aucun contrat au registre pour l’instant : le premier t’attend sur la page de gauche.</p>
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
                      <span className="d">{SHORT.format(a.t)}</span>
                      <span className="sc-lib-name">{(a.ghostId && getGhost(a.ghostId)?.name) || a.label.replace(/^Enquête : /, '')}</span>
                      <span className={`res${a.score === 0 ? ' bad' : ''}`}>{a.score === 0 ? 'échec' : `${a.score} pts`}</span>
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
    const coach = state.profile.role === 'coach' ? state.profile.name : state.profile.coachName
    const ghostNotes = state.notes.filter((n) => n.ghostId === ghost.id).slice(0, 2)
    return (
      <Notebook className="sc sc--result">
        <Page side="left" section="4" label="Rapport de clôture">
          <FileHead>
            <span>Rapport de clôture</span>
            <span>
              Contrat n° <b>{pad(contractNo)}</b>
            </span>
            <span>
              {diff.label} · {evidenceLine}
            </span>
          </FileHead>

          <h1 className="sr-only">{solved ? `C’était bien ${ghost.name}.` : `Raté : c’était ${ghost.name}.`}</h1>
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
              {!solved && <p className="sc-was">C’était {ghost.name}.</p>}
            </div>
            <p className="sc-score">
              <span className="sc-score-n">
                <RoughCircle seed={`sc-score-${finalScore}`} padX={0.14} padY={0.16} width={2.3} delay={1.1}>
                  {finalScore}
                </RoughCircle>
              </span>
              <span className="sc-score-of">sur 1000 points</span>
            </p>
          </div>

          <p className="sc-lead sc-outcome">
            {solved
              ? `Trouvé en ${plural(reportsRead, 'rapport')} sur ${reportsTotal}${
                  wrong.length ? `, avec ${plural(wrong.length, 'erreur')}` : ', sans erreur'
                }.`
              : 'Deux erreurs : le contrat échoue. Relis les rapports sur la page de droite, la leçon est souvent dedans.'}
          </p>

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
                {coach ? `Notes de ${coach}` : 'Notes du coach'}
              </H>
              <div className="sc-notes-row">
                {ghostNotes.map((n, k) => (
                  <Sticky
                    key={n.id}
                    rotate={k % 2 ? 1.6 : -1.4}
                    delay={0.8 + k * 0.15}
                    meta={SHORT.format(n.createdAt)}
                    sign={n.author ? `— ${n.author}` : undefined}
                  >
                    <strong className="sc-sticky-title">{n.title}</strong>
                    {n.body && <span className="pre sc-sticky-body">{n.body}</span>}
                  </Sticky>
                ))}
              </div>
            </section>
          )}

          <div className="sc-actions sc-actions--end">
            <TapeButton onClick={start}>Nouvelle enquête</TapeButton>
            <PaperButton onClick={() => setScenario(null)} rotate={-0.8}>
              Changer la difficulté
            </PaperButton>
          </div>
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
  const abandon = () => {
    steps.current?.stop()
    setScenario(null)
  }

  return (
    <>
      <Notebook className="sc sc--play">
        <Page side="left" section="4" label="Rapport de terrain">
          <FileHead>
            <button type="button" className="link-btn sc-quit" onClick={abandon}>
              ‹ Abandonner
            </button>
            <span>Rapport de terrain</span>
            <span>
              Contrat n° <b>{pad(contractNo)}</b>
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
          <div ref={timelineEnd} className="sc-end" />

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

          <div className="sc-actions">
            <PaperButton disabled={allShown} onClick={() => setRevealed((r) => r + 1)} rotate={-0.8}>
              {allShown ? 'Plus aucun indice' : 'Indice suivant'}
            </PaperButton>
            <TapeButton onClick={() => setGuessOpen(true)}>Désigner l’entité</TapeButton>
          </div>
          <p className="sc-sealed">
            {allShown
              ? 'Tous les rapports sont sur la table.'
              : `${plural(reportsTotal - reportsRead, 'rapport')} encore sous scellés · prime actuelle ${score} pts`}
          </p>
        </Page>

        <Page side="right" section="4" label="Mon carnet de preuves" className={`sc-board${sheetOpen ? ' is-open' : ''}`}>
          <button
            type="button"
            className="sc-sheet-toggle"
            aria-expanded={sheetOpen}
            aria-controls="sc-board-body"
            onClick={() => setSheetOpen((v) => !v)}
          >
            <span className="sc-sheet-title">Mon carnet</span>
            <span className="sc-sheet-sum">
              {plural(found, 'preuve')} · {candidates.length} possible{candidates.length > 1 ? 's' : ''}
            </span>
            <span className="sc-sheet-act">{sheetOpen ? 'fermer' : 'ouvrir'}</span>
          </button>
          <div className="sc-board-body" id="sc-board-body">
            <FileHead>
              <span>Pièces du dossier</span>
              <span>
                Prime <b>{score}</b> pts · <b>{lives}</b> essai{lives > 1 ? 's' : ''}
              </span>
            </FileHead>

            <section aria-labelledby="h-sc-ev">
              <H id="h-sc-ev" count={`${scenario.evidenceCount} au contrat`}>
                Mon carnet de preuves
              </H>
              <p className="pencil-note sc-how">un toucher : trouvée · deux : exclue · trois : effacée</p>
              <EvidenceTracker value={filter.evidence} onChange={(evidence) => setFilter({ ...filter, evidence })} possible={possible} />
            </section>

            <section aria-labelledby="h-sc-cands">
              <H id="h-sc-cands" count={`${candidates.length} sur ${GHOSTS.length}`}>
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
                touche un nom pour le barrer
                {eliminated > 0 && ` · ${eliminated} écartée${eliminated > 1 ? 's' : ''} par tes preuves`}
              </p>
            </section>
          </div>
        </Page>
        {sheetOpen && <button type="button" className="sc-scrim" aria-label="Fermer le carnet" onClick={() => setSheetOpen(false)} />}
      </Notebook>

      <Modal
        open={guessOpen}
        onClose={() => setGuessOpen(false)}
        title="Quelle est l’entité ?"
        actions={
          <>
            <TypedLink onClick={() => setGuessOpen(false)}>Continuer l’enquête</TypedLink>
            <TapeButton disabled={!guess} onClick={submitGuess}>
              Valider
            </TapeButton>
          </>
        }
      >
        <p className="pencil-note sc-guess-note">
          {wrong.length > 0
            ? `Attention : ${lives > 1 ? `encore ${lives} essais` : 'plus qu’un essai'}.`
            : `Une erreur coûte ${WRONG_GUESS_PENALTY} points ; deux, et le contrat échoue.`}
          {candidates.length > 0 && candidates.length < GHOSTS.length && ' Seules les entités encore possibles d’après ton carnet sont proposées.'}
        </p>
        <div className="sc-guess">
          <Seg
            label="Entité"
            value={guess}
            onChange={setGuess}
            options={(candidates.length ? candidates : GHOSTS.filter((g) => !wrong.includes(g.id))).map((g) => ({ value: g.id, label: g.name }))}
          />
        </div>
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
  seed,
}: {
  name: string
  checked: boolean
  onChange: () => void
  children: ReactNode
  hint?: ReactNode
  seed: string
}) {
  return (
    <label className={`check-line sc-radio${checked ? ' is-on' : ''}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <JournalBox state={checked ? 'yes' : 'empty'} seed={seed} delay={0} />
      <span className="txt">
        <b>{children}</b>
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
        {cap(scenario.map)}, difficulté {label} ({evidenceLine}). Pièce favorite : {scenario.room}.
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
}: {
  n: number
  clue: Clue
  hunt?: boolean
  dim?: boolean
  isNew?: boolean
  onPlay?: () => void
  playing?: boolean
  /** rapport complet : force des indices, preuves cachées, entités restantes */
  debrief?: boolean
  remaining?: number
  /** annotation au crayon sous le rapport */
  after?: string
}) {
  const ev = clue.evidence ? EVIDENCE[clue.evidence] : undefined
  const found = clue.kind === 'evidence'
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
              {remaining} possible{remaining > 1 ? 's' : ''}
            </span>
          )}
        </span>
      </div>
      <p className="sc-report-text">{clue.text}</p>
      {ev && (
        <p className={`sc-ev${found ? ' is-found' : ' is-missing'}`}>
          <JournalBox state={found ? 'yes' : 'no'} color={ev.color} seed={`sc-${clue.id}-${clue.evidence}`} crossOut delay={isNew ? 0.25 : 0} />
          <span className="sc-ev-name">{ev.label}</span>
          <span className="pencil-note">
            {found ? 'trouvée' : debrief && clue.hidden ? 'non trouvée : cachée par la difficulté' : 'non trouvée'}
          </span>
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
