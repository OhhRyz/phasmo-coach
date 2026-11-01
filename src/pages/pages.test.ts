import { describe, expect, it } from 'vitest'
import { getGhost, GHOSTS, MECHANICS } from '../data'
import { buildDeck, namesGhost, type Card } from '../engine/cards'
import { dayKey, spellLdV } from '../engine/format'
import { askKey, buildReviewQueue, SAME_ASK_GAP, SAME_GHOST_GAP, sessionGhosts, studiedGhosts, unseenCards } from '../engine/progress'
import { buildQuiz, questionForCard, QUIZ_TOPICS, type Question } from '../engine/quiz'
import { createRng, hashString } from '../engine/random'
import { schedule, type Grade } from '../engine/srs'
import { initialState, type PersistedState } from '../store/schema'
import { allSpeeds, BASE_SPEED, classOf, EAR_ROUNDS, makeRounds, MIN_GAP, pickDistractors } from './earRounds'
import { expectedAnswers, sessionMinutes } from './reviewPlan'
import {
  answersBefore,
  comesBackInSession,
  CORRECTION_FIRST_LINES,
  CORRECTION_GAP,
  framesNewCard,
  FRAMED_PER_SESSION,
  FRAMED_UNTIL,
  HIDDEN_GHOST,
  LEARN_MORE,
  MAX_RETURNS,
  nextSession,
  passesBefore,
  placeCorrection,
  requeue,
  REQUEUE_GAP,
  REQUEUE_WITHIN,
  requeueGap,
  restoreSaved,
  resumeSession,
  START_PARAM,
  START_REVIEW,
  stillToAsk,
  type SavedSession,
} from './reviewSession'
import { reviseLabel } from './exhibits'
import { pageTitle } from '../components/Layout'
import { exactName, searchCodex, searchTarget } from './Codex'
import { CONTRACT_KEY, readContract, validContract, type SavedContract } from './contractRun'
import { saveRun } from './savedRun'
import { generateScenario } from '../engine/scenario'
import { EMPTY_FILTER } from '../engine/filter'

const speeds = allSpeeds(GHOSTS)
const SERIES = 2000

