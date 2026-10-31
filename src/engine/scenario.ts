import { EVIDENCE, EVIDENCE_IDS } from '../data/evidence'
import type { EvidenceId, Ghost, ObservationStrength } from '../data/types'
import { num, redactGhostName } from './format'
import { pick, randInt, sample, shuffle, type Rng } from './random'

export type Difficulty = 'pro' | 'nightmare' | 'insanity' | 'apocalypse'

export const DIFFICULTIES: { id: Difficulty; label: string; count: 0 | 1 | 2 | 3; description: string }[] = [
  { id: 'pro', label: 'Professionnel', count: 3, description: '3 preuves visibles' },
  { id: 'nightmare', label: 'Cauchemar', count: 2, description: '2 preuves, 1 cachée' },
  { id: 'insanity', label: 'Démence', count: 1, description: '1 seule preuve' },
  { id: 'apocalypse', label: '0 preuve', count: 0, description: 'Aucune preuve : comportements uniquement' },
]

export type ClueKind = 'context' | 'evidence' | 'no-evidence' | 'observation' | 'hunt-sanity' | 'hunt-speed'

export interface Clue {
  id: string
  kind: ClueKind
  time: string
  text: string
  evidence?: EvidenceId
  strength?: ObservationStrength
  /** vitesse à faire écouter (m/s) */
  speed?: number
}

export interface Scenario {
  ghostId: string
  difficulty: Difficulty
  evidenceCount: 0 | 1 | 2 | 3
  visibleEvidence: EvidenceId[]
  room: string
  map: string
  clues: Clue[]
}

const ROOMS = [
  'la chambre principale', 'la cuisine', 'le garage', 'le sous-sol', 'le salon', 'la salle de bain du haut',
  'la chambre d’enfant', 'le grenier', 'la buanderie', 'le bureau', 'la salle à manger', 'le couloir de l’étage',
]
const MAPS = [
  'une petite maison de banlieue', 'une ferme isolée', 'un camping au bord du lac', 'une grande maison de ville',
  'une école désaffectée', 'une prison', 'un asile abandonné', 'un manoir en pleine forêt',
]

export function evidenceCountOf(d: Difficulty): 0 | 1 | 2 | 3 {
  return DIFFICULTIES.find((x) => x.id === d)!.count
}

/** Choisit les preuves visibles en respectant la preuve forcée. */
export function pickVisibleEvidence(g: Ghost, count: number, rng: Rng): EvidenceId[] {
  if (count >= 3) return [...g.evidence]
  if (count === 0) return []
  const forced = g.forcedEvidence && g.evidence.includes(g.forcedEvidence) ? [g.forcedEvidence] : []
  const rest = shuffle(rng, g.evidence.filter((e) => !forced.includes(e)))
  return [...forced, ...rest].slice(0, count)
}

function clock(minutes: number): string {
  const m = Math.floor(minutes)
  const s = Math.round((minutes - m) * 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const STRENGTH_RANK: Record<ObservationStrength, number> = { hint: 0, strong: 1, definitive: 2 }

export function generateScenario(g: Ghost, difficulty: Difficulty, rng: Rng): Scenario {
  const count = evidenceCountOf(difficulty)
  const visible = pickVisibleEvidence(g, count, rng)
  const room = pick(rng, ROOMS)
  const map = pick(rng, MAPS)

  const evidenceClues: Omit<Clue, 'id' | 'time'>[] = visible.map((e) => ({
    kind: 'evidence',
    evidence: e,
    text: EVIDENCE[e].found,
  }))
  if (g.fakeEvidence) {
    evidenceClues.push({ kind: 'evidence', evidence: g.fakeEvidence, text: EVIDENCE[g.fakeEvidence].found })
  }

  // Preuves absentes : vraies (soit l'entité ne les a pas, soit elles sont cachées par la difficulté).
  const absent = EVIDENCE_IDS.filter((e) => !visible.includes(e) && e !== g.fakeEvidence)
  const negatives: Omit<Clue, 'id' | 'time'>[] = sample(rng, absent, count === 0 ? 0 : Math.min(absent.length, count === 3 ? 2 : 1)).map(
    (e) => ({ kind: 'no-evidence', evidence: e, text: EVIDENCE[e].notFound }),
  )

  const observations: Omit<Clue, 'id' | 'time'>[] = shuffle(rng, g.observations)
    .sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength])
    .slice(0, count === 0 ? 6 : count === 3 ? 3 : 4)
    .map((o) => ({ kind: 'observation', text: redactGhostName(o.text, g), strength: o.strength }))

  const hunt: Omit<Clue, 'id' | 'time'>[] = []
  if (g.huntSanity.normal >= 0) {
    const v = Math.max(5, g.huntSanity.normal - randInt(rng, 0, 6))
    hunt.push({
      kind: 'hunt-sanity',
      text: `Première chasse : la santé mentale moyenne de l’équipe était d’environ ${v} % quand les lumières ont commencé à clignoter.`,
    })
  }
  if (g.speed.min >= 0) {
    const v = g.speed.isRange && g.speed.max != null ? round2(g.speed.min + rng() * (g.speed.max - g.speed.min)) : g.speed.min
    const los = g.speed.los
      ? 'Elle accélère progressivement pendant qu’elle te poursuit à vue.'
      : 'Même en te poursuivant à vue, elle ne semble pas accélérer comme d’habitude.'
    hunt.push({
      kind: 'hunt-speed',
      speed: v,
      text: `Pendant la chasse, tu entends ses pas : environ ${num(v)} m/s quand elle ne te voit pas. ${los}`,
    })
  }

  // Mise en scène : preuves et indices faibles d'abord, indices forts ensuite.
  const early = shuffle(rng, [...evidenceClues.slice(0, 2), ...negatives, ...observations.filter((o) => o.strength === 'hint')])
  const middle = shuffle(rng, [...evidenceClues.slice(2), ...hunt, ...observations.filter((o) => o.strength === 'strong')])
  const late = observations.filter((o) => o.strength === 'definitive')

  const context: Omit<Clue, 'id' | 'time'> = {
    kind: 'context',
    text: `Contrat : ${map}. Difficulté ${DIFFICULTIES.find((d) => d.id === difficulty)!.label} (${count} preuve${count > 1 ? 's' : ''}). La pièce favorite semble être ${room}.`,
  }

  let t = 0
  return {
    ghostId: g.id,
    difficulty,
    evidenceCount: count,
    visibleEvidence: visible,
    room,
    map,
    clues: [context, ...early, ...middle, ...late].map((c, i) => {
      if (i > 0) t += 1 + rng() * 2.5
      return { ...c, id: `c${i}`, time: clock(t) }
    }),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Score de l'enquête : moins d'indices et moins d'erreurs = meilleur score. */
export function scoreScenario(revealed: number, total: number, wrongGuesses: number, solved: boolean): number {
  if (!solved) return 0
  const unused = Math.max(0, total - revealed)
  const base = 400 + Math.round((600 * unused) / Math.max(1, total - 1))
  return Math.max(50, base - wrongGuesses * 200)
}
