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
  /** une précision au crayon sous l'énoncé (aucune question composée n'en a besoin aujourd'hui : un départage nomme l'entité dans chaque réponse) */
  note?: string
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

/** Ce que buildQuiz ajoute aux options pour une série sur une seule entité (« Me tester sur X »). */
interface Ctx extends QuizOptions {
  /** une seule entité (« Me tester sur X ») */
  solo?: boolean
  /** l'entité de la série, à proposer parmi les mauvaises réponses d'une question qui porte sur une autre */
  offer?: Ghost
  /** une seule entité : les questions à choix de noms déjà posées, et combien l'avaient pour réponse */
  tally?: { named: number; self: number }
  /** une seule entité : sa valeur standard (50 %, 1,7 m/s) se demande-t-elle dans cette série (voir SOLO_STANDARD) ? */
  standard?: Record<NumberKind, boolean>
  /** une seule entité, tirée encore et encore : un résumé seul plus long que les autres passe-t-il dans cette série (voir pickSummaries) ? */
  longest?: boolean
  /**
   * Les entités de la série quand elle n'en couvre qu'une partie (« les moins maîtrisées »), ou celles des
   * autres cartes de la séance de révision : les mauvaises réponses les prennent d'abord. Sinon la bonne
   * réponse serait souvent le seul nom familier parmi les choix.
   */
  pool?: ReadonlySet<string>
}

type Gen = (g: Ghost, ctx: Ctx) => Question | null

const known = (g: Ghost) => g.speed.min >= 0
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const uncap = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
/** Un corrigé ne commence jamais par « Mais » (reste d'une phrase dont on a retiré le début). */
const noLeadingMais = (s: string) => cap(s.replace(/^Mais\s+/u, ''))

/**
 * Un choix d'entité : son nom seul. « Esprit (Spirit) » face à « Revenant » serait la seule réponse avec une
 * parenthèse ; le nom anglais reste dans le corrigé (voir called) et sur la fiche.
 */
function ghostChoice(g: Ghost): Choice {
  return { id: g.id, label: g.name }
}

/** Le nom d'une entité en tête de corrigé, avec son nom anglais quand il diffère (« Esprit (Spirit) »). */
const called = (g: Ghost) => (g.name !== g.nameEn ? `${g.name} (${g.nameEn})` : g.name)

/** Le texte nomme-t-il cette entité (y compris entre « ») ? */
const names = namesGhost

/**
 * « Change d'entité imitée », « Copie la vitesse… » : cité, un signe du Mimic qui parle de copie souffle
 * « Mimic » à qui lit l'anglais, comme son nom.
 */
const leaksMimic = (text: string, g: Ghost) => g.id === MIMIC && /imit|copi/iu.test(text)

/**
 * Une citation prête à poser : caviardée, sans aparté qui passe par une preuve. Null si elle passe
 * encore par une preuve, ou si elle nomme l'entité entre « » (le caviardage n'y touche pas).
 */
