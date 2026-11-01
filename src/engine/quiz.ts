import type { Ghost, Mechanics } from '../data/types'
import {
  de,
  fitsToo,
  isEvidenceList,
  isFeminine,
  le,
  mentionsEvidence,
  MIMIC,
  namesGhost,
  needsEvidence,
  numbersFit,
  restatedBy,
  reverseTells,
  speedValues,
  standardSanity,
  standardSpeed,
  TESTS_PER_GHOST,
  thresholds,
  withoutEvidenceAsides,
  zeroTests,
  type Card,
  type CardKind,
  type CoachNote,
} from './cards'
import { fr, NBSP, NNBSP, redactGhostName as redact } from './format'
import { createRng, hashString, pick, sample, shuffle, weightedPick, type Rng } from './random'

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
 * (ou la bonne). « Il faut », « il y a » ne désignent personne. Le pronom sujet en tête de phrase décide :
 * dans « Il chasse dès 60 % si la lumière (40 % si elle est allumée)… », « elle » est la lumière.
 */
function pronounClash(text: string, g: Ghost): boolean {
  const lead = LEAD_MASC.test(text) ? 'm' : LEAD_FEM.test(text) ? 'f' : null
  if (lead) return lead !== (isFeminine(g.name) ? 'f' : 'm')
  const fem = ANY_FEM.test(text)
  const masc = ANY_MASC.test(text)
  return isFeminine(g.name) ? masc && !fem : fem && !masc
}
const LEAD_MASC = /^(?:Ils?|Lui)\b(?!\s+(?:faut|suffit|y\s+a)\b)/u
// « Seule à fermer une porte… », « Encensée, … » : l'accord dit le genre comme un pronom
const LEAD_FEM = /^(?:Elles?\b|(?:Seule\s+à|Encensée)(?!\p{L}))/u
// « près d’elle », « qu’il » : le pronom collé à l’apostrophe compte aussi
const ANY_FEM = /(?:^|[\s(’'])[Ee]lles?\b/u
const ANY_MASC = /(?:^|[\s(’'])(?:[Ii]ls?|[Ll]ui)\b(?!\s+(?:faut|suffit|y\s+a)\b)/u

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
function pickDistractors(g: Ghost, statement: string, ctx: QuizOptions, n = 3, also: (o: Ghost) => boolean = () => true): Ghost[] | null {
  const fits = fitsToo(statement, ctx.allGhosts)
  const gender = sameGender(statement, g)
  const pool = ctx.allGhosts.filter((o) => o.id !== g.id && o.id !== MIMIC && !fits(o) && gender(o) && !names(statement, o) && also(o))
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

/* ---------- des réponses de même forme ---------- */

/** « 50 % », « 1,7 m/s », « 60 s » : un nombre et son unité, rien d'autre. */
const NUMERIC = /^\d+(?:,\d+)?\s?(%|m\/s|s|min|m|°C|ans?)$/u
const unitOf = (label: string): string | null => NUMERIC.exec(label.trim())?.[1] ?? null

/**
 * Ce qui se repère d'un coup d'œil, sans rien savoir du jeu : un chiffre (et s'il ouvre la réponse), un
 * pourcentage, une vitesse, un « · », une parenthèse, un « : » ou un « ; », des « », une flèche, une nuance
 * (« parfois », « toujours », « environ »), un « elle » (face à « la Dayan » dans l'énoncé, la seule réponse
 * au féminin parle d'elle), un « n'accélère pas ». La seule réponse qui en a une (ou la seule qui n'en a
 * pas) se remarque.
 */
const MARKS: readonly RegExp[] = [
  /\d/u,
  /^\d/u,
  /%/u,
  /m\/s/u,
  /·/u,
  /[()]/u,
  /[:;]/u,
  /[«»]/u,
  /→/u,
  /(?<!\p{L})(?:parfois|toujours|rarement|généralement|en général|en moyenne|habituellement|peut-être|surtout|(?<!plus\s)souvent|environ)(?!\p{L})|≈/iu,
  new RegExp(`${ANY_FEM.source}|^(?:Seule\\s+à|Encensée)(?!\\p{L})`, 'u'),
  /n[’']accél(?:ère|èrent) (?:pas|jamais)|sans accél(?:ération|érer)|aucune accélération/iu,
]
/** La forme d'une réponse : son unité (texte : null), sa longueur, ses marques (un bit par marque). Calculée une fois par libellé. */
interface Shape {
  unit: string | null
  len: number
  marks: number
  /** pour repérer deux réponses identiques à la casse près */
  key: string
}
const shapes = new Map<string, Shape>()
function shapeOf(label: string): Shape {
  let s = shapes.get(label)
  if (!s) {
    const t = label.trim()
    s = { unit: unitOf(t), len: t.length, marks: MARKS.reduce((m, re, i) => (re.test(t) ? m | (1 << i) : m), 0), key: t.toLowerCase() }
    shapes.set(label, s)
  }
  return s
}

/** Longueurs voisines : la plus longue fait au plus 1,6 fois la plus courte (12 caractères d'écart entre réponses courtes). */
const closeLengths = (min: number, max: number) => max <= 1.6 * min || (max <= 20 && max - min <= 12)

/** Aucune marque ne distingue une seule réponse des autres (ni la seule qui l'a, ni la seule qui ne l'a pas). */
function balancedMarks(marks: readonly number[]): boolean {
  for (let i = 0; i < MARKS.length; i++) {
    const k = marks.filter((m) => m & (1 << i)).length
    if (k === 1 || k === marks.length - 1) return false
  }
  return true
}

/**
 * Des réponses qui se ressemblent, pour que la bonne ne se trouve pas à sa forme : toutes des nombres de
 * même unité, ou toutes du texte ; de longueur voisine ; et aucune marque (chiffre, « · », parenthèse,
 * nuance…) qui distingue une seule réponse des autres. Les noms d'entités se jugent à part : un nom ne
 * souffle rien.
 */
export function homogeneous(choices: readonly (string | Choice)[]): boolean {
  const all = choices.map((c) => shapeOf(typeof c === 'string' ? c : c.label))
  if (all.length < 2 || all.some((s) => !s.len || s.unit !== all[0].unit)) return false
  const lens = all.map((s) => s.len)
  if (!closeLengths(Math.min(...lens), Math.max(...lens))) return false
  return !!all[0].unit || all.length < 3 || balancedMarks(all.map((s) => s.marks))
}

interface Option<T> {
  value: T
  label: string
}

/**
 * n mauvaises réponses de même forme que la bonne (voir homogeneous), prises dans `pool`, rangé du plus
 * plausible au moins plausible. Le nombre de mauvaises réponses plus longues que la bonne est tiré au
 * hasard : la bonne n'est ni toujours la plus longue, ni toujours la plus courte. D'abord parmi les réponses
 * qui ont exactement les mêmes marques que la bonne, puis parmi toutes. `fits` refuse un groupe qui ne va
 * pas (deux réponses sur la même entité, le même thème…). Null s'il n'y a pas de quoi faire un groupe.
 *
 * `ranks` : les nombres de mauvaises réponses plus longues acceptés, dans l'ordre où les essayer. Quand la
 * bonne réponse a plusieurs versions (entière, plus courte), l'appelant tire ce nombre une fois et essaie
 * toutes les versions avant d'en accepter un autre (voir byRank) : sinon une bonne réponse longue, faute de
 * mauvaises réponses plus longues, finirait trop souvent la plus longue.
 */
function matching<T>(
  rng: Rng,
  right: string,
  pool: readonly Option<T>[],
  n = 3,
  fits: (chosen: readonly Option<T>[]) => boolean = () => true,
  ranks: readonly number[] = shuffle(rng, [...Array(n + 1).keys()]),
): Option<T>[] | null {
  const r = shapeOf(right)
  const usable = distinctBy(
    pool.filter((o) => {
      const s = shapeOf(o.label)
      return o.label !== right && s.unit === r.unit && closeLengths(Math.min(r.len, s.len), Math.max(r.len, s.len))
    }),
    (o) => shapeOf(o.label).key,
  )
  const same = usable.filter((o) => shapeOf(o.label).marks === r.marks)
  for (const cands of same.length === usable.length ? [usable] : [same, usable]) {
    const top = cands.slice(0, 18)
    const lens = top.map((o) => shapeOf(o.label).len)
    const marks = top.map((o) => shapeOf(o.label).marks)
    const idx: number[] = []
    // les premiers rangs d'abord ; un groupe trop étalé en longueur ne fait que s'étaler davantage : on coupe
    const search = (start: number, longer: number, wanted: number, min: number, max: number): Option<T>[] | null => {
      if (idx.length === n) {
        if (longer !== wanted || (!r.unit && !balancedMarks([r.marks, ...idx.map((i) => marks[i])]))) return null
        const chosen = idx.map((i) => top[i])
        return fits(chosen) ? chosen : null
      }
      for (let i = start; i <= top.length - (n - idx.length); i++) {
        const more = longer + (lens[i] > r.len ? 1 : 0)
        const lo = Math.min(min, lens[i])
        const hi = Math.max(max, lens[i])
        if (more > wanted || wanted - more > n - idx.length - 1 || !closeLengths(lo, hi)) continue
        idx.push(i)
        const found = search(i + 1, more, wanted, lo, hi)
        idx.pop()
        if (found) return found
      }
      return null
    }
    for (const wanted of ranks) {
      const found = search(0, 0, wanted, r.len, r.len)
      if (found) return found
    }
  }
  return null
}

/**
 * La première question que `make` arrive à composer, le nombre de mauvaises réponses plus longues que la
 * bonne étant tiré une fois pour toutes : chaque version de la bonne réponse (ou chaque paire à départager)
 * l'essaie avant qu'on se rabatte sur un autre nombre.
 */
function byRank<R>(rng: Rng, make: (ranks: readonly number[]) => R | null, n = 3): R | null {
  for (const wanted of shuffle(rng, [...Array(n + 1).keys()])) {
    const found = make([wanted])
    if (found) return found
  }
  return null
}

/** Une phrase sans ses apartés entre parenthèses (« N'allume jamais les lumières (interrupteurs, lampes) »). */
const withoutAsides = (s: string) => s.replace(/\s*\([^()]*\)/gu, '').trim()

/**
 * Des versions plus courtes d'une phrase, qui en gardent le sens : sans ses apartés entre parenthèses, ou
 * sa première partie (première phrase, ou ce qui précède « · » ou « ; »). Elles servent quand la phrase
 * entière serait bien plus longue que les autres réponses.
 */
function shortened(text: string): string[] {
  const out = new Set<string>()
  const add = (s: string) => {
    const t = s.trim()
    if (t.length >= 25 && t !== text && !/[:,]$/u.test(t)) out.add(t)
  }
  const bare = withoutAsides(text)
  add(bare)
  for (const s of [text, bare]) {
    const sentences = s.split(SENTENCES)
    if (sentences.length > 1) add(sentences[0])
    const [head, ...rest] = s.split(/\s+·\s+|\s*;\s+/u)
    if (rest.length) add(/[.!?…]$/u.test(s) ? endSentence(head) : head)
  }
  return [...out]
}

/** « LdV » reste dans les résumés courts ; une réponse l'écrit en toutes lettres (sa longueur est celle qu'on lit). */
const spellLdV = (s: string) => s.replace(/\bLdV\b/gu, 'ligne de vue')

/* ---------- seuils de chasse ---------- */

/** Une valeur par liste d'entités, calculée une fois. */
function perList<T>(f: (all: readonly Ghost[]) => T): (all: readonly Ghost[]) => T {
  const cache = new WeakMap<readonly Ghost[], T>()
  return (all) => {
    if (!cache.has(all)) cache.set(all, f(all))
    return cache.get(all)!
  }
}

/** Le texte nomme-t-il une entité de la liste ? Une réponse qui nomme la sienne la désignerait. */
const namesAny = (text: string, all: readonly Ghost[]) => all.some((o) => names(text, o))

/**
 * Trois autres valeurs que le jeu connaît, toutes fausses pour l'entité : parmi les plus proches de la bonne,
 * autant en dessous qu'au-dessus selon le tirage (la bonne n'est ni toujours au milieu, ni toujours à un bout).
 * `prefer` : de chaque côté, ces valeurs passent avant les autres (les seuils habituels d'autres entités : une
 * valeur qui n'est jamais la bonne réponse finirait par se repérer). `include` : une valeur toujours proposée
 * quand elle est fausse (le seuil standard face au Démon : sinon « toujours 50 % » gagnerait).
 */
function nearbyValues(
  rng: Rng,
  right: number,
  values: readonly number[],
  n = 3,
  { prefer, include }: { prefer?: ReadonlySet<number>; include?: number } = {},
): number[] | null {
  const inc = include != null && include !== right && values.includes(include) ? include : null
  const rank = (v: number) => (prefer?.has(v) ? 0 : 1)
  const side = (vs: readonly number[]) => vs.filter((v) => v !== inc).sort((a, b) => rank(a) - rank(b) || Math.abs(a - right) - Math.abs(b - right))
  const below = side(values.filter((v) => v < right))
  const above = side(values.filter((v) => v > right))
  // k : le nombre de valeurs sous la bonne (celle qu'on impose comprise)
  const low = inc != null && inc < right ? 1 : 0
  const high = inc != null && inc > right ? 1 : 0
  const counts = [...Array(n + 1).keys()].filter((k) => k >= low && n - k >= high && k - low <= below.length && n - k - high <= above.length)
  if (!counts.length) return null
  const k = pick(rng, counts)
  const [kb, ka] = [k - low, n - k - high]
  return [...(inc != null ? [inc] : []), ...sample(rng, below.slice(0, kb + 1), kb), ...sample(rng, above.slice(0, ka + 1), ka)]
}

const pct = (v: number) => `${v}${NBSP}%`

/** Le seuil et la vitesse de la plupart des entités. */
const STANDARD_SANITY = 50
const STANDARD_SPEED = 1.7
/**
 * La part des questions en nombres posées sur une entité au seuil (ou à la vitesse) standard. 22 entités
 * chassent d'habitude à 50 % (20 à 1,7 m/s) : posées à chaque fois, « toujours 50 % » gagnerait presque
 * toujours. Ainsi, quand « 50 % » est proposé, il n'est la bonne réponse qu'environ une fois sur quatre
 * (les cinq seuils particuliers le proposent toujours comme mauvaise réponse). Le reste du temps, on demande
 * l'inverse : quelle entité chasse comme une entité standard.
 */
const KEEP_STANDARD_SANITY = 0.08
const KEEP_STANDARD_SPEED = 0.04

/**
 * Les seuils que le jeu donne vraiment, tels que les résumés les citent (« 65 % près de l'électronique »),
 * sans 100 % (« à toute santé mentale »), ni les bornes d'une plage, ni le Mimic (il copie).
 */
const gameThresholds = perList((all) =>
  [
    ...new Set(
      all
        .filter((g) => g.id !== MIMIC)
        // « 12 à 87 % en moyenne » (la Banshee) : une plage de santé moyenne, pas un seuil
        .flatMap((g) => [...thresholds(g)].filter((v) => v < 100 && new RegExp(`(?<!\\d\\s?à\\s)(?<![\\d,])${v}\\s?%`, 'u').test(g.huntSanity.summary))),
    ),
  ].sort((a, b) => a - b),
)

/**
 * Le seuil habituel d'une entité, celui que son résumé cite en premier (« 60 % lumière éteinte · … »).
 * Aucun pour un seuil qui change au fil de la partie (« 75 % jeune → 15 % vieux »), sans valeur normale
 * (l'Obambo, calme ou agressif) ou copié (le Mimic).
 */
function baseSanity(g: Ghost): number | null {
  const h = g.huntSanity
  if (g.id === MIMIC || h.normal < 0 || /→/u.test(h.summary)) return null
  return new RegExp(`^${h.normal}\\s?%`, 'u').test(h.summary) ? h.normal : null
}

/** Les seuils habituels des entités (35, 40, 50, 60, 70 %) : les mauvaises réponses les prennent d'abord. */
const baseThresholds = perList((all) => new Set(all.map(baseSanity).filter((v): v is number => v != null)))

/**
 * « Quel est le seuil de chasse habituel du Yokai ? » : quatre pourcentages que le jeu connaît. Aucune
 * mauvaise réponse n'est un seuil que l'entité peut avoir (« 80 % » face au Yokai, qui chasse jusqu'à 80 %
 * quand on parle dans sa pièce) ; le corrigé donne le résumé et ses conditions. Les mauvaises réponses sont
 * d'abord des seuils habituels d'autres entités, et « 50 % » est toujours proposé face à un seuil
 * particulier : ni la fréquence d'une valeur ni sa rareté ne soufflent la bonne (voir KEEP_STANDARD_SANITY).
 */
const sanityOfGhost: Gen = (g, ctx) => {
  const base = baseSanity(g)
  if (base == null) return null
  if (base === STANDARD_SANITY && ctx.rng() >= KEEP_STANDARD_SANITY) return null
  const mine = thresholds(g)
  const wrong = nearbyValues(
    ctx.rng,
    base,
    gameThresholds(ctx.allGhosts).filter((v) => !mine.has(v)),
    3,
    { prefer: baseThresholds(ctx.allGhosts), include: STANDARD_SANITY },
  )
  if (!wrong) return null
  // « 60 % lumière éteinte » : la condition du seuil demandé reste dans l'énoncé (« de sa cible » se lit dans le corrigé)
  const condition = g.huntSanity.summary
    .split(/\s+·\s+/u)[0]
    .replace(/^\d+\s?%\s*/u, '')
    .trim()
  // « 50 % normal » (le Gallu) : un seul mot, c'est un état
  const precise = !condition || /^d(?:e|u|es)\s/u.test(condition) ? '' : /^\p{L}+$/u.test(condition) ? ` (en état ${condition})` : ` (${condition})`
  return {
    id: `q:san:${g.id}`,
    topic: 'sanity',
    ghostId: g.id,
    prompt: `Quel est le seuil de chasse habituel ${de(g.name)}${precise}${NNBSP}?`,
    multi: false,
    choices: shuffle(ctx.rng, [{ id: g.id, label: pct(base) }, ...wrong.map((v) => ({ id: `v:${v}`, label: pct(v) }))]),
    correct: [g.id],
    explain: [g.huntSanity.summary, ...g.huntSanity.details.slice(0, 2)].join(' — '),
    cardId: `g:${g.id}:san`,
  }
}

/**
 * Les entités qui ne chassent jamais d'habitude à `value` : aucun de leurs seuils (ou aucune de leurs
 * vitesses) n'est cette valeur, et elles n'y passent pas en chemin (le Thayé, de 75 à 15 %, ni le Moroi,
 * de 1,5 à 2,25 m/s). Jamais le Mimic : il copie.
 */
const neverAt = (all: readonly Ghost[], values: (o: Ghost) => Set<number>, summary: (o: Ghost) => string, value: number, range: (o: Ghost) => boolean) =>
  all.filter((o) => o.id !== MIMIC && values(o).size > 0 && !values(o).has(value) && !range(o) && !/→/u.test(summary(o)))

/**
 * Une entité au seuil standard, posée à l'envers (sans quoi « 50 % » serait presque toujours la bonne
 * réponse) : « Laquelle de ces entités a un seuil de chasse habituel de 50 % ? », face à trois entités qui
 * ont un autre seuil. Les choix sont des noms : leur forme ne souffle rien. Un seul identifiant pour toutes :
 * une fois par série au plus.
 */
const sanityStandard: Gen = (g, ctx) => {
  if (baseSanity(g) !== STANDARD_SANITY) return null
  const pool = neverAt(ctx.allGhosts, thresholds, (o) => o.huntSanity.summary, STANDARD_SANITY, () => false)
  if (pool.length < 3) return null
  const wrong = sample(ctx.rng, pool, 3)
  return {
    id: 'q:san:std',
    topic: 'sanity',
    ghostId: g.id,
    prompt: `Laquelle de ces entités a un seuil de chasse habituel de ${pct(STANDARD_SANITY)}, comme une entité standard${NNBSP}?`,
    multi: false,
    choices: shuffle(ctx.rng, [g, ...wrong]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${g.huntSanity.summary}. Les autres ont un autre seuil${NNBSP}: ${wrong.map((o) => `${o.name} (${o.huntSanity.summary})`).join(', ')}.`,
    cardId: `g:${g.id}:san`,
  }
}

/**
 * Un seuil sans valeur habituelle (Thayé, Obambo) : son résumé face aux résumés d'autres seuils
 * particuliers, de même longueur et de même forme, qui ne partagent aucune de ses valeurs.
 */
const sanitySummary: Gen = (g, ctx) => {
  if (g.id === MIMIC || baseSanity(g) != null || !thresholds(g).size) return null
  const right = g.huntSanity.summary
  if (namesAny(right, ctx.allGhosts)) return null
  const mine = thresholds(g)
  const pool = shuffle(
    ctx.rng,
    ctx.allGhosts.filter(
      (o) =>
        o.id !== g.id &&
        o.id !== MIMIC &&
        thresholds(o).size > 0 &&
        ![...thresholds(o)].some((v) => mine.has(v)) &&
        !namesAny(o.huntSanity.summary, ctx.allGhosts),
    ),
  ).map((o) => ({ value: o, label: o.huntSanity.summary }))
  const wrong = matching(ctx.rng, right, pool)
  if (!wrong) return null
  return {
    id: `q:sansum:${g.id}`,
    topic: 'sanity',
    ghostId: g.id,
    prompt: `Quelle description correspond au seuil de chasse ${de(g.name)}${NNBSP}?`,
    multi: false,
    choices: shuffle(ctx.rng, [{ id: g.id, label: right }, ...wrong.map((o) => ({ id: o.value.id, label: o.label }))]),
    correct: [g.id],
    explain: [right, ...g.huntSanity.details.slice(0, 2)].join(' — '),
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

/** « 1,7 m/s », « 1,53 m/s », « 3,0 m/s » : une décimale, deux si la vitesse en a deux. */
const decimals = (v: number) => (Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? 1 : 2)
const mps = (v: number) => `${v.toFixed(decimals(v)).replace('.', ',')}${NBSP}m/s`

/** Les vitesses que le jeu donne vraiment (sans le Mimic, qui copie). */
const gameSpeeds = perList((all) =>
  [...new Set(all.filter((g) => g.id !== MIMIC && known(g)).flatMap((g) => [...speedValues(g)]))].sort((a, b) => a - b),
)

/**
 * La vitesse habituelle d'une entité, celle que son résumé cite seule en premier (« 1,7 m/s · 2,5 m/s près
 * de l'électronique », « 1,7 m/s de loin · … »). Aucune pour une plage, une vitesse qui change en continu
 * (« 3,0 m/s de loin → 0,4 m/s tout près »), deux vitesses au choix (« 1,5 ou 1,9 m/s ») ou une vitesse
 * copiée (le Mimic).
 */
function baseSpeed(g: Ghost): number | null {
  if (g.id === MIMIC || !known(g) || g.speed.isRange) return null
  const m = /^(\d+(?:,\d+)?)\s?m\/s(?:\s+de\s+loin)?$/u.exec(g.speed.summary.split(/\s+·\s+/u)[0])
  const v = m ? Number(m[1].replace(',', '.')) : NaN
  return speedValues(g).has(v) ? v : null
}

/**
 * « Quelle est la vitesse de chasse habituelle du Raiju ? » : quatre vitesses que le jeu connaît, de même
 * précision que la bonne quand c'est possible. Aucune mauvaise réponse n'est une vitesse que l'entité peut
 * avoir (« 2,5 m/s » face au Raiju près de l'électronique). La ligne de vue a sa propre question.
 */
/** Les vitesses habituelles des entités (1,0, 1,53 et 1,7 m/s). */
const baseSpeeds = perList((all) => new Set(all.map(baseSpeed).filter((v): v is number => v != null)))

const speedOfGhost: Gen = (g, ctx) => {
  const base = baseSpeed(g)
  if (base == null) return null
  if (base === STANDARD_SPEED && ctx.rng() >= KEEP_STANDARD_SPEED) return null
  const values = gameSpeeds(ctx.allGhosts).filter((v) => !speedValues(g).has(v))
  // d'abord les vitesses habituelles d'autres entités (1,0, 1,53, 1,7 m/s), et face à une vitesse
  // particulière, « 1,7 m/s » toujours (voir KEEP_STANDARD_SPEED)
  const prefer = baseSpeeds(ctx.allGhosts)
  const opts = { prefer, include: STANDARD_SPEED }
  const wrong =
    nearbyValues(
      ctx.rng,
      base,
      values.filter((v) => decimals(v) === decimals(base) || prefer.has(v)),
      3,
      opts,
    ) ?? nearbyValues(ctx.rng, base, values, 3, opts)
  if (!wrong) return null
  return {
    id: `q:spd:${g.id}`,
    topic: 'speed',
    ghostId: g.id,
    prompt: `Quelle est la vitesse de chasse habituelle ${de(g.name)}${NNBSP}?`,
    multi: false,
    choices: shuffle(ctx.rng, [{ id: g.id, label: mps(base) }, ...wrong.map((v) => ({ id: `v:${v}`, label: mps(v) }))]),
    correct: [g.id],
    explain: spellLdV([g.speed.summary, ...g.speed.details.slice(0, 2)].join(' — ')),
    cardId: `g:${g.id}:spd`,
  }
}

/**
 * Une entité à la vitesse standard, posée à l'envers (sans quoi « 1,7 m/s » serait presque toujours la
 * bonne réponse) : « Laquelle de ces entités a une vitesse de chasse habituelle de 1,7 m/s ? », face à
 * trois entités qui n'y passent jamais (Revenant, Jumeaux, Aswang, Obambo). Un seul identifiant pour toutes.
 */
const speedStandard: Gen = (g, ctx) => {
  if (baseSpeed(g) !== STANDARD_SPEED) return null
  const pool = neverAt(ctx.allGhosts.filter(known), speedValues, (o) => o.speed.summary, STANDARD_SPEED, (o) => o.speed.isRange)
  if (pool.length < 3) return null
  const wrong = sample(ctx.rng, pool, 3)
  return {
    id: 'q:spd:std',
    topic: 'speed',
    ghostId: g.id,
    prompt: `Laquelle de ces entités a une vitesse de chasse habituelle de ${mps(STANDARD_SPEED)}, comme une entité standard${NNBSP}?`,
    multi: false,
    choices: shuffle(ctx.rng, [g, ...wrong]).map(ghostChoice),
    correct: [g.id],
    explain: spellLdV(`${g.name}${NNBSP}: ${g.speed.summary}. Les autres ont une autre vitesse habituelle${NNBSP}: ${wrong.map((o) => `${o.name} (${o.speed.summary})`).join(', ')}.`),
    cardId: `g:${g.id}:spd`,
  }
}

/**
 * Une vitesse qui n'est pas un seul nombre (plage, deux états, selon la distance) : son résumé face aux
 * résumés d'autres vitesses particulières, de même longueur et de même forme, faux pour l'entité.
 */
const speedSummary: Gen = (g, ctx) => {
  if (g.id === MIMIC || !known(g) || baseSpeed(g) != null) return null
  const right = spellLdV(g.speed.summary)
  if (namesAny(right, ctx.allGhosts)) return null
  const pool = shuffle(
    ctx.rng,
    ctx.allGhosts.filter(
      (o) =>
        o.id !== g.id &&
        o.id !== MIMIC &&
        known(o) &&
        o.speed.summary !== g.speed.summary &&
        !partlyTrueSpeed(o, g) &&
        !namesAny(o.speed.summary, ctx.allGhosts),
    ),
  ).map((o) => ({ value: o, label: spellLdV(o.speed.summary) }))
  const wrong = matching(ctx.rng, right, pool)
  if (!wrong) return null
  return {
    id: `q:spdsum:${g.id}`,
    topic: 'speed',
    ghostId: g.id,
    prompt: `Quelle description correspond à la vitesse de chasse ${de(g.name)}${NNBSP}?`,
    multi: false,
    choices: shuffle(ctx.rng, [{ id: g.id, label: right }, ...wrong.map((o) => ({ id: o.value.id, label: o.label }))]),
    correct: [g.id],
    explain: spellLdV([g.speed.summary, ...g.speed.details.slice(0, 2)].join(' — ')),
    cardId: `g:${g.id}:spd`,
  }
}

/**
 * Cinq entités seulement n'accélèrent pas en ligne de vue : posée à chaque fois, « Oui » gagnerait quatre
 * fois sur cinq. Une entité qui accélère n'est demandée qu'une fois sur cinq : « Oui » et « Non » s'équilibrent.
 */
const KEEP_LOS_YES = 0.2

const losOfGhost: Gen = (g, ctx) => {
  // ligne de vue « selon les conditions » (Kormos, Dayan, Raiju…) : ni oui ni non
  if (!known(g) || g.id === MIMIC || g.speed.losVaries) return null
  if (g.speed.los && ctx.rng() >= KEEP_LOS_YES) return null
  return {
    id: `q:los:${g.id}`,
    topic: 'speed',
    ghostId: g.id,
    // on demande si l'entité accélère, pas si l'accélération est « standard » (Aswang, Jumeaux : particulière)
    prompt: `${g.name}${NNBSP}: pendant une chasse, l’entité accélère-t-elle quand elle te voit (ligne de vue)${NNBSP}?`,
    multi: false,
    choices: [
      { id: 'yes', label: 'Oui, elle accélère en ligne de vue' },
      { id: 'no', label: 'Non, elle n’accélère pas en ligne de vue' },
    ],
    correct: [g.speed.los ? 'yes' : 'no'],
    explain: spellLdV(`${g.speed.summary}. ${g.speed.details[0] ?? ''}`.trim()),
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

/**
 * Le Mimic n'a ni vitesse ni seuil à lui : il copie ceux de l'entité imitée. « Quelle entité a ce seuil
 * de chasse ? », son résumé face à trois entités qui ne copient rien (des noms : la forme ne souffle rien).
 */
function copyOf(kind: 'san' | 'spd'): Gen {
  return (g, ctx) => {
    if (g.id !== MIMIC) return null
    const quote = spellLdV(redact(kind === 'san' ? g.huntSanity.summary : g.speed.summary, g))
    if (names(quote, g)) return null
    const others = sample(
      ctx.rng,
      ctx.allGhosts.filter((o) => o.id !== g.id && !names(quote, o)),
      3,
    )
    if (others.length < 3) return null
    return {
      id: `q:copy:${kind}:${g.id}`,
      topic: kind === 'san' ? 'sanity' : 'speed',
      ghostId: g.id,
      prompt: kind === 'san' ? 'Quelle entité a ce seuil de chasse ?' : 'En chasse, quelle entité se déplace ainsi ?',
      quote,
      multi: false,
      choices: shuffle(ctx.rng, [g, ...others]).map(ghostChoice),
      correct: [g.id],
      explain: `${g.name}${NNBSP}: ${kind === 'san' ? g.huntSanity.summary : spellLdV(g.speed.summary)}`,
      cardId: `g:${g.id}:${kind}`,
    }
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

/**
 * « Peut chasser dès 65 % près de l'électronique », « jusqu'à 80 % si l'on parle » : à moitié vrai d'une entité
 * qui chasse déjà à ce niveau (le Démon, à 70 % partout). Une telle phrase n'est jamais une mauvaise réponse
 * pour elle, même si la condition (l'électronique, la voix) ne la concerne pas.
 */
function huntsAlready(text: string, g: Ghost): boolean {
  const top = Math.max(...thresholds(g))
  return [...text.matchAll(/(?:dès|jusqu['’]à|à partir de)\s+(\d+)\s?%/gu)].some((m) => top >= Number(m[1]))
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

/**
 * Une phrase de départage dont la forme ne dit pas d'où elle vient. Sans comparatif (« ralentit elle aussi
 * près des joueurs » → « ralentit près des joueurs ») : seule la bonne réponse, tirée de la fiche de X,
 * pouvait se comparer à X. Et « L’autre » pour sujet plutôt qu'un pronom (« Il alterne… », « Lui aussi
 * réagit… », « Lui non plus… » → « L’autre alterne… », « L’autre réagit… »), comme les autres réponses ; pas quand la phrase
 * nomme déjà l'entité dont elle parle (elle deviendrait deux fois « l’autre »), ni « Il faut », « Il y a ».
 */
const withoutComparatives = (text: string) =>
  text.replace(/\s+(?:lui|elle|eux|elles)\s+(?:aussi|non\s+plus)(?!\p{L})|\s+(?:aussi|également|non\s+plus)(?!\p{L})/gu, '')
function plainClaim(text: string, about: Ghost): string {
  // « Lui aussi … le Thayé … » : rien à changer sans casser la phrase
  const lead = /^(?:Lui|Elle)\s+(?:aussi|non\s+plus)\s+/u
  if (names(text, about)) return lead.test(text) ? text : withoutComparatives(text)
  return withoutComparatives(text.replace(lead, 'L’autre ')).replace(/^(?:Il|Elle)\s+(?!(?:faut|suffit|y\s+a)(?!\p{L}))/u, 'L’autre ')
}
/** Ce qu'une fiche y dit d'une entité z qu'on confond avec elle (sans preuve, sans ce qui décrit y). */
interface Claim {
  y: Ghost
  z: Ghost
  text: string
}

/** Toutes les phrases des confusions, de toutes les fiches (jamais sur le Mimic, ni de sa fiche). */
const claimsOf = perList((all) => {
  const byId = new Map(all.map((o) => [o.id, o]))
  const out: Claim[] = []
  for (const y of all) {
    if (y.id === MIMIC) continue
    for (const c of y.confusions) {
      const z = byId.get(c.with)
      if (!z || z.id === y.id || z.id === MIMIC) continue
      const text = partnerClaim(c.why, y, z)
      if (text) out.push({ y, z, text })
    }
  }
  return out
})

/** Un comparatif sans repère (« lui aussi », « non plus ») : lu loin de sa fiche, on ne sait plus à qui il compare. */
const RELATIVE = /(?<!\p{L})(?:aussi|non plus|également|contrairement|comme (?:lui|elle|eux))(?!\p{L})/iu

const wrongClaimCache = new WeakMap<readonly Ghost[], Map<string, (Claim & { label: string })[]>>()

/**
 * Les phrases qui peuvent servir de mauvaise réponse quand la bonne parle de g, avec ou sans leurs apartés :
 * aucune ne parle de g ni ne lui convient (« Il chasse à 1,7 m/s et à 50 % » est vrai du Myling comme du
 * Goryo), et leur pronom (« elle », « il ») ne les écarte pas d'emblée. L'entité dont parle chaque phrase
 * devient « l’autre ».
 */
function wrongClaimsFor(g: Ghost, all: readonly Ghost[]): (Claim & { label: string })[] {
  let byGhost = wrongClaimCache.get(all)
  if (!byGhost) wrongClaimCache.set(all, (byGhost = new Map()))
  const cached = byGhost.get(g.id)
  if (cached) return cached
  const out: (Claim & { label: string })[] = []
  for (const c of claimsOf(all)) {
    if (c.z.id === g.id) continue
    // sans ses apartés, mais jamais coupée : « L’autre a une activité d’objets ordinaire » (sans « … et attend 180 s
    // après l’encens ») serait vrai de presque toutes les entités
    for (const text of distinctBy([c.text, withoutAsides(c.text)].map((t) => plainClaim(t, c.z)), (t) => t)) {
      if (text.length < 30) continue
      if (names(text, g) || pronounClash(text, g) || fitsToo(text, all, true)(g) || numbersFit(text, g) || huntsAlready(text, g)) continue
      const label = asOther(text, c.z)
      // un nom entre « » n'est pas caviardé : il soufflerait de qui parle la phrase
      if (!names(label, c.z)) out.push({ ...c, text, label })
    }
  }
  byGhost.set(g.id, out)
  return out
}

/** Une paire à départager : ce que la fiche de x dit de g, et les phrases qui peuvent servir de mauvaises réponses. */
interface Duel {
  x: Ghost
  /** la bonne réponse, puis sa version sans apartés */
  rights: string[]
  explain: string
  /** score : d'abord ce que la fiche de x dit d'autres entités, puis ce qu'on dit des entités qu'on confond avec x ou g */
  wrong: { option: Option<Ghost>; score: number }[]
}
const duels = new WeakMap<readonly Ghost[], Map<string, Duel[]>>()

/** Les paires utilisables pour g : calculées une fois (les fiches ne changent pas), le tirage vient ensuite. */
function duelsFor(g: Ghost, all: readonly Ghost[]): Duel[] {
  let byGhost = duels.get(all)
  if (!byGhost) duels.set(all, (byGhost = new Map()))
  const cached = byGhost.get(g.id)
  if (cached) return cached
  const out: Duel[] = []
  const nearG = new Set(g.confusions.map((c) => c.with))
  for (const x of all) {
    if (x.id === g.id || x.id === MIMIC) continue
    const nearX = new Set(x.confusions.map((c) => c.with))
    for (const pair of x.confusions.filter((c) => c.with === g.id)) {
      const claim = partnerClaim(pair.why, x, g)
      if (!claim) continue
      const right = asOther(plainClaim(claim, g), g)
      // un nom entre « » n'est pas caviardé : il soufflerait la réponse
      if (names(right, g)) continue
      const bare = withoutAsides(right)
      const rights = bare !== right && bare.length >= 30 ? [right, bare] : [right]
      const wrong = wrongClaimsFor(g, all)
        .filter(
          (c) =>
            c.z.id !== x.id &&
            !names(c.label, x) &&
            // hors de la fiche de x, « non plus » ne compare plus à personne (« aussi » est déjà retiré)
            (c.y.id === x.id || !RELATIVE.test(c.text)) &&
            !rights.includes(c.label),
        )
        .map((c) => ({
          option: { value: c.z, label: c.label },
          score: (c.y.id === x.id ? 4 : 0) + (nearX.has(c.z.id) ? 2 : 0) + (nearG.has(c.z.id) ? 1 : 0),
        }))
      if (new Set(wrong.map((w) => w.option.value.id)).size < 3) continue
      // le corrigé garde les deux noms, et ce qui distingue x de son côté
      const full = noLeadingMais(confusionWithoutEvidence(pair.why))
      out.push({ x, rights, wrong, explain: names(full, g) ? full : `${g.name}${NNBSP}: ${uncap(full)}` })
    }
  }
  byGhost.set(g.id, out)
  return out
}

/** Des réponses sur des entités toutes différentes (une entité, une réponse). */
const distinctGhostsOf = (gs: readonly Ghost[]) => new Set(gs.map((g) => g.id)).size === gs.length
const distinctGhosts = (chosen: readonly Option<Ghost>[]) => distinctGhostsOf(chosen.map((o) => o.value))

/**
 * « Comment distinguer X de g sans preuve ? » : la bonne réponse est ce que la fiche de X dit de g ; les
 * mauvaises, ce que les fiches disent d'autres entités (d'abord celles qu'on confond avec X), de même
 * longueur et de même forme. Dans chaque réponse, l'entité dont elle parle devient « l’autre ».
 */
const distinguish: Gen = (g, ctx) => {
  // le Mimic peut copier n'importe quel comportement : une mauvaise réponse pourrait être vraie pour lui
  if (g.id === MIMIC) return null
  const tries = shuffle(ctx.rng, duelsFor(g, ctx.allGhosts)).map((d) => ({
    d,
    pool: shuffle(ctx.rng, d.wrong)
      .sort((a, b) => b.score - a.score)
      .map((w) => w.option),
  }))
  return byRank(ctx.rng, (ranks) => {
    for (const { d, pool } of tries) {
      for (const right of d.rights) {
        const wrong = matching(ctx.rng, right, pool, 3, distinctGhosts, ranks)
        if (!wrong) continue
        return {
          id: `q:dist:${d.x.id}:${g.id}`,
          topic: 'zero',
          ghostId: g.id,
          prompt: `Comment distinguer ${le(d.x.name)} ${de(g.name)} sans preuve${NNBSP}?`,
          multi: false,
          choices: shuffle(ctx.rng, [{ id: g.id, label: right }, ...wrong.map((o) => ({ id: o.value.id, label: o.label }))]),
          correct: [g.id],
          explain: d.explain,
          cardId: `g:${g.id}:tells`,
        }
      }
    }
    return null
  })
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
  speed: [speedOfGhost, speedStandard, speedSummary, losOfGhost, speedProfile, copyOf('spd')],
  sanity: [sanityOfGhost, sanityStandard, sanitySummary, earlyHunter, sanityProfile, copyOf('san')],
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

/* ==========================================================================
   Les cartes de révision posées en QCM
   ========================================================================== */

export interface CardQuizContext {
  allGhosts: Ghost[]
  mechanics: Mechanics
  /** les notes du carnet (cartes « note ») */
  notes?: readonly CoachNote[]
  /** le jour (dayKey) : une carte garde les mêmes choix toute la journée, même si la page se redessine */
  day: string
}

const CARD_TOPIC: Record<CardKind, QuizTopic> = {
  sanity: 'sanity',
  speed: 'speed',
  tells: 'behavior',
  reverse: 'behavior',
  test: 'zero',
  fact: 'mechanics',
  note: 'expert',
}

/** Le tirage d'une carte pour un jour donné : mêmes choix, dans le même ordre, à chaque affichage. */
const cardRng = (cardId: string, day: string): Rng => createRng(parseInt(hashString(`${cardId}|${day}`), 36))

/**
 * Les vitesses citées par un signe (hors 1,7 m/s, celle de tout le monde) sont-elles à 0,1 m/s près celles
 * de o ? « 1,5 ou 1,9 m/s » (Jumeaux) ne prend pas pour mauvaise réponse l'Obambo (≈ 1,45 et 1,96 m/s).
 */
function nearSpeed(text: string, o: Ghost): boolean {
  const cited = [...text.matchAll(/(\d+,\d+)(?=\s*(?:m\/s|(?:ou|à|et|→|-)\s*\d+(?:,\d+)?\s*m\/s))/gu)]
    .map((m) => Number(m[1].replace(',', '.')))
    .filter((v) => v !== 1.7)
  return cited.some((v) => [...speedValues(o)].some((w) => Math.abs(v - w) <= 0.1 + 1e-9))
}

/** « Quelle entité correspond à ce signe ? » : le signe (déjà caviardé) face à trois entités qu'il ne décrit pas. */
function signQuestion(g: Ghost, quote: string, ctx: QuizOptions): Question | null {
  if (!quote || names(quote, g) || needsEvidence(quote)) return null
  // « Ne touche pas au sel » ne prend pas le Gallu pour mauvaise réponse (enragé, il ne perturbe pas le sel non plus)
  const themes = themesOf(quote).filter((t) => NARROW.has(t))
  const apart = (o: Ghost) => !nearSpeed(quote, o) && !o.keyTells.some((t) => themesOf(t).some((th) => themes.includes(th)))
  const others = pickDistractors(g, quote, ctx, 3, apart)
  if (!others) return null
  return {
    id: `q:sign:${g.id}`,
    topic: 'behavior',
    ghostId: g.id,
    prompt: 'Quelle entité correspond à ce signe ?',
    quote,
    multi: false,
    choices: shuffle(ctx.rng, [g, ...others]).map(ghostChoice),
    correct: [g.id],
    explain: `${g.name}${NNBSP}: ${g.summary}`,
  }
}

/* ---------- « Lequel de ces signes est celui de X ? » ---------- */

/**
 * Les grands thèmes d'un signe. Une mauvaise réponse ne touche jamais un thème des signes de l'entité
 * demandée : « Ne perturbe jamais le sel » pourrait être à moitié vrai d'une entité dont la fiche parle
 * du sel (le Gallu enragé non plus ne le perturbe pas).
 */
const THEMES = {
  sel: /\bsel\b/iu,
  encens: /encens/iu,
  crucifix: /crucifix/iu,
  disjoncteur: /disjoncteur/iu,
  lumiere: /lumi[eè]re|interrupteur|lampe|ampoule/iu,
  porte: /\bportes?\b/iu,
  flamme: /flamme|bougie|\bfeu\b/iu,
  ouija: /ouija|âge/iu,
  son: /micro|parabolique|enregistreur|\bcris?\b|\bsons?\b/iu,
  boite: /boîte à musique/iu,
  objetMaudit: /cercle|patte de singe|poupée|miroir|tarot/iu,
  photo: /photo|vidéo|caméra|film/iu,
  electronique: /électroni|appareil/iu,
  visible: /visible|invisib|clignot|apparent|modèle|transform/iu,
  objets: /objets?\b|lance|projet/iu,
  ecoute: /\bvoix\b|\bpas\b(?=\s+(?:et|manquant))|bruits?\s+de\s+pas|entend|silenci|écoute/iu,
  cachette: /cach/iu,
  evenement: /événement|brouillard|bulle/iu,
  capteur: /capteur|détecteur/iu,
  froid: /froid|buée|températur|glac/iu,
  errance: /\berre|errance|pièce favorite|de pièce|s['’]éloigne|déplacement|téléport|abords/iu,
  sante: /santé/iu,
  vitesse: /m\/s|vitesse|accél|ralenti|rapide|\blente?\b|fonce/iu,
  seuil: /seuil|chass\p{L}*\s+(?:dès|à|selon)|\d+\s*%/iu,
  cible: /\bcibles?\b|poursui|multijoueur|joueurs?\s+(?:proches?|pris)/iu,
  activite: /\bactif\b|\bactive\b|activité|interagi|interaction/iu,
} satisfies Record<string, RegExp>
type Theme = keyof typeof THEMES
const themesOf = (text: string) => (Object.keys(THEMES) as Theme[]).filter((k) => THEMES[k].test(text))
/**
 * Les thèmes précis (un objet, un geste du joueur) : un signe sur le sel ne prend pas pour mauvaise réponse
 * une entité dont un signe clé parle aussi du sel. La vitesse, le seuil et la santé, trop larges, sont
 * déjà départagés par les valeurs citées (fitsToo).
 */
const NARROW: ReadonlySet<Theme> = new Set<Theme>([
  'sel', 'encens', 'crucifix', 'disjoncteur', 'lumiere', 'porte', 'flamme', 'ouija', 'son', 'boite', 'objetMaudit',
  'photo', 'electronique', 'visible', 'objets', 'ecoute', 'cachette', 'evenement', 'capteur', 'froid', 'errance',
])

/** Ce qui parle du sexe de l'entité (« Toujours féminine ») : vrai de plusieurs entités, jamais une mauvaise réponse. */
const GENDER_TALK = /f[ée]minin|masculin|\bsexe\b|prénom/iu
/** Les signes qui ne parlent que de vitesse ou de seuil : ils ont déjà leur carte, on préfère un comportement. */
const SPEED_OR_SANITY = /m\/s|\bvitesse\b|\bseuil\b|\bLdV\b|ligne de vue|chass\p{L}*\s+(?:dès|à)\s*\d/iu

/** Un signe clé gardé pour la révision : sans preuve, ni liste de preuves. */
const plainSign = (t: string) => !isEvidenceList(t) && !needsEvidence(t) && !mentionsEvidence(t)
/** Un signe qui se lit seulement à la suite d'un autre (« Chasse suivante : il fonce droit sur ce joueur »). */
const NEEDS_CONTEXT = /^Chasse suivante\b|\bce joueur\b/u

interface Sign {
  text: string
  ghost: Ghost
  themes: Theme[]
}
const signCache = new WeakMap<readonly Ghost[], Sign[]>()

/** Les signes clés de toutes les entités qui peuvent servir de mauvaise réponse (jamais ceux du Mimic). */
function distractorSigns(all: readonly Ghost[]): Sign[] {
  const cached = signCache.get(all)
  if (cached) return cached
  const out: Sign[] = []
  for (const g of all) {
    if (g.id === MIMIC) continue
    for (const text of g.keyTells) {
      if (!plainSign(text) || GENDER_TALK.test(text) || NEEDS_CONTEXT.test(text) || text.length > 170) continue
      // « ce n'est pas un Esprit », « deux en moins de 80 s : Myling » : un nom souffle de qui parle le signe
      if (all.some((o) => names(text, o))) continue
      out.push({ text, ghost: g, themes: themesOf(text) })
    }
  }
  signCache.set(all, out)
  return out
}

/** Les morceaux d'un signe (« Seuil de chasse 40 % · plus visible que la normale ») : chacun doit être faux pour l'entité. */
const clauses = (text: string) =>
  text
    .split(/\s+[·:;]\s+|\s*\(|\)\s*|,\s+(?=\p{Ll})/u)
    .map((c) => c.trim())
    .filter((c) => c.length >= 12)

/** Le signe d'une autre entité pourrait-il aussi décrire x (en tout ou en partie) ? */
function signFits(text: string, x: Ghost, all: readonly Ghost[]): boolean {
  if (numbersFit(text, x) || huntsAlready(text, x) || fitsToo(text, all, true)(x) || restatedBy(text, x, all)) return true
  return clauses(text).some((c) => c !== text && (numbersFit(c, x) || fitsToo(c, all, true)(x) || restatedBy(c, x, all)))
}

/**
 * « Lequel de ces signes est celui de X ? » : un signe clé de X (un comportement de préférence, la vitesse
 * et le seuil ayant leur carte) face à des signes clés d'autres entités, faux pour X. Une mauvaise réponse
 * ne touche aucun thème des signes de X, ne colle pas à sa fiche, ne nomme personne, et son pronom ne
 * l'écarte pas d'emblée. Les quatre signes ont la même forme (longueur, « · », parenthèses, chiffres) : au
 * besoin, un signe perd ses apartés ou sa seconde partie.
 */
function signOfGhost(x: Ghost, ctx: QuizOptions): Question | null {
  if (x.id === MIMIC) return null
  const all = ctx.allGhosts
  const own = x.keyTells.filter(plainSign)
  // « Toujours féminine » soufflerait « la Banshee » : le genre ne sert jamais de bonne réponse non plus
  const mine = own
    .filter((t) => !names(t, x) && !GENDER_TALK.test(t) && !NEEDS_CONTEXT.test(t) && t.length <= 200)
    .map((t) => ({ t, k: x.keyTells.indexOf(t) }))
  const behaviour = mine.filter(({ t }) => !SPEED_OR_SANITY.test(t))
  const pool = behaviour.length ? behaviour : mine
  if (!pool.length) return null
  const clash = (t: string) => pronounClash(t, x)
  const partners = new Set(x.confusions.map((c) => c.with))
  // une mauvaise réponse par entité et par thème, d'abord parmi celles qu'on confond avec X
  const ranked = shuffle(ctx.rng, signVersions(x, all)).sort((a, b) => Number(partners.has(b.value.ghost.id)) - Number(partners.has(a.value.ghost.id)))
  const apart = (chosen: readonly Option<Sign>[]) =>
    distinctGhostsOf(chosen.map((o) => o.value.ghost)) && new Set(chosen.map((o) => o.value.themes.join() || o.value.text)).size === chosen.length
  const signs = shuffle(ctx.rng, pool)
  return byRank(ctx.rng, (ranks) => {
    for (const { t, k } of signs) {
      // le signe entier, sinon une version plus courte, pour qu'il ait la forme des mauvaises réponses
      for (const right of [t, ...shortened(t)]) {
        const options = clash(right) ? ranked : ranked.filter((o) => !clash(o.label))
        const wrong = matching(ctx.rng, right, options, 3, apart, ranks)
        if (!wrong) continue
        return {
          id: `q:sign-of:${x.id}:${k}`,
          topic: 'behavior',
          ghostId: x.id,
          prompt: `Lequel de ces signes est celui ${de(x.name)}${NNBSP}?`,
          multi: false,
          choices: shuffle(ctx.rng, [{ id: x.id, label: right }, ...wrong.map((o) => ({ id: o.value.ghost.id, label: o.label }))]),
          correct: [x.id],
          explain: `${x.name}${NNBSP}: ${x.summary}`,
        }
      }
    }
    return null
  })
}

const signVersionCache = new WeakMap<readonly Ghost[], Map<string, Option<Sign>[]>>()

/**
 * Les signes clés d'autres entités qui peuvent servir de mauvaise réponse pour X, avec leurs versions plus
 * courtes : aucun ne touche un thème des signes de X, ni ne lui convient, même en partie.
 */
function signVersions(x: Ghost, all: readonly Ghost[]): Option<Sign>[] {
  let byGhost = signVersionCache.get(all)
  if (!byGhost) signVersionCache.set(all, (byGhost = new Map()))
  const cached = byGhost.get(x.id)
  if (cached) return cached
  const own = x.keyTells.filter(plainSign)
  // les thèmes précis seulement : la vitesse, le seuil et la santé sont départagés par les valeurs citées
  // (signFits) ; sinon un signe chiffré de X ne croiserait jamais une mauvaise réponse chiffrée
  const taken = new Set(themesOf([...own, ...x.tells.filter((t) => t.zeroEvidence).map((t) => t.text)].join(' ')).filter((t) => NARROW.has(t)))
  const out = distractorSigns(all)
    .filter((s) => s.ghost.id !== x.id && !s.themes.some((i) => taken.has(i)) && !signFits(s.text, x, all))
    .flatMap((s) => [s.text, ...shortened(s.text).filter((v) => !signFits(v, x, all))].map((label) => ({ value: s, label })))
  byGhost.set(x.id, out)
  return out
}

/* ---------- tests sans preuve ---------- */

/**
 * « Ce test confirme quelle entité ? » pour le test de la carte ; s'il ne peut pas se citer tel quel,
 * « Quel test confirme X ? », face aux tests d'autres entités.
 */
function testOfCard(card: Card, g: Ghost, ctx: QuizOptions): Question | null {
  const k = Number(card.id.split(':').pop())
  const t = zeroTests(g).find((x) => x.k === k)
  if (!t) return null
  const partners = new Set(g.confusions.map((c) => c.with))
  const plausible = (pool: Ghost[]) =>
    shuffle(ctx.rng, pool).sort((a, b) => Number(partners.has(b.id)) - Number(partners.has(a.id)))
  const quote = quoteFor(t.text, g)
  if (quote) {
    const gender = sameGender(quote, g)
    // une entité nommée dans le test (« plus tôt qu'un Démon ») s'écarte d'un coup d'œil
    const pool = ctx.allGhosts.filter((o) => o.id !== g.id && o.id !== MIMIC && zeroTests(o).length > 0 && !names(t.text, o) && gender(o))
    if (pool.length >= 3) {
      const wrong = sample(ctx.rng, plausible(pool).slice(0, 6), 3)
      return {
        id: `q:test:${g.id}:${k}`,
        topic: 'zero',
        ghostId: g.id,
        prompt: 'Ce test confirme quelle entité ?',
        quote,
        multi: false,
        choices: shuffle(ctx.rng, [g, ...wrong]).map(ghostChoice),
        correct: [g.id],
        explain: `Test de confirmation ${de(g.name)}. ${g.summary}`,
      }
    }
  }
  // les tests des autres entités, chacun caviardé de son propre nom (« c'est cette entité »), de même forme
  // que le bon ; un test ne se coupe pas (sa condition et sa conclusion vont ensemble), il perd au plus ses apartés
  const full = redact(withoutEvidenceAsides(t.text), g)
  if (names(full, g)) return null
  const pool = plausible(ctx.allGhosts.filter((o) => o.id !== g.id && o.id !== MIMIC)).flatMap((o) =>
    zeroTests(o)
      .map((z) => quoteFor(z.text, o))
      .filter((q): q is string => !!q && !namesAny(q, ctx.allGhosts))
      .flatMap((q) => [q, withoutAsides(q)])
      .map((label) => ({ value: o, label })),
  )
  const versions = distinctBy([full, withoutAsides(full)], (s) => s)
  return byRank(ctx.rng, (ranks) => {
    for (const right of versions) {
      const wrong = matching(ctx.rng, right, pool, 3, distinctGhosts, ranks)
      if (!wrong) continue
      return {
        id: `q:test-of:${g.id}:${k}`,
        topic: 'zero',
        ghostId: g.id,
        prompt: `Quel test confirme ${le(g.name)} sans preuve${NNBSP}?`,
        multi: false,
        choices: shuffle(ctx.rng, [{ id: g.id, label: right }, ...wrong.map((o) => ({ id: o.value.id, label: o.label }))]),
        correct: [g.id],
        explain: `Test de confirmation ${de(g.name)}. ${g.summary}`,
      }
    }
    return null
  })
}

/* ---------- les cartes écrites : mécaniques et notes ---------- */

/** 2 à 4 réponses distinctes et non vides, la bonne au rang `answer` : sinon, pas de QCM. */
function authoredChoices(labels: readonly unknown[] | undefined, answer: unknown): string[] | null {
  if (!Array.isArray(labels) || typeof answer !== 'number' || !Number.isInteger(answer)) return null
  const out = labels.map((l) => (typeof l === 'string' ? l.trim() : ''))
  if (out.length < 2 || out.length > 4 || answer < 0 || answer >= out.length || out.some((l) => !l)) return null
  if (new Set(out.map((l) => l.toLocaleLowerCase('fr'))).size !== out.length) return null
  return out
}

function factOfCard(card: Card, ctx: CardQuizContext, rng: Rng): Question | null {
  const id = card.id.replace(/^m:/u, '')
  const f = ctx.mechanics.topics.flatMap((t) => t.facts).find((x) => x.id === id)
  const labels = f ? authoredChoices(f.choices, f.answer) : null
  if (!f || !labels) return null
  return {
    id: `q:fact:${f.id}`,
    topic: 'mechanics',
    prompt: f.q,
    multi: false,
    choices: shuffle(
      rng,
      labels.map((label, i) => ({ id: String(i), label })),
    ),
    correct: [String(f.answer)],
    explain: f.a,
    cardId: card.id,
  }
}

/** Une note devient un QCM avec sa question, sa réponse et au moins une mauvaise réponse (écrites telles quelles). */
function noteOfCard(card: Card, ctx: CardQuizContext, rng: Rng): Question | null {
  const note = ctx.notes?.find((n) => `n:${n.id}` === card.id)
  const question = note?.question?.trim()
  const answer = note?.answer?.trim()
  if (!note || !question || !answer) return null
  const seen = new Set([answer.toLocaleLowerCase('fr')])
  const wrong = (note.wrong ?? [])
    .map((w) => (typeof w === 'string' ? w.trim() : ''))
    .filter((w) => {
      const key = w.toLocaleLowerCase('fr')
      if (!w || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 3)
  if (!wrong.length) return null
  return {
    id: `q:note:${note.id}`,
    topic: 'expert',
    ghostId: note.ghostId ?? undefined,
    prompt: question,
    multi: false,
    choices: shuffle(rng, [answer, ...wrong].map((label, i) => ({ id: String(i), label }))),
    correct: ['0'],
    explain: card.back,
    cardId: card.id,
  }
}

/**
 * La question à choix d'une carte de révision, ou null si la carte se révise en se testant soi-même
 * (fait de mécanique sans réponses rédigées, note sans mauvaise réponse). Le tirage ne dépend que de
 * la carte et du jour : la page peut se redessiner, les choix ne bougent pas.
 *
 * Mêmes règles que le quiz : une seule bonne réponse, aucune mauvaise réponse vraie aussi pour
 * l'entité, aucun nom ni pronom qui souffle la réponse, jamais le Mimic en mauvaise réponse, et des
 * réponses de même forme (voir homogeneous).
 */
export function questionForCard(card: Card, ctx: CardQuizContext): Question | null {
  const rng = cardRng(card.id, ctx.day)
  if (card.kind === 'fact') return factOfCard(card, ctx, rng)
  if (card.kind === 'note') return noteOfCard(card, ctx, rng)
  const g = ctx.allGhosts.find((x) => x.id === card.ghostId)
  if (!g) return null
  const opts: QuizOptions = { topics: [], ghosts: [g], allGhosts: ctx.allGhosts, mechanics: ctx.mechanics, count: 1, rng }
  const tries: (() => Question | null)[] = {
    // un nombre (« 70 % »), sinon des résumés de même forme, sinon des noms d'entités : le profil d'un seuil
    // ou d'une vitesse particuliers, puis, pour une entité standard, laquelle chasse comme elle
    sanity: [sanityOfGhost, sanitySummary, sanityProfile, sanityStandard, copyOf('san')].map((gen) => () => gen(g, opts)),
    speed: [speedOfGhost, speedSummary, speedProfile, speedStandard, copyOf('spd')].map((gen) => () => gen(g, opts)),
    test: [() => testOfCard(card, g, opts)],
    reverse: [() => signQuestion(g, card.quote ?? '', opts)],
    tells: [
      () => signOfGhost(g, opts),
      // le Mimic copie les signes des autres : on part de l'un des siens (« Change d'entité imitée… »)
      ...shuffle(rng, g.keyTells.filter(plainSign)).map((t) => () => signQuestion(g, redact(t, g), opts)),
      () => whichGhostTell(g, opts),
    ],
  }[card.kind]
  for (const make of tries) {
    const q = make()
    if (q) return { ...q, id: `q:card:${card.id}`, topic: CARD_TOPIC[card.kind], prompt: fr(q.prompt), explain: fr(noLeadingMais(q.explain)), cardId: card.id }
  }
  return null
}

export function isCorrect(q: Question, selected: string[]): boolean {
  if (selected.length !== q.correct.length) return false
  return q.correct.every((c) => selected.includes(c))
}
