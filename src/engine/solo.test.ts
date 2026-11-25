import { beforeAll, describe, expect, it } from 'vitest'
// solo.ts d'abord, avant quiz.ts : les deux modules s'importent l'un l'autre, et rien ne doit en dépendre au chargement
import { buildSoloQuiz, soloFacets, soloFacetsOf, soloFacts, soloQuestion, soloSupply, soloType, soloWorthPlan, SOLO_ANSWERS, SOLO_COUNT, type SoloType } from './solo'
import { GHOSTS, MECHANICS, getGhost } from '../data'
import type { Ghost } from '../data/types'
import { evidenceIn, isEvidenceList, mentionsEvidence, MIMIC, namesGhost, needsEvidence, thresholds } from './cards'
import { redactGhostName } from './format'
import { asksOf, buildQuiz, DEFAULT_TOPICS, factKeys, hints, homogeneous, nearSpeed, QUIZ_TOPICS, strayCheck, TRUE_OF_ALL, type Choice, type Question } from './quiz'
import { createRng } from './random'

/**
 * Le plan des « est-ce que ça suffit ? » (worthPlan, solo.ts) équilibre « Oui » et « Non » à longueur voisine en
 * réglant les chances des deux réponses de chaque fiche, sans jamais en faire tomber une sous une question sur
 * quatre : ce garde-fou, et les fiches qui n'ont qu'une réponse, lui laissent un écart, prévu ici seuil par seuil.
 * Mesuré le 19 novembre 2026, une fois retirés les tests dont la mise en garde nomme une autre entité et les indices
 * écrits comme des impressions, et le plan tenant compte de ce qu'une copie ne pose plus qu'un « est-ce que ça
 * suffit ? » (RIVAL et SHARE_FLOOR, solo.ts) : au pire seuil, 6,9 points pour les tests (à 80 caractères) et 9,4 pour
 * les observations (à 150). Les plafonds sont ceux d'avant ces retraits ; ils laissent une marge à une fiche qui
 * change, et ce que les copies donnent vraiment se mesure au verrou c.
 */
const PLAN_LENGTHS = [80, 100, 120, 135, 150, 170, 200] as const
const PLAN_EDGE = { T3b: 9, T8: 10.5 } as const

/**
 * Les sortes de questions retirées de la copie sur une seule entité : « de qui parle-t-on ? » (q:duel) le 18 novembre
 * 2026 ; le départage (q:dist), « quel test confirme X ? » (q:test-of), l'intrus (q:intrus), « dans lequel de ces cas
 * peux-tu exclure X ? » (q:exclut) et le profil de seuil (q:sansum) le 19.
 */
const GONE_KINDS = /^q:(?:duel|dist|test-of|intrus|exclut|sansum):/u

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
    // une copie courte : l'Aswang n'a que trois à six questions depuis que tout vient de sa fiche (19 novembre 2026)
    expect(direct.length).toBeGreaterThanOrEqual(3)
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

  it('le Mimic copie : ni nombres, ni signe à reconnaître, ni vrai ou faux ; et il n’est jamais cité dans la copie d’une autre entité', () => {
    const mimic = getGhost('the-mimic')!
    const types = new Set(soloSupply(mimic, GHOSTS).map((s) => s.type))
    // ses tests, ses observations, ses questions rédigées. Ni vrai ou faux : son seul test d'élimination sans preuve ne
    // se dit pas en une phrase (« Vérifie la pièce favorite à la recherche d'orbes… S'il n'y en a pas… »), et sans
    // « Faux », « Vrai » sortirait toujours
    expect([...types].sort()).toEqual(['T3b', 'T8', 'auth'])
    // et il n'est jamais cité dans la copie d'une autre entité : ni son signe parmi les mauvaises réponses, ni son nom
    for (const g of GHOSTS) for (const s of soloSupply(g, GHOSTS)) if (g.id !== 'the-mimic') expect(s.id.split(':').slice(2), s.id).not.toContain('the-mimic')
  })

  it('un vrai ou faux ne juge jamais une consigne : la condition d’un test d’élimination ne se cite que si elle tient en une phrase, et aucune fiche ne garde des « Vrai » sans « Faux »', () => {
    for (const g of GHOSTS) {
      const mine = soloSupply(g, GHOSTS).filter((s) => s.type === 'T6')
      const judged = mine.flatMap((s) => {
        const q = soloQuestion(g, GHOSTS, s.id, createRng(7))
        return q ? [q] : []
      })
      // tout vrai ou faux de la réserve se compose
      expect(judged.length, g.id).toBe(mine.length)
      for (const q of judged) {
        if (!/^q:vf:[^:]+:[^:]+:E\d+$/u.test(q.id)) continue
        // une seule phrase, qui ne s'adresse pas au joueur à l'impératif (« Place… », « Lance… », « Vérifie… »)
        expect(q.quote!.split(/(?<=[.!?…])\s+/u), `${q.id} : « ${q.quote} »`).toHaveLength(1)
        expect(q.quote!, q.id).not.toMatch(/^(?:Place|Lance|Vérifie|Écoute|Allume-|Pose|Attends|Reste|Observe|Regarde)(?!\p{L})/u)
      }
      // une fiche sans test d'élimination à citer ne pose aucun vrai ou faux : sans « Faux », « Vrai » sortirait toujours
      const falses = judged.filter((q) => q.correct[0] === SOLO_ANSWERS.trueFalse.false)
      if (mine.length) expect(falses.length, g.id).toBeGreaterThan(0)
      for (const q of falses) expect(q.id, q.id).toMatch(new RegExp(`^q:vf:${g.id}:${g.id}:E\\d+$`, 'u'))
    }
    // les tests d'élimination précédés d'une mise en place ne se posent pas en vrai ou faux (ils se liraient comme des consignes)
    for (const [id, tag] of [['spirit', 'E0'], ['mare', 'E1'], ['revenant', 'E0'], ['yurei', 'E1'], ['onryo', 'E1'], ['yokai', 'E0'], ['the-mimic', 'E0']] as const) {
      expect(soloSupply(getGhost(id)!, GHOSTS).map((s) => s.id), `${id} ${tag}`).not.toContain(`q:vf:${id}:${id}:${tag}`)
    }
    // les autres se posent : « Rallume le disjoncteur. », faux pour le Hantu
    const hantu = soloQuestion(getGhost('hantu')!, GHOSTS, 'q:vf:hantu:hantu:E1', createRng(1))
    expect(hantu?.quote).toBe('Rallume le disjoncteur.')
    expect(hantu?.correct).toEqual([SOLO_ANSWERS.trueFalse.false])
  })

  it('dix questions au plus, toutes sur X, sans doublon ; ce qui est cité comme faux pour X ne se relit pas parmi les réponses d’une autre question', () => {
    const start = (t: string) => t.toLocaleLowerCase('fr').replace(/[^\p{L}\d]+/gu, ' ').trim().slice(0, 40)
    for (const g of GHOSTS) {
      const { first, second } = copies(g.id, 9001 + g.id.length * 13)
      for (const qs of [first, second]) {
        expect(qs.length, g.id).toBeLessThanOrEqual(SOLO_COUNT)
        expect(new Set(qs.map((q) => q.id)).size, g.id).toBe(qs.length)
        expect(qs.every((q) => q.ghostId === g.id), g.id).toBe(true)
        const foreign = qs.flatMap((q) => (soloType(q) === 'T6' && q.correct[0] === 'false' ? [start(q.quote!)] : []))
        // un seul vrai ou faux par copie (voir judgedFor, solo.ts)
        expect(qs.filter((q) => soloType(q) === 'T6').length, g.id).toBeLessThanOrEqual(1)
        for (const q of qs) {
          if (soloType(q) !== 'T2') continue
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
      // des copies de trente questions (le quiz général réduit à une entité) : une copie de dix n'en pose jamais deux
      const ids = buildSoloQuiz({ ghost: mimic, allGhosts: GHOSTS, rng: createRng(seed * 17), count: 30 }).map((q) => q.id)
      // l'observation (« est-ce que ça suffit ? ») et le test qui décrit la même scène
      const same = ['q:constat:the-mimic:the-mimic:O1', 'q:suffit:the-mimic:1'].filter((id) => ids.includes(id))
      for (const id of same) asked.set(id, (asked.get(id) ?? 0) + 1)
      expect(same.length, `tirage ${seed} : ${same.join(', ')}`).toBeLessThanOrEqual(1)
    }
    // le test mord : au fil des copies, l'observation et le test se posent bien l'un et l'autre, jamais ensemble
    expect(asked.get('q:constat:the-mimic:the-mimic:O1') ?? 0, JSON.stringify([...asked])).toBeGreaterThan(0)
    expect(asked.get('q:suffit:the-mimic:1') ?? 0, JSON.stringify([...asked])).toBeGreaterThan(0)
  }, 30_000)

  it('le plan des « est-ce que ça suffit ? » : toutes les citations se posent, une fiche à deux réponses pose l’une et l’autre, et à longueur voisine « Oui » est prévu autant que « Non »', () => {
    const rows = soloWorthPlan(GHOSTS)
    const predicted: string[] = []
    for (const type of ['T3b', 'T8'] as const) {
      const mine = rows.filter((r) => r.type === type)
      expect(mine.length, type).toBeGreaterThan(60)
      // le plan couvre toute la réserve, et elle seule : une citation hors plan ne se poserait jamais
      const supply = GHOSTS.flatMap((g) => soloSupply(g, GHOSTS).filter((s) => s.type === type).map((s) => s.id))
      expect(mine.map((r) => r.id).sort(), type).toEqual([...supply].sort())
      for (const who of new Set(mine.map((r) => r.who))) {
        const fiche = mine.filter((r) => r.who === who)
        expect(fiche.reduce((n, r) => n + r.odds, 0), `${type} ${who}`).toBeCloseTo(1, 6)
        // aucune citation ne disparaît : celles d'une même réponse ont des chances égales, et leur fiche pose encore la
        // question (au moins un tiers de la part d'une fiche à une seule réponse, voir SHARE_FLOOR, solo.ts)
        for (const r of fiche) {
          expect(r.odds, r.id).toBeCloseTo(fiche.find((o) => o.answer === r.answer)!.odds, 9)
          expect(r.share, r.id).toBeGreaterThan(0.05)
          expect(r.share, r.id).toBeLessThanOrEqual(1)
        }
        // une fiche qui a des faits décisifs et d'autres non pose les uns et les autres : jamais moins d'une fois sur quatre
        const yes = fiche.filter((r) => r.answer === SOLO_ANSWERS.enough.yes).reduce((n, r) => n + r.odds, 0)
        if (new Set(fiche.map((r) => r.answer)).size === 2) {
          expect(yes, `${type} ${who} : « Oui » ${(100 * yes).toFixed(0)} %`).toBeGreaterThanOrEqual(0.25 - 1e-9)
          expect(yes, `${type} ${who} : « Oui » ${(100 * yes).toFixed(0)} %`).toBeLessThanOrEqual(0.75 + 1e-9)
        } else expect([0, 1], `${type} ${who}`).toContain(Math.round(yes * 1e6) / 1e6)
      }
      // ce que le plan prévoit, chaque fiche posant la question dans sa part des copies : autant de « Oui » que de « Non »…
      const rate = (pred: (r: (typeof mine)[number]) => boolean) => mine.filter(pred).reduce((n, r) => n + r.share * r.odds, 0)
      const yes = rate((r) => r.answer === SOLO_ANSWERS.enough.yes)
      const no = rate((r) => r.answer === SOLO_ANSWERS.enough.no)
      expect(yes / (yes + no), `${type} : « Oui » prévu ${((100 * yes) / (yes + no)).toFixed(1)} %`).toBeGreaterThanOrEqual(0.45)
      expect(yes / (yes + no), `${type} : « Oui » prévu ${((100 * yes) / (yes + no)).toFixed(1)} %`).toBeLessThanOrEqual(0.55)
      // … et à toute longueur : l'avance prévue de qui répondrait « Oui » aux citations d'au moins tant de caractères, et
      // « Non » aux autres (la moitié de l'écart entre les parts de « Oui » et de « Non » au-dessus du seuil)
      let worst = 0
      for (const cut of PLAN_LENGTHS) {
        const edge = 50 * (rate((r) => r.answer === SOLO_ANSWERS.enough.yes && r.length >= cut) / yes - rate((r) => r.answer === SOLO_ANSWERS.enough.no && r.length >= cut) / no)
        predicted.push(`${type} ≥ ${cut} : ${edge.toFixed(1)}`)
        worst = Math.max(worst, Math.abs(edge))
      }
      expect(worst, `${type} : ${predicted.join(' ; ')}`).toBeLessThanOrEqual(PLAN_EDGE[type])
    }
    if (import.meta.env.VITE_SOLO_MEASURES) console.info(`plan : avance prévue du joueur « Oui aux longues citations », en points : ${predicted.join(' ; ')}`)
  })

  it('aucune question ne demande « quelle entité ? » : pas un nom d’entité parmi les réponses', () => {
    const names = new Set(GHOSTS.flatMap((g) => [g.name, g.nameEn]))
    for (const id of ['deogen', 'thaye', 'kormos', 'oni', 'aswang']) {
      for (const seed of [1, 2, 3]) {
        const { first, second } = copies(id, seed * 77)
        for (const q of [...first, ...second]) {
          expect(q.id, q.id).not.toMatch(GONE_KINDS)
          for (const c of q.choices) expect(names.has(c.label), `${q.id} : « ${c.label} »`).toBe(false)
        }
      }
    }
  })
})

