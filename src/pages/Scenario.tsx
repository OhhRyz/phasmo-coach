import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { EvidenceTracker } from '../components/EvidenceTracker'
import { GhostEvidence, Modal, PageHead, Seg } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import { EVIDENCE } from '../data/evidence'
import type { Ghost } from '../data/types'
import { createFootsteps, type Footsteps } from '../engine/audio'
import { EMPTY_FILTER, filterGhosts, possibleEvidence, type FilterState } from '../engine/filter'
import { createRng, weightedPick } from '../engine/random'
import { DIFFICULTIES, generateScenario, scoreScenario, type Clue, type Difficulty, type Scenario as S } from '../engine/scenario'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'

const MAX_WRONG = 2

const STRENGTH_LABEL = { hint: 'indice', strong: 'indice fort', definitive: 'indice décisif' } as const

export function Scenario() {
  const mastery = useMastery()
  const { dispatch } = useStore()
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
  const steps = useRef<Footsteps | null>(null)
  const timelineEnd = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    steps.current = createFootsteps(() => setPlaying(false))
    return () => steps.current?.stop()
  }, [])

  useEffect(() => {
    if (revealed > 2) timelineEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [revealed])

  const ghost: Ghost | undefined = scenario ? getGhost(scenario.ghostId) : undefined

  const start = () => {
    const rng = createRng((Date.now() ^ 0x5bd1e995) >>> 0)
    const sorted = [...GHOSTS].sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0))
    const candidates = pool === 'weak' ? sorted.slice(0, 8) : GHOSTS
    // en 0 preuve, il faut assez d'observations pour que l'enquête soit jouable
    const playable = difficulty === 'apocalypse' ? candidates.filter((g) => g.observations.length >= 3) : candidates
    const g = weightedPick(rng, playable.length ? playable : candidates, (x) => 1.25 - (mastery[x.id] ?? 0))
    const s = generateScenario(g, difficulty, rng)
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

  /* ---------- configuration ---------- */
  if (!scenario || !ghost) {
    return (
      <div className="page narrow">
        <PageHead title="Mise en situation">
          Une enquête simulée : les indices arrivent au fil du contrat, comme en partie. Note tes preuves, élimine, et désigne
          l’entité avec le moins d’indices possible.
        </PageHead>
        <div className="stack" style={{ '--gap': '26px' } as CSSProperties}>
          <fieldset className="fieldset">
            <legend className="field-label">Difficulté</legend>
            <div className="choice-list">
              {DIFFICULTIES.map((d) => (
                <label key={d.id} className="radio">
                  <input type="radio" name="difficulty" checked={difficulty === d.id} onChange={() => setDifficulty(d.id)} />
                  <span>
                    {d.label}
                    <span className="faint small"> · {d.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <span className="field-label">Entité tirée au sort parmi</span>
            <Seg
              label="Entités"
              value={pool}
              onChange={setPool}
              options={[
                { value: 'all', label: 'Toutes' },
                { value: 'weak', label: 'Mes 8 points faibles' },
              ]}
            />
            <small>Les entités que tu maîtrises le moins sortent plus souvent.</small>
          </div>
          <p className="note accent">
            En Cauchemar et en Démence, une preuve absente ne prouve rien : elle peut être cachée. Les preuves forcées (Hantu,
            Goryo…) restent toujours visibles. En 0 preuve, seuls les orbes du Mimic apparaissent.
          </p>
          <div>
            <button type="button" className="btn btn-primary btn-lg" onClick={start}>
              Commencer l’enquête
            </button>
          </div>
        </div>
      </div>
    )
  }

  const shown = scenario.clues.slice(0, revealed)
  const allShown = revealed >= scenario.clues.length
  const score = scoreScenario(revealed, scenario.clues.length, wrong.length, true)
  const diff = DIFFICULTIES.find((d) => d.id === scenario.difficulty)!
  const lives = MAX_WRONG + 1 - wrong.length

  /* ---------- résultat ---------- */
  if (outcome) {
    const finalScore = scoreScenario(revealed, scenario.clues.length, wrong.length, outcome === 'solved')
    return (
      <div className="page narrow">
        <PageHead title={outcome === 'solved' ? `C’était bien ${ghost.name}.` : `Raté : c’était ${ghost.name}.`}>
          {outcome === 'solved'
            ? `Trouvé avec ${revealed} indice${revealed > 1 ? 's' : ''} sur ${scenario.clues.length}${
                wrong.length ? ` et ${wrong.length} erreur${wrong.length > 1 ? 's' : ''}` : ', sans erreur'
              }. ${finalScore} points.`
            : 'Trois erreurs : le contrat échoue. Relis les indices ci-dessous, la leçon est souvent dedans.'}
        </PageHead>
        <dl className="facts">
          <div>
            <dt>Entité</dt>
            <dd>
              <Link to={`/codex/${ghost.id}`}>{ghost.name}</Link> <span className="faint small">{ghost.summary}</span>
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
              <dt>Visibles ce contrat</dt>
              <dd>{scenario.visibleEvidence.map((e) => EVIDENCE[e].label).join(', ')}</dd>
            </div>
          )}
          {wrong.length > 0 && (
            <div>
              <dt>Mauvaises pistes</dt>
              <dd>{wrong.map((w) => getGhost(w)?.name).join(', ')}</dd>
            </div>
          )}
        </dl>
        <section className="section">
          <h2>Le contrat en entier</h2>
          <ol className="log">
            {scenario.clues.map((c, i) => (
              <ClueItem key={c.id} clue={c} dim={i >= revealed} showStrength />
            ))}
          </ol>
        </section>
        <div className="row" style={{ marginTop: 28 }}>
          <button type="button" className="btn btn-primary" onClick={start}>
            Nouvelle enquête
          </button>
          <button type="button" className="btn" onClick={() => setScenario(null)}>
            Changer la difficulté
          </button>
        </div>
      </div>
    )
  }

  /* ---------- enquête en cours ---------- */
  return (
    <div className="page">
      <header className="page-head scenario-head">
        <p className="faint small">
          Enquête · {diff.label} · {scenario.evidenceCount} preuve{scenario.evidenceCount > 1 ? 's' : ''}
        </p>
        <h1>Contrat en cours</h1>
        <p className="faint small">
          {score} points si tu trouves maintenant · {lives} essai{lives > 1 ? 's' : ''} restant{lives > 1 ? 's' : ''} ·{' '}
          <button type="button" className="link-btn muted-link" onClick={() => setScenario(null)}>
            abandonner
          </button>
        </p>
      </header>

      <div className="scenario-layout">
        <section>
          <h2 className="col-title">Journal</h2>
          <ol className="log">
            {shown.map((c) => (
              <ClueItem
                key={c.id}
                clue={c}
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
            ))}
          </ol>
          <div ref={timelineEnd} />
          <div className="row" style={{ marginTop: 18 }}>
            <button type="button" className="btn" disabled={allShown} onClick={() => setRevealed((r) => r + 1)}>
              {allShown ? 'Plus aucun indice' : 'Indice suivant'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setGuessOpen(true)}>
              Désigner l’entité
            </button>
          </div>
        </section>

        <aside className="scenario-side">
          <h2 className="col-title">Carnet de preuves</h2>
          <EvidenceTracker value={filter.evidence} onChange={(evidence) => setFilter({ ...filter, evidence })} possible={possible} />
          <h2 className="col-title" style={{ marginTop: 26 }}>
            Encore possibles <span className="pct">{candidates.length}</span>
          </h2>
          <ul className="cands">
            {possibleGhosts.map((g) => {
              const isStruck = struck.includes(g.id)
              const isWrong = wrong.includes(g.id)
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    className={`cand${isStruck ? ' struck' : ''}${isWrong ? ' wrong' : ''}`}
                    disabled={isWrong}
                    onClick={() => setStruck((s) => (isStruck ? s.filter((x) => x !== g.id) : [...s, g.id]))}
                    title={isStruck ? 'Rétablir' : 'Barrer'}
                  >
                    {g.name}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="faint small" style={{ marginTop: 8 }}>
            Touche un nom pour le barrer.
          </p>
        </aside>
      </div>

      <Modal
        open={guessOpen}
        onClose={() => setGuessOpen(false)}
        title="Quelle est l’entité ?"
        actions={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setGuessOpen(false)}>
              Continuer l’enquête
            </button>
            <button type="button" className="btn btn-primary" disabled={!guess} onClick={submitGuess}>
              Valider
            </button>
          </>
        }
      >
        <p className="muted small" style={{ marginBottom: 14 }}>
          {wrong.length > 0
            ? `Attention, encore ${lives} essai${lives > 1 ? 's' : ''}.`
            : 'Une erreur coûte des points. Trois erreurs, et le contrat échoue.'}
          {candidates.length > 0 && candidates.length < GHOSTS.length && ' Seules les entités encore possibles d’après ton carnet sont proposées.'}
        </p>
        <div className="guess-grid">
          {(candidates.length ? candidates : GHOSTS.filter((g) => !wrong.includes(g.id))).map((g) => (
            <button key={g.id} type="button" className={`choice${guess === g.id ? ' sel' : ''}`} onClick={() => setGuess(g.id)}>
              <span className="choice-label">{g.name}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}

function ClueItem({
  clue,
  dim,
  onPlay,
  playing,
  showStrength,
}: {
  clue: Clue
  dim?: boolean
  onPlay?: () => void
  playing?: boolean
  showStrength?: boolean
}) {
  const ev = clue.evidence ? EVIDENCE[clue.evidence] : undefined
  return (
    <li className={`clue ${clue.kind}${dim ? ' dim' : ''}`} style={ev ? ({ '--c': ev.color } as CSSProperties) : undefined}>
      <span className="clue-time">{clue.time}</span>
      <div className="clue-body">
        <p>{clue.text}</p>
        {(ev || (clue.strength && showStrength) || onPlay) && (
          <p className="clue-meta">
            {ev && (
              <span className="evi" style={{ '--c': ev.color } as CSSProperties}>
                {clue.kind === 'evidence' ? `preuve trouvée : ${ev.label}` : `non trouvée : ${ev.label}`}
              </span>
            )}
            {clue.strength && showStrength && <span className={`tag${clue.strength === 'definitive' ? ' accent' : ''}`}>{STRENGTH_LABEL[clue.strength]}</span>}
            {onPlay && (
              <button type="button" className="link-btn" onClick={onPlay}>
                {playing ? 'arrêter le son' : 'écouter les pas'}
              </button>
            )}
          </p>
        )}
      </div>
    </li>
  )
}
