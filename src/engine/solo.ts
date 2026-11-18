import type { Ghost, Mechanics } from '../data/types'
import { de, fitsToo, isFeminine, le, mentionsEvidence, MIMIC, namesGhost, needsEvidence, numbersFit, restatedBy, reverseTells, tellNumbers, testNeedsEvidence, TESTS_PER_GHOST, withoutEvidenceAsides, zeroTests } from './cards'
import { fr, NNBSP, redactGhostName as redact } from './format'
import {
  agrees,
  asksOf,
  asOther,
  balancedRanks,
  cap,
  closeLengths,
  confusionWithoutEvidence,
  distractorSigns,
  duelQuestion,
  duelsFor,
  endSentence,
  factKeys,
  GENDER_TALK,
  hints,
  huntsAlready,
  keepsSense,
  losAsked,
  losQuestion,
  namesAny,
  nearSpeed,
  noLeadingMais,
  numberQuestion,
  plainSign,
  plural,
  pronounClash,
  quoteFor,
  rivals,
  screenOf,
  SENTENCES,
  shortened,
  signOfGhost,
  signVersions,
  SPEED_OR_SANITY,
  standsOut,
  strayCheck,
  SUBJ,
  summaryQuestion,
  themesOf,
  whichTest,
  withoutAsides,
  wrongClaimsFor,
  type Ctx,
  type Option,
  type Question,
  type QuizTopic,
  type Sign,
  type SignStyle,
} from './quiz'
import { shuffle, weightedPick, type Rng } from './random'

/**
 * La copie sur une seule entité (« Me tester sur X »). Deux règles :
 *  - savoir que la copie porte sur X ne rapporte rien : aucun choix de quatre noms, et là où X est l'une de deux
 *    réponses (« de qui parle-t-on ? »), il l'est une fois sur deux ;
 *  - chaque question porte sur X, ou compare X à une entité qu'on confond avec lui. Aucune autre entité n'est le
 *    sujet d'une question, et toutes s'inscrivent sur X (ghostId).
 *
 * Ce qui est présenté comme faux pour X, ou comme l'excluant, vient toujours des fiches : un signe d'une entité
 * qu'on confond avec X et qui ne lui convient en rien (les mêmes garde-fous que les mauvaises réponses du quiz), un
 * test d'élimination de X, une observation décisive d'une entité proche. Le Mimic copie l'entité imitée : aucun
 * comportement n'est jamais présenté comme faux pour lui, et il n'est jamais l'entité proche.
 *
 * Ce module importe quiz.ts, qui l'importe à son tour (buildQuiz confie les listes d'une seule entité à
 * buildSoloQuiz) : rien de quiz.ts ne sert ici au chargement du module, seulement à l'intérieur des fonctions.
 */

/** Le nombre de questions de « Me tester sur X », quel que soit le réglage du quiz général. */
export const SOLO_COUNT = 10

/**
 * Les sortes de questions d'une copie sur une seule entité, reconnues au début de leur identifiant :
 * T1 nombres et profil (q:san, q:spd, q:sansum, q:spdsum, q:los), T2 signe de X (q:sign-of), T3a test de X
 * (q:test-of), T3b « ce test suffit-il ? » (q:suffit), T4 ce qui exclut X (q:exclut), T5 l'intrus (q:intrus),
 * T6 vrai ou faux (q:vf), T7a départage (q:dist), T7b « de qui parle-t-on ? » (q:duel), T8 observation
 * (q:constat), et les questions rédigées de la fiche (q:auth).
 */
export type SoloType = 'T1' | 'T2' | 'T3a' | 'T3b' | 'T4' | 'T5' | 'T6' | 'T7a' | 'T7b' | 'T8' | 'auth'

const PREFIXES: readonly [string, SoloType][] = [
  ['q:san:', 'T1'],
  ['q:spd:', 'T1'],
  ['q:sansum:', 'T1'],
  ['q:spdsum:', 'T1'],
  ['q:los:', 'T1'],
  ['q:sign-of:', 'T2'],
  ['q:test-of:', 'T3a'],
  ['q:suffit:', 'T3b'],
  ['q:exclut:', 'T4'],
  ['q:intrus:', 'T5'],
  ['q:vf:', 'T6'],
  ['q:dist:', 'T7a'],
  ['q:duel:', 'T7b'],
  ['q:constat:', 'T8'],
  ['q:auth:', 'auth'],
]

/** La sorte d'une question d'une copie sur une seule entité (null : une question d'une autre origine). */
export function soloType(q: Pick<Question, 'id'> | string): SoloType | null {
  const id = typeof q === 'string' ? q : q.id
  return PREFIXES.find(([p]) => id.startsWith(p))?.[1] ?? null
}

/** Les réponses fixes de « ce test suffit-il ? » (T3b), de « vrai ou faux » (T6) et de l'observation (T8). */
export const SOLO_ANSWERS = {
  enough: { yes: 'yes', no: 'no' },
  trueFalse: { true: 'true', false: 'false' },
  observation: { confirms: 'confirms', fits: 'fits', excludes: 'excludes' },
} as const

export interface SoloOptions {
  ghost: Ghost
  allGhosts: Ghost[]
  rng: Rng
  /** nombre de questions (10 : la copie de « Me tester sur X ») */
  count?: number
  /** les identifiants des questions déjà posées dans les copies précédentes (« Encore 10 ») : les autres passent d'abord */
  seen?: ReadonlySet<string> | readonly string[]
  /** seulement ces thèmes (le quiz général sur une seule entité étudiée) ; sans eux, tout, questions rédigées comprises */
  topics?: readonly QuizTopic[]
  /** aucune question ne nomme une autre entité (un débutant qui n'a étudié que celle-ci) */
  onlyListed?: boolean
  /**
   * Jusqu'où compléter la copie d'une fiche trop courte pour dix questions (1 par défaut) :
   * 0, rien que ce que la fiche donne sans redite ; 1, un départage de plus avec une entité proche ;
   * 2, en dernier recours, un vrai ou faux, un « de qui parle-t-on ? » ou une observation de plus, qui peut
   * reprendre une fois un objet ou un geste déjà demandé (jamais une même valeur ni une même phrase) : sa réponse
   * se tire, elle porte donc aussi souvent sur un fait d'une entité proche. À 2, les copies sont plus longues, mais
   * certaines redisent un fait (« tu entends le cri unique : est-ce que ça suffit ? », deux fois) : par défaut, une
   * fiche courte donne plutôt une copie plus courte.
   */
  relax?: 0 | 1 | 2
}

/* ---------- ce qu'une question demande, ce qu'elle montre ---------- */

/** Une phrase d'une fiche, et l'entité dont elle parle. */
interface Stmt {
  who: string
  text: string
  /** la ligne de la fiche d'où elle vient (un test cité sans sa conclusion reste le même test) */
  item?: string
  /**
   * Ce que la question en demande : à qui est le fait (`own`, par défaut), ou ce qu'il vaut, une preuve
   * (`proof`) ou un simple indice (`hint`) ; `ownProof` : les deux (« Quel test confirme X ? »). Savoir que la
   * cachette est le signe de l'Aswang ne dit pas si l'observer suffit à le confirmer : les deux se demandent dans
   * une même copie, dans cet ordre. Et une preuve, puis un indice sur le même objet, sont deux faits (la chasse
   * qui s'arrête dans la cachette ; l'entité qui marche vers le joueur à la chasse suivante) ; deux preuves, le
   * plus souvent le même. `any` : un corrigé rédigé, qui peut dire l'un ou l'autre.
   */
  aspect?: 'own' | 'proof' | 'hint' | 'ownProof' | 'any'
  /**
   * Un signe clé (`keyTells`) : les signes clés d'une fiche sont des faits différents, même quand ils parlent du
   * même objet (le disjoncteur du Hantu : sa buée quand il est coupé, et il ne le rallume jamais). Entre eux, le
   * même objet ne dit pas « le même fait » ; face à une autre ligne de la fiche (un test, une observation, une
   * question rédigée), qui redit souvent un signe clé, si.
   */
  key?: boolean
}

/** Une question composée, avec ce qu'elle demande et tout ce qu'elle montre une fois corrigée (clés de factKeys, lignes des fiches). */
interface Built {
  q: Question
  type: SoloType
  asks: Set<string>
  shows: Set<string>
  /** l'intrus : ce que demanderait chacune de ses trois affirmations vraies ; une seule au plus est connue par une autre question */
  truths?: string[][]
  /** ses réponses en phrases (signes, tests, départages), sans nom d'entité : aucune ne se relit dans la copie */
  sentences?: string[]
}

/** Une question possible sur X : son identifiant, stable, et de quoi la composer pour un tirage. */
interface Seed {
  id: string
  type: SoloType
  topic: QuizTopic
  /** nombre de réponses */
  width: 2 | 3 | 4
  /** la réponse, pour les questions dont les réponses sont fixes ou à deux noms (tirée avant la question) */
  cls?: string
  /** d'où vient la phrase : signes clés, phrases rédigées, départages */
  register?: string
  /** T1 : seuil, vitesse ou ligne de vue */
  group?: 'san' | 'spd' | 'los'
  /** ne se pose que si le tirage de la copie l'a décidé (valeur standard, ligne de vue) */
  gate?: 'stdSan' | 'stdSpd' | 'los'
  /** à essayer après les autres de sa sorte (un signe qui ne parle que de vitesse ou de seuil) */
  late?: boolean
  /**
   * Ce que la question demandera à coup sûr, connu sans la composer : si la copie le demande déjà, inutile de
   * chercher ses mauvaises réponses (la recherche de réponses de même forme est ce qui coûte).
   */
  pre?: () => string[]
  make: (rng: Rng) => Built | null
}

const isSoft = (k: string) => k.includes('|~')
/** La vitesse ou le seuil en général (voir keysOf et les questions en nombres). */
const BROAD = /\|~(?:vitesse|seuil)$/u
/** L'objet ou le geste d'une clé souple, quel que soit l'angle sous lequel on le demande. */
const themeOf = (k: string) => k.replace(/[/!].*$/u, '')

/** « Quitte rarement sa pièce », « reste dans sa pièce » : le même fait que « s'éloigne peu de sa pièce favorite » (thème `errance` de factKeys). */
const OWN_ROOM = /(?<!\p{L})(?:sa|leur)\s+pièce(?!\p{L})/iu

/** Les clés déjà calculées : les mêmes phrases des fiches reviennent d'une question à l'autre, d'une copie à l'autre. */
const keyCache = new Map<string, string[]>()

/** Les clés du fait que porte un texte sur une entité (voir factKeys) : valeurs, objets et gestes, ligne de vue. */
function keysOf(who: string, text: string): string[] {
  const id = `${who}\u0000${text}`
  let keys = keyCache.get(id)
  if (!keys) {
    if (keyCache.size > 20_000) keyCache.clear()
    keyCache.set(id, (keys = computeKeys(who, text)))
  }
  return keys
}