/* =====================================================================================================================
 * Le verrou de la spécification
 *
 * Trois règles : (I1) savoir que la copie porte sur X ne rapporte rien ; (I2) chaque question porte sur X (le coach,
 * 18 novembre 2026 : dans un test sur X, aucune question ne demande de quelle entité il s'agit, aucune ne porte sur
 * le comportement d'une autre) ; (I3) tout ce que la copie affirme vient de la fiche de X (19 novembre 2026) : plus
 * de signe d'une entité proche jugé « Faux », plus d'intrus, plus de départage, plus de « quel test confirme X ? ».
 * Ce qui vient encore d'une autre fiche : les trois mauvaises réponses, sans nom, de « lequel de ces signes est celui
 * de X ? », et les mauvaises valeurs ou profils d'une question de vitesse ou de seuil. Les mesures ci-dessous ne
 * lisent que ce que l'élève lit (l'identifiant, l'énoncé, la citation, les réponses, le corrigé) et les fiches :
 * jamais le registre interne de la copie (soloFacts).
 *
 * Le corpus : 30 entités × 30 copies, tirées comme la page les tire (une graine d'horloge sur 32 bits), une copie sur
 * deux enchaînée à la précédente (« Encore 10 » : ses questions déjà vues).
 * ===================================================================================================================== */

/** L'heure d'ouverture des copies : quinze visites par entité, à plusieurs heures d'écart, et « Encore 10 » trois minutes après. */
const CLOCK = Date.UTC(2026, 10, 18, 7, 30)
const pageSeed = (entity: number, copy: number) => (CLOCK + Math.floor(copy / 2) * 30_034_567 + entity * 61_003 + (copy % 2) * 187_331) & 0xffffffff
const COPIES = 30

/**
 * Le plus petit nombre de questions des copies de chaque entité dans le corpus. Aucune fiche ne remplit une copie de
 * dix aujourd'hui : la copie reste courte plutôt que de reposer une réponse déjà lue, de pencher vers une réponse,
 * d'aligner les questions à deux réponses, ou d'emprunter à la fiche d'une autre entité (le coach, 18 et 19 novembre
 * 2026 : mieux vaut cinq questions honnêtes sur X que sept dont deux empruntées). Recalibré le 19 novembre 2026,
 * quand la copie a cessé de citer les fiches des entités proches (ni signe d'une autre jugé « Faux », ni intrus, ni
 * départage, ni « quel test confirme X ? »), de demander deux fois ce que vaut un même fait, et de poser les indices
 * écrits comme des impressions : 4,5 questions par copie en moyenne sur les 900 copies du corpus (6,4 la veille), de
 * 2,8 pour le Goryo à 7,0 pour l'Obambo. Le Mimic descend à zéro dans un « Encore 10 » : sa fiche a sept questions,
 * et une copie ne reprend jamais plus d'une moitié de questions déjà posées (la page, elle, ne passe pas encore les
 * questions déjà vues : elle n'y arrive pas). À vider à mesure que des questions rédigées complètent ces fiches : une
 * entité retirée de la liste doit atteindre dix à chaque copie, et le test le vérifie.
 */
const SHORT_COPIES: Readonly<Record<string, number>> = {
  spirit: 3,
  wraith: 4,
  phantom: 3,
  poltergeist: 2,
  banshee: 3,
  jinn: 3,
  mare: 4,
  revenant: 2,
  shade: 4,
  demon: 4,
  yurei: 4,
  oni: 3,
  yokai: 3,
  hantu: 3,
  goryo: 2,
  myling: 3,
  onryo: 5,
  'the-twins': 3,
  raiju: 4,
  obake: 2,
  'the-mimic': 0,
  moroi: 3,
  deogen: 2,
  thaye: 4,
  gallu: 5,
  obambo: 4,
  dayan: 4,
  aswang: 3,
  kormos: 5,
  deildegast: 3,
}

/**
 * La longueur des copies du corpus (une copie sur deux y est un « Encore 10 », plus court). Des planchers, à relever
 * quand les fiches s'étoffent : mesuré le 19 novembre 2026, 4,49 questions par copie et 484 copies de moins de cinq
 * questions sur 900 (les premières copies seules, sans « Encore 10 » : 4,8 en moyenne) ; la veille, 6,40 et 86.
 */
const MEAN_SIZE = 4.3
const UNDER_FIVE = 520
/**
 * Les planchers et plafonds des comptages du corpus (ce que le test mesure aujourd'hui, avec une marge) : 7 776
 * paires de questions, 1 481 questions composées à quatre réponses, 40 « Encore 10 » sur 444 qui reprennent plus de
 * la moitié des faits de la copie précédente, 2 193 signes d'autres fiches en mauvaises réponses dans la réserve.
 */
const PAIRS_FLOOR = 6000
const COMPOSED_FLOOR = 1200
const CHAINED_CEILING = 0.12
const WRONG_SIGNS_FLOOR = 1800
/** Les fiches qui ont un test d'élimination à citer en une phrase, sans preuve : leur réserve a de quoi poser un vrai ou faux. */
const JUDGING: readonly string[] = ['wraith', 'phantom', 'banshee', 'jinn', 'mare', 'shade', 'hantu', 'goryo', 'onryo', 'raiju', 'deogen', 'thaye']
/**
 * Celles dont la copie le pose : il faut, face au « Faux », un « Vrai » de la fiche de même tournure et de longueur
 * voisine (voir judgedFor, solo.ts). Les quatre autres (Djinn, Cauchemar, Goryo, Thayé) n'en ont pas : leur vrai ou
 * faux se devinerait à sa forme. (L'Oni, le Myling et le Deildegast ont bien un test d'élimination, mais il s'adresse
 * au joueur, « Tu vois un événement… », « … quand elle te garde en ligne de vue » : une scène ne se juge pas en vrai
 * ou faux.)
 */
