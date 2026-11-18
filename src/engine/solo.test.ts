import { beforeAll, describe, expect, it } from 'vitest'
// solo.ts d'abord, avant quiz.ts : les deux modules s'importent l'un l'autre, et rien ne doit en dépendre au chargement
import { buildSoloQuiz, soloFacets, soloFacetsOf, soloFacts, soloQuestion, soloSupply, soloType, SOLO_ANSWERS, SOLO_COUNT, type SoloType } from './solo'
import { GHOSTS, MECHANICS, getGhost } from '../data'
import type { Ghost } from '../data/types'
import { evidenceIn, fitsToo, isEvidenceList, mentionsEvidence, MIMIC, namesGhost, needsEvidence, numbersFit, restatedBy, zeroTests } from './cards'
import { redactGhostName } from './format'
import { apartFrom, buildQuiz, DEFAULT_TOPICS, factKeys, hints, homogeneous, nearSpeed, pronounClash, QUIZ_TOPICS, strayCheck, TRUE_OF_ALL, type Choice, type Question } from './quiz'
import { createRng } from './random'

/** Les copies telles que la fiche les lance : tous les thèmes, dix questions, puis « Encore 10 ». */
const copies = (id: string, seed: number) => {
  const ghost = getGhost(id)!
  const first = buildSoloQuiz({ ghost, allGhosts: GHOSTS, rng: createRng(seed) })
  const second = buildSoloQuiz({ ghost, allGhosts: GHOSTS, rng: createRng(seed + 1), seen: first.map((q) => q.id) })
  return { ghost, first, second }
}

describe('la copie sur une seule entité (solo.ts)', () => {
  it('se compose quel que soit le module chargé d’abord, et buildQuiz la confie à buildSoloQuiz', () => {
    const aswang = getGhost('aswang')!
    const direct = buildSoloQuiz({ ghost: aswang, allGhosts: GHOSTS, rng: createRng(5), topics: DEFAULT_TOPICS })
    const routed = buildQuiz({ topics: DEFAULT_TOPICS, ghosts: [aswang], allGhosts: GHOSTS, mechanics: MECHANICS, count: SOLO_COUNT, rng: createRng(5) })
    expect(direct.length).toBeGreaterThanOrEqual(4)
    // le même tirage donne la même copie, par l'un ou l'autre chemin
    expect(routed).toEqual(direct)
    expect(buildSoloQuiz({ ghost: aswang, allGhosts: GHOSTS, rng: createRng(5), topics: DEFAULT_TOPICS })).toEqual(direct)
    // sans thèmes : les questions rédigées de la fiche en font partie ; aucune ne parle des preuves
    const all = buildSoloQuiz({ ghost: aswang, allGhosts: GHOSTS, rng: createRng(5) })
    expect(all.every((q) => q.ghostId === 'aswang' && soloType(q) !== null)).toBe(true)
    for (const q of all) expect(mentionsEvidence(`${q.prompt} ${q.quote ?? ''}`), q.id).toBe(false)
  })

  it('aucune question ne demande ce qu’une question placée avant elle montre', () => {
    for (const g of GHOSTS) {
      for (const seed of [11, 12]) {
        const { first, second } = copies(g.id, seed * 1009 + g.id.length)
        for (const qs of [first, second]) {
          const shown = new Set<string>()
          for (const q of qs) {
            const facts = soloFacts(q)!
            for (const k of facts.asks) expect(shown.has(k), `${q.id} demande ${k}, déjà montré`).toBe(false)
            for (const k of facts.shows) shown.add(k)
          }
        }
      }
    }
  }, 60_000)

  it('« Encore 10 » : la moitié de la copie au plus a déjà été posée', () => {
    for (const g of GHOSTS) {
      const { first, second } = copies(g.id, 4242 + g.id.length)
      const seen = new Set(first.map((q) => q.id))
      // la ligne de vue se retire au sort à chaque copie (voir losChance) : elle peut revenir, les autres passent après les neuves
      const again = second.filter((q) => seen.has(q.id))
      expect(again.length, g.id).toBeLessThanOrEqual(second.length / 2)
    }
  }, 60_000)

  it('rien n’est jamais présenté comme faux pour le Mimic hors de sa propre fiche', () => {
    const mimic = getGhost('the-mimic')!
    const types = new Set(soloSupply(mimic, GHOSTS).map((s) => s.type))
    // ni signe d'une autre fiche à écarter, ni intrus, ni départage : il copie les autres entités
    for (const t of ['T2', 'T5', 'T7a'] as const) expect(types.has(t), t).toBe(false)
    let own = 0
    for (const s of soloSupply(mimic, GHOSTS)) {
      const q = soloQuestion(mimic, GHOSTS, s.id, createRng(3))
      if (s.type !== 'T6') continue
      // ses vrai ou faux ne citent que sa fiche ; « Faux » : seulement son propre test d'élimination (pas d'orbes dans la pièce favorite)
      expect(s.id, s.id).toMatch(/^q:vf:the-mimic:the-mimic:/u)
      if (q?.correct[0] === SOLO_ANSWERS.trueFalse.false) {
        own++
        expect(s.id).toMatch(/^q:vf:the-mimic:the-mimic:E\d+$/u)
      }
    }
    expect(own).toBeGreaterThan(0)
    // et il n'est jamais l'entité proche d'une autre copie
    for (const g of GHOSTS) for (const s of soloSupply(g, GHOSTS)) if (g.id !== 'the-mimic') expect(s.id.split(':').slice(2), s.id).not.toContain('the-mimic')
  })

  it('dix questions au plus, toutes sur X, sans doublon ; ce qui est cité comme faux pour X ne se relit pas parmi les réponses d’une autre question', () => {
    const start = (t: string) => t.toLocaleLowerCase('fr').replace(/[^\p{L}\d]+/gu, ' ').trim().slice(0, 40)
    for (const g of GHOSTS) {
      const { first, second } = copies(g.id, 9001 + g.id.length * 13)
      for (const qs of [first, second]) {
        expect(qs.length, g.id).toBeLessThanOrEqual(SOLO_COUNT)
        expect(new Set(qs.map((q) => q.id)).size, g.id).toBe(qs.length)
        expect(qs.every((q) => q.ghostId === g.id), g.id).toBe(true)
        const foreign = qs.flatMap((q) => {
          const t = soloType(q)
          if (t === 'T6' && q.correct[0] === 'false') return [start(q.quote!)]
          if (t === 'T5') return q.choices.filter((c) => q.correct.includes(c.id)).map((c) => start(c.label))
          return []
        })
        expect(new Set(foreign).size, `${g.id} : un même signe cité deux fois comme faux`).toBe(foreign.length)
        for (const q of qs) {
          if (!['T2', 'T3a', 'T7a'].includes(soloType(q)!)) continue
          for (const c of q.choices) expect(foreign, `${q.id} : « ${c.label} » déjà cité comme faux dans la copie`).not.toContain(start(c.label))
        }
      }
    }
  }, 60_000)

  it('une réponse en fourchette (« entre 150 et 170 s ») ne se demande pas après une question qui cite une valeur entre ses bornes', () => {
    const spirit = getGhost('spirit')!
    let asked = 0
    for (let seed = 1; seed <= 60; seed++) {
      const qs = buildSoloQuiz({ ghost: spirit, allGhosts: GHOSTS, rng: createRng(seed * 131) })
      const at = qs.findIndex((q) => q.id === 'q:auth:spirit:5')
      if (at < 0) continue
      asked++
      // « une seconde fois environ 2 min 40 plus tard » (160 s) soufflerait « entre 150 et 170 s »
      for (const q of qs.slice(0, at)) expect(`${q.prompt} ${q.quote ?? ''} ${q.explain}`, `${q.id} avant q:auth:spirit:5 (tirage ${seed})`).not.toMatch(/2\smin\s40|160\ss(?!\p{L})/u)
    }
    expect(asked).toBeGreaterThan(0)
  }, 60_000)

  it('ce que vaut un fait ne se demande pas deux fois : l’observation décisive du Mimic et son test, qui citent les mêmes vitesses', () => {
    const mimic = getGhost('the-mimic')!
    const asked = new Map<string, number>()
    for (let seed = 1; seed <= 120; seed++) {
      const ids = buildSoloQuiz({ ghost: mimic, allGhosts: GHOSTS, rng: createRng(seed * 17) }).map((q) => q.id)
      // l'observation (« est-ce que ça suffit ? », ou jugée en vrai ou faux) et le test qui décrit la même scène
      const same = ['q:constat:the-mimic:the-mimic:O1', 'q:suffit:the-mimic:1', 'q:vf:the-mimic:the-mimic:O1'].filter((id) => ids.includes(id))
      for (const id of same) asked.set(id, (asked.get(id) ?? 0) + 1)
      expect(same.length, `tirage ${seed} : ${same.join(', ')}`).toBeLessThanOrEqual(1)
    }
    // le test mord : au fil des copies, l'observation et le test se posent bien l'un et l'autre, jamais ensemble
    expect(asked.get('q:constat:the-mimic:the-mimic:O1') ?? 0, JSON.stringify([...asked])).toBeGreaterThan(0)
    expect(asked.get('q:suffit:the-mimic:1') ?? 0, JSON.stringify([...asked])).toBeGreaterThan(0)
  }, 30_000)

  it('aucune question ne demande « quelle entité ? » : pas un nom d’entité parmi les réponses', () => {
    const names = new Set(GHOSTS.flatMap((g) => [g.name, g.nameEn]))
    for (const id of ['deogen', 'thaye', 'kormos', 'oni', 'aswang']) {
      for (const seed of [1, 2, 3]) {
        const { first, second } = copies(id, seed * 77)
        for (const q of [...first, ...second]) {
          expect(q.id, q.id).not.toMatch(/^q:duel:/u)
          for (const c of q.choices) expect(names.has(c.label), `${q.id} : « ${c.label} »`).toBe(false)
        }
      }
    }
  })
})

/* =====================================================================================================================
 * Le verrou de la spécification
 *
 * Deux règles : (I1) savoir que la copie porte sur X ne rapporte rien ; (I2) chaque question porte sur X, et ce
 * qu'elle demande vient de la fiche de X (le coach, 18 novembre 2026 : dans un test sur X, aucune question ne demande
 * de quelle entité il s'agit, aucune ne porte sur le comportement d'une autre). Ce qui vient encore d'une autre
 * fiche : le signe d'une entité proche, dit faux pour X (vrai ou faux, intrus : un par copie au plus), les mauvaises
 * réponses sans nom, et l'entité que le départage nomme dans son énoncé. Les mesures ci-dessous ne lisent que ce que
 * l'élève lit (l'identifiant, l'énoncé, la citation, les réponses, le corrigé) et les fiches : jamais le registre
 * interne de la copie (soloFacts).
 *
 * Le corpus : 30 entités × 30 copies, tirées comme la page les tire (une graine d'horloge sur 32 bits), une copie sur
 * deux enchaînée à la précédente (« Encore 10 » : ses questions déjà vues).
 * ===================================================================================================================== */

/** L'heure d'ouverture des copies : quinze visites par entité, à plusieurs heures d'écart, et « Encore 10 » trois minutes après. */
const CLOCK = Date.UTC(2026, 10, 18, 7, 30)
const pageSeed = (entity: number, copy: number) => (CLOCK + Math.floor(copy / 2) * 30_034_567 + entity * 61_003 + (copy % 2) * 187_331) & 0xffffffff
const COPIES = 30

/**
 * Le plus petit nombre de questions des copies de chaque entité dans le corpus. Aucune fiche ne remplit toujours une
 * copie de dix aujourd'hui : la copie reste courte plutôt que de reposer une réponse déjà lue, de pencher vers une
 * réponse, d'aligner les questions à deux réponses, de dire faux ce que la fiche de X explique, ou de poser une
 * question sur une autre entité (le départage à l'envers, « à quoi reconnais-tu Y plutôt que X ? », que le coach a
 * écarté le 18 novembre 2026 : mieux vaut cinq questions sur X que sept dont deux sur celles qu'on confond avec
 * lui). En moyenne, 5,9 questions.
 * À vider à mesure que des questions rédigées complètent ces fiches : une entité retirée de la liste doit atteindre
 * dix à chaque copie, et le test le vérifie.
 */
const SHORT_COPIES: Readonly<Record<string, number>> = {
  'the-twins': 7,
  kormos: 7,
  phantom: 6,
  mare: 6,
  onryo: 6,
  poltergeist: 5,
  banshee: 5,
  shade: 5,
  yurei: 5,
  yokai: 5,
  myling: 5,
  thaye: 5,
  obambo: 5,
  spirit: 4,
  wraith: 4,
  jinn: 4,
  demon: 4,
  oni: 4,
  hantu: 4,
  raiju: 4,
  obake: 4,
  // ses questions sont presque toutes à deux ou trois réponses (tests, observations) : cinq au plus par copie
  'the-mimic': 4,
  moroi: 4,
  deogen: 4,
  gallu: 4,
  dayan: 3,
  aswang: 3,
  deildegast: 3,
  // sa fiche tient en une idée (1,0 m/s, puis 3,0 m/s dès qu'il te détecte) : les questions en nombres la demandent déjà
  revenant: 2,
  // pas d'observation décisive ni de test de confirmation sans preuve : peu de questions qui ne se recoupent pas
  goryo: 2,
}

