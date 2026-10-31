import { EVIDENCE, EVIDENCE_IDS } from '../data/evidence'
import type { EvidenceId, Ghost, Mechanics } from '../data/types'
import { de, le } from './cards'
import { filterGhosts, EMPTY_FILTER } from './filter'
import { fr, NBSP, NNBSP, redactGhostName } from './format'
import { pick, sample, shuffle, weightedPick, type Rng } from './random'

export type QuizTopic = 'evidence' | 'speed' | 'sanity' | 'behavior' | 'zero' | 'expert' | 'mechanics'

export const QUIZ_TOPICS: { id: QuizTopic; label: string; description: string }[] = [
  { id: 'evidence', label: 'Preuves', description: 'Les 3 preuves, les combinaisons, les preuves forcées' },
  { id: 'speed', label: 'Vitesse et ligne de vue', description: 'Vitesses de chasse et accélération en ligne de vue' },
  { id: 'sanity', label: 'Seuils de chasse', description: 'À quelle santé mentale chaque entité peut chasser' },
  { id: 'behavior', label: 'Comportements', description: 'Reconnaître une entité à ses signes' },
  { id: 'zero', label: 'Tests 0 preuve', description: 'Confirmer ou éliminer sans preuve' },
  { id: 'expert', label: 'Questions expertes', description: 'Questions rédigées pour chaque entité' },
  { id: 'mechanics', label: 'Mécaniques et idées reçues', description: 'Vrai ou faux sur les mécaniques du jeu' },
]

export interface Choice {
  id: string
  label: string
  evidence?: EvidenceId
}

export interface Question {
  id: string
  topic: QuizTopic
  ghostId?: string
  prompt: string
  quote?: string
  /** preuves affichées sous la question */
  evidenceShown?: EvidenceId[]
  multi: boolean
  choices: Choice[]
  correct: string[]
  explain: string
  cardId?: string
}

export interface QuizOptions {
  topics: QuizTopic[]
  ghosts: Ghost[]
  allGhosts: Ghost[]
  mechanics: Mechanics
  count: number
  rng: Rng
  /** maîtrise 0..1 par entité : les entités faibles sortent plus souvent */
  mastery?: Record<string, number>
}

type Gen = (g: Ghost, ctx: QuizOptions) => Question | null

const known = (g: Ghost) => g.speed.min >= 0
const evLabel = (e: EvidenceId) => EVIDENCE[e].label

function ghostChoice(g: Ghost): Choice {
  return { id: g.id, label: g.name !== g.nameEn ? `${g.name} (${g.nameEn})` : g.name }
}

/** Distracteurs proches : partagent des preuves avec l'entité cible. */
function similarGhosts(g: Ghost, pool: Ghost[], n: number, rng: Rng, behaviour = false): Ghost[] {
  // le Mimic copie les comportements : il ne peut pas servir de mauvaise réponse à une question de comportement
  const others = pool.filter((o) => o.id !== g.id && !(behaviour && o.id === 'the-mimic'))
  const shared = (o: Ghost) => o.evidence.filter((e) => g.evidence.includes(e)).length
  const ranked = shuffle(rng, others).sort((a, b) => shared(b) - shared(a))
  const close = ranked.slice(0, Math.min(others.length, n + 3))
  return sample(rng, close, n)
}

const evidenceOfGhost: Gen = (g) => ({
  id: `q:ev:${g.id}`,
  topic: 'evidence',
  ghostId: g.id,
  prompt: `Sélectionne les 3 preuves ${de(g.name)}.`,
  multi: true,
  choices: EVIDENCE_IDS.map((e) => ({ id: e, label: evLabel(e), evidence: e })),
  correct: [...g.evidence],
  explain:
    `${g.name}${NNBSP}: ${g.evidence.map(evLabel).join(', ')}.` +
    (g.forcedEvidence ? ` Preuve forcée${NNBSP}: ${evLabel(g.forcedEvidence)}.` : '') +
    (g.fakeEvidence ? ` Attention${NNBSP}: ${evLabel(g.fakeEvidence)} en plus, mais c’est une fausse preuve (hors des 3).` : ''),
  cardId: `g:${g.id}:ev`,
})

