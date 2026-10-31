import type { Ghost, Mechanics } from '../data/types'
import { de, isFeminine, le, mentionsEvidence, REVERSE_PER_GHOST, TESTS_PER_GHOST, zeroTests } from './cards'
import { fr, NBSP, NNBSP, redactGhostName } from './format'
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

/** Le Mimic copie vitesses, seuils et comportements : il ne peut jamais servir de mauvaise réponse. */
const MIMIC = 'the-mimic'

const known = (g: Ghost) => g.speed.min >= 0
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const uncap = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Vitesse « standard » : 1,7 m/s et accélération normale en ligne de vue. */
const standardSpeed = (g: Ghost) =>
  g.speed.min === 1.7 && g.speed.max == null && g.speed.alt == null && !g.speed.isRange && g.speed.los && !g.speed.losVaries
/** Seuil « standard » : 50 % dans tous les cas. */
const standardSanity = (g: Ghost) => g.huntSanity.low === 50 && g.huntSanity.normal === 50 && g.huntSanity.high === 50

function ghostChoice(g: Ghost): Choice {
  return { id: g.id, label: g.name !== g.nameEn ? `${g.name} (${g.nameEn})` : g.name }
}

/** Masque le nom de l'entité ; « d'un Deogen » devient « de cette entité » (et non « d'cette entité »). */
const redact = (text: string, g: Ghost) =>
  redactGhostName(text, g).replace(/(?<![\p{L}])(d|D|qu|Qu|n|N|s|S)['’]cette entité/gu, '$1e cette entité')

/** Le texte nomme-t-il cette entité ? */
const names = (text: string, g: Ghost) => redactGhostName(text, g) !== text

/* ---------- une seule bonne réponse : écarter les mauvaises réponses qui pourraient aussi convenir ---------- */

const WORD = /\p{L}{5,}/gu
const wordsOf = (text: string) => new Set(text.toLowerCase().match(WORD) ?? [])

interface Lexicon {
  /** mots de la fiche de chaque entité (ses signes, capacités, comportements, tests, vitesses, seuils) */
  words: Map<string, Set<string>>
  /** nombre d'entités dont la fiche contient le mot */
  df: Map<string, number>
}
const lexicons = new WeakMap<readonly Ghost[], Lexicon>()

function lexicon(all: readonly Ghost[]): Lexicon {
  const cached = lexicons.get(all)
  if (cached) return cached
  const nameWords = new Set(all.flatMap((g) => [...wordsOf(`${g.name} ${g.nameEn}`)]))
  const words = new Map<string, Set<string>>()
  const df = new Map<string, number>()
  for (const g of all) {
    const texts = [
      ...g.keyTells,
      ...[...g.tells, ...g.abilities, ...g.behaviors, ...g.observations, ...g.confirmationTests].map((t) => t.text),
      g.speed.summary,
      ...g.speed.details,
      g.huntSanity.summary,
      ...g.huntSanity.details,
    ]
    const set = new Set([...wordsOf(texts.join(' '))].filter((w) => !nameWords.has(w)))
    words.set(g.id, set)
    for (const w of set) df.set(w, (df.get(w) ?? 0) + 1)
  }
  const lex = { words, df }
  lexicons.set(all, lex)
  return lex
}

/**
 * L'énoncé pourrait-il aussi décrire une autre entité ? On écarte les entités au seuil ou à la vitesse
 * particuliers quand l'énoncé en parle, et celles dont la fiche partage les mots rares de l'énoncé.
 */
function fitsToo(statement: string, all: readonly Ghost[]): (o: Ghost) => boolean {
  const sanityTalk = /chass/iu.test(statement) && /%|santé mentale|seuil/iu.test(statement)
  const speedTalk = /m\/s|vitesse|rapide|ralenti|accél|\blente?\b/iu.test(statement)
  const { words, df } = lexicon(all)
  const rare = [...wordsOf(statement)].filter((w) => (df.get(w) ?? 0) <= 3)
  return (o) => {
    if (sanityTalk && !standardSanity(o)) return true
    if (speedTalk && !standardSpeed(o)) return true
    const theirs = words.get(o.id)
    const shared = theirs ? rare.filter((w) => theirs.has(w)).length : 0
    return shared >= 2 || (rare.length <= 2 && shared >= 1)
  }
}

/** Trois mauvaises réponses plausibles (entités souvent confondues avec g), qui ne collent pas à l'énoncé. */
function pickDistractors(g: Ghost, statement: string, ctx: QuizOptions, n = 3): Ghost[] | null {
  const fits = fitsToo(statement, ctx.allGhosts)
  const pool = ctx.allGhosts.filter((o) => o.id !== g.id && o.id !== MIMIC && !fits(o))
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

/* ---------- seuils de chasse ---------- */

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
    prompt: 'La santé mentale moyenne est encore au-dessus de 50 % et une chasse démarre. Laquelle de ces entités peut en être responsable ?',
    multi: false,
    choices: shuffle(ctx.rng, [g, ...late.slice(0, 3)]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${g.huntSanity.summary}. Les autres ne peuvent pas chasser au-dessus de 50${NBSP}% (hors effets d’objets maudits).`,
    cardId: `g:${g.id}:san`,
  }
}

/** Les seuils possibles d'une entité (bas, normal, haut). */
const thresholds = (g: Ghost) => new Set([g.huntSanity.low, g.huntSanity.normal, g.huntSanity.high].filter((v) => v >= 0))

/** Seuil particulier → entité. Les mauvaises réponses n'ont aucun des seuils cités : une seule peut convenir. */
const sanityProfile: Gen = (g, ctx) => {
  if (g.id === MIMIC || standardSanity(g)) return null
  const mine = thresholds(g)
  if (!mine.size) return null
  const pool = ctx.allGhosts.filter(
    (o) => o.id !== g.id && o.id !== MIMIC && thresholds(o).size > 0 && ![...thresholds(o)].some((v) => mine.has(v)),
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
    quote: redact(g.huntSanity.summary, g),
    multi: false,
    choices: shuffle(ctx.rng, [g, ...wrong]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${[g.huntSanity.summary, ...g.huntSanity.details.slice(0, 1)].join(' — ')}`,
    cardId: `g:${g.id}:san`,
  }
}

/* ---------- vitesses ---------- */

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
  if (!known(g) || g.id === MIMIC) return null
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

/** Les vitesses citées par une entité, hors 1,7 m/s (la vitesse de tout le monde). */
const speeds = (g: Ghost) => new Set([g.speed.min, g.speed.max, g.speed.alt].filter((v): v is number => v != null && v >= 0 && v !== 1.7))

/** Profil de vitesse particulier → entité. Les mauvaises réponses n'ont aucune des vitesses citées. */
const speedProfile: Gen = (g, ctx) => {
  if (!known(g) || g.id === MIMIC || standardSpeed(g)) return null
  const mine = speeds(g)
  const pool = ctx.allGhosts.filter((o) => o.id !== g.id && o.id !== MIMIC && known(o) && ![...speeds(o)].some((v) => mine.has(v)))
  const ranked = [...shuffle(ctx.rng, pool.filter((o) => !standardSpeed(o))), ...shuffle(ctx.rng, pool.filter(standardSpeed))]
  const wrong = ranked.slice(0, 3)
  if (wrong.length < 3) return null
  return {
    id: `q:spdp:${g.id}`,
    topic: 'speed',
    ghostId: g.id,
    prompt: 'En chasse, quelle entité se déplace ainsi ?',
    quote: redact(g.speed.summary, g).replace(/\bLdV\b/g, 'ligne de vue'),
    multi: false,
    choices: shuffle(ctx.rng, [g, ...wrong]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${[g.speed.summary, ...g.speed.details.slice(0, 1)].join(' — ')}`,
    cardId: `g:${g.id}:spd`,
  }
}

/* ---------- comportements ---------- */

const whichGhostTell: Gen = (g, ctx) => {
  // les signes clés résument parfois des propriétés partagées (« vitesse standard ») : on n'utilise ici
  // que les signes « 0 preuve » de tybayn, propres à l'entité
  const tells = g.tells.filter((t) => t.zeroEvidence).map((t) => t.text)
  if (!tells.length) return null
  const k = Math.floor(ctx.rng() * tells.length)
  const quote = redact(tells[k], g)
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
    cardId: k < REVERSE_PER_GHOST ? `g:${g.id}:rev:${k}` : `g:${g.id}:tells`,
  }
}

const observationQuestion: Gen = (g, ctx) => {
  // seules les observations décisives garantissent une réponse unique ; celles qui exigent une preuve
  // (D.O.T.S du Goryo, empreintes de l'Obake) n'existent pas sans preuve
  const obs = g.observations.filter((o) => o.strength === 'definitive' && !o.requires)
  if (!obs.length) return null
  const o = obs[Math.floor(ctx.rng() * obs.length)]
  const quote = redact(o.text, g)
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
    .filter(({ t }) => t.zeroEvidence && !/^(?:Bug|Contrairement)\b/u.test(t.text) && !mentionsEvidence(t.text))
    .map(({ t, k }) => {
      // la première phrase porte la capacité ; la suite, ses exceptions
      const [first, ...rest] = t.text.split(/(?<=[.!?])\s+(?=\p{Lu})/u)
      return { text: rest.length && first.length >= 25 ? first : t.text, k }
    })
    .filter(({ text }) => text.length <= 240)
}

/** « Quelle entité peut … ? » : à partir des capacités et comportements propres à l'entité. */
const abilityOfGhost: Gen = (g, ctx) => {
  if (g.id === MIMIC) return null
  const items = abilityStatements(g)
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

const zeroTest: Gen = (g, ctx) => {
  const tests = zeroTests(g)
  if (!tests.length) return null
  const p = Math.floor(ctx.rng() * tests.length)
  const t = tests[p]
  const others = shuffle(
    ctx.rng,
    ctx.allGhosts.filter((o) => o.id !== g.id && o.id !== MIMIC && zeroTests(o).length > 0),
  ).slice(0, 3)
  if (others.length < 3) return null
  return {
    id: `q:zero:${g.id}:${t.k}`,
    topic: 'zero',
    ghostId: g.id,
    prompt: 'Ce test, s’il réussit, confirme quelle entité ?',
    quote: redact(t.text, g),
    multi: false,
    choices: shuffle(ctx.rng, [g, ...others]).map(ghostChoice),
    correct: [g.id],
    explain: `Test de confirmation ${de(g.name)}. ${g.summary}`,
    cardId: p < TESTS_PER_GHOST ? `g:${g.id}:test:${t.k}` : `g:${g.id}:tells`,
  }
}

/** Une proposition qui ne parle que des preuves partagées ou différentes. */
const SHARED_EVIDENCE = /\ben commun\b|\bau lieu (?:de|du|des|d['’])|^\s*Mêmes?\b|\bpartagen?t?\b[^.;]*\b(?:orbes?|Spirit Box)\b/iu
/** Termine une phrase reprise d'une fiche (« … (sans pouvoir le rallumer) » → « …). »). */
const endSentence = (s: string) => cap(/[.!?…]$/u.test(s) ? s : `${s}.`)

/**
 * Le texte d'une confusion sans ce qui parle de preuves (« UV + D.O.T.S en commun », « 3e preuve : … »,
 * « mais le Yurei a les orbes au lieu de l'écriture »), phrase par phrase et proposition par proposition.
 * Vide si la confusion ne parle que des preuves.
 */
export function confusionWithoutEvidence(why: string): string {
  const kept = why
    .split(/(?<=[.!?])\s+(?=[\p{Lu}«\d])/u)
    .map((s) =>
      s
        .split(/\s*;\s*/u)
        .filter((c) => c.trim() && !mentionsEvidence(c) && !SHARED_EVIDENCE.test(c))
        .join(`${NNBSP}; `),
    )
    .filter(Boolean)
  const out = kept.join(' ').trim()
  return out ? endSentence(out) : ''
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
    .split(/(?<=[.!?])\s+(?=[\p{Lu}«\d])/u)
    .map((s) =>
      s
        .split(/\s*;\s*/u)
        .filter((c) => !names(c, x))
        .join(`${NNBSP}; `),
    )
    .filter(Boolean)
    .join(' ')
    .replace(/^Mais\s+/u, '')
    .trim()
  if (kept.length < 30) return ''
  // sans sujet (« Plus loin, 1,7 m/s… »), la phrase pourrait décrire n'importe qui
  if (!names(kept, partner) && !/^(?:Il|Elle|Ils|Elles|Son|Sa|Ses|Lui)\b/u.test(kept)) return ''
  // « Il peut imiter le Cauchemar » ne départage rien
  if (/\b(?:imiter|imite|copier|copie)\b/iu.test(kept)) return ''
  if (plural(partner) && names(kept, partner)) return ''
  return endSentence(kept)
}

/** « Elle ne poursuit que sa cible » ne peut pas parler du Démon : le pronom trahirait la mauvaise réponse. */
function pronounClash(text: string, g: Ghost): boolean {
  const fem = /(?:^|[\s(])[Ee]lles?\b/u.test(text)
  const masc = /(?:^|[\s(])(?:[Ii]ls?|[Ll]ui)\b/u.test(text)
  return isFeminine(g.name) ? masc && !fem : fem && !masc
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
      const wrong = distinctBy(
        x.confusions
          .filter((c) => c.with !== g.id && c.with !== x.id && c.with !== MIMIC && byId.has(c.with))
          .map((c) => ({ z: byId.get(c.with)!, text: partnerClaim(c.why, x, byId.get(c.with)!) }))
          // une mauvaise réponse ne parle jamais de g (elle ne peut pas être vraie pour g), et son pronom
          // (« elle », « il ») ne l'écarte pas d'emblée
          .filter(({ text }) => text && !names(text, g) && !pronounClash(text, g))
          .map(({ z, text }) => ({ id: z.id, label: asOther(text, z) })),
        (c) => c.label,
      ).filter((c) => c.label !== right)
      if (wrong.length < 3) continue
      // le corrigé garde les deux noms, et ce qui distingue x de son côté
      const full = confusionWithoutEvidence(pair.why)
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
  // les questions sur les preuves (lesquelles, forcées, combinaisons) restent dans le codex
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
    out.push({ ...q, prompt: fr(q.prompt), explain: fr(q.explain) })
  }
  return out
}

export function isCorrect(q: Question, selected: string[]): boolean {
  if (selected.length !== q.correct.length) return false
  return q.correct.every((c) => selected.includes(c))
}