const PAIRED: readonly string[] = ['wraith', 'phantom', 'banshee', 'shade', 'hantu', 'onryo', 'raiju', 'deogen']
/** La tournure d'une affirmation jugée en vrai ou faux, et deux longueurs voisines : les règles de solo.ts, redites ici. */
const SAYS_YOU = /(?<!\p{L})(?:tu|te|toi|ton|ta|tes|t[’'])(?!\p{L})/iu
const shapeOf = (t: string) => (/^L[’']entité(?!\p{L})/u.test(t) ? 'led' : /l[’']entité/iu.test(t) ? 'entity' : 'sign')
const closeSize = (a: string, b: string) => Math.max(a.length, b.length) <= 1.3 * Math.min(a.length, b.length) || Math.abs(a.length - b.length) <= 16

interface View {
  q: Question
  type: SoloType
  x: Ghost
  /** l'entité de la fiche d'où vient la phrase jugée (vrai ou faux, observation), d'après son identifiant : toujours X */
  source: Ghost
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

/** Une question lue de l'extérieur : sa sorte, et la fiche d'où vient la phrase jugée, d'après son identifiant. */
function view(q: Question, x: Ghost): View {
  const type = soloType(q)!
  const p = q.id.split(':')
  // q:vf:<x>:<source>:… et q:constat:<x>:<source>:…
  const source = type === 'T6' || type === 'T8' ? p[3] : x.id
  return { q, type, x, source: getGhost(source) ?? x, right: q.choices.find((c) => q.correct.includes(c.id))!, wrong: q.choices.filter((c) => !q.correct.includes(c.id)) }
}
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

const TYPES: readonly SoloType[] = ['T1', 'T2', 'T3b', 'T6', 'T8', 'auth']
const NUMERIC = /^q:(?:san|spd):/u
const isLos = (q: Question) => q.id.startsWith('q:los:')
/** Les questions à réponses fixes : la phrase jugée est la citation. */
const FIXED: readonly SoloType[] = ['T3b', 'T6', 'T8']
/** Les questions qui demandent ce que vaut un fait de X (une preuve, un simple indice), et non à qui il est. */
const asksWorth = (v: View) => v.type === 'T3b' || v.type === 'T8'

/** La phrase dont la connaissance donne la réponse. */
function answerText(v: View): string {
  if (isLos(v.q)) return 'ligne de vue'
  if (FIXED.includes(v.type)) return v.q.quote ?? ''
  if (v.type === 'auth') return `${v.q.prompt} ${v.right.label}`
  return v.right.label
}
/** Les valeurs que demande la question (celles de sa réponse). */
const answerValues = (v: View) => valuesOf(v.x.id, NUMERIC.test(v.q.id) ? v.right.label : answerText(v))

/** Ce que la question montre de X une fois corrigée : son énoncé, sa citation, sa bonne réponse, son corrigé. */
const shownTexts = (v: View): string[] => [v.q.prompt, v.q.explain, ...(v.q.quote ? [v.q.quote] : []), v.right.label]
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
/**
 * Le plafond de qui répond d'après la longueur de la citation d'un « est-ce que ça suffit ? » (« Oui » aux longues,
 * « Non » aux courtes, ou l'inverse), à quinze seuils : le hasard plus QUOTE_LENGTH_EDGE points, et c'est un écart
 * connu. Sur les fiches, une observation décisive se décrit en détail (ses conditions, sa suite) et un simple indice
 * tient en une ligne ; le plan équilibre les réponses à longueur voisine (voir worthPlan, solo.ts) sans priver une
 * fiche de l'une de ses deux réponses (voir BOTH). Mesuré le 19 novembre 2026 : au pire seuil, 13,1 points aux
 * observations (« Oui » à 140 caractères et plus : 63,1 % sur 471 questions) et 8,7 aux tests (à 90 caractères, sur
 * 264). Le plafond est celui d'avant : une fois retirés les indices écrits comme des impressions (souvent de longues
 * scènes à « Non ») et réduite la copie à un seul « est-ce que ça suffit ? », l'écart montait à 20,5 points ; le plan
 * l'a ramené sous son plafond en posant moins souvent la question sur les fiches à une seule réponse dont la
 * citation a la longueur de trop (voir RIVAL et SHARE_FLOOR, solo.ts). À resserrer si des observations décisives
 * courtes ou de simples indices détaillés s'ajoutent aux fiches.
 */
const QUOTE_LENGTH_EDGE = 14
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
const isWorth = (v: View) => v.type === 'T3b' || v.type === 'T8'
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
  // (un seul vrai ou faux et un seul « est-ce que ça suffit ? » par copie : rien à déduire d'une réponse pour la
  // suivante, voir le verrou f. Deux « est-ce que ça suffit ? » se devinaient l'un par l'autre : « l'autre réponse qu'à
  // la précédente » trouvait 60 fois sur 100)
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
const QUOTE_LENGTHS = [80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220] as const
const byQuoteLength = (type: SoloType, least: number, long: string): Player => (v) => (v.type === type ? at(v, v.q.quote!.length >= least ? long : flip(long)) : null)

/* ---------- les fiches ---------- */

/** La phrase vient-elle de l'un de ces textes (au caviardage, aux apartés et à la conclusion retirés près) ? */
const from = (statement: string, texts: readonly string[]) => texts.some((t) => within(statement, t) >= 0.8)
/** Une ligne de fiche telle qu'un corrigé la cite : sans la phrase qui nomme une source que l'élève ne connaît pas (voir withoutSource, solo.ts). */
const withoutSourceSentences = (line: string) =>
  line
    .split(/(?<=[.!?…])\s+/u)
    .filter((s) => !/tybayn/iu.test(s))
    .join(' ')
/** Ce qui, dans la citation d'un test, dirait déjà s'il suffit : un nom d'entité, sa conclusion, un mot de verdict. */
const VERDICT_WORDS = /c[’']est\s+(?:une?|le|la|les|cette|ces)\s+(?!cas(?!\p{L}))|c[’']est\s+l[’']|ce\s+sont\s|ce\s+n[’']est\s+pas|ça\s+(?:pourrait|peut)|pourrait|peut-être|(?<!\p{L})indices?(?!\p{L})|à coup sûr|forcément|certitude|(?<!\p{L})certaine?s?(?!\p{L})|confirm|suffi|prouv|exclu|élimin/iu

/**
 * Les mesures du corpus, pour qui veut les lire sans faire échouer un test :
 * VITE_SOLO_MEASURES=1 npx vitest run src/engine/solo.test.ts
 */
const measure = (line: string) => {
  if (import.meta.env.VITE_SOLO_MEASURES) console.info(line)
}

/** La règle « un mot d'impression → Non, sinon Oui » du relecteur (verify/coach/tools/cues.py), mot pour mot. */
const VAGUE =
  /souvent|surtout|un peu|semble|plutôt|de plus en plus|bien plus|plus tard|jamais|toujours|chaque fois|à chaque|de toute la partie|tant que|malgré|encore (?:vers|autour)|vers \d|autour de|d[’']une chasse à l[’']autre|certaines|beaucoup|pourrait|peut-être/iu
/**
 * Les deux joueurs qui ne lisent que la tournure d'une observation (« tu observes ceci : est-ce que ça suffit ? »).
 * Avant le 19 novembre 2026, les indices des fiches, écrits comme des impressions, se posaient tous : le premier
 * joueur (« un mot d'impression : Non ; sinon : Oui ») trouvait 73 fois sur 100, le second (qui a appris sur les
 * observations corrigées des 29 autres entités quels mots vont avec quelle réponse) 78 fois sur 100. Ces indices ne se
 * posent plus (voir IMPRESSION, solo.ts). Mesuré depuis, sur les 471 observations du corpus : 52,4 % pour le
 * premier, 67,7 % pour le second. Le premier joueur est sous l'objectif de 60 % ; le second
 * n'y descend pas sans vider la question de ses « Non » : ce qu'il lit encore, ce sont des sujets (portes,
 * interactions, « l'équipe » : les indices des fiches parlent de l'activité de l'entité, ses faits décisifs d'une
 * chasse racontée à la deuxième personne), que seule une réécriture des fiches changerait. Son plafond est ce qui se
 * mesure aujourd'hui, pour qu'il ne remonte pas sans qu'on le voie.
 */
const WORDING_CEILING = { rule: 60, learnt: 72 } as const
/** Les mots d'une citation tels que le joueur qui apprend les lit : six lettres au plus, trois au moins, et les chiffres un à un. */
const tokens = (t: string) => new Set((t.toLocaleLowerCase('fr').match(/\p{L}+|\d/gu) ?? []).filter((w) => w.length >= 3 || /\d/u.test(w)).map((w) => w.slice(0, 6)))

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

  it('a. chaque question porte sur X, et rien de ce qui se lit avant le corrigé ne nomme une autre entité', () => {
    for (const v of all) {
      expect(v.q.ghostId, v.q.id).toBe(v.x.id)
      expect(v.type, v.q.id).not.toBeNull()
      expect(v.q.correct, v.q.id).toHaveLength(1)
      expect(v.right, v.q.id).toBeDefined()
      // ni l'énoncé, ni la citation, ni une réponse ne nomme une autre entité : plus de départage (« plutôt que Y »),
      // plus de question rédigée qui compare X à une autre (« Tu hésites entre un Esprit et un Spectre… »). Seul un
      // corrigé peut en nommer une (de qui sont les trois autres signes ; pourquoi un indice n'est qu'un indice)
      expect(namedIn(v.q, v.x).map((o) => o.name), `${v.q.id} : « ${v.q.prompt} »`).toEqual([])
    }
    measure(`a. ${all.length} questions dans ${corpus.length} copies ; aucune ne nomme une autre entité avant son corrigé`)
  })

  /* ---------- b. plus de « quelle entité ? », plus rien d'une autre fiche ---------- */

  it('b. aucune question ne demande « quelle entité ? », aucune ne porte sur une autre entité, aucune affirmation ne vient d’une autre fiche', () => {
    const names = new Set(GHOSTS.flatMap((g) => [g.name, g.nameEn, `${g.name} (${g.nameEn})`]))
    const faults: string[] = []
    for (const v of all) {
      const p = v.q.id.split(':')
      // pas un nom d'entité parmi les réponses : ni « de qui parle-t-on ? », ni « quelle entité fait ceci ? »
      for (const c of v.q.choices) if (names.has(c.label) || GHOSTS.some((g) => c.label === g.name)) faults.push(`${v.q.id} : « ${c.label} » parmi les réponses`)
      // ni départage, ni « quel test confirme X ? », ni intrus, ni « dans lequel de ces cas peux-tu exclure X ? »
      if (GONE_KINDS.test(v.q.id)) faults.push(`${v.q.id} : une sorte de question qui ne se pose plus`)
      // « est-ce que ça suffit ? » ne se pose que sur une observation de la fiche de X
      if (v.type === 'T8' && (p[3] !== v.x.id || !/^O\d+$/u.test(p[4]))) faults.push(`${v.q.id} : une scène qui n’est pas une observation de la fiche de ${v.x.name}`)
      // un vrai ou faux ne juge qu'une phrase de la fiche de X : l'un de ses tests d'élimination (E), de ses signes clés
      // (K), de ses signes « 0 preuve » (T) ou de ses observations (O). Ni signe d'une entité proche, ni comportement
      // ou capacité (B, A : ils redisaient les signes clés), ni phrase de départage (L)
      if (v.type === 'T6' && (p[3] !== v.x.id || !/^[EKTO]\d+$/u.test(p[4]))) faults.push(`${v.q.id} : un vrai ou faux qui ne vient pas de la fiche de ${v.x.name}`)
      if (v.source.id !== v.x.id) faults.push(`${v.q.id} : la phrase jugée vient de la fiche de ${v.source.name}`)
      if (v.type === 'T6') expect(v.q.prompt.replace(/[\u00a0\u202f]/gu, ' '), v.q.id).toMatch(/^Vrai ou faux pour .+ \?$/u)
    }
    expect(faults, [...new Set(faults)].slice(0, 12).join('\n')).toEqual([])
    // le test mord : des vrai ou faux se posent bien, « Faux » compris
    const judged = all.filter((v) => v.type === 'T6')
    measure(`b. vrai ou faux : ${judged.length} dans ${corpus.length} copies, dont ${judged.filter((v) => v.q.correct[0] === FALSE).length} « Faux », tous tirés d’un test d’élimination de X`)
    // (huit fiches posent un vrai ou faux, voir PAIRED : mesuré, 84 « Faux » et 93 « Vrai » dans 900 copies)
    expect(judged.filter((v) => v.q.correct[0] === FALSE).length).toBeGreaterThan(60)
    expect(judged.filter((v) => v.q.correct[0] === TRUE).length).toBeGreaterThan(60)
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
    // la longueur de la citation d'un « est-ce que ça suffit ? » : un écart connu, borné à ce qui se mesure (voir QUOTE_LENGTH_EDGE)
    for (const type of ['T3b', 'T8'] as const) {
      let worst = { name: '', edge: 0 }
      for (const least of QUOTE_LENGTHS) {
        for (const long of [YES, NO]) {
          const name = `${type === 'T3b' ? 'ce test suffit-il' : 'observation'} : « ${long === YES ? 'Oui' : 'Non'} » si la citation fait ${least} caractères et plus, sinon « ${long === YES ? 'Non' : 'Oui'} »`
          const s = play(all, byQuoteLength(type, least, long))
          expect(s.n, name).toBeGreaterThan(100)
          if (s.got - s.chance > worst.edge) worst = { name: `${name} : ${say(s)}`, edge: s.got - s.chance }
          expect(s.got, `${name} : ${say(s)} (plafond ${(s.chance + QUOTE_LENGTH_EDGE).toFixed(1)} %)`).toBeLessThanOrEqual(s.chance + QUOTE_LENGTH_EDGE)
        }
      }
      measure(`c. longueur de la citation, au pire seuil : ${worst.name} (écart ${worst.edge.toFixed(1)}, plafond +${QUOTE_LENGTH_EDGE})`)
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

  it('c. D11. la tournure d’une observation ne souffle pas sa réponse : « un mot d’impression, donc Non » ne paie plus, et qui a appris les mots des autres fiches reste sous son plafond', () => {
    const scenes = all.filter((v) => v.type === 'T8')
    expect(scenes.length).toBeGreaterThan(300)
    const yes = scenes.filter((v) => v.q.correct[0] === YES).length
    // 1. la règle écrite à la main : un mot d'impression (« souvent », « semble », « un peu », « jamais »…) : « Non » ; sinon : « Oui »
    const rule = scenes.filter((v) => VAGUE.test(v.q.quote!) === (v.q.correct[0] === NO)).length
    // 2. le joueur qui a appris, sur les observations corrigées des 29 autres entités, quels mots vont avec quelle réponse
    // (un classement bayésien naïf, comme l'outil du relecteur) : il ne sait rien de l'entité de la copie
    const known = GHOSTS.flatMap((g) =>
      soloSupply(g, GHOSTS)
        .filter((s) => s.type === 'T8')
        .flatMap((s) => {
          const q = soloQuestion(g, GHOSTS, s.id, createRng(1))
          return q ? [{ who: g.id, words: tokens(q.quote!), yes: q.correct[0] === YES }] : []
        }),
    )
    const guess = new Map<string, (quote: string) => boolean>()
    for (const g of GHOSTS) {
      const train = known.filter((k) => k.who !== g.id)
      const ny = train.filter((k) => k.yes).length
      const nn = train.length - ny
      const count = (of: boolean) => {
        const c = new Map<string, number>()
        for (const k of train) if (k.yes === of) for (const w of k.words) c.set(w, (c.get(w) ?? 0) + 1)
        return c
      }
      const [cy, cn] = [count(true), count(false)]
      guess.set(g.id, (quote) => {
        let s = Math.log((ny + 1) / (nn + 1))
        for (const w of tokens(quote)) if ((cy.get(w) ?? 0) + (cn.get(w) ?? 0) >= 3) s += Math.log(((cy.get(w) ?? 0) + 1) / (ny + 2)) - Math.log(((cn.get(w) ?? 0) + 1) / (nn + 2))
        return s > 0
      })
    }
    const learnt = scenes.filter((v) => guess.get(v.x.id)!(v.q.quote!) === (v.q.correct[0] === YES)).length
    const pct = (n: number) => (100 * n) / scenes.length
    measure(`c. D11. observations : ${scenes.length}, « Oui » ${pct(yes).toFixed(1)} % ; « mot d’impression : Non » ${pct(rule).toFixed(1)} % (plafond ${WORDING_CEILING.rule}) ; joueur qui a appris les mots des autres fiches ${pct(learnt).toFixed(1)} % (plafond ${WORDING_CEILING.learnt})`)
    expect(pct(rule), `« mot d’impression : Non » : ${pct(rule).toFixed(1)} %`).toBeLessThanOrEqual(WORDING_CEILING.rule)
    expect(pct(learnt), `joueur qui a appris les mots des autres fiches : ${pct(learnt).toFixed(1)} %`).toBeLessThanOrEqual(WORDING_CEILING.learnt)
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
     * Un fait se demande une fois pour dire à qui il est, puis une fois pour dire ce qu'il vaut (« est-ce que ça
     * suffit ? ») : `b`, posée après `a` sur le même fait, est permise si elle demande ce qu'il vaut et que `a` demandait
     * à qui il est. Deux « est-ce que ça suffit ? » sur le même fait ne vont jamais ensemble, quelle que soit leur
     * réponse : au même verdict ils se répètent, à verdicts opposés ils déroutent.
     */
    const otherAngle = (a: View, b: View) => asksWorth(b) && !asksWorth(a)
    const readEarlier: string[] = []
    const valueShown: string[] = []
    const askedTwice: string[] = []
    const worthFirst: string[] = []
    const judgedTwice: string[] = []
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
          // 0. deux citations jugées (vrai ou faux, « est-ce que ça suffit ? ») : aucune ne commence comme un passage de
          // l'autre, dans un ordre comme dans l'autre. Deux angles sur un fait vont ensemble, pas deux fois la même phrase
          if (a.q.quote && b.q.quote) {
            const [qa, qb] = [bare(a.q.quote), bare(b.q.quote)]
            if ((qa.length >= 20 && qb.includes(qa.slice(0, 60))) || (qb.length >= 20 && qa.includes(qb.slice(0, 60)))) judgedTwice.push(`${tag} : « ${b.q.quote.slice(0, 80)} »`)
          }
          // 1. la phrase de la réponse, déjà lue telle quelle (énoncé, citation, réponses, corrigé)
          if (!NUMERIC.test(b.q.id) && !isLos(b.q) && start.length >= 20 && screens[i].includes(start)) readEarlier.push(`${tag} : « ${answer.slice(0, 80)} »`)
          // une valeur de la réponse, déjà montrée ; ou deux réponses qui disent le même fait
          const told = new Set(shown[i].flatMap((t) => valuesOf(c.x.id, t)))
          const hit = values.filter((k) => told.has(k))
          const same = alike(answerText(a), answer) >= SAME_FACT || answerValues(a).some((k) => values.includes(k))
          if (!hit.length && !same) continue
          if (otherAngle(a, b)) twoAngles++
          // 2. ce que vaut le fait, puis à qui il est : le corrigé de la première l'a dit
          else if (same && asksWorth(a) && !asksWorth(b)) worthFirst.push(tag)
          // 3. le même fait, deux fois sous le même angle (deux « est-ce que ça suffit ? » compris)
          else if (same) askedTwice.push(tag)
          // 4. une valeur de la réponse, lue plus tôt
          else valueShown.push(`${tag} : ${hit.join(', ')}`)
        }
      }
    }
    const some = (list: string[]) => [...new Set(list)].slice(0, 12).join('\n')
    measure(`e. ${pairs} paires de questions ; même phrase jugée deux fois ${judgedTwice.length}, réponse déjà lue ${readEarlier.length}, valeur déjà montrée ${valueShown.length}, « ce que ça vaut » avant « à qui est-ce » ${worthFirst.length}, même fait sous le même angle ${askedTwice.length} ; deux angles (permis) ${twoAngles}, soit ${(twoAngles / corpus.length).toFixed(2)} par copie`)
    for (const l of [...new Set(askedTwice)]) measure(`e.   même angle : ${l}`)
    for (const l of [...new Set(valueShown)]) measure(`e.   valeur montrée : ${l}`)
    expect(judgedTwice, some(judgedTwice)).toHaveLength(0)
    expect(readEarlier, some(readEarlier)).toHaveLength(0)
    expect(valueShown, some(valueShown)).toHaveLength(0)
    expect(worthFirst, some(worthFirst)).toHaveLength(0)
    expect(askedTwice, some(askedTwice)).toHaveLength(0)
    // les deux angles : mesurés, pour que leur part ne grimpe pas sans qu'on le voie (204 paires, soit 0,23 par copie)
    expect(pairs).toBeGreaterThan(PAIRS_FLOOR)
    expect(twoAngles / corpus.length, `${twoAngles} paires « à qui est-ce, puis ce que ça vaut » sur ${corpus.length} copies`).toBeLessThanOrEqual(0.6)
  })

  /* ---------- f. la forme ---------- */

  it('f. des réponses de même forme ; les réponses fixes dans leur ordre ; les questions à deux réponses : trois au plus, ou la moitié de la copie ; cinq à moins de quatre', () => {
    const fixed: Partial<Record<SoloType, string[]>> = {
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
    expect(composed).toBeGreaterThan(COMPOSED_FLOOR)
    for (const [key, set] of labels) expect(set.size, key).toBe(1)
    // les mots de l'observation, les mêmes pour toutes les entités : « Oui, ça suffit », « Non, ce n'est qu'un indice »
    const observation = new Set(all.filter((v) => v.type === 'T8').map((v) => v.q.choices.map((c) => c.label).join(' | ')))
    expect([...observation]).toEqual(['Oui, ça suffit | Non, ce n’est qu’un indice'])
    // la variété : les questions à deux réponses (une sur deux se trouve au hasard) sont trois au plus dans toute copie,
    // et au-delà jamais plus de la moitié de la copie (quatre sur sept ou huit, cinq sur neuf ou dix) ; cinq questions
    // au plus ont moins de quatre réponses : une copie de dix compte donc cinq questions à quatre réponses au moins.
    let beyondThree = 0
    for (const c of corpus) {
      // un seul vrai ou faux et un seul « est-ce que ça suffit ? » (un test ou une observation) par copie : aucune réponse
      // fixe ne se déduit de la précédente, et ce que vaut un fait ne se demande jamais deux fois
      expect(c.views.filter((v) => v.type === 'T6').length, `${c.x.id} (graine ${c.seed}) : vrai ou faux`).toBeLessThanOrEqual(1)
      expect(c.views.filter(isWorth).length, `${c.x.id} (graine ${c.seed}) : « est-ce que ça suffit ? »`).toBeLessThanOrEqual(1)
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
    const under = sizes.filter((n) => n < 5).length
    measure(`g. copies de dix : ${sizes.filter((n) => n === SOLO_COUNT).length}/${sizes.length} ; taille moyenne ${(all.length / corpus.length).toFixed(2)} ; copies de moins de cinq questions : ${under}/${sizes.length} ; plus petites copies : ${JSON.stringify(measured)}`)
    for (const x of GHOSTS) {
      const mine = of(x)
      const over = Math.max(...mine.filter((c) => c.seen).map((c) => c.qs.filter((q) => c.seen!.includes(q.id)).length / Math.max(1, c.qs.length)))
      const kinds = new Map<string, number>()
      for (const v of mine.flatMap((c) => c.views)) kinds.set(v.type, (kinds.get(v.type) ?? 0) + 1)
      const short = mine.filter((c) => c.qs.length < 5)
      measure(`g.   ${x.id} : min ${Math.min(...mine.map((c) => c.qs.length))}, moyenne ${(mine.reduce((n, c) => n + c.qs.length, 0) / mine.length).toFixed(1)}, moins de cinq ${short.length}/${mine.length} (dont « Encore 10 » ${short.filter((c) => c.seen).length}), dix ${mine.filter((c) => c.qs.length === SOLO_COUNT).length}/${mine.length}, reprise max ${(100 * over).toFixed(0)} %, questions distinctes ${new Set(mine.flatMap((c) => c.qs.map((q) => q.id))).size} ; ${[...kinds].map(([t, n]) => `${t} ${n}`).join(', ')}`)
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
      const again = c.views.filter((b) => before.some((a) => a.q.id === b.q.id || (asksWorth(a) === asksWorth(b) && alike(answerText(a), answerText(b)) >= SAME_FACT))).length
      chained++
      sum += again / c.views.length
      if (again > c.views.length / 2) beyondHalf++
    }
    measure(`g. « Encore 10 », par fait : ${((100 * sum) / chained).toFixed(0)} % de la copie en moyenne reprend un fait de la précédente ; ${beyondHalf} copies sur ${chained} en reprennent plus de la moitié`)
    expect(sum / chained, 'part moyenne des faits repris d’une copie à la suivante').toBeLessThanOrEqual(0.4)
    // Un signe déjà demandé compte aussi sous son autre forme (« lequel de ces signes… », puis « vrai ou faux », voir
    // sameSign dans solo.ts). Mesuré : 40 copies sur 444
    expect(beyondHalf / chained, `${beyondHalf} copies sur ${chained} reprennent plus de la moitié des faits de la précédente`).toBeLessThanOrEqual(CHAINED_CEILING)
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
    // la longueur des copies, pour qu'elle ne fonde pas sans qu'on le voie (voir MEAN_SIZE et UNDER_FIVE)
    expect(all.length / corpus.length, 'taille moyenne des copies').toBeGreaterThanOrEqual(MEAN_SIZE)
    expect(under, 'copies de moins de cinq questions').toBeLessThanOrEqual(UNDER_FIVE)
  })

  /* ---------- h. la vérité ---------- */

  it('h. vrai ou faux : « Faux » pour l’un des tests d’élimination de X et rien d’autre, « Vrai » pour ses signes et ses observations', () => {
    const plain = (t: string) => t.replace(/[\u00a0\u202f]/gu, ' ')
    const seen = { E: 0, K: 0, T: 0, O: 0 }
    for (const v of all) {
      if (v.type !== 'T6') continue
      const tag = v.q.id.split(':')[4] ?? ''
      const rank = Number(tag.slice(1))
      const quote = v.q.quote!
      expect(tag, v.q.id).toMatch(/^[EKTO]\d+$/u)
      seen[tag[0] as keyof typeof seen]++
      expect(GHOSTS.some((g) => namesGhost(quote, g)), `${v.q.id} : « ${quote} »`).toBe(false)
      if (tag[0] === 'E') {
        // « Faux » : la condition de l'un des tests d'élimination de X (« si l'entité rallume le disjoncteur, ce n'est pas
        // un Hantu »), telle que la fiche l'écrit ; le corrigé est cette ligne de la fiche
        const line = v.x.eliminationTests[rank].text
        expect(v.q.correct, v.q.id).toEqual([FALSE])
        expect(within(quote, line), `${v.q.id} : « ${quote} »`).toBeGreaterThanOrEqual(0.8)
        expect(plain(v.q.explain), v.q.id).toBe(plain(`Faux. ${withoutSourceSentences(line)}`))
        continue
      }
      // « Vrai » : un signe clé, un signe « 0 preuve » ou une observation de la fiche de X, et rien d'autre
      expect(v.q.correct, `${v.q.id} : « ${quote} »`).toEqual([TRUE])
      if (tag[0] === 'K') expect(plain(quote), v.q.id).toBe(plain(v.x.keyTells[rank]))
      else if (tag[0] === 'T') expect(from(quote, v.x.tells.filter((t) => t.zeroEvidence).map((t) => t.text)), `${v.q.id} : « ${quote} »`).toBe(true)
      else {
        const o = v.x.observations[rank]
        expect(o.requires, v.q.id).toBeUndefined()
        expect(within(quote, o.text), `${v.q.id} : « ${quote} »`).toBeGreaterThanOrEqual(0.8)
      }
    }
    measure(`h. vrai ou faux : ${seen.E} tests d’élimination de X (« Faux ») ; « Vrai » : ${seen.K} signes clés, ${seen.T} signes « 0 preuve », ${seen.O} observations`)
    // chaque sorte de phrase a servi
    for (const [k, n] of Object.entries(seen)) expect(n, k).toBeGreaterThan(0)
  })

  it('h. « ça suffit », « ce n’est qu’un indice » : seulement ce que la fiche prouve', () => {
    const seenAnswers = { 'T8 yes': 0, 'T8 no': 0, 'T3b yes': 0, 'T3b no': 0 }
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

  it('h. le Mimic : ses tests, ses observations, ses questions rédigées ; et il n’est jamais cité ailleurs', () => {
    const mimic = getGhost(MIMIC)!
    const mine = of(mimic).flatMap((c) => c.views)
    expect(mine.length).toBeGreaterThan(60)
    for (const v of mine) {
      // ni nombres, ni signe à reconnaître, ni vrai ou faux : il copie l'entité imitée
      expect(['T3b', 'T8', 'auth'], v.q.id).toContain(v.type)
      expect(v.source.id, v.q.id).toBe(MIMIC)
    }
    for (const v of all) {
      if (v.x.id === MIMIC) continue
      // ni signe du Mimic parmi les réponses, ni son nom
      expect(v.q.choices.map((c) => c.id), v.q.id).not.toContain(MIMIC)
      expect(strays.get(MIMIC)!(v.q), v.q.id).toBe(false)
    }
    // et dans toute la réserve, pas seulement dans le corpus
    for (const g of GHOSTS) for (const s of soloSupply(g, GHOSTS)) if (g.id !== MIMIC) expect(s.id.split(':').slice(2), s.id).not.toContain(MIMIC)
    for (const s of soloSupply(mimic, GHOSTS)) expect(['T3b', 'T8', 'auth'], s.id).toContain(s.type)
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
    expect(p95, `médiane ${median.toFixed(0)} ms, 95e centile ${p95.toFixed(0)} ms`).toBeLessThan(400)
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
            // rien, avant le corrigé, ne nomme une autre entité ; jamais un nom d'entité parmi les réponses
            expect(namedIn(q, x).map((o) => o.name), `${tag} : ${q.id}`).toEqual([])
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
    expect(soloFacets('phantom')).toEqual([])
    expect(soloFacetsOf('phantom', 'Disparaît quand on la prend en photo')).toEqual([])
    // l'Esprit a sa table depuis le 18 novembre 2026 : le délai après un encens, et le test du double encens
    expect(soloFacets('spirit')).toEqual(['encens'])
    expect(soloFacetsOf('spirit', 'Attend 180 s après un encens')[0].facts).toEqual(['délai'])
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
    ])
  })
})

/* =====================================================================================================================
 * Toute la réserve : chaque question possible de chaque entité, composée plusieurs fois, et pas seulement ce qu'un
 * tirage de copies fait sortir (la plupart des défauts trouvés à la relecture sortaient moins d'une fois sur vingt
 * copies). Les règles du 19 novembre 2026, une par test : tout vient de la fiche de X (vrai ou faux compris), « Oui,
 * ça suffit » ne se dit que d'une ligne qui tient seule, un test d'élimination se juge avec toutes ses conditions,
 * un signe « Seule entité… » et un « est-ce que ça suffit ? » sur le même fait ne vont pas ensemble, ce que vaut un
 * fait ne se demande qu'une fois, la tournure d'une observation ne souffle pas sa réponse, rien ne cite une preuve ni
 * une source inconnue de l'élève.
 * ===================================================================================================================== */

/** Une chasse qui part trop tôt, ou de là où l'entité ne chasse pas (voir EARLY_HUNT, solo.ts) : ne vaut que « sans objet maudit ». */
const EARLY_HUNT =
  /(?:une|nouvelle) chasse (?:démarre|commence)|chass\p{L}*\s+(?:de nouveau\s+|naturellement\s+(?:\([^()]*\)\s+)?)?(?:avant|au-dessus|dans les)(?!\p{L})|tente de (?:chasser|lancer)|lance une chasse/iu
const CURSED = /objets?\s+maudits?/iu
/** « Seule entité qui peut… », « Seule à… » : le signe dit que le fait désigne l'entité. */
const SAYS_ONLY = /(?<!\p{L})seule?s?\s+(?:entités?|à)(?!\p{L})/iu
/** Ce qui suit la conclusion d'un test (« …, c'est un Hantu : … L'Obambo change aussi de vitesse… »). */
function afterConclusion(text: string, x: Ghost): string {
  const names = [...new Set([x.name, x.nameEn].map((n) => n.replace(/^(?:The |Le |Les |La |L['’])/u, '')))].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const m = new RegExp(`(?:c[’']est(?:\\s+peut-être)?|ce\\s+sont|ça\\s+(?:pourrait|peut)\\s+être|désigne)\\s+(?:une?\\s+|le\\s+|la\\s+|les\\s+|l[’'])?(?:${names})(?!\\p{L})`, 'u').exec(text)
  return m ? text.slice(m.index + m[0].length) : ''
}
const othersIn = (text: string, x: Ghost) => GHOSTS.filter((o) => o.id !== x.id && namesGhost(text, o))

/**
 * Les « Oui, ça suffit » dont la fiche nomme une autre entité après sa conclusion (ou dans la raison qu'elle donne),
 * relus un à un : la phrase dit ce qui sépare les deux entités, et la condition citée dans la question l'écarte déjà.
 * Toute autre ligne décisive qui nomme une autre entité ne se pose pas (voir TOLD_APART, solo.ts) : la fiche y dit
 * que cette entité ferait pareil.
 */
const TOLD_APART: Readonly<Record<string, RegExp>> = {
  'q:suffit:deogen:0': /une Dayan ne ralentit que si tu restes immobile/u,
  'q:suffit:gallu:0': /le Spectre ne perturbe pas le sel non plus, mais reste à 1,7 m\/s/u,
  'q:suffit:oni:0': /le Deogen aussi est plus visible en chasse, mais sa vitesse est complètement différente/u,
  'q:suffit:revenant:0': /bien plus rapide qu’un Djinn ou un Raiju/u,
  'q:constat:spirit:spirit:O0': /ni un Démon, le plus rapide, avant 60 s/u,
  'q:constat:spirit:spirit:O1': /ni un Démon, le plus rapide, avant 60 s/u,
}
/** Ce qu'un corrigé ne dit jamais après « Oui » : qu'une autre entité ferait de même. */
const DOES_THE_SAME = /pareil|ferait de même|confondre|(?:change|ralentit|accélère|accélèrent|chasse)\s+aussi|peut chasser tôt|attention\s*:/iu
/** Les lignes décisives écartées parce que la fiche y nomme une entité qui ferait pareil (relevées le 19 novembre 2026). */
const NOT_ALONE = ['q:suffit:wraith:0', 'q:suffit:wraith:1', 'q:suffit:hantu:1', 'q:suffit:moroi:3', 'q:suffit:raiju:1', 'q:suffit:jinn:0', 'q:suffit:demon:2', 'q:constat:moroi:moroi:O4'] as const
/** Un test décisif relu de même, mais trop long pour se citer : « si la première [ligne de sel] est perturbée mais pas les deux suivantes » (le Spectre ne perturbe jamais le sel). */
const TOLD_APART_UNASKED = ['q:suffit:gallu:2'] as const
/** Les observations décisives qui redisent un tel test, mais portent elles-mêmes ce qui écarte l'entité nommée. */
const KEEPS_APART: Readonly<Record<string, RegExp>> = {
  'q:constat:jinn:jinn:O0': /sans électronique allumée à proximité/u,
  'q:constat:demon:demon:O3': /hors Sunny Meadows/u,
}

/**
 * Les signes « Seule entité… » des fiches, et les « est-ce que ça suffit ? » sur le même fait. Les deux ne vont
 * jamais dans la même copie : le signe soufflerait « Oui » ; et pour le Yurei, dont la fiche ne tient pas la porte
 * de sortie pour décisive (un indice fort, aucun test de confirmation), il contredirait « Non, ce n'est qu'un indice ».
 * Une fiche qui gagne un signe « Seule… » doit entrer ici (le test le demande), avec ses questions.
 */
const ONLY_SIGNS: Readonly<Record<string, { sign: RegExp; worth: readonly string[] }>> = {
  // « Seule entité qui peut faire plus de 4 pas juste après avoir marché dans du sel »
  gallu: { sign: /plus de 4 pas/u, worth: ['q:suffit:gallu:3'] },
  // « Seule entité qui ne peut pas faire clignoter les lumières en laissant un EMF 2 à l'interrupteur » : aucune observation, aucun test ne le reprend
  mare: { sign: /clignoter les lumières/u, worth: [] },
  // « Seule entité capable d'éteindre deux fois la même flamme en moins de 20 s »
  onryo: { sign: /même flamme/u, worth: ['q:suffit:onryo:0', 'q:constat:onryo:onryo:O4'] },
  // « Seule entité qui peut apparaître en silhouette noire au cercle d'invocation, à la boîte à musique ou à la patte de singe »
  shade: { sign: /silhouette noire/u, worth: ['q:suffit:shade:1', 'q:suffit:shade:2', 'q:constat:shade:shade:O0', 'q:constat:shade:shade:O1', 'q:constat:shade:shade:O5'] },
  // « Seule entité qui peut annoncer un âge de 90 ans ou plus à la planche Ouija »
  thaye: { sign: /90 ans ou plus/u, worth: ['q:suffit:thaye:1'] },
  // « Seule à fermer ou toucher une porte de sortie hors chasse et hors événement » : ses observations sont des indices forts
  yurei: { sign: /porte de sortie/u, worth: ['q:constat:yurei:yurei:O0', 'q:constat:yurei:yurei:O1'] },
}

/**
 * Les « est-ce que ça suffit ? » (tests C, observations O) qui décrivent la même chose sur une fiche, relevés à la
 * relecture : un seul par copie, quelle que soit sa réponse. Des scènes presque identiques aux verdicts opposés
 * déroutent (le murmure du Moroï : « ta santé mentale continue de baisser même dans une pièce éclairée », oui ; « la
 * santé mentale d'un joueur semble baisser plus vite », non), au même verdict elles se répètent. Certaines ne se posent
 * plus (un indice écrit comme une impression) : elles restent listées, pour le jour où elles reviendraient.
 */
const SAME_SCENE: Readonly<Record<string, readonly (readonly string[])[]>> = {
  moroi: [['O2', 'C2', 'C4']],
  gallu: [['C4', 'O0', 'C2']],
  dayan: [['C1', 'O0', 'C0']],
  jinn: [['O1', 'O0', 'C0']],
  myling: [['O4', 'O0', 'O1', 'C0'], ['O3', 'O5', 'C1'], ['O6', 'C2']],
  aswang: [['C1', 'C3', 'O2'], ['C0', 'O0', 'O1']],
  shade: [['O5', 'O0', 'O1', 'C1', 'C2']],
  yokai: [['O5', 'O1', 'O3', 'C0'], ['O6', 'C1']],
  phantom: [['C3', 'C4', 'O4'], ['C0', 'C1', 'O0'], ['C2', 'O1']],
  wraith: [['C2', 'O4'], ['C0', 'C1', 'O0', 'O1', 'O2']],
  poltergeist: [['C1', 'O0'], ['C0', 'O1', 'O4']],
  demon: [['O1', 'O2', 'C1'], ['O0', 'C0'], ['O3', 'C2']],
  oni: [['O0', 'C1'], ['O1', 'O2', 'C0']],
  obake: [['O0', 'C0'], ['O8', 'C1']],
  banshee: [['O0', 'C0']],
  hantu: [['O0', 'C0']],
  deogen: [['O0', 'C0']],
  raiju: [['O6', 'C2'], ['O0', 'C0'], ['O1', 'C1']],
  thaye: [['O3', 'C0', 'C1']],
  spirit: [['O0', 'O1']],
  'the-twins': [['O2', 'O5', 'C0'], ['O0', 'O1', 'O3', 'C1']],
  'the-mimic': [['O1', 'C1']],
  revenant: [['O0', 'C0']],
  obambo: [['O0', 'C0', 'C1', 'O5']],
}
const worthId = (x: string, tag: string) => (tag[0] === 'C' ? `q:suffit:${x}:${tag.slice(1)}` : `q:constat:${x}:${x}:${tag}`)

/**
 * Le même fait dit avec d'autres mots, relevé à la relecture des copies : une seule question par copie le demande
 * (à qui est-il ?), signe, vrai ou faux ou question rédigée. Le texte demandé : la bonne réponse d'un « lequel de
 * ces signes… ? », la phrase d'un vrai ou faux, l'énoncé et la bonne réponse d'une question rédigée.
 */
const SAME_FACT_WORDS: Readonly<Record<string, readonly (readonly [string, RegExp])[]>> = {
  oni: [['plus actif à plusieurs', /plusieurs (?:joueurs|personnes)/u]],
  'the-twins': [['deux interactions', /interactions? (?:quasi|en même)|2 interactions|[Dd]eux interactions|deux portées/u]],
  thaye: [['activité qui baisse', /actif|activité/u]],
  shade: [['la pièce où se trouve un joueur', /pièce où|même pièce/u]],
  yokai: [['plus actif quand on parle', /actif|activité/u]],
  onryo: [['la 3e flamme', /3e|compteur/u]],
}
/**
 * L'énoncé ou le corrigé de la première question soufflait la réponse de la seconde (relevé le 19 novembre 2026) :
 * la seconde ne vient jamais après la première dans une copie.
 */
const NEVER_AFTER: readonly (readonly [string, RegExp, RegExp, string])[] = [
  ['yokai', /^q:san:yokai:80$/u, /^q:auth:yokai:4$/u, '« … si quelqu’un parle dans sa pièce » puis « Quand un Yokai est-il plus actif ? »'],
  ['onryo', /^q:auth:onryo:5$/u, /^q:auth:onryo:0$/u, '« … après que son compteur a atteint 3 » puis « Après combien de flammes éteintes… ? »'],
  ['banshee', /^q:auth:banshee:[12]$/u, /^q:constat:banshee:banshee:O0$/u, '« … le cri unique de la Banshee » puis « tu entends un cri strident et unique : est-ce que ça suffit ? »'],
  ['kormos', /^q:constat:kormos:kormos:O[12]$/u, /^q:(?:sign-of:kormos:(?:1|t1)|vf:kormos:kormos:(?:K1|T1)|auth:kormos:1)$/u, 'la scène du joueur détecté de loin puis « Détecte tes déplacements… »'],
  ['moroi', /^q:constat:moroi:moroi:O6$/u, /^q:auth:moroi:0$/u, '« … un peu plus lentes que la normale » puis « À quelle vitesse de base… ? »'],
]

describe('« Me tester sur X » : tout vient de la fiche de X, rien de faux ni d’à moitié vrai (toute la réserve)', () => {
  interface Drawn {
    x: Ghost
    q: Question
    v: View
  }
  let supply: Drawn[] = []
  /** des copies de dix et de trente questions (le quiz général réduit à une entité en demande jusqu'à trente) */
  const copiesOf = new Map<string, Question[][]>()
  const byType = (...types: SoloType[]) => supply.filter((d) => types.includes(d.v.type))
  const ids = (x: Ghost) => soloSupply(x, GHOSTS).map((s) => s.id)
  /** Les signes d'autres entités que la question montre comme mauvaises réponses : sa phrase, et l'entité d'où elle vient. */
  const wrongSigns = (d: Drawn): { text: string; from: Ghost }[] => (d.v.type === 'T2' ? d.v.wrong.map((c) => ({ text: c.label, from: getGhost(c.id)! })) : [])

  beforeAll(() => {
    supply = []
    for (const [k, x] of GHOSTS.entries()) {
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
      const runs: Question[][] = []
      for (let j = 0; j < 60; j++) runs.push(buildSoloQuiz({ ghost: x, allGhosts: GHOSTS, rng: createRng(770_000 + k * 7919 + j * 104_729), count: j % 3 === 2 ? 30 : SOLO_COUNT }))
      copiesOf.set(x.id, runs)
    }
  }, 300_000)

  it('un signe vrai de toutes les entités n’est jamais une mauvaise réponse (les Jumeaux : « ne réagissent qu’à sa position réelle »)', () => {
    // le signe des Jumeaux est bien de ceux-là : s'il est reformulé, relire TRUE_OF_ALL (quiz.ts) avec la fiche
    const twins = getGhost('the-twins')!
    const sign = twins.keyTells.find((t) => /détecteurs? de mouvement/iu.test(t))!
    expect(TRUE_OF_ALL.test(sign), sign).toBe(true)
    let checked = 0
    for (const d of supply) {
      for (const f of wrongSigns(d)) {
        checked++
        expect(TRUE_OF_ALL.test(f.text), `${d.q.id} : « ${f.text} »`).toBe(false)
        expect(f.from.id, d.q.id).not.toBe(MIMIC)
        expect(f.from.id, d.q.id).not.toBe(d.x.id)
      }
    }
    measure(`signes d’autres fiches en mauvaises réponses, dans la réserve : ${checked}`)
    expect(checked).toBeGreaterThan(WRONG_SIGNS_FLOOR)
  })

  it('une mauvaise réponse de « lequel de ces signes… ? » ne redit pas une mécanique commune (« ralentit… à ta dernière position connue ») sans ses valeurs, ne cite pas une vitesse trop proche de celle de X, et ne dit pas « peut chasser à N % » d’une entité qui chasse déjà à ce niveau', () => {
    // la mécanique, telle que l'app l'enseigne : toute entité garde sa vitesse jusqu'à la dernière position connue, puis la perd
    const rule = MECHANICS.topics.flatMap((t) => t.facts).find((f) => /dernière position connue/iu.test(f.text) && !GHOSTS.some((g) => namesGhost(f.text, g)))
    expect(rule, 'la mécanique de la ligne de vue perdue').toBeDefined()
    let seen = 0
    for (const d of supply) {
      const top = Math.max(...thresholds(d.x))
      for (const f of wrongSigns(d)) {
        // « ~1,5 ou ~1,9 m/s » (les Jumeaux) face à l'Aswang, à 1,53 m/s : trop près pour être le signe d'une autre
        expect(nearSpeed(f.text, d.x), `${d.q.id} : « ${f.text} »`).toBe(false)
        // « Peut chasser à 65 % près d'un équipement électronique actif » (le Raiju) : à moitié vrai d'un Thayé jeune (75 %)
        for (const m of f.text.matchAll(/(?:peut|peuvent)\s+chasser[^.;·]*?(\d+)\s?%/giu)) expect(Number(m[1]), `${d.q.id} : « ${f.text} » face à ${d.x.name}, qui chasse jusqu’à ${top} %`).toBeGreaterThan(top)
        if (!/dernière position/iu.test(f.text)) continue
        seen++
        // « Garde 3,0 m/s jusqu'à ta dernière position connue, puis ralentit peu à peu jusqu'à 1,0 m/s » : faux pour qui n'a pas ces vitesses
        expect(f.text, `${d.q.id} : « ${f.text} »`).toMatch(/\d,\d\sm\/s/u)
      }
    }
    expect(seen).toBeGreaterThan(0)
    const aswang = getGhost('aswang')!
    expect(nearSpeed('Vitesse de chasse ~1,5 ou ~1,9 m/s, tirée au hasard à chaque chasse', aswang)).toBe(true)
    // la phrase du Revenant porte ses vitesses : elle n'est plus vraie de toute entité qui accélère en ligne de vue
    const slows = getGhost('revenant')!.keyTells.find((t) => /dernière position connue/iu.test(t))!
    expect(slows).toMatch(/3,0\sm\/s/u)
    expect(slows).toMatch(/1,0\sm\/s/u)
  })

  it('D1, D2, D3, D14. toute la réserve vient de la fiche de X : ni départage, ni « quel test confirme X ? », ni intrus, ni signe d’une autre fiche à juger ; un profil de vitesse seulement là où la fiche n’a aucun nombre à demander', () => {
    const names = new Set(GHOSTS.flatMap((g) => [g.name, g.nameEn, `${g.name} (${g.nameEn})`]))
    const faults: string[] = []
    const profiles: string[] = []
    const judging: string[] = []
    for (const x of GHOSTS) {
      const mine = soloSupply(x, GHOSTS)
      for (const s of mine) {
        const p = s.id.split(':')
        // les sortes retirées : « de qui parle-t-on ? », le départage, « quel test confirme X ? », l'intrus, « dans lequel
        // de ces cas peux-tu exclure X ? », le profil de seuil
        if (GONE_KINDS.test(s.id) || soloType(s.id) === null) faults.push(`${s.id} : une sorte de question qui ne se pose plus`)
        // seules les observations de la fiche de X se demandent en « est-ce que ça suffit ? »
        if (p[1] === 'constat' && (p[2] !== x.id || p[3] !== x.id || !/^O\d+$/u.test(p[4]))) faults.push(`${s.id} : une scène qui n’est pas une observation de la fiche de ${x.name}`)
        // un vrai ou faux : une phrase de la fiche de X (test d'élimination, signe clé, signe « 0 preuve », observation)
        if (p[1] === 'vf' && (p[2] !== x.id || p[3] !== x.id || !/^[EKTO]\d+$/u.test(p[4]))) faults.push(`${s.id} : un vrai ou faux qui ne vient pas de la fiche de ${x.name}`)
        if (p[1] === 'spdsum') profiles.push(x.id)
      }
      // le vrai ou faux ne se pose que pour une fiche qui a un test d'élimination à citer
      const judged = mine.filter((s) => s.type === 'T6')
      if (judged.length) {
        judging.push(x.id)
        expect(judged.some((s) => /:E\d+$/u.test(s.id)), x.id).toBe(true)
      }
      // le profil de vitesse (quatre résumés, dont trois d'autres entités) : seulement sans aucun nombre à demander ;
      // jamais de profil de seuil
      expect(mine.some((s) => s.id.startsWith('q:spdsum:')), x.id).toBe(x.id !== MIMIC && asksOf('spd', x).length === 0)
    }
    for (const d of supply) {
      const p = d.q.id.split(':')
      for (const c of d.q.choices) if (names.has(c.label)) faults.push(`${d.q.id} : « ${c.label} » parmi les réponses`)
      expect(d.q.ghostId, d.q.id).toBe(d.x.id)
      expect(d.v.source.id, d.q.id).toBe(d.x.id)
      if (p[1] === 'vf') expect(d.q.correct, d.q.id).toEqual([p[4][0] === 'E' ? SOLO_ANSWERS.trueFalse.false : SOLO_ANSWERS.trueFalse.true])
    }
    expect(faults, [...new Set(faults)].slice(0, 12).join('\n')).toEqual([])
    // chaque sorte de question est dans la réserve
    for (const t of TYPES) expect(byType(t).length, t).toBeGreaterThan(0)
    // les quatre fiches dont la vitesse ne tient pas en un nombre : « 1,4 à 2,7 m/s selon le froid », « 1,5 ou 1,9 m/s
    // selon la chasse », « 1,5 → 2,25 m/s selon la santé », « 3,0 → 0,4 m/s selon les objets »
    expect(profiles).toEqual(['hantu', 'the-twins', 'moroi', 'deildegast'])
    // les fiches qui ont un test d'élimination à citer en une phrase, sans preuve
    expect(judging).toEqual(JUDGING)
    // les scènes d'entités proches relevées par les relecteurs du 18 novembre 2026 sont parties avec toutes les autres
    for (const pair of ['phantom:oni:O0', 'gallu:wraith:O0', 'banshee:yokai:O1', 'spirit:moroi:O4', 'aswang:moroi:O4']) {
      expect(ids(getGhost(pair.split(':')[0])!), pair).not.toContain(`q:constat:${pair}`)
    }
  })

  it('D1, D8. un vrai ou faux : « Faux » pour un test d’élimination de X, cité avec toutes ses conditions ; « Vrai » pour ses signes et ses observations ; aucune mise en garde entre parenthèses, aucune phrase qui se lit de travers', () => {
    const plain = (t: string) => t.replace(/[  ]/gu, ' ')
    const seen = { E: 0, O: 0, K: 0, T: 0 }
    for (const d of byType('T6')) {
      const tag = d.q.id.split(':')[4]
      const rank = Number(tag.slice(1))
      const quote = d.q.quote!
      seen[tag[0] as keyof typeof seen]++
      // rien n'y nomme une entité, rien n'y parle des preuves
      expect(GHOSTS.some((g) => namesGhost(quote, g)), `${d.q.id} : « ${quote} »`).toBe(false)
      expect(mentionsEvidence(quote), `${d.q.id} : « ${quote} »`).toBe(false)
      // et la phrase parle de l'entité, sans s'adresser au joueur : une scène à la deuxième personne (« Tu vois un
      // événement « Forme de Brume » ») est possible ou impossible avec X, pas vraie ou fausse
      expect(SAYS_YOU.test(quote), `${d.q.id} : « ${quote} » s’adresse au joueur`).toBe(false)
      if (tag[0] === 'E') {
        const line = d.x.eliminationTests[rank].text
        expect(d.q.correct, d.q.id).toEqual([SOLO_ANSWERS.trueFalse.false])
        // la fiche dit elle-même que ce fait exclut X, et le corrigé est sa ligne (sans la phrase qui cite une source)
        expect(line, d.q.id).toMatch(/n[’']est\s+pas|ne\s+sont\s+pas/u)
        expect(plain(d.q.explain), d.q.id).toBe(plain(`Faux. ${withoutSourceSentences(line)}`))
        // la condition entière, en une phrase : tout ce que la fiche écrit avant « ce n'est pas un X » est dans la phrase jugée
        const condition = line.slice(0, line.search(/,?\s*ce\s+n[’']est\s+pas|,?\s*ce\s+ne\s+sont\s+pas/u))
        expect(within(condition, quote), `${d.q.id} : « ${quote} » ne reprend pas toute la condition « ${condition} »`).toBeGreaterThanOrEqual(0.8)
        expect(within(quote, line), `${d.q.id} : « ${quote} »`).toBeGreaterThanOrEqual(0.8)
        expect(quote.split(/(?<=[.!?…])\s+/u), `${d.q.id} : « ${quote} »`).toHaveLength(1)
        for (const aside of condition.match(/\([^()]*\)/gu) ?? []) expect(plain(quote), `${d.q.id} : la précision ${aside} manque`).toContain(plain(aside))
        // ni mise en garde entre parenthèses (« (attention aux limites de pièce, réelles ou buguées) »), nulle part sur sa ligne
        expect(line, d.q.id).not.toMatch(/\((?:attention|prudence|sauf)(?!\p{L})|\([^()]*(?<!\p{L})bug/iu)
        // et une chasse partie trop tôt n'exclut une entité que « sans objet maudit »
        if (EARLY_HUNT.test(line)) expect(quote, `${d.q.id} : « ${quote} »`).toMatch(CURSED)
        continue
      }
      // tout le reste de la fiche de X est vrai pour lui
      expect(d.q.correct, `${d.q.id} : « ${quote} »`).toEqual([SOLO_ANSWERS.trueFalse.true])
      if (tag[0] === 'O') {
        const o = d.x.observations[rank]
        expect(o.requires, d.q.id).toBeUndefined()
        expect(within(quote, o.text), `${d.q.id} : « ${quote} »`).toBeGreaterThanOrEqual(0.8)
      } else if (tag[0] === 'K') expect(plain(quote), d.q.id).toBe(plain(d.x.keyTells[rank]))
      else expect(from(quote, d.x.tells.filter((t) => t.zeroEvidence).map((t) => t.text)), `${d.q.id} : « ${quote} »`).toBe(true)
      expect(TRUE_OF_ALL.test(quote) && tag[0] !== 'K', `${d.q.id} : « ${quote} »`).toBe(false)
    }
    for (const [k, n] of Object.entries(seen)) expect(n, k).toBeGreaterThan(0)
    // les tests d'élimination qui ne se jugent pas : une phrase qui se lit de travers seule (« … donnant EMF 2, 3 ou 4
    // dans la même pièce qu'un joueur » : l'Ombre le fait depuis l'extérieur de la pièce), une mise en garde entre
    // parenthèses (les limites de pièce, les portes de casier)
    for (const id of ['q:vf:shade:shade:E1', 'q:vf:shade:shade:E5', 'q:vf:yurei:yurei:E0']) expect(ids(getGhost(id.split(':')[2])!), id).not.toContain(id)
    // ni ceux qui s'adressent au joueur (l'Oni : « Tu vois un événement « Forme de Brume » » ; le Myling ; la buée du Hantu)
    for (const id of ['q:vf:oni:oni:E0', 'q:vf:myling:myling:E0', 'q:vf:deildegast:deildegast:E0', 'q:vf:hantu:hantu:E0', 'q:vf:hantu:hantu:O0']) expect(ids(getGhost(id.split(':')[2])!), id).not.toContain(id)
    // ceux qui disent « sans objet maudit » se jugent, précision comprise
    const deogen = byType('T6').find((d) => d.q.id === 'q:vf:deogen:deogen:E0')
    expect(deogen?.q.quote?.replace(/[  ]/gu, ' ')).toBe('Tente de chasser au-dessus de 40 % de santé mentale moyenne (chasse naturelle, sans objet maudit).')
    expect(byType('T6').find((d) => d.q.id === 'q:vf:shade:shade:E2')?.q.quote).toMatch(/sans objet maudit\)\.$/u)
  })

  it('D1. le vrai ou faux : un seul par copie, il y entre le premier ; « Vrai » sort autant que « Faux », pour chaque fiche comme pour toutes ; ni sa tournure, ni sa longueur ne disent lequel est posé', () => {
    let truths = 0
    let lies = 0
    const asking: string[] = []
    const shares: string[] = []
    for (const [k, x] of GHOSTS.entries()) {
      if (!ids(x).some((id) => id.startsWith('q:vf:'))) continue
      const judged = supply.filter((d) => d.x.id === x.id && d.v.type === 'T6')
      let mine = 0
      let mineTrue = 0
      for (let j = 0; j < 300; j++) {
        // une copie d'une seule question : le vrai ou faux de la copie, s'il y en a un (voir judgedFor, solo.ts)
        const [q] = buildSoloQuiz({ ghost: x, allGhosts: GHOSTS, rng: createRng(31_337 + k * 104_729 + j * 7919), count: 1 })
        if (!q || soloType(q) !== 'T6') continue
        mine++
        if (q.correct[0] === SOLO_ANSWERS.trueFalse.true) mineTrue++
        // la paire d'où il vient : la fiche a, pour l'autre réponse, une affirmation de même tournure et de longueur
        // voisine. Sans elle, la forme de la phrase dirait sa réponse (« Rallume le disjoncteur. », 23 caractères,
        // face à des signes de 60 à 100 caractères : « court, donc Faux »)
        const facing = judged.filter((d) => d.q.correct[0] !== q.correct[0] && shapeOf(d.q.quote!) === shapeOf(q.quote!) && closeSize(d.q.quote!, q.quote!))
        expect(facing.length, `${q.id} : « ${q.quote} » n’a aucune affirmation de même forme pour l’autre réponse`).toBeGreaterThan(0)
      }
      for (const qs of copiesOf.get(x.id)!) expect(qs.filter((q) => soloType(q) === 'T6').length, x.id).toBeLessThanOrEqual(1)
      // une fiche sans paire ne pose aucun vrai ou faux, dans aucune copie
      if (!mine) {
        for (const qs of copiesOf.get(x.id)!) expect(qs.filter((q) => soloType(q) === 'T6').map((q) => q.id), x.id).toEqual([])
        continue
      }
      asking.push(x.id)
      truths += mineTrue
      lies += mine - mineTrue
      // pour chaque fiche, « Vrai » environ une fois sur deux (300 tirages : 50 % à 3 écarts-types près)
      const own = (100 * mineTrue) / mine
      shares.push(`${x.id} ${own.toFixed(0)} %`)
      expect(mine, x.id).toBe(300)
      expect(own, `${x.id} : « Vrai » ${own.toFixed(1)} %`).toBeGreaterThanOrEqual(40)
      expect(own, `${x.id} : « Vrai » ${own.toFixed(1)} %`).toBeLessThanOrEqual(60)
    }
    expect(asking).toEqual(PAIRED)
    const share = (100 * truths) / (truths + lies)
    measure(`D1. vrai ou faux : « Vrai » ${share.toFixed(1)} % de ${truths + lies} (${shares.join(', ')})`)
    expect(truths + lies).toBeGreaterThan(2000)
    // la part de « Vrai », toutes fiches confondues : entre 45 et 55 %
    expect(share, `« Vrai » ${share.toFixed(1)} % de ${truths + lies}`).toBeGreaterThanOrEqual(45)
    expect(share, `« Vrai » ${share.toFixed(1)} % de ${truths + lies}`).toBeLessThanOrEqual(55)
  }, 120_000)

  it('D8. une chasse qui démarre trop tôt ne désigne une entité, et n’exclut les autres, que « sans objet maudit » : les lignes décisives des fiches le disent, ou ne se posent pas', () => {
    // une chasse maudite part quels que soient le seuil, les délais et l'endroit : sans cette précision, la scène se voit avec toute entité
    let observations = 0
    let eliminations = 0
    for (const g of GHOSTS) {
      for (const o of g.observations) {
        if (o.strength !== 'definitive' || !EARLY_HUNT.test(o.text)) continue
        observations++
        expect(o.text, `${g.id} : « ${o.text} »`).toMatch(CURSED)
      }
      // tous les tests d'élimination (le Deogen, l'Esprit, l'Ombre deux fois), qu'ils se jugent en vrai ou faux ou non
      for (const t of g.eliminationTests) {
        if (!EARLY_HUNT.test(t.text)) continue
        eliminations++
        expect(t.text, `${g.id} : « ${t.text} »`).toMatch(CURSED)
      }
    }
    expect(observations).toBeGreaterThanOrEqual(6)
    expect(eliminations).toBeGreaterThanOrEqual(4)
    // un « Oui, ce test suffit » : jamais sur un test qui conclut d'une chasse partie trop tôt sans le dire
    let asked = 0
    for (const d of byType('T3b', 'T8')) {
      if (d.q.correct[0] !== SOLO_ANSWERS.enough.yes) continue
      const p = d.q.id.split(':')
      const line = d.v.type === 'T3b' ? d.x.confirmationTests[Number(p[3])].text : d.x.observations[Number(p[4].slice(1))].text
      if (!EARLY_HUNT.test(line)) continue
      asked++
      expect(`${line} ${d.q.quote}`, d.q.id).toMatch(CURSED)
    }
    expect(asked).toBeGreaterThan(0)
    // les deux tests au chronomètre du Démon ne le disent pas (ses observations, si) : ils ne se posent pas
    const demon = getGhost('demon')!
    for (const i of [0, 1]) {
      expect(EARLY_HUNT.test(demon.confirmationTests[i].text) && !CURSED.test(demon.confirmationTests[i].text), demon.confirmationTests[i].text).toBe(true)
      expect(ids(demon)).not.toContain(`q:suffit:demon:${i}`)
    }
  })

  it('D7. « Oui, ça suffit » ne se dit que d’une ligne qui tient seule : jamais quand la fiche ajoute qu’une autre entité ferait pareil', () => {
    const yes = byType('T3b', 'T8').filter((d) => d.q.correct[0] === SOLO_ANSWERS.enough.yes)
    expect(yes.length).toBeGreaterThan(60)
    const reviewed = new Set<string>()
    for (const d of yes) {
      const p = d.q.id.split(':')
      const said = d.v.type === 'T3b' ? `${afterConclusion(d.x.confirmationTests[Number(p[3])].text, d.x)} ${d.x.confirmationTests[Number(p[3])].why ?? ''}` : `${d.x.observations[Number(p[4].slice(1))].text} ${d.x.observations[Number(p[4].slice(1))].why ?? ''}`
      const named = [...new Set([...othersIn(said, d.x), ...othersIn(d.q.explain, d.x)])]
      // la citation elle-même ne nomme personne
      expect(othersIn(d.q.quote!, d.x).map((o) => o.name), d.q.id).toEqual([])
      if (!named.length) continue
      // une autre entité est nommée : seulement sur une ligne relue, où la fiche dit ce qui les sépare
      reviewed.add(d.q.id)
      expect(Object.keys(TOLD_APART), `${d.q.id} : « ${d.q.explain} »`).toContain(d.q.id)
      expect(d.q.explain.replace(/[  ]/gu, ' '), d.q.id).toMatch(TOLD_APART[d.q.id])
      expect(d.q.explain, `${d.q.id} : « ${d.q.explain} »`).not.toMatch(DOES_THE_SAME)
    }
    // la liste des lignes relues est exacte : une ligne qui ne se pose plus en sort
    expect([...reviewed].sort()).toEqual(Object.keys(TOLD_APART).sort())
    // les lignes décisives dont la mise en garde nomme une entité qui ferait pareil ne se posent pas du tout : le Spectre
    // (un Gallu enragé ne perturbe pas le sel non plus), le Hantu et le Moroï (l'Obambo change aussi de vitesse en pleine
    // chasse), le Raiju (un Revenant, un Kormos accélèrent aussi), le Djinn (l'accélération du Raiju), le Démon (un Onryo
    // à Sunny Meadows) ; ni l'observation du Moroï qui redit son test des pilules
    for (const id of NOT_ALONE) expect(ids(getGhost(id.split(':')[2])!), id).not.toContain(id)
    // une observation décisive qui redit un test écarté ainsi : seulement si elle porte elle-même ce qui écarte l'entité nommée
    for (const d of yes) {
      if (d.v.type !== 'T8') continue
      const o = d.x.observations[Number(d.q.id.split(':O')[1])]
      for (const [i, t] of d.x.confirmationTests.entries()) {
        const tail = `${afterConclusion(t.text, d.x)} ${t.why ?? ''}`
        const id = `q:suffit:${d.x.id}:${i}`
        if (!t.definitive || !othersIn(tail, d.x).length || id in TOLD_APART || (TOLD_APART_UNASKED as readonly string[]).includes(id)) continue
        const body = t.text.slice(0, t.text.length - afterConclusion(t.text, d.x).length)
        if (alike(o.text, body) < SAME_FACT) continue
        expect(Object.keys(KEEPS_APART), `${d.q.id} redit le test ${i} de ${d.x.name}, dont la mise en garde nomme une autre entité`).toContain(d.q.id)
        expect(o.text.replace(/[  ]/gu, ' '), d.q.id).toMatch(KEEPS_APART[d.q.id])
      }
    }
    for (const id of Object.keys(KEEPS_APART)) expect(ids(getGhost(id.split(':')[2])!), id).toContain(id)
  })

  it('D5. un signe « Seule entité… » et un « est-ce que ça suffit ? » sur le même fait ne vont jamais dans la même copie', () => {
    // chaque signe « Seule… » des fiches est connu de la table, avec ses « est-ce que ça suffit ? »
    for (const g of GHOSTS) {
      const signs = [...g.keyTells, ...g.tells.filter((t) => t.zeroEvidence).map((t) => t.text)].filter((t) => SAYS_ONLY.test(t))
      if (!signs.length) continue
      expect(Object.keys(ONLY_SIGNS), `${g.id} : « ${signs[0]} »`).toContain(g.id)
      for (const s of signs) expect(s, g.id).toMatch(ONLY_SIGNS[g.id].sign)
    }
    let signsAsked = 0
    let worthAsked = 0
    for (const [id, { sign, worth }] of Object.entries(ONLY_SIGNS)) {
      const x = getGhost(id)!
      for (const qs of [...copiesOf.get(id)!, ...extraCopies(x, 120)]) {
        // le signe, comme bonne réponse de « lequel de ces signes… ? » ou comme phrase jugée « Vrai »
        const signText = (q: Question) => {
          const t = soloType(q)
          return t === 'T2' ? `${q.choices.find((c) => q.correct.includes(c.id))!.label} ${q.explain.split('. Les trois autres')[0]}` : t === 'T6' ? q.quote! : ''
        }
        const said = qs.filter((q) => sign.test(signText(q)) && SAYS_ONLY.test(signText(q)))
        const asked = qs.filter((q) => worth.includes(q.id))
        signsAsked += said.length
        worthAsked += asked.length
        if (said.length) expect(asked.map((q) => q.id), `${id} : ${said[0].id} dans la même copie`).toEqual([])
        // et, sans la table : aucun « est-ce que ça suffit ? » de la copie ne reprend les mots du signe
        for (const s of said) for (const q of qs) if (soloType(q) === 'T8' || soloType(q) === 'T3b') expect(alike(signText(s), q.quote!), `${id} : ${s.id} et ${q.id}`).toBeLessThan(SAME_FACT)
      }
    }
    // le test mord : ces signes et ces questions se posent bien, jamais ensemble
    expect(signsAsked).toBeGreaterThan(40)
    expect(worthAsked).toBeGreaterThan(100)
  }, 120_000)

  it('D6. ce que vaut un fait ne se demande qu’une fois par copie : deux « est-ce que ça suffit ? » ne décrivent jamais la même chose', () => {
    let together = 0
    for (const x of GHOSTS) {
      const scenes = (SAME_SCENE[x.id] ?? []).map((tags) => tags.map((t) => worthId(x.id, t)))
      for (const qs of copiesOf.get(x.id)!) {
        const worth = qs.filter((q) => soloType(q) === 'T8' || soloType(q) === 'T3b')
        if (worth.length > 1) together++
        // les scènes relevées à la relecture : une seule par copie
        for (const scene of scenes) expect(worth.filter((q) => scene.includes(q.id)).map((q) => q.id).length, `${x.id} : ${worth.map((q) => q.id).join(', ')}`).toBeLessThanOrEqual(1)
        // et, sans la table : jamais deux citations aux mêmes mots, ni à la même valeur chiffrée
        for (let a = 0; a < worth.length; a++) {
          for (let b = a + 1; b < worth.length; b++) {
            const tag = `${x.id} : ${worth[a].id} et ${worth[b].id}`
            expect(alike(worth[a].quote!, worth[b].quote!), tag).toBeLessThan(SAME_FACT)
            const values = valuesOf(x.id, worth[a].quote!).filter((k) => !/ligne de vue/u.test(k))
            expect(valuesOf(x.id, worth[b].quote!).filter((k) => values.includes(k)), tag).toEqual([])
          }
        }
      }
    }
    // le test mord : des copies posent bien deux « est-ce que ça suffit ? » sur deux faits différents. Seulement celles
    // de trente questions (une sur trois) : une copie de dix n'en pose plus qu'un (mesuré : 147 copies sur 600)
    expect(together).toBeGreaterThan(100)
    // la table ne nomme que des lignes des fiches
    for (const [id, scenes] of Object.entries(SAME_SCENE)) {
      const x = getGhost(id)!
      for (const tag of scenes.flat()) expect((tag[0] === 'C' ? x.confirmationTests : x.observations)[Number(tag.slice(1))], `${id} ${tag}`).toBeDefined()
    }
  })

  it('D4. un même fait ne se demande pas deux fois sous d’autres mots, et aucun énoncé ne souffle la réponse d’une question suivante (les paires relevées à la relecture)', () => {
    const askedText = (q: Question) => {
      const t = soloType(q)
      const right = q.choices.find((c) => q.correct.includes(c.id))!.label
      return t === 'T2' ? `${right} ${q.explain.split('. Les trois autres')[0]}` : t === 'T6' ? q.quote! : t === 'auth' ? `${q.prompt} ${right}` : ''
    }
    let seen = 0
    for (const [id, facts] of Object.entries(SAME_FACT_WORDS)) {
      for (const qs of copiesOf.get(id)!) {
        for (const [name, re] of facts) {
          const hit = qs.filter((q) => re.test(askedText(q)))
          seen += hit.length
          expect(hit.map((q) => q.id).length, `${id}, « ${name} » : ${hit.map((q) => q.id).join(', ')}`).toBeLessThanOrEqual(1)
        }
      }
    }
    expect(seen).toBeGreaterThan(100)
    const order = new Map<string, number>()
    for (const [id, first, then, why] of NEVER_AFTER) {
      for (const qs of copiesOf.get(id)!) {
        const a = qs.findIndex((q) => first.test(q.id))
        const b = qs.findIndex((q) => then.test(q.id))
        if (a >= 0) order.set(`${id} a`, (order.get(`${id} a`) ?? 0) + 1)
        if (b >= 0) order.set(`${id} b`, (order.get(`${id} b`) ?? 0) + 1)
        if (a >= 0 && b >= 0) expect(a, `${id} : ${why}`).toBeGreaterThan(b)
      }
    }
    measure(`D4. paires ordonnées, questions vues : ${JSON.stringify([...order])}`)
  })

  it('D9. aucune question rédigée dont l’énoncé nomme une autre entité (« Tu hésites entre un Esprit et un Spectre… »)', () => {
    const authored = byType('auth')
    expect(authored.length).toBeGreaterThan(100)
    for (const d of authored) expect(othersIn(d.q.prompt, d.x).map((o) => o.name), `${d.q.id} : « ${d.q.prompt} »`).toEqual([])
    // les trois que la fiche pose ainsi ne sont plus dans la copie
    for (const id of ['q:auth:spirit:3', 'q:auth:jinn:5', 'q:auth:gallu:5']) expect(ids(getGhost(id.split(':')[2])!), id).not.toContain(id)
    for (const [g, i] of [['spirit', 3], ['jinn', 5], ['gallu', 5]] as const) expect(othersIn(getGhost(g)!.quiz[i].q, getGhost(g)!).length, `${g} ${i}`).toBeGreaterThan(0)
  })

  it('D10, D12, D13. ce qui se lit : aucune preuve (« EMF 2 (ou 5) »), aucune source inconnue de l’élève (« tybayn »), aucun guillemet dans des guillemets', () => {
    let read = 0
    for (const d of supply) {
      const texts = [d.q.prompt, d.q.quote ?? '', d.q.explain, ...d.q.choices.map((c) => c.label)]
      for (const t of texts) {
        read++
        // le niveau 5 de l'EMF est une preuve : « un EMF 2 (ou 5) », « un EMF 2 ou 5 » ne se lisent nulle part
        expect(t, `${d.q.id} : « ${t} »`).not.toMatch(/EMF\s*2\s*\(?\s*ou\s+(?:un\s+EMF\s*)?5/iu)
        // la feuille de référence des fiches n'est pas une source que l'élève connaît
        expect(t, `${d.q.id} : « ${t} »`).not.toMatch(/tybayn/iu)
        // des guillemets dans des guillemets, ou un point de chaque côté du guillemet fermant
        expect(t, `${d.q.id} : « ${t} »`).not.toMatch(/«[^»]*«|\.\s*»\s*\./u)
      }
      expect(d.q.explain.trim().length, d.q.id).toBeGreaterThan(3)
    }
    expect(read).toBeGreaterThan(5000)
    // les trois textes des fiches corrigés le 19 novembre 2026
    const emf = /EMF 2 \(ou 5\)|EMF 2 ou 5/u
    expect(getGhost('jinn')!.quiz[3].explain).not.toMatch(emf)
    expect(getGhost('wraith')!.quiz[1].explain).not.toMatch(emf)
    expect(getGhost('oni')!.confusions.find((c) => c.with === 'jinn')!.why).not.toMatch(emf)
    // le corrigé du test d'élimination du Goryo s'arrête avant « tybayn ne dit pas si… » ; celui du signe du Deildegast
    // cite « portes ouvertes au départ » entre guillemets anglais
    const goryo = supply.find((d) => d.q.id === 'q:vf:goryo:goryo:E0')
    expect(goryo?.q.explain.replace(/[  ]/gu, ' ')).toBe('Faux. Si l’entité change de pièce favorite, ce n’est pas un Goryo.')
    expect(getGhost('goryo')!.eliminationTests[0].text).toMatch(/tybayn/u)
    const doors = supply.filter((d) => d.q.id === 'q:sign-of:deildegast:t2' && d.q.explain.includes('portes ouvertes'))
    expect(doors.length).toBeGreaterThan(0)
    for (const d of doors) expect(d.q.explain).toMatch(/“portes ouvertes au départ”[^«»]*\)[   ]»\. Les trois autres/u)
  })

  it('D15. un corrigé allégé reste entier là où il énumère : les trois états du Gallu', () => {
    const gallu = supply.find((d) => d.q.id === 'q:auth:gallu:2')
    expect(gallu?.q.explain.replace(/[  ]/gu, ' ')).toBe('Enragé : 60 %. Normal : 50 %. Affaibli : 40 %.')
  })

  it('une observation de la fiche de X : deux réponses ; « ce n’est qu’un indice » ne se dit pas d’un indice fort quand la fiche a un test ou un rapport décisif, ni d’un indice écrit comme une impression', () => {
    // les mots ne suffisent pas à reconnaître qu'un indice fort redit un test décisif (« ton coéquipier se retrouve au
    // contact de l'entité et survit » ; « ceux-ci peuvent la toucher sans mourir, c'est une Banshee ») : la copie
    // enseignait les deux verdicts pour la même scène. À rouvrir quand les forces des rapports seront alignées sur les tests.
    const own = byType('T8')
    expect(own.length).toBeGreaterThan(60)
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
        // D11 : un indice dont la tournure dit déjà « ce n'est qu'un indice » ne se pose pas
        expect(o.text, d.q.id).not.toMatch(/souvent|surtout|plutôt|semble|un peu|de plus en plus|bien plus|beaucoup|parfois|jamais|toujours|tant que/iu)
      }
    }
    // aucune des deux réponses n'est presque jamais juste
    expect(answers.yes).toBeGreaterThan(30)
    expect(answers.no).toBeGreaterThan(25)
    const gone = ['hantu:hantu:O1', 'hantu:hantu:O2', 'hantu:hantu:O3', 'yokai:yokai:O3', 'wraith:wraith:O1', 'wraith:wraith:O2', 'banshee:banshee:O1', 'banshee:banshee:O2', 'poltergeist:poltergeist:O3', 'revenant:revenant:O2']
    // et les indices écrits comme des impressions (« très souvent… bien plus que d'habitude », « semble », « surtout »)
    const impressions = ['poltergeist:poltergeist:O5', 'banshee:banshee:O5', 'yokai:yokai:O5', 'shade:shade:O5', 'myling:myling:O4', 'moroi:moroi:O6', 'mare:mare:O6']
    for (const pair of [...gone, ...impressions]) {
      const id = `q:constat:${pair}`
      expect(ids(getGhost(pair.split(':')[0])!), id).not.toContain(id)
    }
  })

  it('une vitesse dite sans décimale (« environ 1 m/s ») est la même que « 1,0 m/s » : elle ne se demande pas après la scène qui la cite', () => {
    const plain = (t: string) => t.replace(/[  ]/gu, ' ')
    let pairs = 0
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
      }
    }
    expect(pairs).toBeGreaterThan(20)
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
    // une question simple ne passe pas en premier quand elle montrerait ce qu'une autre question de la copie demande
    expect(having).toBeGreaterThan(300)
    measure(`la copie s’ouvre sur du simple : ${opening}/${having}`)
    expect(opening / having).toBeGreaterThan(0.75)
  }, 120_000)

  it('les énoncés et les corrigés : la Dayan « si tu bouges près d’elle », aucun corrigé rédigé sur les preuves', () => {
    const dayan = supply.filter((d) => d.q.id === 'q:spd:dayan:2.25')
    expect(dayan.length).toBeGreaterThan(0)
    for (const d of dayan) expect(d.q.prompt.replace(/[  ]/gu, ' ')).toContain('si tu bouges près d’elle')
    // le corrigé d'une question rédigée ne parle pas des preuves ; sauf celui du Mimic, sur ses orbes à 0 preuve
    for (const d of byType('auth')) if (d.x.id !== MIMIC) expect(mentionsEvidence(d.q.explain), `${d.q.id} : ${d.q.explain}`).toBe(false)
  })
})

/** D'autres copies de dix questions sur x, pour les tests qui cherchent une paire rare. */
function extraCopies(x: Ghost, n: number): Question[][] {
  const k = GHOSTS.indexOf(x)
  return Array.from({ length: n }, (_, j) => buildSoloQuiz({ ghost: x, allGhosts: GHOSTS, rng: createRng(424_242 + k * 104_729 + j * 7919) }))
}
