import type { Ghost, Mechanics } from '../data/types'
import {
  de,
  fitsToo,
  isFeminine,
  le,
  mentionsEvidence,
  MIMIC,
  namesGhost,
  needsEvidence,
  numbersFit,
  reverseTells,
  speedValues,
  standardSanity,
  standardSpeed,
  TESTS_PER_GHOST,
  thresholds,
  withoutEvidenceAsides,
  zeroTests,
} from './cards'
import { fr, NBSP, NNBSP, redactGhostName as redact } from './format'
import { pick, sample, shuffle, weightedPick, type Rng } from './random'

/**
 * Le quiz porte sur ce qui sert quand les preuves manquent : comportements, vitesses, seuils, tests.
 * Les preuves elles-mêmes (lesquelles, forcées, combinaisons) restent dans le codex : le journal du jeu les donne.
 */
export type QuizTopic = 'behavior' | 'speed' | 'sanity' | 'zero' | 'expert' | 'mechanics'

export const QUIZ_TOPICS: { id: QuizTopic; label: string; description: string }[] = [
  { id: 'behavior', label: 'Comportements', description: 'Reconnaître une entité à ses signes et à ses capacités' },
  { id: 'speed', label: 'Vitesse et ligne de vue', description: 'Vitesses de chasse et accélération en ligne de vue' },
  { id: 'sanity', label: 'Seuils de chasse', description: 'À quelle santé mentale chaque entité peut chasser' },
  { id: 'zero', label: 'Tests sans preuve', description: 'Confirmer, éliminer ou départager deux entités' },
  { id: 'expert', label: 'Questions expertes', description: 'Questions rédigées pour chaque entité' },
  { id: 'mechanics', label: 'Mécaniques et idées reçues', description: 'Vrai ou faux sur les mécaniques du jeu' },
]

/** Thèmes cochés à l'ouverture du quiz. */
export const DEFAULT_TOPICS: QuizTopic[] = ['behavior', 'speed', 'sanity', 'zero']

export interface Choice {
  id: string
  label: string
}