const ghostFromEvidence: Gen = (g, ctx) => {
  const others = similarGhosts(g, ctx.allGhosts, 3, ctx.rng).filter(
    (o) => o.evidence.slice().sort().join() !== g.evidence.slice().sort().join(),
  )
  if (others.length < 3) return null
  return {
    id: `q:fromev:${g.id}`,
    topic: 'evidence',
    ghostId: g.id,
    prompt: 'Quelle entité laisse exactement ces 3 preuves ?',
    evidenceShown: [...g.evidence],
    multi: false,
    choices: shuffle(ctx.rng, [g, ...others]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.evidence.map(evLabel).join(' + ')} = ${g.name}. ${g.summary}`,
    cardId: `g:${g.id}:ev`,
  }
}

const forcedEvidence: Gen = (g, ctx) => {
  if (!g.forcedEvidence) return null
  const forced = g.forcedEvidence
  const wrong = sample(ctx.rng, g.evidence.filter((e) => e !== forced), 2)
  const extra = pick(ctx.rng, EVIDENCE_IDS.filter((e) => !g.evidence.includes(e)))
  return {
    id: `q:forced:${g.id}`,
    topic: 'evidence',
    ghostId: g.id,
    prompt: `En difficulté Cauchemar (2 preuves), quelle preuve est toujours présente avec ${le(g.name)}${NNBSP}?`,
    multi: false,
    choices: shuffle(ctx.rng, [forced, ...wrong, extra]).map((e) => ({ id: e, label: evLabel(e), evidence: e })),
    correct: [forced],
    explain: `${g.name} a une preuve forcée${NNBSP}: ${evLabel(forced)}. Elle reste visible en Cauchemar et en Démence.`,
    cardId: `g:${g.id}:forced`,
  }
}

const remainingCandidates: Gen = (g, ctx) => {
  const two = sample(ctx.rng, g.evidence.filter((e) => e !== g.fakeEvidence), 2)
  const state = { ...EMPTY_FILTER, evidenceCount: 3 as const, evidence: Object.fromEntries(two.map((e) => [e, 'found'])) }
  const correct = filterGhosts(ctx.allGhosts, state)
  if (correct.length < 2 || correct.length > 4) return null
  const wrongPool = ctx.allGhosts.filter((o) => !correct.includes(o))
  const wrong = similarGhosts(g, wrongPool, Math.min(6 - correct.length + 1, 4), ctx.rng)
  return {
    id: `q:remain:${two.slice().sort().join('-')}`,
    topic: 'evidence',
    ghostId: g.id,
    prompt: 'En Professionnel (3 preuves), tu as trouvé ces 2 preuves. Quelles entités restent possibles ?',
    evidenceShown: two,
    multi: true,
    choices: shuffle(ctx.rng, [...correct, ...wrong]).map(ghostChoice),
    correct: correct.map((c) => c.id),
    explain: `Restent possibles${NNBSP}: ${correct.map((c) => c.name).join(', ')}.`,
  }
}

function distinctBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((i) => {
    const k = key(i)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const sanityOfGhost: Gen = (g, ctx) => {
  if (g.huntSanity.normal < 0) return null
  const others = distinctBy(
    shuffle(ctx.rng, ctx.allGhosts.filter((o) => o.huntSanity.normal >= 0 && o.huntSanity.summary !== g.huntSanity.summary)),
    (o) => o.huntSanity.summary,
  ).filter((o) => o.huntSanity.normal !== g.huntSanity.normal || o.huntSanity.high !== g.huntSanity.high)
  if (others.length < 3) return null
  const wrong = others.slice(0, 3)
  return {
    id: `q:san:${g.id}`,
    topic: 'sanity',
    ghostId: g.id,
    prompt: `Quel est le seuil de chasse ${de(g.name)}${NNBSP}?`,
    multi: false,
    choices: shuffle(ctx.rng, [
      { id: g.id, label: g.huntSanity.summary },
      ...wrong.map((o) => ({ id: o.id, label: o.huntSanity.summary })),
    ]),
    correct: [g.id],
    explain: [g.huntSanity.summary, ...g.huntSanity.details.slice(0, 2)].join(' — '),
    cardId: `g:${g.id}:san`,
  }
}

const earlyHunter: Gen = (g, ctx) => {
  if (g.huntSanity.high <= 50) return null
  const late = shuffle(ctx.rng, ctx.allGhosts.filter((o) => o.huntSanity.normal >= 0 && o.huntSanity.high <= 50))
  if (late.length < 3) return null
  return {
    id: `q:early:${g.id}`,
    topic: 'sanity',
    ghostId: g.id,
    prompt: 'La santé mentale moyenne est encore au-dessus de 50 % et une chasse démarre. Laquelle de ces entités peut en être responsable ?',
    multi: false,
    choices: shuffle(ctx.rng, [g, ...late.slice(0, 3)]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${g.huntSanity.summary}. Les autres ne peuvent pas chasser au-dessus de 50${NBSP}% (hors effets d’objets maudits).`,
    cardId: `g:${g.id}:san`,
  }
}

