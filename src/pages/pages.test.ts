import { describe, expect, it } from 'vitest'
import { getGhost, GHOSTS, MECHANICS } from '../data'
import { buildDeck, namesGhost, type Card } from '../engine/cards'
import { dayKey, spellLdV } from '../engine/format'
import { askKey, buildReviewQueue, SAME_ASK_GAP, SAME_GHOST_GAP, sessionGhosts, studiedGhosts, unseenCards } from '../engine/progress'
import { buildQuiz, questionForCard, QUIZ_TOPICS, type Question, type QuizTopic } from '../engine/quiz'
import { entityMentions } from '../engine/mentions'
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
  REQUEUE_MIN_OTHERS,
  REQUEUE_WITHIN,
  requeueGap,
  restoreSaved,
  resumeSession,
  START_PARAM,
  START_REVIEW,
  stillFresh,
  stillToAsk,
  type SavedSession,
} from './reviewSession'
import { reviseLabel } from './exhibits'
import { pageTitle } from '../components/Layout'
import { criteriaText, exactName, keepsSearch, searchCodex, searchSnippet, searchTarget, searchTexts } from './Codex'
import { memoryKey, parseScrolls, rememberScroll, restoresScroll, SCROLL_MAX, scrollFor } from './scrollMemory'
import { COACHING_SOLO_LEAD, steps as coachingSteps } from './Coaching'
import { draftChanged, onlyAQuestion, titleHelp, type NoteDraft } from '../components/NoteEditor'
import { CONTRACT_KEY, readContract, readVerdict, validContract, validVerdict, VERDICT_KEY, type ContractVerdict, type SavedContract } from './contractRun'
import { reloadedPath, saveRun } from './savedRun'
import {
  copyMeta,
  COUNT_KEY,
  defaultPool,
  quickQuizLabel,
  readCopy,
  readGraded,
  readQuizCount,
  rememberQuizCount,
  requeueSummary,
  RESUME_QUIZ,
  scopeLine,
  STUDIED_MIN,
  validCopy,
  validGraded,
  GRADED_KEY,
  type GradedCopy,
  COPY_KEY,
  type SavedCopy,
} from './quizRun'
import { TEST_NOT_RECORDED, trueFalseLabel } from './Mechanics'
import { noteQuestion } from '../engine/cards'
import { cameFromCodex, FROM_CODEX } from './codexReturn'
import { confOpen } from './GhostPage'
import { bareSpace, ignoreKey } from '../engine/keys'
import { fr, NBSP as NBSP_, NNBSP } from '../engine/format'
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
      // comme la page : les autres cartes qui restent dans la séance comptent (voir REQUEUE_MIN_OTHERS)
      if (comesBackInSession(next, clock, passes[card.id] ?? 0, rest.length)) {
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

  it('en fin de séance (moins de trois autres cartes), une carte ratée attend la séance suivante', () => {
    expect(REQUEUE_MIN_OTHERS).toBe(3)
    expect(comesBackInSession(learn(1), at, 0, REQUEUE_MIN_OTHERS)).toBe(true)
    for (const others of [0, 1, 2]) expect(comesBackInSession(learn(1), at, 0, others), `${others} autres cartes`).toBe(false)
    // une carte apprise puis ratée aussi ; juste, elle ne repasse de toute façon pas
    const lapse = schedule({ ...learn(3), due: at }, 1, at)
    expect(comesBackInSession(lapse, at, 0, 2)).toBe(false)
    expect(comesBackInSession(learn(3), at, 0, 10)).toBe(false)
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
    if (comesBackInSession(next, at, passes[card.id] ?? 0, rest.length)) {
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

  it('fin de séance : une carte ratée ne revient pas une ou deux cartes plus loin, la séance suivante la compte', () => {
    const deck = buildDeck(GHOSTS, MECHANICS, [])
    let late = 0
    for (const day of DAYS) {
      // une seule séance, débutant : il en rate assez pour qu'une carte le soit tout près de la fin
      const { shown, state } = play(day, 0.45, 600, 7, undefined, 1)
      const left: string[] = []
      for (let i = 0; i < shown.length; i++) {
        const x = shown[i]
        const j = shown.findIndex((y, k) => k > i && y.card.id === x.card.id && y.session === x.session)
        // quand elle repasse, au moins REQUEUE_MIN_OTHERS autres cartes l'en séparent
        if (j >= 0) expect(j - i - 1, `${day} : ${x.card.id} à ${i + 1} puis ${j + 1}`).toBeGreaterThanOrEqual(REQUEUE_MIN_OTHERS)
        if (!x.ok && x.left < REQUEUE_MIN_OTHERS) {
          expect(j, `${day} : ${x.card.id} ratée avec ${x.left} cartes après elle`).toBe(-1)
          left.push(x.card.id)
        }
      }
      late += left.length
      // l'écran de fin, puis le clic : « Continuer avec N cartes » les compte, et la séance lancée les pose
      const end = state.log.at(-1)!.t + 5_000
      const pending = buildReviewQueue(state, deck, end)
      const next = nextSession(pending.length, 0, false)
      expect(next?.label, day).toBe(`Continuer avec ${pending.length} ${pending.length > 1 ? 'cartes' : 'carte'}`)
      for (const id of left) expect(pending.map((c) => c.id), `${day} : ${id}`).toContain(id)
    }
    expect(late).toBeGreaterThan(0)
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

  it('minuit passé en pleine séance : rechargée trois minutes après une réponse, elle reprend ; le lendemain matin, non', () => {
    const evening = new Date(2026, 10, 1, 23, 50).getTime()
    const late = [0, 1, 2, 3].map((k) => ({ id: ids[k], t: evening + (k + 1) * 2 * 60_000, g: 3 as Grade, isNew: true }))
    const night: SavedSession<{ cardId: string }> = { ...saved, day: dayKey(evening), since: evening, done: 4, good: 4, settled: 4, queue: ids.slice(4), outcome: null }
    // dernière réponse à 23 h 58, rechargement à 0 h 01
    const r = resumeSession(night, deck, late, new Date(2026, 10, 2, 0, 1).getTime())
    expect(r).toMatchObject({ since: evening, day: dayKey(evening), done: 4 })
    expect(r?.queue.map((c) => c.id)).toEqual(ids.slice(4))
    // la même séance, laissée à 23 h, rouverte à 9 h le lendemain : séance neuve
    const before = new Date(2026, 10, 1, 22, 50).getTime()
    const old = late.map((l) => ({ ...l, t: l.t - 60 * 60_000 }))
    expect(resumeSession({ ...night, day: dayKey(before), since: before }, deck, old, new Date(2026, 10, 2, 9, 0).getTime())).toBeNull()
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

  it('« Reprendre la séance » ne repose pas une carte répondue depuis dans un autre onglet, ni une carte qui n’est plus due', () => {
    const queue = deck.slice(3, 8)
    const [a, b, c, d, e] = queue.map((x) => x.id)
    const later = [...log, { id: a, t: ended + 2 * 60_000, g: 3 as Grade, isNew: true }]
    const cards = {
      // répondue ailleurs après la clôture : elle s'est espacée
      [a]: schedule(undefined, 3, ended + 2 * 60_000),
      // ratée dans cette séance, avant la clôture : elle revient vite, toujours due
      [b]: schedule(undefined, 1, since + 2 * 60_000),
      // apprise un autre jour, prévue dans trois jours : plus due
      [c]: { ...schedule(undefined, 3, now - 5 * 86_400_000), phase: 'review' as const, due: now + 3 * 86_400_000 },
    }
    const kept = stillFresh(queue, later, cards, ended, now).map((x) => x.id)
    expect(kept).toEqual([b, d, e])
    // rien de neuf depuis la clôture : la file reste telle quelle
    expect(stillFresh(queue, log, {}, ended, now)).toEqual(queue)
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

describe('Codex : « ‹ Codex » sur une fiche ouverte depuis la recherche y revient en arrière (app installée, sans bouton retour)', () => {
  it('seulement pour une fiche ouverte depuis le Codex, avec une entrée avant elle dans l’historique', () => {
    expect(cameFromCodex(FROM_CODEX, 3)).toBe(true)
    // premier écran de l'onglet (lien partagé, app rouverte sur la fiche) : rien derrière, le lien ouvre le Codex
    expect(cameFromCodex(FROM_CODEX, 0)).toBe(false)
    expect(cameFromCodex(FROM_CODEX, undefined)).toBe(false)
    // fiche ouverte d'ailleurs (accueil, fiche voisine, mention) : le lien ouvre le Codex
    for (const st of [null, undefined, {}, { fromCodex: 'oui' }, 'fromCodex']) expect(cameFromCodex(st, 3)).toBe(false)
  })

  it('« Voir les N autres » de « Ne pas confondre » suit l’entrée de l’historique, et garde le retour au Codex', () => {
    expect(confOpen({ confOpen: true })).toBe(true)
    // la liste dépliée garde la fiche « venue du Codex »
    expect(confOpen({ ...FROM_CODEX, confOpen: true }) && cameFromCodex({ ...FROM_CODEX, confOpen: true }, 3)).toBe(true)
    for (const st of [null, undefined, {}, FROM_CODEX, { confOpen: 'oui' }, { confOpen: false }]) expect(confOpen(st)).toBe(false)
  })
})

describe('Codex : une vieille recherche ne trie pas la partie suivante en silence', () => {
  const saved = { query: 'Obambo', key: 'k1' }
  it('revenir d’une fiche par « Précédent » (ou recharger la page) garde la recherche tapée', () => {
    expect(keepsSearch(saved, 'POP', 'k1')).toBe(true)
  })
  it('entrer à neuf dans le codex (onglet, lien, accueil) repart sans recherche', () => {
    // un lien ou un onglet crée une nouvelle entrée d’historique
    expect(keepsSearch(saved, 'PUSH', 'k2')).toBe(false)
    expect(keepsSearch(saved, 'REPLACE', 'k2')).toBe(false)
    // « Précédent » vers une autre page du codex que celle où la recherche a été tapée
    expect(keepsSearch(saved, 'POP', 'k2')).toBe(false)
    // une recherche gardée par une version d’avant (sans entrée d’historique) ne revient pas
    expect(keepsSearch({ query: 'Obambo' }, 'POP', 'default')).toBe(false)
    expect(keepsSearch({ query: '', key: 'k1' }, 'POP', 'k1')).toBe(false)
  })
  it('les critères en cours se lisent en toutes lettres, sous le titre', () => {
    expect(criteriaText(EMPTY_FILTER)).toBe('')
    expect(criteriaText({ ...EMPTY_FILTER, speed: ['fast', 'slow'] })).toBe('vitesse lente ou rapide')
    expect(criteriaText({ ...EMPTY_FILTER, huntAbove: 60, los: false })).toBe(`chasse au-dessus de 60${NBSP_}% de santé · n’accélère pas en ligne de vue`)
    expect(criteriaText({ ...EMPTY_FILTER, speed: ['normal'], los: true })).toBe('vitesse normale · accélère en ligne de vue')
  })
})

describe('Notes : Échap ne perd jamais un texte sans demander', () => {
  const empty: NoteDraft = { title: '', body: '', ghost: 'hantu', asCard: true, question: '', answer: '', wrong: ['', '', ''] }
  it('rien d’écrit : le formulaire se ferme tout de suite', () => {
    expect(draftChanged(empty, { ...empty, wrong: ['', '', ''] })).toBe(false)
  })
  it('un mot écrit ou un choix changé : on demande d’abord', () => {
    expect(draftChanged(empty, { ...empty, body: 'Encens' })).toBe(true)
    expect(draftChanged(empty, { ...empty, title: 'x' })).toBe(true)
    expect(draftChanged(empty, { ...empty, wrong: ['', '90 s', ''] })).toBe(true)
    expect(draftChanged(empty, { ...empty, ghost: null })).toBe(true)
    expect(draftChanged(empty, { ...empty, asCard: false })).toBe(true)
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

  it('minuit passé en plein contrat : relu trois minutes après, il reprend ; le lendemain matin, non', () => {
    sessionStorage.clear()
    const evening = Date.parse('2026-11-01T23:58:00')
    saveRun(CONTRACT_KEY, run, evening)
    expect(readContract(Date.parse('2026-11-02T00:01:00'))).toEqual(roundTrip(run))
    expect(readContract(Date.parse('2026-11-02T09:00:00'))).toBeNull()
    // un contrat gardé avant cette version (sans heure) : le jour seul compte, comme avant
    sessionStorage.setItem(CONTRACT_KEY, JSON.stringify({ day: dayKey(evening), run }))
    expect(readContract(evening + 60_000)).toEqual(roundTrip(run))
    expect(readContract(Date.parse('2026-11-02T00:01:00'))).toBeNull()
    // une heure lue dans le futur ne prolonge rien
    sessionStorage.setItem(CONTRACT_KEY, JSON.stringify({ day: dayKey(evening), t: evening + 86_400_000, run }))
    expect(readContract(Date.parse('2026-11-02T00:01:00'))).toBeNull()
    sessionStorage.clear()
  })

  it('le rapport de clôture reste à son entrée de l’historique, perdu à la deuxième erreur aussi', () => {
    sessionStorage.clear()
    const verdict: ContractVerdict = { ...run, wrong: ['wraith', 'spirit'], outcome: 'dead', entry: 'k1' }
    saveRun(VERDICT_KEY, verdict, now)
    expect(readVerdict('k1', now)).toEqual(JSON.parse(JSON.stringify(verdict)))
    expect(readVerdict('k2', now)).toBeNull()
    expect(readVerdict('k1', now + 86_400_000)).toBeNull()
    for (const b of [{ ...verdict, outcome: 'nul' }, { ...verdict, entry: 3 }, { ...verdict, wrong: ['wraith', 'spirit', 'mare'] }, { ...verdict, wrong: ['personne'] }])
      expect(validVerdict(JSON.parse(JSON.stringify(b))), JSON.stringify(b).slice(-60)).toBe(false)
    // un contrat en cours n'a jamais deux erreurs, lui
    expect(validContract(JSON.parse(JSON.stringify({ ...run, wrong: ['wraith', 'spirit'] })))).toBe(false)
    sessionStorage.clear()
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

describe('Clavier : les touches de réponse marchent même si le focus est resté sur l’onglet', () => {
  const press = (key: string, el: HTMLElement | null, extra: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
    Object.defineProperty(e, 'target', { value: el ?? document.body })
    return e
  }
  const make = (html: string) => {
    document.body.innerHTML = html
    return (sel: string) => document.querySelector<HTMLElement>(sel)!
  }

  it('chiffres et lettres répondent sur un lien, un bouton ou la question ; jamais dans un champ de saisie', () => {
    const $ = make(`<nav class="tabs"><a class="tab" href="#/revision">Réviser</a></nav><h2 tabindex="-1">Question</h2>
      <button class="link-btn">Je ne sais pas</button><input type="text" /><textarea></textarea><input type="checkbox" /><div contenteditable="true"></div>`)
    for (const k of ['1', '4', 'a', 'D', 'o', 'n']) {
      expect(ignoreKey(press(k, $('.tab'))), `${k} sur l’onglet`).toBe(false)
      expect(ignoreKey(press(k, $('h2'))), `${k} sur la question`).toBe(false)
      expect(ignoreKey(press(k, $('button'))), `${k} sur un bouton`).toBe(false)
      expect(ignoreKey(press(k, $('input[type=checkbox]'))), `${k} sur une case`).toBe(false)
      expect(ignoreKey(press(k, null)), `${k} sans focus`).toBe(false)
      expect(ignoreKey(press(k, $('input[type=text]'))), `${k} dans un champ`).toBe(true)
      expect(ignoreKey(press(k, $('textarea'))), `${k} dans une zone de texte`).toBe(true)
      expect(ignoreKey(press(k, $('[contenteditable]'))), `${k} dans un texte éditable`).toBe(true)
    }
    // Espace sur la question (ou sans focus) n'actionne rien : l'exercice l'avale, la page ne défile pas ;
    // sur un lien, un bouton ou dans un champ, il garde son rôle
    expect(bareSpace(press(' ', $('h2'))), 'Espace sur la question').toBe(true)
    expect(bareSpace(press(' ', $('h2'), { shiftKey: true })), 'Maj+Espace sur la question').toBe(true)
    expect(bareSpace(press(' ', null)), 'Espace sans focus').toBe(true)
    for (const sel of ['.tab', 'button', 'input[type=text]', 'textarea', 'input[type=checkbox]', '[contenteditable]'])
      expect(bareSpace(press(' ', $(sel))), `Espace sur ${sel}`).toBe(false)
    expect(bareSpace(press(' ', $('h2'), { ctrlKey: true }))).toBe(false)
    expect(bareSpace(press('a', $('h2')))).toBe(false)
    // Ctrl, Cmd, Alt et la touche tenue enfoncée restent au navigateur
    expect(ignoreKey(press('1', $('h2'), { ctrlKey: true }))).toBe(true)
    expect(ignoreKey(press('1', $('h2'), { metaKey: true }))).toBe(true)
    expect(ignoreKey(press('1', $('h2'), { altKey: true }))).toBe(true)
    expect(ignoreKey(press('1', $('h2'), { repeat: true }))).toBe(true)
  })

  it('Entrée et Espace gardent leur rôle sur un lien ou un bouton (l’onglet ne se rouvre pas par l’exercice), pas sur la question', () => {
    const $ = make(`<a class="tab" href="#/revision">Réviser</a><h2 tabindex="-1">Question</h2><button class="choice">A</button>`)
    for (const k of ['Enter', ' ']) {
      expect(ignoreKey(press(k, $('.tab'))), `${k} sur l’onglet`).toBe(true)
      expect(ignoreKey(press(k, $('.choice'))), `${k} sur un choix`).toBe(true)
      expect(ignoreKey(press(k, $('h2'))), `${k} sur la question`).toBe(false)
      expect(ignoreKey(press(k, null)), `${k} sans focus`).toBe(false)
    }
    // là où l'exercice la reprend (Entrée valide une question à plusieurs cases cochées)
    expect(ignoreKey(press('Enter', $('.choice')), (el) => !!el.closest('.choice'))).toBe(false)
  })
})

describe('Quiz : la copie en cours se reprend, d’ailleurs aussi', () => {
  const now = Date.parse('2026-11-01T15:00:00')
  const qs = buildQuiz({ topics: ['behavior', 'speed'], ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 5, rng: createRng(3) })
  const copy: SavedCopy = {
    questions: qs,
    index: 1,
    answers: [{ q: qs[0], selected: [qs[0].choices[0].id], correct: false, requeued: false }],
    selected: [],
    checked: false,
    entry: 'abc123',
  }
  const roundTrip = (r: unknown) => JSON.parse(JSON.stringify(r)) as SavedCopy

  it('se garde pour l’onglet et la journée, et se relit telle quelle ; le lien de reprise ne distribue pas de copie neuve', () => {
    sessionStorage.clear()
    saveRun(COPY_KEY, copy, now)
    expect(readCopy(now)).toEqual(roundTrip(copy))
    expect(readCopy(now + 86_400_000)).toBeNull()
    sessionStorage.clear()
    expect(readCopy(now)).toBeNull()
    // une copie gardée avant cette version (sans entrée d'historique) se reprend aussi
    const { entry: _entry, ...old } = copy
    expect(validCopy(roundTrip(old))).toBe(true)
    expect(new URLSearchParams(RESUME_QUIZ.split('?')[1]).get('copie')).toBe('reprendre')
  })

  it('une copie abîmée, sans réponse ou finie ne se reprend pas', () => {
    expect(validCopy(roundTrip(copy))).toBe(true)
    const bad: unknown[] = [
      { ...copy, answers: [] },
      { ...copy, index: qs.length },
      { ...copy, index: -1 },
      { ...copy, index: 0.5 },
      { ...copy, index: 0, answers: [...copy.answers, ...copy.answers] },
      { ...copy, questions: [{ id: 'x', prompt: 'p' }] },
      { ...copy, questions: 'rien' },
      { ...copy, selected: 'a' },
      { ...copy, checked: 'oui' },
      { ...copy, entry: 4 },
      { ...copy, answers: [{ q: null, selected: [], correct: true }] },
      { index: 1 },
    ]
    for (const b of bad) expect(validCopy(roundTrip(b)), JSON.stringify(b).slice(0, 80)).toBe(false)
  })

  it('le corrigé reste à son entrée de l’historique : « Relire la fiche », puis « Précédent », ou F5, le rouvre ; pas une autre arrivée', () => {
    sessionStorage.clear()
    const answers = qs.map((q) => ({ q, selected: [q.choices[0].id], correct: q.correct.includes(q.choices[0].id), requeued: false }))
    const graded: GradedCopy = { questions: qs, answers, entry: 'abc123' }
    saveRun(GRADED_KEY, graded, now)
    expect(readGraded('abc123', now)).toEqual(JSON.parse(JSON.stringify(graded)))
    // une autre entrée (onglet, lien) : la page de réglages
    expect(readGraded('autre', now)).toBeNull()
    expect(readGraded('abc123', now + 86_400_000)).toBeNull()
    // une copie en cours n'est pas un corrigé, ni un corrigé à qui il manque des réponses
    expect(validGraded(JSON.parse(JSON.stringify({ ...graded, answers: answers.slice(1) })))).toBe(false)
    expect(validGraded(JSON.parse(JSON.stringify({ ...graded, entry: undefined })))).toBe(false)
    // et la copie en cours, elle, reste à reprendre à part
    expect(readCopy(now)).toBeNull()
    sessionStorage.clear()
  })
})

describe('Quiz : par défaut, la copie porte sur les entités déjà étudiées', () => {
  it('à partir de quatre entités étudiées en révision ; en dessous, sur toutes, et la page le dit', () => {
    expect(STUDIED_MIN).toBe(4)
    for (const n of [0, 1, 2, 3]) expect(defaultPool(n), `${n}`).toBe('all')
    for (const n of [4, 9, 30]) expect(defaultPool(n), `${n}`).toBe('studied')
  })

  it('la phrase de la page dit sur quoi porte la copie et pourquoi, à la française', () => {
    expect(scopeLine('studied', 9, 30)).toBe(
      `La copie porte sur les 9 entités que tu as déjà étudiées en révision${NNBSP}: pas de question sur une entité que tu n’as jamais vue. S’il en manque sur elles pour les thèmes cochés, la fin de la copie le dit et passe aux autres entités.`,
    )
    expect(scopeLine('all', 9, 30)).toBe('La copie porte sur les 30 entités, même celles que tu n’as pas encore étudiées en révision.')
    expect(scopeLine('all', 0, 30)).toContain(`Tu n’as encore étudié aucune entité en révision${NNBSP}: la copie porte sur les 30 entités`)
    expect(scopeLine('all', 1, 30)).toBe(`Tu n’as étudié qu’une entité en révision (il en faut 4 pour une copie sur elle seule)${NNBSP}: la copie porte sur les 30 entités.`)
    expect(scopeLine('all', 3, 30)).toBe(`Tu n’as étudié que 3 entités en révision (il en faut 4 pour une copie sur elles seules)${NNBSP}: la copie porte sur les 30 entités.`)
    for (const t of [scopeLine('studied', 4, 30), scopeLine('all', 2, 30), scopeLine('all', 12, 30)]) expect(fr(t)).toBe(t)
  })

  it('l’enveloppe d’une copie en cours dit où elle en est, au lieu de « 10 questions · ≈ 3 min »', () => {
    const q = (n: number) => Array.from({ length: n }, () => ({}) as Question)
    expect(copyMeta({ questions: q(5), answers: q(3) as never })).toBe('3 réponses sur 5')
    expect(copyMeta({ questions: q(10), answers: q(1) as never })).toBe('1 réponse sur 10')
  })

  it('le quiz rapide de l’accueil le dit aussi', () => {
    expect(quickQuizLabel(9, 5)).toBe(`ou un quiz rapide sur tes 9 entités étudiées (5${NBSP_}questions)`)
    expect(quickQuizLabel(3, 5)).toBe(`ou un quiz rapide sur toutes les entités (5${NBSP_}questions)`)
  })

  it('une copie sur quatre entités étudiées a ses dix questions, sur elles seules tant qu’il y en a, et ses mauvaises réponses viennent d’abord d’elles', () => {
    let fromStudied = 0
    let wrongNames = 0
    let beyond = 0
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createRng(seed)
      const studied = shuffleIds(rng).slice(0, 4).map((id) => getGhost(id)!)
      const ids = new Set(studied.map((g) => g.id))
      // comme la page : la série ne sort pas de sa liste, et se complète à la fin s'il le faut
      const qs = buildQuiz({ topics: ['behavior', 'speed', 'sanity', 'zero'], ghosts: studied, allGhosts: GHOSTS, mechanics: MECHANICS, count: 10, rng, onlyListed: true, fillUp: true })
      expect(qs.length, `graine ${seed}`).toBe(10)
      const first = qs.findIndex((q) => q.beyond)
      if (first >= 0) {
        expect(qs.slice(first).every((q) => q.beyond), `graine ${seed} : les questions qui complètent la copie viennent à la fin`).toBe(true)
        beyond += qs.length - first
      }
      for (const q of qs.filter((x) => !x.beyond)) {
        expect(q.ghostId && ids.has(q.ghostId), `${q.id} hors des entités étudiées`).toBe(true)
        for (const c of q.choices) {
          if (q.correct.includes(c.id) || !getGhost(c.id)) continue
          wrongNames++
          if (ids.has(c.id)) fromStudied++
        }
      }
    }
    expect(fromStudied / wrongNames, `${fromStudied}/${wrongNames}`).toBeGreaterThan(0.3)
    // compléter reste l'exception (le Mimic parmi les quatre : il n'est jamais une mauvaise réponse)
    expect(beyond, `${beyond} questions sur 400`).toBeLessThan(20)
  })

  /** Les noms d'entités hors de la liste qu'une question montre : énoncé, citation, précision ou réponses. */
  const straysOf = (q: Question, outside: readonly (typeof GHOSTS)[number][]) => {
    const names = new Set(outside.map((g) => g.name))
    const texts = [q.prompt, q.quote ?? '', q.note ?? '', ...q.choices.map((c) => c.label)]
    return [
      ...q.choices.filter((c) => names.has(c.label)).map((c) => c.label),
      ...texts.flatMap((t) => entityMentions(t, outside).flatMap((m) => (typeof m === 'string' ? [] : [m.text]))),
    ]
  }

  it('une copie sur les entités étudiées ne nomme aucune autre entité : ni « … plutôt que le Gallu ? », ni dans une citation, ni parmi les réponses', () => {
    const topicSets: QuizTopic[][] = [['behavior', 'speed', 'sanity', 'zero'], ['zero'], ['behavior'], ['speed'], ['sanity'], ['mechanics', 'expert', 'zero']]
    const bad: string[] = []
    let dist = 0
    for (const n of [4, 6]) {
      for (let seed = 1; seed <= 100; seed++) {
        const rng = createRng(seed * 7 + n)
        const studied = shuffleIds(rng).slice(0, n).map((id) => getGhost(id)!)
        const ids = new Set(studied.map((g) => g.id))
        const outside = GHOSTS.filter((g) => !ids.has(g.id))
        const topics = topicSets[seed % topicSets.length]
        for (const q of buildQuiz({ topics, ghosts: studied, allGhosts: GHOSTS, mechanics: MECHANICS, count: 10, rng, onlyListed: true })) {
          if (q.id.startsWith('q:dist:')) dist++
          const m = /^q:dist:([^:]+):/.exec(q.id)
          if (m && !ids.has(m[1])) bad.push(q.prompt)
          const s = straysOf(q, outside)
          if (s.length) bad.push(`${q.prompt} ${q.quote ?? ''} → ${s.join(', ')}`)
        }
      }
    }
    expect(bad.slice(0, 5), `${bad.length} questions`).toEqual([])
    // les départages entre deux entités étudiées se posent toujours
    expect(dist).toBeGreaterThan(50)
  })

  it('un seul thème (vitesses, seuils, tests) sur quatre à six entités étudiées : la copie a ses dix questions, et le dit quand elle sort de la liste', () => {
    for (const topic of ['speed', 'sanity', 'zero'] as QuizTopic[]) {
      for (const n of [4, 5, 6]) {
        for (let seed = 1; seed <= 10; seed++) {
          const rng = createRng(seed * 31 + n)
          // des entités qui chassent comme une entité standard : peu de questions de vitesse ou de seuil sur elles
          const standard = GHOSTS.filter((g) => g.speed.summary.startsWith('1,7') && g.huntSanity.normal === 50)
          const studied = (n === 4 && standard.length >= 4 ? standard : GHOSTS.filter((g) => g.id !== 'the-mimic')).slice(seed % 3, (seed % 3) + n)
          const ids = new Set(studied.map((g) => g.id))
          const outside = GHOSTS.filter((g) => !ids.has(g.id))
          const qs = buildQuiz({ topics: [topic], ghosts: studied, allGhosts: GHOSTS, mechanics: MECHANICS, count: 10, rng, onlyListed: true, fillUp: true })
          expect(qs.length, `${topic}, ${studied.map((g) => g.id).join(', ')}`).toBe(10)
          const first = qs.findIndex((q) => q.beyond)
          for (const [i, q] of qs.entries()) {
            expect(!!q.beyond, `${topic} ${q.id} : les questions qui complètent viennent à la fin`).toBe(first >= 0 && i >= first)
            if (!q.beyond) expect(straysOf(q, outside), q.prompt).toEqual([])
          }
        }
      }
    }
  })
})

/** Les entités dans un ordre tiré au hasard. */
function shuffleIds(rng: () => number): string[] {
  const ids = GHOSTS.map((g) => g.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids
}

describe('Rechargement (F5) : l’exercice en cours reprend sur la page rechargée', () => {
  it('le chemin rechargé, adresse à paramètres comprise ; rien pour une ouverture ou un lien suivi', () => {
    expect(reloadedPath('reload', '#/enquete')).toBe('/enquete')
    expect(reloadedPath('reload', '#/quiz?topic=mechanics&n=10')).toBe('/quiz')
    expect(reloadedPath('reload', '#/enquete?contrat=reprendre')).toBe('/enquete')
    expect(reloadedPath('reload', '')).toBe('/')
    expect(reloadedPath('navigate', '#/enquete')).toBeNull()
    expect(reloadedPath('back_forward', '#/quiz')).toBeNull()
    expect(reloadedPath(undefined, '#/quiz')).toBeNull()
  })
})

describe('Quiz : le nombre de questions choisi reste après un rechargement', () => {
  it('10 par défaut ; 5 une fois choisi ; une valeur inconnue ou illisible n’y change rien', () => {
    localStorage.removeItem(COUNT_KEY)
    expect(readQuizCount()).toBe(10)
    rememberQuizCount(5)
    expect(readQuizCount()).toBe(5)
    rememberQuizCount(7)
    expect(readQuizCount()).toBe(5)
    localStorage.setItem(COUNT_KEY, 'beaucoup')
    expect(readQuizCount()).toBe(10)
    localStorage.removeItem(COUNT_KEY)
  })
})

describe('Quiz : « Revoir … dans la révision » compte ce qu’il annonce', () => {
  const m = (cardId: string | undefined, requeued: boolean) => ({ q: { cardId }, requeued })

  it('le cas des juges : 4 erreurs, 3 cartes déjà apprises ; la 4e est dite', () => {
    const r = requeueSummary([m('g:spirit:tells', true), m('g:demon:san', true), m('g:jinn:spd', true), m('g:mare:tells', false)])
    expect(r.cards).toBe(3)
    expect(r.link).toBe('Revoir ces 3 cartes dans la révision')
    expect(r.note).toBe(
      `3 de tes 4 erreurs portent sur 3 cartes déjà apprises, remises dans ta révision du jour${NNBSP}; l’autre porte sur une carte que tu n’as pas encore apprise.`,
    )
  })

  it('autant de cartes que d’erreurs : « mes N erreurs », sans explication ; aucune carte : pas de lien', () => {
    expect(requeueSummary([m('a', true), m('b', true)])).toEqual({ cards: 2, link: 'Revoir mes 2 erreurs dans la révision', note: null })
    expect(requeueSummary([m('a', true)])).toEqual({ cards: 1, link: 'Revoir mon erreur dans la révision', note: null })
    expect(requeueSummary([m('a', false), m(undefined, false)])).toEqual({ cards: 0, link: null, note: null })
  })

  it('deux erreurs sur la même carte, une question sans carte, des cartes pas encore apprises : chaque écart est dit', () => {
    expect(requeueSummary([m('a', true), m('a', true)]).note).toBe(`Tes 2 erreurs portent sur la même carte déjà apprise, remise dans ta révision du jour.`)
    expect(requeueSummary([m('a', true), m('a', true)]).link).toBe('Revoir cette carte dans la révision')
    expect(requeueSummary([m('a', true), m(undefined, false)]).note).toBe(
      `Une de tes 2 erreurs porte sur une carte déjà apprise, remise dans ta révision du jour${NNBSP}; l’autre n’a pas de carte de révision.`,
    )
    expect(requeueSummary([m('a', true), m('b', false), m('c', false)]).note).toContain('les 2 autres portent sur des cartes que tu n’as pas encore apprises')
    expect(requeueSummary([m('a', true), m('b', false), m(undefined, false)]).note).toContain(
      'parmi les 2 autres, une porte sur une carte que tu n’as pas encore apprise et une n’a pas de carte de révision',
    )
  })

  it('sur des copies tirées au hasard : le lien compte les cartes remises, l’explication toutes les erreurs', () => {
    const rng = createRng(11)
    for (let k = 0; k < 300; k++) {
      const list = Array.from({ length: 1 + Math.floor(rng() * 8) }, () => {
        const r = rng()
        return r < 0.5 ? m(`c${Math.floor(rng() * 4)}`, true) : r < 0.8 ? m(`d${k}`, false) : m(undefined, false)
      })
      const s = requeueSummary(list)
      const cards = new Set(list.filter((a) => a.requeued).map((a) => a.q.cardId)).size
      expect(s.cards).toBe(cards)
      if (!cards) continue
      expect(s.link).toContain(cards > 1 ? String(cards) : cards === list.length ? 'mon erreur' : 'cette carte')
      // les comptes ne se contredisent pas : l'écart avec le nombre d'erreurs est toujours expliqué
      if (s.note) expect(s.note).toMatch(list.length > 1 ? new RegExp(`${list.length} erreurs`) : /erreur/)
      else expect(cards).toBe(list.length)
    }
  })
})

describe('Mécaniques : le quiz vrai ou faux annonce la copie qu’il distribue', () => {
  it('« 10 questions, tirées parmi 36 », pas « 36 questions » pour une copie de dix', () => {
    expect(trueFalseLabel(10, 36)).toBe('Quiz vrai ou faux · 10 questions, tirées parmi 36')
    expect(trueFalseLabel(5, 36)).toBe('Quiz vrai ou faux · 5 questions, tirées parmi 36')
    expect(trueFalseLabel(10, 8)).toBe('Quiz vrai ou faux · 8 questions')
    expect(trueFalseLabel(10, 1)).toBe('Quiz vrai ou faux · 1 question')
  })

  it('« Me tester » dit qu’il ne note rien, et où une réponse compte', () => {
    expect(TEST_NOT_RECORDED).toMatch(/^Rien n’est noté ici/)
    expect(TEST_NOT_RECORDED).toContain('Réviser')
  })
})

describe('Note : l’aide du titre, l’aperçu et l’enregistrement suivent la même règle', () => {
  const T = new Date('2026-11-01T09:00:00').getTime()
  const bodies = [
    'L’encens bloque le Démon 60 s.',
    'Encens et Démon\nIl rechasse 60 s après, pas 90.',
    'Combien de temps l’encens bloque-t-il un Démon ?\n60 secondes au lieu de 90.',
    'Plus rapide dans le froid, jusqu’à 2,7 m/s.\nPlus lent au chaud.',
    '- souffle froid visible\n- chasse dès 50 %',
    'Piège',
  ]

  it('sans titre : l’aide dit « la première ligne en sert » seulement quand la carte peut s’enregistrer, sinon elle demande un titre', () => {
    for (const body of bodies) {
      for (const ghostId of [null, 'demon']) {
        const q = noteQuestion({ title: '', body, ghostId, createdAt: T }, GHOSTS)
        const help = titleHelp(true, !!q.vague)
        if (q.vague) {
          expect(help, body).toMatch(/écris un titre/)
          expect(help, body).not.toMatch(/en sert/)
        } else {
          expect(help, body).toMatch(/première ligne de la note en sert/)
        }
      }
    }
    // sans révision, un titre n'est jamais demandé
    expect(titleHelp(false, false)).toBe('Sans titre, la première ligne de la note en sert.')
    // une réponse écrite sans texte de note : pas de « première ligne » à invoquer
    expect(titleHelp(true, true, false)).toBe('Écris un titre, il servira de question en révision.')
  })

  it('une question écrite à part : l’aide ne promet plus la première ligne comme question', () => {
    // la carte pose la question écrite (noteQuestion), l'éditeur passe asCard && !question
    const q = noteQuestion({ title: '', body: 'Démon\n60 s après l’encens', question: 'Quand le Démon peut-il rechasser ?', ghostId: 'demon', createdAt: T }, GHOSTS)
    expect(q.front).toBe('Quand le Démon peut-il rechasser ?')
    expect(titleHelp(false, false)).toBe('Sans titre, la première ligne de la note en sert.')
  })

  it('une seule ligne qui est une question : il manque la réponse, pas « ta première ligne dit déjà la réponse »', () => {
    const body = 'Combien de temps l’encens bloque-t-il un Démon ?'
    expect(noteQuestion({ title: '', body, ghostId: 'demon', createdAt: T }, GHOSTS).vague).toBe(true)
    expect(onlyAQuestion(body)).toBe(true)
    expect(onlyAQuestion(`${body}\n60 secondes`)).toBe(false)
    expect(onlyAQuestion('L’encens bloque le Démon 60 s.')).toBe(false)
    const help = titleHelp(true, true, true, onlyAQuestion(body))
    expect(help).toMatch(/^Ajoute la réponse sur une ligne en dessous, ou écris un titre/)
    expect(help).not.toMatch(/dit déjà la réponse/)
  })
})

describe('« Précédent » ramène la page là où on l’avait quittée', () => {
  it('une position par entrée d’historique, la dernière notée compte', () => {
    let list = rememberScroll([], 'a', 2715)
    list = rememberScroll(list, 'b', 0)
    list = rememberScroll(list, 'a', 3491.6)
    expect(scrollFor(list, 'a')).toBe(3492)
    expect(scrollFor(list, 'b')).toBe(0)
    expect(scrollFor(list, 'c')).toBeNull()
    // une seule ligne par entrée, la plus récente à la fin
    expect(list.map(([k]) => k)).toEqual(['b', 'a'])
  })

  it('l’onglet ne garde que les dernières entrées', () => {
    let list: [string, number][] = []
    for (let i = 0; i < SCROLL_MAX + 10; i++) list = rememberScroll(list, `k${i}`, i)
    expect(list).toHaveLength(SCROLL_MAX)
    expect(scrollFor(list, 'k0')).toBeNull()
    expect(scrollFor(list, `k${SCROLL_MAX + 9}`)).toBe(SCROLL_MAX + 9)
  })

  it('une mémoire illisible ou abîmée ne ramène rien de faux', () => {
    expect(parseScrolls(null)).toEqual([])
    expect(parseScrolls('pas du json')).toEqual([])
    expect(parseScrolls('{"a":1}')).toEqual([])
    expect(parseScrolls('[["a",120],["b",-4],["c","x"],[3,4],["d",null],["e",80]]')).toEqual([
      ['a', 120],
      ['e', 80],
    ])
  })

  it('la première entrée de l’onglet a sa place ; une adresse tapée à la main n’en a pas', () => {
    expect(memoryKey('k7x2', { usr: null, key: 'k7x2', idx: 3 })).toBe('k7x2')
    // « default » : le nom que le routeur donne aux entrées qu'il n'a pas créées
    expect(memoryKey('default', { idx: 0 })).toBe('default@0')
    expect(memoryKey('default', null)).toBeNull()
    expect(memoryKey('default', {})).toBeNull()
  })

  it('une adresse tapée puis rechargée (numérotée 0 elle aussi) ne prend pas la place de la première page de l’onglet', () => {
    const first = memoryKey('default', { idx: 0 }, '/codex/hantu')
    const typed = memoryKey('default', { idx: 0 }, '/codex/spirit')
    expect(first).not.toBeNull()
    expect(typed).not.toBe(first)
    // la même page, rechargée : sa place revient
    expect(memoryKey('default', { idx: 0 }, '/codex/hantu')).toBe(first)
    // une entrée créée par le routeur a déjà sa clé à elle
    expect(memoryKey('k7x2', { idx: 3 }, '/codex/hantu')).toBe('k7x2')
  })

  it('seulement en revenant (« Précédent », « Suivant », rechargement), jamais sur un lien suivi', () => {
    expect(restoresScroll('POP', false, 'navigate')).toBe(true)
    expect(restoresScroll('PUSH', false, 'navigate')).toBe(false)
    expect(restoresScroll('REPLACE', false, 'navigate')).toBe(false)
    // premier affichage de l'onglet : un rechargement ou un retour d'historique, pas une ouverture à neuf
    expect(restoresScroll('POP', true, 'reload')).toBe(true)
    expect(restoresScroll('POP', true, 'back_forward')).toBe(true)
    expect(restoresScroll('POP', true, 'navigate')).toBe(false)
    expect(restoresScroll('POP', true, undefined)).toBe(false)
  })
})

describe('Codex : chercher un comportement trouve aussi les tests et les observations des fiches', () => {
  it('« montre » trouve l’Obambo (la montre du jeu, dans ses tests), avec la phrase où se trouve le mot', () => {
    const { matching } = searchCodex(GHOSTS, 'montre', EMPTY_FILTER)
    const ids = matching.map((g) => g.id)
    expect(ids).toEqual(expect.arrayContaining(['obambo', 'shade', 'oni']))
    const s = searchSnippet(getGhost('obambo')!, 'montre')!
    expect(s.hit).toBe('montre')
    expect(`${s.before}${s.hit}${s.after}`).toMatch(/montre du jeu/)
    // chaque entité trouvée par le texte de sa fiche a son extrait
    for (const g of matching) expect(searchSnippet(g, 'montre'), g.id).not.toBeNull()
  })

  it('les tests et les observations font partie du texte cherché, pas « Ne pas confondre » (d’autres entités)', () => {
    const obambo = getGhost('obambo')!
    const texts = searchTexts(obambo)
    for (const t of obambo.confirmationTests) expect(texts).toContain(t.text)
    for (const o of obambo.observations) expect(texts).toContain(o.text)
    for (const c of obambo.confusions) expect(texts).not.toContain(c.why)
  })

  it('l’extrait garde le mot tel qu’il s’écrit (accents, majuscule) et coupe sur des mots entiers', () => {
    const s = searchSnippet(getGhost('hantu')!, 'BUEE')!
    expect(s.hit).toBe('buée')
    expect(s.before === '' || /^…?\S/.test(s.before)).toBe(true)
    expect(s.before.length + s.hit.length + s.after.length).toBeLessThan(140)
  })

  it('le mot entier d’abord : « sel » plutôt que « selon »', () => {
    const s = searchSnippet(getGhost('wraith')!, 'sel')!
    expect(s.hit).toBe('sel')
    expect(s.after).not.toMatch(/^on/)
  })

  it('trouvée par son nom : pas d’extrait', () => {
    expect(searchSnippet(getGhost('obambo')!, 'obam')).toBeNull()
    expect(searchSnippet(getGhost('the-twins')!, 'twins')).toBeNull()
    expect(searchSnippet(getGhost('demon')!, '   ')).toBeNull()
  })

  it('« coeur », « voeu », « oeil » tapés au clavier trouvent « cœur », « vœu », « œil »', () => {
    const ids = (q: string) => searchCodex(GHOSTS, q, EMPTY_FILTER).matching.map((g) => g.id)
    expect(ids('coeur')).toEqual(ids('cœur'))
    expect(ids('coeur')).toEqual(expect.arrayContaining(['phantom', 'raiju']))
    expect(ids('voeu')).toEqual(expect.arrayContaining(['banshee', 'goryo']))
    expect(ids('oeil')).toEqual(expect.arrayContaining(['goryo', 'gallu']))
    // l'extrait garde le mot tel qu'il s'écrit
    expect(searchSnippet(getGhost('raiju')!, 'coeur')?.hit).toBe('cœur')
  })

  it('un mot court se cherche entier : « sel » ne trouve pas une fiche pour son « selon » ; à défaut, le début d’un mot', () => {
    const ids = searchCodex(GHOSTS, 'sel', EMPTY_FILTER).matching.map((g) => g.id)
    expect(ids).toEqual(expect.arrayContaining(['spirit', 'wraith', 'gallu', 'the-twins']))
    for (const id of ['banshee', 'hantu', 'the-mimic', 'moroi']) expect(ids, id).not.toContain(id)
    for (const id of ids) expect(searchSnippet(getGhost(id)!, 'sel')?.hit.toLowerCase(), id).toBe('sel')
    // aucun mot entier « cach » : la cachette, caché, se cacher
    expect(searchCodex(GHOSTS, 'cach', EMPTY_FILTER).matching.map((g) => g.id)).toEqual(expect.arrayContaining(['revenant', 'deogen', 'aswang']))
  })

  it('« montre » ne trouve pas une fiche pour une phrase sur la montre de l’Obambo', () => {
    const ids = searchCodex(GHOSTS, 'montre', EMPTY_FILTER).matching.map((g) => g.id)
    expect(ids).toContain('obambo')
    for (const id of ['the-twins', 'moroi', 'hantu']) expect(ids, id).not.toContain(id)
  })

  it('dans le texte, le mot tapé commence un mot : « chant » ne trouve pas « en approchant »', () => {
    const ids = searchCodex(GHOSTS, 'chant', EMPTY_FILTER).matching.map((g) => g.id)
    expect(ids).toContain('banshee')
    expect(ids).not.toContain('deogen')
  })
})

describe('Coaching : seul·e, la page ne prend pas la personne pour un élève', () => {
  it('l’entrée décrit le carnet à deux des deux côtés', () => {
    expect(COACHING_SOLO_LEAD).toMatch(/coach/)
    expect(COACHING_SOLO_LEAD).toMatch(/élève/)
    expect(COACHING_SOLO_LEAD).not.toMatch(/\bte les envoie\b|\bta révision\b|tu lui envoies/)
  })
  it('le pas à pas aussi : ni « Tu l’ouvres » ni « Tu renvoies ta progression »', () => {
    const solo = coachingSteps('solo', '')
    expect(solo).toHaveLength(4)
    for (const st of solo) expect(`${st.h} ${st.p}`).not.toMatch(/\b(?:Tu|tu|ta|ton|tes|t’)\b/)
    // côté élève, rien ne change
    expect(coachingSteps('student', 'Ryz').map((st) => st.h)).toEqual(['Ryz écrit', 'Ryz t’envoie un lien', 'Tu l’ouvres', 'Tu renvoies ta progression'])
  })
})
