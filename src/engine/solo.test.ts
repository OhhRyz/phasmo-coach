import { beforeAll, describe, expect, it } from 'vitest'
// solo.ts d'abord, avant quiz.ts : les deux modules s'importent l'un l'autre, et rien ne doit en dépendre au chargement
import { buildSoloQuiz, soloFacets, soloFacetsOf, soloFacts, soloQuestion, soloSupply, soloType, SOLO_ANSWERS, SOLO_COUNT, type SoloType } from './solo'
import { GHOSTS, MECHANICS, getGhost } from '../data'
import type { Ghost } from '../data/types'
import { evidenceIn, fitsToo, isEvidenceList, mentionsEvidence, MIMIC, namesGhost, needsEvidence, numbersFit, restatedBy, zeroTests } from './cards'
import { redactGhostName } from './format'
import { apartFrom, buildQuiz, DEFAULT_TOPICS, factKeys, hints, homogeneous, NARROW, nearSpeed, OBJECT_MASC, pronounClash, QUIZ_TOPICS, strayCheck, themesOf, TRUE_OF_ALL, type Choice, type Question } from './quiz'
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
    expect(direct.length).toBeGreaterThan(5)
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

  it('rien n’est jamais présenté comme faux pour le Mimic, ni comme l’excluant, hors de sa propre fiche', () => {
    const mimic = getGhost('the-mimic')!
    const types = new Set(soloSupply(mimic, GHOSTS).map((s) => s.type))
    for (const t of ['T2', 'T5', 'T6', 'T7a', 'T7b'] as const) expect(types.has(t), t).toBe(false)
    for (const s of soloSupply(mimic, GHOSTS)) {
      const q = soloQuestion(mimic, GHOSTS, s.id, createRng(3))
      // « Non, ça l'exclut » : seulement son propre test d'élimination (pas d'orbes dans la pièce favorite)
      if (q && s.type === 'T8' && q.correct[0] === 'excludes') expect(s.id).toMatch(/^q:constat:the-mimic:the-mimic:E\d+$/u)
    }
    // et il n'est jamais l'entité proche d'une autre copie
    for (const g of GHOSTS) for (const s of soloSupply(g, GHOSTS)) if (g.id !== 'the-mimic') expect(s.id.split(':').slice(2), s.id).not.toContain('the-mimic')
  })

  it('dix questions au plus, toutes sur X, sans doublon ; le signe d’une entité proche cité comme faux ne se relit pas parmi les réponses d’une autre question', () => {
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
          if (t === 'T7b' && q.correct[0] !== g.id) return [start(q.quote!)]
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
    for (let seed = 1; seed <= 40; seed++) {
      const ids = buildSoloQuiz({ ghost: mimic, allGhosts: GHOSTS, rng: createRng(seed * 17) }).map((q) => q.id)
      const same = ['q:constat:the-mimic:the-mimic:O1', 'q:suffit:the-mimic:1', 'q:constat:the-mimic:the-mimic:C1'].filter((id) => ids.includes(id))
      expect(same.length, `tirage ${seed} : ${same.join(', ')}`).toBeLessThanOrEqual(1)
    }
  })

  it('une question à deux noms propose X et une entité qu’on confond avec lui, jamais quatre noms', () => {
    const names = new Set(GHOSTS.map((g) => g.name))
    for (const id of ['deogen', 'thaye', 'kormos', 'oni']) {
      for (const seed of [1, 2, 3]) {
        for (const q of copies(id, seed * 77).first) {
          if (!q.choices.every((c) => names.has(c.label))) continue
          expect(soloType(q), q.id).toBe('T7b')
          expect(q.choices.map((c) => c.id).sort(), q.id).toEqual([id, q.id.split(':')[3]].sort())
        }
      }
    }
  })
})

/* =====================================================================================================================
 * Le verrou de la spécification
 *
 * Deux règles : (I1) savoir que la copie porte sur X ne rapporte rien ; (I2) chaque question porte sur X, ou compare X
 * à une entité qu'on confond avec lui. Les mesures ci-dessous ne lisent que ce que l'élève lit (l'identifiant, l'énoncé,
 * la citation, les réponses, le corrigé) et les fiches : jamais le registre interne de la copie (soloFacts).
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
 * réponse, d'aligner les questions à deux réponses, de dire faux ce que la fiche de X explique, ou de poser plus de
 * deux départages à l'envers (« à quoi reconnais-tu Y plutôt que X ? », dont la réponse parle de l'autre entité :
 * mieux vaut sept questions sur X que dix dont quatre sur celles qu'on confond avec lui). En moyenne, 7,7 questions.
 * À vider à mesure que des questions rédigées complètent ces fiches : une entité retirée de la liste doit atteindre
 * dix à chaque copie, et le test le vérifie.
 */