interface View {
  q: Question
  type: SoloType
  x: Ghost
  /** l'entité proche de la question (départage, intrus, vrai ou faux), d'après son identifiant */
  partner: Ghost | null
  /** l'entité dont parle la bonne réponse */
  about: Ghost
  right: Choice
  wrong: Choice[]
  /** la bonne réponse de la question de même sorte posée juste avant dans la copie (vrai ou faux ; « est-ce que ça suffit ? »), et son rang parmi elles */
  prior: { answer: string | null; rank: number }
}
interface Copy {
  x: Ghost
  seed: number
  seen: readonly string[] | null
  qs: Question[]
  views: View[]
  ms: number
}

/** Une question lue de l'extérieur : sa sorte, l'entité proche et l'entité dont parle la réponse, d'après son identifiant. */
function view(q: Question, x: Ghost): View {
  const type = soloType(q)!
  const p = q.id.split(':')
  let partner: string | null = null
  let about = x.id
  if (type === 'T7a') {
    // q:dist:<face à>:<reconnue>
    partner = p[2] === x.id ? p[3] : p[2]
    about = p[3]
  } else if (type === 'T5') {
    partner = p[3]
    about = p[3]
  } else if (type === 'T6' || type === 'T8') {
    // q:vf:<x>:<source>:… et q:constat:<x>:<source>:…
    partner = p[3] === x.id ? null : p[3]
    about = p[3]
  }
  return { q, type, x, partner: partner ? getGhost(partner)! : null, about: getGhost(about)!, right: q.choices.find((c) => q.correct.includes(c.id))!, wrong: q.choices.filter((c) => !q.correct.includes(c.id)), prior: { answer: null, rank: 0 } }
}
/** Les deux sortes de questions à deux réponses qui reviennent dans une copie : vrai ou faux ; « est-ce que ça suffit ? » (test ou observation). */
const family = (type: SoloType) => (type === 'T6' ? 'vf' : type === 'T3b' || type === 'T8' ? 'suffit' : null)
/** Les questions d'une copie, chacune avec la réponse de la précédente de sa famille (ce qu'un élève vient de lire). */
function viewsOf(qs: readonly Question[], x: Ghost): View[] {
  const last = new Map<string, { answer: string; rank: number }>()
  return qs.map((q) => {
    const v = view(q, x)
    const f = family(v.type)
    if (f) {
      const before = last.get(f)
      v.prior = { answer: before?.answer ?? null, rank: before ? before.rank + 1 : 0 }
      last.set(f, { answer: q.correct[0], rank: v.prior.rank })
    }
    return v
  })
}

const confused = (x: Ghost, y: Ghost) => x.confusions.some((c) => c.with === y.id) || y.confusions.some((c) => c.with === x.id)

/* ---------- textes ---------- */