function quoteFor(text: string, g: Ghost): string | null {
  const quote = redact(withoutEvidenceAsides(text), g)
  return needsEvidence(quote) || names(quote, g) || leaksMimic(quote, g) ? null : quote
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
function pickDistractors(g: Ghost, statement: string, ctx: Ctx, n = 3, also: (o: Ghost) => boolean = () => true): Ghost[] | null {
  const fits = fitsToo(statement, ctx.allGhosts)
  const gender = sameGender(statement, g)
  const pool = ctx.allGhosts.filter((o) => o.id !== g.id && o.id !== MIMIC && !fits(o) && gender(o) && !names(statement, o) && also(o))
  const partners = new Set(g.confusions.map((c) => c.with))
  const shared = (o: Ghost) => o.evidence.filter((e) => g.evidence.includes(e)).length
  const score = (o: Ghost) => (partners.has(o.id) ? 3 : 0) + shared(o)
  return withOffer(ctx, g, pool, n, (rest, k) => sample(ctx.rng, shuffle(ctx.rng, rest).sort((a, b) => score(b) - score(a)).slice(0, k + 3), k))
}

/**
 * n mauvaises réponses prises dans `eligible` (les entités qui peuvent en être une) par `take`. Quand la série
 * porte sur une seule entité et que la question parle d'une autre, l'entité de la série en fait toujours partie
 * (ctx.offer) : null si elle ne peut pas en être une (l'énoncé lui conviendrait aussi, son genre l'écarterait…).
 * Les entités de ctx.pool passent avant les autres (autant qu'il en faut et qu'il y en a), chaque groupe tiré
 * par `take`.
 */
function withOffer(ctx: Ctx, g: Ghost, eligible: readonly Ghost[], n: number, take: (rest: readonly Ghost[], k: number) => Ghost[]): Ghost[] | null {
  const must = ctx.offer && ctx.offer.id !== g.id ? ctx.offer : null
  if (must && !eligible.some((o) => o.id === must.id)) return null
  const rest = must ? eligible.filter((o) => o.id !== must.id) : eligible
  const k = must ? n - 1 : n
  if (rest.length < k) return null
  const pool = ctx.pool
  let picked: Ghost[]
  if (pool) {
    const listed = rest.filter((o) => pool.has(o.id))
    const first = listed.length ? take(listed, Math.min(k, listed.length)) : []
    picked = first.length < k ? [...first, ...take(rest.filter((o) => !pool.has(o.id)), k - first.length)] : first
  } else picked = take(rest, k)
  return picked.length < k ? null : must ? [must, ...picked] : picked
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
 * Les réponses ajoutées, après les 18 plus plausibles, du côté qui manque (plus longues ou plus courtes que la
 * bonne) : de quoi trouver un groupe dont les marques s'équilibrent au rang demandé.
 */
const EXTRA = 10

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
  /** d'abord les réponses aux marques identiques à celles de la bonne (sinon, l'ordre de `pool` seul compte) */
  sameFirst = true,
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
  const longer = (o: Option<T>) => shapeOf(o.label).len > r.len
  for (const cands of !sameFirst || same.length === usable.length ? [usable] : [same, usable]) {
    // les 18 premières (les plus plausibles) ; s'il y manque de quoi placer la bonne au rang demandé (assez de
    // réponses plus longues, ou plus courtes), les suivantes de ce côté-là : sinon une bonne réponse longue,
    // entourée de réponses plausibles mais courtes, finirait toujours la plus longue
    const head = cands.slice(0, 18)
    const tail = cands.slice(18)
    const more = head.filter(longer).length
    const less = head.length - more
    for (const wanted of ranks) {
      const top = [
        ...head,
        ...(more < wanted + EXTRA ? tail.filter(longer).slice(0, EXTRA) : []),
        ...(less < n - wanted + EXTRA ? tail.filter((o) => !longer(o)).slice(0, EXTRA) : []),
      ]
      const found = search(top, wanted)
      if (found) return found
    }
  }
  return null

  function search(top: readonly Option<T>[], wanted: number): Option<T>[] | null {
    const lens = top.map((o) => shapeOf(o.label).len)
    const marks = top.map((o) => shapeOf(o.label).marks)
    const idx: number[] = []
    // les premiers rangs d'abord ; un groupe trop étalé en longueur ne fait que s'étaler davantage : on coupe
    const step = (start: number, longerCount: number, min: number, max: number): Option<T>[] | null => {
      if (idx.length === n) {
        if (longerCount !== wanted || (!r.unit && !balancedMarks([r.marks, ...idx.map((i) => marks[i])]))) return null
        const chosen = idx.map((i) => top[i])
        return fits(chosen) ? chosen : null
      }
      for (let i = start; i <= top.length - (n - idx.length); i++) {
        const more = longerCount + (lens[i] > r.len ? 1 : 0)
        const lo = Math.min(min, lens[i])
        const hi = Math.max(max, lens[i])
        if (more > wanted || wanted - more > n - idx.length - 1 || !closeLengths(lo, hi)) continue
        idx.push(i)
        const found = step(i + 1, more, lo, hi)
        idx.pop()
        if (found) return found
      }
      return null
    }
    return step(0, 0, r.len, r.len)
  }
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

/** « au-dessus », « ce seuil » : un renvoi à ce qui précède (pas « au-dessus du sol »). */
const POINTER = /(?<!\p{L})(?:au-dessus|en dessous|au-delà)(?!\s+d(?:e|u|es)?(?!\p{L})|\s+d['’])|(?<!\p{L})(?:ce seuil|celui-ci|celle-ci)(?!\p{L})/iu
/** Les propositions d'une phrase : un renvoi n'a de sens qu'avec le nombre de sa proposition. */
const CLAUSES = /\s*(?:[;·:()]|[.!?…](?=\s|$))\s*/u

/**
 * Une version plus courte d'une mauvaise réponse en garde le sens : elle garde des nombres si la phrase
 * entière en a (« L’autre peut chasser très tôt (70 %), mais sans lien avec les flammes » sans « 70 % »
 * devient vraie de toute entité qui chasse tôt), et aucun renvoi (« jamais au-dessus ») n'y reste sans le
 * nombre auquel il renvoie.
 */
export function keepsSense(full: string, short: string): boolean {
  if (short === full) return true
  if (/\d/u.test(full) && !/\d/u.test(short)) return false
  return !short.split(CLAUSES).some((c) => POINTER.test(c) && !/\d/u.test(c))
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

/** Le texte nomme-t-il une entité de la liste ? Une réponse qui nomme la sienne la désignerait. Calculé une fois par texte. */
const namingCache = new WeakMap<readonly Ghost[], Map<string, boolean>>()
function namesAny(text: string, all: readonly Ghost[]): boolean {
  let cache = namingCache.get(all)
  if (!cache) namingCache.set(all, (cache = new Map()))
  let v = cache.get(text)
  if (v === undefined) cache.set(text, (v = all.some((o) => names(text, o))))
  return v
}

/**
 * Pour chaque entité, les chances de chaque rang de la bonne valeur parmi les quatre (le nombre de valeurs
 * proposées en dessous), choisies ensemble pour qu'au fil des questions la bonne valeur soit aussi souvent la
 * plus petite, la deuxième, la troisième que la plus grande. Une valeur basse (l'Obambo calme, 10 % : rien
 * n'est plus bas) ne peut pas être en haut : les autres compensent. Tirée au hasard dans chaque question, la
 * bonne valeur tomberait trop souvent au milieu. `share` : la part des questions posées sur chaque cas.
 */
function balancedRanks(cases: readonly { id: string; counts: number[]; share: number }[], n = 3): Map<string, number[]> {
  // équilibrage de Sinkhorn : chaque cas garde ses rangs possibles, un rang trop fréquent perd du poids partout
  const w = new Map(cases.map((c) => [c.id, c.counts.map(() => 1 / c.counts.length)]))
  for (let step = 0; step < 60; step++) {
    const total: number[] = Array(n + 1).fill(0)
    for (const c of cases) c.counts.forEach((k, i) => (total[k] += c.share * w.get(c.id)![i]))
    for (const c of cases) {
      const next = w.get(c.id)!.map((x, i) => x / total[c.counts[i]])
      const sum = next.reduce((a, b) => a + b, 0)
      w.set(
        c.id,
        next.map((x) => x / sum),
      )
    }
  }
  return w
}

const pct = (v: number) => `${v}${NBSP}%`

/** Le seuil et la vitesse de la plupart des entités. */
const STANDARD_SANITY = 50
const STANDARD_SPEED = 1.7
/**
 * Les chances qu'une entité au seuil (ou à la vitesse) standard ait sa question en nombres quand on la tire.
 * 22 entités chassent d'habitude à 50 % (20 à 1,7 m/s) : posées à chaque fois, « toujours 50 % » gagnerait
 * presque toujours. Le reste du temps, on demande l'inverse : quelle entité chasse comme une entité standard.
 * Il en va de même dans une série sur une seule entité : sinon, « 50 % » n'y serait jamais la bonne réponse.
 */
const KEEP_STANDARD_SANITY = 0.08
const KEEP_STANDARD_SPEED = 0.04
/** Dans une série sur une seule entité standard, les chances que sa valeur standard se demande (une fois). */
const SOLO_STANDARD = 0.1

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

/* ---------- les questions en nombres (seuils et vitesses) ---------- */

/**
 * Une question en nombres : la valeur demandée, son énoncé, et ses chances d'être posée quand on tire
 * l'entité. La valeur habituelle (« Quel est le seuil de chasse habituel du Yokai ? »), ou celle d'une
 * condition que le résumé cite (« … du Yokai si quelqu'un parle dans sa pièce ? », 80 %) : ainsi toutes les
 * valeurs proposées en mauvaises réponses sont aussi, parfois, la bonne.
 */
interface NumberAsk {
  key: string
  kind: NumberKind
  g: Ghost
  value: number
  prompt: string
  weight: number
}
type NumberKind = 'san' | 'spd'

/** « 65 % si tu bouges à moins de 10 m », « jusqu'à 80 % si… », « 1,96 enragé » : une valeur et sa condition. */
const VALUE_SEGMENT = /^(?:(?:jusqu['’]à|pas avant|dès)\s+)?(\d+(?:,\d+)?)\s?(%|m\/s)?\s+(\S.*)$/u
/** Ce qui suit une valeur sans en être la condition : la suite d'une plage (« à 87 % »), un choix (« ou 1,9 »), « selon… ». */
const NOT_A_CONDITION = /^(?:à|ou|et|-)\s*\d|^selon(?!\p{L})|\bLdV\b|ligne de vue|[<>]/u

/** Les valeurs d'un résumé (« 50 % · 65 % si tu bouges… · 45 % immobile ») autres que la valeur habituelle. */
function conditionalValues(summary: string, unit: '%' | 'm/s', own: ReadonlySet<number>, base: number | null): { value: number; condition: string }[] {
  const out: { value: number; condition: string }[] = []
  for (const part of summary.split(/\s+·\s+|\s*→\s*|,\s+(?=\d)/u)) {
    const m = VALUE_SEGMENT.exec(part.trim())
    if (!m || (unit === '%' ? m[2] !== '%' : m[2] === '%')) continue
    const value = Number(m[1].replace(',', '.'))
    const condition = m[3].trim().replace(/[.;,]$/u, '')
    if (!own.has(value) || value === base || (unit === '%' && value >= 100) || NOT_A_CONDITION.test(condition)) continue
    if (!out.some((o) => o.value === value)) out.push({ value, condition })
  }
  return out
}

/** La fin d'un énoncé pour une condition du résumé (« enragé » → « en état enragé », « immobile » → « si tu restes immobile près d'elle »). */
function askWhen(condition: string, g: Ghost): string {
  const c = condition.trim()
  if (/^(?:normal|enragé|affaibli|calme|agressif)$/u.test(c)) return ` en état ${c}`
  if (c === 'jeune') return ' encore jeune'
  if (c === 'vieux') return ' devenu vieux'
  if (/^(?:si\s+)?immobile$/u.test(c)) return ` si tu restes immobile près ${isFeminine(g.name) ? 'd’elle' : 'de lui'}`
  if (c === 'loin' || c === 'près') return ` ${c} de sa cible`
  if (/^vers\s/u.test(c)) return ` quand ${isFeminine(g.name) ? 'elle' : 'il'} se dirige ${c}`
  if (/^(?:si|près|en|dans|quand|lorsqu|sous|sur)(?!\p{L})/u.test(c)) return ` ${c}`
  return ` (${c})`
}

/** Les questions en nombres sur le seuil d'une entité : l'habituel, puis ceux que son résumé cite sous condition. */
const sanityAsks = perGhost((g): NumberAsk[] => {
  if (g.id === MIMIC) return []
  const base = baseSanity(g)
  const out: NumberAsk[] = []
  if (base != null) {
    // « 60 % lumière éteinte » : la condition du seuil demandé reste dans l'énoncé (« de sa cible » se lit dans le corrigé)
    const condition = g.huntSanity.summary
      .split(/\s+·\s+/u)[0]
      .replace(/^\d+\s?%\s*/u, '')
      .trim()
    // « 50 % normal » (le Gallu) : un seul mot, c'est un état
    const precise = !condition || /^d(?:e|u|es)\s/u.test(condition) ? '' : /^\p{L}+$/u.test(condition) ? ` (en état ${condition})` : ` (${condition})`
    out.push({
      key: `q:san:${g.id}`,
      kind: 'san',
      g,
      value: base,
      prompt: `Quel est le seuil de chasse habituel ${de(g.name)}${precise}${NNBSP}?`,
      weight: base === STANDARD_SANITY ? KEEP_STANDARD_SANITY : 1,
    })
  }
  for (const c of conditionalValues(g.huntSanity.summary, '%', thresholds(g), base)) {
    out.push({ key: `q:san:${g.id}:${c.value}`, kind: 'san', g, value: c.value, prompt: `Quel est le seuil de chasse ${de(g.name)}${askWhen(c.condition, g)}${NNBSP}?`, weight: 1 })
  }
  return out
})

/** Les questions en nombres sur la vitesse d'une entité : l'habituelle, puis celles que son résumé cite sous condition. */
const speedAsks = perGhost((g): NumberAsk[] => {
  if (g.id === MIMIC || !known(g)) return []
  const base = baseSpeed(g)
  const out: NumberAsk[] = []
  if (base != null) {
    out.push({
      key: `q:spd:${g.id}`,
      kind: 'spd',
      g,
      value: base,
      prompt: `Quelle est la vitesse de chasse habituelle ${de(g.name)}${NNBSP}?`,
      weight: base === STANDARD_SPEED ? KEEP_STANDARD_SPEED : 1,
    })
  }
  for (const c of conditionalValues(g.speed.summary, 'm/s', speedValues(g), base)) {
    out.push({ key: `q:spd:${g.id}:${c.value}`, kind: 'spd', g, value: c.value, prompt: `Quelle est la vitesse de chasse ${de(g.name)}${askWhen(c.condition, g)}${NNBSP}?`, weight: 1 })
  }
  return out
})

const asksOf = (kind: NumberKind, g: Ghost) => (kind === 'san' ? sanityAsks(g) : speedAsks(g))
const ownValues = (kind: NumberKind, g: Ghost) => (kind === 'san' ? thresholds(g) : speedValues(g))
/** Les chances qu'une question tirée sur g soit `a` : une entité standard n'a la sienne que rarement. */
const askShare = (a: NumberAsk) => a.weight / Math.max(1, asksOf(a.kind, a.g).reduce((s, x) => s + x.weight, 0))

/**
 * Les mauvaises valeurs se tirent pour qu'au fil des questions chaque valeur soit proposée en proportion du
 * nombre de fois où elle est la bonne réponse (`mass`, quand on tire chaque entité une fois) : une valeur
 * rare (« 80 % », le Yokai quand on parle) est rarement proposée, « 50 % » souvent ; aucune ne se devine à sa
 * fréquence. Une valeur que l'entité peut avoir n'est jamais proposée : les poids (`weight`) s'ajustent par
 * itérations, sur un tirage simulé, pour compenser ces exclusions.
 */
const numberPlan = perList((all) => {
  const plan = (kind: NumberKind) => {
    const asks = all.flatMap((g) => asksOf(kind, g))
    const mass = new Map<number, number>()
    for (const a of asks) mass.set(a.value, (mass.get(a.value) ?? 0) + askShare(a))
    const values = [...mass.keys()].sort((x, y) => x - y)
    const sides = new Map(
      asks.map((a) => {
        const own = ownValues(kind, a.g)
        const free = values.filter((v) => !own.has(v))
        const below = free.filter((v) => v < a.value)
        const above = free.filter((v) => v > a.value)
        const counts = [0, 1, 2, 3].filter((k) => k <= below.length && 3 - k <= above.length)
        return [a.key, { below, above, counts }]
      }),
    )
    const ranks = balancedRanks(asks.flatMap((a) => (sides.get(a.key)!.counts.length ? [{ id: a.key, counts: sides.get(a.key)!.counts, share: askShare(a) }] : [])))
    const weight = new Map(values.map((v) => [v, mass.get(v)!]))
    const sim = createRng(7)
    const totalMass = values.reduce((t, v) => t + mass.get(v)!, 0)
    for (let round = 0; round < 8; round++) {
      const shown = new Map(values.map((v) => [v, 0]))
      for (const a of asks) {
        const side = sides.get(a.key)!
        if (!side.counts.length) continue
        const w = ranks.get(a.key)
        for (let i = 0; i < SIMULATED; i++) {
          const k = weightedPick(sim, side.counts, (x) => w?.[side.counts.indexOf(x)] ?? 1)
          const picked = [...weightedSample(sim, side.below, k, (v) => weight.get(v)!), ...weightedSample(sim, side.above, 3 - k, (v) => weight.get(v)!)]
          for (const v of picked) shown.set(v, shown.get(v)! + askShare(a) / SIMULATED)
        }
      }
      const totalShown = values.reduce((t, v) => t + shown.get(v)!, 0)
      for (const v of values) weight.set(v, weight.get(v)! * Math.sqrt((mass.get(v)! * totalShown) / totalMass / Math.max(shown.get(v)!, 1e-3)))
    }
    return { weight, sides, ranks }
  }
  return { san: plan('san'), spd: plan('spd') }
})
const SIMULATED = 24

/** n éléments tirés sans remise, chacun selon son poids. */
function weightedSample<T>(rng: Rng, items: readonly T[], n: number, weight: (t: T) => number): T[] {
  const rest = [...items]
  const out: T[] = []
  while (out.length < n && rest.length) {
    const x = weightedPick(rng, rest, weight)
    out.push(x)
    rest.splice(rest.indexOf(x), 1)
  }
  return out
}

/** Les trois mauvaises valeurs d'une question en nombres : le rang de la bonne tiré selon balancedRanks, puis chaque côté selon les fréquences. */
function numberChoices(kind: NumberKind, a: NumberAsk, ctx: Ctx): number[] | null {
  const { weight, sides, ranks } = numberPlan(ctx.allGhosts)[kind]
  const side = sides.get(a.key)
  if (!side || !side.counts.length) return null
  const w = ranks.get(a.key)
  // un peu de hasard pur en plus : même pour une entité qui compense les autres, aucun rang n'est assuré
  const u = 1 / side.counts.length
  const k = weightedPick(ctx.rng, side.counts, (x) => (1 - RANK_CHANCE) * (w?.[side.counts.indexOf(x)] ?? u) + RANK_CHANCE * u)
  const m = (v: number) => weight.get(v) ?? 0
  return [...weightedSample(ctx.rng, side.below, k, m), ...weightedSample(ctx.rng, side.above, 3 - k, m)]
}
const RANK_CHANCE = 0.2

/**
 * La question en nombres tirée sur g (null : pas cette fois, ou pas de question). Dans une série sur une
 * seule entité, tirée encore et encore, c'est la série qui décide une fois pour toutes (ctx.standard) si la
 * valeur standard se demande.
 */
function pickAsk(kind: NumberKind, g: Ghost, ctx: Ctx): NumberAsk | null {
  const asks = asksOf(kind, g)
  if (!asks.length) return null
  const weightOf = (a: NumberAsk) => (a.weight < 1 && ctx.standard ? (ctx.standard[kind] ? 1 : 0) : a.weight)
  const total = asks.reduce((s, a) => s + weightOf(a), 0)
  let r = ctx.rng() * Math.max(1, total)
  for (const a of asks) {
    r -= weightOf(a)
    if (r < 0) return a
  }
  return null
}

/**
 * « Quel est le seuil de chasse habituel du Yokai ? », « … du Yokai si quelqu'un parle dans sa pièce ? » :
 * quatre pourcentages que le jeu donne. Aucune mauvaise réponse n'est un seuil que l'entité peut avoir
 * (« 80 % » face au seuil habituel du Yokai) ; le corrigé donne le résumé et ses conditions.
 */
const sanityOfGhost: Gen = (g, ctx) => {
  const a = pickAsk('san', g, ctx)
  if (!a) return null
  const wrong = numberChoices('san', a, ctx)
  if (!wrong) return null
  return {
    id: a.key,
    topic: 'sanity',
    ghostId: g.id,
    prompt: a.prompt,
    multi: false,
    choices: shuffle(ctx.rng, [{ id: g.id, label: pct(a.value) }, ...wrong.map((v) => ({ id: `v:${v}`, label: pct(v) }))]),
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
  // « Me tester sur X » : X, toujours parmi les choix, ne serait que la bonne réponse (à 50 %, il ne peut
  // pas être une mauvaise réponse) ; la question porte alors sur une autre entité (voir aboutOrAgainst)
  if (baseSanity(g) !== STANDARD_SANITY || (ctx.solo && !ctx.offer)) return null
  const pool = neverAt(ctx.allGhosts, thresholds, (o) => o.huntSanity.summary, STANDARD_SANITY, () => false)
  const wrong = withOffer(ctx, g, pool, 3, (rest, k) => sample(ctx.rng, rest, k))
  if (!wrong) return null
  return {
    id: 'q:san:std',
    topic: 'sanity',
    ghostId: g.id,
    prompt: `Laquelle de ces entités a un seuil de chasse habituel de ${pct(STANDARD_SANITY)}, comme une entité standard${NNBSP}?`,
    multi: false,
    choices: shuffle(ctx.rng, [g, ...wrong]).map(ghostChoice),
    correct: [g.id],
    explain: `${called(g)}${NNBSP}: ${g.huntSanity.summary}. Les autres ont un autre seuil${NNBSP}: ${wrong.map((o) => `${o.name} (${o.huntSanity.summary})`).join(', ')}.`,
    cardId: `g:${g.id}:san`,
  }
}

/** Les résumés d'une sorte (seuil ou vitesse) : leur libellé, qui a une question, ce qui rend un résumé faux pour g. */
interface SummaryKind {
  label: (g: Ghost) => string
  asked: (g: Ghost) => boolean
  /** le résumé de o est faux pour g (ni une valeur commune, ni en partie vrai) */
  apart: (o: Ghost, g: Ghost) => boolean
}
const SUMMARIES: Record<NumberKind, SummaryKind> = {
  san: {
    label: (g) => g.huntSanity.summary,
    // « 50 % » seul (une entité standard) n'a pas de question : il ne serait jamais la bonne réponse
    asked: (g) => g.id !== MIMIC && !standardSanity(g) && thresholds(g).size > 0,
    apart: (o, g) => ![...thresholds(o)].some((v) => thresholds(g).has(v)),
  },
  spd: {
    label: (g) => spellLdV(g.speed.summary),
    asked: (g) => g.id !== MIMIC && known(g) && !standardSpeed(g),
    apart: (o, g) => o.speed.summary !== g.speed.summary && !partlyTrueSpeed(o, g),
  },
}

/** Les mauvaises réponses possibles d'un résumé, dans un ordre tiré au hasard où les plus lourdes passent plus souvent d'abord. */
function summaryPool(kind: NumberKind, g: Ghost, ok: readonly Ghost[], weight: ReadonlyMap<string, number>, rng: Rng): Option<Ghost>[] {
  const k = SUMMARIES[kind]
  return ok
    .filter((o) => o.id !== g.id && k.apart(o, g))
    .map((o) => ({ o, key: Math.pow(rng(), 1 / (weight.get(o.id) ?? 1)) }))
    .sort((a, b) => b.key - a.key)
    .map(({ o }) => ({ value: o, label: k.label(o) }))
}

/**
 * Les trois mauvaises réponses d'un résumé (null : pas cette fois). Les seuils particuliers sont peu nombreux :
 * le plus long (« 50 % · 65 % si tu bouges à moins de 10 m · 45 % immobile ») n'a souvent que des mauvaises
 * réponses plus courtes. Seule plus longue, la bonne réponse ne passe alors qu’une fois sur quatre : sinon
 * « la plus longue » gagnerait trop souvent.
 */
function pickSummaries(kind: NumberKind, g: Ghost, ok: readonly Ghost[], weight: ReadonlyMap<string, number>, rng: Rng, longest?: boolean): Option<Ghost>[] | null {
  const right = SUMMARIES[kind].label(g)
  // seuils : la bonne réponse la plus longue en dernier recours seulement (elle l'est déjà souvent par force)
  const ranks = kind === 'san' ? [...shuffle(rng, [1, 2, 3]), 0] : undefined
  const wrong = matching(rng, right, summaryPool(kind, g, ok, weight, rng), 3, undefined, ranks, false)
  if (!wrong) return null
  return kind === 'san' && wrong.every((o) => o.label.length < right.length) && !(longest ?? rng() < LONGEST_KEPT) ? null : wrong
}
const LONGEST_KEPT = 0.25

/**
 * Les entités dont le résumé peut être la bonne réponse d'une question (il a assez de mauvaises réponses de
 * même forme) : seules elles servent de mauvaises réponses, sans quoi un résumé jamais demandé ne serait
 * jamais le bon. Et le poids de chacune parmi les mauvaises réponses, ajusté sur un tirage simulé pour que
 * chaque résumé soit proposé à peu près aussi souvent : un résumé qui va avec beaucoup d'autres (« 1,7 m/s ·
 * … · … ») se verrait sinon surtout faux.
 */
const summaryPlan = perList((all) => {
  const plan = (kind: NumberKind) => {
    const k = SUMMARIES[kind]
    const rng = createRng(1)
    let ok = all.filter((g) => k.asked(g) && !namesAny(k.label(g), all))
    for (;;) {
      const pool = (g: Ghost) => ok.filter((o) => o.id !== g.id && k.apart(o, g)).map((o) => ({ value: o, label: k.label(o) }))
      const next = ok.filter((g) => [0, 1, 2, 3].some((r) => matching(rng, k.label(g), pool(g), 3, () => true, [r])))
      if (next.length === ok.length) break
      ok = next
    }
    // chaque résumé proposé environ trois fois plus souvent qu'il n'est la bonne réponse (une chance sur quatre)
    const weight = new Map(ok.map((o) => [o.id, 1]))
    for (let round = 0; round < 8; round++) {
      const shown = new Map(ok.map((o) => [o.id, 0]))
      const right = new Map(ok.map((o) => [o.id, 0]))
      for (const g of ok) {
        for (let i = 0; i < 20; i++) {
          const wrong = pickSummaries(kind, g, ok, weight, rng)
          if (!wrong) continue
          right.set(g.id, right.get(g.id)! + 1)
          for (const w of wrong) shown.set(w.value.id, shown.get(w.value.id)! + 1)
        }
      }
      for (const o of ok) weight.set(o.id, weight.get(o.id)! * Math.sqrt((3 * Math.max(1, right.get(o.id)!)) / Math.max(1, shown.get(o.id)!)))
    }
    return { ok, weight }
  }
  return { san: plan('san'), spd: plan('spd') }
})

/**
 * Un seuil ou une vitesse particuliers (« 70 % · à toute santé mentale via sa capacité », « 1,7 m/s · 2,5 m/s
 * près de l'électronique ») : son résumé face aux résumés d'autres entités particulières, de même longueur et
 * de même forme, faux pour l'entité. Chaque résumé proposé est aussi, parfois, la bonne réponse, et chacun est
 * proposé à peu près aussi souvent (voir summaryPlan).
 */
function summaryQuestion(kind: NumberKind, g: Ghost, ctx: Ctx): Question | null {
  const k = SUMMARIES[kind]
  const { ok, weight } = summaryPlan(ctx.allGhosts)[kind]
  if (!ok.includes(g)) return null
  const right = k.label(g)
  const wrong = pickSummaries(kind, g, ok, weight, ctx.rng, ctx.longest)
  if (!wrong) return null
  const san = kind === 'san'
  return {
    id: `q:${san ? 'sansum' : 'spdsum'}:${g.id}`,
    topic: san ? 'sanity' : 'speed',
    ghostId: g.id,
    prompt: san ? `Quelle description correspond au seuil de chasse ${de(g.name)}${NNBSP}?` : `Quelle description correspond à la vitesse de chasse ${de(g.name)}${NNBSP}?`,
    multi: false,
    choices: shuffle(ctx.rng, [{ id: g.id, label: right }, ...wrong.map((o) => ({ id: o.value.id, label: o.label }))]),
    correct: [g.id],
    explain: san ? [right, ...g.huntSanity.details.slice(0, 2)].join(' — ') : spellLdV([g.speed.summary, ...g.speed.details.slice(0, 2)].join(' — ')),
    cardId: `g:${g.id}:${san ? 'san' : 'spd'}`,
  }
}


const sanitySummary: Gen = (g, ctx) => summaryQuestion('san', g, ctx)

const earlyHunter: Gen = (g, ctx) => {
  if (g.id === MIMIC || g.huntSanity.high <= 50) return null
  const late = withOffer(
    ctx,
    g,
    ctx.allGhosts.filter((o) => o.id !== MIMIC && o.huntSanity.normal >= 0 && o.huntSanity.high <= 50),
    3,
    (rest, k) => sample(ctx.rng, rest, k),
  )
  if (!late) return null
  return {
    id: `q:early:${g.id}`,
    topic: 'sanity',
    ghostId: g.id,
    prompt: 'La santé mentale moyenne est encore au-dessus de 50 % et une chasse démarre. Laquelle de ces entités peut en être responsable ?',
    multi: false,
    choices: shuffle(ctx.rng, [g, ...late]).map(ghostChoice),
    correct: [g.id],
    explain: `${called(g)}${NNBSP}: ${g.huntSanity.summary}. Les autres ne peuvent pas chasser au-dessus de 50${NBSP}% (hors effets d’objets maudits).`,
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
  const wrong = withOffer(ctx, g, pool, 3, (rest, k) =>
    [...shuffle(ctx.rng, rest.filter((o) => !standardSanity(o))), ...shuffle(ctx.rng, rest.filter(standardSanity))].slice(0, k),
  )
  if (!wrong) return null
  return {
    id: `q:sanp:${g.id}`,
    topic: 'sanity',
    ghostId: g.id,
    prompt: 'Quelle entité a ce seuil de chasse ?',
    quote,
    multi: false,
    choices: shuffle(ctx.rng, [g, ...wrong]).map(ghostChoice),
    correct: [g.id],
    explain: `${called(g)}${NNBSP}: ${[g.huntSanity.summary, ...g.huntSanity.details.slice(0, 1)].join(' — ')}`,
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
 * « Quelle est la vitesse de chasse habituelle du Raiju ? », « … du Raiju près de l'électronique ? » : quatre
 * vitesses que le jeu donne. Aucune mauvaise réponse n'est une vitesse que l'entité peut avoir (« 2,5 m/s »
 * face à la vitesse habituelle du Raiju). La ligne de vue a sa propre question.
 */
const speedOfGhost: Gen = (g, ctx) => {
  const a = pickAsk('spd', g, ctx)
  if (!a) return null
  const wrong = numberChoices('spd', a, ctx)
  if (!wrong) return null
  return {
    id: a.key,
    topic: 'speed',
    ghostId: g.id,
    prompt: a.prompt,
    multi: false,
    choices: shuffle(ctx.rng, [{ id: g.id, label: mps(a.value) }, ...wrong.map((v) => ({ id: `v:${v}`, label: mps(v) }))]),
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
  if (baseSpeed(g) !== STANDARD_SPEED || (ctx.solo && !ctx.offer)) return null
  const pool = neverAt(ctx.allGhosts.filter(known), speedValues, (o) => o.speed.summary, STANDARD_SPEED, (o) => o.speed.isRange)
  const wrong = withOffer(ctx, g, pool, 3, (rest, k) => sample(ctx.rng, rest, k))
  if (!wrong) return null
  return {
    id: 'q:spd:std',
    topic: 'speed',
    ghostId: g.id,
    prompt: `Laquelle de ces entités a une vitesse de chasse habituelle de ${mps(STANDARD_SPEED)}, comme une entité standard${NNBSP}?`,
    multi: false,
    choices: shuffle(ctx.rng, [g, ...wrong]).map(ghostChoice),
    correct: [g.id],
    explain: spellLdV(`${called(g)}${NNBSP}: ${g.speed.summary}. Les autres ont une autre vitesse habituelle${NNBSP}: ${wrong.map((o) => `${o.name} (${o.speed.summary})`).join(', ')}.`),
    cardId: `g:${g.id}:spd`,
  }
}

const speedSummary: Gen = (g, ctx) => summaryQuestion('spd', g, ctx)

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
  const wrong = withOffer(ctx, g, pool, 3, (rest, k) =>
    [...shuffle(ctx.rng, rest.filter((o) => !standardSpeed(o))), ...shuffle(ctx.rng, rest.filter(standardSpeed))].slice(0, k),
  )
  if (!wrong) return null
  return {
    id: `q:spdp:${g.id}`,
    topic: 'speed',
    ghostId: g.id,
    prompt: 'En chasse, quelle entité se déplace ainsi ?',
    quote,
    multi: false,
    choices: shuffle(ctx.rng, [g, ...wrong]).map(ghostChoice),
    correct: [g.id],
    explain: `${called(g)}${NNBSP}: ${[g.speed.summary, ...g.speed.details.slice(0, 1)].join(' — ')}`,
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
  // le Mimic n'est jamais une mauvaise réponse (il copie tout) : parmi les choix, il serait toujours la bonne
  if (g.id === MIMIC) return null
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
    explain: `${called(g)}${NNBSP}: ${g.summary}`,
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
  if (g.id === MIMIC) return null
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
    explain: `${called(g)}${NNBSP}: ${g.summary}`,
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
    explain: `${called(g)}${NNBSP}: ${uncap(text)}`,
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
  if (g.id === MIMIC) return null
  const tests = zeroTestQuotes(g)
  if (!tests.length) return null
  const t = tests[Math.floor(ctx.rng() * tests.length)]
  const gender = sameGender(t.quote, g)
  const others = withOffer(
    ctx,
    g,
    ctx.allGhosts.filter(
      (o) =>
        o.id !== g.id &&
        o.id !== MIMIC &&
        zeroTests(o).length > 0 &&
        // « le Deogen est lui aussi plus visible » : une entité nommée dans le test s'écarte d'un coup d'œil
        !names(t.text, o) &&
        gender(o),
    ),
    3,
    (rest, k) => shuffle(ctx.rng, rest).slice(0, k),
  )
  if (!others) return null
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
  if ([...text.matchAll(/(?:dès|jusqu['’]à|à partir de)\s+(\d+)\s?%/gu)].some((m) => top >= Number(m[1]))) return true
  // « peut chasser très tôt », sans nombre : vrai de toute entité qui peut chasser au-dessus de 50 %
  return top > STANDARD_SANITY && EARLY_HUNT.test(text) && !/\d\s?%/u.test(text)
}
const EARLY_HUNT = /chass[^.;·]*(?<!\p{L})(?:tôt|précoce)(?!\p{L})|(?<!\p{L})(?:tôt|précoce)(?!\p{L})[^.;·]*chass/iu

/** Un nom au pluriel (« Les Jumeaux ») ne prend pas la place d'un sujet au singulier sans fausser l'accord. */
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
  // un conseil (« pense plutôt à l'autre »), plusieurs « l'autre », ou un « l'autre » à côté du nom de l'entité
  // (qui deviendra celle de l'énoncé) : on ne saurait plus de qui parle la réponse
  if (/\bpense\s+plutôt\b/iu.test(kept)) return ''
  const vague = kept.match(/(?<!\p{L})l['’]autre(?!\p{L})/giu)?.length ?? 0
  if (vague > 1 || (vague === 1 && names(kept, partner))) return ''
  return kept
}

/**
 * La place du sujet dans une phrase de départage : l'entité dont parle la phrase, que l'énoncé nomme ensuite
 * (voir naming). Un caractère que les fiches n'emploient jamais : « l’autre » d'une fiche (« d'une pièce à
 * l'autre ») reste ce qu'il est.
 */
const SUBJ = '\u0001'
const subjects = (text: string) => text.split(SUBJ).length - 1

/** Le texte, où l'entité dont il parle laisse sa place au sujet (SUBJ) : son nom ne souffle jamais la réponse. */
function asOther(text: string, other: Ghost): string {
  const KEEP = '\u0000'
  return redact(text.replaceAll('cette entité', KEEP), other)
    .replace(/cette entité/gu, SUBJ)
    .replaceAll(KEEP, 'cette entité')
}

/** « au Poltergeist », « à l’Esprit », « à la Banshee » */
const au = (name: string) => le(name).replace(/^le /u, 'au ').replace(/^les /u, 'aux ').replace(/^(?!au |aux )/u, 'à ')

/**
 * La phrase où le sujet devient l'entité de l'énoncé : « La vitesse de ␁ part de 3,0 m/s… » → « La vitesse
 * du Deildegast part de 3,0 m/s… ». Toutes les réponses d'un départage nomment ainsi l'entité demandée : la
 * bonne dit vrai d'elle, les mauvaises disent d'elle ce qui est vrai d'une autre.
 */
function naming(text: string, g: Ghost): string {
  const s = `(?<![\\p{L}])([Dd]e|[Àà]) ${SUBJ}`
  return text
    .replace(new RegExp(s, 'gu'), (_m, p: string) => {
      const w = /^[Dd]/u.test(p) ? de(g.name) : au(g.name)
      return /^\p{Lu}/u.test(p) ? cap(w) : w
    })
    .replace(new RegExp(`(^|[.!?]\\s+)${SUBJ}`, 'gu'), (_m, lead: string) => `${lead}${cap(le(g.name))}`)
    .replaceAll(SUBJ, le(g.name))
}

/**
 * « est très lent », « reste bloqué », « est le seul à… » : un mot accordé au sujet. Une phrase sur une
 * entité masculine ne se dit pas d'une entité féminine (ni l'inverse) si elle en a un ; « est très rapide »,
 * « plus visible », « presque aveugle » s'accordent avec tout le monde.
 */
const AGREED = /(?<!\p{L})(?:est|reste|devient|redevient|semble|paraît|demeure)\s+(?:(?:très|plus|moins|presque|aussi|bien|encore|alors|toujours|souvent|parfois|quasi|si|tout|vite|pas|jamais)\s+)*(?:(?:le|la|les|un|une)\s+)?(\p{L}+)/giu
const EPICENE = /e$/u
const FEMININE_FORM = /(?:ée|ive|euse|elle|ente|ante|eule|ette|ière|ienne|onne|ise|use)$/u
function agrees(text: string, from: Ghost, to: Ghost): boolean {
  if (isFeminine(from.name) === isFeminine(to.name)) return true
  for (const m of text.matchAll(AGREED)) {
    const w = m[1].toLocaleLowerCase('fr')
    if (!EPICENE.test(w) || FEMININE_FORM.test(w)) return false
  }
  return !/(?<!\p{L})(?:seule?s?|encensée?s?|bloquée?s?|piégée?s?|attirée?s?)(?!\p{L})/iu.test(text)
}

/**
 * Une phrase de départage dont la forme ne dit pas d'où elle vient. Sans comparatif (« ralentit elle aussi
 * près des joueurs » → « ralentit près des joueurs ») : seule la bonne réponse, tirée de la fiche de X,
 * pouvait se comparer à X. Et le sujet (SUBJ) plutôt qu'un pronom (« Il alterne… », « Lui aussi réagit… »,
 * « Lui non plus… » → « ␁ alterne… », « ␁ réagit… ») ou un possessif (« Sa vitesse va… » → « La vitesse de
 * ␁ va… »), comme les autres réponses : chaque réponse nommera l'entité de l'énoncé à cette place. Pas
 * quand la phrase nomme déjà son entité (elle y deviendra le sujet), ni « Il faut », « Il y a ».
 */
const withoutComparatives = (text: string) =>
  text.replace(/\s+(?:lui|elle|eux|elles)\s+(?:aussi|non\s+plus)(?!\p{L})|\s+(?:aussi|également|non\s+plus)(?!\p{L})/gu, '')
function plainClaim(text: string, about: Ghost): string {
  // « Lui aussi … le Thayé … » : rien à changer sans casser la phrase
  const lead = /^(?:Lui|Elle)\s+(?:aussi|non\s+plus)\s+/u
  if (names(text, about)) return lead.test(text) ? text : withoutComparatives(text)
  return withoutComparatives(text.replace(lead, `${SUBJ} `))
    .replace(/^(?:Il|Elle)\s+(?!(?:faut|suffit|y\s+a)(?!\p{L}))/u, `${SUBJ} `)
    .replace(POSSESSIVE, (_, det: string, noun: string) => `${det === 'Ses' ? 'Les ' : VOWEL_START.test(noun) ? 'L’' : det === 'Sa' ? 'La ' : 'Le '}${noun} de ${SUBJ}`)
}
/** « Son seuil », « Sa vitesse de chasse », « Ses changements de vitesse » en tête de phrase. */
const POSSESSIVE = /^(Son|Sa|Ses)\s+(\p{L}+(?:\s+de\s+(?:chasse|vitesse))?)(?!\p{L})/u
const VOWEL_START = /^[aeiouyhâàéèêîïôûAEIOUYHÂÀÉÈÊÎÏÔÛ]/u
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
 * Goryo), et ni leur pronom (« elle », « il ») ni leurs accords ne les écartent d'emblée. L'entité dont parle
 * chaque phrase laisse sa place à g (voir naming) : « Le Poltergeist lance énormément d'objets » face à
 * « l'Esprit », c'est faux de l'Esprit.
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
    // après l’encens ») serait vrai de presque toutes les entités ; ni sans les nombres qui la rendaient fausse
    const versions = [c.text, withoutAsides(c.text)].filter((t) => keepsSense(c.text, t))
    for (const text of distinctBy(versions.map((t) => plainClaim(t, c.z)), (t) => t)) {
      if (text.length < 30) continue
      if (names(text, g) || pronounClash(text, g) || fitsToo(text, all, true)(g) || numbersFit(text, g) || huntsAlready(text, g)) continue
      const bare = asOther(text, c.z)
      // un nom entre « » n'est pas caviardé : il soufflerait de qui parle la phrase ; et la phrase a un seul sujet
      if (names(bare, c.z) || subjects(bare) !== 1 || !agrees(bare, c.z, g)) continue
      out.push({ ...c, text, label: naming(bare, g) })
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
  /** les libellés de toutes les mauvaises réponses possibles */
  labels: string[]
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
      const subject = asOther(plainClaim(claim, g), g)
      // un nom entre « » n'est pas caviardé : il soufflerait la réponse ; et la phrase a un seul sujet
      if (names(subject, g) || subjects(subject) !== 1) continue
      const right = naming(subject, g)
      // la bonne réponse entière, puis ses versions plus courtes qui départagent encore (fausses pour x) : sans ses
      // apartés, rien de ce qu'elle cite ne vaut pour x ; coupée (première phrase, avant « ; »), elle ne lui
      // convient en rien. Sinon une longue bonne réponse, sans mauvaise réponse plus longue, finirait la plus longue
      const bare = withoutAsides(right)
      const apart = (v: string) => (v === bare ? !numbersFit(v, x) && !huntsAlready(v, x) && !restatedBy(v, x, all) : !signFits(v, x, all))
      const rights = distinctBy([right, ...shortened(right)], (v) => v).filter((v, i) => i === 0 || (v.length >= 30 && names(v, g) && apart(v)))
      // ce qu'on dit de x lui-même est la mauvaise réponse la plus utile : « l'Esprit lance énormément d'objets »
      // face à « l'Esprit plutôt que le Poltergeist » ; jamais une phrase qui nomme x ailleurs
      const wrong = wrongClaimsFor(g, all)
        .filter(
          (c) =>
            !names(c.label, x) &&
            // hors de la fiche de x, « non plus » ne compare plus à personne (« aussi » est déjà retiré)
            (c.y.id === x.id || !RELATIVE.test(c.text)) &&
            !rights.includes(c.label),
        )
        .map((c) => ({
          option: { value: c.z, label: c.label },
          score: (c.z.id === x.id ? 8 : 0) + (c.y.id === x.id ? 4 : 0) + (nearX.has(c.z.id) ? 2 : 0) + (nearG.has(c.z.id) ? 1 : 0),
        }))
      if (new Set(wrong.map((w) => w.option.value.id)).size < 3) continue
      // le corrigé garde les deux noms, et ce qui distingue x de son côté
      const full = noLeadingMais(confusionWithoutEvidence(pair.why))
      out.push({ x, rights, wrong, labels: wrong.map((w) => w.option.label), explain: names(full, g) ? full : `${called(g)}${NNBSP}: ${uncap(full)}` })
    }
  }
  byGhost.set(g.id, out)
  return out
}

/** Des réponses sur des entités toutes différentes (une entité, une réponse). */
const distinctGhostsOf = (gs: readonly Ghost[]) => new Set(gs.map((g) => g.id)).size === gs.length
const distinctGhosts = (chosen: readonly Option<Ghost>[]) => distinctGhostsOf(chosen.map((o) => o.value))

/**
 * « Sans preuve, à quoi reconnais-tu g plutôt que X ? » : la bonne réponse est ce que la fiche de X dit de g ;
 * les mauvaises, ce que les fiches disent de X lui-même et d'autres entités (d'abord celles qu'on confond
 * avec X), de même longueur et de même forme. Chaque réponse nomme g à la place de l'entité dont elle parle :
 * toutes se lisent comme une phrase sur g, une seule est vraie. Ni la seule réponse qui contient le mot que
 * souffle le nom de g (« objets » pour le Poltergeist) n'est d'office la bonne.
 */
const distinguish: Gen = (g, ctx) => {
  // le Mimic peut copier n'importe quel comportement : une mauvaise réponse pourrait être vraie pour lui ;
  // « Les Jumeaux » à la place d'un sujet au singulier fausserait l'accord
  if (g.id === MIMIC || plural(g)) return null
  const tries = shuffle(ctx.rng, duelsFor(g, ctx.allGhosts)).map((d) => ({
    d,
    pool: shuffle(ctx.rng, d.wrong)
      .sort((a, b) => b.score - a.score)
      .map((w) => w.option),
  }))
  return byRank(ctx.rng, (ranks) => {
    for (const { d, pool } of tries) {
      for (const right of d.rights) {
        // aucune mauvaise réponse possible ne contient le mot que souffle le nom de g : inutile de chercher
        if (hintAlone(g, right, d.labels)) continue
        const fits = (chosen: readonly Option<Ghost>[]) => distinctGhosts(chosen) && !hintAlone(g, right, chosen.map((o) => o.label))
        const wrong = matching(ctx.rng, right, pool, 3, fits, ranks)
        if (!wrong) continue
        return {
          id: `q:dist:${d.x.id}:${g.id}`,
          topic: 'zero',
          ghostId: g.id,
          prompt: `Sans preuve, à quoi reconnais-tu ${le(g.name)} plutôt que ${le(d.x.name)}${NNBSP}?`,
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

const authored: Gen = (g, ctx) => {
  // les questions sur les preuves (lesquelles, forcées, combinaisons, réponses à la Spirit Box) restent dans le codex
  const valid = g.quiz.filter(
    (q) =>
      q.choices.length >= 2 &&
      q.answer >= 0 &&
      q.answer < q.choices.length &&
      !mentionsEvidence(q.q) &&
      !mentionsEvidence(q.choices[q.answer]) &&
      // dans une série sur cette seule entité, « Qui suspectes-tu ? » aurait toujours son nom pour réponse ; et
      // une question qui la nomme seulement parmi les mauvaises réponses apprendrait que son nom n'est jamais le bon
      !(ctx.solo && q.choices.some((c) => names(c, g))),
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

/** « Lequel de ces signes est celui de X ? », qui renvoie à sa carte de signes. */
const signOf: Gen = (g, ctx) => {
  const q = signOfGhost(g, ctx)
  return q && { ...q, cardId: `g:${g.id}:tells` }
}

/** Les entités qu'on confond avec x, dans un sens ou dans l'autre (jamais le Mimic). */
const rivals = perList((all) => {
  const out = new Map<string, Ghost[]>()
  for (const x of all) {
    const ids = new Set([...x.confusions.map((c) => c.with), ...all.filter((o) => o.confusions.some((c) => c.with === x.id)).map((o) => o.id)])
    out.set(
      x.id,
      all.filter((o) => ids.has(o.id) && o.id !== x.id && o.id !== MIMIC),
    )
  }
  return out
})

/**
 * La part des questions à choix de noms qui portent sur l'entité elle-même, dans une série sur elle seule.
 * Elle est toujours parmi les choix : posée sur elle à chaque fois, la question serait gagnée d'avance.
 */
const SOLO_SELF = 0.25

/**
 * Les chances que la prochaine question à choix de noms porte sur l'entité de la série : un quart, un peu plus
 * si la série en a eu moins qu'un quart jusqu'ici, beaucoup moins si elle en a eu plus. La part reste proche
 * d'un quart dans chaque série, sans jamais devenir prévisible.
 */
function selfOdds(tally: Ctx['tally']): number {
  if (!tally) return SOLO_SELF
  const behind = SOLO_SELF * (tally.named + 1) - tally.self
  return Math.min(0.6, Math.max(0.05, SOLO_SELF + 0.5 * (behind - SOLO_SELF)))
}

/**
 * Une question à choix de noms dans une série sur la seule entité x. Une fois sur quatre elle porte sur x ;
 * sinon sur une entité qu'on confond avec x, et x est l'une des mauvaises réponses (l'énoncé ne lui convient
 * pas). Répondre « x » à chaque fois ne rapporte donc pas plus que le hasard. Jamais pour le Mimic : il n'est
 * jamais une mauvaise réponse, et toujours la bonne, la question ne demanderait rien.
 */
function aboutOrAgainst(gen: Gen): Gen {
  return (x, ctx) => {
    if (x.id === MIMIC) return null
    if (ctx.rng() < selfOdds(ctx.tally)) return gen(x, ctx)
    // la série est en retard d'au moins une question sur x : plus d'une fois sur deux, on laisse la place à une
    // question qui peut porter sur lui (certaines n'existent pas pour x, comme « laquelle chasse comme une entité
    // standard ? » sur une entité standard : sans cela, x serait trop rarement la bonne réponse)
    if (ctx.tally && SOLO_SELF * (ctx.tally.named + 1) - ctx.tally.self >= 1 && ctx.rng() < 0.6) return null
    // la première entité proche dont la question peut proposer x : sinon, x serait plus souvent la réponse
    const offer = { ...ctx, offer: x }
    for (const o of shuffle(ctx.rng, rivals(ctx.allGhosts).get(x.id) ?? [])) {
      const q = gen(o, offer)
      if (q) return q
    }
    return null
  }
}

/**
 * Une série sur une seule entité (« Me tester sur X ») : d'abord des questions dont les choix sont des faits
 * sur elle (signes, nombres, résumés, tests, départages), puis des questions à choix de noms où elle n'est pas
 * toujours la bonne réponse (voir aboutOrAgainst).
 */
const SOLO_GENERATORS: Record<Exclude<QuizTopic, 'mechanics'>, Gen[]> = {
  behavior: [signOf, signOf, ...[whichGhostTell, observationQuestion, abilityOfGhost].map(aboutOrAgainst)],
  speed: [speedOfGhost, speedSummary, losOfGhost, ...[speedProfile, speedStandard].map(aboutOrAgainst)],
  sanity: [sanityOfGhost, sanitySummary, ...[sanityProfile, sanityStandard, earlyHunter].map(aboutOrAgainst)],
  zero: [testOfGhost, distinguish, aboutOrAgainst(zeroTest)],
  expert: [authored],
}

const GENERATORS: Record<Exclude<QuizTopic, 'mechanics'>, Gen[]> = {
  behavior: [whichGhostTell, observationQuestion, abilityOfGhost],
  speed: [speedOfGhost, speedStandard, speedSummary, losOfGhost, speedProfile],
  sanity: [sanityOfGhost, sanityStandard, sanitySummary, earlyHunter, sanityProfile],
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

/**
 * Construit une série de questions variées, en privilégiant les entités les moins maîtrisées. Une série sur
 * une partie des entités (« les moins maîtrisées ») prend ses mauvaises réponses d'abord parmi elles : la
 * bonne réponse n'est pas le seul nom de la liste parmi les choix.
 */
export function buildQuiz(opts: QuizOptions): Question[] {
  const { rng, count } = opts
  // un ancien lien (?topic=evidence) ou un thème inconnu ne casse rien : il est ignoré
  const topics = opts.topics.filter((t) => t === 'mechanics' || t in GENERATORS)
  const out: Question[] = []
  if (!topics.length) return out
  const seen = new Set<string>()
  // une seule entité : les questions à choix de noms ne la donnent pas toujours pour réponse
  const solo = opts.ghosts.length === 1
  const tally = { named: 0, self: 0 }
  const pool = !solo && opts.ghosts.length > 1 && opts.ghosts.length < opts.allGhosts.length ? new Set(opts.ghosts.map((g) => g.id)) : null
  const ctx: Ctx = solo
    ? { ...opts, solo, tally, standard: { san: rng() < SOLO_STANDARD, spd: rng() < SOLO_STANDARD }, longest: rng() < LONGEST_KEPT }
    : pool
      ? { ...opts, pool }
      : opts
  const byId = new Map(opts.allGhosts.map((o) => [o.id, o]))
  const named = (q: Question) =>
    q.choices.every((c) => {
      const o = byId.get(c.id)
      return !!o && c.label === ghostChoice(o).label
    })
  const generators = solo ? SOLO_GENERATORS : GENERATORS
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
      const gen = pick(rng, generators[topic])
      q = gen(g, ctx)
      // aucune autre entité de la liste ne pouvait être une mauvaise réponse : la bonne serait le seul nom de la
      // liste parmi les choix. La question porte alors sur une entité qu'on confond avec g, g parmi les mauvaises
      // (sans entité proche qui s'y prête, la question ne se pose pas)
      if (q && pool && named(q) && q.choices.filter((c) => pool.has(c.id)).length === 1) {
        let alt: Question | null = null
        for (const o of shuffle(rng, rivals(opts.allGhosts).get(g.id) ?? [])) if ((alt = gen(o, { ...ctx, offer: g }))) break
        q = alt
      }
    }
    if (!q || seen.has(q.id)) continue
    seen.add(q.id)
    misses = 0
    if (solo && named(q)) {
      tally.named++
      if (q.correct.includes(opts.ghosts[0].id)) tally.self++
    }
    // typographie française sur ce que l'app compose (les textes des fiches le sont déjà au chargement)
    out.push({ ...q, prompt: fr(q.prompt), explain: fr(noLeadingMais(q.explain)), ...(q.note ? { note: fr(q.note) } : {}) })
  }
  // une entité qui a peu de questions dans ces thèmes (le Mimic copie tout : seuls ses tests se posent) : la
  // série se complète de ses questions rédigées plutôt que de s'arrêter à deux
  if (solo && out.length < count / 2 && !topics.includes('expert')) {
    for (let i = 0; i < 40 && out.length < count; i++) {
      const q = authored(opts.ghosts[0], ctx)
      if (!q || seen.has(q.id)) continue
      seen.add(q.id)
      out.push({ ...q, prompt: fr(q.prompt), explain: fr(noLeadingMais(q.explain)) })
    }
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
  /**
   * Les entités des autres cartes de la séance (les mêmes du début à la fin de la séance) : elles passent
   * d'abord parmi les mauvaises réponses, pour que l'entité de la carte précédente ne soit pas le seul nom
   * familier, ni toujours la bonne réponse.
   */
  peers?: readonly string[]
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
function signQuestion(g: Ghost, quote: string, ctx: Ctx): Question | null {
  if (g.id === MIMIC || !quote || names(quote, g) || needsEvidence(quote)) return null
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
    explain: `${called(g)}${NNBSP}: ${g.summary}`,
  }
}

/* ---------- « Lequel de ces signes est celui de X ? » ---------- */

/**
 * Le mot que le nom d'une entité (ou sa traduction) met en tête : « Poltergeist » fait penser aux objets qui
 * volent, « Banshee » au cri, « Ombre » à une silhouette noire, « Jumeaux » à deux, « Fantôme » à ce qui
 * disparaît, « Cauchemar » au noir, « Obake » (qui change de forme) à une transformation. Dans une question
 * sur cette entité, la bonne réponse n'est jamais la seule à le contenir : il suffirait de lire le nom.
 */
const NAME_HINTS: Readonly<Record<string, RegExp>> = {
  // « lance », « lancer », « projette » ; pas « une chasse lancée »
  poltergeist: /(?<!\p{L})(?:objets?|lan[cç](?:e|ent|er)|projet\p{L}*)(?!\p{L})/iu,
  banshee: /(?<!\p{L})(?:cris?|crie\p{L}*|chant\p{L}*)(?!\p{L})/iu,
  shade: /(?<!\p{L})(?:silhouettes?|ombres?|noire?s?)(?!\p{L})/iu,
  'the-twins': /(?<!\p{L})deux(?!\p{L})|simultan/iu,
  phantom: /dispar\p{L}*|invisib\p{L}*/iu,
  mare: /(?<!\p{L})(?:noire?s?|sombres?|obscur\p{L}*)(?!\p{L})/iu,
  obake: /(?<!\p{L})(?:formes?|modèles?|transform\p{L}*|métamorph\p{L}*)(?!\p{L})/iu,
}

/** La bonne réponse est-elle la seule à contenir le mot que souffle le nom de g (son nom lui-même mis à part) ? */
const hintCache = new Map<string, boolean>()
function hintAlone(g: Ghost, right: string, wrong: readonly string[]): boolean {
  const re = NAME_HINTS[g.id]
  if (!re) return false
  const has = (t: string) => {
    const key = `${g.id}|${t}`
    let v = hintCache.get(key)
    if (v === undefined) hintCache.set(key, (v = re.test(redact(t, g))))
    return v
  }
  return has(right) && !wrong.some(has)
}

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
function signOfGhost(x: Ghost, ctx: Ctx): Question | null {
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
        if (hintAlone(x, right, options.map((o) => o.label))) continue
        const fits = (chosen: readonly Option<Sign>[]) => {
          const labels = chosen.map((o) => o.label)
          return apart(chosen) && !twinOf(right, labels) && !hintAlone(x, right, labels)
        }
        const wrong = matching(ctx.rng, right, options, 3, fits, ranks)
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

/** Les trois premiers mots d'une réponse (« plus actif quand »). */
const opening = (s: string) =>
  s
    .toLocaleLowerCase('fr')
    .split(/[^\p{L}\d’']+/u)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')

/**
 * Une seule mauvaise réponse commence comme la bonne (« Plus actif quand plusieurs joueurs sont à proximité »
 * face à « Plus actif quand on parle près de lui ») : la paire jumelle contient toujours la réponse, c'est
 * pile ou face. Permis seulement si deux autres mauvaises réponses forment, elles aussi, une paire jumelle.
 */
function twinOf(right: string, wrong: readonly string[]): boolean {
  const r = opening(right)
  const starts = wrong.map(opening)
  if (starts.filter((s) => s === r).length !== 1) return false
  return !starts.some((s, i) => s !== r && starts.indexOf(s) !== i)
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
  const mine = [...own, ...x.tells.filter((t) => t.zeroEvidence).map((t) => t.text)]
  const taken = new Set(themesOf(mine.join(' ')).filter((t) => NARROW.has(t)))
  // le thème que souffle le nom de X (les objets du Poltergeist) : un signe d'une autre entité qui en parle
  // reste une mauvaise réponse possible s'il est faux pour X (le Deildegast ralentit selon les objets utilisés),
  // sinon la bonne réponse serait la seule à en parler
  const hint = NAME_HINTS[x.id]
  const hinted = new Set(hint ? mine.flatMap((t) => [...t.matchAll(new RegExp(hint.source, 'giu'))].flatMap((m) => themesOf(m[0]))) : [])
  const free = (s: Sign) => !s.themes.some((i) => taken.has(i) && !(hinted.has(i) && hint!.test(s.text)))
  const out = distractorSigns(all)
    .filter((s) => s.ghost.id !== x.id && free(s) && !signFits(s.text, x, all))
    .flatMap((s) => [s.text, ...shortened(s.text).filter((v) => keepsSense(s.text, v) && !signFits(v, x, all))].map((label) => ({ value: s, label })))
  byGhost.set(x.id, out)
  return out
}

/* ---------- tests sans preuve ---------- */

/**
 * « Ce test confirme quelle entité ? » pour le test de la carte ; s'il ne peut pas se citer tel quel,
 * « Quel test confirme X ? », face aux tests d'autres entités.
 */
function testOfCard(card: Card, g: Ghost, ctx: Ctx): Question | null {
  const k = Number(card.id.split(':').pop())
  const t = zeroTests(g).find((x) => x.k === k)
  if (!t) return null
  const quote = quoteFor(t.text, g)
  if (quote) {
    const gender = sameGender(quote, g)
    // une entité nommée dans le test (« plus tôt qu'un Démon ») s'écarte d'un coup d'œil
    const pool = ctx.allGhosts.filter((o) => o.id !== g.id && o.id !== MIMIC && zeroTests(o).length > 0 && !names(t.text, o) && gender(o))
    if (pool.length >= 3) {
      const wrong = sample(ctx.rng, plausible(g, pool, ctx.rng).slice(0, 6), 3)
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
  return whichTest(g, t, ctx)
}

/** Les tests de chaque entité, cités (caviardés de son nom), avec ou sans leurs apartés : calculés une fois. */
const testLabels = perList((all) => {
  const out = new Map<string, string[]>()
  for (const o of all) {
    out.set(
      o.id,
      // un test peut nommer une autre entité (« plus tôt qu'un Démon ») : la bonne réponse aussi, nommer
      // quelqu'un ne la désigne donc pas (voir namingBalanced) ; jamais la sienne (quoteFor)
      zeroTests(o)
        .map((z) => quoteFor(z.text, o))
        .filter((q): q is string => !!q)
        .flatMap((q) => [q, withoutAsides(q)].filter((v) => keepsSense(q, v))),
    )
  }
  return out
})

/** Les entités, celles qu'on confond avec g d'abord. */
function plausible(g: Ghost, pool: readonly Ghost[], rng: Rng): Ghost[] {
  const partners = new Set(g.confusions.map((c) => c.with))
  return shuffle(rng, pool).sort((a, b) => Number(partners.has(b.id)) - Number(partners.has(a.id)))
}

/**
 * Aucune marque ne distingue une seule réponse : ni la seule qui nomme une entité (« plus tôt qu'un Démon »),
 * ni la seule qui n'en nomme pas.
 */
function namingBalanced(labels: readonly string[], all: readonly Ghost[]): boolean {
  const k = labels.filter((l) => namesAny(l, all)).length
  return k !== 1 && k !== labels.length - 1
}

/**
 * « Quel test confirme X sans preuve ? » : le test t de X face aux tests d'autres entités, chacun caviardé de
 * son propre nom (« c'est cette entité »), de même forme que le bon. Un test ne se coupe pas (sa condition et
 * sa conclusion vont ensemble), il perd au plus ses apartés, et jamais les nombres qu'ils portaient. Un test
 * peut nommer une autre entité, bon ou mauvais, jamais X ; ni la seule réponse qui nomme quelqu'un, ni la
 * seule qui contient le mot que souffle le nom de X (« objets » pour le Poltergeist) n'est d'office la bonne.
 * Deux tests de X dans une même série n'ont pas le même énoncé.
 */
function whichTest(g: Ghost, t: { text: string; k: number }, ctx: Ctx, cardId?: string): Question | null {
  const k = t.k
  const all = ctx.allGhosts
  const full = redact(withoutEvidenceAsides(t.text), g)
  if (names(full, g)) return null
  const labels = testLabels(all)
  const pool = plausible(
    g,
    all.filter((o) => o.id !== g.id && o.id !== MIMIC),
    ctx.rng,
  ).flatMap((o) => (labels.get(o.id) ?? []).filter((label) => !names(label, g)).map((label) => ({ value: o, label })))
  // la version sans apartés d'abord quand ils nomment une autre entité : la bonne réponse n'a pas à en nommer
  const bare = withoutAsides(full)
  const versions = distinctBy(namesAny(full, all) && !namesAny(bare, all) ? [bare, full] : [full, bare], (s) => s)
  const position = zeroTests(g).findIndex((x) => x.k === k)
  const that = /^Les\s/u.test(g.name) ? `que ce sont ${le(g.name)}` : `que c’est ${le(g.name)}`
  return byRank(ctx.rng, (ranks) => {
    for (const right of versions) {
      if (hintAlone(g, right, pool.map((o) => o.label))) continue
      const fits = (chosen: readonly Option<Ghost>[]) =>
        distinctGhosts(chosen) && namingBalanced([right, ...chosen.map((o) => o.label)], all) && !hintAlone(g, right, chosen.map((o) => o.label))
      const wrong = matching(ctx.rng, right, pool, 3, fits, ranks)
      if (!wrong) continue
      return {
        id: `q:test-of:${g.id}:${k}`,
        topic: 'zero',
        ghostId: g.id,
        prompt: position % 2 ? `Sans preuve, comment t’assurer ${that}${NNBSP}?` : `Quel test confirme ${le(g.name)} sans preuve${NNBSP}?`,
        multi: false,
        choices: shuffle(ctx.rng, [{ id: g.id, label: right }, ...wrong.map((o) => ({ id: o.value.id, label: o.label }))]),
        correct: [g.id],
        explain: `Test de confirmation ${de(g.name)}. ${g.summary}`,
        ...(cardId ? { cardId } : {}),
      }
    }
    return null
  })
}

/** « Quel test confirme X sans preuve ? » pour l'un de ses tests, tiré au hasard (une série sur X seul). */
function testOfGhost(g: Ghost, ctx: Ctx): Question | null {
  const tests = zeroTests(g)
  if (!tests.length) return null
  const p = Math.floor(ctx.rng() * tests.length)
  return whichTest(g, tests[p], ctx, p < TESTS_PER_GHOST ? `g:${g.id}:test:${tests[p].k}` : `g:${g.id}:tells`)
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
 * (fait de mécanique sans réponses rédigées, note sans mauvaise réponse, carte du Mimic). Le tirage ne
 * dépend que de la carte, du jour et des entités de la séance : la page peut se redessiner, les choix ne
 * bougent pas.
 *
 * Mêmes règles que le quiz : une seule bonne réponse, aucune mauvaise réponse vraie aussi pour
 * l'entité, aucun nom ni pronom qui souffle la réponse, jamais le Mimic parmi les choix, et des
 * réponses de même forme (voir homogeneous).
 */
export function questionForCard(card: Card, ctx: CardQuizContext): Question | null {
  const rng = cardRng(card.id, ctx.day)
  if (card.kind === 'fact') return factOfCard(card, ctx, rng)
  if (card.kind === 'note') return noteOfCard(card, ctx, rng)
  const g = ctx.allGhosts.find((x) => x.id === card.ghostId)
  // le Mimic copie vitesses, seuils et comportements : il n'est jamais une mauvaise réponse, et parmi les
  // choix il serait toujours la bonne ; ses cartes se révisent en se testant soi-même
  if (!g || g.id === MIMIC) return null
  const peers = ctx.peers?.filter((id) => id !== g.id)
  const opts: Ctx = { topics: [], ghosts: [g], allGhosts: ctx.allGhosts, mechanics: ctx.mechanics, count: 1, rng, ...(peers?.length ? { pool: new Set(peers) } : {}) }
  const signs = [
    () => signOfGhost(g, opts),
    ...shuffle(rng, g.keyTells.filter(plainSign)).map((t) => () => signQuestion(g, redact(t, g), opts)),
    () => whichGhostTell(g, opts),
  ]
  const tries: (() => Question | null)[] = {
    // un nombre (« 70 % »), sinon des résumés de même forme, sinon des noms d'entités : le profil d'un seuil
    // ou d'une vitesse particuliers, puis, pour une entité standard, laquelle chasse comme elle
    sanity: [sanityOfGhost, sanitySummary, sanityProfile, sanityStandard].map((gen) => () => gen(g, opts)),
    speed: [speedOfGhost, speedSummary, speedProfile, speedStandard].map((gen) => () => gen(g, opts)),
    test: [() => testOfCard(card, g, opts)],
    reverse: [() => signQuestion(g, card.quote ?? '', opts)],
    tells: signs,
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