const SHORT_COPIES: Readonly<Record<string, number>> = {
  'the-twins': 9,
  kormos: 9,
  mare: 8,
  onryo: 8,
  phantom: 7,
  banshee: 7,
  shade: 7,
  yurei: 7,
  yokai: 7,
  thaye: 7,
  obambo: 7,
  wraith: 6,
  poltergeist: 6,
  jinn: 6,
  demon: 6,
  oni: 6,
  hantu: 6,
  myling: 6,
  raiju: 6,
  moroi: 6,
  deogen: 6,
  gallu: 6,
  spirit: 5,
  obake: 5,
  dayan: 5,
  aswang: 5,
  deildegast: 5,
  // ses signes clés ne parlent que de ses deux vitesses, que les questions en nombres demandent déjà
  revenant: 4,
  // pas d'observation décisive ni de test de confirmation sans preuve : peu de questions qui ne se recoupent pas
  goryo: 4,
  // ses questions sont presque toutes à deux ou trois réponses (tests, observations) : cinq au plus par copie
  'the-mimic': 4,
}

interface View {
  q: Question
  type: SoloType
  x: Ghost
  /** l'entité proche de la question (départage, intrus, vrai ou faux, observation), d'après son identifiant */
  partner: Ghost | null
  /** l'entité dont parle la bonne réponse */
  about: Ghost
  right: Choice
  wrong: Choice[]
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
  } else if (type === 'T7b') {
    // q:duel:<x>:<y>:<celle dont on parle>:…
    partner = p[3]
    about = p[4]
  } else if (type === 'T5') {
    partner = p[3]
    about = p[3]
  } else if (type === 'T6' || type === 'T8') {
    // q:vf:<x>:<source>:… et q:constat:<x>:<source>:…
    partner = p[3] === x.id ? null : p[3]
    about = p[3]
  }
  return { q, type, x, partner: partner ? getGhost(partner)! : null, about: getGhost(about)!, right: q.choices.find((c) => q.correct.includes(c.id))!, wrong: q.choices.filter((c) => !q.correct.includes(c.id)) }
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

