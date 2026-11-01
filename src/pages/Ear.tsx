import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Consigne,
  EndActions,
  FileHead,
  H,
  Notebook,
  Page,
  PaperButton,
  RoughCircle,
  Stamp,
  Tape,
  TapeButton,
  TypedLink,
} from '../components/journal/Journal'
import { roughEllipse, roughLine, roughRng } from '../components/journal/rough'
import { Modal, ProgressBar, Seg } from '../components/ui'
import { GHOSTS } from '../data'
import { createFootsteps, speedToBpm, type Footsteps } from '../engine/audio'
import { platform } from '../engine/device'
import { NBSP, NNBSP, fr, num } from '../engine/format'
import { ignoreKey } from '../engine/keys'
import { createRng, pick, shuffle, type Rng } from '../engine/random'
import { useStore } from '../store/store'

type Style = CSSProperties & Record<`--${string}`, string | number>

type Mode = 'class' | 'exact'

interface Round {
  speed: number
  choices: number[]
}

/** Une écoute de la série, pour le relevé de fin. */
interface Heard {
  speed: number
  answer: string
  ok: boolean
}

const ROUNDS = 10
const BASE = 1.7

function classOf(v: number): 'slow' | 'normal' | 'fast' {
  if (v < BASE - 0.05) return 'slow'
  if (v > BASE + 0.05) return 'fast'
  return 'normal'
}

const CLASS_LABEL = { slow: 'Plus lente que la normale', normal: `Normale (1,7${NBSP}m/s)`, fast: 'Plus rapide que la normale' }
const MODE_LABEL: Record<Mode, string> = { class: 'Lente, normale ou rapide', exact: 'Vitesse exacte' }
/** CLASS_LABEL découpé pour l'affichage : le mot entouré, puis sa précision tapée. */
const CLASS_SPLIT = { slow: ['Plus lente', 'que la normale'], normal: ['Normale', `1,7${NBSP}m/s`], fast: ['Plus rapide', 'que la normale'] } as const
/** Les allures, en un mot (relevé de fin). */
const CLASS_WORD = { slow: 'lente', normal: 'normale', fast: 'rapide' } as const
const CLASS_PLURAL = { slow: 'Plus lentes', normal: `Normales (1,7${NBSP}m/s)`, fast: 'Plus rapides' } as const
const ms = (v: number) => `${num(v)}${NBSP}m/s`
const IOS_HINT = `Pas de son${NNBSP}? Vérifie que le bouton silencieux est désactivé.`

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

/* ------------------------------------------------------------------ la bande de papier */

const PRINTS = 14
/** Empreinte de semelle, pointe vers la droite (repère 44 × 20). */
const SOLE = 'M15.5 5.2 C22 2.4 33.5 1.8 39.6 5.2 C44 7.8 43.6 12.9 39.2 15.3 C33.2 18.4 23 17.7 16.4 14.6 C13.2 13 12.8 7 15.5 5.2 Z'
const HEEL = 'M1.8 10.2 C1.8 6.6 4.4 4.8 7.4 4.8 C10.6 4.8 12.6 7 12.6 10.2 C12.6 13.4 10.4 15.4 7.3 15.4 C4.2 15.4 1.8 13.6 1.8 10.2 Z'

type StripState = 'idle' | 'run' | 'paused'

/** Bande de papier sur laquelle les pas s'impriment à la cadence entendue. */
function FootprintStrip({ speed, status, runId, caption }: { speed: number | null; status: StripState; runId: number; caption: ReactNode }) {
  const step = 60 / speedToBpm(speed ?? BASE)
  return (
    <figure className="ear-bench">
      <figcaption className="ear-cap">
        <span>Relevé des pas</span>
        <span className={`ear-status${status === 'run' ? ' is-on' : ''}`}>{caption}</span>
      </figcaption>
      <div className="ear-strip-wrap" aria-hidden>
        <Tape style={{ left: -26, top: -6, transform: 'rotate(-38deg)' }} />
        <Tape style={{ right: -26, bottom: -6, transform: 'rotate(-34deg)' }} />
        <div className={`ear-strip is-${status}`} style={{ '--step': `${step.toFixed(3)}s` } as Style}>
        <span className="ear-strip-line" />
        <div className="ear-prints" key={runId}>
          {Array.from({ length: PRINTS }, (_, k) => (
            <span key={k} className="ear-print" style={{ '--k': k } as Style}>
              <svg viewBox="0 0 44 20">
                <g className="out">
                  <path d={SOLE} />
                  <path d={HEEL} />
                </g>
                <g className="ink">
                  <path d={SOLE} />
                  <path d={HEEL} />
                </g>
              </svg>
            </span>
          ))}
        </div>
        </div>
      </div>
    </figure>
  )
}