function computeKeys(who: string, text: string): string[] {
  const all = factKeys({ ghostId: who, prompt: text, choices: [], correct: [] })
  // la vitesse ou le seuil en général ne comptent que pour une phrase sans nombre (« vitesse très élevée, qui chute près
  // du joueur ») : entre deux phrases chiffrées, ce sont les valeurs qui disent si c'est le même fait
  const keys = all.some((k) => !isSoft(k)) ? all.filter((k) => !BROAD.test(k)) : all
  const room = `${who}|~errance`
  return OWN_ROOM.test(text) && !keys.includes(room) ? [...keys, room] : keys
}

/** Le début d'une réponse, tous noms d'entités retirés : la même phrase dite de deux entités se reconnaît. */
const namelessCache = new Map<string, string>()
function nameless(label: string, all: readonly Ghost[]): string {
  let v = namelessCache.get(label)
  if (v === undefined) {
    if (namelessCache.size > 20_000) namelessCache.clear()
    v = all
      .reduce((t, o) => redact(t, o), label)
      .toLocaleLowerCase('fr')
      .replace(/[^\p{L}\d]+/gu, ' ')
      .trim()
      .slice(0, 60)
    namelessCache.set(label, v)
  }
  return v
}

/** Une phrase reconnue à son début, quelle que soit sa version (entière, sans apartés, première partie). */
const lineKey = (who: string, text: string) =>
  `${who}#${text
    .toLocaleLowerCase('fr')
    .replace(/[^\p{L}\d]+/gu, ' ')
    .trim()
    .slice(0, 28)}`

/** La clé d'un objet ou d'un geste, quand on demande ce que le fait vaut (preuve, ou simple indice) et non à qui il est. */
const worthOf = (aspect: Stmt['aspect']): string[] => (aspect === 'proof' || aspect === 'ownProof' ? ['!preuve'] : aspect === 'hint' ? ['!indice'] : aspect === 'any' ? ['!preuve', '!indice'] : [])
/** Une phrase qui dit elle-même ce qu'elle vaut (« un pas manquant après le sel le confirme », « 90 ans ou plus : signe certain ») le montre. */
const SAYS_PROOF = /confirm|(?<!\p{L})certaine?s?(?!\p{L})|prouv|décisi|définiti|à coup sûr/iu
/** « …, c'est un Aswang » : une majuscule après l'article, donc un nom d'entité. */
const SAYS_NAME = /c[’']est (?:une? |le |la |l[’']|les )\p{Lu}/u
const SAYS_HINT = /(?<!\p{L})indices?(?!\p{L})|pourrait|peut-être/iu
const saidWorth = (text: string): string[] => [...(SAYS_PROOF.test(text) || SAYS_NAME.test(text) ? ['!preuve'] : []), ...(SAYS_HINT.test(text) ? ['!indice'] : [])]
const lineKeys = (s: Stmt): string[] => [lineKey(s.who, s.text), ...(s.item ? [s.item] : [])]

/**
 * Deux phrases sur le même objet (le sel, la cachette, les objets lancés) disent-elles le même fait ? Pas deux
 * signes clés d'une même fiche (voir Stmt.key), ni deux phrases chiffrées qui ne citent aucune valeur commune
 * (« lance un objet toutes les 0,5 s », « −2 % de santé par objet lancé » : deux faits ; une valeur commune, elle,
 * se voit à sa propre clé). Dans les autres cas, oui : une observation, un test, une question rédigée redisent le
 * plus souvent un signe. Chaque phrase montre l'objet sous sa sorte (signe clé ou non, chiffrée ou non), et une
 * question demande l'objet sous les sortes qui diraient le même fait qu'elle.
 */
const SORTS = ['KV', 'K', 'V', 'P'] as const
const sortOf = (key: boolean, valued: boolean) => (key ? (valued ? 'KV' : 'K') : valued ? 'V' : 'P')
const sameFact = (a: (typeof SORTS)[number], b: (typeof SORTS)[number]) => !(a.startsWith('K') && b.startsWith('K')) && !(a.endsWith('V') && b.endsWith('V'))

/** Les clés d'une phrase : dures (valeurs, ligne de vue), et son objet ou son geste, avec sa sorte. */
function parts(s: Stmt): { hard: string[]; soft: string[]; sort: (typeof SORTS)[number] } {
  const keys = keysOf(s.who, s.text)
  const hard = keys.filter((k) => !isSoft(k))
  return { hard, soft: keys.filter(isSoft), sort: sortOf(!!s.key, hard.length > 0) }
}

/** Ce que demande une question qui pose cette phrase : ses valeurs et son objet (à qui est-ce ?), ou ce qu'elle vaut. */
function askKeys(s: Stmt): string[] {
  const { hard, soft, sort } = parts(s)
  const own = s.aspect === 'proof' || s.aspect === 'hint' ? [] : [...hard, ...soft.flatMap((k) => SORTS.filter((o) => sameFact(sort, o)).map((o) => `${k}/${o}`))]
  return [...own, ...soft.flatMap((k) => worthOf(s.aspect).map((w) => `${k}${w}`)), ...lineKeys(s)]
}

/** Ce que montre une phrase une fois la question corrigée : à qui elle est, toujours ; ce qu'elle vaut, si la question le disait. */
function showKeys(s: Stmt): string[] {
  const { hard, soft, sort } = parts(s)
  const worth = [...new Set([...worthOf(s.aspect), ...saidWorth(s.text)])]
  return [...hard, ...soft.map((k) => `${k}/${sort}`), ...soft.flatMap((k) => worth.map((w) => `${k}${w}`)), ...lineKeys(s)]
}

/** Un pourcentage ou une vitesse, tels qu'on les lit : « 50 % », « 1,7 m/s ». */
const READ_VALUE = /\d+(?:,\d+)?\s?(?:%|m\/s)/gu
const asRead = (v: string) => `=${v.replace(/\s/gu, '')}`

function built(q: Question, type: SoloType, asked: readonly Stmt[], shown: readonly Stmt[] = [], extra: readonly string[] = []): Built {
  const asks = new Set([...asked.flatMap(askKeys), ...extra])
  const shows = new Set([...asks, ...asked.flatMap(showKeys), ...shown.flatMap(showKeys)])
  // une question en nombres demande une valeur telle qu'on la lit : elle passe avant toute question dont l'énoncé, la
  // citation, une réponse ou le corrigé l'écrit, de qui qu'elle parle (ses propres mauvaises valeurs ne montrent rien)
  const numeric = /^q:(?:san|spd):/u.test(q.id)
  const right = q.choices.filter((c) => q.correct.includes(c.id)).map((c) => c.label)
  for (const t of [q.prompt, q.quote ?? '', q.explain, ...(numeric ? right : q.choices.map((c) => c.label))]) for (const m of t.matchAll(READ_VALUE)) shows.add(asRead(m[0]))
  if (numeric) for (const r of right) asks.add(asRead(r))
  return { q, type, asks, shows }
}

/* ---------- petites aides ---------- */

const NO_MECHANICS: Mechanics = { topics: [], trueFalse: [] }
const ctxFor = (x: Ghost, all: Ghost[], rng: Rng): Ctx => ({ topics: [], ghosts: [x], allGhosts: all, mechanics: NO_MECHANICS, count: 1, rng })

/** « du Yurei, de l’Oni et du Thayé » */
function listOf(parts: readonly string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`
}

/** « le », « la », « les » devant un verbe (« ça suffit à le confirmer ») ; « l’ », « les » devant une voyelle. */
const them = (g: Ghost) => (plural(g) ? 'les' : isFeminine(g.name) ? 'la' : 'le')
const themElided = (g: Ghost) => (plural(g) ? 'les ' : 'l’')
/** « C’est le Deogen », « Ce sont les Jumeaux » */
const itIs = (g: Ghost) => `${plural(g) ? 'Ce sont' : 'C’est'} ${le(g.name)}`

function memo<T>(f: (x: Ghost, all: Ghost[]) => T): (x: Ghost, all: Ghost[]) => T {
  const cache = new WeakMap<readonly Ghost[], Map<string, T>>()
  return (x, all) => {
    let byGhost = cache.get(all)
    if (!byGhost) cache.set(all, (byGhost = new Map()))
    if (!byGhost.has(x.id)) byGhost.set(x.id, f(x, all))
    return byGhost.get(x.id)!
  }
}

function memoList<T>(f: (all: Ghost[]) => T): (all: Ghost[]) => T {
  const cache = new WeakMap<readonly Ghost[], T>()
  return (all) => {
    if (!cache.has(all)) cache.set(all, f(all))
    return cache.get(all)!
  }
}

/** Les entités qu'on confond avec x (jamais le Mimic ; aucune pour le Mimic, qui copie : rien n'est faux pour lui). */
const rivalsOf = (x: Ghost, all: Ghost[]): Ghost[] => (x.id === MIMIC ? [] : (rivals(all).get(x.id) ?? []))

/* ---------- les tests d'une fiche : leur condition, sans leur conclusion ---------- */

const bareName = (n: string) => n.replace(/^(?:The |Le |Les |La |L['’])/u, '')
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const conclusions = new WeakMap<Ghost, RegExp>()

/**
 * La conclusion d'un test (« …, c'est un Aswang », « …, ça pourrait être un Aswang », « …, ce n'est pas un
 * Goryo », « … désigne un Oni ») : elle dit à elle seule si le test confirme, suggère ou exclut.
 */
function conclusionOf(x: Ghost): RegExp {
  let re = conclusions.get(x)
  if (!re) {
    const names = [...new Set([bareName(x.name), bareName(x.nameEn)])].map(escapeRe).join('|')
    re = new RegExp(
      `[\\s,]*(?:alors\\s+)?(?:c[’']est(?:\\s+peut-être)?|ce\\s+sont|ça\\s+(?:pourrait|peut)\\s+être|ce\\s+n[’']est\\s+pas|ce\\s+ne\\s+sont\\s+pas|désigne)\\s+(?:une?\\s+|le\\s+|la\\s+|les\\s+|l[’'])?(?:${names})(?![\\p{L}])`,
      'u',
    )
    conclusions.set(x, re)
  }
  return re
}

/** Ce qui, avant la conclusion, dirait déjà si le test suffit. */
const VERDICT = /pourrait|peut-être|(?<!\p{L})indices?(?!\p{L})|à coup sûr|forcément|certitude/iu

/**
 * Un test de la fiche de x sans sa conclusion ni ce qui la suit : sa mise en place et sa condition (« Laisse
 * l'entité te voir pendant une chasse, puis cache-toi dans une cachette officielle. Si l'entité atteint ta
 * cachette et que la chasse s'arrête aussitôt »). Null sans conclusion reconnue, ou si le test passe par une preuve.
 */
