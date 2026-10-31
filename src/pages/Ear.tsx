import { useEffect, useMemo, useRef, useState } from 'react'
import { PageHead, ProgressBar, Seg } from '../components/ui'
import { GHOSTS } from '../data'
import { createFootsteps, speedToBpm, type Footsteps } from '../engine/audio'
import { num } from '../engine/format'
import { createRng, pick, shuffle, type Rng } from '../engine/random'
import { useStore } from '../store/store'

type Mode = 'class' | 'exact'

interface Round {
  speed: number
  choices: number[]
}

const ROUNDS = 10
const BASE = 1.7

function classOf(v: number): 'slow' | 'normal' | 'fast' {
  if (v < BASE - 0.05) return 'slow'
  if (v > BASE + 0.05) return 'fast'
  return 'normal'
}

const CLASS_LABEL = { slow: 'Plus lente que la normale', normal: 'Normale (1,7 m/s)', fast: 'Plus rapide que la normale' }

/** Toutes les vitesses distinctes présentes dans les fiches. */
function allSpeeds(): number[] {
  const set = new Set<number>()
  for (const g of GHOSTS) {
    for (const v of [g.speed.min, g.speed.max, g.speed.alt]) if (v != null && v > 0.3) set.add(Math.round(v * 100) / 100)
  }
  set.add(BASE)
  return [...set].sort((a, b) => a - b)
}

function ghostsAt(v: number): string[] {
  return GHOSTS.filter((g) =>
    [g.speed.min, g.speed.max, g.speed.alt].some((s) => s != null && Math.abs(s - v) < 0.01) ||
    (g.speed.isRange && g.speed.max != null && v >= g.speed.min && v <= g.speed.max),
  ).map((g) => g.name)
}

function makeRounds(mode: Mode, rng: Rng): Round[] {
  const speeds = allSpeeds()
  return Array.from({ length: ROUNDS }, () => {
    const speed = pick(rng, speeds)
    if (mode === 'class') return { speed, choices: [] }
    const others = shuffle(
      rng,
      speeds.filter((s) => Math.abs(s - speed) >= 0.2),
    ).slice(0, 3)
    return { speed, choices: shuffle(rng, [speed, ...others]).sort((a, b) => a - b) }
  })
}