const speedOfGhost: Gen = (g, ctx) => {
  if (!known(g)) return null
  const others = distinctBy(
    shuffle(ctx.rng, ctx.allGhosts.filter((o) => known(o) && o.speed.summary !== g.speed.summary)),
    (o) => o.speed.summary,
  )
  if (others.length < 3) return null
  return {
    id: `q:spd:${g.id}`,
    topic: 'speed',
    ghostId: g.id,
    prompt: `Quelle description correspond à la vitesse de chasse ${de(g.name)}${NNBSP}?`,
    multi: false,
    choices: shuffle(ctx.rng, [
      { id: g.id, label: g.speed.summary },
      ...others.slice(0, 3).map((o) => ({ id: o.id, label: o.speed.summary })),
    ]),
    correct: [g.id],
    explain: [g.speed.summary, ...g.speed.details.slice(0, 2)].join(' — '),
    cardId: `g:${g.id}:spd`,
  }
}

const losOfGhost: Gen = (g) => {
  if (!known(g) || g.id === 'the-mimic') return null
  return {
    id: `q:los:${g.id}`,
    topic: 'speed',
    ghostId: g.id,
    prompt: `${g.name}${NNBSP}: pendant une chasse, l’accélération standard en ligne de vue s’applique-t-elle${NNBSP}?`,
    multi: false,
    choices: [
      { id: 'yes', label: 'Oui, accélération en ligne de vue' },
      { id: 'no', label: 'Non, pas d’accélération standard' },
    ],
    correct: [g.speed.los ? 'yes' : 'no'],
    explain: `${g.speed.summary}. ${g.speed.details[0] ?? ''}`.trim(),
    cardId: `g:${g.id}:spd`,
  }
}