/* ------------------------------------------------------------------ la règle en m/s */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Écarte les étiquettes trop proches les unes des autres (gauche → droite). */
function spread(xs: number[], gap: number): number[] {
  const out = [...xs]
  for (let k = 1; k < out.length; k++) if (out[k] - out[k - 1] < gap) out[k] = out[k - 1] + gap
  return out
}

interface RulerProps {
  max: number
  /** vitesses des fiches (points au crayon) */
  dots?: number[]
  /** propositions de l'exercice « vitesse exacte » */
  cands?: { v: number; letter: string }[]
  /** lettre choisie (crayon) */
  picked?: string | null
  /** flèches « plus lente / plus rapide » (exercice par classes) */
  zones?: boolean
  /** la vraie vitesse, au stylo rouge, une fois la réponse donnée */
  truth?: number | null
  label: string
}

function SpeedRuler({ max, dots, cands, picked, zones, truth, label }: RulerProps) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const H0 = 44 // bord haut de la règle
  const H1 = 90 // bord bas
  const L = 22
  const R = 44
  const x = (v: number) => L + (Math.max(0, Math.min(max, v)) / max) * (w - L - R)
  const xr = x(BASE)
  const ticks = Array.from({ length: max * 10 + 1 }, (_, i) => i / 10)
  const r = roughRng('ruler' + (truth ?? '') + (picked ?? ''))
  const truthSide = truth == null ? 0 : truth > BASE + 0.01 ? 1 : truth < BASE - 0.01 ? -1 : 0

  let arc = ''
  let head = ''
  if (truth != null && truthSide !== 0) {
    const xt = x(truth)
    const d = Math.abs(xt - xr)
    const peak = H0 - 8 - Math.min(16, d * 0.18)
    arc = `M${xr} ${H0 - 4} C ${xr + truthSide * d * 0.25} ${peak}, ${xt - truthSide * d * 0.3} ${peak}, ${xt - truthSide * 5} ${H0 - 9}`
    head = `M${xt - truthSide * 13} ${H0 - 12} L${xt - truthSide * 4.5} ${H0 - 8.5} L${xt - truthSide * 9} ${H0 - 18}`
  }
  const candX = cands ? spread(cands.map((c) => x(c.v)), 26) : []

  return (
    <div className="ear-ruler" ref={ref}>
      {w > 0 && (
        /* remonté à chaque largeur : un tracé « dessiné » garde sinon l'échelle de son premier rendu */
        <svg key={w} width={w} height="132" viewBox={`0 0 ${w} 132`} role="img" aria-label={label}>
          <defs>
            <filter id="ear-ruler-shadow" x="-2%" y="-20%" width="104%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity=".22" />
            </filter>
          </defs>
          {/* la règle */}
          <rect className="ear-ruler-band" filter="url(#ear-ruler-shadow)" x="2" y={H0} width={w - 4} height={H1 - H0} rx="3" />
          <path className="ear-ruler-edge" d={`M4 ${H0 + 1.5} H${w - 4}`} />
          <path
            className="ear-ruler-ticks"
            d={ticks.map((t) => `M${x(t)} ${H0}v${Math.round(t * 10) % 10 === 0 ? 17 : Math.round(t * 10) % 5 === 0 ? 11 : 6}`).join('')}
          />
          {Array.from({ length: max + 1 }, (_, v) => (
            <text key={v} className="ear-ruler-n" x={x(v)} y={H0 + 34} textAnchor="middle">
              {v}
            </text>
          ))}
          <text className="ear-ruler-unit" x={w - 10} y={H0 + 34} textAnchor="end">
            m/s
          </text>

          {/* la référence */}
          <path className="ear-ruler-ref" d={`M${xr} ${H0 - 2} V${H0 + 21} M${xr} ${H0 + 40} V${H1}`} />
          <text className="ear-ruler-refn" x={xr} y={H0 + 34} textAnchor="middle">
            1,7
          </text>
          {!(truth != null && truthSide === 0) && (
            <text
              className="ear-pencil"
              x={truthSide > 0 ? xr - 7 : truthSide < 0 ? xr + 7 : xr}
              y={H0 - 8}
              textAnchor={truthSide > 0 ? 'end' : truthSide < 0 ? 'start' : 'middle'}
            >
              référence
            </text>
          )}

          {/* vitesses des fiches */}
          {dots?.map((v) => <circle key={v} className="ear-dot" cx={x(v)} cy={H1 + 9} r="3" />)}

          {/* plus lente / plus rapide */}
          {zones && (
            <g className="ear-zones draw">
              <path d={roughLine(xr - 14, H1 + 14, Math.max(L + 6, xr - 110), H1 + 15, r, 1)} pathLength={1} />
              <path d={`M${Math.max(L + 6, xr - 110) + 7} ${H1 + 9} L${Math.max(L + 6, xr - 110)} ${H1 + 15} L${Math.max(L + 6, xr - 110) + 7} ${H1 + 21}`} pathLength={1} />
              <path d={roughLine(xr + 14, H1 + 14, Math.min(w - R, xr + 110), H1 + 13, r, 1)} pathLength={1} />
              <path d={`M${Math.min(w - R, xr + 110) - 7} ${H1 + 7} L${Math.min(w - R, xr + 110)} ${H1 + 13} L${Math.min(w - R, xr + 110) - 7} ${H1 + 19}`} pathLength={1} />
              <text className="ear-pencil" x={Math.max(L + 2, xr - 112)} y={H1 + 38} textAnchor="start">
                plus lente
              </text>
              <text className="ear-pencil" x={Math.min(w - R + 4, xr + 112)} y={H1 + 38} textAnchor="end">
                plus rapide
              </text>
            </g>
          )}

          {/* propositions A, B, C, D */}
          {cands?.map((c, k) => (
            <g key={c.letter} className={`ear-cand${picked === c.letter ? ' is-picked' : ''}`}>
              <path d={`M${x(c.v)} ${H1} V${H1 + 9} L${candX[k]} ${H1 + 17}`} />
              <text x={candX[k]} y={H1 + 33} textAnchor="middle">
                {c.letter}
              </text>
              {picked === c.letter && (
                <g className="draw ear-cand-ring">
                  <path d={roughEllipse(18, 18, roughRng('pick' + c.letter), 0.1, 0.1)} transform={`translate(${candX[k] - 9} ${H1 + 18})`} pathLength={1} />
                </g>
              )}
            </g>
          ))}

          {/* la vraie vitesse, au stylo rouge */}
          {truth != null && (
            <g className="ear-truth draw">
              {arc && <path d={arc} pathLength={1} style={{ '--d': '.35s' } as Style} />}
              {head && <path d={head} pathLength={1} style={{ '--d': '.85s', '--dur': '.25s' } as Style} />}
              <path d={roughEllipse(14, 14, roughRng('truth' + truth), 0.1, 0.1)} transform={`translate(${x(truth) - 7} ${H0 - 7})`} pathLength={1} style={{ '--d': '.1s', '--dur': '.5s' } as Style} />
              <path className="ear-truth-line" d={`M${x(truth)} ${H0} V${H0 + 21} M${x(truth)} ${H0 + 40} V${H1}`} />
              <text className="ear-truth-t" x={Math.max(60, Math.min(w - 60, x(truth)))} y="18" textAnchor="middle">
                {ms(truth)}
                {truthSide === 0 ? `${NNBSP}: la référence` : ''}
              </text>
            </g>
          )}
        </svg>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ boutons */

export function Ear() {
  const { dispatch } = useStore()
  const [mode, setMode] = useState<Mode>('class')
  const [rounds, setRounds] = useState<Round[] | null>(null)
  const [i, setI] = useState(0)
  const [answer, setAnswer] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [playing, setPlaying] = useState<'q' | 'ref' | null>(null)
  /** réécoute depuis le relevé de fin : la vitesse en cours */
  const [again, setAgain] = useState<number | null>(null)
  const [heard, setHeard] = useState<Heard[]>([])
  /** l'écoute en cours a été jouée au moins une fois : on peut répondre */
  const [listened, setListened] = useState(false)
  const [quitOpen, setQuitOpen] = useState(false)
  /** la référence a été écoutée sur la page d'accueil de l'exercice */
  const [refHeard, setRefHeard] = useState(false)
  const steps = useRef<Footsteps | null>(null)
  const ios = useMemo(() => platform() === 'ios', [])
  const speeds = useMemo(allSpeeds, [])
  /** dernière écoute imprimée sur la bande (affichage seulement) */
  const [trail, setTrail] = useState<{ v: number; which: 'q' | 'ref'; id: number; at: number } | null>(null)

  useEffect(() => {
    steps.current = createFootsteps(() => {
      setPlaying(null)
      setAgain(null)
    })
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

  const start = (m: Mode = mode) => {
    steps.current?.stop()
    setMode(m)
    setTrail(null)
    setRounds(makeRounds(m, createRng(Date.now() >>> 0)))
    setI(0)
    setScore(0)
    setAnswer(null)
    setListened(false)
    setHeard([])
    setQuitOpen(false)
  }

  const quit = () => {
    steps.current?.stop()
    setQuitOpen(false)
    setRounds(null)
    setHeard([])
  }

  const correctKey = round ? (mode === 'class' ? classOf(round.speed) : String(round.speed)) : ''

  const choose = (key: string) => {
    if (!round || answer || !listened) return
    setAnswer(key)
    steps.current?.stop()
    if (key === correctKey) setScore((s) => s + 1)
    setHeard((h) => [...h, { speed: round.speed, answer: key, ok: key === correctKey }])
  }

  const next = () => {
    if (!rounds) return
    // la réécoute de l'écoute précédente ne doit pas déborder sur la suivante
    steps.current?.stop()
    if (i + 1 >= rounds.length) {
      dispatch({ type: 'activity', activity: { t: Date.now(), kind: 'ear', score, total: rounds.length, label: 'À l’oreille' } })
      setI(rounds.length)
      return
    }
    setI(i + 1)
    setAnswer(null)
    setListened(false)
  }

  /* affichage : la bande garde l'empreinte de la dernière écoute de cet écran */
  const screen = rounds ? i : -1
  const listen = (v: number, which: 'q' | 'ref') => {
    if (playing !== which) setTrail({ v, which, id: Date.now(), at: screen })
    if (which === 'q') setListened(true)
    else if (!rounds) setRefHeard(true)
    play(v, which)
  }
  const shown = trail && trail.at === screen ? trail : null

  /* clavier : A–D ou 1–4 entourent une réponse, Entrée passe à la suivante (comme au quiz) */
  useEffect(() => {
    if (!round) return
    const keys = mode === 'class' ? ['slow', 'normal', 'fast'] : round.choices.map(String)
    const onKey = (e: KeyboardEvent) => {
      if (quitOpen) return
      if (ignoreKey(e, (el) => e.key !== 'Enter' && !!el.closest('.ear'))) return
      if (e.key === 'Enter') {
        if (!answer) return
        e.preventDefault()
        next()
        return
      }
      if (answer || !listened) return
      const k = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : /^[a-z]$/i.test(e.key) ? e.key.toLowerCase().charCodeAt(0) - 97 : -1
      const key = keys[k]
      if (key == null) return
      e.preventDefault()
      choose(key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const stripStatus: StripState = !shown ? 'idle' : playing === shown.which ? 'run' : 'paused'
  const max = Math.max(...speeds) > 3.05 ? 4 : 3

  if (!rounds) {
    const refBpm = Math.round(speedToBpm(BASE))
    return (
      <div className="ear">
        <Notebook single>
          <Page section="4" label="À l’oreille">
            <FileHead>
              <Link to="/entrainement">‹ Exercices</Link>
              <span>À l’oreille</span>
              <span>
                Série de <b>{ROUNDS}</b> écoutes
              </span>
            </FileHead>

            <header className="ear-entry">
              <h1 className="entry-date ear-title">
                <em>À l’oreille</em>
                Le rythme des pas
              </h1>
              <p className="ear-lead">
                En chasse, le rythme des pas trahit la vitesse de l’entité. Écoute, compare à la vitesse normale (1,7{NBSP}m/s),
                et entraîne ton oreille à reconnaître les entités lentes et rapides.
              </p>
            </header>

            <section className="ear-step" aria-labelledby="h-ear-ref">
              <h2 className="typed-label ear-step-h" id="h-ear-ref">
                <span className="ear-step-n">1</span> Écoute la référence ({ms(BASE)}), pour t’étalonner
              </h2>
              <FootprintStrip
                speed={shown?.v ?? null}
                status={stripStatus}
                runId={shown?.id ?? 0}
                caption={stripStatus === 'run' ? 'à l’écoute…' : shown ? `${ms(BASE)} · référence` : 'en attente'}
              />
              <SpeedRuler max={max} dots={speeds} label={fr(`Règle de 0 à ${max} m/s : référence à 1,7 m/s, ${speeds.length} vitesses relevées dans les fiches`)} />
              <p className="ear-legend">
                Points au crayon{NNBSP}: les vitesses présentes dans les fiches, {speeds.map((s) => num(s)).join(' · ')}
                {NBSP}m/s.
              </p>
              <div className="ear-listen">
                <PaperButton onClick={() => listen(BASE, 'ref')} pressed={playing === 'ref'}>
                  {playing === 'ref' ? 'Arrêter' : `Écouter la référence (${ms(BASE)})`}
                </PaperButton>
                <span className="pencil-note ear-bpm">environ {refBpm} pas par minute</span>
              </div>
              {refHeard && <p className="pencil-note ear-then">puis l’étape 2, juste en dessous ↓</p>}
              {ios && <p className="pencil-note ear-ios">{IOS_HINT}</p>}
            </section>

            <section className="ear-step ear-step--go" aria-labelledby="h-ear-mode">
              <h2 className="typed-label ear-step-h" id="h-ear-mode">
                <span className="ear-step-n">2</span> Choisis l’exercice, puis commence
              </h2>
              <Seg
                label="Exercice"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'class', label: 'Lente, normale ou rapide' },
                  { value: 'exact', label: 'Vitesse exacte' },
                ]}
              />
              <p className="ear-mode-hint">
                {mode === 'class'
                  ? fr('3 réponses possibles : plus lente que la référence, normale, ou plus rapide.')
                  : fr('4 vitesses possibles, placées sur la règle : retrouve la bonne au rythme des pas.')}
              </p>
              <div className="ear-go">
                <TapeButton onClick={() => start()}>Commencer ({ROUNDS} écoutes)</TapeButton>
                {!refHeard && <p className="pencil-note ear-first">conseil{NNBSP}: écoute d’abord la référence ↑</p>}
              </div>
            </section>

            <p className="ear-small">
              Les pas sont générés par l’app, pas enregistrés dans le jeu{NNBSP}: la cadence est fidèle, le son est simplifié.{' '}
              <span className="pencil-note">Un casque aide beaucoup.</span>
            </p>
          </Page>
        </Notebook>
      </div>
    )
  }

  if (!round) {
    const good = score >= 8
    const misses = heard.filter((h) => !h.ok)
    // les vitesses ratées, à réécouter (la référence a déjà son bouton)
    const missed = [...new Set(misses.map((h) => h.speed))].filter((v) => Math.abs(v - BASE) > 0.001).sort((a, b) => a - b)
    const byClass = (['slow', 'normal', 'fast'] as const)
      .map((c) => {
        const list = heard.filter((h) => classOf(h.speed) === c)
        return { c, total: list.length, ok: list.filter((h) => h.ok).length }
      })
      .filter((x) => x.total > 0)
    const answerText = (key: string) => (mode === 'class' ? CLASS_WORD[key as keyof typeof CLASS_WORD] ?? key : ms(Number(key)))
    const replay = (v: number) => {
      if (again === v) {
        steps.current?.stop()
        return
      }
      steps.current?.play(v, 6)
      setAgain(v)
    }
    const leave = (fn: () => void) => () => {
      steps.current?.stop()
      fn()
    }
    return (
      <div className="ear">
        <Notebook className="ear-results">
          <Page side="left" section="4" label="Résultat de la série">
            <FileHead>
              <span>À l’oreille · série terminée</span>
              <span>{MODE_LABEL[mode]}</span>
            </FileHead>
            <div className="ear-result">
              <div className="ear-grade" aria-label={`Note${NNBSP}: ${score} sur ${rounds.length}`}>
                <RoughCircle seed={`ear-grade-${score}`} padX={0.12} padY={0.14} width={2.4} delay={0.5}>
                  <span className="ear-grade-n hand">
                    {score}
                    <small>/{rounds.length}</small>
                  </span>
                </RoughCircle>
              </div>
              <div>
                <h1 className="entry-date ear-title">
                  <em>À l’oreille</em>
                  Série terminée
                </h1>
                <p className="ear-result-line">
                  {score === 0 ? 'Aucune bonne réponse' : `${score} bonne${score > 1 ? 's' : ''} réponse${score > 1 ? 's' : ''}`} sur {rounds.length}{' '}
                  écoutes.
                </p>
                <p className="ear-verdict pencil-note">
                  {good ? (mode === 'class' ? 'Belle oreille. Essaie la vitesse exacte.' : 'Belle oreille.') : fr('L’oreille se travaille : refais une série demain.')}
                </p>
              </div>
            </div>

            {byClass.length > 0 && (
              <table className="ear-by">
                <caption className="typed-label">Par allure</caption>
                <tbody>
                  {byClass.map(({ c, total, ok }) => (
                    <tr key={c}>
                      <th scope="row">{CLASS_PLURAL[c]}</th>
                      <td className={ok < total ? 'is-short' : undefined}>
                        {ok}/{total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <EndActions className="ear-end-actions">
              <TapeButton onClick={leave(() => start())}>Recommencer une série</TapeButton>
              <TypedLink onClick={leave(() => setRounds(null))}>Changer les réglages</TypedLink>
              <TypedLink to="/entrainement">Retour aux exercices</TypedLink>
              {good && mode === 'class' ? (
                <TypedLink onClick={leave(() => start('exact'))}>Passer à la vitesse exacte →</TypedLink>
              ) : (
                <TypedLink to="/quiz?topic=speed">Faire un quiz sur les vitesses →</TypedLink>
              )}
            </EndActions>
          </Page>

          <Page side="right" section="4" label="Relevé des écoutes">
            <FileHead>
              <span>Relevé</span>
              <span>
                {misses.length === 0 ? (
                  'aucune erreur'
                ) : (
                  <>
                    <b>{misses.length}</b> erreur{misses.length > 1 ? 's' : ''} sur {heard.length}
                  </>
                )}
              </span>
            </FileHead>
            <section aria-labelledby="h-ear-log">
              <H id="h-ear-log" count={misses.length ? `${misses.length} ratée${misses.length > 1 ? 's' : ''}` : 'sans faute'}>
                Relevé des écoutes
              </H>
              <div className="libcard ear-log settle" style={{ '--r': '-0.6deg', '--d': '.3s' } as Style}>
                <Tape />
                <table>
                  <caption className="sr-only">Chaque écoute de la série{NNBSP}: la vitesse jouée, ta réponse, la correction</caption>
                  <thead>
                    <tr>
                      <th scope="col">N°</th>
                      <th scope="col">Jouée</th>
                      <th scope="col">Ta réponse</th>
                      <th scope="col">
                        <span className="sr-only">Correction</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {heard.map((h, k) => (
                      <tr key={k} className={h.ok ? undefined : 'is-miss'}>
                        <td className="ear-log-n">{k + 1}</td>
                        <td className="ear-log-v">{ms(h.speed)}</td>
                        <td className="ear-log-a">
                          {h.ok ? (
                            answerText(h.answer)
                          ) : (
                            <>
                              <s>{answerText(h.answer)}</s>
                              {mode === 'class' && (
                                <span className="ear-log-fix hand">
                                  <span className="sr-only">, il fallait{NNBSP}: </span>
                                  {CLASS_WORD[classOf(h.speed)]}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="ear-log-mark">
                          {h.ok ? (
                            <>
                              <svg className="draw ear-tick" viewBox="0 0 24 20" aria-hidden>
                                <path d="M3 11 L9 17 L21 3" pathLength={1} strokeWidth={2.4} style={{ '--d': `${0.4 + k * 0.06}s`, '--dur': '.3s' } as Style} />
                              </svg>
                              <span className="sr-only">juste</span>
                            </>
                          ) : (
                            <span className="hand ear-log-miss">raté</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {misses.length > 0 && (
              <section className="ear-again" aria-labelledby="h-ear-again">
                <h2 className="typed-label" id="h-ear-again">
                  À réécouter
                </h2>
                <div className="ear-listen">
                  {missed.map((v) => (
                    <PaperButton key={v} onClick={() => replay(v)} pressed={again === v}>
                      {again === v ? 'Arrêter' : ms(v)}
                    </PaperButton>
                  ))}
                  <PaperButton onClick={() => replay(BASE)} pressed={again === BASE} rotate={-0.8}>
                    {again === BASE ? 'Arrêter' : `Référence ${ms(BASE)}`}
                  </PaperButton>
                </div>
              </section>
            )}
          </Page>
        </Notebook>
      </div>
    )
  }

  const options =
    mode === 'class'
      ? (['slow', 'normal', 'fast'] as const).map((k) => ({ key: k, label: CLASS_LABEL[k] }))
      : round.choices.map((c) => ({ key: String(c), label: ms(c) }))

  const ok = answer === correctKey
  const pickedLetter = answer && mode === 'exact' ? 'ABCD'[options.findIndex((o) => o.key === answer)] : null
  const names = answer ? ghostsAt(round.speed) : []
  const statusText =
    stripStatus === 'run'
      ? shown?.which === 'ref'
        ? 'référence · à l’écoute…'
        : 'à l’écoute…'
      : shown
        ? shown.which === 'ref'
          ? `référence ${ms(BASE)}`
          : `écoute n°${NBSP}${i + 1}`
        : 'en attente'

  return (
    <div className="ear ear--run">
      <Notebook single>
        <Page section="4" label={`Écoute ${i + 1} sur ${rounds.length}`}>
          <FileHead>
            <button type="button" className="link-btn ear-quit" onClick={() => (heard.length ? setQuitOpen(true) : quit())}>
              ‹ Quitter la série
            </button>
            <span>À l’oreille · {MODE_LABEL[mode]}</span>
            <span>
              Écoute n°{NBSP}
              <b>{i + 1}</b> / {rounds.length}
            </span>
          </FileHead>
          <div className="ear-progress">
            <span className="typed-label">Série</span>
            <ProgressBar value={i / rounds.length} label="Progression" />
            <span className="ear-progress-n">
              {i} / {rounds.length}
            </span>
          </div>

          <H as="h1" count={mode === 'class' ? '3 réponses possibles' : '4 vitesses possibles'}>
            Quelle vitesse entends-tu{NNBSP}?
          </H>
          <Consigne className="ear-consigne">
            1. écoute les pas · 2. compare avec la référence si besoin · 3. entoure ta réponse.
          </Consigne>

          <FootprintStrip speed={shown?.v ?? null} status={stripStatus} runId={shown?.id ?? 0} caption={statusText} />
          <SpeedRuler
            max={max}
            zones={mode === 'class'}
            cands={mode === 'exact' ? round.choices.map((c, k) => ({ v: c, letter: 'ABCD'[k] })) : undefined}
            picked={pickedLetter}
            truth={answer ? round.speed : null}
            label={
              answer
                ? fr(`Règle de 0 à ${max} m/s : la vraie vitesse, ${num(round.speed)} m/s, est marquée en rouge ; la référence est à 1,7 m/s.`)
                : fr(`Règle de 0 à ${max} m/s, référence à 1,7 m/s.`)
            }
          />

          <div className="ear-listen">
            {answer ? (
              <PaperButton onClick={() => listen(round.speed, 'q')} pressed={playing === 'q'}>
                {playing === 'q' ? 'Arrêter' : 'Réécouter les pas'}
              </PaperButton>
            ) : (
              <TapeButton onClick={() => listen(round.speed, 'q')} arrow={false}>
                {playing === 'q' ? 'Arrêter' : 'Écouter les pas'}
              </TapeButton>
            )}
            <PaperButton onClick={() => listen(BASE, 'ref')} pressed={playing === 'ref'} rotate={-0.8}>
              {playing === 'ref' ? 'Arrêter' : `Référence ${ms(BASE)}`}
            </PaperButton>
          </div>
          {ios && i === 0 && !answer && <p className="pencil-note ear-ios">{IOS_HINT}</p>}
          {listened && !answer && <p className="pencil-note ear-then">puis entoure ta réponse ↓</p>}

          <fieldset className={`ear-answer${!listened && !answer ? ' is-locked' : ''}`}>
            <legend className="typed-label">
              {answer ? 'Ta réponse' : 'Entoure ta réponse'}
              {!listened && !answer && <span className="pencil-note ear-first">écoute d’abord les pas ↑</span>}
            </legend>
            <ol className={`ear-choices ear-choices--${mode}`}>
              {options.map((o, k) => {
                const state = answer ? (o.key === correctKey ? 'right' : o.key === answer ? 'wrong' : 'idle') : ''
                return (
                  <li key={o.key}>
                    <button type="button" className={`ear-choice ${state}`} disabled={!!answer || !listened} onClick={() => choose(o.key)}>
                      <span className="ear-letter">{'ABCD'[k]}.</span>
                      <span className="ear-label">
                        {(() => {
                          const main = mode === 'class' ? CLASS_SPLIT[o.key as keyof typeof CLASS_SPLIT][0] : o.label
                          return (
                            <>
                              <span className="ear-main">
                                {state === 'right' ? (
                                  <RoughCircle seed={`ear-${i}-${o.key}`} padX={0.05} padY={0.3} delay={0.15}>
                                    {main}
                                  </RoughCircle>
                                ) : (
                                  main
                                )}
                              </span>
                              {mode === 'class' && <span className="ear-sub"> {CLASS_SPLIT[o.key as keyof typeof CLASS_SPLIT][1]}</span>}
                            </>
                          )
                        })()}
                      </span>
                      {state === 'right' && <span className="sr-only">{NNBSP}: bonne réponse</span>}
                      {state === 'wrong' && <span className="sr-only">{NNBSP}: ton choix, faux</span>}
                    </button>
                  </li>
                )
              })}
            </ol>
          </fieldset>

          <div className="ear-fix" aria-live="polite">
            {answer && (
              <>
                <div className="ear-fix-top">
                  <Stamp thunk tone={ok ? 'ink' : 'red'} rotate={ok ? -5 : -7} delay={0.1}>
                    {ok ? 'Exact' : 'Raté'}
                  </Stamp>
                  <p className="ear-fix-line">
                    <b>{ms(round.speed)}</b>, soit {Math.round(speedToBpm(round.speed))} pas par minute.
                  </p>
                </div>
                <p className="ear-ghosts">
                  <span className="typed-label">Entités concernées</span>
                  <span className="ear-names">{names.join(', ') || 'vitesse de référence'}</span>
                </p>
                <div className="ear-next-row">
                  <TapeButton className="ear-next" onClick={next} autoFocus>
                    {i + 1 >= rounds.length ? 'Voir le résultat' : 'Écoute suivante'}
                  </TapeButton>
                </div>
              </>
            )}
          </div>
        </Page>
      </Notebook>

      <Modal
        open={quitOpen}
        onClose={() => setQuitOpen(false)}
        title="Quitter la série ?"
        actions={
          <>
            <TypedLink onClick={() => setQuitOpen(false)}>Continuer la série</TypedLink>
            <PaperButton onClick={quit}>Quitter</PaperButton>
          </>
        }
      >
        <p className="ear-quit-body">
          {heard.length === 1 ? 'Ta première écoute sera perdue' : `Tes ${heard.length} écoutes seront perdues`}{NNBSP}: la série ne sera pas notée.
        </p>
      </Modal>
    </div>
  )
}