describe('À l’oreille : lente, normale ou rapide', () => {
  const all = Array.from({ length: SERIES }, (_, k) => makeRounds('class', createRng(k + 1), speeds))

  it('chaque série a ses dix écoutes, sans propositions (les trois allures sont fixes)', () => {
    for (const r of all) {
      expect(r).toHaveLength(EAR_ROUNDS)
      for (const x of r) {
        expect(speeds).toContain(x.speed)
        expect(x.choices).toEqual([])
      }
    }
  })

  it('chaque allure revient au moins deux fois par série : « Normale » n’est jamais une réponse à exclure', () => {
    for (const r of all) {
      for (const c of ['slow', 'normal', 'fast'] as const) expect(r.filter((x) => classOf(x.speed) === c).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('la normale, la plus fréquente en partie, revient le plus souvent ; lente et rapide à parts égales', () => {
    const n = { slow: 0, normal: 0, fast: 0 }
    for (const r of all) for (const x of r) n[classOf(x.speed)]++
    const total = SERIES * EAR_ROUNDS
    expect(n.normal / total).toBeGreaterThan(0.33)
    expect(n.normal / total).toBeLessThan(0.45)
    expect(n.normal).toBeGreaterThan(n.slow)
    expect(n.normal).toBeGreaterThan(n.fast)
    expect(Math.abs(n.slow - n.fast) / total).toBeLessThan(0.03)
  })

  it('aucune allure ne se devine par la place dans la série', () => {
    for (let i = 0; i < EAR_ROUNDS; i++) {
      const share = all.filter((r) => classOf(r[i].speed) === 'normal').length / SERIES
      expect(share).toBeGreaterThan(0.3)
      expect(share).toBeLessThan(0.5)
    }
  })

  it('les vitesses lentes et rapides tournent : toutes celles des fiches finissent par passer', () => {
    const heard = new Set(all.flat().map((x) => x.speed))
    expect([...heard].sort((a, b) => a - b)).toEqual(speeds)
  })
})

describe('À l’oreille : vitesse exacte', () => {
  it('trois mauvaises propositions pour chaque vitesse des fiches, toutes à au moins 0,2 m/s l’une de l’autre', () => {
    for (const v of speeds) {
      for (let seed = 1; seed <= 200; seed++) {
        const d = pickDistractors(createRng(seed * 31 + Math.round(v * 100)), v, speeds)
        expect(d).toHaveLength(3)
        const choices = [v, ...d]
        for (let a = 0; a < choices.length; a++) {
          for (let b = a + 1; b < choices.length; b++) expect(Math.abs(choices[a] - choices[b])).toBeGreaterThanOrEqual(MIN_GAP - 1e-6)
        }
      }
    }
  })

  it('quatre propositions triées, la bonne parmi elles, pas de jumelles (ex. 1,45 et 1,53, ou 2,7 et 2,75)', () => {
    for (let seed = 1; seed <= SERIES; seed++) {
      for (const r of makeRounds('exact', createRng(seed), speeds)) {
        expect(r.choices).toHaveLength(4)
        expect(r.choices).toContain(r.speed)
        expect([...r.choices].sort((a, b) => a - b)).toEqual(r.choices)
        for (let k = 1; k < r.choices.length; k++) expect(r.choices[k] - r.choices[k - 1]).toBeGreaterThanOrEqual(MIN_GAP - 1e-6)
      }
    }
  })

  it('la bonne réponse se répartit sur les quatre places', () => {
    const at = [0, 0, 0, 0]
    for (let seed = 1; seed <= SERIES; seed++) for (const r of makeRounds('exact', createRng(seed), speeds)) at[r.choices.indexOf(r.speed)]++
    const total = SERIES * EAR_ROUNDS
    for (const n of at) expect(n / total).toBeGreaterThan(0.12)
  })

  it('la vitesse jouée reste tirée au hasard parmi toutes celles des fiches', () => {
    const seen = new Set<number>()
    for (let seed = 1; seed <= 300; seed++) for (const r of makeRounds('exact', createRng(seed), speeds)) seen.add(r.speed)
    expect(seen.size).toBe(speeds.length)
    expect(seen.has(BASE_SPEED)).toBe(true)
  })
})

describe('révision du jour : durée annoncée', () => {
  it('compte les réponses attendues, pas les cartes : 12 cartes nouvelles, environ 6 min', () => {
    // une réponse par carte juste, une de plus pour une carte ratée (elle repasse une fois dans la séance)
    expect(expectedAnswers(12, 0)).toBe(18)
    expect(sessionMinutes(12, 0)).toBe(6)
  })

  it('une carte due coûte moins qu’une nouvelle ; jamais moins d’une minute', () => {
    expect(sessionMinutes(0, 12)).toBeLessThan(sessionMinutes(12, 0))
    expect(sessionMinutes(0, 1)).toBe(1)
    expect(sessionMinutes(0, 0)).toBe(1)
  })
})

describe('révision : la fiche de séance ne souffle pas la réponse', () => {
  const card = (id: string): Card => ({ id, deck: 'ghost', kind: 'test', ghostId: id, front: '', back: '', order: 0 })
  const [a, b, c] = ['a', 'b', 'c'].map(card)

  it('la carte en cours et celles qui suivent passeront encore : leur entité reste tue', () => {
    expect([...stillToAsk([a, b, c], null)]).toEqual(['a', 'b', 'c'])
  })

  it('une carte ratée qui revient plus loin reste tue dans la fiche, même corrigée à l’écran', () => {
    expect(stillToAsk([a, b, c], { again: true }).has('a')).toBe(true)
  })

  it('une carte terminée pour la séance se nomme dès sa correction', () => {
    expect([...stillToAsk([a, b, c], { again: false })]).toEqual(['b', 'c'])
    expect(stillToAsk([a], { again: false }).size).toBe(0)
  })

  it('l’entité tue se lit comme une énigme à résoudre, pas comme une fiche cassée', () => {
    expect(HIDDEN_GHOST).toBe('Entité à trouver')
    expect(HIDDEN_GHOST).not.toMatch(/inconnu/i)
  })
})

describe('révision : une carte nouvelle se pose en QCM sans faire croire qu’on devait la savoir', () => {
  it('les deux premières cartes nouvelles de chaque séance le disent en toutes lettres', () => {
    expect(FRAMED_PER_SESSION).toBe(2)
    expect(framesNewCard(0, 0)).toBe(true)
    expect(framesNewCard(1, 1)).toBe(true)
    expect(framesNewCard(2, 2)).toBe(false)
    // un autre jour, une autre séance : la première carte nouvelle le redit
    expect(framesNewCard(0, 12)).toBe(true)
  })

  it('passé les premiers jours de cartes nouvelles, le tampon « Nouvelle » suffit', () => {
    expect(FRAMED_UNTIL).toBeGreaterThanOrEqual(24)
    expect(framesNewCard(0, FRAMED_UNTIL - 1)).toBe(true)
    expect(framesNewCard(0, FRAMED_UNTIL)).toBe(false)
  })
})

describe('révision sur téléphone : la barre « Carte suivante » ne couvre pas la correction', () => {
  // écran de 844 px : barre d'onglets en bas, la barre d'action collée au-dessus (de 706 à 758 px)
  const barTop = 706

  it('une correction qui tient au-dessus de la barre y monte tout entière, et la barre reste collée', () => {
    const back = { top: 374, bottom: 934 }
    const { flows, dy } = placeCorrection(back, barTop)
    expect(flows).toBe(false)
    expect(back.bottom - dy).toBeLessThanOrEqual(barTop - CORRECTION_GAP)
    expect(back.top - dy).toBeGreaterThanOrEqual(CORRECTION_GAP)
  })

  it('déjà visible : rien ne bouge', () => {
    expect(placeCorrection({ top: 200, bottom: 500 }, barTop)).toEqual({ flows: false, dy: 0 })
  })

  it('trop longue pour l’écran : ses premières lignes montent, et la barre suit la carte au lieu de couvrir la suite', () => {
    const back = { top: 264, bottom: 930 }
    const small = 430
    const { flows, dy } = placeCorrection(back, small)
    expect(flows).toBe(true)
    expect(back.top + CORRECTION_FIRST_LINES - dy).toBeLessThanOrEqual(small - CORRECTION_GAP)
    expect(back.top - dy).toBeGreaterThanOrEqual(CORRECTION_GAP)
  })

  it('ne fait jamais monter le haut de la correction hors de l’écran', () => {
    const { dy } = placeCorrection({ top: 40, bottom: 600 }, 500)
    expect(40 - dy).toBeGreaterThanOrEqual(CORRECTION_GAP)
  })

  // première carte d'une séance, « Je ne sais pas » (Chromium, 390 x 844) : la bonne réponse entourée au-dessus
  // de la correction, la correction seule tiendrait au-dessus de la barre
  const right = { top: 119, bottom: 211 }
  const back = { top: 320, bottom: 904 }

  it('après une erreur, la bonne réponse entourée reste à l’écran, et la barre suit la carte si tout ne tient pas', () => {
    expect(placeCorrection(back, barTop).flows).toBe(false)
    const { flows, dy } = placeCorrection(back, barTop, right)
    expect(right.top - dy).toBeGreaterThanOrEqual(CORRECTION_GAP)
    expect(flows).toBe(true)
    // elle monte en haut de l'écran : la correction se lit au plus loin
    expect(right.top - dy).toBe(CORRECTION_GAP)
  })

  it('la bonne réponse et toute la correction tiennent au-dessus de la barre : tout monte, la barre reste collée', () => {
    const near = { top: 300, bottom: 392 }
    const fit = { top: 420, bottom: 860 }
    const { flows, dy } = placeCorrection(fit, barTop, near)
    expect(flows).toBe(false)
    expect(fit.bottom - dy).toBeLessThanOrEqual(barTop - CORRECTION_GAP)
    expect(near.top - dy).toBeGreaterThanOrEqual(CORRECTION_GAP)
  })

  it('correction très longue après une erreur : ses premières lignes montent sans faire sortir la bonne réponse', () => {
    const long = { top: 264, bottom: 1400 }
    const r = { top: 90, bottom: 180 }
    const { flows, dy } = placeCorrection(long, 430, r)
    expect(flows).toBe(true)
    expect(r.top - dy).toBeGreaterThanOrEqual(CORRECTION_GAP)
  })

  it('la bonne réponse déjà au-dessus de l’écran (on avait fait défiler pour répondre) : la page remonte jusqu’à elle', () => {
    const above = { top: -140, bottom: -48 }
    const { dy } = placeCorrection({ top: 60, bottom: 500 }, barTop, above)
    expect(dy).toBeLessThan(0)
    expect(above.top - dy).toBe(CORRECTION_GAP)
    // sans bonne réponse à montrer, la page ne remonte jamais
    expect(placeCorrection({ top: 60, bottom: 500 }, barTop).dy).toBe(0)
  })

  it('sans bonne réponse à montrer (bonne réponse, carte sans choix) : rien ne change', () => {
    for (const [b, t] of [
      [{ top: 374, bottom: 934 }, barTop],
      [{ top: 200, bottom: 500 }, barTop],
      [{ top: 264, bottom: 930 }, 430],
      [back, barTop],
    ] as const)
      expect(placeCorrection(b, t, undefined)).toEqual(placeCorrection(b, t))
    expect(placeCorrection(back, barTop)).toEqual({ flows: false, dy: back.bottom - (barTop - CORRECTION_GAP) })
  })
})

describe('Exercices : le bouton de révision s’accorde au nombre de cartes', () => {
  it('« Réviser mes 3 cartes », jamais « Réviser mes 1 carte »', () => {
    expect(reviseLabel(3)).toBe('Réviser mes 3 cartes')
    expect(reviseLabel(1)).toBe('Réviser la carte du jour')
    expect(reviseLabel(1)).not.toMatch(/mes 1/)
  })
})

describe('révision : le bouton de fin de séance annonce la séance qu’il lance', () => {
  it('« Reprendre » pour une séance interrompue, « Continuer » après une séance finie, « Apprendre » sinon', () => {
    expect(nextSession(5, 0, true)).toEqual({ label: 'Reprendre la séance', extraNew: 0 })
    expect(nextSession(2, 0, false)).toEqual({ label: 'Continuer avec 2 cartes', extraNew: 0 })
    expect(nextSession(1, 0, false)?.label).toBe('Continuer avec 1 carte')
    expect(nextSession(0, 2, false)).toEqual({ label: 'Apprendre 2 cartes', extraNew: LEARN_MORE })
    expect(nextSession(0, 1, true)?.label).toBe('Apprendre 1 carte')
    expect(nextSession(0, 0, false)).toBeNull()
  })

  it('fin du fichier : il ne reste que des questions communes à plusieurs entités (seuil de 50 %, vitesse de 1,7 m/s)', () => {
    const now = Date.UTC(2026, 10, 1, 12)
    const deck = buildDeck(GHOSTS, MECHANICS, [])
    const shared = new Map<string, number>()
    for (const k of deck.map(askKey)) if (k) shared.set(k, (shared.get(k) ?? 0) + 1)
    const last = deck.filter((c) => (shared.get(askKey(c) ?? '') ?? 0) > 1)
    expect(last.length).toBeGreaterThan(LEARN_MORE)
    const state = initialState(now)
    // tout le reste est appris, pour plus tard
    for (const c of deck) if (!last.includes(c)) state.cards[c.id] = { ...schedule(undefined, 4, now - 86_400_000), due: now + 30 * 86_400_000 }
    // la limite du jour est déjà atteinte : plus rien de dû
    state.log = deck.filter((c) => !last.includes(c)).slice(0, state.settings.newPerDay).map((c) => ({ id: c.id, t: now - 60_000, g: 3, isNew: true }))
    expect(unseenCards(deck, state.cards, state.settings)).toHaveLength(last.length)

    const pending = buildReviewQueue(state, deck, now).length
    const learnable = buildReviewQueue(state, deck, now, LEARN_MORE).length
    expect(pending).toBe(0)
    const next = nextSession(pending, learnable, false)
    // autant de cartes que la séance que lance le clic, pas min(10, cartes jamais vues)
    expect(next?.label).toBe(`Apprendre ${learnable} ${learnable > 1 ? 'cartes' : 'carte'}`)
    expect(buildReviewQueue(state, deck, now, next!.extraNew)).toHaveLength(learnable)
    expect(learnable).toBeLessThanOrEqual(Math.min(LEARN_MORE, last.length))

    // séance finie normalement, limite du jour pas atteinte : « Continuer avec N cartes », N la séance suivante
    state.log = []
    const more = buildReviewQueue(state, deck, now).length
    expect(more).toBeGreaterThan(0)
    expect(nextSession(more, 0, false)?.label).toBe(`Continuer avec ${more} ${more > 1 ? 'cartes' : 'carte'}`)
  })
})

describe('révision : une carte ratée deux fois est comptée par le bouton de fin de séance', () => {
  it('l’écran de fin, puis le clic une minute plus tard : « Continuer avec N cartes », et la séance lancée a ces N cartes', () => {
    const deck = buildDeck(GHOSTS, MECHANICS, [])
    let clock = new Date('2026-11-01T14:00:00').getTime()
    let state: PersistedState = { ...initialState(clock), onboarded: true }
    let queue = buildReviewQueue(state, deck, clock)
    const passes: Record<string, number> = {}
    const twice = new Set<string>()
    // tout faux (« Je ne sais pas »), deux secondes par réponse
    while (queue.length) {
      const card = queue[0]
      clock += 2_000
      const prev = state.cards[card.id]
      const next = schedule(prev, 1, clock)
      state = { ...state, cards: { ...state.cards, [card.id]: next }, log: [...state.log, { id: card.id, t: clock, g: 1, isNew: !prev }] }
      let rest = queue.slice(1)
      if (comesBackInSession(next, clock, passes[card.id] ?? 0)) {
        rest = requeue(rest, card, requeueGap(next, clock))
        passes[card.id] = (passes[card.id] ?? 0) + 1
      } else twice.add(card.id)
      queue = rest
    }
    expect(twice.size).toBeGreaterThan(5)
    const end = clock + 3_000
    const pending = buildReviewQueue(state, deck, end).length
    const learnable = pending > 0 ? 0 : buildReviewQueue(state, deck, end, LEARN_MORE).length
    const next = nextSession(pending, learnable, false)!
    // les cartes ratées deux fois, pas encore à l'heure (1 min), sont déjà de la séance suivante
    expect(next.label).toBe(`Continuer avec ${twice.size} cartes`)
    for (const later of [end + 1_000, end + 70_000, end + 10 * 60_000]) {
      const launched = buildReviewQueue(state, deck, later, next.extraNew)
      expect(launched.map((c) => c.id).sort(), `${later - end} ms`).toEqual([...twice].sort())
    }
  })
})

describe('révision : une carte ratée repasse plus loin, une fois', () => {
  const card = (id: string, ghostId: string | undefined, kind: Card['kind'] = 'test', back = ''): Card => ({ id, deck: ghostId ? 'ghost' : 'mechanics', kind, ghostId, front: '', back, order: 0 })
  const at = Date.UTC(2026, 10, 1, 12)
  const learn = (g: Grade) => schedule(undefined, g, at)

  it('juste, une carte nouvelle ne repasse pas ; ratée, elle repasse une seule fois dans la séance', () => {
    expect(comesBackInSession(learn(3), at)).toBe(false)
    expect(comesBackInSession(learn(1), at)).toBe(true)
    expect(comesBackInSession(learn(1), at, MAX_RETURNS)).toBe(false)
    // une carte apprise puis ratée (10 min) repasse aussi
    const lapse = schedule({ ...learn(3), due: at }, 1, at)
    expect(lapse.due - at).toBeLessThan(REQUEUE_WITHIN)
    expect(comesBackInSession(lapse, at)).toBe(true)
    expect(requeueGap(learn(1), at)).toBe(REQUEUE_GAP)
    expect(requeueGap(lapse, at)).toBe(10)
  })

  it('au moins cinq cartes plus loin, ou en dernier s’il en reste moins', () => {
    const x = card('x', 'ghost-x')
    const rest = Array.from({ length: 12 }, (_, i) => card(`c${i}`, `g${i}`, i % 2 ? 'tells' : 'reverse'))
    const out = requeue(rest, x)
    expect(out).toHaveLength(13)
    expect(out.indexOf(x)).toBeGreaterThanOrEqual(REQUEUE_GAP)
    expect(out.filter((c) => c !== x).map((c) => c.id)).toEqual(rest.map((c) => c.id))
    const short = rest.slice(0, 3)
    expect(requeue(short, x).at(-1)).toBe(x)
    expect(requeue([], x)).toEqual([x])
  })

  it('jamais à moins de SAME_GHOST_GAP cartes d’une carte de la même entité, ni juste à côté d’une carte de sa sorte', () => {
    const x = card('x', 'spirit', 'test')
    // la place 5 touche une autre carte de l'Esprit, la place 6 un autre test
    const rest = [
      card('a', 'g1', 'tells'), card('b', 'g2', 'reverse'), card('c', 'g3', 'tells'), card('d', 'g4', 'reverse'),
      card('e', 'spirit', 'tells'), card('f', 'g5', 'reverse'), card('g', 'g6', 'reverse'), card('h', 'g7', 'test'),
      card('i', 'g8', 'tells'), card('j', 'g9', 'reverse'), card('k', 'g10', 'tells'), card('l', 'g11', 'reverse'),
    ]
    const out = requeue(rest, x)
    const p = out.indexOf(x)
    expect(p).toBeGreaterThanOrEqual(REQUEUE_GAP)
    for (let i = Math.max(0, p - SAME_GHOST_GAP); i <= Math.min(out.length - 1, p + SAME_GHOST_GAP); i++) if (i !== p) expect(out[i].ghostId, out.map((c) => c.id).join(' ')).not.toBe('spirit')
    expect(out[p - 1].kind).not.toBe('test')
    expect(out[p + 1]?.kind).not.toBe('test')
    // la même question (seuil de 50 %) n'est pas reposée juste après pour une autre entité
    const std = card('s', 'wraith', 'sanity', '50 %')
    const withStd = [...rest.slice(0, 6), card('t', 'g12', 'sanity', '50 %'), ...rest.slice(6)]
    const q = requeue(withStd, std)
    const at = q.indexOf(std)
    for (let i = Math.max(0, at - SAME_ASK_GAP); i <= Math.min(q.length - 1, at + SAME_ASK_GAP); i++) if (i !== at) expect(askKey(q[i])).not.toBe(askKey(std))
  })

  it('sans place qui respecte tout, la première qui garde les entités à distance, sinon la première possible', () => {
    // que des tests : la sorte ne peut pas changer, les entités restent à distance
    const x = card('x', 'spirit', 'test')
    const tests = Array.from({ length: 10 }, (_, i) => card(`t${i}`, i === 5 ? 'spirit' : `g${i}`, 'test'))
    const p = requeue(tests, x).indexOf(x)
    expect(p).toBeGreaterThanOrEqual(REQUEUE_GAP)
    expect(Math.abs(p - 5)).toBeGreaterThan(SAME_GHOST_GAP)
    // une seule entité : la première place possible
    const same = Array.from({ length: 8 }, (_, i) => card(`s${i}`, 'spirit', 'tells'))
    expect(requeue(same, x).indexOf(x)).toBe(REQUEUE_GAP)
    // des cartes sans entité (mécaniques) : seule la sorte compte
    const facts = Array.from({ length: 8 }, (_, i) => card(`m${i}`, undefined, i === 5 || i === 6 ? 'fact' : 'tells'))
    const f = card('mf', undefined, 'fact')
    const out = requeue(facts, f)
    const k = out.indexOf(f)
    expect(k).toBeGreaterThanOrEqual(REQUEUE_GAP)
    expect(out[k - 1].kind === 'fact' || out[k + 1]?.kind === 'fact').toBe(false)
  })

  it('une carte déjà répondue plus tôt dans la journée compte ses passages', () => {
    const start = new Date('2026-11-01T14:00:00').getTime()
    const log = [
      { id: 'hier', t: start - 86_400_000, g: 1 as const, isNew: true },
      { id: 'a', t: start - 60_000, g: 1 as const, isNew: true },
      { id: 'a', t: start - 30_000, g: 1 as const, isNew: false },
      { id: 'b', t: start - 10_000, g: 3 as const, isNew: true },
      { id: 'c', t: start + 10_000, g: 3 as const, isNew: true },
    ]
    expect(passesBefore(log, start)).toEqual({ a: 2, b: 1 })
  })
})

/**
 * Des séances jouées comme sur la page Réviser (les mêmes fonctions : file, questions, requeue, bouton de fin
 * de séance), profil neuf, `seconds` secondes à `perCard` secondes par réponse.
 */
interface Shown {
  session: number
  card: Card
  pass: number
  q: Question | null
  ok: boolean
  /** cartes encore dans la file après la réponse (avant de remettre la carte ratée) */
  left: number
  /** le jour, les passages d'avant et les entités de la séance, tels que la page les passe à questionForCard */
  day: string
  seen: number
  peers: string[]
  known: string[]
}
function play(day: string, pRight: number, seconds = 240, perCard = 7, from?: PersistedState, sessions = Infinity): { shown: Shown[]; state: PersistedState } {
  let clock = new Date(`${day}T14:00:00`).getTime()
  const end = clock + seconds * 1000
  let state: PersistedState = from ?? { ...initialState(clock), onboarded: true }
  const deck = buildDeck(GHOSTS, MECHANICS, [])
  const rng = createRng(parseInt(hashString(`${day}|${pRight}`), 36))
  let queue = buildReviewQueue(state, deck, clock)
  let peers = sessionGhosts(queue)
  let known = studiedGhosts(deck, state.cards)
  let since = clock
  let earlier = passesBefore(state.log, since)
  let before = answersBefore(state.log, since)
  let passes: Record<string, number> = {}
  let session = 0
  const shown: Shown[] = []
  while (clock + perCard * 1000 <= end) {
    if (!queue.length) {
      if (session + 1 >= sessions) break
      // l'écran de fin compte la séance suivante ; le clic la lance un peu plus tard (même bouton, même séance)
      const pending = buildReviewQueue(state, deck, clock).length
      const learnable = pending > 0 ? 0 : buildReviewQueue(state, deck, clock, LEARN_MORE).length
      const next = nextSession(pending, learnable, false)
      if (!next) break
      clock += 5_000
      queue = buildReviewQueue(state, deck, clock, next.extraNew)
      expect(queue.length, `${day} : ${next.label}`).toBe(next.extraNew ? learnable : pending)
      peers = sessionGhosts(queue)
      known = studiedGhosts(deck, state.cards)
      since = clock
      earlier = passesBefore(state.log, since)
      before = answersBefore(state.log, since)
      passes = {}
      session++
      if (!queue.length) break
      continue
    }
    const card = queue[0]
    const pass = (earlier[card.id] ?? 0) + (passes[card.id] ?? 0)
    const q = questionForCard(card, { allGhosts: GHOSTS, mechanics: MECHANICS, day: dayKey(since), pass, seen: before[card.id] ?? 0, peers, known })
    const at = clock + perCard * 1000
    const ok = rng() < pRight
    const prev = state.cards[card.id]
    const next = schedule(prev, ok ? 3 : 1, at)
    state = { ...state, cards: { ...state.cards, [card.id]: next }, log: [...state.log, { id: card.id, t: at, g: ok ? 3 : 1, isNew: !prev }] }
    let rest = queue.slice(1)
    shown.push({ session, card, pass, q, ok, left: rest.length, day: dayKey(since), seen: before[card.id] ?? 0, peers, known })
    if (comesBackInSession(next, at, passes[card.id] ?? 0)) {
      rest = requeue(rest, card, requeueGap(next, at))
      passes = { ...passes, [card.id]: (passes[card.id] ?? 0) + 1 }
    }
    queue = rest
    clock = at
  }
  return { shown, state }
}

describe('révision : une séance de quelques minutes ne tourne pas sur les mêmes questions', () => {
  const DAYS = ['2026-11-01', '2026-11-02', '2026-11-03']
  const screen = (x: Shown) => `${x.q?.prompt ?? x.card.front} | ${x.q?.quote ?? ''}`
  const choices = (x: Shown) => x.q?.choices.map((c) => c.label).join(' / ') ?? ''

  it('joueur expérimenté, 4 minutes : aucune carte juste ne repasse', () => {
    for (const day of DAYS) {
      const { shown } = play(day, 0.9)
      expect(shown.length).toBeGreaterThanOrEqual(30)
      const right = new Set<string>()
      for (const x of shown) {
        expect(right.has(x.card.id), `${day} : ${x.card.id} juste plus tôt, reposée`).toBe(false)
        if (x.ok) right.add(x.card.id)
      }
      // les seules cartes qui repassent sont des cartes ratées : une fois plus loin, et à la séance suivante si elles
      // sont ratées encore (le bouton de fin de séance les compte)
      expect(new Set(shown.map((x) => x.card.id)).size / shown.length, day).toBeGreaterThanOrEqual(0.8)
    }
  })

  it('débutant : une carte ratée repasse au moins cinq cartes plus loin, une seule fois, et pas sur le même écran', () => {
    let returns = 0
    let reworded = 0
    for (const day of DAYS) {
      const { shown } = play(day, 0.45)
      for (let i = 0; i < shown.length; i++) {
        const x = shown[i]
        const j = shown.findIndex((y, k) => k > i && y.card.id === x.card.id && y.session === x.session)
        if (j < 0) continue
        returns++
        // jamais juste avant : il restait des cartes, elle repasse au moins REQUEUE_GAP cartes plus loin
        expect(x.ok, `${day} : ${x.card.id}`).toBe(false)
        expect(j - i - 1, `${day} : ${x.card.id} à ${i + 1} puis ${j + 1}`).toBeGreaterThanOrEqual(Math.min(REQUEUE_GAP, x.left))
        // une seule fois par séance
        expect(shown.filter((y) => y.card.id === x.card.id && y.session === x.session).length).toBeLessThanOrEqual(1 + MAX_RETURNS)
        // jamais le même écran : posée autrement si elle le peut, d'autres choix sinon
        const y = shown[j]
        expect(`${screen(y)} | ${choices(y)}`, x.card.id).not.toBe(`${screen(x)} | ${choices(x)}`)
        // elle revient au passage suivant, qui alterne avec le précédent (l'autre façon de la poser)
        expect(y.pass, x.card.id).toBe(x.pass + 1)
        // la carte se pose autrement ce jour-là : c'est bien cette autre façon qui s'affiche
        const ask = (pass: number) => questionForCard(x.card, { allGhosts: GHOSTS, mechanics: MECHANICS, day: y.day, pass, seen: y.seen, peers: y.peers, known: y.known })
        const [a, b] = [ask(x.pass), ask(y.pass)]
        if (a && b && `${a.prompt}|${a.quote ?? ''}` !== `${b.prompt}|${b.quote ?? ''}`) expect(screen(y), x.card.id).not.toBe(screen(x))
        if (screen(y) !== screen(x)) reworded++
      }
    }
    expect(returns).toBeGreaterThan(15)
    expect(reworded / returns, `${reworded}/${returns}`).toBeGreaterThanOrEqual(0.6)
  })

  it('les QCM de noms ne montrent pas toujours les quatre mêmes entités', () => {
    for (const day of DAYS) {
      for (const pRight of [0.9, 0.45]) {
        const { shown } = play(day, pRight)
        const named = shown.filter((x) => x.q && x.q.choices.every((c) => getGhost(c.id)?.name === c.label))
        expect(named.length).toBeGreaterThan(8)
        const sets = new Map<string, number>()
        for (const x of named) {
          const k = x.q!.choices.map((c) => c.id).sort().join(',')
          sets.set(k, (sets.get(k) ?? 0) + 1)
        }
        const top = Math.max(...sets.values())
        expect(top / named.length, `${day} à ${pRight} : ${top}/${named.length}`).toBeLessThanOrEqual(0.25)
        // une question qui nomme l'entité la montre dans l'en-tête ; les autres la taisent jusqu'à la réponse
        for (const x of shown) {
          const g = x.card.ghostId ? getGhost(x.card.ghostId) : undefined
          if (!g || !x.q) continue
          const said = namesGhost(`${x.q.prompt} ${x.q.quote ?? ''}`, g)
          if (x.q.choices.every((c) => getGhost(c.id)?.name === c.label)) expect(said, `${x.card.id} : ${x.q.prompt}`).toBe(false)
        }
      }
    }
  })

  it('jours suivants : une carte due ne revient pas avec l’énoncé de la dernière fois quand elle peut s’en passer', () => {
    for (const [pRight, seconds, sessions] of [[0.9, 240, Infinity], [0.45, 240, Infinity], [0.85, 3600, 1]] as const) {
      let state: PersistedState | undefined
      const last = new Map<string, string>()
      let due = 0
      let same = 0
      for (let d = 1; d <= 7; d++) {
        const day = `2026-11-${String(d).padStart(2, '0')}`
        const run = play(day, pRight, seconds, 7, state, sessions)
        state = run.state
        const today = new Set<string>()
        for (const x of run.shown) {
          if (!x.q) continue
          if (!today.has(x.card.id) && last.has(x.card.id)) {
            due++
            if (last.get(x.card.id) === screen(x)) same++
          }
          today.add(x.card.id)
          last.set(x.card.id, screen(x))
        }
      }
      // avant : neuf cartes dues sur dix reprenaient l'énoncé et la citation de la veille
      expect(due, `${pRight}`).toBeGreaterThan(40)
      expect(same / due, `${pRight} : ${same}/${due}`).toBeLessThanOrEqual(0.45)
    }
  }, 120_000)

  it('deux cartes de la même sorte ne se suivent pas dans la première séance', () => {
    for (let d = 1; d <= 20; d++) {
      const now = Date.UTC(2026, 10, d, 12)
      const queue = buildReviewQueue({ ...initialState(now), onboarded: true }, buildDeck(GHOSTS, MECHANICS, []), now)
      const kinds = queue.map((c) => c.kind)
      for (let i = 1; i < kinds.length; i++) expect(kinds[i], `jour ${d} : ${kinds.join(' ')}`).not.toBe(kinds[i - 1])
    }
  })
})

describe('Révision : une séance laissée en route reprend où elle en était', () => {
  const deck = buildDeck(GHOSTS, MECHANICS, [])
  const now = new Date(2026, 10, 1, 18, 0).getTime()
  const since = now - 10 * 60_000
  const ids = deck.slice(0, 6).map((c) => c.id)
  const log = [0, 1, 2].map((k) => ({ id: ids[k], t: since + (k + 1) * 60_000, g: 3 as Grade, isNew: true }))
  const saved: SavedSession<{ cardId: string }> = {
    day: dayKey(now),
    since,
    queue: ids.slice(3),
    peers: ['spirit'],
    known: [],
    done: 3,
    good: 3,
    passes: {},
    total: 6,
    settled: 3,
    outcome: { cardId: ids[3] },
    revealed: false,
    previous: null,
  }

  it('même jour, réponses au journal : la file, les compteurs et la correction en cours reviennent', () => {
    const r = resumeSession(saved, deck, log, now)
    expect(r?.queue.map((c) => c.id)).toEqual(ids.slice(3))
    expect(r).toMatchObject({ since, done: 3, good: 3, total: 6, settled: 3, outcome: { cardId: ids[3] } })
  })

  it('le lendemain, sans réponse, après une remise à zéro ou sans cartes : on repart sur une séance neuve', () => {
    expect(resumeSession({ ...saved, day: '2026-10-31' }, deck, log, now)).toBeNull()
    expect(resumeSession({ ...saved, done: 0 }, deck, log, now)).toBeNull()
    expect(resumeSession(saved, deck, [], now)).toBeNull()
    expect(resumeSession({ ...saved, queue: ['n:supprimee'] }, deck, log, now)).toBeNull()
    expect(resumeSession('illisible', deck, log, now)).toBeNull()
    expect(resumeSession(null, deck, log, now)).toBeNull()
  })

  it('une carte sortie du paquet quitte la file ; la correction gardée ne vaut que pour la carte en tête', () => {
    const r = resumeSession({ ...saved, queue: ['n:supprimee', ...ids.slice(3)] }, deck, log, now)
    expect(r?.queue.map((c) => c.id)).toEqual(ids.slice(3))
    const other = resumeSession({ ...saved, outcome: { cardId: ids[5] } }, deck, log, now)
    expect(other?.outcome).toBeNull()
  })

  it('une séance en cours n’est pas close', () => {
    expect(resumeSession(saved, deck, log, now)).toMatchObject({ finished: false, ended: null })
  })
})

describe('Révision : le bilan d’une séance close revient le jour même', () => {
  const deck = buildDeck(GHOSTS, MECHANICS, [])
  const now = new Date(2026, 10, 1, 18, 0).getTime()
  const since = now - 10 * 60_000
  const ended = since + 4 * 60_000
  const ids = deck.slice(0, 3).map((c) => c.id)
  const log = [0, 1, 2].map((k) => ({ id: ids[k], t: since + (k + 1) * 60_000, g: (k === 1 ? 1 : 3) as Grade, isNew: true }))
  const closed: SavedSession<{ cardId: string }> = {
    day: dayKey(now),
    since,
    queue: [],
    peers: [],
    known: [],
    done: 3,
    good: 2,
    passes: {},
    total: 3,
    settled: 3,
    outcome: null,
    revealed: false,
    previous: null,
    finished: true,
    ended,
  }

  it('après un détour (codex, autre onglet, rechargement), la page rouvre le bilan, même sans carte restante', () => {
    const r = resumeSession(closed, deck, log, now)
    expect(r).toMatchObject({ finished: true, ended, done: 3, good: 2, since })
    expect(r?.queue).toEqual([])
  })

  it('les réponses données après la clôture (une autre séance) ne la rendent pas caduque', () => {
    const later = [...log, { id: ids[0], t: ended + 60_000, g: 3 as Grade, isNew: false }]
    expect(resumeSession(closed, deck, later, now)?.finished).toBe(true)
  })

  it('le lendemain, après une remise à zéro, ou sans heure de clôture : pas de bilan', () => {
    expect(resumeSession({ ...closed, day: '2026-10-31' }, deck, log, now)).toBeNull()
    expect(resumeSession(closed, deck, [], now)).toBeNull()
    expect(resumeSession({ ...closed, ended: null }, deck, log, now)).toBeNull()
    expect(resumeSession({ ...closed, ended: now + 60_000 }, deck, log, now)).toBeNull()
    // seules les réponses d'avant la clôture comptent : une réponse manquante la rend caduque
    expect(resumeSession({ ...closed, ended: since + 2 * 60_000 }, deck, log, now)).toBeNull()
  })

  it('un lien qui demande une séance (« Commencer la révision ») ne rouvre pas le bilan : il lance une séance', () => {
    const r = resumeSession(closed, deck, log, now)
    expect(restoreSaved(r, true)).toBeNull()
    // l'onglet, le retour, un détour par une fiche : le bilan revient
    expect(restoreSaved(r, false)).toBe(r)
    expect(START_REVIEW).toBe(`/revision?${START_PARAM}=nouvelle`)
  })

  it('une séance en cours reprend, même depuis un lien qui demande une séance', () => {
    const running = resumeSession({ ...closed, finished: false, ended: null, queue: deck.slice(3, 6).map((c) => c.id), total: 6 }, deck, log, now)
    expect(running?.finished).toBe(false)
    expect(restoreSaved(running, true)).toBe(running)
    expect(restoreSaved(running, false)).toBe(running)
    expect(restoreSaved(null, true)).toBeNull()
  })
})

describe('Titre de l’onglet : une page, un titre', () => {
  it('nomme la page, et l’entité sur sa fiche', () => {
    expect(pageTitle('/')).toBe('Phasmo Coach')
    expect(pageTitle('/installer')).toBe('Installer l’app · Phasmo Coach')
    expect(pageTitle('/carnet')).toBe('Mes notes · Phasmo Coach')
    expect(pageTitle('/codex')).toBe('Codex · Phasmo Coach')
    expect(pageTitle('/codex/wraith')).toBe(`${getGhost('wraith')!.name} · Codex · Phasmo Coach`)
    expect(pageTitle('/nulle-part')).toBe('Page introuvable · Phasmo Coach')
  })
})

describe('Codex : Entrée dans la recherche ouvre la fiche quand une seule entité correspond', () => {
  const [a, b, c] = GHOSTS
  it('une seule entité retenue (recherche et carnet) : sa fiche', () => {
    expect(searchTarget([a], [])).toBe(a)
    // le carnet a écarté les autres trouvailles de la recherche : il en reste une
    expect(searchTarget([a], [b, c])).toBe(a)
  })
  it('la recherche ne trouve qu’une entité, écartée par le carnet : sa fiche quand même', () => {
    expect(searchTarget([], [b])).toBe(b)
  })
  it('plusieurs entités, ou aucune : Entrée ne fait rien', () => {
    expect(searchTarget([a, b], [])).toBeNull()
    expect(searchTarget([], [b, c])).toBeNull()
    expect(searchTarget([], [])).toBeNull()
  })

  const enter = (query: string, filter = EMPTY_FILTER) => {
    const { matching, out } = searchCodex(GHOSTS, query, filter)
    return searchTarget(matching, out)?.id ?? null
  }

  it('le nom exact d’une entité ouvre sa fiche, même quand d’autres fiches le citent (Démon, Ombre, Oni)', () => {
    expect(enter('Démon')).toBe('demon')
    expect(enter('ombre')).toBe('shade')
    expect(enter('oni')).toBe('oni')
    expect(enter('  le démon ')).toBe('demon')
    expect(enter('Demon')).toBe('demon')
    expect(enter('les jumeaux')).toBe('the-twins')
    expect(enter('Mimic')).toBe('the-mimic')
    expect(enter('The Twins')).toBe('the-twins')
    // les 30 noms, en français comme en anglais
    for (const g of GHOSTS) {
      expect(enter(g.name)).toBe(g.id)
      expect(enter(g.nameEn)).toBe(g.id)
    }
  })

  it('le nom exact d’une entité écartée par le carnet : la recherche ne trouve qu’elle, barrée, et Entrée ouvre sa fiche', () => {
    const emf = { ...EMPTY_FILTER, evidence: { emf: 'found' as const } }
    const r = searchCodex(GHOSTS, 'Démon', emf)
    expect(r.matching).toEqual([])
    expect(r.out.map((g) => g.id)).toEqual(['demon'])
    expect(enter('Démon', emf)).toBe('demon')
  })

  it('un bout de nom ou un comportement cherche toujours dans tout le texte des fiches', () => {
    expect(exactName(GHOSTS, 'dém')).toBeNull()
    expect(exactName(GHOSTS, '')).toBeNull()
    expect(searchCodex(GHOSTS, 'dém', EMPTY_FILTER).matching.length).toBeGreaterThan(1)
  })
})

describe('Mise en situation : le contrat en cours survit à un détour', () => {
  const now = Date.parse('2026-11-01T15:00:00')
  const scenario = generateScenario(getGhost('hantu')!, 'pro', createRng(42), GHOSTS)
  const run: SavedContract = {
    scenario,
    revealed: 3,
    filter: { ...EMPTY_FILTER, evidence: { freezing: 'found', emf: 'excluded' } },
    struck: ['spirit'],
    wrong: ['wraith'],
  }
  const roundTrip = (r: unknown) => JSON.parse(JSON.stringify(r)) as SavedContract

  it('se garde pour l’onglet et la journée, et se relit tel quel', () => {
    sessionStorage.clear()
    saveRun(CONTRACT_KEY, run, now)
    expect(readContract(now)).toEqual(roundTrip(run))
    // le lendemain, plus de contrat à reprendre
    expect(readContract(now + 86_400_000)).toBeNull()
    sessionStorage.clear()
    expect(readContract(now)).toBeNull()
  })

  it('un contrat abîmé ou impossible ne se reprend pas', () => {
    expect(validContract(roundTrip(run))).toBe(true)
    const bad: unknown[] = [
      { ...run, scenario: { ...scenario, ghostId: 'personne' } },
      { ...run, scenario: { ...scenario, difficulty: 'facile' } },
      { ...run, scenario: { ...scenario, clues: [] } },
      { ...run, revealed: 1 },
      { ...run, revealed: scenario.clues.length + 1 },
      { ...run, revealed: 2.5 },
      { ...run, filter: { ...EMPTY_FILTER, evidence: { laser: 'found' } } },
      { ...run, filter: null },
      { ...run, struck: 'spirit' },
      // deux erreurs terminent le contrat : il n'est plus « en cours »
      { ...run, wrong: ['wraith', 'phantom'] },
      { ...run, wrong: ['personne'] },
      { revealed: 3 },
    ]
    for (const b of bad) expect(validContract(roundTrip(b)), JSON.stringify(b).slice(0, 80)).toBe(false)
  })
})

describe('« LdV » en toutes lettres là où on le lit', () => {
  it('spellLdV écrit « ligne de vue », sans toucher aux autres mots', () => {
    expect(spellLdV('1,7 m/s · accélère en LdV')).toBe('1,7 m/s · accélère en ligne de vue')
    expect(spellLdV('2,5 m/s si disjoncteur allumé, LdV et > 3 m')).toBe('2,5 m/s si disjoncteur allumé, ligne de vue et > 3 m')
    expect(spellLdV('LdVx et xLdV')).toBe('LdVx et xLdV')
  })

  it('aucune question de la révision ni du quiz n’écrit « LdV » (énoncé, citation, réponses, correction)', () => {
    const deck = buildDeck(GHOSTS, MECHANICS, [])
    const shown: string[] = []
    const add = (q: Question | null) => {
      if (!q) return
      shown.push(q.prompt, q.quote ?? '', q.note ?? '', q.explain, ...q.choices.map((c) => c.label))
    }
    for (const card of deck) for (const pass of [0, 1, 2]) add(questionForCard(card, { allGhosts: GHOSTS, mechanics: MECHANICS, day: '2026-11-01', pass, seen: pass }))
    for (const t of QUIZ_TOPICS) for (let seed = 1; seed <= 12; seed++) for (const q of buildQuiz({ topics: [t.id], ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 10, rng: createRng(seed) })) add(q)
    expect(shown.filter((t) => /\bLdV\b/.test(t))).toEqual([])
    // le verso des cartes de vitesse garde le résumé de la fiche : la page de révision l'écrit en toutes lettres
    const backs = deck.filter((c) => /\bLdV\b/.test(c.back))
    expect(backs.length).toBeGreaterThan(0)
    for (const c of backs) expect(spellLdV(c.back)).not.toMatch(/\bLdV\b/)
  })
})
