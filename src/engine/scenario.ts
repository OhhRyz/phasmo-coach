import { EVIDENCE, EVIDENCE_IDS } from '../data/evidence'
import type { EvidenceId, Ghost, Observation, ObservationStrength } from '../data/types'
import { EMPTY_FILTER, filterGhosts, type FilterState } from './filter'
import { fr, num, redactGhostName } from './format'
import { pick, randInt, shuffle, weightedPick, type Rng } from './random'

export type Difficulty = 'pro' | 'nightmare' | 'insanity' | 'apocalypse'

export const DIFFICULTIES: { id: Difficulty; label: string; count: 0 | 1 | 2 | 3; description: string }[] = [
  { id: 'pro', label: 'Professionnel', count: 3, description: '3 preuves visibles' },
  { id: 'nightmare', label: 'Cauchemar', count: 2, description: '2 preuves, 1 cachée' },
  { id: 'insanity', label: 'Démence', count: 1, description: '1 seule preuve' },
  { id: 'apocalypse', label: '0 preuve', count: 0, description: 'aucune preuve, comportements uniquement' },
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
  /** preuve absente parce que cachée par la difficulté (l'entité l'a pourtant) */
  hidden?: boolean
  /** observation faite pendant une chasse */
  hunt?: boolean
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

const MAPS: { map: string; rooms: string[] }[] = [
  { map: 'une petite maison de banlieue', rooms: ['la chambre principale', 'la cuisine', 'le garage', 'le sous-sol', 'le salon', 'la chambre d’enfant', 'la salle de bain'] },
  { map: 'une ferme isolée', rooms: ['la cuisine', 'le grenier', 'la chambre principale', 'le salon', 'la buanderie', 'le sous-sol'] },
  { map: 'une grande maison de ville', rooms: ['le bureau', 'la salle à manger', 'la chambre d’enfant', 'le couloir de l’étage', 'le salon', 'la cuisine'] },
  { map: 'un camping au bord du lac', rooms: ['la grande tente', 'le bloc sanitaire', 'la cabane', 'la tente du fond'] },
  { map: 'une école désaffectée', rooms: ['une salle de classe', 'le gymnase', 'la bibliothèque', 'le bureau du directeur', 'la cafétéria'] },
  { map: 'une prison', rooms: ['une cellule du bloc B', 'le réfectoire', 'l’infirmerie', 'la salle des visites', 'la laverie'] },
  { map: 'un asile abandonné', rooms: ['une chambre de patient', 'la salle de soins', 'le réfectoire', 'la chapelle'] },
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

export function clock(minutes: number): string {
  const total = Math.max(0, Math.round(minutes * 60))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Preuves forcées des autres entités : leur absence élimine beaucoup de monde. */
const FORCED_BY_OTHERS = (g: Ghost, ghosts: Ghost[]) =>
  new Set(ghosts.filter((o) => o.id !== g.id && o.forcedEvidence).map((o) => o.forcedEvidence!))

/**
 * Sélection des observations : quand il y a peu de preuves, on garantit des indices forts
 * (sinon l'enquête est injouable) ; le reste est tiré au hasard.
 */
export function pickObservations(g: Ghost, visible: EvidenceId[], count: number, rng: Rng): Observation[] {
  const pool = g.observations.filter((o) => !o.requires || visible.includes(o.requires))
  const want = count === 0 ? 6 : count === 1 ? 5 : count === 2 ? 4 : 3
  const minDefinitive = count <= 1 ? 1 : 0
  const minStrong = count === 0 ? 3 : count === 1 ? 2 : count === 2 ? 1 : 0
  const defs = shuffle(rng, pool.filter((o) => o.strength === 'definitive'))
  const strongs = shuffle(rng, pool.filter((o) => o.strength === 'strong'))
  const picked: Observation[] = defs.slice(0, minDefinitive)
  for (const o of [...strongs, ...defs.slice(minDefinitive)]) {
    if (picked.length >= minStrong) break
    picked.push(o)
  }
  for (const o of shuffle(rng, pool)) {
    if (picked.length >= want) break
    if (!picked.includes(o)) picked.push(o)
  }
  return picked
}

const mentionsSanity = (o: Observation) => /\d+\s?%/.test(o.text)
const mentionsSpeed = (o: Observation) => /m\/s/.test(o.text)

type Draft = Omit<Clue, 'id' | 'time'>

export function generateScenario(g: Ghost, difficulty: Difficulty, rng: Rng, ghosts: Ghost[] = [g]): Scenario {
  const count = evidenceCountOf(difficulty)
  const visible = pickVisibleEvidence(g, count, rng)
  const { map, rooms } = pick(rng, MAPS)
  const room = pick(rng, rooms)

  /* ---- preuves trouvées ---- */
  const evidenceClues: Draft[] = visible.map((e) => ({ kind: 'evidence', evidence: e, text: fr(EVIDENCE[e].found) }))
  if (g.fakeEvidence) evidenceClues.push({ kind: 'evidence', evidence: g.fakeEvidence, text: fr(EVIDENCE[g.fakeEvidence].found) })

  /* ---- preuves absentes : vraies, et choisies pour être utiles ---- */
  const absent = EVIDENCE_IDS.filter((e) => !visible.includes(e) && e !== g.fakeEvidence)
  const forcedOthers = FORCED_BY_OTHERS(g, ghosts)
  const negatives: Draft[] = []
  const nNeg = count === 0 ? (absent.includes('orbs') ? 1 : 0) : count === 3 ? 2 : 1
  const negPool = [...absent]
  for (let i = 0; i < nNeg && negPool.length; i++) {
    const e =
      count === 0
        ? 'orbs' // en 0 preuve, l'absence d'orbes est le seul contrôle utile : elle écarte le Mimic
        : weightedPick(rng, negPool, (x) => (x === 'orbs' && g.id !== 'the-mimic' ? 3 : forcedOthers.has(x) ? 2 : 1))
    negPool.splice(negPool.indexOf(e), 1)
    negatives.push({ kind: 'no-evidence', evidence: e, text: fr(EVIDENCE[e].notFound), hidden: g.evidence.includes(e) })
  }

  /* ---- observations ---- */
  const observations = pickObservations(g, visible, count, rng)
  const asClue = (o: Observation): Draft => ({ kind: 'observation', text: fr(redactGhostName(o.text, g)), strength: o.strength, hunt: o.kind === 'hunt' })
  const huntObs = observations.filter((o) => o.kind === 'hunt')
  const otherObs = observations.filter((o) => o.kind !== 'hunt')

  /* ---- première chasse et vitesse ---- */
  const threshold = g.huntSanity.normal >= 0 ? g.huntSanity.normal : g.huntSanity.high
  let firstHunt: Draft | null = null
  if (threshold >= 0 && !observations.some(mentionsSanity)) {
    const v = Math.max(5, threshold - randInt(rng, 0, 6))
    firstHunt =
      g.id === 'banshee'
        ? {
            kind: 'hunt-sanity',
            text: `Première chasse : ta santé mentale à toi est vers ${v} %, alors que la moyenne de l’équipe est encore autour de ${randInt(rng, 62, 80)} %. Tu sembles être la cible.`,
          }
        : {
            kind: 'hunt-sanity',
            text: `Première chasse : la santé mentale moyenne de l’équipe était d’environ ${v} % quand les lumières ont commencé à clignoter.`,
          }
  }

  let speedClue: Draft | null = null
  const s = g.speed
  if (s.min > 0 && !observations.some(mentionsSpeed)) {
    const special = s.isRange || s.max != null || s.alt != null
    if (!special) {
      const los = s.los
        ? 'Elle accélère progressivement tant qu’elle t’a en ligne de vue.'
        : 'Même quand elle t’a en ligne de vue, elle ne semble pas accélérer comme d’habitude.'
      speedClue = { kind: 'hunt-speed', speed: s.min, text: `Pendant la chasse, tu entends ses pas : environ ${num(s.min)} m/s au départ. ${los}` }
    } else {
      // vitesse variable : une valeur réellement possible, sans affirmer de condition
      const options = [s.min, s.max, s.alt].filter((v): v is number => v != null && v > 0)
      const v = s.isRange && s.max != null ? Math.round((s.min + rng() * (s.max - s.min)) * 10) / 10 : pick(rng, options)
      speedClue = { kind: 'hunt-speed', speed: v, text: `À un moment de la chasse, tu entends ses pas : environ ${num(v)} m/s.` }
    }
  }

  /* ---- mise en scène ---- */
  // Avant la première chasse : preuves, absences et comportements, du plus vague au plus parlant (avec du hasard).
  const rank = (c: Draft) =>
    (c.kind === 'evidence' ? 0.4 : c.kind === 'no-evidence' ? 0.5 : c.strength === 'definitive' ? 1.7 : c.strength === 'strong' ? 1.1 : 0.2) + rng() * 1.4
  const calm = [...evidenceClues, ...negatives, ...otherObs.map(asClue)]
    .map((c) => ({ c, r: rank(c) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.c)

  // La chasse : le premier indice de chasse ouvre la série (seuil d'abord), puis le reste.
  const huntClues: Draft[] = []
  const sanityObs = huntObs.find(mentionsSanity)
  if (firstHunt) huntClues.push(firstHunt)
  else if (sanityObs) huntClues.push(asClue(sanityObs))
  huntClues.push(...shuffle(rng, [...huntObs.filter((o) => o !== sanityObs).map(asClue), ...(speedClue ? [speedClue] : [])]))

  // Une entité qui chasse tôt chasse vite dans la partie.
  const huntAt = threshold >= 70 ? 2 + rng() * 1.5 : threshold >= 60 ? 4 + rng() * 2 : 7.5 + rng() * 3
  const before = Math.max(1, Math.round(calm.length * (threshold >= 70 ? 0.3 : threshold >= 60 ? 0.45 : 0.6)))
  const ordered = [...calm.slice(0, before), ...huntClues, ...calm.slice(before)]

  const context: Draft = {
    kind: 'context',
    text:
      count === 0
        ? `Contrat : ${map}. Partie à 0 preuve. La pièce favorite semble être ${room}.`
        : `Contrat : ${map}. Difficulté ${DIFFICULTIES.find((d) => d.id === difficulty)!.label} (${count} preuve${count > 1 ? 's' : ''}). La pièce favorite semble être ${room}.`,
  }

  // Horodatage : les indices calmes s'étalent jusqu'à la première chasse, la suite s'enchaîne.
  const times: number[] = []
  const firstHuntIdx = huntClues.length ? before : -1
  let t = 0
  ordered.forEach((_, i) => {
    if (firstHuntIdx >= 0 && i < firstHuntIdx) t = ((i + 1) / (firstHuntIdx + 1)) * huntAt * (0.85 + rng() * 0.1)
    else if (i === firstHuntIdx) t = Math.max(t + 0.5, huntAt)
    else t += 1 + rng() * 2
    times.push(t)
  })

  return {
    ghostId: g.id,
    difficulty,
    evidenceCount: count,
    visibleEvidence: visible,
    room,
    map,
    clues: [
      { ...context, id: 'c0', time: clock(0) },
      ...ordered.map((c, i) => ({ ...c, id: `c${i + 1}`, time: clock(times[i]) })),
    ],
  }
}

/**
 * Nombre d'entités encore possibles d'après les seules preuves annoncées jusqu'à chaque indice
 * (pour le débriefing).
 */
export function candidatesAfterEachClue(s: Scenario, ghosts: Ghost[]): number[] {
  const state: FilterState = { ...EMPTY_FILTER, evidenceCount: s.evidenceCount, evidence: {} }
  return s.clues.map((c) => {
    if (c.evidence && c.kind === 'evidence') state.evidence = { ...state.evidence, [c.evidence]: 'found' }
    if (c.evidence && c.kind === 'no-evidence') state.evidence = { ...state.evidence, [c.evidence]: 'excluded' }
    return filterGhosts(ghosts, state).length
  })
}

export const WRONG_GUESS_PENALTY = 400

/** Score : trouver tôt rapporte, mais une erreur coûte cher (parier ne doit pas être rentable). */
export function scoreScenario(revealed: number, total: number, wrongGuesses: number, solved: boolean): number {
  if (!solved) return 0
  const unused = Math.max(0, total - revealed)
  const base = 300 + Math.round((700 * unused) / Math.max(1, total - 1))
  return Math.max(50, base - wrongGuesses * WRONG_GUESS_PENALTY)
}