export interface Question {
  id: string
  topic: QuizTopic
  ghostId?: string
  prompt: string
  quote?: string
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
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const uncap = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
/** Un corrigé ne commence jamais par « Mais » (reste d'une phrase dont on a retiré le début). */
const noLeadingMais = (s: string) => cap(s.replace(/^Mais\s+/u, ''))

function ghostChoice(g: Ghost): Choice {
  return { id: g.id, label: g.name !== g.nameEn ? `${g.name} (${g.nameEn})` : g.name }
}

/** Le texte nomme-t-il cette entité (y compris entre « ») ? */
const names = namesGhost

/**
 * Une citation prête à poser : caviardée, sans aparté qui passe par une preuve. Null si elle passe
 * encore par une preuve, ou si elle nomme l'entité entre « » (le caviardage n'y touche pas).
 */
function quoteFor(text: string, g: Ghost): string | null {
  const quote = redact(withoutEvidenceAsides(text), g)
  return needsEvidence(quote) || names(quote, g) ? null : quote
}

/** Calculé une fois par entité : les fiches ne changent pas, seul le tirage varie. */
function perGhost<T>(f: (g: Ghost) => T): (g: Ghost) => T {
  const cache = new WeakMap<Ghost, T>()
  return (g) => {
    if (!cache.has(g)) cache.set(g, f(g))
    return cache.get(g)!
  }
}

/**
 * « Elle ne poursuit que sa cible » ne peut pas parler du Démon : le pronom trahirait la mauvaise réponse
 * (ou la bonne). « Il faut », « il y a » ne désignent personne.
 */
function pronounClash(text: string, g: Ghost): boolean {
  const fem = /(?:^|[\s(])[Ee]lles?\b/u.test(text)
  const masc = /(?:^|[\s(])(?:[Ii]ls?|[Ll]ui)\b(?!\s+(?:faut|suffit|y\s+a)\b)/u.test(text)
  return isFeminine(g.name) ? masc && !fem : fem && !masc
}

/**
 * Les mauvaises réponses que le pronom de l'énoncé n'écarte pas d'emblée (« moins elle a de chances » :
 * pas d'entité masculine). Un pronom qui ne colle pas à g lui-même désigne autre chose : on n'en tient pas compte.
 */
function sameGender(statement: string, g: Ghost): (o: Ghost) => boolean {
  if (pronounClash(statement, g)) return () => true
  return (o) => !pronounClash(statement, o)
}

/* ---------- une seule bonne réponse : écarter les mauvaises réponses qui pourraient aussi convenir ---------- */

/**
 * Trois mauvaises réponses plausibles (entités souvent confondues avec g), qui ne collent pas à l'énoncé
 * et dont le genre ne contredit pas un pronom de l'énoncé. Une entité nommée dans l'énoncé (« la Banshee
 * est elle aussi féminine ») n'est jamais une mauvaise réponse.
 */
function pickDistractors(g: Ghost, statement: string, ctx: QuizOptions, n = 3): Ghost[] | null {
  const fits = fitsToo(statement, ctx.allGhosts)
  const gender = sameGender(statement, g)
  const pool = ctx.allGhosts.filter((o) => o.id !== g.id && o.id !== MIMIC && !fits(o) && gender(o) && !names(statement, o))
  if (pool.length < n) return null
  const partners = new Set(g.confusions.map((c) => c.with))
  const shared = (o: Ghost) => o.evidence.filter((e) => g.evidence.includes(e)).length
  const score = (o: Ghost) => (partners.has(o.id) ? 3 : 0) + shared(o)
  const ranked = shuffle(ctx.rng, pool).sort((a, b) => score(b) - score(a))
  return sample(ctx.rng, ranked.slice(0, n + 3), n)
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

const subsetOf = <T,>(a: Set<T>, b: Set<T>) => [...a].every((v) => b.has(v))

/* ---------- seuils de chasse ---------- */

const sanityOfGhost: Gen = (g, ctx) => {
  if (g.huntSanity.normal < 0) return null
  const mine = thresholds(g)
  const others = distinctBy(
    shuffle(
      ctx.rng,
      ctx.allGhosts.filter(
        (o) =>
          o.huntSanity.normal >= 0 &&
          o.huntSanity.summary !== g.huntSanity.summary &&
          // « 50 % » face au Raiju (50 %, 65 % près de l'électronique) : à moitié vrai, pas une mauvaise réponse
          !subsetOf(thresholds(o), mine),
      ),
    ),
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
    prompt: 'La santé mentale moyenne est encore au-dessus de 50 % et une chasse démarre. Laquelle de ces entités peut en être responsable ?',
    multi: false,
    choices: shuffle(ctx.rng, [g, ...late.slice(0, 3)]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${g.huntSanity.summary}. Les autres ne peuvent pas chasser au-dessus de 50${NBSP}% (hors effets d’objets maudits).`,
    cardId: `g:${g.id}:san`,
  }
}

/** Seuil particulier → entité. Les mauvaises réponses n'ont aucun des seuils cités : une seule peut convenir. */
const sanityProfile: Gen = (g, ctx) => {
  if (g.id === MIMIC || standardSanity(g)) return null
  const mine = thresholds(g)
  if (!mine.size) return null
  const quote = redact(g.huntSanity.summary, g)
  if (names(quote, g)) return null
  const gender = sameGender(quote, g)
  const pool = ctx.allGhosts.filter(
    (o) =>
      o.id !== g.id &&
      o.id !== MIMIC &&
      thresholds(o).size > 0 &&
      ![...thresholds(o)].some((v) => mine.has(v)) &&
      // « 65 % si tu bouges près d'elle » : une entité masculine serait écartée d'emblée
      gender(o),
  )
  // d'abord d'autres seuils particuliers (plus trompeurs), puis des entités à 50 %
  const ranked = [...shuffle(ctx.rng, pool.filter((o) => !standardSanity(o))), ...shuffle(ctx.rng, pool.filter(standardSanity))]
  const wrong = ranked.slice(0, 3)
  if (wrong.length < 3) return null
  return {
    id: `q:sanp:${g.id}`,
    topic: 'sanity',
    ghostId: g.id,
    prompt: 'Quelle entité a ce seuil de chasse ?',
    quote,
    multi: false,
    choices: shuffle(ctx.rng, [g, ...wrong]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${[g.huntSanity.summary, ...g.huntSanity.details.slice(0, 1)].join(' — ')}`,
    cardId: `g:${g.id}:san`,
  }
}

/* ---------- vitesses ---------- */

/**
 * La description de vitesse de o est-elle en partie vraie pour g ? Ses vitesses font toutes partie de
 * celles de g (« 1,7 m/s · accélère en LdV » pour le Raiju, qui reste à 1,7 m/s loin de l'électronique),
 * ou tombent dans la plage de g avec la même ligne de vue (le Moroi passe par 1,7 m/s et accélère en LdV).
 */
function partlyTrueSpeed(o: Ghost, g: Ghost): boolean {
  const theirs = speedValues(o)
  if (subsetOf(theirs, speedValues(g))) return true
  const s = g.speed
  return s.isRange && s.max != null && o.speed.los === s.los && [...theirs].every((v) => v >= s.min && v <= s.max!)
}

const speedOfGhost: Gen = (g, ctx) => {
  if (!known(g)) return null
  const others = distinctBy(
    shuffle(ctx.rng, ctx.allGhosts.filter((o) => known(o) && o.speed.summary !== g.speed.summary && !partlyTrueSpeed(o, g))),
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
  // ligne de vue « selon les conditions » (Kormos, Dayan, Raiju…) : ni oui ni non
  if (!known(g) || g.id === MIMIC || g.speed.losVaries) return null
  return {
    id: `q:los:${g.id}`,
    topic: 'speed',
    ghostId: g.id,
    // on demande si l'entité accélère, pas si l'accélération est « standard » (Aswang, Jumeaux : particulière)
    prompt: `${g.name}${NNBSP}: pendant une chasse, l’entité accélère-t-elle quand elle te voit (ligne de vue)${NNBSP}?`,
    multi: false,
    choices: [
      { id: 'yes', label: 'Oui, elle accélère en ligne de vue' },
      { id: 'no', label: 'Non, jamais d’accélération en ligne de vue' },
    ],
    correct: [g.speed.los ? 'yes' : 'no'],
    explain: `${g.speed.summary}. ${g.speed.details[0] ?? ''}`.trim(),
    cardId: `g:${g.id}:spd`,
  }
}

/** Les vitesses citées par une entité, hors 1,7 m/s (la vitesse de tout le monde). */
const speeds = (g: Ghost) => new Set([...speedValues(g)].filter((v) => v !== 1.7))

/** Profil de vitesse particulier → entité. Les mauvaises réponses n'ont aucune des vitesses citées. */
const speedProfile: Gen = (g, ctx) => {
  if (!known(g) || g.id === MIMIC || standardSpeed(g)) return null
  const mine = speeds(g)
  const quote = redact(g.speed.summary, g).replace(/\bLdV\b/g, 'ligne de vue')
  if (names(quote, g)) return null
  const gender = sameGender(quote, g)
  const pool = ctx.allGhosts.filter(
    (o) => o.id !== g.id && o.id !== MIMIC && known(o) && ![...speeds(o)].some((v) => mine.has(v)) && gender(o),
  )
  const ranked = [...shuffle(ctx.rng, pool.filter((o) => !standardSpeed(o))), ...shuffle(ctx.rng, pool.filter(standardSpeed))]
  const wrong = ranked.slice(0, 3)
  if (wrong.length < 3) return null
  return {
    id: `q:spdp:${g.id}`,
    topic: 'speed',
    ghostId: g.id,
    prompt: 'En chasse, quelle entité se déplace ainsi ?',
    quote,
    multi: false,
    choices: shuffle(ctx.rng, [g, ...wrong]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${[g.speed.summary, ...g.speed.details.slice(0, 1)].join(' — ')}`,
    cardId: `g:${g.id}:spd`,
  }
}

/* ---------- comportements ---------- */

// les signes clés résument parfois des propriétés partagées (« vitesse standard ») : on n'utilise ici
// que les signes « 0 preuve » de tybayn, propres à l'entité (k : rang parmi eux)
const tellQuotes = perGhost((g) =>
  g.tells
    .filter((t) => t.zeroEvidence)
    .map((t, k) => ({ quote: quoteFor(t.text, g), k }))
    .filter((t): t is { quote: string; k: number } => t.quote != null),
)

const whichGhostTell: Gen = (g, ctx) => {
  const tells = tellQuotes(g)
  if (!tells.length) return null
  const { quote, k } = pick(ctx.rng, tells)
  const others = pickDistractors(g, quote, ctx)
  if (!others) return null
  return {
    id: `q:tell:${g.id}:${k}`,
    topic: 'behavior',
    ghostId: g.id,
    prompt: 'Quelle entité correspond à ce signe ?',
    quote,
    multi: false,
    choices: shuffle(ctx.rng, [g, ...others]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${g.summary}`,
    cardId: reverseTells(g, ctx.allGhosts).some((r) => r.k === k) ? `g:${g.id}:rev:${k}` : `g:${g.id}:tells`,
  }
}

// seules les observations décisives garantissent une réponse unique ; celles qui exigent une preuve
// (D.O.T.S du Goryo, empreintes de l'Obake) n'existent pas sans preuve
const observationQuotes = perGhost((g) =>
  g.observations
    .filter((o) => o.strength === 'definitive' && !o.requires)
    .map((o) => ({ o, quote: quoteFor(o.text, g) }))
    .filter((x): x is { o: Ghost['observations'][number]; quote: string } => x.quote != null),
)

const observationQuestion: Gen = (g, ctx) => {
  const obs = observationQuotes(g)
  if (!obs.length) return null
  const { o, quote } = obs[Math.floor(ctx.rng() * obs.length)]
  const others = pickDistractors(g, quote, ctx)
  if (!others) return null
  return {
    id: `q:obs:${g.id}:${g.observations.indexOf(o)}`,
    topic: 'behavior',
    ghostId: g.id,
    prompt: 'Sur le terrain, tu observes ceci. De quelle entité s’agit-il ?',
    quote,
    multi: false,
    choices: shuffle(ctx.rng, [g, ...others]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${g.summary}`,
    cardId: `g:${g.id}:tells`,
  }
}

/** Début d'énoncé qui se lit après « Quelle entité … » (« peut fermer une porte », « ne chasse pas… »). */
const VERB_START = /^(?:Peut|Ne|N['’]|Préfère|Erre|Chasse|Essaie|Change|Copie|A|Attend|Lance|Souffle|S['’]éloigne)\s/u

/** Capacités et comportements « 0 preuve » d'une entité, prêts pour une question (k : rang dans la fiche). */
export function abilityStatements(g: Ghost): { text: string; k: number }[] {
  return [...g.abilities, ...g.behaviors]
    .map((t, k) => ({ t, k }))
    .filter(({ t }) => t.zeroEvidence && !/^(?:Bug|Contrairement)\b/u.test(t.text))
    .map(({ t, k }) => ({ text: withoutEvidenceAsides(t.text), k }))
    .filter(({ text }) => !mentionsEvidence(text))
    .map(({ text, k }) => {
      // la première phrase porte la capacité ; la suite, ses exceptions
      const [first, ...rest] = text.split(/(?<=[.!?])\s+(?=\p{Lu})/u)
      return { text: rest.length && first.length >= 25 ? first : text, k }
    })
    .filter(({ text }) => text.length <= 240)
}

/** Les capacités qui ne nomment pas l'entité entre « » (le caviardage n'y touche pas). */
const abilityItems = perGhost((g) => abilityStatements(g).filter(({ text }) => !names(redact(text, g), g)))

/** « Quelle entité peut … ? » : à partir des capacités et comportements propres à l'entité. */
const abilityOfGhost: Gen = (g, ctx) => {
  if (g.id === MIMIC) return null
  const items = abilityItems(g)
  if (!items.length) return null
  const { text, k } = pick(ctx.rng, items)
  const plain = redact(text, g)
  const others = pickDistractors(g, plain, ctx)
  if (!others) return null
  // « Quelle entité peut fermer une porte… ? » ; une phrase en deux temps (« : », « ; ») reste citée
  const inline = VERB_START.test(plain) && plain.length <= 150 && !/[:;]/u.test(plain)
  return {
    id: `q:abil:${g.id}:${k}`,
    topic: 'behavior',
    ghostId: g.id,
    prompt: inline ? `Quelle entité ${uncap(plain.replace(/[.\s]+$/u, ''))}${NNBSP}?` : 'Quelle entité se comporte ainsi ?',
    quote: inline ? undefined : cap(plain),
    multi: false,
    choices: shuffle(ctx.rng, [g, ...others]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${uncap(text)}`,
    cardId: `g:${g.id}:tells`,
  }
}

/* ---------- sans preuve : tests et départages ---------- */

// p : rang parmi les tests sans preuve (les premiers ont leur carte)
const zeroTestQuotes = perGhost((g) =>
  zeroTests(g)
    .map((t, p) => ({ ...t, p, quote: quoteFor(t.text, g) }))
    .filter((t): t is { text: string; k: number; p: number; quote: string } => t.quote != null),
)

const zeroTest: Gen = (g, ctx) => {
  const tests = zeroTestQuotes(g)
  if (!tests.length) return null
  const t = tests[Math.floor(ctx.rng() * tests.length)]
  const gender = sameGender(t.quote, g)
  const others = shuffle(
    ctx.rng,
    ctx.allGhosts.filter(
      (o) =>
        o.id !== g.id &&
        o.id !== MIMIC &&
        zeroTests(o).length > 0 &&
        // « le Deogen est lui aussi plus visible » : une entité nommée dans le test s'écarte d'un coup d'œil
        !names(t.text, o) &&
        gender(o),
    ),
  ).slice(0, 3)
  if (others.length < 3) return null
  return {
    id: `q:zero:${g.id}:${t.k}`,
    topic: 'zero',
    ghostId: g.id,
    prompt: 'Ce test, s’il réussit, confirme quelle entité ?',
    quote: t.quote,
    multi: false,
    choices: shuffle(ctx.rng, [g, ...others]).map(ghostChoice),
    correct: [g.id],
    explain: `Test de confirmation ${de(g.name)}. ${g.summary}`,
    cardId: t.p < TESTS_PER_GHOST ? `g:${g.id}:test:${t.k}` : `g:${g.id}:tells`,
  }
}

/** Une proposition qui ne parle que des preuves partagées ou différentes. */
const SHARED_EVIDENCE = /\ben commun\b|\bau lieu (?:de|du|des|d['’])|^\s*Mêmes?\b|\bpartagen?t?\b[^.;]*\b(?:orbes?|Spirit Box)\b/iu
/** Termine une phrase reprise d'une fiche (« … (sans pouvoir le rallumer) » → « …). »). */
const endSentence = (s: string) => cap(/[.!?…]$/u.test(s) ? s : `${s}.`)
/** Coupe un texte en phrases (une phrase commence par une majuscule, « ou un chiffre). */
const SENTENCES = /(?<=[.!?])\s+(?=[\p{Lu}«\d])/u

/**
 * Le texte d'une confusion sans ce qui parle de preuves (« UV + D.O.T.S en commun », « 3e preuve : … »,
 * « mais le Yurei a les orbes au lieu de l'écriture »), phrase par phrase et proposition par proposition.
 * Chaque phrase gardée se termine par un point, même si on a retiré la proposition qui le portait.
 * Vide si la confusion ne parle que des preuves.
 */
export function confusionWithoutEvidence(why: string): string {
  return why
    .split(SENTENCES)
    .map((s) =>
      s
        .split(/\s*;\s*/u)
        .filter((c) => c.trim() && !mentionsEvidence(c) && !SHARED_EVIDENCE.test(c))
        .join(`${NNBSP}; `)
        .trim(),
    )
    .filter(Boolean)
    .map(endSentence)
    .join(' ')
}

/** Un nom au pluriel (« Les Jumeaux ») ne devient pas « l’autre » sans fausser l'accord. */
const plural = (g: Ghost) => /^Les\s/u.test(g.name)

/**
 * Ce que la fiche de x dit de l'autre entité seulement, sans preuve : on retire ce qui décrit x
 * (« ; l'Esprit reste à 1,7 m/s », « Toute chasse au-dessus de 35 % exclut l'Ombre »). Sinon, une mauvaise
 * réponse qui ne parle que de x serait vraie pour n'importe quelle paire.
 */
export function partnerClaim(why: string, x: Ghost, partner: Ghost): string {
  const clean = confusionWithoutEvidence(why)
    // « (la Banshee jusqu'à 87 % via sa cible) » : l'aparté sur x s'en va, la phrase reste
    .replace(/\s*\([^()]*\)/gu, (m) => (names(m, x) ? '' : m))
  const kept = clean
    .split(SENTENCES)
    .map((s) =>
      s
        .split(/\s*;\s*/u)
        .filter((c) => !names(c, x))
        .join(`${NNBSP}; `)
        .trim(),
    )
    .filter(Boolean)
    .map((s, i) => endSentence(i === 0 ? s.replace(/^Mais\s+/u, '') : s))
    .join(' ')
  if (kept.length < 30) return ''
  // sans sujet (« Plus loin, 1,7 m/s… »), la phrase pourrait décrire n'importe qui
  if (!names(kept, partner) && !/^(?:Il|Elle|Ils|Elles|Son|Sa|Ses|Lui)\b/u.test(kept)) return ''
  // « Il peut imiter le Cauchemar » ne départage rien
  if (/\b(?:imiter|imite|copier|copie)\b/iu.test(kept)) return ''
  if (plural(partner) && names(kept, partner)) return ''
  // un conseil (« pense plutôt à l'autre ») ou plusieurs « l'autre » (un « l'autre » de la fiche, en plus du
  // nom de l'entité qui le devient à son tour) : on ne sait plus de qui parle la réponse
  if (/\bpense\s+plutôt\b/iu.test(kept)) return ''
  const vague = kept.match(/(?<!\p{L})l['’]autre(?!\p{L})/giu)?.length ?? 0
  if (vague > 1 || (vague === 1 && names(kept, partner))) return ''
  return kept
}

/** Le texte, où l'autre entité devient « l’autre » : son nom ne souffle jamais la réponse. */
function asOther(text: string, other: Ghost): string {
  const KEEP = '\u0000'
  return redact(text.replaceAll('cette entité', KEEP), other)
    .replace(/cette entité/gu, 'l’autre')
    .replace(/(^|[.!?]\s+)l’autre/gu, '$1L’autre')
    .replaceAll(KEEP, 'cette entité')
}

/** Une paire à départager : ce que la fiche de x dit de g, et ce qu'elle dit des autres entités. */
interface Duel {
  x: Ghost
  right: string
  explain: string
  wrong: Choice[]
}
const duels = new WeakMap<readonly Ghost[], Map<string, Duel[]>>()

/** Les paires utilisables pour g : calculées une fois (les fiches ne changent pas), le tirage vient ensuite. */
function duelsFor(g: Ghost, all: readonly Ghost[]): Duel[] {
  let byGhost = duels.get(all)
  if (!byGhost) duels.set(all, (byGhost = new Map()))
  const cached = byGhost.get(g.id)
  if (cached) return cached
  const byId = new Map(all.map((o) => [o.id, o]))
  const out: Duel[] = []
  for (const x of all) {
    if (x.id === g.id || x.id === MIMIC) continue
    for (const pair of x.confusions.filter((c) => c.with === g.id)) {
      const claim = partnerClaim(pair.why, x, g)
      if (!claim) continue
      const right = asOther(claim, g)
      // un nom entre « » n'est pas caviardé : il soufflerait la réponse
      if (names(right, g)) continue
      const wrong = distinctBy(
        x.confusions
          .filter((c) => c.with !== g.id && c.with !== x.id && c.with !== MIMIC && byId.has(c.with))
          .map((c) => ({ z: byId.get(c.with)!, text: partnerClaim(c.why, x, byId.get(c.with)!) }))
          // une mauvaise réponse ne parle jamais de g (elle ne peut pas être vraie pour g), et son pronom
          // (« elle », « il ») ne l'écarte pas d'emblée
          .filter(({ text }) => text && !names(text, g) && !pronounClash(text, g))
          // ni ne décrit aussi g : « Il chasse à 1,7 m/s et à 50 % » est vrai du Myling comme du Goryo
          .filter(({ text }) => !fitsToo(text, all, true)(g) && !numbersFit(text, g))
          .map(({ z, text }) => ({ id: z.id, label: asOther(text, z) }))
          .filter((c) => !names(c.label, byId.get(c.id)!)),
        (c) => c.label,
      ).filter((c) => c.label !== right)
      if (wrong.length < 3) continue
      // le corrigé garde les deux noms, et ce qui distingue x de son côté
      const full = noLeadingMais(confusionWithoutEvidence(pair.why))
      out.push({ x, right, wrong, explain: names(full, g) ? full : `${g.name}${NNBSP}: ${uncap(full)}` })
    }
  }
  byGhost.set(g.id, out)
  return out
}

/**
 * « Comment distinguer X de g sans preuve ? » : la bonne réponse est ce que la fiche de X dit de g ;
 * les mauvaises, ce qu'elle dit d'autres entités. Dans chaque réponse, l'entité opposée à X devient « l’autre ».
 */
const distinguish: Gen = (g, ctx) => {
  // le Mimic peut copier n'importe quel comportement : une mauvaise réponse pourrait être vraie pour lui
  if (g.id === MIMIC) return null
  const list = duelsFor(g, ctx.allGhosts)
  if (!list.length) return null
  const d = pick(ctx.rng, list)
  return {
    id: `q:dist:${d.x.id}:${g.id}`,
    topic: 'zero',
    ghostId: g.id,
    prompt: `Comment distinguer ${le(d.x.name)} ${de(g.name)} sans preuve${NNBSP}?`,
    multi: false,
    choices: shuffle(ctx.rng, [{ id: g.id, label: d.right }, ...sample(ctx.rng, d.wrong, 3)]),
    correct: [g.id],
    explain: d.explain,
    cardId: `g:${g.id}:tells`,
  }
}

/* ---------- questions rédigées ---------- */

const authored = (g: Ghost, ctx: QuizOptions): Question | null => {
  // les questions sur les preuves (lesquelles, forcées, combinaisons, réponses à la Spirit Box) restent dans le codex
  const valid = g.quiz.filter(
    (q) =>
      q.choices.length >= 2 &&
      q.answer >= 0 &&
      q.answer < q.choices.length &&
      !mentionsEvidence(q.q) &&
      !mentionsEvidence(q.choices[q.answer]),
  )
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
  behavior: [whichGhostTell, observationQuestion, abilityOfGhost],
  speed: [speedOfGhost, losOfGhost, speedProfile],
  sanity: [sanityOfGhost, earlyHunter, sanityProfile],
  zero: [zeroTest, distinguish],
  expert: [authored],
}

function trueFalseQuestions(m: Mechanics, rng: Rng): Question[] {
  // les affirmations sur les preuves restent « bon à savoir » : pas de quiz
  return shuffle(
    rng,
    m.trueFalse.filter((tf) => !tf.evidence),
  ).map((tf) => ({
    id: `q:tf:${tf.id}`,
    topic: 'mechanics' as const,
    prompt: 'Vrai ou faux ?',
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
  const { rng, count } = opts
  // un ancien lien (?topic=evidence) ou un thème inconnu ne casse rien : il est ignoré
  const topics = opts.topics.filter((t) => t === 'mechanics' || t in GENERATORS)
  const out: Question[] = []
  if (!topics.length) return out
  const seen = new Set<string>()
  const tf = topics.includes('mechanics') ? trueFalseQuestions(opts.mechanics, rng) : []
  const weight = (g: Ghost) => 1.25 - (opts.mastery?.[g.id] ?? 0)
  let attempts = 0
  let misses = 0
  let topicIdx = Math.floor(rng() * topics.length)

  // une seule entité s'épuise vite : on s'arrête après une longue série de tirages sans question nouvelle
  while (out.length < count && attempts < count * 40 && misses < 120) {
    attempts++
    misses++
    const topic = topics[topicIdx % topics.length]
    topicIdx++
    let q: Question | null = null
    if (topic === 'mechanics') {
      q = tf.find((t) => !seen.has(t.id)) ?? null
    } else if (opts.ghosts.length) {
      const g = weightedPick(rng, opts.ghosts, weight)
      const gen = pick(rng, GENERATORS[topic])
      q = gen(g, opts)
    }
    if (!q || seen.has(q.id)) continue
    seen.add(q.id)
    misses = 0
    // typographie française sur ce que l'app compose (les textes des fiches le sont déjà au chargement)
    out.push({ ...q, prompt: fr(q.prompt), explain: fr(noLeadingMais(q.explain)) })
  }
  return out
}

export function isCorrect(q: Question, selected: string[]): boolean {
  if (selected.length !== q.correct.length) return false
  return q.correct.every((c) => selected.includes(c))
}
