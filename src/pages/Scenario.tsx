import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { EvidenceTracker } from '../components/EvidenceTracker'
import { Icon, type IconName } from '../components/Icon'
import { GhostEvidence, GhostSigil, Modal, PageHeader, Seg } from '../components/ui'
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

const CLUE_ICON: Record<Clue['kind'], IconName> = {
  context: 'door',
  evidence: 'check',
  'no-evidence': 'minus',
  observation: 'eye',
  'hunt-sanity': 'pulse',
  'hunt-speed': 'footsteps',
}

const STRENGTH_LABEL = { hint: 'Indice', strong: 'Indice fort', definitive: 'Indice décisif' } as const

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
    if (revealed > 1) timelineEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [revealed])

  const ghost: Ghost | undefined = scenario ? getGhost(scenario.ghostId) : undefined

  const start = () => {
    const rng = createRng((Date.now() ^ 0x5bd1e995) >>> 0)
    const sorted = [...GHOSTS].sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0))
    const candidates = pool === 'weak' ? sorted.slice(0, 8) : GHOSTS
    // pour 0 preuve, il faut assez d'observations pour que l'enquête soit jouable
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

  const candidates = useMemo(() => filterGhosts(GHOSTS, filter).filter((g) => !struck.includes(g.id)), [filter, struck])
  const possible = useMemo(() => possibleEvidence(filterGhosts(GHOSTS, filter)), [filter])

  const finish = (result: 'solved' | 'dead', wrongCount: number) => {
    if (!scenario || !ghost) return
    setOutcome(result)
    steps.current?.stop()
    const score = scoreScenario(revealed, scenario.clues.length, wrongCount, result === 'solved')
    dispatch({
      type: 'answers',
      results: [{ key: `ghost:${ghost.id}`, correct: result === 'solved' && wrongCount === 0 }, { key: 'topic:scenario', correct: result === 'solved' }],
      now: Date.now(),
    })
    dispatch({
      type: 'activity',
      activity: { t: Date.now(), kind: 'scenario', score, total: 1000, label: `Enquête · ${ghost.name}`, ghostId: ghost.id },
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
        <PageHeader eyebrow="S’entraîner" title="Mise en situation">
          Une enquête simulée : les indices arrivent au fil du contrat, comme en partie. Note tes preuves, élimine, et désigne
          l’entité avec le moins d’indices possible.
        </PageHeader>
        <section className="card card-pad stack">
          <div className="field">
            <span className="field-label">Difficulté</span>
            <div className="diff-grid">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`diff-btn${difficulty === d.id ? ' on' : ''}`}
                  aria-pressed={difficulty === d.id}
                  onClick={() => setDifficulty(d.id)}
                >
                  <span className="diff-dots" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <i key={i} className={i < d.count ? 'on' : ''} />
                    ))}
                  </span>
                  <strong>{d.label}</strong>
                  <small>{d.description}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Entités tirées au sort</span>
            <Seg
              label="Entités"
              value={pool}
              onChange={setPool}
              options={[
                { value: 'all', label: 'Toutes (les moins maîtrisées plus souvent)' },
                { value: 'weak', label: 'Mes 8 points faibles' },
              ]}
            />
          </div>
          <div className="callout">
            <Icon name="bulb" size={18} />
            <span>
              En Cauchemar et en Démence, une preuve absente ne prouve rien : elle peut être cachée. Les preuves forcées
              (Hantu, Goryo…) restent toujours visibles.
            </span>
          </div>
          <button type="button" className="btn btn-primary btn-lg" onClick={start}>
            <Icon name="search" size={18} />
            Commencer l’enquête
          </button>
        </section>
      </div>
    )
  }

  const shown = scenario.clues.slice(0, revealed)
  const allShown = revealed >= scenario.clues.length
  const score = scoreScenario(revealed, scenario.clues.length, wrong.length, true)
  const diff = DIFFICULTIES.find((d) => d.id === scenario.difficulty)!

  /* ---------- résultat ---------- */
  if (outcome) {
    const finalScore = scoreScenario(revealed, scenario.clues.length, wrong.length, outcome === 'solved')
    return (
      <div className="page narrow">
        <PageHeader eyebrow={`Enquête · ${diff.label}`} title={outcome === 'solved' ? 'Entité identifiée !' : 'Contrat échoué'}>
          {outcome === 'solved'
            ? `Trouvé avec ${revealed} indice${revealed > 1 ? 's' : ''} sur ${scenario.clues.length}${wrong.length ? ` et ${wrong.length} erreur${wrong.length > 1 ? 's' : ''}` : ', sans erreur'}.`
            : `Trop d’erreurs : c’était ${ghost.name}. On en tire une leçon.`}
        </PageHeader>
        <section className="card card-pad stack result-card">
          <div className="row between">
            <div className="row">
              <GhostSigil ghost={ghost} mastery={mastery[ghost.id] ?? 0} size={52} />
              <div>
                <h2 style={{ fontSize: '1.3rem' }}>{ghost.name}</h2>
                <span className="faint">{ghost.summary}</span>
              </div>
            </div>
            <div className="stat" style={{ textAlign: 'right' }}>
              <b className={outcome === 'solved' ? '' : 'faint'}>{finalScore}</b>
              <span>points</span>
            </div>
          </div>
          <GhostEvidence ghost={ghost} />
          {scenario.evidenceCount < 3 && scenario.evidenceCount > 0 && (
            <p className="muted" style={{ fontSize: '0.88rem' }}>
              Preuves visibles pendant ce contrat : {scenario.visibleEvidence.map((e) => EVIDENCE[e].label).join(', ')}.
            </p>
          )}
          {wrong.length > 0 && (
            <p className="muted" style={{ fontSize: '0.88rem' }}>
              Mauvaises pistes : {wrong.map((w) => getGhost(w)?.name).join(', ')}.
            </p>
          )}
        </section>
        <section className="stack" style={{ marginTop: 20 }}>
          <h2>Tous les indices du contrat</h2>
          <ol className="timeline">
            {scenario.clues.map((c, i) => (
              <ClueItem key={c.id} clue={c} dim={i >= revealed} showStrength />
            ))}
          </ol>
        </section>
        <div className="row" style={{ marginTop: 22 }}>
          <button type="button" className="btn btn-primary" onClick={start}>
            <Icon name="refresh" size={18} />
            Nouvelle enquête
          </button>
          <Link to={`/codex/${ghost.id}`} className="btn">
            Fiche {ghost.name}
          </Link>
          <button type="button" className="btn btn-ghost" onClick={() => setScenario(null)}>
            Changer la difficulté
          </button>
        </div>
      </div>
    )
  }

  /* ---------- enquête en cours ---------- */
  return (
    <div className="page">
      <div className="row between" style={{ marginBottom: 18 }}>
        <div>
          <div className="eyebrow">Enquête · {diff.label}</div>
          <h1 style={{ fontSize: '1.6rem' }}>Contrat en cours</h1>
        </div>
        <div className="row">
          <span className="chip mono" title="Score si tu trouves maintenant">
            <Icon name="trophy" size={13} /> {score} pts
          </span>
          <span className="chip" title="Erreurs autorisées">
            <Icon name="heart" size={13} /> {MAX_WRONG + 1 - wrong.length} vie{MAX_WRONG + 1 - wrong.length > 1 ? 's' : ''}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setScenario(null)}>
            Abandonner
          </button>
        </div>
      </div>

      <div className="scenario-layout">
        <section className="card card-pad scenario-log">
          <div className="card-title">
            <h2>
              <Icon name="clock" size={18} />
              Journal du contrat
            </h2>
            <span className="faint mono" style={{ fontSize: '0.8rem' }}>
              {revealed}/{scenario.clues.length}
            </span>
          </div>
          <ol className="timeline">
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
          <div className="row" style={{ marginTop: 14 }}>
            <button type="button" className="btn" disabled={allShown} onClick={() => setRevealed((r) => r + 1)}>
              <Icon name="plus" size={18} />
              {allShown ? 'Plus aucun indice' : 'Indice suivant'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setGuessOpen(true)}>
              <Icon name="ghost" size={18} />
              Désigner l’entité
            </button>
          </div>
        </section>

        <aside className="stack scenario-side">
          <section className="card card-pad stack" style={{ '--gap': '12px' } as CSSProperties}>
            <div className="card-title" style={{ marginBottom: 0 }}>
              <h2>
                <Icon name="notebook" size={18} />
                Mon carnet de preuves
              </h2>
            </div>
            <EvidenceTracker value={filter.evidence} onChange={(evidence) => setFilter({ ...filter, evidence })} possible={possible} />
            <p className="faint" style={{ fontSize: '0.78rem' }}>
              Partie à {scenario.evidenceCount} preuve{scenario.evidenceCount > 1 ? 's' : ''} : le filtre en tient compte.
            </p>
          </section>
          <section className="card card-pad">
            <div className="card-title">
              <h2>
                <Icon name="filter" size={18} />
                Entités possibles
              </h2>
              <span className="badge">{candidates.length}</span>
            </div>
            <ul className="list-plain cand-list">
              {filterGhosts(GHOSTS, filter).map((g) => {
                const isStruck = struck.includes(g.id)
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      className={`cand${isStruck ? ' struck' : ''}${wrong.includes(g.id) ? ' wrong' : ''}`}
                      onClick={() => !wrong.includes(g.id) && setStruck((s) => (isStruck ? s.filter((x) => x !== g.id) : [...s, g.id]))}
                      title={isStruck ? 'Rétablir' : 'Barrer'}
                    >
                      {g.name}
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="faint" style={{ fontSize: '0.78rem', marginTop: 10 }}>
              Touche une entité pour la barrer à la main.
            </p>
          </section>
        </aside>
      </div>

      <Modal
        open={guessOpen}
        onClose={() => setGuessOpen(false)}
        title="Quelle est l’entité ?"
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setGuessOpen(false)}>
              Continuer l’enquête
            </button>
            <button type="button" className="btn btn-primary" disabled={!guess} onClick={submitGuess}>
              Valider
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginBottom: 14 }}>
          {wrong.length > 0 ? `Attention : encore ${MAX_WRONG + 1 - wrong.length} essai${MAX_WRONG + 1 - wrong.length > 1 ? 's' : ''}.` : 'Une erreur coûte des points, trois erreurs et le contrat échoue.'}
        </p>
        <div className="guess-grid">
          {(candidates.length ? candidates : GHOSTS.filter((g) => !wrong.includes(g.id))).map((g) => (
            <button key={g.id} type="button" className={`choice${guess === g.id ? ' sel' : ''}`} onClick={() => setGuess(g.id)}>
              <span className="choice-label">{g.name}</span>
            </button>
          ))}
        </div>
        {candidates.length > 0 && candidates.length < GHOSTS.length && (
          <p className="faint" style={{ fontSize: '0.78rem', marginTop: 10 }}>
            Seules les entités encore possibles d’après ton carnet sont proposées.
          </p>
        )}
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
      <span className="clue-time mono">{clue.time}</span>
      <span className="clue-dot">
        <Icon name={clue.evidence && clue.kind === 'evidence' ? clue.evidence : CLUE_ICON[clue.kind]} size={15} />
      </span>
      <div className="clue-body">
        <p>{clue.text}</p>
        <div className="row" style={{ '--gap': '6px' } as CSSProperties}>
          {ev && (
            <span className={`chip tiny${clue.kind === 'evidence' ? ' chip-ok' : ''}`}>
              {clue.kind === 'evidence' ? 'Preuve trouvée' : 'Pas de preuve'} · {ev.short}
            </span>
          )}
          {clue.strength && showStrength && (
            <span className={`chip tiny${clue.strength === 'definitive' ? ' chip-lantern' : ''}`}>{STRENGTH_LABEL[clue.strength]}</span>
          )}
          {onPlay && (
            <button type="button" className="btn btn-sm" onClick={onPlay}>
              <Icon name={playing ? 'stop' : 'volume'} size={15} />
              {playing ? 'Arrêter' : 'Écouter les pas'}
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