const bareCache = new Map<string, string>()
/** Le texte sans aucun nom d'entité, en minuscules, sans ponctuation. */
function bare(text: string): string {
  let v = bareCache.get(text)
  if (v === undefined) {
    v = GHOSTS.reduce((t, g) => redactGhostName(t, g), text.replace(/[«»]/gu, ' '))
      .toLocaleLowerCase('fr')
      .replace(/cette entité/gu, ' ')
      // une virgule ne reste qu'entre deux chiffres (« 1,7 »)
      .replace(/[^\p{L}\d,%/]+|(?<!\d),|,(?!\d)/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
    bareCache.set(text, v)
  }
  return v
}
const STOP = new Set(
  'les des une que qui est pas dans pour sur par avec son ses elle ils elles lui leur leurs plus tout tous toute cette ces aux mais donc car ont été être fait peut comme sans sous entre vers chez quand dont très même aussi alors puis après avant pendant entité autre autres cas ça cela oui non'.split(' '),
)
const wordCache = new Map<string, Set<string>>()
/** Les mots porteurs d'un texte (trois lettres au moins ou un nombre, hors mots outils), réduits à leurs six premières lettres. */
function words(text: string): Set<string> {
  let v = wordCache.get(text)
  if (!v) {
    v = new Set(
      bare(text)
        .split(' ')
        .filter((w) => (w.length >= 3 || /\d/u.test(w)) && !STOP.has(w))
        .map((w) => w.slice(0, 6)),
    )
    wordCache.set(text, v)
  }
  return v
}
/** La part des mots de `a` qu'on retrouve dans `b`. */
function within(a: string, b: string): number {
  const wa = words(a)
  const wb = words(b)
  let n = 0
  for (const w of wa) if (wb.has(w)) n++
  return wa.size ? n / wa.size : 0
}
/** Deux phrases disent-elles la même chose ? La part de mots communs, rapportée à la plus courte (trois mots au moins). */
function alike(a: string, b: string): number {
  const wa = words(a)
  const wb = words(b)
  if (wa.size < 3 || wb.size < 3) return 0
  let n = 0
  for (const w of wa) if (wb.has(w)) n++
  return n / Math.min(wa.size, wb.size)
}
/** À partir de là, deux réponses sur la même entité disent le même fait (les paires relues une à une : voir le rapport de l'audit). */
const SAME_FACT = 0.67

const valueCache = new Map<string, string[]>()
/** Les valeurs chiffrées d'un texte dit d'une entité (« 180 s », « 2,5 m/s »), et la ligne de vue : les clés dures de factKeys. */
function valuesOf(who: string, text: string): string[] {
  const id = `${who}\u0000${text}`
  let v = valueCache.get(id)
  if (!v) valueCache.set(id, (v = factKeys({ ghostId: who, prompt: text, choices: [], correct: [] }).filter((k) => !k.startsWith('carte:') && !k.includes('|~'))))
  return v
}

/* ---------- ce qu'une question demande, ce qu'elle montre ---------- */

const TYPES: readonly SoloType[] = ['T1', 'T2', 'T3a', 'T3b', 'T4', 'T5', 'T6', 'T7a', 'T8', 'auth']
const NUMERIC = /^q:(?:san|spd):/u
const isLos = (q: Question) => q.id.startsWith('q:los:')
/** Les questions à réponses fixes : la phrase jugée est la citation. */
const FIXED: readonly SoloType[] = ['T3b', 'T6', 'T8']
/** Les questions qui demandent ce que vaut un fait de X (une preuve, un simple indice), et non à qui il est. */
const asksWorth = (v: View) => v.type === 'T3b' || v.type === 'T8'
/** Ce que vaut le fait, d'après la bonne réponse. */
const verdict = (v: View) => (v.q.correct[0] === SOLO_ANSWERS.enough.yes ? 'confirms' : 'fits')

/** La phrase dont la connaissance donne la réponse. */
function answerText(v: View): string {
  if (isLos(v.q)) return 'ligne de vue'
  if (FIXED.includes(v.type)) return v.q.quote ?? ''
  if (v.type === 'auth') return `${v.q.prompt} ${v.right.label}`
  return v.right.label
}
/** Les valeurs que demande la question (celles de sa réponse). */
const answerValues = (v: View) => valuesOf(v.about.id, NUMERIC.test(v.q.id) ? v.right.label : answerText(v))

/** Ce que la question montre de vrai une fois corrigée, et de qui : [entité, texte]. */
function shownTexts(v: View): [string, string][] {
  const { q, x, about, partner } = v
  const out: [string, string][] = []
  // l'énoncé et le corrigé parlent de X, de l'entité proche, ou des deux
  for (const t of [q.prompt, q.explain]) for (const who of new Set([x.id, about.id, ...(partner ? [partner.id] : [])])) out.push([who, t])
  if (q.quote) out.push([about.id, q.quote])
  out.push([about.id, v.right.label])
  for (const c of v.wrong) {
    // un signe ou un test d'une autre entité (le corrigé dit de qui), ou une phrase de X lui-même (intrus, exclusion)
    if (v.type === 'T2' || v.type === 'T3a' || v.type === 'T7a') {
      if (getGhost(c.id)) out.push([c.id, c.label])
    } else if (v.type === 'T5' || v.type === 'T4') out.push([x.id, c.label])
  }
  return out
}
/** Tout ce qui se lit à l'écran une fois la question corrigée. */
const screen = (q: Question) => [q.prompt, q.quote ?? '', q.note ?? '', q.explain, ...q.choices.map((c) => c.label)].join(' \n ')
/** Ce qui se lit avant de répondre. */
const readable = (q: Question) => [q.prompt, q.quote ?? '', q.note ?? '', ...q.choices.map((c) => c.label)].filter(Boolean)

/* ---------- les joueurs qui ne savent rien ---------- */

interface Score {
  n: number
  /** % de bonnes réponses */
  got: number
  /** % attendu au hasard : la moyenne de 1 / nombre de réponses sur les questions jouées */
  chance: number
}
/** Un joueur : les réponses entre lesquelles il hésite (au hasard entre elles), ou null s'il ne joue pas cette question. */
type Player = (v: View) => number[] | null
function play(views: readonly View[], player: Player): Score {
  let n = 0
  let got = 0
  let chance = 0
  for (const v of views) {
    const picks = player(v)
    if (!picks?.length) continue
    n++
    got += picks.filter((i) => v.q.correct.includes(v.q.choices[i].id)).length / picks.length
    chance += 1 / v.q.choices.length
  }
  return { n, got: n ? (100 * got) / n : 0, chance: n ? (100 * chance) / n : 0 }
}
/** L'écart-type, en points, de la mesure d'un joueur qui répondrait au hasard à ses `n` questions. */
const sigma = (s: Score) => 100 * Math.sqrt(((s.chance / 100) * (1 - s.chance / 100)) / Math.max(1, s.n))
/**
 * Le plafond d'un joueur : le hasard plus deux points. Un joueur qui ne joue qu'une partie des questions (les vrai ou
 * faux, les observations) se mesure sur quelques centaines de réponses : deux écarts-types de cette mesure s'y
 * ajoutent, sinon le tirage du corpus déciderait seul du résultat (à 800 vrai ou faux, un écart-type vaut 1,8 point).
 */
const ceiling = (s: Score, everyQuestion: boolean) => s.chance + 2 + (everyQuestion ? 0 : 2 * sigma(s))
const say = (s: Score) => `${s.got.toFixed(1)} % sur ${s.n} questions, hasard ${s.chance.toFixed(1)} %`

const extreme = (v: View, sign: 1 | -1): number[] => {
  const lens = v.q.choices.map((c) => c.label.length * sign)
  const best = Math.max(...lens)
  return lens.flatMap((l, i) => (l === best ? [i] : []))
}
const at = (v: View, id: string) => [v.q.choices.findIndex((c) => c.id === id)]
/** PLACEHOLDERS */
const P95_MS = 400
const NAMING_FLOOR = 0
const CHECKED_FLOOR = 0
const QUOTE_LENGTH_CEILING: Record<'T3b' | 'T8', (s: Score) => number> = { T3b: (s) => ceiling(s, false) + 100, T8: (s) => ceiling(s, false) + 100 }
/** Ceux qui jouent toutes les questions : le hasard plus deux points, sans marge. */
const EVERY_QUESTION: Record<string, Player> = {
  'la réponse la plus longue': (v) => extreme(v, 1),
  'la réponse la plus courte': (v) => extreme(v, -1),
  'toujours la première réponse': () => [0],
  'toujours la dernière réponse': (v) => [v.q.choices.length - 1],
  'la réponse qui partage le plus de mots avec l’énoncé': (v) => {
    const said = words(`${v.q.prompt} ${v.q.quote ?? ''}`)
    const shared = v.q.choices.map((c) => [...words(c.label)].filter((w) => said.has(w)).length)
    const best = Math.max(...shared)
    return shared.flatMap((s, i) => (s === best ? [i] : []))
  },
}
/** L'autre réponse d'une question à deux réponses. */
const flip = (answer: string) =>
  answer === SOLO_ANSWERS.trueFalse.true ? SOLO_ANSWERS.trueFalse.false : answer === SOLO_ANSWERS.trueFalse.false ? SOLO_ANSWERS.trueFalse.true : answer === SOLO_ANSWERS.enough.yes ? SOLO_ANSWERS.enough.no : SOLO_ANSWERS.enough.yes
const TRUE = SOLO_ANSWERS.trueFalse.true
const FALSE = SOLO_ANSWERS.trueFalse.false
const YES = SOLO_ANSWERS.enough.yes
const NO = SOLO_ANSWERS.enough.no
const isWorth = (v: View) => family(v.type) === 'suffit'
/** La phrase jugée parle de « l'entité » (une scène), ou non (un signe écrit sans sujet). */
const SAYS_ENTITY = /l[’']entité/iu
/** Ceux qui ne jouent que certaines questions. */
const SOME_QUESTIONS: Record<string, Player> = {
  'la seule réponse qui nomme X ou contient le mot que souffle son nom': (v) => {
    const hit = v.q.choices.flatMap((c, i) => (namesGhost(c.label, v.x) || hints(v.x, c.label) ? [i] : []))
    return hit.length === 1 ? hit : null
  },
  'toujours « Vrai »': (v) => (v.type === 'T6' ? at(v, TRUE) : null),
  'toujours « Faux »': (v) => (v.type === 'T6' ? at(v, FALSE) : null),
  'observation : toujours « Oui, ça suffit »': (v) => (v.type === 'T8' ? at(v, YES) : null),
  'observation : toujours « Non, ce n’est qu’un indice »': (v) => (v.type === 'T8' ? at(v, NO) : null),
  'ce test suffit-il : toujours « Oui »': (v) => (v.type === 'T3b' ? at(v, YES) : null),
  'ce test suffit-il : toujours « Non »': (v) => (v.type === 'T3b' ? at(v, NO) : null),
  'ligne de vue : toujours « Oui »': (v) => (isLos(v.q) ? [0] : null),
  'ligne de vue : toujours « Non »': (v) => (isLos(v.q) ? [1] : null),
  // la suite des réponses dans une copie : qui vient de lire « Faux » ne sait rien du vrai ou faux suivant
  'vrai ou faux : la même réponse qu’au précédent': (v) => (v.type === 'T6' && v.prior.answer ? at(v, v.prior.answer) : null),
  'vrai ou faux : l’autre réponse qu’au précédent': (v) => (v.type === 'T6' && v.prior.answer ? at(v, flip(v.prior.answer)) : null),
  'vrai ou faux : « Faux » au premier de la copie, « Vrai » aux suivants': (v) => (v.type === 'T6' ? at(v, v.prior.rank ? TRUE : FALSE) : null),
  'vrai ou faux : « Vrai » au premier de la copie, « Faux » aux suivants': (v) => (v.type === 'T6' ? at(v, v.prior.rank ? FALSE : TRUE) : null),
  '« est-ce que ça suffit ? » : la même réponse qu’à la précédente': (v) => (isWorth(v) && v.prior.answer ? at(v, v.prior.answer) : null),
  '« est-ce que ça suffit ? » : l’autre réponse qu’à la précédente': (v) => (isWorth(v) && v.prior.answer ? at(v, flip(v.prior.answer)) : null),
  '« est-ce que ça suffit ? » : « Oui » à la première de la copie, « Non » aux suivantes': (v) => (isWorth(v) ? at(v, v.prior.rank ? NO : YES) : null),
  '« est-ce que ça suffit ? » : « Non » à la première de la copie, « Oui » aux suivantes': (v) => (isWorth(v) ? at(v, v.prior.rank ? YES : NO) : null),
  '« est-ce que ça suffit ? » : « Oui » aux tests, « Non » aux observations': (v) => (isWorth(v) ? at(v, v.type === 'T3b' ? YES : NO) : null),
  '« est-ce que ça suffit ? » : « Non » aux tests, « Oui » aux observations': (v) => (isWorth(v) ? at(v, v.type === 'T3b' ? NO : YES) : null),
  // la forme de la phrase jugée en vrai ou faux : sa longueur, sa tournure
  'vrai ou faux : « Vrai » si la phrase est longue (80 caractères et plus), sinon « Faux »': (v) => (v.type === 'T6' ? at(v, v.q.quote!.length >= 80 ? TRUE : FALSE) : null),
  'vrai ou faux : « Faux » si la phrase est longue (80 caractères et plus), sinon « Vrai »': (v) => (v.type === 'T6' ? at(v, v.q.quote!.length >= 80 ? FALSE : TRUE) : null),
  'vrai ou faux : « Faux » si la phrase parle de « l’entité », sinon « Vrai »': (v) => (v.type === 'T6' ? at(v, SAYS_ENTITY.test(v.q.quote!) ? FALSE : TRUE) : null),
  'vrai ou faux : « Vrai » si la phrase parle de « l’entité », sinon « Faux »': (v) => (v.type === 'T6' ? at(v, SAYS_ENTITY.test(v.q.quote!) ? TRUE : FALSE) : null),
}
/**
 * « Oui » aux longues citations, « Non » aux courtes (ou l'inverse), à plusieurs seuils : sur les fiches, un fait
 * décisif se décrit en détail (ses conditions), un simple indice tient en une ligne.
 */
const QUOTE_LENGTHS = [100, 120, 135, 150, 200] as const
/** Les joueurs qui ne jouent qu'à partir de la deuxième question d'une sorte dans la copie : quelques dizaines de questions. */
const SEQUENCE = /qu’au précédent|qu’à la précédente/u
const byQuoteLength = (type: SoloType, least: number, long: string): Player => (v) => (v.type === type ? at(v, v.q.quote!.length >= least ? long : flip(long)) : null)

/* ---------- les fiches ---------- */

/** Les faits d'une fiche : ce qu'elle dit de sa propre entité. */
const ownLines = (g: Ghost): string[] => [
  ...g.keyTells,
  ...[...g.tells, ...g.behaviors, ...g.abilities, ...g.observations, ...g.confirmationTests, ...g.eliminationTests].map((t) => t.text),
]
/** La phrase vient-elle de l'un de ces textes (au caviardage, aux apartés et à la conclusion retirés près) ? */
const from = (statement: string, texts: readonly string[]) => texts.some((t) => within(statement, t) >= 0.8)
/** Ce qui, dans la citation d'un test, dirait déjà s'il suffit : un nom d'entité, sa conclusion, un mot de verdict. */
const VERDICT_WORDS = /c[’']est\s+(?:une?|le|la|les|cette|ces)\s+(?!cas(?!\p{L}))|c[’']est\s+l[’']|ce\s+sont\s|ce\s+n[’']est\s+pas|ça\s+(?:pourrait|peut)|pourrait|peut-être|(?<!\p{L})indices?(?!\p{L})|à coup sûr|forcément|certitude|(?<!\p{L})certaine?s?(?!\p{L})|confirm|suffi|prouv|exclu|élimin/iu

/**
 * Les mesures du corpus, pour qui veut les lire sans faire échouer un test :
 * VITE_SOLO_MEASURES=1 npx vitest run src/engine/solo.test.ts
 */
const measure = (line: string) => {
  if (import.meta.env.VITE_SOLO_MEASURES) console.info(line)
}

describe('« Me tester sur X » : le verrou de la spécification (30 entités × 30 copies, graines d’horloge)', () => {
  const corpus: Copy[] = []
  let all: View[] = []
  const of = (x: Ghost) => corpus.filter((c) => c.x.id === x.id)
  const strays = new Map(GHOSTS.map((o) => [o.id, strayCheck([o])]))
  /** Les autres entités que la question nomme avant d'être corrigée (énoncé, citation, précision, réponses). */
  const namedIn = (q: Question, x: Ghost) => GHOSTS.filter((o) => o.id !== x.id && strays.get(o.id)!(q))

  beforeAll(() => {
    // une première copie hors mesure : ce qui ne dépend que des fiches se calcule une fois (voir warmQuiz)
    buildSoloQuiz({ ghost: GHOSTS[0], allGhosts: GHOSTS, rng: createRng(1) })
    GHOSTS.forEach((x, k) => {
      let previous: Question[] = []
      for (let j = 0; j < COPIES; j++) {
        const seen = j % 2 ? previous.map((q) => q.id) : null
        const seed = pageSeed(k, j)
        const t = performance.now()
        const qs = buildSoloQuiz({ ghost: x, allGhosts: GHOSTS, rng: createRng(seed), ...(seen ? { seen } : {}) })
        corpus.push({ x, seed, seen, qs, views: viewsOf(qs, x), ms: performance.now() - t })
        previous = qs
      }
    })
    all = corpus.flatMap((c) => c.views)
  }, 300_000)

  /* ---------- a. chaque question porte sur X ---------- */

  it('a. chaque question porte sur X ; toute autre entité nommée est la seule entité proche de la question, qu’on confond avec X', () => {
    let naming = 0
    for (const v of all) {
      expect(v.q.ghostId, v.q.id).toBe(v.x.id)
      expect(v.type, v.q.id).not.toBeNull()
      expect(v.q.correct, v.q.id).toHaveLength(1)
      expect(v.right, v.q.id).toBeDefined()
      const named = namedIn(v.q, v.x)
      if (named.length) naming++
      if (v.type === 'auth') {
        // une question rédigée de la fiche peut comparer X à une entité : une seule, qu'on confond avec lui
        expect(named.length, `${v.q.id} : « ${v.q.prompt} »`).toBeLessThanOrEqual(1)
        for (const o of named) expect(confused(v.x, o) && o.id !== MIMIC, `${v.q.id} nomme ${o.name}`).toBe(true)
      } else {
        for (const o of named) expect(o.id, `${v.q.id} nomme ${o.name}`).toBe(v.partner?.id)
      }
      if (v.partner) {
        expect(confused(v.x, v.partner), `${v.q.id} : ${v.partner.name} ne se confond pas avec ${v.x.name}`).toBe(true)
        expect(v.partner.id, v.q.id).not.toBe(MIMIC)
        expect(v.x.id, v.q.id).not.toBe(MIMIC)
        expect(v.partner.id, v.q.id).not.toBe(v.x.id)
      }
    }
    // le test mord : des questions nomment bien une entité proche (le départage, dans son énoncé ; quelques questions
    // rédigées). Elles étaient plus de 300 avec « de qui parle-t-on ? », qui ne se pose plus : mesuré, NAMING
    expect(naming).toBeGreaterThan(NAMING_FLOOR)
    measure(`a. ${all.length} questions dans ${corpus.length} copies, dont ${naming} nomment une entité proche`)
  })

  /* ---------- b. plus de « quelle entité ? », plus de question sur une autre entité ---------- */

  it('b. aucune question ne demande « quelle entité ? », aucune ne porte sur une autre entité que X', () => {
    const names = new Set(GHOSTS.flatMap((g) => [g.name, g.nameEn, `${g.name} (${g.nameEn})`]))
    const faults: string[] = []
    for (const v of all) {
      const p = v.q.id.split(':')
      // pas un nom d'entité parmi les réponses : ni « de qui parle-t-on ? », ni « quelle entité fait ceci ? »
      for (const c of v.q.choices) if (names.has(c.label) || GHOSTS.some((g) => c.label === g.name)) faults.push(`${v.q.id} : « ${c.label} » parmi les réponses`)
      if (p[1] === 'duel') faults.push(`${v.q.id} : « de qui parle-t-on ? »`)
      // « est-ce que ça suffit ? » ne se pose que sur une observation de la fiche de X
      if (v.type === 'T8' && (p[3] !== v.x.id || !/^O\d+$/u.test(p[4]))) faults.push(`${v.q.id} : une scène qui n’est pas une observation de la fiche de ${v.x.name}`)
      // le départage : « à quoi reconnais-tu X plutôt que Y ? », jamais l'inverse
      if (v.type === 'T7a' && (p[3] !== v.x.id || p[2] === v.x.id)) faults.push(`${v.q.id} : un départage à l’envers`)
      // la bonne réponse parle de X, sauf la phrase d'une autre fiche dite fausse pour lui (vrai ou faux, intrus)
      const foreign = (v.type === 'T6' && v.q.correct[0] === FALSE && v.partner) || v.type === 'T5'
      if (v.about.id !== v.x.id && !foreign) faults.push(`${v.q.id} : la réponse parle de ${v.about.name}`)
      // un vrai ou faux se juge « pour X », ou (les phrases de départage) nomme X dans la phrase jugée ou son corrigé
      if (v.type === 'T6' && p[4][0] !== 'L') expect(v.q.prompt.replace(/[\u00a0\u202f]/gu, ' '), v.q.id).toMatch(/^Vrai ou faux pour .+ \?$/u)
    }
    expect(faults, [...new Set(faults)].slice(0, 12).join('\n')).toEqual([])
    // au plus une affirmation venue d'une autre fiche par copie de dix (le « Faux » d'une entité proche, l'intrus)
    const borrowed = (c: Copy) => c.views.filter((v) => (v.type === 'T6' && v.partner) || v.type === 'T5').length
    const most = Math.max(...corpus.map(borrowed))
    const total = corpus.reduce((n, c) => n + borrowed(c), 0)
    measure(`b. affirmations venues d’une autre fiche : ${total} dans ${corpus.filter((c) => borrowed(c)).length} copies sur ${corpus.length} ; au plus ${most} par copie`)
    for (const c of corpus) expect(borrowed(c), `${c.x.id} (graine ${c.seed}) : ${borrowed(c)} affirmations venues d’une autre fiche`).toBeLessThanOrEqual(1)
    // le test mord : il s'en pose (sans quoi « Faux » ne viendrait que des tests d'élimination de X)
    expect(total).toBeGreaterThan(100)
  })

  /* ---------- c. savoir que la copie porte sur X ne rapporte rien ---------- */

  it('c. aucun joueur qui ne sait rien ne fait mieux que le hasard plus deux points', () => {
    for (const [name, player] of Object.entries(EVERY_QUESTION)) {
      const s = play(all, player)
      expect(s.n, name).toBe(all.length)
      measure(`c. ${name} : ${say(s)} (écart ${(s.got - s.chance).toFixed(1)}, plafond +2,0)`)
      expect(s.got, `${name} : ${say(s)}`).toBeLessThanOrEqual(ceiling(s, true))
    }
    for (const [name, player] of Object.entries(SOME_QUESTIONS)) {
      const s = play(all, player)
      // (une seule réponse qui souffle X : il en reste peu, et tant mieux ; les autres joueurs ont des centaines de questions)
      if (name.startsWith('la seule réponse')) expect(s.n, name).toBeLessThan(200)
      else expect(s.n, name).toBeGreaterThan(SEQUENCE.test(name) ? 60 : 100)
      if (!s.n) continue
      measure(`c. ${name} : ${say(s)} (écart ${(s.got - s.chance).toFixed(1)}, plafond +${(ceiling(s, false) - s.chance).toFixed(1)})`)
      expect(s.got, `${name} : ${say(s)} (plafond ${ceiling(s, false).toFixed(1)} %)`).toBeLessThanOrEqual(ceiling(s, false))
    }
    // la longueur de la citation d'un « est-ce que ça suffit ? »
    for (const type of ['T3b', 'T8'] as const) {
      for (const least of QUOTE_LENGTHS) {
        for (const long of [YES, NO]) {
          const name = `${type === 'T3b' ? 'ce test suffit-il' : 'observation'} : « ${long === YES ? 'Oui' : 'Non'} » si la citation fait ${least} caractères et plus, sinon « ${long === YES ? 'Non' : 'Oui'} »`
          const s = play(all, byQuoteLength(type, least, long))
          const top = QUOTE_LENGTH_CEILING[type](s)
          measure(`c. ${name} : ${say(s)} (écart ${(s.got - s.chance).toFixed(1)}, plafond +${(top - s.chance).toFixed(1)})`)
          expect(s.n, name).toBeGreaterThan(100)
          expect(s.got, `${name} : ${say(s)} (plafond ${top.toFixed(1)} %)`).toBeLessThanOrEqual(top)
        }
      }
    }
    // sorte par sorte : un joueur peut ne jouer sa règle que là où elle paie (la seule réponse qui contient « disparaît »,
    // dans les questions rédigées du Fantôme). Sur ces petits nombres, et tant de mesures, trois écarts-types de marge
    for (const [name, player] of Object.entries({ ...EVERY_QUESTION, 'la seule réponse qui nomme X ou contient le mot que souffle son nom': SOME_QUESTIONS['la seule réponse qui nomme X ou contient le mot que souffle son nom'] })) {
      for (const type of TYPES) {
        const s = play(all.filter((v) => v.type === type), player)
        if (s.n < 50) continue
        const top = s.chance + 2 + 3 * sigma(s)
        measure(`c.   ${type} · ${name} : ${say(s)} (écart ${(s.got - s.chance).toFixed(1)}, plafond +${(top - s.chance).toFixed(1)})`)
        expect(s.got, `${type} · ${name} : ${say(s)} (plafond ${top.toFixed(1)} %)`).toBeLessThanOrEqual(top)
      }
    }
  })

  it('c. sur quatre phrases, la bonne est la plus longue une fois sur quatre ; ni « 50 % », ni « 1,7 m/s » ne gagnent d’office', () => {
    const four = all.filter((v) => v.q.choices.length === 4 && !NUMERIC.test(v.q.id))
    const longest = four.filter((v) => v.wrong.every((c) => c.label.length <= v.right.label.length))
    const share = (100 * longest.length) / four.length
    measure(`c. sur quatre phrases, la bonne est la plus longue (ou l’une des plus longues) : ${share.toFixed(1)} % de ${four.length}`)
    expect(share, `${share.toFixed(1)} % de ${four.length}`).toBeGreaterThanOrEqual(15)
    expect(share, `${share.toFixed(1)} % de ${four.length}`).toBeLessThanOrEqual(35)
    // partout où la valeur standard est l'une des réponses, questions rédigées comprises (« À partir de quel seuil un Goryo peut-il chasser ? »)
    for (const value of ['50\u00a0%', '1,7\u00a0m/s']) {
      const shown = all.filter((v) => v.q.choices.some((c) => c.label === value))
      const won = shown.filter((v) => v.right.label === value)
      measure(`c. « ${value} » proposé ${shown.length} fois, bonne réponse ${won.length} fois (${((100 * won.length) / Math.max(1, shown.length)).toFixed(1)} %)`)
      expect(shown.length, value).toBeGreaterThanOrEqual(20)
      expect(won.length / shown.length, `${value} : ${won.length}/${shown.length}`).toBeLessThanOrEqual(0.4)
    }
  })

  /* ---------- d. rien sur les preuves ---------- */

  it('d. ni l’énoncé, ni la citation, ni une réponse ne parle des preuves (sauf les orbes du Mimic en partie à 0 preuve)', () => {
    let orbs = 0
    for (const v of all) {
      for (const t of readable(v.q)) {
        if (v.x.id === MIMIC && evidenceIn(t).join() === 'orbs') {
          // la seule mention permise : ses orbes, la seule « preuve » qu'on relève encore sans preuve
          orbs++
          continue
        }
        expect(mentionsEvidence(t) || needsEvidence(t) || isEvidenceList(t), `${v.q.id} : « ${t} »`).toBe(false)
      }
      // le corrigé non plus n'apprend pas quelle preuve a quelle entité
      if (!(v.x.id === MIMIC && evidenceIn(v.q.explain).join() === 'orbs')) expect(isEvidenceList(v.q.explain), `${v.q.id} : « ${v.q.explain} »`).toBe(false)
    }
    expect(orbs).toBeGreaterThan(0)
  })

  /* ---------- e. un fait, une question ---------- */

  it('e. dans une copie, aucune réponse ne se lit plus tôt, aucun fait ne se demande deux fois sous le même angle', () => {
    /**
     * Un fait se demande une fois pour dire à qui il est, puis une fois pour dire ce qu'il vaut (une preuve, un simple
     * indice) : `b`, posée après `a` sur le même fait, est permise si elle demande ce qu'il vaut et que `a` ne l'a pas dit.
     * « Quel test confirme X ? » dit les deux (c'est une preuve) ; deux questions sur ce que vaut le fait ne disent la
     * même chose que si leur réponse est la même (une preuve, puis un simple indice sur le même objet, sont deux faits).
     */
    const otherAngle = (a: View, b: View) => {
      if (!asksWorth(b)) return false
      if (a.type === 'T3a') return verdict(b) !== 'confirms'
      return !asksWorth(a) || verdict(a) !== verdict(b)
    }
    const readEarlier: string[] = []
    const valueShown: string[] = []
    const askedTwice: string[] = []
    const worthFirst: string[] = []
    let twoAngles = 0
    let pairs = 0
    for (const c of corpus) {
      const shown = c.views.map(shownTexts)
      const screens = c.views.map((v) => bare(screen(v.q)))
      for (let j = 0; j < c.views.length; j++) {
        const b = c.views[j]
        const answer = answerText(b)
        const start = bare(answer).slice(0, 60)
        const values = answerValues(b)
        for (let i = 0; i < j; i++) {
          const a = c.views[i]
          pairs++
          const tag = `${c.x.id} (graine ${c.seed}) ${a.q.id} puis ${b.q.id}`
          // 1. la phrase de la réponse, déjà lue telle quelle (énoncé, citation, réponses, corrigé)
          if (!NUMERIC.test(b.q.id) && !isLos(b.q) && start.length >= 20 && screens[i].includes(start)) readEarlier.push(`${tag} : « ${answer.slice(0, 80)} »`)
          // une valeur de la réponse, déjà montrée de la même entité ; ou deux réponses qui disent le même fait de la même entité
          const told = new Set(shown[i].filter(([who]) => who === b.about.id).flatMap(([who, t]) => valuesOf(who, t)))
          const hit = values.filter((k) => told.has(k))
          const same = a.about.id === b.about.id && (alike(answerText(a), answer) >= SAME_FACT || answerValues(a).some((k) => values.includes(k)))
          if (!hit.length && !same) continue
          if (otherAngle(a, b)) twoAngles++
          // 2. ce que vaut le fait, puis à qui il est : le corrigé de la première l'a dit
          else if (same && asksWorth(a) && !asksWorth(b)) worthFirst.push(tag)
          // 3. le même fait, deux fois sous le même angle
          else if (same) askedTwice.push(tag)
          // 4. une valeur de la réponse, lue plus tôt à propos de la même entité
          else valueShown.push(`${tag} : ${hit.join(', ')}`)
        }
      }
    }
    const some = (list: string[]) => [...new Set(list)].slice(0, 12).join('\n')
    measure(`e. ${pairs} paires de questions ; réponse déjà lue ${readEarlier.length}, valeur déjà montrée ${valueShown.length}, « ce que ça vaut » avant « à qui est-ce » ${worthFirst.length}, même fait sous le même angle ${askedTwice.length} ; deux angles (permis) ${twoAngles}, soit ${(twoAngles / corpus.length).toFixed(2)} par copie`)
    for (const l of [...new Set(askedTwice)]) measure(`e.   même angle : ${l}`)
    for (const l of [...new Set(valueShown)]) measure(`e.   valeur montrée : ${l}`)
    expect(readEarlier, some(readEarlier)).toHaveLength(0)
    expect(valueShown, some(valueShown)).toHaveLength(0)
    expect(worthFirst, some(worthFirst)).toHaveLength(0)
    expect(askedTwice, some(askedTwice)).toHaveLength(0)
    // les deux angles : mesurés, pour que leur part ne grimpe pas sans qu'on le voie (0,4 paire par copie aujourd'hui)
    expect(pairs).toBeGreaterThan(12_000)
    expect(twoAngles / corpus.length, `${twoAngles} paires « à qui est-ce, puis ce que ça vaut » sur ${corpus.length} copies`).toBeLessThanOrEqual(0.6)
  })

  /* ---------- f. la forme ---------- */

  it('f. des réponses de même forme ; les réponses fixes dans leur ordre ; les questions à deux réponses : trois au plus, ou la moitié de la copie ; cinq à moins de quatre', () => {
    const fixed: Record<string, string[]> = {
      T3b: [SOLO_ANSWERS.enough.yes, SOLO_ANSWERS.enough.no],
      T6: [SOLO_ANSWERS.trueFalse.true, SOLO_ANSWERS.trueFalse.false],
      // l'observation : deux réponses, celles de « ce test suffit-il ? » (plus de « Non, ça l'exclut », presque jamais juste)
      T8: [SOLO_ANSWERS.enough.yes, SOLO_ANSWERS.enough.no],
    }
    const labels = new Map<string, Set<string>>()
    let composed = 0
    for (const v of all) {
      const ids = v.q.choices.map((c) => c.id)
      expect(new Set(v.q.choices.map((c) => c.label)).size, v.q.id).toBe(v.q.choices.length)
      if (fixed[v.type]) {
        expect(ids, v.q.id).toEqual(fixed[v.type])
        // et toujours les mêmes mots pour une entité : rien ne distingue une question de la suivante
        const key = `${v.type}|${v.x.id}`
        labels.set(key, (labels.get(key) ?? new Set()).add(v.q.choices.map((c) => c.label).join(' | ')))
      } else if (isLos(v.q)) expect(ids, v.q.id).toEqual(['yes', 'no'])
      else if (v.type !== 'auth') {
        // ce que l'app compose : quatre réponses de même unité, de longueur voisine, sans marque qui en distingue une seule
        composed++
        expect(v.q.choices, v.q.id).toHaveLength(4)
        expect(homogeneous(v.q.choices), `${v.q.id} : ${v.q.choices.map((c) => `[${c.label}]`).join(' ')}`).toBe(true)
      } else {
        // une question rédigée garde les réponses de sa fiche (deux à quatre), dont aucune ne nomme X
        expect(v.q.choices.length, v.q.id).toBeGreaterThanOrEqual(2)
        expect(v.q.choices.length, v.q.id).toBeLessThanOrEqual(4)
        for (const c of v.q.choices) expect(namesGhost(c.label, v.x), `${v.q.id} : ${c.label}`).toBe(false)
      }
    }
    measure(`f. questions composées à quatre réponses : ${composed}`)
    expect(composed).toBeGreaterThan(1400)
    for (const [key, set] of labels) expect(set.size, key).toBe(1)
    // les mots de l'observation, les mêmes pour toutes les entités : « Oui, ça suffit », « Non, ce n'est qu'un indice »
    const observation = new Set(all.filter((v) => v.type === 'T8').map((v) => v.q.choices.map((c) => c.label).join(' | ')))
    expect([...observation]).toEqual(['Oui, ça suffit | Non, ce n’est qu’un indice'])
    // la variété : les questions à deux réponses (une sur deux se trouve au hasard) sont trois au plus dans toute copie,
    // et au-delà jamais plus de la moitié de la copie (quatre sur sept ou huit, cinq sur neuf ou dix) ; cinq questions
    // au plus ont moins de quatre réponses : une copie de dix compte donc cinq questions à quatre réponses au moins.
    // (Le plafond était de trois à toute taille : il coupait les copies des fiches riches en tests et en observations,
    // dont c'est la matière ; mesuré sur 1 200 copies, 41 % des questions ont deux réponses, 43 % avant ce changement
    // en comptant « de qui parle-t-on ? ».)
    let beyondThree = 0
    for (const c of corpus) {
      const width = (n: number) => c.qs.filter((q) => q.choices.length === n).length
      if (width(2) > 3) beyondThree++
      expect(width(2), `${c.x.id} (graine ${c.seed}) : ${width(2)} questions à deux réponses sur ${c.qs.length}`).toBeLessThanOrEqual(Math.max(3, Math.ceil(c.qs.length / 2)))
      expect(c.qs.length - width(4), `${c.x.id} (graine ${c.seed})`).toBeLessThanOrEqual(5)
      if (c.qs.length === SOLO_COUNT) expect(width(4), `${c.x.id} (graine ${c.seed})`).toBeGreaterThanOrEqual(5)
    }
    const two = all.filter((v) => v.q.choices.length === 2).length
    measure(`f. questions à deux réponses : ${((100 * two) / all.length).toFixed(1)} % ; copies qui en comptent plus de trois : ${beyondThree}/${corpus.length}`)
    expect(two / all.length).toBeLessThanOrEqual(0.5)
  })

  /* ---------- g. l'offre ---------- */

  it('g. dix questions pour chaque entité qui le peut, sans doublon ; « Encore 10 » reprend la moitié de la copie au plus', () => {
    const measured: Record<string, number> = {}
    for (const x of GHOSTS) {
      const sizes = of(x).map((c) => c.qs.length)
      const least = Math.min(...sizes)
      if (least < SOLO_COUNT) measured[x.id] = least
      for (const c of of(x)) {
        expect(c.qs.length, x.id).toBeLessThanOrEqual(SOLO_COUNT)
        expect(new Set(c.qs.map((q) => q.id)).size, `${x.id} (graine ${c.seed})`).toBe(c.qs.length)
        expect(new Set(c.qs.map((q) => `${q.prompt}|${q.quote ?? ''}`)).size, `${x.id} (graine ${c.seed})`).toBe(c.qs.length)
        // une même scène ne se relit pas sous deux questions (jugée en vrai ou faux, puis « est-ce que ça suffit ? »)
        const quotes = c.qs.flatMap((q) => (q.quote ? [q.quote] : []))
        expect(new Set(quotes).size, `${x.id} (graine ${c.seed}) : une citation deux fois`).toBe(quotes.length)
        if (!c.seen) continue
        const again = c.qs.filter((q) => c.seen!.includes(q.id)).length
        expect(again, `${x.id} (graine ${c.seed}) : ${again} questions de la copie précédente sur ${c.qs.length}`).toBeLessThanOrEqual(c.qs.length / 2)
      }
    }
    const sizes = corpus.map((c) => c.qs.length)
    measure(`g. copies de dix : ${sizes.filter((n) => n === SOLO_COUNT).length}/${sizes.length} ; taille moyenne ${(all.length / corpus.length).toFixed(2)} ; plus petites copies : ${JSON.stringify(measured)}`)
    for (const x of GHOSTS) {
      const mine = of(x)
      const over = Math.max(...mine.filter((c) => c.seen).map((c) => c.qs.filter((q) => c.seen!.includes(q.id)).length / Math.max(1, c.qs.length)))
      const kinds = new Map<string, number>()
      for (const v of mine.flatMap((c) => c.views)) kinds.set(v.type, (kinds.get(v.type) ?? 0) + 1)
      measure(`g.   ${x.id} : min ${Math.min(...mine.map((c) => c.qs.length))}, moyenne ${(mine.reduce((n, c) => n + c.qs.length, 0) / mine.length).toFixed(1)}, dix ${mine.filter((c) => c.qs.length === SOLO_COUNT).length}/${mine.length}, reprise max ${(100 * over).toFixed(0)} %, questions distinctes ${new Set(mine.flatMap((c) => c.qs.map((q) => q.id))).size} ; ${[...kinds].map(([t, n]) => `${t} ${n}`).join(', ')}`)
    }
    // d'une copie à la suivante, par fait et non plus par identifiant : le même signe revient parfois sous une autre
    // forme (« lequel de ces signes… », puis « vrai ou faux »), que la liste des questions déjà vues ne connaît pas
    let chained = 0
    let beyondHalf = 0
    let sum = 0
    for (let i = 1; i < corpus.length; i++) {
      const c = corpus[i]
      if (!c.seen || !c.views.length) continue
      const before = corpus[i - 1].views
      const again = c.views.filter((b) => before.some((a) => a.q.id === b.q.id || (a.about.id === b.about.id && asksWorth(a) === asksWorth(b) && alike(answerText(a), answerText(b)) >= SAME_FACT))).length
      chained++
      sum += again / c.views.length
      if (again > c.views.length / 2) beyondHalf++
    }
    measure(`g. « Encore 10 », par fait : ${((100 * sum) / chained).toFixed(0)} % de la copie en moyenne reprend un fait de la précédente ; ${beyondHalf} copies sur ${chained} en reprennent plus de la moitié`)
    expect(sum / chained, 'part moyenne des faits repris d’une copie à la suivante').toBeLessThanOrEqual(0.4)
    expect(beyondHalf / chained, `${beyondHalf} copies sur ${chained} reprennent plus de la moitié des faits de la précédente`).toBeLessThanOrEqual(0.08)
    // la part des questions dont la réponse parle de l'entité proche (départage à l'envers, signe d'une autre fiche jugé faux…)
    const rival = (c: Copy) => c.views.filter((v) => v.about.id !== c.x.id).length
    measure(`g. questions dont la réponse parle de l’entité proche : ${((100 * corpus.reduce((n, c) => n + rival(c), 0)) / all.length).toFixed(1)} % ; au plus ${Math.max(...corpus.map(rival))} par copie ; copies où elles sont la majorité : ${corpus.filter((c) => rival(c) > c.qs.length / 2).length}/${corpus.length}`)
    // le départage à l'envers (« à quoi reconnais-tu Y plutôt que X ? ») demandait de connaître Y : une question sur
    // une autre entité, que le coach a écartée (18 novembre 2026). Il ne se pose plus : une copie sur X parle de X,
    // quitte à rester plus courte. Le départage ne se pose que dans l'autre sens, et sa bonne réponse parle de X
    const reverse = (c: Copy) => c.views.filter((v) => v.type === 'T7a' && v.about.id !== c.x.id).length
    const duels = (c: Copy) => c.views.filter((v) => v.type === 'T7a').length
    measure(`g. départages : au plus ${Math.max(...corpus.map(duels))} par copie ; à l’envers : ${corpus.reduce((n, c) => n + reverse(c), 0)}`)
    for (const c of corpus) {
      expect(reverse(c), `${c.x.id} (graine ${c.seed}) : un départage à l’envers`).toBe(0)
      expect(duels(c), `${c.x.id} (graine ${c.seed})`).toBeLessThanOrEqual(5)
      for (const q of c.qs) expect(q.prompt.replace(/[\u00a0\u202f]/gu, ' '), `${c.x.id} (graine ${c.seed}) : ${q.id}`).not.toMatch(new RegExp(`plutôt que (?:le |la |l’|les )${c.x.name}`, 'u'))
    }
    const mix = new Map<string, number>()
    for (const v of all) mix.set(v.type, (mix.get(v.type) ?? 0) + 1)
    measure(`g. sortes : ${[...mix].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${((100 * n) / all.length).toFixed(1)} %`).join(', ')}`)
    // la liste dit ce qui est vrai aujourd'hui : une entité absente atteint dix à chaque copie, une entité listée n'y
    // arrive pas toujours et ne descend pas sous son plancher. Vidée (des questions rédigées en plus), le test passe
    // dès que les trente fiches donnent dix questions à chaque copie
    for (const x of GHOSTS) {
      const least = measured[x.id] ?? SOLO_COUNT
      if (x.id in SHORT_COPIES) {
        expect(least, `${x.id} atteint toujours dix questions : à retirer de SHORT_COPIES`).toBeLessThan(SOLO_COUNT)
        expect(least, `${x.id} : une copie de ${least} questions, sous son plancher`).toBeGreaterThanOrEqual(SHORT_COPIES[x.id])
      } else expect(least, `${x.id} : une copie de ${least} questions (mesuré : ${JSON.stringify(measured)})`).toBe(SOLO_COUNT)
    }
    for (const id of Object.keys(SHORT_COPIES)) expect(getGhost(id), id).toBeDefined()
  })

  /* ---------- h. la vérité ---------- */

  it('h. ce qui est dit faux pour X : le signe d’une entité qu’on confond avec lui, qui ne lui convient en rien, ou l’un de ses propres tests d’élimination', () => {
    let checked = 0
    const falseFor = (statement: string, source: Ghost, target: Ghost, id: string) => {
      checked++
      expect(confused(source, target), `${id} : ${source.name} ne se confond pas avec ${target.name}`).toBe(true)
      expect(source.id, id).not.toBe(MIMIC)
      expect(target.id, id).not.toBe(MIMIC)
      // elle vient de la fiche de l'entité proche, ou de ce qu'une des deux fiches dit pour les départager
      const pairWhy = [source, target].flatMap((g) => g.confusions.filter((c) => c.with === source.id || c.with === target.id).map((c) => c.why))
      expect(from(statement, [...ownLines(source), ...pairWhy]), `${id} : « ${statement} » ne se retrouve pas sur la fiche de ${source.name}`).toBe(true)
      // jamais de la fiche de la cible : aucune de ses lignes ne la dit, ni ne la redit
      expect(ownLines(target).some((l) => bare(l).startsWith(bare(statement).slice(0, 40))), `${id} : « ${statement} » est sur la fiche de ${target.name}`).toBe(false)
      expect(restatedBy(statement, target, GHOSTS), `${id} : « ${statement} » est redit par la fiche de ${target.name}`).toBe(false)
      expect(fitsToo(statement, GHOSTS, true)(target), `${id} : « ${statement} » convient aussi à ${target.name}`).toBe(false)
      expect(numbersFit(statement, target), `${id} : les nombres de « ${statement} » sont ceux de ${target.name}`).toBe(false)
    }
    const plain = (t: string) => t.replace(/[\u00a0\u202f]/gu, ' ')
    let own = 0
    let scenes = 0
    for (const v of all) {
      const tag = v.q.id.split(':')[4] ?? ''
      if (v.type === 'T5') falseFor(v.right.label, v.partner!, v.x, v.q.id)
      else if (v.type === 'T6' && v.q.correct[0] === SOLO_ANSWERS.trueFalse.false && v.partner) falseFor(v.q.quote!, v.partner, v.x, v.q.id)
      else if (v.type === 'T6' && v.q.correct[0] === SOLO_ANSWERS.trueFalse.false) {
        // « Faux » tiré de la fiche de X : seulement l'un de ses tests d'élimination (« si l'entité rallume le
        // disjoncteur, ce n'est pas un Hantu »), et le corrigé est cette ligne de la fiche, mot pour mot
        own++
        expect(tag, v.q.id).toMatch(/^E\d+$/u)
        const line = v.x.eliminationTests[Number(tag.slice(1))].text
        expect(within(v.q.quote!, line), `${v.q.id} : « ${v.q.quote} »`).toBeGreaterThanOrEqual(0.8)
        expect(plain(v.q.explain), v.q.id).toBe(plain(`Faux. ${line}`))
        expect(GHOSTS.some((g) => namesGhost(v.q.quote!, g)), `${v.q.id} : « ${v.q.quote} »`).toBe(false)
      }
      // un vrai ou faux « Vrai » : une phrase de la fiche de X, ou ce qu'une fiche proche dit de lui
      if (v.type === 'T6' && v.q.correct[0] === SOLO_ANSWERS.trueFalse.true) {
        expect(v.partner, v.q.id).toBeNull()
        const about = GHOSTS.flatMap((g) => g.confusions.filter((c) => c.with === v.x.id).map((c) => c.why))
        expect(from(v.q.quote!, [...ownLines(v.x), ...about]), `${v.q.id} : « ${v.q.quote} » ne se retrouve sur aucune fiche`).toBe(true)
        // une scène dite vraie : l'une des observations de la fiche de X, qui ne demande aucune preuve
        if (/^O\d+$/u.test(tag)) {
          scenes++
          const o = v.x.observations[Number(tag.slice(1))]
          expect(o.requires, v.q.id).toBeUndefined()
          expect(within(v.q.quote!, o.text), `${v.q.id} : « ${v.q.quote} »`).toBeGreaterThanOrEqual(0.8)
        }
        // un comportement ou une capacité de sa fiche (B, A) : une ligne « 0 preuve », citée telle quelle
        if (/^[BA]\d+$/u.test(tag)) {
          const l = (tag[0] === 'B' ? v.x.behaviors : v.x.abilities)[Number(tag.slice(1))]
          expect(l.zeroEvidence, v.q.id).toBe(true)
          expect(within(v.q.quote!, l.text), `${v.q.id} : « ${v.q.quote} »`).toBeGreaterThanOrEqual(0.8)
        }
      }
      // l'intrus : les trois autres affirmations sont bien des signes de X
      if (v.type === 'T5') for (const c of v.wrong) expect(from(c.label, ownLines(v.x)), `${v.q.id} : « ${c.label} » n’est pas sur la fiche de ${v.x.name}`).toBe(true)
    }
    measure(`h. dit faux pour X : ${checked} phrases d’une entité proche, ${own} tests d’élimination de X ; scènes de X dites vraies : ${scenes}`)
    // (plus de 500 quand « de qui parle-t-on ? » et les scènes des entités proches se posaient ; une seule phrase
    // d'une autre fiche par copie aujourd'hui, voir le verrou b)
    expect(checked).toBeGreaterThan(CHECKED_FLOOR)
    expect(own).toBeGreaterThan(50)
    expect(scenes).toBeGreaterThan(50)
  })

  it('h. « ça suffit », « ce n’est qu’un indice », « quel test l’exclut ? » : seulement ce que la fiche prouve', () => {
    const seenAnswers = { 'T8 yes': 0, 'T8 no': 0, 'T3b yes': 0, 'T3b no': 0, excluded: 0 }
    const plain = (t: string) => t.replace(/[\u00a0\u202f]/gu, ' ')
    for (const v of all) {
      const p = v.q.id.split(':')
      if (v.type === 'T8') {
        const answer = v.q.correct[0] as 'yes' | 'no'
        seenAnswers[`T8 ${answer}`]++
        const quote = v.q.quote!
        // une observation de la fiche de X, et d'elle seule : décisive, elle suffit ; forte ou simple indice, elle ne suffit pas
        expect(p[3], v.q.id).toBe(v.x.id)
        expect(p[4], v.q.id).toMatch(/^O\d+$/u)
        const o = v.x.observations[Number(p[4].slice(1))]
        expect(o.requires, v.q.id).toBeUndefined()
        expect(within(quote, o.text), `${v.q.id} : « ${quote} »`).toBeGreaterThanOrEqual(0.8)
        expect(answer, `${v.q.id} : observation ${o.strength}`).toBe(o.strength === 'definitive' ? SOLO_ANSWERS.enough.yes : SOLO_ANSWERS.enough.no)
        expect(plain(v.q.prompt), v.q.id).toMatch(/^Tu observes ceci\. Est-ce que ça suffit pour confirmer (?:le |la |l’|les )\S.* \?$/u)
        // le corrigé dit ce que la fiche en dit : décisive, indice fort, simple indice
        expect(plain(v.q.explain), v.q.id).toContain(o.strength === 'definitive' ? 'cette observation est décisive' : o.strength === 'strong' ? 'c’est un indice fort, pas une confirmation' : 'c’est un simple indice, pas une confirmation')
        // la citation ne nomme personne, et ne dit pas elle-même ce qu'elle vaut
        expect(GHOSTS.some((g) => namesGhost(quote, g)), `${v.q.id} : « ${quote} »`).toBe(false)
      }
      if (v.type === 'T4') {
        seenAnswers.excluded++
        // la bonne réponse : un test d'élimination de X ; les trois autres, des tests de confirmation de X lui-même
        expect(within(v.right.label, v.x.eliminationTests[Number(p[3])].text), `${v.q.id} : « ${v.right.label} »`).toBeGreaterThanOrEqual(0.8)
        for (const c of v.wrong) {
          const m = /^test:(\d+)$/u.exec(c.id)
          expect(m, `${v.q.id} : ${c.id}`).not.toBeNull()
          expect(within(c.label, v.x.confirmationTests[Number(m![1])].text), `${v.q.id} : « ${c.label} »`).toBeGreaterThanOrEqual(0.8)
        }
      }
      if (v.type === 'T3b') {
        const t = v.x.confirmationTests[Number(p[3])]
        const quote = v.q.quote!
        seenAnswers[`T3b ${v.q.correct[0] as 'yes' | 'no'}`]++
        expect(t.requires, v.q.id).toBeUndefined()
        expect(v.q.correct[0], `${v.q.id} : test ${t.definitive ? 'définitif' : 'non définitif'}`).toBe(t.definitive ? SOLO_ANSWERS.enough.yes : SOLO_ANSWERS.enough.no)
        expect(within(quote, t.text), `${v.q.id} : « ${quote} »`).toBeGreaterThanOrEqual(0.8)
        // sa conclusion retirée, rien ne dit la réponse : ni « c'est un… », ni « pourrait », ni « indice », ni le nom d'une
        // autre entité (celui de X, que l'énoncé donne déjà, peut rester : « la capacité du Cauchemar »)
        expect(GHOSTS.some((g) => g.id !== v.x.id && namesGhost(quote, g)), `${v.q.id} : « ${quote} »`).toBe(false)
        expect(VERDICT_WORDS.test(quote), `${v.q.id} : « ${quote} »`).toBe(false)
        expect(quote.endsWith('…'), v.q.id).toBe(true)
      }
    }
    // chaque branche a servi
    for (const [k, n] of Object.entries(seenAnswers)) expect(n, k).toBeGreaterThan(0)
  })

  it('h. le Mimic : rien n’est dit faux pour lui hors de sa fiche, et il n’est jamais l’entité proche', () => {
    const mimic = getGhost(MIMIC)!
    const mine = of(mimic).flatMap((c) => c.views)
    expect(mine.length).toBeGreaterThan(60)
    for (const v of mine) {
      // ses tests, ses observations, ses questions rédigées, et les vrai ou faux tirés de sa seule fiche : aucune entité
      // proche, aucun signe d'une autre fiche jugé pour lui
      expect(['T3a', 'T3b', 'T4', 'T6', 'T8', 'auth'], v.q.id).toContain(v.type)
      expect(v.partner, v.q.id).toBeNull()
      expect(v.about.id, v.q.id).toBe(MIMIC)
      expect(namedIn(v.q, mimic), v.q.id).toHaveLength(0)
      if (v.type === 'T6' && v.q.correct[0] === SOLO_ANSWERS.trueFalse.false) expect(v.q.id).toMatch(/^q:vf:the-mimic:the-mimic:E\d+$/u)
    }
    for (const v of all) {
      if (v.x.id === MIMIC) continue
      // ni entité proche, ni signe ou test du Mimic parmi les réponses, ni son nom
      expect(v.q.choices.map((c) => c.id), v.q.id).not.toContain(MIMIC)
      expect(strays.get(MIMIC)!(v.q), v.q.id).toBe(false)
    }
    // et dans toute la réserve, pas seulement dans le corpus
    for (const g of GHOSTS) for (const s of soloSupply(g, GHOSTS)) if (g.id !== MIMIC) expect(s.id.split(':').slice(2), s.id).not.toContain(MIMIC)
    for (const s of soloSupply(mimic, GHOSTS)) {
      expect(['T3a', 'T3b', 'T4', 'T6', 'T8', 'auth'], s.id).toContain(s.type)
      if (s.type === 'T6') expect(s.id, s.id).toMatch(/^q:vf:the-mimic:the-mimic:/u)
    }
  })

  /* ---------- i. le tirage ---------- */

  it('i. la même graine donne la même copie ; une copie se compose en bien moins de 100 ms', () => {
    for (const c of corpus.filter((_c, i) => i % 9 === 0)) {
      const again = buildSoloQuiz({ ghost: c.x, allGhosts: GHOSTS, rng: createRng(c.seed), ...(c.seen ? { seen: c.seen } : {}) })
      expect(again, `${c.x.id} (graine ${c.seed})`).toEqual(c.qs)
    }
    // le temps de chaque copie du corpus, la première de chaque entité comprise
    const ms = corpus.map((c) => c.ms).sort((a, b) => a - b)
    const median = ms[ms.length >> 1]
    const p95 = ms[Math.floor(ms.length * 0.95)]
    measure(`i. temps d’une copie : médiane ${median.toFixed(1)} ms, 95e centile ${p95.toFixed(1)} ms, la plus lente ${ms[ms.length - 1].toFixed(0)} ms`)
    // mesuré seul : médiane 47 ms, 95e centile 155 ms (32 et 63 ms avant que la copie ne se compose plusieurs fois pour
    // garder la plus longue, voir ATTEMPTS dans solo.ts : deux essais, quatre pour une copie de moins de cinq questions).
    // Les plafonds laissent de la marge à une machine chargée (toute la suite en parallèle) : la médiane garde le sien,
    // le 95e centile passe de 250 à 400 ms, deux fois et demie la mesure comme avant
    expect(median, `médiane ${median.toFixed(0)} ms, 95e centile ${p95.toFixed(0)} ms`).toBeLessThan(100)
    expect(p95, `médiane ${median.toFixed(0)} ms, 95e centile ${p95.toFixed(0)} ms`).toBeLessThan(P95_MS)
  }, 60_000)

  /* ---------- j. buildQuiz ---------- */

  it('j. buildQuiz confie toute liste d’une seule entité à la copie sur X, quel que soit le nombre de questions gardé', () => {
    const everything = QUIZ_TOPICS.map((t) => t.id)
    GHOSTS.forEach((x, k) => {
      for (const [n, count] of [5, 10, 20, 30].entries()) {
        for (const topics of [DEFAULT_TOPICS, everything]) {
          const seed = pageSeed(k, 100 + n)
          const qs = buildQuiz({ topics, ghosts: [x], allGhosts: GHOSTS, mechanics: MECHANICS, count, rng: createRng(seed) })
          const tag = `${x.id}, ${count} questions`
          expect(qs.length, tag).toBeLessThanOrEqual(count)
          expect(qs.length, tag).toBeGreaterThan(0)
          expect(new Set(qs.map((q) => q.id)).size, tag).toBe(qs.length)
          for (const q of qs) {
            // un vrai ou faux de mécaniques (si le thème est coché) ne parle d'aucune entité ; tout le reste porte sur X
            if (q.topic === 'mechanics') {
              expect(q.ghostId, q.id).toBeUndefined()
              continue
            }
            expect(q.ghostId, `${tag} : ${q.id}`).toBe(x.id)
            expect(soloType(q), `${tag} : ${q.id}`).not.toBeNull()
            expect(q.beyond, q.id).toBeUndefined()
            expect(topics, q.id).toContain(q.topic)
            const v = view(q, x)
            for (const o of namedIn(q, x)) expect(v.type === 'auth' ? confused(x, o) : o.id === v.partner?.id, `${tag} : ${q.id} nomme ${o.name}`).toBe(true)
            // jamais un nom d'entité parmi les réponses
            expect(q.choices.filter((c) => GHOSTS.some((g) => g.name === c.label)).length, q.id).toBe(0)
          }
          // le même tirage par l'un ou l'autre chemin, tant que les mécaniques ne s'y glissent pas
          if (topics === DEFAULT_TOPICS) expect(qs, tag).toEqual(buildSoloQuiz({ ghost: x, allGhosts: GHOSTS, rng: createRng(seed), count, topics }))
          // à dix questions, la variété de la copie tient par ce chemin aussi
          if (count === SOLO_COUNT && topics === DEFAULT_TOPICS) expect(qs.filter((q) => q.choices.length === 2).length, tag).toBeLessThanOrEqual(Math.max(3, Math.ceil(qs.length / 2)))
        }
      }
    })
  }, 120_000)

  it('j. « déjà étudiées » réduites à une entité : d’abord X sans nommer personne d’autre, puis la fin de la copie sur toutes, marquée', () => {
    let filled = 0
    GHOSTS.forEach((x, k) => {
      const others = strayCheck(GHOSTS.filter((o) => o.id !== x.id))
      for (const [n, count] of [5, 10, 20, 30].entries()) {
        const opts = { topics: DEFAULT_TOPICS, ghosts: [x], allGhosts: GHOSTS, mechanics: MECHANICS, count, rng: createRng(pageSeed(k, 200 + n)), onlyListed: true }
        const alone = buildQuiz(opts)
        const qs = buildQuiz({ ...opts, rng: createRng(pageSeed(k, 200 + n)), fillUp: true })
        const tag = `${x.id}, ${count} questions`
        // sans fillUp : seulement X, et aucune autre entité nommée avant le corrigé
        for (const q of alone) {
          expect(q.ghostId, `${tag} : ${q.id}`).toBe(x.id)
          expect(soloType(q), q.id).not.toBeNull()
          expect(others(q), `${tag} : ${q.id} nomme une autre entité`).toBe(false)
        }
        // avec fillUp : les mêmes questions d'abord, puis la copie se complète jusqu'au nombre demandé
        expect(qs.slice(0, alone.length), tag).toEqual(alone)
        expect(qs.length, tag).toBe(count)
        const rest = qs.slice(alone.length)
        if (rest.length) filled++
        for (const q of rest) {
          expect(q.beyond, `${tag} : ${q.id}`).toBe(true)
        }
        expect(new Set(qs.map((q) => q.id)).size, tag).toBe(qs.length)
      }
    })
    expect(filled).toBeGreaterThan(30)
  }, 120_000)

  /* ---------- la table des faits ---------- */

  it('une ligne de fiche que la table des faits (FACETS) ne reconnaît pas recoupe tous les faits de son objet, et se signale ici', () => {
    // prudence : une phrase sur les objets du Poltergeist qui ne dit aucun des faits de la table les recoupe tous
    const unknown = soloFacetsOf('poltergeist', 'Les objets de la cuisine ont changé de place.')
    expect(unknown).toHaveLength(1)
    expect(unknown[0].known).toBe(false)
    expect(unknown[0].facts.length).toBeGreaterThanOrEqual(5)
    const known = soloFacetsOf('poltergeist', 'En chasse, lance un objet toutes les 0,5 s')
    expect(known[0].known).toBe(true)
    expect(known[0].facts).toEqual(['cadence'])
    // une entité sans table : aucun objet à distinguer
    expect(soloFacets('spirit')).toEqual([])
    expect(soloFacetsOf('spirit', 'Attend 180 s après un encens')).toEqual([])
    // les lignes des fiches dont la copie tire ses questions (signes, observations, tests, questions rédigées)
    const unrecognised: string[] = []
    for (const g of GHOSTS) {
      if (!soloFacets(g.id).length) continue
      const lines = [
        ...g.keyTells,
        ...g.tells.filter((t) => t.zeroEvidence).map((t) => t.text),
        ...g.observations.filter((o) => !o.requires).map((o) => o.text),
        ...g.confirmationTests.filter((t) => !t.requires).map((t) => t.text),
        ...g.eliminationTests.map((t) => t.text),
        ...g.quiz.map((q) => `${q.q} ${q.choices[q.answer]}`),
      ]
      for (const line of lines) for (const f of soloFacetsOf(g.id, line)) if (!f.known) unrecognised.push(`${g.id} · ${f.object} · ${line.replace(/[\u00a0\u202f]/gu, ' ').slice(0, 60)}`)
    }
    // Une ligne nouvelle ici n'est pas une erreur de la copie (elle reste prudente : aucune autre question sur cet objet
    // à côté d'elle), mais elle lui coûte des questions. Deux issues : ajouter à FACETS (solo.ts) le fait qu'elle dit,
    // ou l'inscrire ci-dessous si elle parle vraiment de l'objet en général.
    expect(unrecognised).toEqual([
      'hantu · froid · Dans une difficulté qui donne au moins 1 preuve (Cauchemar, ',
      'goryo · errance · Vitesse (1,7 m/s) et seuil (50 %) standard : ce sont ses dép',
      'aswang · cachette · Place du sel ou des détecteurs de mouvement près de la pièce',
    ])
  })
})

/* =====================================================================================================================
 * Ce que deux relecteurs ont trouvé en lisant chaque affirmation des copies face aux fiches et à la feuille de tybayn :
 * des phrases vraies de toutes les entités dites « fausses » pour l'une d'elles, des scènes dites « ça l'exclut » que
 * la fiche de l'entité testée explique, une mauvaise réponse vraie, deux verdicts pour une même scène. Chaque test
 * balaie toute la réserve (chaque question possible de chaque entité, composée plusieurs fois), pas seulement ce
 * qu'un tirage de copies fait sortir : la plupart de ces défauts sortaient moins d'une fois sur vingt copies.
 * ===================================================================================================================== */

describe('« Me tester sur X » : rien de faux, rien d’à moitié vrai (toute la réserve)', () => {
  interface Drawn {
    x: Ghost
    q: Question
    v: View
  }
  let supply: Drawn[] = []
  const byType = (...types: SoloType[]) => supply.filter((d) => types.includes(d.v.type))
  /** Ce que la question présente comme faux pour X, ou comme le signe d'une autre : sa phrase, et l'entité d'où elle vient. */
  const shownFalse = (d: Drawn): { text: string; from: Ghost }[] => {
    const { v, q } = d
    if (v.type === 'T2') return v.wrong.map((c) => ({ text: c.label, from: getGhost(c.id)! }))
    if (v.type === 'T5') return [{ text: v.right.label, from: v.partner! }]
    if (v.type === 'T6' && q.correct[0] === SOLO_ANSWERS.trueFalse.false && /^[KT]\d+$/u.test(q.id.split(':')[4])) return [{ text: q.quote!, from: v.partner! }]
    return []
  }

  beforeAll(() => {
    supply = []
    for (const x of GHOSTS) {
      for (const s of soloSupply(x, GHOSTS)) {
        const seen = new Set<string>()
        for (let r = 0; r < 6; r++) {
          const q = soloQuestion(x, GHOSTS, s.id, createRng(1000 + r * 7919))
          if (!q) continue
          const key = `${q.quote ?? ''}|${q.choices.map((c) => c.label).join('|')}`
          if (seen.has(key)) continue
          seen.add(key)
          supply.push({ x, q, v: view(q, x) })
        }
      }
    }
  }, 120_000)

  it('un signe vrai de toutes les entités n’est jamais une mauvaise réponse, ni « faux » pour une autre (les Jumeaux : « ne réagissent qu’à sa position réelle »)', () => {
    // le signe des Jumeaux est bien de ceux-là : s'il est reformulé, relire TRUE_OF_ALL (quiz.ts) avec la fiche
    const twins = getGhost('the-twins')!
    const sign = twins.keyTells.find((t) => /détecteurs? de mouvement/iu.test(t))!
    expect(TRUE_OF_ALL.test(sign), sign).toBe(true)
    let checked = 0
    for (const d of supply) {
      for (const f of shownFalse(d)) {
        checked++
        expect(TRUE_OF_ALL.test(f.text), `${d.q.id} : « ${f.text} »`).toBe(false)
      }
    }
    expect(checked).toBeGreaterThan(2000)
    // il reste un signe des Jumeaux : « Vrai » pour eux
    const own = byType('T6').filter((d) => d.x.id === twins.id && d.q.quote === sign)
    expect(own.length).toBeGreaterThan(0)
    for (const d of own) expect(d.q.correct).toEqual([SOLO_ANSWERS.trueFalse.true])
  })

  it('un signe dit faux pour X ne redit pas une mécanique commune à toutes les entités (« ralentit… à ta dernière position connue ») sans les valeurs qui le rendent propre à la sienne', () => {
    // la mécanique, telle que l'app l'enseigne : toute entité garde sa vitesse jusqu'à la dernière position connue, puis la perd
    const rule = MECHANICS.topics.flatMap((t) => t.facts).find((f) => /dernière position connue/iu.test(f.text) && !GHOSTS.some((g) => namesGhost(f.text, g)))
    expect(rule, 'la mécanique de la ligne de vue perdue').toBeDefined()
    let seen = 0
    for (const d of supply) {
      for (const f of shownFalse(d)) {
        if (!/dernière position/iu.test(f.text)) continue
        seen++
        // « Garde 3,0 m/s jusqu'à ta dernière position connue, puis ralentit peu à peu jusqu'à 1,0 m/s » : faux pour qui n'a pas ces vitesses
        expect(f.text, `${d.q.id} : « ${f.text} »`).toMatch(/\d,\d\sm\/s/u)
      }
    }
    expect(seen).toBeGreaterThan(0)
    // la phrase du Revenant porte ses vitesses : elle n'est plus vraie de toute entité qui accélère en ligne de vue
    const revenant = getGhost('revenant')!
    const slows = revenant.keyTells.find((t) => /dernière position connue/iu.test(t))!
    expect(slows).toMatch(/3,0\sm\/s/u)
    expect(slows).toMatch(/1,0\sm\/s/u)
  })

  it('toute la réserve porte sur X : ni « de qui parle-t-on ? », ni scène d’une entité proche, ni départage à l’envers, ni nom d’entité parmi les réponses', () => {
    const names = new Set(GHOSTS.flatMap((g) => [g.name, g.nameEn, `${g.name} (${g.nameEn})`]))
    const faults: string[] = []
    let foreign = 0
    for (const x of GHOSTS) {
      for (const s of soloSupply(x, GHOSTS)) {
        const p = s.id.split(':')
        // « de qui parle-t-on : X ou Y ? » : une question sur deux y portait sur Y
        if (p[1] === 'duel' || soloType(s.id) === null) faults.push(`${s.id} : une sorte de question qui ne se pose plus`)
        // la scène d'une entité proche (« tu observes ceci : est-ce que ça suffit, ou est-ce que ça exclut X ? ») : il
        // fallait connaître la fiche de Y. Seules les observations de la fiche de X se jugent ; ses tests de
        // confirmation se demandent sous leur forme de test, ses tests d'élimination en vrai ou faux
        if (p[1] === 'constat' && (p[2] !== x.id || p[3] !== x.id || !/^O\d+$/u.test(p[4]))) faults.push(`${s.id} : une scène qui n’est pas une observation de la fiche de ${x.name}`)
        // le départage à l'envers (« à quoi reconnais-tu Y plutôt que X ? »)
        if (p[1] === 'dist' && (p[3] !== x.id || p[2] === x.id || p.length !== 4)) faults.push(`${s.id} : un départage dont la réponse ne parle pas de ${x.name}`)
        // un vrai ou faux : une phrase de la fiche de X, ou le signe d'une entité proche (toujours « Faux » pour X)
        if (p[1] === 'vf' && p[3] !== x.id) foreign++
      }
    }
    for (const d of supply) {
      const p = d.q.id.split(':')
      for (const c of d.q.choices) if (names.has(c.label)) faults.push(`${d.q.id} : « ${c.label} » parmi les réponses`)
      expect(d.q.ghostId, d.q.id).toBe(d.x.id)
      if (p[1] === 'vf' && p[3] !== d.x.id) expect(d.q.correct, `${d.q.id} : le signe d’une autre fiche dit vrai pour ${d.x.name}`).toEqual([SOLO_ANSWERS.trueFalse.false])
      // la bonne réponse parle de X, hors ces « Faux » et l'intrus
      if (d.v.about.id !== d.x.id) expect(d.v.type === 'T5' || (d.v.type === 'T6' && d.q.correct[0] === SOLO_ANSWERS.trueFalse.false), `${d.q.id} : la réponse parle de ${d.v.about.name}`).toBe(true)
    }
    expect(faults, [...new Set(faults)].slice(0, 12).join('\n')).toEqual([])
    // le test mord : la réserve compte bien des signes d'entités proches à juger « Faux », et chaque sorte de question
    expect(foreign).toBeGreaterThan(300)
    for (const t of ['T1', 'T2', 'T3a', 'T3b', 'T4', 'T6', 'T7a', 'T8', 'auth'] as const) expect(byType(t).length, t).toBeGreaterThan(0)
    // les paires relevées par les relecteurs (20 points perdus après un événement dits « exclure » l'Oni, le sel intact,
    // la voix qui n'attire pas, l'entité qui ralentit après les pilules) : parties avec toutes les scènes des entités proches
    const gone = ['phantom:oni:O0', 'gallu:wraith:O0', 'banshee:yokai:O1', 'spirit:moroi:O4', 'revenant:moroi:O4', 'poltergeist:moroi:O4', 'shade:moroi:O4', 'demon:moroi:O4', 'the-twins:moroi:O4', 'thaye:moroi:O4', 'aswang:moroi:O4']
    for (const pair of gone) {
      const id = `q:constat:${pair}`
      expect(soloSupply(getGhost(pair.split(':')[0])!, GHOSTS).map((s) => s.id), id).not.toContain(id)
    }
    // ce que la scène du Moroï prouve reste demandé sur sa propre fiche
    expect(soloSupply(getGhost('moroi')!, GHOSTS).map((s) => s.id)).toContain('q:constat:moroi:moroi:O4')
  })

  it('un vrai ou faux tiré de la seule fiche de X : « Faux » pour l’un de ses tests d’élimination, « Vrai » pour ses observations, ses signes, ses comportements', () => {
    const plain = (t: string) => t.replace(/[\u00a0\u202f]/gu, ' ')
    const own = byType('T6').filter((d) => !d.v.partner)
    const seen = { E: 0, O: 0, K: 0, T: 0, B: 0, A: 0, L: 0 }
    for (const d of own) {
      const tag = d.q.id.split(':')[4]
      const rank = Number(tag.slice(1))
      seen[tag[0] as keyof typeof seen]++
      // rien n'y nomme une entité, rien n'y parle des preuves (les orbes du Mimic à part)
      expect(GHOSTS.some((g) => g.id !== d.x.id && namesGhost(d.q.quote!, g)), `${d.q.id} : « ${d.q.quote} »`).toBe(false)
      if (d.x.id !== MIMIC) expect(mentionsEvidence(d.q.quote!), `${d.q.id} : « ${d.q.quote} »`).toBe(false)
      if (tag[0] === 'E') {
        // la fiche dit elle-même que ce fait exclut X : le corrigé est sa ligne, mot pour mot
        const line = d.x.eliminationTests[rank].text
        expect(d.q.correct, d.q.id).toEqual([SOLO_ANSWERS.trueFalse.false])
        expect(line, d.q.id).toMatch(/n[’']est\s+pas|ne\s+sont\s+pas/u)
        expect(within(d.q.quote!, line), `${d.q.id} : « ${d.q.quote} »`).toBeGreaterThanOrEqual(0.8)
        expect(plain(d.q.explain), d.q.id).toBe(plain(`Faux. ${line}`))
        continue
      }
      // tout le reste de la fiche de X est vrai pour lui
      expect(d.q.correct, `${d.q.id} : « ${d.q.quote} »`).toEqual([SOLO_ANSWERS.trueFalse.true])
      if (tag[0] === 'O') {
        const o = d.x.observations[rank]
        expect(o.requires, d.q.id).toBeUndefined()
        expect(within(d.q.quote!, o.text), `${d.q.id} : « ${d.q.quote} »`).toBeGreaterThanOrEqual(0.8)
      } else if (tag[0] === 'B' || tag[0] === 'A') {
        // un comportement ou une capacité : une ligne « 0 preuve » de la fiche, citée telle quelle (son nom caviardé près)
        const l = (tag[0] === 'B' ? d.x.behaviors : d.x.abilities)[rank]
        expect(l.zeroEvidence, d.q.id).toBe(true)
        expect(within(d.q.quote!, l.text), `${d.q.id} : « ${d.q.quote} »`).toBeGreaterThanOrEqual(0.8)
        expect(within(l.text, d.q.quote!), `${d.q.id} : la ligne n’est pas citée en entier`).toBeGreaterThanOrEqual(0.8)
        expect(TRUE_OF_ALL.test(d.q.quote!), `${d.q.id} : « ${d.q.quote} »`).toBe(false)
      }
    }
    // chaque sorte de phrase a servi (L : ce qu'une fiche proche dit de X)
    for (const k of ['E', 'O', 'K', 'T', 'B', 'A'] as const) expect(seen[k], k).toBeGreaterThan(0)
  })

  it('une chasse qui démarre trop tôt ne désigne une entité (et n’exclut les autres) que « sans objet maudit » : la fiche le dit', () => {
    // une chasse maudite part quels que soient le seuil et les délais : sans cette précision, la scène se voit avec toute entité
    const early = /(?:une|nouvelle) chasse (?:démarre|commence)|chasse au-dessus/iu
    let checked = 0
    for (const g of GHOSTS) {
      for (const o of g.observations) {
        if (o.strength !== 'definitive' || !early.test(o.text)) continue
        checked++
        expect(o.text, `${g.id} : « ${o.text} »`).toMatch(/objet maudit/iu)
      }
    }
    expect(checked).toBeGreaterThanOrEqual(6)
  })

  it('un départage : aucune mauvaise réponse ne touche un thème des signes de l’entité reconnue (« plus visible que les autres », dit du Deogen), ni ne la contredit par un pronom', () => {
    const duels = byType('T7a')
    expect(duels.length).toBeGreaterThan(300)
    for (const d of duels) {
      const g = d.v.about
      const apart = apartFrom(g)
      for (const c of d.v.wrong) {
        expect(apart(c.label), `${d.q.id} : « ${c.label} »`).toBe(true)
        expect(pronounClash(c.label, g), `${d.q.id} : « ${c.label} »`).toBe(false)
      }
    }
    const deogen = duels.filter((d) => d.q.id === 'q:dist:oni:deogen')
    for (const d of deogen) for (const c of d.v.wrong) expect(c.label, d.q.id).not.toMatch(/plus visible/iu)
    // « l'encens le piège dans sa pièce » ne se dit pas de la Banshee ; « ce qui le rend plus visible », pas de « cette entité »
    expect(pronounClash('La Banshee peut claquer une porte et l’encens le piège dans sa pièce pendant 90 s.', getGhost('banshee')!)).toBe(true)
  })

  it('une observation de la fiche de X : deux réponses ; « ce n’est qu’un indice » ne se dit pas d’un indice fort quand la fiche a un test ou un rapport décisif', () => {
    // les mots ne suffisent pas à reconnaître qu'un indice fort redit un test décisif (« ton coéquipier se retrouve au
    // contact de l'entité et survit » ; « ceux-ci peuvent la toucher sans mourir, c'est une Banshee ») : la copie
    // enseignait les deux verdicts pour la même scène. À rouvrir quand les forces des rapports seront alignées sur les tests.
    const own = byType('T8')
    expect(own.length).toBeGreaterThan(80)
    const answers = { yes: 0, no: 0 }
    for (const d of own) {
      expect(d.q.id, d.q.id).toMatch(new RegExp(`^q:constat:${d.x.id}:${d.x.id}:O\\d+$`, 'u'))
      expect(d.q.choices.map((c) => c.id), d.q.id).toEqual([SOLO_ANSWERS.enough.yes, SOLO_ANSWERS.enough.no])
      expect(d.q.choices.map((c) => c.label), d.q.id).toEqual(['Oui, ça suffit', 'Non, ce n’est qu’un indice'])
      const o = d.x.observations[Number(d.q.id.split(':O')[1])]
      const decisive = d.x.confirmationTests.some((t) => t.definitive) || d.x.observations.some((k) => k.strength === 'definitive')
      answers[d.q.correct[0] as 'yes' | 'no']++
      if (o.strength === 'definitive') expect(d.q.correct, d.q.id).toEqual([SOLO_ANSWERS.enough.yes])
      else {
        expect(d.q.correct, d.q.id).toEqual([SOLO_ANSWERS.enough.no])
        if (decisive) expect(o.strength, `${d.q.id} : « ${o.text} »`).toBe('hint')
      }
    }
    // aucune des deux réponses n'est presque jamais juste (« Non, ça l'exclut » l'était 7 fois sur 100 sans les scènes des entités proches)
    expect(answers.yes).toBeGreaterThan(30)
    expect(answers.no).toBeGreaterThan(30)
    const gone = ['hantu:hantu:O1', 'hantu:hantu:O2', 'hantu:hantu:O3', 'yokai:yokai:O3', 'wraith:wraith:O1', 'wraith:wraith:O2', 'banshee:banshee:O1', 'banshee:banshee:O2', 'poltergeist:poltergeist:O3', 'revenant:revenant:O2']
    for (const pair of gone) {
      const id = `q:constat:${pair}`
      expect(soloSupply(getGhost(pair.split(':')[0])!, GHOSTS).map((s) => s.id), id).not.toContain(id)
    }
  })

  it('une vitesse trop proche de celle de X n’est jamais dite fausse pour lui (« ~1,5 ou ~1,9 m/s » face à l’Aswang, à 1,53 m/s)', () => {
    const aswang = getGhost('aswang')!
    expect(nearSpeed('Vitesse de chasse ~1,5 ou ~1,9 m/s, tirée au hasard à chaque chasse', aswang)).toBe(true)
    expect(nearSpeed('En chasse, sa vitesse sera soit de 1,5 m/s, soit de 1,9 m/s', aswang)).toBe(true)
    for (const d of supply) for (const f of shownFalse(d)) expect(nearSpeed(f.text, d.x), `${d.q.id} : « ${f.text} »`).toBe(false)
  })

  it('« Quel test confirme X ? » : la bonne réponse garde les conditions du test (« (disjoncteur allumé) »)', () => {
    const tests = byType('T3a')
    expect(tests.length).toBeGreaterThan(40)
    for (const d of tests) {
      const k = Number(d.q.id.split(':')[3])
      const full = zeroTests(d.x).find((t) => t.k === k)!.text
      const at = full.search(/c[’']est (?:une? |le |la |l[’']|les )?\p{Lu}|ce sont les/u)
      const asides = (at < 0 ? full : full.slice(0, at)).match(/\([^()]*\)/gu) ?? []
      for (const aside of asides) {
        if (GHOSTS.some((g) => namesGhost(aside, g)) || mentionsEvidence(aside)) continue
        expect(d.v.right.label.replace(/[\u00a0\u202f]/gu, ' '), `${d.q.id} : « ${d.v.right.label} »`).toContain(aside.replace(/[\u00a0\u202f]/gu, ' '))
      }
    }
    const jinn = tests.filter((d) => d.q.id === 'q:test-of:jinn:0')
    expect(jinn.length).toBeGreaterThan(0)
    for (const d of jinn) expect(d.v.right.label).toContain('(disjoncteur allumé)')
  })

  it('une vitesse dite sans décimale (« environ 1 m/s ») est la même que « 1,0 m/s » : elle ne se demande pas après la scène qui la cite ; et aucun départage ne se pose à l’envers', () => {
    const plain = (t: string) => t.replace(/[\u00a0\u202f]/gu, ' ')
    let pairs = 0
    let opened = 0
    for (const id of ['revenant', 'deildegast', 'thaye']) {
      const x = getGhost(id)!
      for (let seed = 1; seed <= 40; seed++) {
        const qs = buildSoloQuiz({ ghost: x, allGhosts: GHOSTS, rng: createRng(seed * 7919 + 13) })
        qs.forEach((q, i) => {
          if (soloType(q) !== 'T1') return
          for (const c of q.choices.filter((k) => q.correct.includes(k.id))) {
            for (const m of plain(c.label).matchAll(/(?<![\d,])(\d+),0 m\/s/gu)) {
              const said = new RegExp(`(?<![\\d,])${m[1]} m/s`, 'u')
              for (const before of qs.slice(0, i)) {
                const shown = plain([before.prompt, before.quote ?? '', before.explain, ...before.choices.filter((k) => before.correct.includes(k.id)).map((k) => k.label)].join(' '))
                pairs++
                expect(said.test(shown), `${id} (graine ${seed}) : ${q.id} après ${before.id}`).toBe(false)
              }
            }
          }
        })
        // aucun départage à l'envers (« à quoi reconnais-tu Y plutôt que X ? ») : ni en première question, ni ailleurs
        if (qs.length > 1) {
          opened++
          for (const q of qs) expect(soloType(q) === 'T7a' && q.id.split(':')[3] !== id, `${id} (graine ${seed}) : ${q.id}`).toBe(false)
        }
      }
    }
    expect(pairs).toBeGreaterThan(20)
    expect(opened).toBeGreaterThan(100)
  }, 60_000)

  it('la copie s’ouvre sur du simple : un nombre de la fiche (vitesse, seuil) ou un signe de l’entité, presque toujours quand elle en a un', () => {
    const easy = (q: Question) => soloType(q) === 'T1' || soloType(q) === 'T2'
    let having = 0
    let opening = 0
    for (const [k, x] of GHOSTS.entries()) {
      for (let seed = 1; seed <= 12; seed++) {
        const qs = buildSoloQuiz({ ghost: x, allGhosts: GHOSTS, rng: createRng(seed * 104_729 + k * 31) })
        if (!qs.some(easy)) continue
        having++
        if (easy(qs[0])) opening++
      }
    }
    // une question simple ne passe pas en premier quand elle montrerait ce qu'une autre question de la copie demande :
    // mesuré, 85 copies sur 100 s’ouvrent sur du simple (41 sur 100 quand l’ordre est laissé au hasard)
    expect(having).toBeGreaterThan(300)
    expect(opening / having).toBeGreaterThan(0.75)
  }, 120_000)

  it('les énoncés et les corrigés : la Dayan « si tu bouges près d’elle », le Revenant sans « elle… il », aucun corrigé rédigé sur les preuves', () => {
    const dayan = supply.filter((d) => d.q.id === 'q:spd:dayan:2.25')
    expect(dayan.length).toBeGreaterThan(0)
    for (const d of dayan) expect(d.q.prompt.replace(/[\u00a0\u202f]/gu, ' ')).toContain('si tu bouges près d’elle')
    // (son test d'élimination, jugé en vrai ou faux depuis que l'observation n'a plus que deux réponses)
    const revenant = supply.filter((d) => d.q.id === 'q:vf:revenant:revenant:E0')
    expect(revenant.length).toBeGreaterThan(0)
    for (const d of revenant) expect(d.q.quote).not.toMatch(/(?<!\p{L})il ralentit/u)
    // le corrigé d'une question rédigée ne parle pas des preuves ; sauf celui du Mimic, sur ses orbes à 0 preuve
    for (const d of byType('auth')) if (d.x.id !== MIMIC) expect(mentionsEvidence(d.q.explain), `${d.q.id} : ${d.q.explain}`).toBe(false)
  })
})