export function Ear() {
  const { dispatch } = useStore()
  const [mode, setMode] = useState<Mode>('class')
  const [rounds, setRounds] = useState<Round[] | null>(null)
  const [i, setI] = useState(0)
  const [answer, setAnswer] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [playing, setPlaying] = useState<'q' | 'ref' | null>(null)
  const steps = useRef<Footsteps | null>(null)
  const speeds = useMemo(allSpeeds, [])

  useEffect(() => {
    steps.current = createFootsteps(() => setPlaying(null))
    return () => steps.current?.stop()
  }, [])

  const round = rounds?.[i]

  const play = (v: number, which: 'q' | 'ref') => {
    if (playing === which) {
      steps.current?.stop()
      return
    }
    steps.current?.play(v, 6)
    setPlaying(which)
  }

  const start = () => {
    setRounds(makeRounds(mode, createRng(Date.now() >>> 0)))
    setI(0)
    setScore(0)
    setAnswer(null)
  }

  const correctKey = round ? (mode === 'class' ? classOf(round.speed) : String(round.speed)) : ''

  const choose = (key: string) => {
    if (!round || answer) return
    setAnswer(key)
    steps.current?.stop()
    if (key === correctKey) setScore((s) => s + 1)
  }

  const next = () => {
    if (!rounds) return
    if (i + 1 >= rounds.length) {
      dispatch({ type: 'activity', activity: { t: Date.now(), kind: 'ear', score, total: rounds.length, label: 'À l’oreille' } })
      setI(rounds.length)
      return
    }
    setI(i + 1)
    setAnswer(null)
  }

  if (!rounds) {
    return (
      <div className="page narrow">
        <PageHead title="À l’oreille">
          En chasse, le rythme des pas trahit la vitesse de l’entité. Écoute, compare à la vitesse normale (1,7 m/s), et entraîne
          ton oreille à reconnaître les entités lentes et rapides.
        </PageHead>
        <div className="stack" style={{ '--gap': '24px' } as React.CSSProperties}>
          <div className="field">
            <span className="field-label">Exercice</span>
            <Seg
              label="Exercice"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'class', label: 'Lente, normale ou rapide' },
                { value: 'exact', label: 'Vitesse exacte' },
              ]}
            />
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={() => play(BASE, 'ref')} aria-pressed={playing === 'ref'}>
              {playing === 'ref' ? 'Arrêter' : 'Écouter la référence (1,7 m/s)'}
            </button>
            <span className="faint small">environ {Math.round(speedToBpm(BASE))} pas par minute</span>
          </div>
          <p className="faint small">
            Vitesses présentes dans les fiches : {speeds.map((s) => num(s)).join(' · ')} m/s. Les pas sont générés par l’app, pas
            enregistrés dans le jeu : la cadence est fidèle, le son est simplifié. Un casque aide beaucoup.
          </p>
          <div>
            <button type="button" className="btn btn-primary btn-lg" onClick={start}>
              Commencer ({ROUNDS} écoutes)
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!round) {
    return (
      <div className="page narrow">
        <PageHead title={`${score} sur ${rounds.length}`}>
          {score >= 8 ? 'Belle oreille. Essaie la vitesse exacte.' : 'L’oreille se travaille : refais une série demain.'}
        </PageHead>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={start}>
            Nouvelle série
          </button>
          <button type="button" className="btn" onClick={() => setRounds(null)}>
            Changer d’exercice
          </button>
        </div>
      </div>
    )
  }

  const options =
    mode === 'class'
      ? (['slow', 'normal', 'fast'] as const).map((k) => ({ key: k, label: CLASS_LABEL[k] }))
      : round.choices.map((c) => ({ key: String(c), label: `${num(c)} m/s` }))

  return (
    <div className="page narrow">
      <div className="session-bar">
        <button type="button" className="link-btn muted-link small" onClick={() => setRounds(null)}>
          Quitter
        </button>
        <ProgressBar value={i / rounds.length} label="Progression" />
        <span className="pct">
          {i + 1} / {rounds.length}
        </span>
      </div>
      <article className="flashcard ear">
        <h2 className="flash-front">Quelle vitesse entends-tu ?</h2>
        <div className="row">
          <button type="button" className={`btn btn-lg${playing === 'q' ? '' : ' btn-primary'}`} onClick={() => play(round.speed, 'q')}>
            {playing === 'q' ? 'Arrêter' : 'Écouter les pas'}
          </button>
          <button type="button" className="btn btn-lg" onClick={() => play(BASE, 'ref')}>
            {playing === 'ref' ? 'Arrêter' : 'Référence 1,7 m/s'}
          </button>
        </div>
        <div className="choices">
          {options.map((o, k) => {
            const state = answer ? (o.key === correctKey ? 'right' : o.key === answer ? 'wrong' : 'idle') : ''
            return (
              <button key={o.key} type="button" className={`choice ${state}`} disabled={!!answer} onClick={() => choose(o.key)}>
                <span className="choice-key">{'ABCD'[k]}</span>
                <span className="choice-label">{o.label}</span>
              </button>
            )
          })}
        </div>
        {answer && (
          <div className={`feedback ${answer === correctKey ? 'ok' : 'ko'}`}>
            <p className="feedback-title">
              {answer === correctKey ? 'Exact.' : 'Raté.'} {num(round.speed)} m/s, soit {Math.round(speedToBpm(round.speed))} pas par
              minute.
            </p>
            <p>Entités concernées : {ghostsAt(round.speed).join(', ') || 'vitesse de référence'}.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-primary" onClick={next} autoFocus>
                {i + 1 >= rounds.length ? 'Voir le résultat' : 'Suivante'}
              </button>
            </div>
          </div>
        )}
      </article>
    </div>
  )
}