const TYPES: readonly SoloType[] = ['T1', 'T2', 'T3a', 'T3b', 'T4', 'T5', 'T6', 'T7a', 'T7b', 'T8', 'auth']
const NUMERIC = /^q:(?:san|spd):/u
const isLos = (q: Question) => q.id.startsWith('q:los:')
/** Les questions à réponses fixes : la phrase jugée est la citation. */
const FIXED: readonly SoloType[] = ['T3b', 'T6', 'T7b', 'T8']
/** Les questions qui demandent ce que vaut un fait de X (une preuve, un simple indice), et non à qui il est. */
const asksWorth = (v: View) => v.type === 'T3b' || (v.type === 'T8' && v.about.id === v.x.id)
/** Ce que vaut le fait, d'après la bonne réponse. */
const verdict = (v: View) => (v.type === 'T3b' ? (v.q.correct[0] === SOLO_ANSWERS.enough.yes ? 'confirms' : 'fits') : v.q.correct[0])

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
/** Ceux qui ne jouent que certaines questions. */
const SOME_QUESTIONS: Record<string, Player> = {
  'toujours X quand X est proposé': (v) => {
    const i = v.q.choices.findIndex((c) => c.label === v.x.name)
    return i < 0 ? null : [i]
  },
  // (hors « de qui parle-t-on ? », où le joueur d'avant répond déjà X : mêlées aux autres, ses 300 questions à une chance
  // sur deux cacheraient une fuite sur les phrases)
  'la seule réponse qui nomme X ou contient le mot que souffle son nom': (v) => {
    if (v.type === 'T7b') return null
    const hit = v.q.choices.flatMap((c, i) => (namesGhost(c.label, v.x) || hints(v.x, c.label) ? [i] : []))
    return hit.length === 1 ? hit : null
  },
  'toujours « Vrai »': (v) => (v.type === 'T6' ? at(v, SOLO_ANSWERS.trueFalse.true) : null),
  'toujours « Faux »': (v) => (v.type === 'T6' ? at(v, SOLO_ANSWERS.trueFalse.false) : null),
  'observation : toujours « Oui, et ça suffit »': (v) => (v.type === 'T8' ? at(v, SOLO_ANSWERS.observation.confirms) : null),
  'observation : toujours « Oui, mais ça ne suffit pas »': (v) => (v.type === 'T8' ? at(v, SOLO_ANSWERS.observation.fits) : null),
  'observation : toujours « Non, ça l’exclut »': (v) => (v.type === 'T8' ? at(v, SOLO_ANSWERS.observation.excludes) : null),
  'ce test suffit-il : toujours « Oui »': (v) => (v.type === 'T3b' ? at(v, SOLO_ANSWERS.enough.yes) : null),
  'ce test suffit-il : toujours « Non »': (v) => (v.type === 'T3b' ? at(v, SOLO_ANSWERS.enough.no) : null),
  'ligne de vue : toujours « Oui »': (v) => (isLos(v.q) ? [0] : null),
  'ligne de vue : toujours « Non »': (v) => (isLos(v.q) ? [1] : null),
}

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
        corpus.push({ x, seed, seen, qs, views: qs.map((q) => view(q, x)), ms: performance.now() - t })
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
    // le test mord : des milliers de questions nomment bien une entité proche
    expect(naming).toBeGreaterThan(1000)
    measure(`a. ${all.length} questions dans ${corpus.length} copies, dont ${naming} nomment une entité proche`)
  })

  /* ---------- b. plus de « quelle entité ? » ---------- */

  it('b. aucun choix entre des noms, sauf « de qui parle-t-on ? » : X et une entité proche, X une fois sur deux', () => {
    const names = new Set(GHOSTS.flatMap((g) => [g.name, g.nameEn, `${g.name} (${g.nameEn})`]))
    for (const v of all) {
      const n = v.q.choices.filter((c) => names.has(c.label)).length
      if (v.type !== 'T7b') {
        expect(n, `${v.q.id} : ${n} noms d’entités parmi les réponses`).toBe(0)
        continue
      }
      expect(v.q.choices, v.q.id).toHaveLength(2)
      expect(v.q.choices.map((c) => c.id).sort(), v.q.id).toEqual([v.x.id, v.partner!.id].sort())
      expect(v.q.choices.map((c) => c.label).sort(), v.q.id).toEqual([v.x.name, v.partner!.name].sort())
      expect([v.x.id, v.partner!.id], v.q.id).toContain(v.about.id)
      // la citation ne nomme ni l'une ni l'autre
      expect(namesGhost(v.q.quote!, v.x) || namesGhost(v.q.quote!, v.partner!), `${v.q.id} : « ${v.q.quote} »`).toBe(false)
    }
    const duels = all.filter((v) => v.type === 'T7b')
    const share = (list: readonly View[]) => (100 * list.filter((v) => v.about.id === v.x.id).length) / list.length
    expect(duels.length).toBeGreaterThan(200)
    // 45 à 55 %, à l'erreur d'échantillonnage près comme pour chaque entité ci-dessous (deux écarts-types : sur 300
    // questions, 6 points). La réponse se tire à pile ou face entre une phrase sur X et une phrase sur l'entité proche
    // (voir addEither) : sur 2 020 questions (240 copies par entité), X est la réponse de 48,6 %. Une borne nue, sur
    // 300 questions, se jouerait à la graine.
    const noise = 2 * 100 * Math.sqrt(0.25 / duels.length)
    expect(share(duels), `X est la réponse de ${share(duels).toFixed(1)} % des ${duels.length} « de qui parle-t-on ? »`).toBeGreaterThanOrEqual(45 - noise)
    expect(share(duels)).toBeLessThanOrEqual(55 + noise)
    measure(`b. « de qui parle-t-on ? » : X est la réponse de ${share(duels).toFixed(1)} % des ${duels.length} questions`)
    // par entité : 35 à 65 %, à l'erreur d'échantillonnage près (deux écarts-types : à 30 questions, 9 points chacun) ;
    // et, pour que le tirage puisse tomber des deux côtés, sa réserve compte des phrases sur X et sur l'entité proche
    for (const x of GHOSTS) {
      const sides = new Set(soloSupply(x, GHOSTS).filter((s) => s.type === 'T7b').map((s) => (s.id.split(':')[4] === x.id ? 'x' : 'y')))
      const mine = duels.filter((v) => v.x.id === x.id)
      if (mine.length) expect([...sides].sort(), `${x.id} : « de qui parle-t-on ? » se pose, mais d’un seul côté`).toEqual(['x', 'y'])
      if (mine.length) measure(`b.   ${x.id} : X ${mine.filter((v) => v.about.id === x.id).length}/${mine.length}`)
      if (mine.length < 8) continue
      const margin = 2 * 100 * Math.sqrt(0.25 / mine.length)
      expect(share(mine), `${x.id} : ${share(mine).toFixed(0)} % sur ${mine.length}`).toBeGreaterThanOrEqual(35 - margin)
      expect(share(mine), `${x.id} : ${share(mine).toFixed(0)} % sur ${mine.length}`).toBeLessThanOrEqual(65 + margin)
    }
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
      else expect(s.n, name).toBeGreaterThan(100)
      if (!s.n) continue
      measure(`c. ${name} : ${say(s)} (écart ${(s.got - s.chance).toFixed(1)}, plafond +${(ceiling(s, false) - s.chance).toFixed(1)})`)
      expect(s.got, `${name} : ${say(s)} (plafond ${ceiling(s, false).toFixed(1)} %)`).toBeLessThanOrEqual(ceiling(s, false))
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
    expect(readEarlier, some(readEarlier)).toHaveLength(0)
    expect(valueShown, some(valueShown)).toHaveLength(0)
    expect(worthFirst, some(worthFirst)).toHaveLength(0)
    expect(askedTwice, some(askedTwice)).toHaveLength(0)
    // les deux angles : mesurés, pour que leur part ne grimpe pas sans qu'on le voie (0,4 paire par copie aujourd'hui)
    expect(pairs).toBeGreaterThan(20_000)
    expect(twoAngles / corpus.length, `${twoAngles} paires « à qui est-ce, puis ce que ça vaut » sur ${corpus.length} copies`).toBeLessThanOrEqual(0.6)
  })

  /* ---------- f. la forme ---------- */

  it('f. des réponses de même forme ; les réponses fixes dans leur ordre ; trois questions à deux réponses au plus, cinq à moins de quatre', () => {
    const fixed: Record<string, string[]> = {
      T3b: [SOLO_ANSWERS.enough.yes, SOLO_ANSWERS.enough.no],
      T6: [SOLO_ANSWERS.trueFalse.true, SOLO_ANSWERS.trueFalse.false],
      T8: [SOLO_ANSWERS.observation.confirms, SOLO_ANSWERS.observation.fits, SOLO_ANSWERS.observation.excludes],
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
      else if (v.type === 'T7b') expect(v.q.choices, v.q.id).toHaveLength(2)
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
    expect(composed).toBeGreaterThan(3000)
    for (const [key, set] of labels) expect(set.size, key).toBe(1)
    // la variété : à toute taille, trois questions à deux réponses au plus (une sur deux se trouve au hasard) et cinq au
    // plus à moins de quatre réponses ; une copie de dix compte donc cinq questions à quatre réponses au moins
    for (const c of corpus) {
      const width = (n: number) => c.qs.filter((q) => q.choices.length === n).length
      expect(width(2), `${c.x.id} (graine ${c.seed}) : ${width(2)} questions à deux réponses`).toBeLessThanOrEqual(3)
      expect(c.qs.length - width(4), `${c.x.id} (graine ${c.seed})`).toBeLessThanOrEqual(5)
      if (c.qs.length === SOLO_COUNT) expect(width(4), `${c.x.id} (graine ${c.seed})`).toBeGreaterThanOrEqual(5)
    }
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
    // le départage à l'envers (« à quoi reconnais-tu Y plutôt que X ? ») est la seule question qui demande de connaître Y :
    // deux au plus par copie, à tous les paliers (voir LADDER, REVERSE_MAX) : une copie sur X parle de X, quitte à
    // rester plus courte
    const reverse = (c: Copy) => c.views.filter((v) => v.type === 'T7a' && v.about.id !== c.x.id).length
    const duels = (c: Copy) => c.views.filter((v) => v.type === 'T7a' || v.type === 'T7b').length
    measure(`g. départages à l’envers : ${((100 * corpus.reduce((n, c) => n + reverse(c), 0)) / all.length).toFixed(1)} % des questions, ${(corpus.reduce((n, c) => n + reverse(c), 0) / corpus.length).toFixed(2)} par copie, au plus ${Math.max(...corpus.map(reverse))} ; départages en tout : au plus ${Math.max(...corpus.map(duels))} par copie`)
    for (const c of corpus) {
      expect(reverse(c), `${c.x.id} (graine ${c.seed})`).toBeLessThanOrEqual(2)
      expect(duels(c), `${c.x.id} (graine ${c.seed})`).toBeLessThanOrEqual(5)
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

  it('h. ce qui est dit faux pour X vient d’une entité qu’on confond avec lui, jamais de sa fiche, et ne lui convient en rien', () => {
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
    for (const v of all) {
      if (v.type === 'T5') falseFor(v.right.label, v.partner!, v.x, v.q.id)
      else if (v.type === 'T6' && v.q.correct[0] === SOLO_ANSWERS.trueFalse.false) falseFor(v.q.quote!, v.partner!, v.x, v.q.id)
      else if (v.type === 'T7b') falseFor(v.q.quote!, v.about, v.about.id === v.x.id ? v.partner! : v.x, v.q.id)
      else if (v.type === 'T8' && v.partner) falseFor(v.q.quote!, v.partner, v.x, v.q.id)
      // un vrai ou faux « Vrai » : une phrase de la fiche de X, ou ce qu'une fiche proche dit de lui
      if (v.type === 'T6' && v.q.correct[0] === SOLO_ANSWERS.trueFalse.true) {
        expect(v.partner, v.q.id).toBeNull()
        const about = GHOSTS.flatMap((g) => g.confusions.filter((c) => c.with === v.x.id).map((c) => c.why))
        expect(from(v.q.quote!, [...ownLines(v.x), ...about]), `${v.q.id} : « ${v.q.quote} » ne se retrouve sur aucune fiche`).toBe(true)
      }
      // l'intrus : les trois autres affirmations sont bien des signes de X
      if (v.type === 'T5') for (const c of v.wrong) expect(from(c.label, ownLines(v.x)), `${v.q.id} : « ${c.label} » n’est pas sur la fiche de ${v.x.name}`).toBe(true)
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('h. « ça l’exclut », « ça suffit », « ce test suffit-il ? » : seulement ce que la fiche prouve', () => {
    const seenAnswers = { confirms: 0, fits: 0, excludes: 0, yes: 0, no: 0, excluded: 0 }
    for (const v of all) {
      const p = v.q.id.split(':')
      if (v.type === 'T8') {
        const answer = v.q.correct[0] as keyof typeof SOLO_ANSWERS.observation
        seenAnswers[answer]++
        const kind = p[4][0]
        const rank = Number(p[4].slice(1))
        const quote = v.q.quote!
        if (v.partner) {
          // l'observation décisive d'une entité proche : elle prouve cette entité, donc exclut X
          const o = v.partner.observations[rank]
          expect(kind, v.q.id).toBe('O')
          expect(o?.strength, `${v.q.id} : l’observation de ${v.partner.name} n’est pas décisive`).toBe('definitive')
          expect(o.requires, v.q.id).toBeUndefined()
          expect(within(quote, o.text), `${v.q.id} : « ${quote} »`).toBeGreaterThanOrEqual(0.8)
          expect(answer, v.q.id).toBe('excludes')
        } else if (kind === 'O') {
          // une observation de la fiche de X : décisive, elle suffit ; forte ou simple indice, elle ne suffit pas
          const o = v.x.observations[rank]
          expect(o.requires, v.q.id).toBeUndefined()
          expect(within(quote, o.text), `${v.q.id} : « ${quote} »`).toBeGreaterThanOrEqual(0.8)
          expect(answer, `${v.q.id} : observation ${o.strength}`).toBe(o.strength === 'definitive' ? 'confirms' : 'fits')
        } else if (kind === 'C') {
          // un test de confirmation de X dit comme ce qu'on observe : il suffit si la fiche le dit définitif
          const t = v.x.confirmationTests[rank]
          expect(t.requires, v.q.id).toBeUndefined()
          expect(within(quote, t.text), `${v.q.id} : « ${quote} »`).toBeGreaterThanOrEqual(0.8)
          expect(answer, `${v.q.id} : test ${t.definitive ? 'définitif' : 'non définitif'}`).toBe(t.definitive ? 'confirms' : 'fits')
        } else {
          // un test d'élimination de X
          expect(kind, v.q.id).toBe('E')
          expect(within(quote, v.x.eliminationTests[rank].text), `${v.q.id} : « ${quote} »`).toBeGreaterThanOrEqual(0.8)
          expect(answer, v.q.id).toBe('excludes')
        }
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
        seenAnswers[v.q.correct[0] as 'yes' | 'no']++
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

  it('h. le Mimic : rien n’est dit faux pour lui ni ne l’exclut hors de sa fiche, et il n’est jamais l’entité proche', () => {
    const mimic = getGhost(MIMIC)!
    const mine = of(mimic).flatMap((c) => c.views)
    expect(mine.length).toBeGreaterThan(60)
    for (const v of mine) {
      // ses tests, ses observations, ses questions rédigées : aucune entité proche, aucun signe d'une autre fiche jugé pour lui
      expect(['T3a', 'T3b', 'T4', 'T8', 'auth'], v.q.id).toContain(v.type)
      expect(v.partner, v.q.id).toBeNull()
      expect(v.about.id, v.q.id).toBe(MIMIC)
      expect(namedIn(v.q, mimic), v.q.id).toHaveLength(0)
      if (v.type === 'T8' && v.q.correct[0] === SOLO_ANSWERS.observation.excludes) expect(v.q.id).toMatch(/^q:constat:the-mimic:the-mimic:E\d+$/u)
    }
    for (const v of all) {
      if (v.x.id === MIMIC) continue
      // ni entité proche, ni signe ou test du Mimic parmi les réponses, ni son nom
      expect(v.q.choices.map((c) => c.id), v.q.id).not.toContain(MIMIC)
      expect(strays.get(MIMIC)!(v.q), v.q.id).toBe(false)
    }
    // et dans toute la réserve, pas seulement dans le corpus
    for (const g of GHOSTS) for (const s of soloSupply(g, GHOSTS)) if (g.id !== MIMIC) expect(s.id.split(':').slice(2), s.id).not.toContain(MIMIC)
    for (const s of soloSupply(mimic, GHOSTS)) expect(['T3a', 'T3b', 'T4', 'T8', 'auth'], s.id).toContain(s.type)
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
    // mesuré seul : médiane 32 ms, 95e centile 63 ms ; les plafonds laissent de la marge à une machine chargée (toute la suite en parallèle)
    expect(median, `médiane ${median.toFixed(0)} ms, 95e centile ${p95.toFixed(0)} ms`).toBeLessThan(100)
    expect(p95, `médiane ${median.toFixed(0)} ms, 95e centile ${p95.toFixed(0)} ms`).toBeLessThan(250)
  })

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
            // jamais quatre noms d'entités
            expect(q.choices.filter((c) => GHOSTS.some((g) => g.name === c.label)).length, q.id).toBeLessThanOrEqual(2)
          }
          // le même tirage par l'un ou l'autre chemin, tant que les mécaniques ne s'y glissent pas
          if (topics === DEFAULT_TOPICS) expect(qs, tag).toEqual(buildSoloQuiz({ ghost: x, allGhosts: GHOSTS, rng: createRng(seed), count, topics }))
          // à dix questions, la variété de la copie tient par ce chemin aussi
          if (count === SOLO_COUNT && topics === DEFAULT_TOPICS) expect(qs.filter((q) => q.choices.length === 2).length, tag).toBeLessThanOrEqual(3)
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
    // « de qui parle-t-on ? » sur un signe clé : il est dit faux pour l'autre des deux entités
    if (v.type === 'T7b' && /^K\d+$/u.test(q.id.split(':')[5])) return [{ text: q.quote!, from: v.about }]
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

  it('« ça l’exclut » : jamais une scène qui touche un objet ou un geste dont parlent les signes de X, ni un simple ralentissement, ni un joueur ignoré face à une entité qui ne poursuit que sa cible', () => {
    const rival = byType('T8').filter((d) => d.v.partner)
    expect(rival.length).toBeGreaterThan(150)
    for (const d of rival) {
      expect(d.q.correct, d.q.id).toEqual([SOLO_ANSWERS.observation.excludes])
      // recalculé ici, sans apartFrom : les thèmes précis des signes clés et des signes « 0 preuve » de X
      const mine = new Set(themesOf([...d.x.keyTells, ...d.x.tells.filter((t) => t.zeroEvidence).map((t) => t.text)].join(' ')).filter((t) => NARROW.has(t)))
      const touched = themesOf(d.q.quote!).filter((t) => mine.has(t))
      expect(touched, `${d.q.id} : « ${d.q.quote} »`).toEqual([])
      expect(apartFrom(d.x, true)(d.q.quote!), d.q.id).toBe(true)
    }
    // les paires relevées : 20 points perdus après un événement (le Fantôme draine la santé pendant les événements), le sel
    // intact (le Gallu enragé ne le perturbe pas non plus), la voix qui n'attire pas (la Banshee ignore qui n'est pas sa
    // cible), l'entité qui ralentit après les pilules (toute entité ralentit quand elle a perdu le joueur)
    const gone = ['phantom:oni:O0', 'gallu:wraith:O0', 'banshee:yokai:O1', 'spirit:moroi:O4', 'revenant:moroi:O4', 'poltergeist:moroi:O4', 'shade:moroi:O4', 'demon:moroi:O4', 'the-twins:moroi:O4', 'thaye:moroi:O4', 'aswang:moroi:O4']
    for (const pair of gone) {
      const id = `q:constat:${pair}`
      expect(soloSupply(getGhost(pair.split(':')[0])!, GHOSTS).map((s) => s.id), id).not.toContain(id)
    }
    // ce que la scène du Moroï prouve reste demandé sur sa propre fiche
    expect(soloSupply(getGhost('moroi')!, GHOSTS).map((s) => s.id)).toContain('q:constat:moroi:moroi:O4')
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
    for (const d of byType('T7b')) if (/^Cette entité/u.test(d.q.quote!)) expect(OBJECT_MASC.test(d.q.quote!), `${d.q.id} : « ${d.q.quote} »`).toBe(false)
  })

  it('une observation de la fiche de X : « ça ne suffit pas » ne se dit pas d’un indice fort quand la fiche a un test ou un rapport décisif', () => {
    // les mots ne suffisent pas à reconnaître qu'un indice fort redit un test décisif (« ton coéquipier se retrouve au
    // contact de l'entité et survit » ; « ceux-ci peuvent la toucher sans mourir, c'est une Banshee ») : la copie
    // enseignait les deux verdicts pour la même scène. À rouvrir quand les forces des rapports seront alignées sur les tests.
    const own = byType('T8').filter((d) => !d.v.partner && /:O\d+$/u.test(d.q.id))
    expect(own.length).toBeGreaterThan(80)
    for (const d of own) {
      const o = d.x.observations[Number(d.q.id.split(':O')[1])]
      const decisive = d.x.confirmationTests.some((t) => t.definitive) || d.x.observations.some((k) => k.strength === 'definitive')
      if (o.strength === 'definitive') expect(d.q.correct, d.q.id).toEqual([SOLO_ANSWERS.observation.confirms])
      else {
        expect(d.q.correct, d.q.id).toEqual([SOLO_ANSWERS.observation.fits])
        if (decisive) expect(o.strength, `${d.q.id} : « ${o.text} »`).toBe('hint')
      }
    }
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
    for (const d of supply) for (const f of shownFalse(d)) expect(nearSpeed(f.text, d.v.type === 'T7b' ? (d.v.about.id === d.x.id ? d.v.partner! : d.x) : d.x), `${d.q.id} : « ${f.text} »`).toBe(false)
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

  it('une vitesse dite sans décimale (« environ 1 m/s ») est la même que « 1,0 m/s » : elle ne se demande pas après la scène qui la cite ; et la copie ne s’ouvre pas sur l’entité proche', () => {
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
        // un départage à l'envers (« à quoi reconnais-tu Y plutôt que X ? ») n'est jamais la première question
        if (qs.length > 1) {
          opened++
          const first = qs[0]
          expect(soloType(first) === 'T7a' && first.id.split(':')[3] !== id, `${id} (graine ${seed}) : ${first.id}`).toBe(false)
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
    const revenant = supply.filter((d) => d.q.id === 'q:constat:revenant:revenant:E0')
    expect(revenant.length).toBeGreaterThan(0)
    for (const d of revenant) expect(d.q.quote).not.toMatch(/(?<!\p{L})il ralentit/u)
    // le corrigé d'une question rédigée ne parle pas des preuves ; sauf celui du Mimic, sur ses orbes à 0 preuve
    for (const d of byType('auth')) if (d.x.id !== MIMIC) expect(mentionsEvidence(d.q.explain), `${d.q.id} : ${d.q.explain}`).toBe(false)
  })
})