function testBody(text: string, x: Ghost): string | null {
  const m = conclusionOf(x).exec(text)
  if (!m || m.index < 20) return null
  const body = withoutEvidenceAsides(text.slice(0, m.index))
    .replace(/[\s,;:]+$/u, '')
    .trim()
  if (body.length < 20 || mentionsEvidence(body) || VERDICT.test(body)) return null
  return body
}

/**
 * La condition d'un test, seule, quand elle se comprend sans sa mise en place (« Si tu vois une buée sortir de
 * l'entité ») : elle nomme l'entité ou le joueur, et ne renvoie pas à la phrase d'avant (« Si c'est le cas »).
 */
function conditionOf(body: string): string | null {
  const parts = body.split(SENTENCES)
  const last = parts[parts.length - 1]
  if (parts.length < 2 || !/^Si\s/u.test(last) || /^Si\s+(?:c[’']est|elles?|ils?|ce|cette|ces|oui|non)(?!\p{L})/u.test(last)) return null
  return /l[’']entité|(?<!\p{L})tu(?!\p{L})/u.test(last) ? last : null
}

/**
 * Un test sans sa conclusion, dit comme ce qu'on observe : sa mise en place, puis sa condition sans « si » (« Laisse
 * l'entité te voir pendant une chasse, puis cache-toi dans une cachette officielle. L'entité atteint ta cachette
 * et la chasse s'arrête aussitôt. »). Null si la condition ne commence pas par « si ».
 */
function situationOf(body: string): string | null {
  const parts = body.split(SENTENCES)
  const last = parts[parts.length - 1]
  // la condition qui suit la mise en place (« …, allume-le : si l'entité apparaît… ») d'abord ; sinon celle qui ouvre la phrase
  let said = last.replace(/([,:])\s+si,?\s+/u, '$1 ').replace(/([,:])\s+s[’']il(s?)\s+/u, '$1 il$2 ')
  if (said === last) {
    said = last.replace(/^Si,?\s+/u, '').replace(/^S[’']il(s?)\s+/u, 'Il$1 ')
    // « Si l'affichage est activé, relève… : une baisse de 20 % » : ce « si » n'était pas la condition du test
    if (/\s:\s/u.test(said)) return null
  }
  if (said === last) return null
  said = said
    .replace(/\s+mais\s+qu(?:e\s+|[’'])/gu, ' mais ')
    .replace(/\s+et\s+qu(?:e\s+|[’'])/gu, ' et ')
    .replace(/\s+ou\s+(?:si\s+|s[’'](?=il)|qu(?:e\s+|[’']))/gu, ' ou ')
    .replace(/,\s+qu(?:e\s+|[’'])/gu, ', ')
  // une autre condition (« …, si … ») resterait sans suite
  if (/[,:;]\s+si\s/iu.test(said)) return null
  return [...parts.slice(0, -1), endSentence(cap(said))].join(' ')
}

/** Au-delà, un test cité devient une page à lire avant de répondre : il se demande autrement (« Quel test confirme X ? »). */
const QUOTE_MAX = 340

interface OwnTest {
  /** rang dans la fiche */
  i: number
  text: string
  body: string
  definitive: boolean
  why?: string
}

/**
 * Ce que la fiche de x conclut d'un test, et ce qu'elle ajoute (« c'est un Aswang (…). Attention : … », « ça
 * pourrait être un Aswang. », « ce n'est pas un Goryo. Prudence si… ») : la suite d'un corrigé qui vient de citer
 * sa condition (« Dans ce cas, … »). Le test entier quand sa conclusion ne se lit pas ainsi (« … désigne un Oni »).
 */
function verdictOf(text: string, x: Ghost): string {
  const m = conclusionOf(x).exec(text)
  const rest = m ? text.slice(m.index).replace(/^[\s,:;]+/u, '') : ''
  return /^(?:alors\s+)?(?:c[’']est|ce\s+sont|ça|ce\s+n)/u.test(rest) ? `Dans ce cas, ${rest}` : text
}

/** Les tests de confirmation de x qui se font sans preuve et se citent sans leur conclusion. */
const ownTests = memo((x): OwnTest[] =>
  x.confirmationTests.flatMap((t, i) => {
    if (t.requires || testNeedsEvidence(t.text)) return []
    const body = testBody(t.text, x)
    return body ? [{ i, text: t.text, body, definitive: t.definitive, ...(t.why ? { why: t.why } : {}) }] : []
  }),
)

/** Les tests d'élimination de x qui se font sans preuve et se citent sans leur conclusion. */
const ownEliminations = memo((x): { i: number; text: string; body: string }[] =>
  x.eliminationTests.flatMap((t, i) => {
    if (testNeedsEvidence(t.text)) return []
    const m = conclusionOf(x).exec(t.text)
    // un test d'élimination conclut « ce n'est pas X » : rien d'autre ne l'exclut
    if (!m || !/n[’']est\s+pas|ne\s+sont\s+pas/u.test(m[0])) return []
    const body = testBody(t.text, x)
    return body ? [{ i, text: t.text, body }] : []
  }),
)

/* ---------- T1 : nombres et profil ---------- */

/**
 * Les chances qu'une entité au seuil (ou à la vitesse) standard ait sa valeur standard demandée dans une copie :
 * 22 entités chassent d'habitude à 50 %, 20 à 1,7 m/s. Posée plus souvent, la valeur standard, toujours parmi
 * les choix, gagnerait d'office ; la copie préfère les nombres propres à l'entité.
 */
const SOLO_STANDARD = { san: 0.06, spd: 0.012 } as const

/**
 * Les chances que la ligne de vue se demande dans une copie : souvent pour les rares entités qui n'accélèrent
 * pas, rarement pour les autres, pour qu'au fil des copies « Oui » ne gagne pas plus souvent que « Non ». C'est ce
 * tirage qui décide, d'une copie à l'autre : la question revient même si la copie d'avant l'a posée.
 */
const losChance = memoList((all) => {
  const asked = all.filter(losAsked)
  const no = asked.filter((g) => !g.speed.los).length
  const yes = asked.length - no
  return { no: LOS_NO, yes: yes ? Math.min(LOS_NO, (LOS_NO * no) / yes) : 0 }
})
/** Une copie sur deux, pour une entité qui n'accélère pas : la question revient ainsi rarement deux copies de suite. */
const LOS_NO = 0.5

function numberSeeds(x: Ghost, all: Ghost[]): Seed[] {
  if (x.id === MIMIC) return []
  const out: Seed[] = []
  /** la question telle que le quiz la compose : ce qu'elle demande (sa valeur), ce que montre son corrigé (le résumé entier) */
  const wrap = (q: Question | null): Built | null => {
    if (!q) return null
    const right = q.choices.filter((c) => q.correct.includes(c.id)).map((c) => c.label)
    const asks = factKeys(q).filter((k) => !k.startsWith('carte:') && !isSoft(k))
    // « vitesse très élevée, qui chute près du joueur » redit « 3,0 m/s loin → 0,4 m/s près » : la question demande aussi
    // la vitesse (ou le seuil) en général, comme une phrase chiffrée face à une phrase sans nombre
    const broad = `${x.id}|~${q.topic === 'sanity' ? 'seuil' : 'vitesse'}`
    const b = built(q, 'T1', [], [{ who: x.id, text: [q.prompt, ...right, q.explain].join(' \n ') }], [...asks, ...SORTS.filter((o) => sameFact('V', o)).map((o) => `${broad}/${o}`)])
    b.shows.add(`${broad}/V`)
    return b
  }
  for (const kind of ['san', 'spd'] as const) {
    const topic: QuizTopic = kind === 'san' ? 'sanity' : 'speed'
    for (const a of asksOf(kind, x)) {
      out.push({
        id: a.key,
        type: 'T1',
        topic,
        width: 4,
        group: kind,
        ...(a.weight < 1 ? { gate: kind === 'san' ? ('stdSan' as const) : ('stdSpd' as const) } : {}),
        make: (rng) => wrap(numberQuestion(a, ctxFor(x, all, rng))),
      })
    }
    out.push({
      id: `q:${kind === 'san' ? 'sansum' : 'spdsum'}:${x.id}`,
      type: 'T1',
      topic,
      width: 4,
      group: kind,
      make: (rng) => wrap(summaryQuestion(kind, x, ctxFor(x, all, rng))),
    })
  }
  // la ligne de vue : son corrigé ne donne que ce qui la concerne, pour ne pas souffler une vitesse demandée ensuite
  const part = x.speed.summary.split(/\s+·\s+/u).find((p) => /ligne de vue/iu.test(p) && !/m\/s/u.test(p))
  const detail = x.speed.details.find((d) => /ligne de vue/iu.test(d))
  const about = [part ? endSentence(cap(part)) : '', detail ?? ''].filter(Boolean).join(' ')
  if (losAsked(x)) {
    out.push({
      id: `q:los:${x.id}`,
      type: 'T1',
      topic: 'speed',
      width: 2,
      group: 'los',
      gate: 'los',
      cls: x.speed.los ? 'yes' : 'no',
      make: () => {
        const q = losQuestion(x)
        return q && wrap(about ? { ...q, explain: about } : q)
      },
    })
  }
  return out
}

/* ---------- T2 : « Lequel de ces signes est celui de X ? » ---------- */

function signSeeds(x: Ghost, all: Ghost[]): Seed[] {
  if (x.id === MIMIC) return []
  const byId = new Map(all.map((o) => [o.id, o]))
  /** le corrigé dit de qui est chaque signe, sans rien montrer d'autre de la fiche */
  const wrap = (q: Question | null, full: string, cardId: string, key: boolean): Built | null => {
    if (!q) return null
    const right = q.choices.find((c) => q.correct.includes(c.id))!.label
    const others = q.choices.filter((c) => !q.correct.includes(c.id))
    const owners = others.map((c) => byId.get(c.id))
    if (owners.some((o) => !o)) return null
    const whole = right === full ? '' : `${NNBSP}: «${NNBSP}${full}${NNBSP}»`
    const explain = `C’est un signe ${de(x.name)}${whole}. Les trois autres sont, dans l’ordre, des signes ${listOf(owners.map((o) => de(o!.name)))}.`
    return built(
      { ...q, explain, cardId },
      'T2',
      [{ who: x.id, text: full, key }],
      others.map((c) => ({ who: c.id, text: c.label, key })),
    )
  }
  const out: Seed[] = x.keyTells.map((t, k) => ({
    id: `q:sign-of:${x.id}:${k}`,
    type: 'T2' as const,
    topic: 'behavior' as const,
    width: 4 as const,
    register: 'key',
    late: SPEED_OR_SANITY.test(t),
    pre: () => askKeys({ who: x.id, text: t, key: true }),
    make: (rng: Rng) => wrap(signOfGhost(x, ctxFor(x, all, rng), undefined, k), t, `g:${x.id}:tells`, true),
  }))
  // les signes « 0 preuve » rédigés en phrases, face à des phrases d'autres fiches
  const numbers = tellNumbers(x)
  const reverse = new Set(reverseTells(x, all).map((r) => r.k))
  for (const t of x.tells) {
    if (!t.zeroEvidence) continue
    const k = numbers.get(t)!
    const text = redact(withoutEvidenceAsides(t.text), x)
    out.push({
      id: `q:sign-of:${x.id}:t${k}`,
      type: 'T2',
      topic: 'behavior',
      width: 4,
      register: 'tell',
      late: true,
      pre: () => askKeys({ who: x.id, text }),
      make: (rng) => wrap(signOfGhost(x, ctxFor(x, all, rng), { text, k: `t${k}` }), text, reverse.has(k) ? `g:${x.id}:rev:${k}` : `g:${x.id}:tells`, false),
    })
  }
  return out
}

/* ---------- T3 : les tests de X ---------- */

function testSeeds(x: Ghost, all: Ghost[]): Seed[] {
  const byId = new Map(all.map((o) => [o.id, o]))
  const out: Seed[] = []
  // T3a « Quel test confirme X sans preuve ? »
  zeroTests(x).forEach((t, p) => {
    const i = x.confirmationTests.findIndex((c) => c.text === t.text)
    const why = x.confirmationTests[i]?.why
    out.push({
      id: `q:test-of:${x.id}:${t.k}`,
      type: 'T3a',
      topic: 'zero',
      width: 4,
      pre: () => [`${x.id}#C${i}`],
      make: (rng) => {
        const q = whichTest(x, t, ctxFor(x, all, rng), p < TESTS_PER_GHOST ? `g:${x.id}:test:${t.k}` : `g:${x.id}:tells`)
        if (!q) return null
        const others = q.choices.filter((c) => !q.correct.includes(c.id))
        const owners = others.map((c) => byId.get(c.id))
        if (owners.some((o) => !o)) return null
        const explain = `C’est un test de confirmation ${de(x.name)}.${why ? ` ${why}` : ''} Les trois autres sont, dans l’ordre, des tests ${listOf(owners.map((o) => de(o!.name)))}.`
        const right = q.choices.find((c) => q.correct.includes(c.id))!.label
        return built(
          { ...q, explain },
          'T3a',
          [{ who: x.id, text: right, item: `${x.id}#C${i}`, aspect: 'ownProof' }],
          others.map((c) => ({ who: c.id, text: c.label })),
        )
      },
    })
  })
  // T3b « Ce test suffit-il, à lui seul, à confirmer X ? » : sa conclusion retirée, c'est elle qu'on demande
  const cards = new Map(zeroTests(x).map((t, p) => [t.text, p < TESTS_PER_GHOST ? `g:${x.id}:test:${t.k}` : undefined]))
  for (const t of ownTests(x, all)) {
    if (t.body.length > QUOTE_MAX) continue
    const cardId = cards.get(t.text)
    out.push({
      id: `q:suffit:${x.id}:${t.i}`,
      type: 'T3b',
      topic: 'zero',
      width: 2,
      cls: t.definitive ? 'yes' : 'no',
      make: () =>
        built(
          {
            id: `q:suffit:${x.id}:${t.i}`,
            topic: 'zero',
            ghostId: x.id,
            prompt: `Ce test suffit-il, à lui seul, à confirmer ${le(x.name)}${NNBSP}?`,
            quote: `${t.body}…`,
            multi: false,
            choices: [
              { id: SOLO_ANSWERS.enough.yes, label: 'Oui, ce test suffit' },
              { id: SOLO_ANSWERS.enough.no, label: 'Non, ce n’est qu’un indice' },
            ],
            correct: [t.definitive ? SOLO_ANSWERS.enough.yes : SOLO_ANSWERS.enough.no],
            explain: `${t.definitive ? 'Oui, ce test suffit.' : 'Non, ce n’est qu’un indice.'} ${verdictOf(t.text, x)}${t.why ? ` ${t.why}` : ''}`,
            ...(cardId ? { cardId } : {}),
          },
          'T3b',
          [{ who: x.id, text: t.body, item: `${x.id}#C${t.i}`, aspect: t.definitive ? 'proof' : 'hint' }],
        ),
    })
  }
  return out
}

/* ---------- T4 : ce qui exclut X ---------- */

function exclusionSeeds(x: Ghost, all: Ghost[]): Seed[] {
  const tests = ownTests(x, all)
  if (tests.length < 3) return []
  // les trois autres cas sont des tests de X lui-même : sa fiche dit qu'ils le désignent, pas qu'ils l'excluent
  const versions = (body: string) => {
    const short = conditionOf(body)
    return [body, withoutAsides(body), ...(short ? [short, withoutAsides(short)] : [])].filter((v, k, a) => a.indexOf(v) === k && (v.length >= 25 || v === body))
  }
  const pool: Option<OwnTest>[] = tests.flatMap((t) => versions(t.body).map((label) => ({ value: t, label })))
  const itself = plural(x) ? 'eux-mêmes' : isFeminine(x.name) ? 'elle-même' : 'lui-même'
  return ownEliminations(x, all).map((e) => ({
    id: `q:exclut:${x.id}:${e.i}`,
    type: 'T4' as const,
    topic: 'zero' as const,
    width: 4 as const,
    make: (rng: Rng) => {
      // quatre cas de même longueur, et le bon ne se remarque pas à sa forme (voir truthsAround)
      const around = truthsAround(rng, x, versions(e.body), pool)
      if (!around) return null
      const found = { right: around.right, wrong: around.truths }
      const q: Question = {
        id: `q:exclut:${x.id}:${e.i}`,
        topic: 'zero',
        ghostId: x.id,
        prompt: `Dans lequel de ces cas peux-tu exclure ${le(x.name)}${NNBSP}?`,
        multi: false,
        choices: shuffle(rng, [{ id: 'excludes', label: found.right }, ...found.wrong.map((o) => ({ id: `test:${o.value.i}`, label: o.label }))]),
        correct: ['excludes'],
        explain: `${e.text} Les trois autres cas viennent des tests ${de(x.name)} ${itself}${NNBSP}: ils ne ${themElided(x)}excluent pas.`,
      }
      return built(
        q,
        'T4',
        [{ who: x.id, text: e.body, item: `${x.id}#E${e.i}` }],
        found.wrong.map((o) => ({ who: x.id, text: o.value.body, item: `${x.id}#C${o.value.i}` })),
      )
    },
  }))
}

/* ---------- les signes de X et ceux, faux pour lui, des entités qu'on confond avec lui ---------- */

const STYLES: readonly SignStyle[] = ['key', 'tell']
const letter = (style: SignStyle) => (style === 'key' ? 'K' : 'T')

/** Le rang d'un signe dans sa fiche (signes clés), ou son numéro de carte (phrases « 0 preuve »). */
function signRank(s: Sign, style: SignStyle): number {
  if (style === 'key') return s.ghost.keyTells.indexOf(s.text)
  const numbers = tellNumbers(s.ghost)
  const t = s.ghost.tells.find((t) => t.zeroEvidence && redact(withoutEvidenceAsides(t.text), s.ghost) === s.text)
  return t ? numbers.get(t)! : -1
}

/**
 * Les signes de x qui se citent tels quels (ni preuve, ni nom d'entité, ni genre) : les mêmes filtres que ceux des
 * autres fiches. Un signe clé un peu long, ou qui dit « ce joueur » après l'avoir présenté, reste un signe de x.
 */
function ownSigns(x: Ghost, all: Ghost[], style: SignStyle): Sign[] {
  const listed = distractorSigns(all, style).filter((s) => s.ghost.id === x.id)
  if (style !== 'key') return listed
  const have = new Set(listed.map((s) => s.text))
  const alone = (t: string) => {
    const at = t.search(/(?<!\p{L})ce joueur(?!\p{L})/u)
    return !/^Chasse suivante(?!\p{L})/u.test(t) && (at < 0 || /joueur/u.test(t.slice(0, at)))
  }
  return x.keyTells
    .filter((t) => have.has(t) || (plainSign(t) && !GENDER_TALK.test(t) && t.length <= 200 && !namesAny(t, all) && alone(t)))
    .map((t) => listed.find((s) => s.text === t) ?? { text: t, ghost: x, themes: themesOf(t) })
}

/**
 * Les signes des entités qu'on confond avec x qui sont faux pour lui : ils ne touchent aucun thème de ses signes,
 * ne conviennent en rien à sa fiche (signVersions), et ni un pronom ni un accord ne les écarte d'emblée.
 */
function falseSigns(x: Ghost, all: Ghost[], style: SignStyle): Option<Sign>[] {
  const near = new Set(rivalsOf(x, all).map((o) => o.id))
  if (!near.size) return []
  // « 1,5 ou 1,9 m/s » (les Jumeaux) face à l'Aswang, à 1,53 m/s : trop près pour être dit faux
  return signVersions(x, all, style).filter((o) => near.has(o.value.ghost.id) && !pronounClash(o.label, x) && agrees(o.label, o.value.ghost, x) && !nearSpeed(o.label, x))
}

/* ---------- T5 : l'intrus ---------- */

/**
 * Trois signes différents de x de même longueur que l'intrus (l'une de ses versions), tels que l'intrus ne se
 * remarque pas : ni le seul à porter une marque (un chiffre, une parenthèse…), ni le seul à ne pas en porter une,
 * ni le seul à ne pas contenir le mot que souffle le nom de x. Le nombre de signes plus longs que lui se tire :
 * il n'est ni toujours le plus long, ni toujours le plus court. Les trois signes de x
 * viennent de la même fiche : entre eux, une marque ne désigne rien.
 */
function truthsAround<T>(rng: Rng, x: Ghost, intruders: readonly string[], pool: readonly Option<T>[]): { right: string; truths: Option<T>[] } | null {
  const mixed = shuffle(rng, pool)
  for (const wanted of shuffle(rng, [0, 1, 2, 3])) {
    for (const right of intruders) {
      const near = mixed.filter((o) => closeLengths(Math.min(o.label.length, right.length), Math.max(o.label.length, right.length)))
      for (let a = 0; a < near.length; a++) {
        for (let b = a + 1; b < near.length; b++) {
          if (near[b].value === near[a].value) continue
          for (let c = b + 1; c < near.length; c++) {
            if (near[c].value === near[a].value || near[c].value === near[b].value) continue
            const truths = [near[a], near[b], near[c]]
            const labels = truths.map((o) => o.label)
            const lens = [right, ...labels].map((l) => l.length)
            if (labels.filter((l) => l.length > right.length).length !== wanted || !closeLengths(Math.min(...lens), Math.max(...lens))) continue
            if (standsOut(right, labels) || (labels.every((l) => hints(x, l)) && !hints(x, right))) continue
            return { right, truths }
          }
        }
      }
    }
  }
  return null
}

function intruderSeeds(x: Ghost, all: Ghost[]): Seed[] {
  const out: Seed[] = []
  for (const style of STYLES) {
    const own = ownSigns(x, all, style)
    if (own.length < 3) continue
    const pool: Option<Sign>[] = own.flatMap((s) => [s.text, ...shortened(s.text).filter((v) => keepsSense(s.text, v))].map((label) => ({ value: s, label })))
    const bySign = new Map<Sign, string[]>()
    for (const o of falseSigns(x, all, style)) bySign.set(o.value, [...(bySign.get(o.value) ?? []), o.label])
    for (const [sign, labels] of bySign) {
      const y = sign.ghost
      const id = `q:intrus:${x.id}:${y.id}:${letter(style)}${signRank(sign, style)}`
      out.push({
        id,
        type: 'T5',
        topic: 'behavior',
        width: 4,
        register: style,
        pre: () => askKeys({ who: y.id, text: sign.text, key: style === 'key' }),
        make: (rng) => {
          const found = truthsAround(rng, x, labels, pool)
          if (!found) return null
          const q: Question = {
            id,
            topic: 'behavior',
            ghostId: x.id,
            prompt: `Une seule de ces affirmations est fausse pour ${le(x.name)}. Laquelle${NNBSP}?`,
            multi: false,
            choices: shuffle(rng, [{ id: y.id, label: found.right }, ...found.truths.map((o, k) => ({ id: `own:${k}`, label: o.label }))]),
            correct: [y.id],
            explain: `«${NNBSP}${sign.text}${NNBSP}» est un signe ${de(y.name)}, pas ${de(x.name)}. Les trois autres sont bien ${plural(x) ? 'leurs' : 'ses'} signes.`,
            cardId: `g:${x.id}:tells`,
          }
          const key = style === 'key'
          const truths = found.truths.map((o) => ({ who: x.id, text: o.value.text, key }))
          // les trois signes de X sont jugés eux aussi : un seul au plus est connu par une autre question de la copie
          return { ...built(q, 'T5', [{ who: y.id, text: sign.text, key }], truths), truths: truths.map(askKeys) }
        },
      })
    }
  }
  return out
}

/* ---------- ce que les fiches disent pour départager X d'une entité proche ---------- */

/** Une phrase de départage : l'entité qu'elle décrit (z), la fiche qui la dit (y), et la phrase où z laisse sa place au sujet. */
interface NearClaim {
  y: Ghost
  z: Ghost
  /** la phrase qui nomme l'entité de la question à la place de z */
  label: string
  /** la phrase sans nom : « Cette entité fonce à 3,0 m/s de loin… » */
  quote: string | null
  explain: string
}

/** Un nom féminin, pour vérifier qu'une phrase s'accorde avec « cette entité ». */
const asEntity = (g: Ghost): Ghost => ({ ...g, name: 'La chose' })
/** Un pronom qui dirait le genre de l'entité (« il », « lui ») dans une phrase dont le sujet est « cette entité ». */
const MASCULINE = /(?<!\p{L})(?:ils?|lui|eux)(?!\p{L})(?!\s+(?:faut|suffit|y\s+a)(?!\p{L}))/iu

function anonymous(text: string, about: Ghost): string | null {
  const bare = asOther(text, about)
  if (bare.split(SUBJ).length !== 2 || MASCULINE.test(bare.replaceAll(SUBJ, '')) || !agrees(bare, about, asEntity(about))) return null
  return bare
    .replace(new RegExp(`(?<![\\p{L}])([Dd]e|[Àà]) ${SUBJ}`, 'gu'), '$1 cette entité')
    .replace(new RegExp(`(^|[.!?]\\s+)${SUBJ}`, 'gu'), (_m, lead: string) => `${lead}Cette entité`)
    .replaceAll(SUBJ, 'cette entité')
}

/** Ce que la fiche de `host` dit de l'entité z qu'on confond avec lui, qui est faux pour `host` (voir wrongClaimsFor). */
function claimsAbout(host: Ghost, z: Ghost, all: Ghost[]): NearClaim[] {
  const pair = host.confusions.find((c) => c.with === z.id)
  if (!pair) return []
  const explain = noLeadingMais(confusionWithoutEvidence(pair.why))
  const seen = new Set<string>()
  return wrongClaimsFor(host, all)
    .filter((c) => c.y.id === host.id && c.z.id === z.id && !nearSpeed(c.text, host))
    .filter((c) => (seen.has(c.label) ? false : (seen.add(c.label), true)))
    .map((c) => ({ y: c.y, z: c.z, label: c.label, quote: anonymous(c.text, c.z), explain }))
}

/* ---------- T6 : vrai ou faux ---------- */

const TRUE_FALSE = [
  { id: SOLO_ANSWERS.trueFalse.true, label: 'Vrai' },
  { id: SOLO_ANSWERS.trueFalse.false, label: 'Faux' },
]

function trueFalseSeeds(x: Ghost, all: Ghost[]): Seed[] {
  if (x.id === MIMIC) return []
  const out: Seed[] = []
  const about = `Vrai ou faux pour ${le(x.name)}${NNBSP}?`
  const seed = (id: string, register: string, truth: boolean, prompt: string, quote: string, explain: string, asked: Stmt, topic: QuizTopic, cardId?: string, shown: Stmt[] = []) =>
    out.push({
      id,
      type: 'T6',
      topic,
      width: 2,
      cls: truth ? 'true' : 'false',
      register,
      make: () =>
        built(
          { id, topic, ghostId: x.id, prompt, quote, multi: false, choices: TRUE_FALSE, correct: [truth ? SOLO_ANSWERS.trueFalse.true : SOLO_ANSWERS.trueFalse.false], explain, ...(cardId ? { cardId } : {}) },
          'T6',
          [asked],
          shown,
        ),
    })
  for (const style of STYLES) {
    const own = ownSigns(x, all, style)
    const wrong = falseSigns(x, all, style).filter((o) => o.label === o.value.text)
    // les deux réponses viennent de la même sorte de phrases, sinon la forme dirait la réponse
    if (!own.length || !wrong.length) continue
    const source = style === 'key' ? `C’est l’un des signes clés ${de(x.name)}.` : `C’est écrit sur la fiche ${de(x.name)}.`
    for (const s of own) {
      seed(`q:vf:${x.id}:${x.id}:${letter(style)}${signRank(s, style)}`, style, true, about, s.text, `Vrai. ${source}`, { who: x.id, text: s.text, key: style === 'key' }, 'behavior', `g:${x.id}:tells`)
    }
    for (const o of wrong) {
      const y = o.value.ghost
      seed(`q:vf:${x.id}:${y.id}:${letter(style)}${signRank(o.value, style)}`, style, false, about, o.label, `Faux. C’est un signe ${de(y.name)}, pas ${de(x.name)}.`, { who: y.id, text: o.label, key: style === 'key' }, 'behavior', `g:${x.id}:tells`)
    }
  }
  // les phrases de départage : ce qu'une fiche proche dit de X (vrai), ce que la fiche de X dit d'une entité proche (faux pour X)
  const truths = plural(x) ? [] : duelsFor(x, all)
  const lies = rivalsOf(x, all).flatMap((z) => claimsAbout(x, z, all).slice(0, 1))
  if (truths.length && lies.length) {
    for (const d of truths) {
      seed(`q:vf:${x.id}:${x.id}:L${d.x.id}`, 'claim', true, `Vrai ou faux${NNBSP}?`, d.rights[0], `Vrai. ${d.explain}`, { who: x.id, text: d.rights[0] }, 'zero', undefined, [
        { who: x.id, text: d.explain },
        { who: d.x.id, text: d.explain },
      ])
    }
    for (const c of lies) {
      seed(`q:vf:${x.id}:${c.z.id}:L${x.id}`, 'claim', false, `Vrai ou faux${NNBSP}?`, c.label, `Faux. ${itIs(c.z)}. ${c.explain}`, { who: c.z.id, text: c.label, item: `${x.id}>${c.z.id}` }, 'zero', undefined, [
        { who: x.id, text: c.explain },
        { who: c.z.id, text: c.explain },
      ])
    }
  }
  return out
}

/* ---------- T7 : X face à une entité qu'on confond avec lui ---------- */

function duelSeeds(x: Ghost, all: Ghost[]): Seed[] {
  if (x.id === MIMIC) return []
  const out: Seed[] = []
  const near = rivalsOf(x, all)
  const byId = new Map(all.map((o) => [o.id, o]))
  /** le départage du quiz, entre X et Y seulement ; il s'inscrit toujours sur X */
  const duel = (g: Ghost, other: Ghost, forward: boolean): Seed => ({
    id: `q:dist:${other.id}:${g.id}`,
    type: 'T7a',
    topic: 'zero',
    width: 4,
    cls: forward ? 'x' : 'y',
    pre: () => [`${g.id}|départage`],
    make: (rng) => {
      const made = duelQuestion(g, ctxFor(g, all, rng), other)
      if (!made) return null
      const { cardId: _card, ...rest } = made
      const owners = made.choices.filter((c) => !made.correct.includes(c.id)).map((c) => byId.get(c.id))
      // le corrigé du quiz (ce que la fiche dit pour les départager), et de qui parlent les trois autres réponses
      const right = made.choices.find((c) => made.correct.includes(c.id))!.label
      const tail = (t: string) => t.replace(/[\s.]+$/u, '').slice(-40)
      // la fiche ne dit rien de plus que la bonne réponse : le corrigé dit d'où elle vient, sans la redire
      const source = tail(made.explain) === tail(right) ? `C’est ce que la fiche ${de(other.name)} dit ${de(g.name)}.` : made.explain
      const explain = owners.every((o) => o) ? `${source} Les trois autres réponses décrivent, dans l’ordre, ${listOf(owners.map((o) => le(o!.name)))}.` : source
      const q: Question = { ...rest, explain, ghostId: x.id, ...(forward ? { cardId: `g:${x.id}:tells` } : {}) }
      return built(
        q,
        'T7a',
        [{ who: g.id, text: right }],
        [
          { who: g.id, text: q.explain },
          { who: other.id, text: q.explain },
          ...q.choices.filter((c) => !q.correct.includes(c.id)).map((c) => ({ who: c.id, text: c.label })),
        ],
        // deux départages d'une même entité citent le plus souvent le même trait
        [`${g.id}|départage`],
      )
    },
  })
  if (!plural(x)) for (const d of duelsFor(x, all)) if (near.some((o) => o.id === d.x.id)) out.push(duel(x, d.x, true))
  for (const y of near) if (!plural(y) && duelsFor(y, all).some((d) => d.x.id === x.id)) out.push(duel(y, x, false))

  // T7b « De qui parle-t-on ? » : une phrase sans nom, deux réponses, X et Y
  const who = (id: string, y: Ghost, owner: Ghost, register: string, quote: string, explain: string, asked: Stmt, shown: Stmt[] = []) => {
    const other = owner.id === x.id ? y : x
    // le mot que souffle le nom de la bonne réponse (« objets » pour le Poltergeist) la désignerait
    if (hints(owner, quote) || namesAny(quote, all) || needsEvidence(quote)) return
    out.push({
      id,
      type: 'T7b',
      topic: 'zero',
      width: 2,
      cls: owner.id === x.id ? 'x' : 'y',
      register,
      make: (rng) => {
        const [a, b] = shuffle(rng, [x, y])
        return built(
          {
            id,
            topic: 'zero',
            ghostId: x.id,
            prompt: `De qui parle-t-on${NNBSP}: ${de(a.name)} ou ${de(b.name)}${NNBSP}?`,
            quote,
            multi: false,
            choices: [a, b].map((g) => ({ id: g.id, label: g.name })),
            correct: [owner.id],
            explain,
          },
          'T7b',
          [asked],
          [...shown, { who: other.id, text: explain }],
        )
      },
    })
  }
  for (const y of near) {
    // ce que la fiche de X dit de Y (faux pour X), ce que la fiche de Y dit de X (faux pour Y)
    for (const [host, z] of [
      [x, y],
      [y, x],
    ] as const) {
      const c = claimsAbout(host, z, all).find((k) => k.quote)
      if (c?.quote) who(`q:duel:${x.id}:${y.id}:${z.id}:L`, y, z, 'claim', c.quote, `${itIs(z)}. ${c.explain}`, { who: z.id, text: c.label, item: `${host.id}>${z.id}` }, [{ who: z.id, text: c.explain }])
    }
    // un signe clé de l'une, faux pour l'autre ; entre deux entités de même genre, pour qu'aucun accord ne tranche
    if (isFeminine(x.name) !== isFeminine(y.name)) continue
    const mine = new Set(ownSigns(x, all, 'key').map((s) => s.text))
    for (const o of signVersions(y, all, 'key')) {
      if (o.value.ghost.id !== x.id || o.label !== o.value.text || !mine.has(o.label) || pronounClash(o.label, y)) continue
      who(`q:duel:${x.id}:${y.id}:${x.id}:K${signRank(o.value, 'key')}`, y, x, 'key', o.label, `C’est un signe ${de(x.name)}, pas ${de(y.name)}.`, { who: x.id, text: o.label, key: true })
    }
    for (const o of falseSigns(x, all, 'key')) {
      if (o.value.ghost.id !== y.id || o.label !== o.value.text) continue
      who(`q:duel:${x.id}:${y.id}:${y.id}:K${signRank(o.value, 'key')}`, y, y, 'key', o.label, `C’est un signe ${de(y.name)}, pas ${de(x.name)}.`, { who: y.id, text: o.label, key: true })
    }
  }
  return out
}

/* ---------- T8 : une observation, trois réponses ---------- */

const OBSERVED = ['A', 'B', 'C'] as const
type Observed = (typeof OBSERVED)[number]
/** D'où vient ce qu'on observe : un rapport de terrain de la fiche, ou l'un de ses tests dit comme ce qu'on voit. */
const SCENES = ['obs', 'case'] as const

function observationSeeds(x: Ghost, all: Ghost[]): Seed[] {
  const out: Seed[] = []
  const choices = [
    { id: SOLO_ANSWERS.observation.confirms, label: `Oui, et ça suffit à ${them(x)} confirmer` },
    { id: SOLO_ANSWERS.observation.fits, label: `Oui, mais ça ne suffit pas à ${them(x)} confirmer` },
    { id: SOLO_ANSWERS.observation.excludes, label: `Non, ça ${themElided(x)}exclut` },
  ]
  const seed = (id: string, register: (typeof SCENES)[number], cls: Observed, quote: string, explain: string, asked: Stmt, cardId?: string) => {
    out.push({
      id,
      type: 'T8',
      topic: 'behavior',
      width: 3,
      cls,
      register,
      make: () =>
        built(
          {
            id,
            topic: 'behavior',
            ghostId: x.id,
            prompt: `Tu soupçonnes ${le(x.name)} et tu observes ceci. Est-ce compatible${NNBSP}?`,
            quote,
            multi: false,
            choices,
            correct: [choices[OBSERVED.indexOf(cls)].id],
            explain,
            ...(cardId ? { cardId } : {}),
          },
          'T8',
          [asked],
          [{ who: asked.who, text: explain }],
        ),
    })
  }
  const yes = `Oui, et ça suffit${NNBSP}:`
  const partly = `Oui, mais ça ne suffit pas${NNBSP}:`
  const no = `Non, ça ${themElided(x)}exclut${NNBSP}:`
  // les rapports de terrain de la fiche
  x.observations.forEach((o, i) => {
    if (o.requires) return
    const quote = quoteFor(o.text, x)
    if (!quote) return
    const why = o.why ? ` ${o.why}` : ''
    const asked: Stmt = { who: x.id, text: o.text, item: `${x.id}#O${i}`, aspect: o.strength === 'definitive' ? 'proof' : 'hint' }
    if (o.strength === 'definitive') seed(`q:constat:${x.id}:${x.id}:O${i}`, 'obs', 'A', quote, `${yes} sur la fiche ${de(x.name)}, cette observation est décisive.${why}`, asked, `g:${x.id}:tells`)
    else seed(`q:constat:${x.id}:${x.id}:O${i}`, 'obs', 'B', quote, `${partly} sur la fiche ${de(x.name)}, c’est un ${o.strength === 'strong' ? 'indice fort' : 'simple indice'}, pas une confirmation.${why}`, asked, `g:${x.id}:tells`)
  })
  // une observation décisive d'une entité proche prouve cette entité : elle exclut X (jamais pour le Mimic, qui copie)
  for (const y of rivalsOf(x, all)) {
    y.observations.forEach((o, i) => {
      if (o.requires || o.strength !== 'definitive') return
      const quote = quoteFor(o.text, y)
      if (!quote || namesAny(quote, all)) return
      if (fitsToo(quote, all, true)(x) || numbersFit(quote, x) || restatedBy(quote, x, all) || huntsAlready(quote, x) || nearSpeed(quote, x)) return
      seed(`q:constat:${x.id}:${y.id}:O${i}`, 'obs', 'C', quote, `${no} cette observation est décisive pour ${le(y.name)}.${o.why ? ` ${o.why}` : ''}`, { who: y.id, text: o.text, item: `${y.id}#O${i}` })
    })
  }
  // les tests de la fiche, dits comme ce qu'on observe : un test qui suffit, un test qui ne donne qu'un indice, un test d'élimination
  // le corrigé reprend ce que la fiche en conclut (« … : dans ce cas, ça pourrait être un Aswang. »)
  const said = (text: string) => {
    const verdict = verdictOf(text, x)
    return verdict.startsWith('Dans ce cas') ? `d${verdict.slice(1)}` : verdict
  }
  const cards = new Map(zeroTests(x).map((t, p) => [t.text, p < TESTS_PER_GHOST ? `g:${x.id}:test:${t.k}` : undefined]))
  for (const t of ownTests(x, all)) {
    const quote = situationOf(t.body)
    if (!quote || quote.length > QUOTE_MAX) continue
    const asked: Stmt = { who: x.id, text: t.body, item: `${x.id}#C${t.i}`, aspect: t.definitive ? 'proof' : 'hint' }
    if (t.definitive) seed(`q:constat:${x.id}:${x.id}:C${t.i}`, 'case', 'A', quote, `${yes} ${said(t.text)}${t.why ? ` ${t.why}` : ''}`, asked, cards.get(t.text))
    else seed(`q:constat:${x.id}:${x.id}:C${t.i}`, 'case', 'B', quote, `${partly} ${said(t.text)}`, asked)
  }
  for (const e of ownEliminations(x, all)) {
    const quote = situationOf(e.body)
    if (quote && quote.length <= QUOTE_MAX) seed(`q:constat:${x.id}:${x.id}:E${e.i}`, 'case', 'C', quote, `${no} ${said(e.text)}`, { who: x.id, text: e.body, item: `${x.id}#E${e.i}` })
  }
  return out
}

/**
 * Les réponses possibles de l'observation pour chaque entité et chaque sorte de scène, et leurs chances : choisies
 * ensemble (voir balancedRanks) pour qu'au fil des copies les trois réponses sortent autant, alors que bien des
 * fiches n'ont pas d'observation décisive, ou pas de test d'élimination.
 */
const observationPlan = memoList((all) => {
  const out = new Map<string, { cls: Observed; weight: number }[]>()
  for (const scene of SCENES) {
    const cases = all.flatMap((g) => {
      const classes = new Set(seedsFor(g, all).filter((s) => s.type === 'T8' && s.register === scene).map((s) => s.cls))
      const counts = OBSERVED.flatMap((c, k) => (classes.has(c) ? [k] : []))
      return counts.length ? [{ id: g.id, counts, share: 1 }] : []
    })
    const weights = balancedRanks(cases, 2)
    for (const c of cases) out.set(`${c.id}|${scene}`, c.counts.map((k, i) => ({ cls: OBSERVED[k], weight: weights.get(c.id)![i] })))
  }
  return out
})

/* ---------- questions rédigées de la fiche ---------- */

function authoredSeeds(x: Ghost, all: Ghost[]): Seed[] {
  const out: Seed[] = []
  x.quiz.forEach((a, i) => {
    if (a.choices.length < 2 || a.choices.length > 4 || a.answer < 0 || a.answer >= a.choices.length) return
    // rien sur les preuves ; et pas de choix entre des noms d'entités (« Qui suspectes-tu ? » : ce serait toujours X)
    if (mentionsEvidence(a.q) || a.choices.some((c) => mentionsEvidence(c))) return
    if (a.choices.every((c) => namesAny(c, all)) || a.choices.some((c) => redact(c, x) !== c)) return
    const id = `q:auth:${x.id}:${i}`
    out.push({
      id,
      type: 'auth',
      topic: 'expert',
      width: a.choices.length as 2 | 3 | 4,
      make: (rng) => {
        const q: Question = {
          id,
          topic: 'expert',
          ghostId: x.id,
          prompt: a.q,
          multi: false,
          choices: shuffle(rng, a.choices.map((label, k) => ({ id: String(k), label }))),
          correct: [String(a.answer)],
          explain: a.explain,
        }
        // « Tu hésites entre un Esprit et un Spectre. Quel test les départage ? » : elle demande aussi un fait du Spectre
        const asked = `${a.q} \n ${a.choices[a.answer]}`
        const named = all.filter((o) => o.id !== x.id && namesGhost(a.q, o))
        // son corrigé peut dire ce que vaut le fait (« c'est un test définitif ») : par prudence, il le montre
        return built(q, 'auth', [{ who: x.id, text: asked }, ...named.map((o) => ({ who: o.id, text: asked }))], [{ who: x.id, text: a.explain, aspect: 'any' }])
      },
    })
  })
  return out
}

/* ---------- toutes les questions possibles sur X ---------- */

const seedsFor = memo((x, all): Seed[] => [
  ...numberSeeds(x, all),
  ...signSeeds(x, all),
  ...testSeeds(x, all),
  ...exclusionSeeds(x, all),
  ...intruderSeeds(x, all),
  ...trueFalseSeeds(x, all),
  ...duelSeeds(x, all),
  ...observationSeeds(x, all),
  ...authoredSeeds(x, all),
])

/** Les identifiants de toutes les questions qu'une copie sur x peut poser (certaines ne se composent pas à chaque tirage). */
export function soloSupply(x: Ghost, all: Ghost[]): { id: string; type: SoloType; topic: QuizTopic }[] {
  return seedsFor(x, all).map(({ id, type, topic }) => ({ id, type, topic }))
}

/**
 * La question `id` sur x, composée seule pour ce tirage (null si elle n'existe pas, ou ne se compose pas cette
 * fois : pas de mauvaises réponses de même forme). Pour relire une question, ou la vérifier une à une.
 */
export function soloQuestion(x: Ghost, all: Ghost[], id: string, rng: Rng): Question | null {
  const q = seedsFor(x, all).find((s) => s.id === id)?.make(rng)?.q
  return q ? { ...q, prompt: fr(q.prompt), explain: fr(noLeadingMais(q.explain)) } : null
}

/* ---------- la copie ---------- */

/**
 * Les sortes de questions d'une copie de dix. D'abord la ligne de vue (les entités qui n'accélèrent pas en
 * parlent partout : posée après, « Non » sortirait moins que « Oui »), les nombres et un signe de l'entité, le
 * cœur de la copie ; puis les autres sortes dans le désordre ; le reste se complète (voir FILL). L'ordre des
 * questions dans la copie, lui, se décide à la fin.
 */
const FIRST = ['T1los', 'T1san', 'T1spd', 'T2'] as const
const BLUEPRINT = ['T2', 'T3', 'T4', 'T5', 'T7a', 'T7b', 'T8'] as const
/** De quoi compléter une copie : un vrai ou faux, une question rédigée, puis une de plus des autres sortes. */
const FILL = ['T6', 'auth', 'T8', 'T3', 'T2', 'T7a', 'T5', 'T6', 'auth', 'T4', 'T1san', 'T1spd', 'T7b'] as const
/**
 * L'intrus montre trois signes de X pour n'en demander aucun : sur une fiche qui en a moins que cela, il ne fait
 * pas partie du plan (il prendrait la place de deux questions sur ces signes) et ne sert qu'à compléter la copie.
 */
const INTRUDER_SIGNS = 5
type Slot = (typeof FIRST)[number] | (typeof BLUEPRINT)[number] | (typeof FILL)[number]

/** Les sortes de questions dont la réponse se tire avant la question (voir addEither et le plan des observations). */
const DRAWN: ReadonlySet<SoloType> = new Set<SoloType>(['T6', 'T7b', 'T8'])

/** Une fois sur combien la question sur un test est « ce test suffit-il ? » plutôt que « quel test confirme X ? ». */
const ENOUGH_SHARE = 0.4
/** Une entité dont tous les tests suffisent (ou aucun) : la réponse serait toujours la même, la question est plus rare. */
const ENOUGH_ONE_SIDED = 0.5

/**
 * Compose la copie sur une seule entité : `count` questions (dix), toutes sur elle. Une question déjà posée dans
 * une copie précédente (`seen`) passe après les autres. Une même valeur, une même phrase ne se demandent qu'une
 * fois, et aucune réponse n'a été montrée plus tôt dans la copie : une question qui en montrerait une autre passe
 * après elle, ou ne se pose pas. Un même objet, un même geste (la cachette de l'Aswang, les objets du Poltergeist)
 * se demande une fois pour dire à qui il est, puis pour dire ce qu'il vaut (une preuve, un simple indice), jamais
 * deux fois sous le même angle (voir Stmt). Quand la fiche n'a pas de quoi remplir la copie, un départage de plus
 * avec une entité proche la complète ; une fiche vraiment courte donne une copie de moins de `count` questions,
 * plutôt qu'une question dont la réponse vient d'être lue (voir SoloOptions.relax). Le tirage ne dépend que de `rng`.
 */
export function buildSoloQuiz(opts: SoloOptions): Question[] {
  const { ghost: x, allGhosts: all, rng } = opts
  const count = Math.max(0, Math.floor(opts.count ?? SOLO_COUNT))
  if (!count) return []
  const seen = opts.seen instanceof Set ? (opts.seen as ReadonlySet<string>) : new Set(opts.seen ?? [])
  const topics = opts.topics ? new Set<QuizTopic>(opts.topics) : null
  const seeds = seedsFor(x, all).filter((s) => !topics || topics.has(s.topic))
  if (!seeds.length) return []
  const stray = opts.onlyListed ? strayCheck(all.filter((o) => o.id !== x.id)) : null
  const los = losChance(all)
  const gates = { stdSan: rng() < SOLO_STANDARD.san, stdSpd: rng() < SOLO_STANDARD.spd, los: rng() < (x.speed.los ? los.yes : los.no) }
  const scale = count / SOLO_COUNT
  const cap = { two: Math.max(1, Math.floor(3 * scale)), three: Math.max(1, Math.floor(2 * scale)), duels: Math.max(1, Math.ceil(3 * scale)), reverse: Math.max(1, Math.ceil(2 * scale)) }

  const picked: Built[] = []
  const ids = new Set<string>()
  const screens = new Set<string>()
  /** before[i] : les questions qui doivent passer avant la question i */
  const before: Set<number>[] = []
  /** la copie ne s'est pas remplie : 1, un départage de plus est permis ; 2, un même objet peut revenir une fois (voir SoloOptions.relax) */
  let ease: 0 | 1 | 2 = 0
  /** les objets et gestes déjà repris une fois en dernier recours */
  const repeated = new Set<string>()

  const widthOf = (n: number) => picked.filter((b) => b.q.choices.length === n).length
  const countOf = (pred: (b: Built) => boolean) => picked.filter(pred).length
  const roomFor = (s: Seed) => {
    if (s.width === 2 && widthOf(2) >= cap.two) return false
    if (s.width === 3 && widthOf(3) >= cap.three) return false
    // pour remplir la copie d'une fiche courte (ease 1), un départage de plus : il porte sur ce qui distingue une entité proche de X
    if ((s.type === 'T7a' || s.type === 'T7b') && countOf((b) => b.type === 'T7a' || b.type === 'T7b') >= cap.duels + Math.min(1, ease)) return false
    if (s.type === 'T7a' && s.cls === 'y' && countOf((b) => b.type === 'T7a' && !b.q.cardId) >= cap.reverse + Math.min(1, ease)) return false
    if (s.type === 'T3b' && countOf((b) => b.type === 'T3b') >= Math.max(1, Math.round(scale))) return false
    return true
  }
  /** Ce que a demande et que b montre une fois corrigée : `hard`, une valeur ou une phrase de fiche ; `soft`, des objets ou des gestes. */
  const leaks = (a: Built, b: Built): { hard: boolean; soft: string[] } => {
    const soft: string[] = []
    for (const k of a.asks) {
      if (!b.shows.has(k)) continue
      if (!isSoft(k)) return { hard: true, soft }
      soft.push(themeOf(k))
    }
    return { hard: false, soft }
  }
  /**
   * Les questions que `b` doit précéder, celles qui doivent le précéder ; null s'il ne peut pas entrer dans la copie :
   * deux questions qui se montreraient l'une l'autre ne vont pas ensemble. En dernier recours (ease 2), un objet ou
   * un geste peut revenir une fois sous un angle qui recoupe le premier ; jamais une valeur ni une phrase.
   */
  const place = (b: Built): { first: number[]; after: number[]; again: string[] } | null => {
    const first: number[] = []
    const after: number[] = []
    const again = new Set<string>()
    for (let i = 0; i < picked.length; i++) {
      const precede = leaks(b, picked[i])
      const follow = leaks(picked[i], b)
      const forward = precede.hard || precede.soft.length > 0
      const backward = follow.hard || follow.soft.length > 0
      if (forward && backward) {
        // dernier recours, et seulement pour une question dont la réponse se tire (vrai ou faux, X ou Y, les trois
        // réponses d'une observation) : une fois sur deux ou plus, elle porte alors sur un fait d'une entité proche
        if (ease < 2 || !DRAWN.has(b.type) || (precede.hard && follow.hard)) return null
        for (const k of [...precede.soft, ...follow.soft]) again.add(k)
        if (precede.hard) first.push(i)
        else if (follow.hard) after.push(i)
      } else if (forward) first.push(i)
      else if (backward) after.push(i)
    }
    for (const k of again) if (repeated.has(k)) return null
    // un intrus dont deux des trois affirmations vraies sont déjà connues par d'autres questions n'en serait plus un
    const chosen = [...picked, b]
    for (const p of chosen) {
      if (p.truths && p.truths.filter((t) => chosen.some((o) => o !== p && t.some((k) => !isSoft(k) && o.shows.has(k)))).length > 1) return null
    }
    // b avant `first`, après `after` : impossible si une question de `first` doit déjà passer avant une de `after`
    if (first.length && after.length) {
      const reach = new Set<number>()
      const walk = (i: number) => {
        if (reach.has(i)) return
        reach.add(i)
        for (const j of before[i]) walk(j)
      }
      for (const i of after) walk(i)
      if (first.some((i) => reach.has(i))) return null
    }
    return { first, after, again: [...again] }
  }
  type Found = { b: Built; at: { first: number[]; after: number[]; again: string[] } }
  /**
   * Les réponses en phrases d'une question (signes, tests, départages), le nom de l'entité retiré : lue une fois,
   * corrigée, une réponse qui reviendrait s'écarterait d'emblée (« … chasse à 1,53 m/s de base » dans deux
   * départages de suite ; la bonne réponse d'un départage parmi les mauvaises du suivant).
   */
  const wrongOf = (b: Built): string[] => {
    if (!b.sentences) {
      const sentences = b.type === 'T2' || b.type === 'T3a' || b.type === 'T4' || b.type === 'T7a'
      b.sentences = sentences ? b.q.choices.map((c) => nameless(c.label, all)) : []
    }
    return b.sentences
  }
  const read = new Set<string>()
  /** tout ce que la copie demande déjà */
  const askedAll = new Set<string>()
  const doomed = (s: Seed) => !!s.pre && s.pre().some((k) => askedAll.has(k))
  /**
   * Ce que l'énoncé et le corrigé d'une question rédigée montrent d'une autre entité qu'ils nomment (« le Spectre ne
   * touche jamais au sel ; l'Esprit le perturbe normalement », dans le corrigé d'une question sur l'Esprit), phrase
   * par phrase : une question qui le demanderait passe avant, ou ne se pose pas. Les questions composées, elles,
   * disent déjà de qui parle chacune de leurs phrases.
   */
  const noted = new WeakSet<Built>()
  const mentions = (b: Built) => {
    if (b.type !== 'auth' || noted.has(b)) return
    noted.add(b)
    for (const sentence of `${b.q.prompt} ${b.q.explain}`.split(SENTENCES)) {
      for (const o of all) if (o.id !== x.id && namesGhost(sentence, o)) for (const k of showKeys({ who: o.id, text: sentence })) b.shows.add(k)
    }
  }
  const commit = ({ b, at }: Found) => {
    const n = picked.length
    picked.push(b)
    ids.add(b.q.id)
    screens.add(screenOf(b.q))
    before.push(new Set(at.after))
    for (const i of at.first) before[i].add(n)
    for (const k of at.again) repeated.add(k)
    for (const w of wrongOf(b)) read.add(w)
    for (const k of b.asks) askedAll.add(k)
  }
  /** « Encore 10 » : les questions des copies précédentes ne reviennent qu'une fois les autres épuisées, et pour la moitié de la copie au plus */
  let again = false
  const repeats = () => picked.filter((b) => seen.has(b.q.id)).length
  /** Les questions possibles d'une sorte, dans l'ordre où les essayer. */
  const ordered = (list: readonly Seed[]) => {
    const room = again && repeats() < Math.floor(count / 2)
    const usable = shuffle(rng, list.filter((s) => !ids.has(s.id) && (!s.gate || gates[s.gate]) && roomFor(s) && (room || !seen.has(s.id) || s.gate === 'los') && !doomed(s)))
    const rank = (s: Seed) => (seen.has(s.id) ? 2 : 0) + (s.late ? 1 : 0)
    return usable
      .map((s, i) => ({ s, i }))
      .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
      .map(({ s }) => s)
  }
  /** La première question de la liste qui se compose et entre dans la copie (sans l'y mettre). */
  const find = (list: readonly Seed[], tries = 10): Found | null => {
    let left = tries
    for (const s of ordered(list)) {
      if (left-- <= 0) break
      let b = s.make(rng)
      // une question à quatre phrases qui ne se compose pas à ce tirage, ou qui reprend une mauvaise réponse déjà lue, se retente une fois
      if (s.width === 4 && (!b || wrongOf(b).some((w) => read.has(w)))) b = s.make(rng)
      if (!b || screens.has(screenOf(b.q)) || stray?.(b.q) || wrongOf(b).some((w) => read.has(w))) continue
      mentions(b)
      const at = place(b)
      if (at) return { b, at }
    }
    return null
  }
  const add = (list: readonly Seed[], tries?: number): boolean => {
    const found = find(list, tries)
    if (found) commit(found)
    return !!found
  }
  const of = (type: SoloType, pred: (s: Seed) => boolean = () => true) => seeds.filter((s) => s.type === type && pred(s))
  /**
   * Une question dont la réponse se tire entre `classes` (vrai ou faux, X ou Y, oui ou non) : elle ne se pose que
   * si chaque réponse a de quoi se poser à cet instant, puis la réponse se tire (`chance` : celles de la première).
   * Sinon la réponse la plus facile à composer sortirait plus souvent que l'autre.
   */
  const addEither = (type: SoloType, classes: readonly [string, string], chance = 0.5): boolean => {
    for (const r of shuffle(rng, [...new Set(of(type).map((s) => s.register))])) {
      const found = classes.map((c) => find(of(type, (s) => s.register === r && s.cls === c), 6))
      if (!found[0] || !found[1]) continue
      commit(found[rng() < chance ? 0 : 1]!)
      return true
    }
    return false
  }
  const fillSlot = (slot: Slot): boolean => {
    switch (slot) {
      case 'T1los':
        return add(of('T1', (s) => s.group === 'los'))
      case 'T1san':
        return add(of('T1', (s) => s.group === 'san'))
      case 'T1spd':
        return add(of('T1', (s) => s.group === 'spd'))
      case 'T2':
        return add(of('T2'))
      case 'T3': {
        const classes = new Set(of('T3b').map((s) => s.cls))
        if (classes.size === 2 ? rng() < ENOUGH_SHARE : classes.size === 1 && rng() < ENOUGH_SHARE * ENOUGH_ONE_SIDED) {
          if (classes.size === 2 ? addEither('T3b', ['yes', 'no'], enoughPlan(all)) : add(of('T3b'))) return true
        }
        return add(of('T3a'))
      }
      case 'T4':
        return add(of('T4'))
      case 'T5':
        return add(of('T5'), 6)
      case 'T6':
        return addEither('T6', ['true', 'false'])
      case 'T7a': {
        const [a, b] = rng() < 0.5 ? ['x', 'y'] : ['y', 'x']
        return add(of('T7a', (s) => s.cls === a), 5) || add(of('T7a', (s) => s.cls === b), 5)
      }
      case 'T7b':
        return addEither('T7b', ['x', 'y'])
      case 'T8': {
        for (const scene of shuffle(rng, SCENES)) {
          const plan = observationPlan(all).get(`${x.id}|${scene}`)
          if (!plan) continue
          // chaque réponse possible pour X doit avoir de quoi se poser : sinon le tirage pencherait vers les autres
          const found = plan.map((p) => ({ ...p, f: find(of('T8', (s) => s.register === scene && s.cls === p.cls), 6) }))
          if (found.some((p) => !p.f)) continue
          commit(weightedPick(rng, found, (p) => p.weight).f!)
          return true
        }
        return false
      }
      case 'auth':
        return add(of('auth'))
    }
  }

  // une copie plus courte que dix : les sortes dans le désordre, sans préférence
  const plan: Slot[] = count < SOLO_COUNT ? ['T1los', ...shuffle(rng, [...FIRST.slice(1), ...BLUEPRINT])] : []
  for (let r = Math.max(1, Math.round(scale)); count >= SOLO_COUNT && r > 0; r--) plan.push(...FIRST, ...shuffle(rng, BLUEPRINT))
  const rich = Math.max(...STYLES.map((style) => ownSigns(x, all, style).length)) >= INTRUDER_SIGNS
  for (const slot of plan) {
    if (picked.length >= count) break
    if (slot !== 'T5' || rich) fillSlot(slot)
  }
  const fill = () => {
    let progress = true
    while (picked.length < count && progress) {
      progress = false
      for (const slot of FILL) {
        if (picked.length >= count) break
        if (fillSlot(slot)) progress = true
      }
    }
  }
  // compléter : d'abord sans redite ; puis un départage de plus ; puis des questions d'une copie précédente ; et, en
  // dernier recours, un objet ou un geste repris une fois
  const levels = ([0, 1, 2] as const).slice(0, (opts.relax ?? 1) + 1)
  for (const repeat of seen.size ? [false, true] : [false]) {
    again = repeat
    for (const level of levels) {
      if (level === 2 && !repeat && seen.size) continue
      ease = level
      fill()
    }
  }

  // une copie courte ne compte jamais plus d'une moitié de questions déjà posées : les dernières entrées en sortent
  const dropped = new Set<number>()
  for (let i = picked.length - 1; i >= 0 && repeats() - dropped.size > Math.floor((picked.length - dropped.size) / 2); i--) {
    if (seen.has(picked[i].q.id)) dropped.add(i)
  }
  // l'ordre : une question passe avant celles qui la montreraient ; pour le reste, au hasard, deux questions de la
  // même sorte ne se suivant que faute d'autre
  const order: number[] = []
  const placed = new Set<number>(dropped)
  while (order.length < picked.length - dropped.size) {
    const left = picked.map((_, i) => i).filter((i) => !placed.has(i))
    const ready = left.filter((i) => [...before[i]].every((j) => placed.has(j)))
    // les contraintes ne bouclent jamais (voir place) ; par prudence, une question bloquée passerait quand même
    const pool = ready.length ? ready : left
    const last = order.length ? picked[order[order.length - 1]].type : null
    const varied = pool.filter((i) => picked[i].type !== last)
    const next = shuffle(rng, varied.length ? varied : pool)[0]
    order.push(next)
    placed.add(next)
  }
  // typographie française sur ce que l'app compose (les textes des fiches le sont déjà au chargement)
  return order.map((i) => {
    const q = { ...picked[i].q, prompt: fr(picked[i].q.prompt), explain: fr(noLeadingMais(picked[i].q.explain)) }
    ledgers.set(q, picked[i])
    return q
  })
}

/** Ce que chaque question d'une copie composée demande et montre (voir soloFacts). */
const ledgers = new WeakMap<Question, Built>()

/**
 * Ce qu'une question rendue par buildSoloQuiz demande (`asks`) et tout ce qu'elle montre une fois corrigée
 * (`shows`), sous les clés qui ont servi à composer la copie : `entité|valeur` et `entité|ligne de vue` (voir
 * factKeys), `entité#début de la phrase` et `entité#C2` (une ligne de sa fiche), `entité|~objet/sorte` (à qui est
 * ce fait), `entité|~objet!` (ce qu'il vaut). Dans une copie, aucune question ne demande ce qu'une question placée
 * avant elle montre, hormis un objet ou un geste repris une fois pour la remplir. Null pour une question d'une
 * autre origine (ou recopiée : la question se reconnaît à l'objet rendu, pas à son identifiant).
 */
export function soloFacts(q: Question): { asks: string[]; shows: string[] } | null {
  const b = ledgers.get(q)
  return b ? { asks: [...b.asks], shows: [...b.shows] } : null
}

/**
 * Les chances que « ce test suffit-il ? » porte sur un test qui suffit, pour une entité qui a des tests qui
 * suffisent et d'autres qui ne donnent qu'un indice : choisies pour qu'au fil des copies « Oui » sorte autant que
 * « Non », malgré les entités dont tous les tests suffisent (plus nombreuses, et posées moins souvent).
 */
const enoughPlan = memoList((all) => {
  const classes = all.map((g) => new Set(seedsFor(g, all).filter((s) => s.type === 'T3b').map((s) => s.cls)))
  const only = (c: string) => classes.filter((s) => s.size === 1 && s.has(c)).length
  const both = classes.filter((s) => s.size === 2).length
  // oui : only('yes') × ENOUGH_ONE_SIDED + both × p ; non : only('no') × ENOUGH_ONE_SIDED + both × (1 − p)
  return both ? Math.min(0.9, Math.max(0.1, 0.5 + (ENOUGH_ONE_SIDED * (only('no') - only('yes'))) / (2 * both))) : 0.5
})