const whichGhostTell: Gen = (g, ctx) => {
  // les signes clés résument parfois des propriétés partagées (« vitesse standard ») : on n'utilise ici
  // que les signes « 0 preuve » de tybayn, propres à l'entité
  const tells = g.tells.filter((t) => t.zeroEvidence).map((t) => t.text)
  if (!tells.length) return null
  const k = Math.floor(ctx.rng() * tells.length)
  const tell = tells[k]
  const others = similarGhosts(g, ctx.allGhosts, 3, ctx.rng, true)
  return {
    id: `q:tell:${g.id}:${k}`,
    topic: 'behavior',
    ghostId: g.id,
    prompt: 'Quelle entité correspond à ce signe ?',
    quote: redactGhostName(tell, g),
    multi: false,
    choices: shuffle(ctx.rng, [g, ...others]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${g.summary}`,
    cardId: k < 2 ? `g:${g.id}:rev:${k}` : `g:${g.id}:tells`,
  }
}

const observationQuestion: Gen = (g, ctx) => {
  // seules les observations décisives garantissent une réponse unique
  const obs = g.observations.filter((o) => o.strength === 'definitive')
  if (!obs.length) return null
  const k = Math.floor(ctx.rng() * obs.length)
  const others = similarGhosts(g, ctx.allGhosts, 3, ctx.rng, true)
  return {
    id: `q:obs:${g.id}:${k}`,
    topic: 'behavior',
    ghostId: g.id,
    prompt: 'Sur le terrain, tu observes ceci. De quelle entité s’agit-il ?',
    quote: redactGhostName(obs[k].text, g),
    multi: false,
    choices: shuffle(ctx.rng, [g, ...others]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${g.summary}`,
    cardId: `g:${g.id}:tells`,
  }
}

const zeroTest: Gen = (g, ctx) => {
  const tests = g.confirmationTests.filter((t) => t.definitive)
  if (!tests.length) return null
  const k = Math.floor(ctx.rng() * tests.length)
  const t = tests[k]
  const others = shuffle(
    ctx.rng,
    ctx.allGhosts.filter((o) => o.id !== g.id && o.id !== 'the-mimic' && o.confirmationTests.some((x) => x.definitive)),
  ).slice(0, 3)
  if (others.length < 3) return null
  return {
    id: `q:zero:${g.id}:${k}`,
    topic: 'zero',
    ghostId: g.id,
    prompt: 'Ce test, s’il réussit, confirme quelle entité ?',
    quote: redactGhostName(t.text, g),
    multi: false,
    choices: shuffle(ctx.rng, [g, ...others]).map(ghostChoice),
    correct: [g.id],
    explain: `Test de confirmation ${de(g.name)}. ${g.summary}`,
    cardId: k < 2 ? `g:${g.id}:test:${k}` : `g:${g.id}:tells`,
  }
}

const authored = (g: Ghost, ctx: QuizOptions): Question | null => {
  const valid = g.quiz.filter((q) => q.choices.length >= 2 && q.answer >= 0 && q.answer < q.choices.length)
  if (!valid.length) return null
  const q = pick(ctx.rng, valid)
  const choices = q.choices.map((label, i) => ({ id: String(i), label }))
  return {
    id: `q:auth:${g.id}:${g.quiz.indexOf(q)}`,
    topic: 'expert',
    ghostId: g.id,
    prompt: q.q,
    multi: false,
    choices: shuffle(ctx.rng, choices),
    correct: [String(q.answer)],
    explain: q.explain,
  }
}

const GENERATORS: Record<Exclude<QuizTopic, 'mechanics'>, Gen[]> = {
  evidence: [evidenceOfGhost, ghostFromEvidence, ghostFromEvidence, forcedEvidence, remainingCandidates],
  speed: [speedOfGhost, losOfGhost],
  sanity: [sanityOfGhost, earlyHunter],
  behavior: [whichGhostTell, observationQuestion],
  zero: [zeroTest],
  expert: [authored],
}

function trueFalseQuestions(m: Mechanics, rng: Rng): Question[] {
  return shuffle(rng, m.trueFalse).map((tf) => ({
    id: `q:tf:${tf.id}`,
    topic: 'mechanics' as const,
    prompt: 'Vrai ou faux ?',
    quote: tf.claim,
    multi: false,
    choices: [
      { id: 'true', label: 'Vrai' },
      { id: 'false', label: 'Faux' },
    ],
    correct: [tf.answer ? 'true' : 'false'],
    explain: tf.explain,
  }))
}

/** Construit une série de questions variées, en privilégiant les entités les moins maîtrisées. */
export function buildQuiz(opts: QuizOptions): Question[] {
  const { rng, topics, count } = opts
  const out: Question[] = []
  const seen = new Set<string>()
  const tf = topics.includes('mechanics') ? trueFalseQuestions(opts.mechanics, rng) : []
  const ghostTopics = topics.filter((t): t is Exclude<QuizTopic, 'mechanics'> => t !== 'mechanics')
  const weight = (g: Ghost) => 1.25 - (opts.mastery?.[g.id] ?? 0)
  let attempts = 0
  let topicIdx = Math.floor(rng() * Math.max(1, topics.length))

  while (out.length < count && attempts < count * 40) {
    attempts++
    const topic = topics[topicIdx % topics.length]
    topicIdx++
    let q: Question | null = null
    if (topic === 'mechanics') {
      q = tf.find((t) => !seen.has(t.id)) ?? null
    } else if (ghostTopics.length && opts.ghosts.length) {
      const g = weightedPick(rng, opts.ghosts, weight)
      const gen = pick(rng, GENERATORS[topic])
      q = gen(g, opts)
    }
    if (!q || seen.has(q.id)) continue
    seen.add(q.id)
    // typographie française sur ce que l'app compose (les textes des fiches le sont déjà au chargement)
    out.push({ ...q, prompt: fr(q.prompt), explain: fr(q.explain) })
  }
  return out
}

export function isCorrect(q: Question, selected: string[]): boolean {
  if (selected.length !== q.correct.length) return false
  return q.correct.every((c) => selected.includes(c))
}
