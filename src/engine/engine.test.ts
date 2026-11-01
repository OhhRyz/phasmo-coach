import { beforeAll, describe, expect, it } from 'vitest'
import { GHOSTS, MECHANICS, getGhost } from '../data'
import type { Ghost } from '../data/types'
import {
  buildDeck,
  evidenceIn,
  ghostCards,
  isFeminine,
  le,
  mechanicsCards,
  mentionsEvidence,
  namesGhost,
  needsEvidence,
  noteCards,
  numbersFit,
  reverseTells,
  speedValues,
  thresholds,
  zeroTests,
  type CoachNote,
} from './cards'
import { EMPTY_FILTER, filterGhosts, matchesEvidence, type FilterState } from './filter'
import { redactGhostName, speedClasses } from './format'
import {
  buildQuiz,
  confusionWithoutEvidence,
  DEFAULT_TOPICS,
  homogeneous,
  isCorrect,
  keepsSense,
  partnerClaim,
  questionForCard,
  QUIZ_TOPICS,
  type Question,
  type QuizTopic,
  warmQuiz,
} from './quiz'
import { askKey, buildReviewQueue, ghostMastery, learnedCount, pickNewCards, SAME_GHOST_GAP, sessionGhosts, unseenCards } from './progress'
import { createRng } from './random'
import { clock, DIFFICULTIES, generateScenario, pickVisibleEvidence, scoreScenario } from './scenario'
import {
  decodePayload,
  encodePayload,
  importSummary,
  notesToShare,
  parseShareInput,
  readNotesPayload,
  readReportPayload,
  reportNotes,
  shareSummary,
  shareSummaryLine,
} from './share'
import { adoptCoach, coachNameOf, isCoachNote, onboardProfile } from './notes'
import { hydrate, initialState, sanitizeNotes } from '../store/schema'
import { cardMastery, isDue, schedule } from './srs'
import { speedToBpm, bpmToSpeed } from './audio'

const DAY = 86_400_000
const T0 = new Date('2026-10-31T10:00:00').getTime()
/** « 65 % » → 65, « 1,96 m/s » → 1.96 */
const valueOf = (label: string) => Number(label.replace(/[^\d,]/gu, '').replace(',', '.'))

describe('répétition espacée', () => {
  it('fait passer une nouvelle carte par les étapes puis la gradue à 1 jour', () => {
    let s = schedule(undefined, 3, T0)
    expect(s.phase).toBe('learning')
    expect(s.due - T0).toBe(10 * 60_000)
    s = schedule(s, 3, T0 + 10 * 60_000)
    expect(s.phase).toBe('review')
    expect(s.interval).toBe(1)
  })

  it('« Facile » sur une nouvelle carte la programme à 4 jours', () => {
    const s = schedule(undefined, 4, T0)
    expect(s.phase).toBe('review')
    expect(s.interval).toBe(4)
  })

  it('les intervalles croissent avec « Bien » et une erreur fait rechuter', () => {
    let s = schedule(undefined, 4, T0)
    let t = T0
    const intervals: number[] = []
    for (let i = 0; i < 4; i++) {
      t = s.due
      s = schedule(s, 3, t)
      intervals.push(s.interval)
    }
    expect(intervals).toEqual([...intervals].sort((a, b) => a - b))
    expect(intervals[3]).toBeGreaterThan(30)
    const lapse = schedule(s, 1, s.due)
    expect(lapse.phase).toBe('relearning')
    expect(lapse.lapses).toBe(1)
    expect(lapse.ease).toBeLessThan(s.ease)
    expect(cardMastery(lapse)).toBeLessThan(cardMastery(s))
  })

  it('les quatre boutons donnent des intervalles strictement croissants', () => {
    let s = schedule(undefined, 3, T0)
    s = schedule(s, 3, T0 + 600_000) // graduée à 1 jour
    for (const state of [s, { ...s, ease: 1.3 }, { ...s, interval: 7 }]) {
      const ivl = ([2, 3, 4] as const).map((g) => schedule(state, g, state.due).interval)
      expect(ivl[0]).toBeLessThan(ivl[1])
      expect(ivl[1]).toBeLessThan(ivl[2])
    }
  })

  it('une carte en révision est due dès le jour prévu', () => {
    const s = schedule(undefined, 4, T0) // dû dans 4 jours
    expect(isDue(s, T0 + 3 * DAY)).toBe(false)
    expect(isDue(s, T0 + 4 * DAY - 3_600_000)).toBe(true)
  })
})

describe('filtre d’élimination', () => {
  const state = (patch: Partial<FilterState>): FilterState => ({ ...EMPTY_FILTER, ...patch })

  it('3 preuves trouvées en Professionnel identifient une seule entité (hors Mimic)', () => {
    for (const g of GHOSTS) {
      const res = filterGhosts(GHOSTS, state({ evidence: Object.fromEntries(g.evidence.map((e) => [e, 'found'])) }))
      expect(res.map((r) => r.id)).toContain(g.id)
      expect(res.filter((r) => r.id !== 'the-mimic').length, `combinaison de ${g.id}`).toBeLessThanOrEqual(1)
    }
  })

  it('une preuve exclue élimine l’entité en Professionnel mais pas en Cauchemar', () => {
    const g = GHOSTS.find((x) => !x.forcedEvidence && !x.fakeEvidence)!
    const excl = { [g.evidence[0]]: 'excluded' as const }
    expect(matchesEvidence(g, state({ evidence: excl }))).toBe(false)
    expect(matchesEvidence(g, state({ evidenceCount: 2, evidence: excl }))).toBe(true)
  })

  it('la preuve forcée doit faire partie des preuves visibles', () => {
    const g = GHOSTS.find((x) => x.forcedEvidence)
    if (!g) return
    const others = g.evidence.filter((e) => e !== g.forcedEvidence)
    expect(matchesEvidence(g, state({ evidenceCount: 2, evidence: { [others[0]]: 'found', [others[1]]: 'found' } }))).toBe(false)
    expect(matchesEvidence(g, state({ evidenceCount: 2, evidence: { [g.forcedEvidence!]: 'excluded' } }))).toBe(false)
  })

  it('les orbes du Mimic ne comptent pas dans les preuves', () => {
    const mimic = getGhost('the-mimic')
    if (!mimic?.fakeEvidence) return
    const ev = { [mimic.fakeEvidence]: 'found' as const, ...Object.fromEntries(mimic.evidence.map((e) => [e, 'found'])) }
    expect(matchesEvidence(mimic, state({ evidence: ev }))).toBe(true)
    expect(matchesEvidence(mimic, state({ evidence: { [mimic.fakeEvidence]: 'excluded' } }))).toBe(false)
  })
})

describe('quiz', () => {
  it('génère des questions valides pour chaque thème', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const t of QUIZ_TOPICS) {
        const qs = buildQuiz({ topics: [t.id], ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 8, rng: createRng(seed) })
        for (const q of qs) {
          const ids = q.choices.map((c) => c.id)
          expect(new Set(ids).size, q.id).toBe(ids.length)
          expect(q.correct.length, q.id).toBeGreaterThan(0)
          expect(q.correct.every((c) => ids.includes(c)), q.id).toBe(true)
          if (!q.multi) expect(q.correct.length, q.id).toBe(1)
          expect(q.choices.length, q.id).toBeGreaterThanOrEqual(2)
          expect(isCorrect(q, q.correct)).toBe(true)
          const labels = q.choices.map((c) => c.label)
          expect(new Set(labels).size, `${q.id} libellés en double`).toBe(labels.length)
        }
      }
    }
  })

  it('ne dévoile jamais le nom de l’entité dans une citation', () => {
    const qs = buildQuiz({ topics: ['behavior', 'zero'], ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 60, rng: createRng(7) })
    for (const q of qs) {
      const g = getGhost(q.ghostId!)!
      if (!q.quote) continue
      // le nom propre (avec sa majuscule) ne doit jamais apparaître ; un nom commun comme « ombre » est permis
      for (const n of [g.name, g.nameEn, g.name.replace(/^(Le|Les|La) /, ''), g.nameEn.replace(/^The /, '')]) {
        if (n.length > 3) expect(new RegExp(`(?<![\\p{L}])${n}(?![\\p{L}])`, 'u').test(q.quote), `${q.id}: ${q.quote}`).toBe(false)
      }
    }
  })

  /**
   * Toutes les questions d'un thème qui portent sur une entité, sur plusieurs tirages : celles de sa série
   * (« Me tester sur X ») et celles des séries des autres entités où elle est la bonne réponse.
   */
  const soloByTopic = new Map<QuizTopic, Question[]>()
  const allFor = (g: Ghost, topic: QuizTopic, prefix: string): Question[] => {
    if (!soloByTopic.has(topic)) {
      const qs: Question[] = []
      for (const x of GHOSTS) {
        for (let seed = 1; seed <= 6; seed++) qs.push(...buildQuiz({ topics: [topic], ghosts: [x], allGhosts: GHOSTS, mechanics: MECHANICS, count: 10, rng: createRng(seed * 101) }))
      }
      soloByTopic.set(topic, qs)
    }
    const out = new Map<string, Question>()
    for (const q of soloByTopic.get(topic)!) if (q.ghostId === g.id && q.id.startsWith(prefix)) out.set(q.id + q.choices.map((c) => c.id).join(), q)
    return [...out.values()]
  }
  const nameRe = (g: Ghost) =>
    [g.name, g.nameEn, g.name.replace(/^(Le|Les|La) /, ''), g.nameEn.replace(/^The /, '')]
      .filter((n) => n.length > 3)
      .map((n) => new RegExp(`(?<![\\p{L}])${n}(?![\\p{L}])`, 'u'))
  const leaks = (text: string | undefined, g: Ghost) => !!text && nameRe(g).some((re) => re.test(text))

  it('ne pose plus aucune question sur les preuves', () => {
    expect(QUIZ_TOPICS.map((t) => t.id)).not.toContain('evidence')
    // un ancien lien ?topic=evidence ne casse rien
    expect(buildQuiz({ topics: ['evidence' as QuizTopic], ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 5, rng: createRng(1) })).toEqual([])
    for (let seed = 1; seed <= 15; seed++) {
      const qs = buildQuiz({ topics: QUIZ_TOPICS.map((t) => t.id), ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 30, rng: createRng(seed) })
      for (const q of qs) {
        expect(mentionsEvidence(q.prompt), `${q.id}: ${q.prompt}`).toBe(false)
        expect(q.id, q.id).not.toMatch(/^q:(ev|fromev|forced|remain):/)
        if (q.topic === 'expert') {
          const right = q.choices.find((c) => q.correct.includes(c.id))!.label
          expect(mentionsEvidence(right), `${q.id}: ${right}`).toBe(false)
        }
      }
    }
  })

  it('reconnaît ce qui parle de preuves', () => {
    expect(mentionsEvidence('Quelles sont les trois preuves du Démon ?')).toBe(true)
    expect(mentionsEvidence('Tu as EMF 5 + Spirit Box, et l’entité traverse le sel.')).toBe(true)
    expect(mentionsEvidence('Comment se manifeste le D.O.T.S d’un Goryo ?')).toBe(true)
    // une réponse de la Spirit Box (voix, respiration du Deogen) est la preuve elle-même
    expect(mentionsEvidence('Dans quelles conditions entends-tu la respiration du Deogen à la Spirit Box ?')).toBe(true)
    expect(mentionsEvidence('Où se déclenchent les capteurs de mouvement et les réponses à la Spirit Box ?')).toBe(true)
    expect(mentionsEvidence('Mêmes températures glaciales.')).toBe(true)
    // ce qui se joue sans preuve reste
    expect(mentionsEvidence('Partie à 0 preuve : tu vois des orbes dans la pièce favorite.')).toBe(false)
    expect(mentionsEvidence('Un EMF 2 apparaît près de toi sans interaction.')).toBe(false)
    expect(mentionsEvidence('Le Moroi maudit qui l’entend au micro parabolique.')).toBe(false)
    // « sous 0 °C » est une vitesse du Hantu (thermomètre), pas la preuve « températures glaciales »
    expect(evidenceIn('Quelle vitesse atteint un Hantu dans une pièce sous 0 °C ?')).toEqual([])
    expect(mentionsEvidence('Quelle vitesse atteint un Hantu dans une pièce sous 0 °C ?')).toBe(false)
    expect(mentionsEvidence('Il souffle une buée glacée en chasse, disjoncteur coupé.')).toBe(false)
  })

  it('retire des confusions ce qui parle de preuves', () => {
    const a = confusionWithoutEvidence('UV + D.O.T.S en commun. Le Fantôme disparaît en photo ; il ne cible personne. 3e preuve : Spirit Box vs orbes.')
    expect(a).toMatch(/^Le Fantôme disparaît en photo\s; il ne cible personne\.$/u)
    const b = confusionWithoutEvidence('Même D.O.T.S + glaciales, mais le Yurei a les orbes au lieu de l’écriture ; il peut claquer une porte.')
    expect(b).toBe('Il peut claquer une porte.')
    expect(confusionWithoutEvidence('Mêmes UV et écriture.')).toBe('')
  })

  it('« Sans preuve, à quoi reconnais-tu Y plutôt que X ? » : chaque réponse nomme Y, une seule dit vrai', () => {
    const covered = new Set<string>()
    let aboutRival = 0
    for (const g of GHOSTS) {
      for (const q of allFor(g, 'zero', 'q:dist:')) {
        covered.add(g.id)
        const x = getGhost(q.id.split(':')[2])!
        // la bonne réponse décrit g : c'est g qu'on reconnaît, plutôt que x
        expect(q.prompt, q.id).toBe(`Sans preuve, à quoi reconnais-tu ${le(g.name)} plutôt que ${le(x.name)}\u202f?`)
        // plus de « l’autre » à expliquer : chaque réponse nomme g
        expect(q.note, q.id).toBeUndefined()
        expect(q.correct, q.id).toEqual([g.id])
        expect(q.choices.length, q.id).toBe(4)
        expect(new Set(q.choices.map((c) => c.label)).size, q.id).toBe(4)
        for (const c of q.choices) {
          // l'entité dont parle chaque réponse laisse sa place à g (« Le Poltergeist lance énormément d'objets » face à
          // « le Poltergeist plutôt que l'Esprit ») : ni son nom, ni celui de x, ni un « l’autre » qui désignerait x
          const about = getGhost(c.id)!
          expect(namesGhost(c.label, g), `${q.id}: ${c.label}`).toBe(true)
          if (about.id !== g.id) expect(leaks(c.label, about), `${q.id}: ${c.label}`).toBe(false)
          expect(leaks(c.label, x), `${q.id}: ${c.label}`).toBe(false)
          expect(c.label, `${q.id}: ${c.label}`).not.toMatch(/^L[’']autre(?!\p{L})|(?<!\p{L})de l[’']autre(?!\p{L})/u)
          expect(mentionsEvidence(c.label), `${q.id}: ${c.label}`).toBe(false)
          // « elle aussi », « Il alterne… » : rien ne dit de quelle fiche vient la phrase
          expect(c.label, `${q.id}: ${c.label}`).not.toMatch(/(?<!\p{L})(?:aussi|également|non plus)(?!\p{L})|^(?:Il|Elle|Lui)\s(?!faut|y a|suffit)/u)
          // l'accord suit g : « La Banshee est très lent » ne se dit pas
          if (isFeminine(g.name)) expect(c.label, `${q.id}: ${c.label}`).not.toMatch(/(?<!\p{L})(?:est|reste)\s+(?:très\s+|plus\s+)?(?:le\s+)?(?:lent|seul|bloqué|encensé)(?!\p{L})/u)
          if (c.id !== g.id) {
            // une mauvaise réponse parle d'une autre entité, x compris (la confusion qu'on veut éviter), jamais du Mimic
            expect([g.id, 'the-mimic'], q.id).not.toContain(c.id)
            if (c.id === x.id) aboutRival++
          }
        }
      }
    }
    expect(covered.size).toBeGreaterThanOrEqual(20)
    // ce qu'on dit de x lui-même sert souvent de mauvaise réponse
    expect(aboutRival).toBeGreaterThan(50)
  })

  it('« Quelle entité peut … ? » : une seule bonne réponse, sans nom qui la souffle', () => {
    const covered = new Set<string>()
    for (const g of GHOSTS) {
      for (const q of allFor(g, 'behavior', 'q:abil:')) {
        covered.add(g.id)
        expect(q.correct, q.id).toEqual([g.id])
        expect(new Set(q.choices.map((c) => c.id)).size, q.id).toBe(4)
        expect(q.choices.map((c) => c.id), q.id).not.toContain('the-mimic')
        expect(leaks(q.prompt, g), `${q.id}: ${q.prompt}`).toBe(false)
        expect(leaks(q.quote, g), `${q.id}: ${q.quote}`).toBe(false)
        expect(`${q.prompt} ${q.quote ?? ''}`, q.id).not.toMatch(/\b[dDqQnNsS]['’]cette\b/u)
        expect(mentionsEvidence(`${q.prompt} ${q.quote ?? ''}`), q.id).toBe(false)
      }
    }
    expect(covered.size).toBeGreaterThanOrEqual(15)
  })

  it('profils de vitesse et de seuil : aucune mauvaise réponse ne partage une valeur citée', () => {
    const speeds = (g: Ghost) => [g.speed.min, g.speed.max, g.speed.alt].filter((v) => v != null && v >= 0 && v !== 1.7)
    const thresholds = (g: Ghost) => [g.huntSanity.low, g.huntSanity.normal, g.huntSanity.high].filter((v) => v >= 0)
    const covered = { speed: new Set<string>(), sanity: new Set<string>() }
    for (const g of GHOSTS) {
      for (const [topic, prefix, values] of [
        ['speed', 'q:spdp:', speeds],
        ['sanity', 'q:sanp:', thresholds],
      ] as const) {
        for (const q of allFor(g, topic, prefix)) {
          covered[topic].add(g.id)
          expect(q.correct, q.id).toEqual([g.id])
          expect(leaks(q.quote, g), `${q.id}: ${q.quote}`).toBe(false)
          for (const c of q.choices) {
            if (c.id === g.id) continue
            expect(c.id, q.id).not.toBe('the-mimic')
            const o = getGhost(c.id)!
            expect(values(o).some((v) => values(g).includes(v)), `${q.id} : ${o.id}`).toBe(false)
          }
        }
      }
    }
    // toutes les entités à la vitesse ou au seuil particuliers ont leur question
    const special = (pred: (g: Ghost) => boolean) => GHOSTS.filter((g) => g.id !== 'the-mimic' && pred(g)).length
    expect(covered.speed.size).toBe(special((g) => g.speed.min >= 0 && !(g.speed.min === 1.7 && g.speed.max == null && g.speed.alt == null && g.speed.los && !g.speed.losVaries)))
    expect(covered.sanity.size).toBe(special((g) => !(g.huntSanity.low === 50 && g.huntSanity.normal === 50 && g.huntSanity.high === 50)))
  })

  it('les faits de mécaniques « bon à savoir » (preuves) restent hors révision et hors quiz', () => {
    const m = {
      topics: [
        {
          id: 't',
          title: 'T',
          icon: 'evidence' as const,
          facts: [
            { id: 'a', text: 'x', q: 'q', a: 'a' },
            { id: 'b', text: 'y', q: 'q2', a: 'a2', evidence: true },
          ],
        },
      ],
      trueFalse: [
        { id: 'tf1', claim: 'c', answer: true, explain: 'e' },
        { id: 'tf2', claim: 'c2', answer: false, explain: 'e2', evidence: true },
      ],
    }
    expect(mechanicsCards(m).map((c) => c.id)).toEqual(['m:a'])
    expect(buildQuiz({ topics: ['mechanics'], ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: m, count: 5, rng: createRng(3) }).map((q) => q.id)).toEqual(['q:tf:tf1'])
  })

  it('d’anciennes cartes « preuves » restées en mémoire ne comptent nulle part', () => {
    const deck = buildDeck(GHOSTS, MECHANICS, [])
    const base = initialState(T0)
    const old = schedule(schedule(undefined, 4, T0 - 30 * DAY), 4, T0 - 20 * DAY)
    const state = { ...base, cards: { 'g:spirit:ev': old, 'g:goryo:forced': old } }
    expect(buildReviewQueue(state, deck, T0).some((c) => c.id === 'g:spirit:ev' || c.id === 'g:goryo:forced')).toBe(false)
    expect(learnedCount(deck, state.cards)).toBe(0)
    expect(ghostMastery('spirit', deck, state)).toBe(0)
  })
})

describe('révision et quiz : seulement ce qui sert sans preuve', () => {
  /** Une entité de test, bâtie sur une vraie fiche. */
  const fake = (patch: Partial<Ghost>): Ghost => ({ ...GHOSTS[0], ...patch })
  const ghost = (id: string) => getGhost(id)!
  /** Toutes les questions de tous les thèmes, sur plusieurs tirages (calculées une fois). */
  let everything: Question[] = []
  beforeAll(() => {
    const out = new Map<string, Question>()
    for (let seed = 1; seed <= 8; seed++) {
      for (const t of QUIZ_TOPICS) {
        for (const q of buildQuiz({ topics: [t.id], ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 40, rng: createRng(seed * 37) })) {
          out.set(q.id + q.choices.map((c) => c.id).join(), q)
        }
      }
    }
    everything = [...out.values()]
  }, 60_000)
  const wrongChoices = (q: Question) => q.choices.filter((c) => !q.correct.includes(c.id))

  it('un test qui passe par une preuve n’est ni une carte ni une question', () => {
    const g = fake({
      id: 'x-test',
      confirmationTests: [
        { text: 'Lance un chronomètre après l’encens : si elle chasse avant 60 s, c’est elle.', definitive: true },
        { text: 'Passe la lampe UV sur les interrupteurs : une double empreinte la désigne.', definitive: true },
        { text: 'Pose des questions à la Spirit Box : si tu entends une respiration lourde, c’est elle.', definitive: true },
        { text: 'Pose un tas de sel et écoute ses pas.', definitive: true, requires: 'uv' },
        { text: 'Filme-la quand elle est visible dans le D.O.T.S.', definitive: true },
        { text: 'Si le thermomètre affiche des températures glaciales, c’est elle.', definitive: true },
        { text: 'Peut-être elle.', definitive: false },
        { text: 'En partie à 0 preuve, cherche des orbes dans la pièce favorite.', definitive: true },
      ],
    })
    // k : rang parmi les tests définitifs (identifiant de carte stable)
    expect(zeroTests(g).map((t) => t.k)).toEqual([0, 6])
    expect(ghostCards(g, 0).filter((c) => c.kind === 'test').map((c) => c.id)).toEqual(['g:x-test:test:0', 'g:x-test:test:6'])
    for (const gh of GHOSTS) {
      for (const t of zeroTests(gh)) {
        expect(needsEvidence(t.text), `${gh.id} : ${t.text}`).toBe(false)
        expect(gh.confirmationTests.find((c) => c.text === t.text)?.requires, t.text).toBeUndefined()
      }
    }
  })

  it('les signes clés ne gardent rien qui passe par une preuve, avec « leurs » pour un nom au pluriel', () => {
    const g = fake({
      keyTells: [
        'Ne change jamais de pièce favorite',
        'Silhouette D.O.T.S visible uniquement à la caméra vidéo',
        'Respiration lourde à la Spirit Box à moins d’1 m',
        'Empreintes spéciales : main à 6 doigts',
        'Toujours des orbes dans sa pièce, même en partie à 0 preuve',
      ],
    })
    expect(ghostCards(g, 0).find((c) => c.kind === 'tells')?.backList).toEqual([
      'Ne change jamais de pièce favorite',
      'Toujours des orbes dans sa pièce, même en partie à 0 preuve',
    ])
    const deck = buildDeck(GHOSTS, MECHANICS, [])
    for (const c of deck.filter((c) => c.kind === 'tells' || c.kind === 'reverse' || c.kind === 'test')) {
      for (const t of [c.quote ?? '', ...(c.kind === 'tells' ? (c.backList ?? []) : [c.back])]) expect(needsEvidence(t), `${c.id} : ${t}`).toBe(false)
    }
    expect(deck.find((c) => c.id === 'g:the-twins:tells')?.front).toMatch(/Cite leurs signes clés\.$/u)
    expect(deck.find((c) => c.id === 'g:demon:tells')?.front).toMatch(/Cite ses signes clés\.$/u)
  })

  it('une carte « quelle entité correspond à ce signe ? » ne vaut que pour une entité', () => {
    const z = (text: string) => ({ text, zeroEvidence: true })
    const empty = { keyTells: [], abilities: [], behaviors: [], observations: [], confirmationTests: [] }
    const b = fake({
      ...empty,
      id: 'b',
      name: 'Bbb',
      nameEn: 'Bbb',
      tells: [z('Est plus visible pendant les chasses : son clignotement dure plus longtemps.')],
      behaviors: [z('Ne fait jamais l’événement de poursuite ni l’événement « brouillard fantomatique » (bulle d’air).')],
    })
    const a = fake({
      ...empty,
      id: 'a',
      name: 'Aaa',
      nameEn: 'Aaa',
      tells: [
        z('Plus visible pendant les chasses.'), // l'autre aussi
        z('Ne fait pas l’événement « brouillard fantomatique » (bulle d’air).'), // l'autre aussi
        z('N’apparaît sur aucune vidéo de type « Aaa ».'), // le nom reste entre « »
        z('Comme la Bbb, ne fait jamais d’événement de chant.'), // nomme une autre entité
        z('Disparaît quand tu la prends en photo (y compris en état D.O.T.S).'), // l'aparté s'en va
        z('Moins visible pendant les chasses.'), // « moins » n'est pas « plus »
      ],
    })
    const all = [a, b]
    expect(reverseTells(a, all)).toEqual([
      { text: 'Disparaît quand tu la prends en photo.', k: 4 },
      { text: 'Moins visible pendant les chasses.', k: 5 },
    ])
    expect(ghostCards(a, 0, all).filter((c) => c.kind === 'reverse').map((c) => c.id)).toEqual(['g:a:rev:4', 'g:a:rev:5'])
    // chaque question renvoie vers une carte qui existe
    const ids = new Set(buildDeck(GHOSTS, MECHANICS, []).map((c) => c.id))
    for (const q of everything) if (q.cardId) expect(ids.has(q.cardId), `${q.id} → ${q.cardId}`).toBe(true)
  })

  it('le caviardage ne touche jamais à ce qui est entre « », et le quiz ne cite pas un tel nom', () => {
    const phantom = ghost('phantom')
    expect(redactGhostName('Une vidéo de type « Fantôme » : le Fantôme disparaît.', phantom)).toBe('Une vidéo de type « Fantôme » : cette entité disparaît.')
    expect(redactGhostName('Il sort de la vidéo « Fantôme translucide ».', phantom)).toBe('Il sort de la vidéo « Fantôme translucide ».')
    expect(namesGhost('Une vidéo de type « Fantôme ».', phantom)).toBe(true)
    expect(namesGhost('Une vidéo de type « Cri paranormal ».', phantom)).toBe(false)
    const leaks = (text: string, g: Ghost) =>
      [g.name, g.nameEn, g.name.replace(/^(Le|Les|La) /, ''), g.nameEn.replace(/^The /, '')]
        .filter((n) => n.length > 3)
        .some((n) => new RegExp(`(?<![\\p{L}])${n}(?![\\p{L}])`, 'u').test(text))
    let quoted = 0
    for (const q of everything) {
      // « Quelle entité … ? » : ni l'énoncé ni la citation ne nomment l'entité (« Quel est le seuil du Raiju ? » la nomme exprès)
      if (!q.ghostId || !/^q:(?:tell|obs|abil|zero|sanp|spdp):/u.test(q.id)) continue
      quoted++
      expect(leaks(`${q.prompt} ${q.quote ?? ''}`, ghost(q.ghostId)), `${q.id} : ${q.prompt} ${q.quote ?? ''}`).toBe(false)
    }
    expect(quoted).toBeGreaterThan(100)
  })

  it('aucune mauvaise réponse n’est vraie aussi de l’entité demandée', () => {
    let dist = 0
    for (const q of everything) {
      const g = ghost(q.ghostId ?? 'spirit')
      for (const c of wrongChoices(q)) {
        const o = getGhost(c.id)
        // « Il chasse à 1,7 m/s et à 50 % » face au Myling
        if (q.id.startsWith('q:dist:')) expect(numbersFit(c.label, g), `${q.id} : ${c.label}`).toBe(false)
        // « 65 % » face au Raiju (50 %, 65 % près de l'électronique), « 2,5 m/s » face à sa vitesse près de l'électronique
        if (q.id.startsWith('q:san:')) expect(thresholds(g).has(valueOf(c.label)), `${q.id} : ${c.label}`).toBe(false)
        if (q.id.startsWith('q:spd:')) expect(speedValues(g).has(valueOf(c.label)), `${q.id} : ${c.label}`).toBe(false)
        // un résumé à moitié vrai (« 1,7 m/s · accélère en LdV » face au Raiju) n'est pas une mauvaise réponse
        if (q.id.startsWith('q:sansum:')) expect([...thresholds(o!)].some((v) => thresholds(g).has(v)), `${q.id} : ${c.label}`).toBe(false)
        if (q.id.startsWith('q:spdsum:')) expect([...speedValues(o!)].every((v) => speedValues(g).has(v)), `${q.id} : ${c.label}`).toBe(false)
        // une entité nommée dans le test (« le Deogen est lui aussi plus visible ») ne sert pas de mauvaise réponse
        if (q.id.startsWith('q:zero:')) expect(namesGhost(q.quote ?? '', o!), `${q.id} : ${c.id}`).toBe(false)
      }
      if (q.id.startsWith('q:dist:')) dist++
    }
    expect(dist).toBeGreaterThan(50)
    // la ligne de vue « selon les conditions » (Kormos, Dayan, Raiju…) n'a pas de réponse oui/non
    const los = everything.filter((q) => q.id.startsWith('q:los:'))
    expect(los.length).toBeGreaterThan(10)
    for (const q of los) expect(ghost(q.ghostId!).speed.losVaries, q.id).toBeFalsy()
  })

  it('un pronom de l’énoncé n’écarte aucune réponse d’emblée', () => {
    /** Les fiches, où le seul signe 0 preuve de l'entité est remplacé. */
    const withTell = (id: string, text: string) => {
      const all = GHOSTS.map((g) => (g.id === id ? { ...g, tells: [{ text, zeroEvidence: true }] } : g))
      const g = all.find((x) => x.id === id)!
      const qs: Question[] = []
      for (let seed = 1; seed <= 30; seed++) {
        qs.push(...buildQuiz({ topics: ['behavior'], ghosts: [g], allGhosts: all, mechanics: MECHANICS, count: 6, rng: createRng(seed) }))
      }
      // les questions sur ce signe (la série en pose aussi sur d'autres entités, celle-ci parmi les mauvaises réponses)
      return qs.filter((q) => q.id.startsWith(`q:tell:${id}:`))
    }
    const genders = (qs: Question[]) => new Set(qs.flatMap((q) => q.choices.map((c) => isFeminine(ghost(c.id).name))))
    // « il » : aucune entité féminine parmi les choix
    const masc = withTell('yurei', 'Quand il touche une porte de sortie, il la referme complètement.')
    expect(masc.length).toBeGreaterThan(0)
    expect(genders(masc)).toEqual(new Set([false]))
    // « elle » : il n'y a pas trois autres entités féminines, donc pas de question plutôt qu'une réponse soufflée
    for (const q of withTell('banshee', 'Elle ne poursuit que sa cible, même quand elle traverse la carte.')) {
      expect(genders([q]), q.id).toEqual(new Set([true]))
    }
    // « elle » qui ne désigne pas l'entité (une porte, pour une entité masculine) : on n'en tient pas compte
    expect(genders(withTell('yurei', 'Touche une porte de sortie : elle se referme complètement.'))).toEqual(new Set([true, false]))
    // dans les vraies fiches, un pronom qui désigne l'entité garde des choix du même genre
    const fem = (t: string) => /(?:^|[\s(])[Ee]lles?\b/u.test(t)
    const mas = (t: string) => /(?:^|[\s(])(?:[Ii]ls?|[Ll]ui)\b(?!\s+(?:faut|suffit|y\s+a)\b)/u.test(t)
    for (const q of everything) {
      if (!/^q:(?:tell|obs|abil|zero|sanp|spdp):/u.test(q.id)) continue
      const text = `${q.prompt} ${q.quote ?? ''}`
      const gender = fem(text) && !mas(text) ? true : mas(text) && !fem(text) ? false : null
      if (gender == null || isFeminine(ghost(q.ghostId!).name) !== gender) continue
      for (const c of q.choices) expect(isFeminine(ghost(c.id).name), `${q.id} : ${c.id} — ${text}`).toBe(gender)
    }
  })

  it('départager deux entités : des phrases entières, sans conseil flou ni « Mais » en tête', () => {
    // la proposition qui portait le point est retirée : la phrase garde le sien
    expect(confusionWithoutEvidence('Lui aussi est très rapide en début de partie ; UV + D.O.T.S en commun. Il chasse à 50 %.')).toBe(
      'Lui aussi est très rapide en début de partie. Il chasse à 50 %.',
    )
    const [yokai, demon, thaye, deildegast] = ['yokai', 'demon', 'thaye', 'deildegast'].map(ghost)
    expect(partnerClaim('Le Thayé ralentit en vieillissant ; le Deildegast, lui, ralentit selon les objets. Le Thayé chasse à 75 % jeune.', deildegast, thaye)).toBe(
      'Le Thayé ralentit en vieillissant. Le Thayé chasse à 75 % jeune.',
    )
    // « pense plutôt à l'autre », ou deux « l'autre » : la réponse ne désigne plus personne
    expect(partnerClaim('Le Démon est un chasseur précoce lui aussi. Si personne ne parlait dans la pièce, pense plutôt à lui.', yokai, demon)).toBe('')
    expect(partnerClaim('Le Démon chasse tôt, et l’autre aussi quand on lui parle longtemps.', yokai, demon)).toBe('')
    expect(partnerClaim('Il chasse vers 75 %, et l’autre aussi ; l’autre peut chasser à toute santé mentale.', yokai, demon)).toBe('')
    expect(partnerClaim('Le Démon chasse dès 70 % même quand personne ne parle et rechasse 60 s après l’encens.', yokai, demon)).toBe(
      'Le Démon chasse dès 70 % même quand personne ne parle et rechasse 60 s après l’encens.',
    )
    for (const q of everything) {
      expect(q.explain, q.id).not.toMatch(/^(?:[^:]{1,40}:\s*)?Mais\b/iu)
      if (!q.id.startsWith('q:dist:')) continue
      for (const c of q.choices) {
        expect(c.label, q.id).toMatch(/[.!?…]$/u)
        expect(c.label, q.id).not.toMatch(/pense plutôt/iu)
        // une phrase coupée garde son point avant la suivante
        expect(c.label, q.id).not.toMatch(/[\p{Ll}\d)] (?:Il|Elle|Ils|L’autre) /u)
      }
    }
  })
})

describe('mise en situation', () => {
  it('respecte le nombre de preuves et la preuve forcée', () => {
    const rng = createRng(42)
    for (const g of GHOSTS) {
      for (const d of DIFFICULTIES) {
        const s = generateScenario(g, d.id, rng, GHOSTS)
        expect(s.visibleEvidence.length).toBe(d.count)
        expect(s.visibleEvidence.every((e) => g.evidence.includes(e))).toBe(true)
        if (g.forcedEvidence && d.count > 0) expect(s.visibleEvidence).toContain(g.forcedEvidence)
        // les indices de preuve trouvée correspondent aux preuves visibles (+ fausse preuve)
        const found = s.clues.filter((c) => c.kind === 'evidence').map((c) => c.evidence)
        for (const e of found) expect([...s.visibleEvidence, g.fakeEvidence]).toContain(e)
        // jamais de « pas de preuve » sur une preuve visible
        const absent = s.clues.filter((c) => c.kind === 'no-evidence').map((c) => c.evidence!)
        for (const e of absent) expect(s.visibleEvidence).not.toContain(e)
        // la bonne entité reste toujours possible avec les preuves annoncées
        const st: FilterState = {
          ...EMPTY_FILTER,
          evidenceCount: s.evidenceCount,
          evidence: { ...Object.fromEntries(absent.map((e) => [e, 'excluded'])), ...Object.fromEntries(found.map((e) => [e!, 'found'])) },
        }
        expect(matchesEvidence(g, st), `${g.id} ${d.id}`).toBe(true)
      }
    }
  })

  it('raconte une chronologie cohérente', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const g of GHOSTS) {
        for (const d of DIFFICULTIES) {
          const s = generateScenario(g, d.id, createRng(seed * 31 + d.count), GHOSTS)
          const label = `${g.id} ${d.id} graine ${seed}`
          // horodatage croissant, au format mm:ss valide
          const secs = s.clues.map((c) => {
            expect(c.time, label).toMatch(/^\d{2}:[0-5]\d$/)
            const [m, sec] = c.time.split(':').map(Number)
            return m * 60 + sec
          })
          for (let i = 1; i < secs.length; i++) expect(secs[i], label).toBeGreaterThanOrEqual(secs[i - 1])
          // une seule « première chasse », et aucun indice de chasse avant elle
          const firsts = s.clues.filter((c) => c.kind === 'hunt-sanity')
          expect(firsts.length, label).toBeLessThanOrEqual(1)
          const firstIdx = s.clues.findIndex((c) => c.kind === 'hunt-sanity')
          if (firstIdx >= 0) {
            const huntIdx = s.clues.findIndex((c) => c.kind === 'hunt-speed')
            if (huntIdx >= 0) expect(huntIdx, label).toBeGreaterThan(firstIdx)
          }
          // pas d'observation qui exige une preuve absente de la partie
          const texts = new Set(s.clues.map((c) => c.text))
          for (const o of g.observations) {
            if (o.requires && !s.visibleEvidence.includes(o.requires)) {
              expect([...texts].some((t) => t.length > 20 && o.text.includes(t.slice(0, 20))), label).toBe(false)
            }
          }
          // peu de preuves : au moins un indice fort ou décisif quand l'entité en a
          const hasStrong = g.observations.some((o) => !o.requires && o.strength !== 'hint')
          if (d.count <= 1 && hasStrong) {
            expect(s.clues.some((c) => c.kind === 'observation' && c.strength !== 'hint'), label).toBe(true)
          }
          // en 0 preuve, une entité autre que le Mimic n'a jamais d'orbes, et on le dit
          if (d.count === 0 && g.id !== 'the-mimic') {
            expect(s.clues.some((c) => c.kind === 'no-evidence' && c.evidence === 'orbs'), label).toBe(true)
          }
        }
      }
    }
  })

  it('formate les minutes sans « :60 »', () => {
    expect(clock(2.9999)).toBe('03:00')
    expect(clock(1.5)).toBe('01:30')
  })

  it('pickVisibleEvidence garde la preuve forcée', () => {
    const g: Ghost = { ...GHOSTS[0], evidence: ['emf', 'uv', 'freezing'], forcedEvidence: 'freezing' }
    for (let i = 0; i < 20; i++) expect(pickVisibleEvidence(g, 1, createRng(i))).toEqual(['freezing'])
  })

  it('le score récompense les enquêtes courtes, sans rendre le pari rentable', () => {
    expect(scoreScenario(2, 10, 0, true)).toBeGreaterThan(scoreScenario(9, 10, 0, true))
    expect(scoreScenario(2, 10, 1, true)).toBeLessThan(scoreScenario(2, 10, 0, true))
    expect(scoreScenario(2, 10, 0, false)).toBe(0)
    // parier entre 3 entités à mi-parcours (2 essais) rapporte moins, en moyenne, que trouver à coup sûr un peu plus tard
    const mid = scoreScenario(5, 10, 0, true)
    const bet = (mid + scoreScenario(5, 10, 1, true) + 0) / 3
    expect(bet).toBeLessThan(scoreScenario(8, 10, 0, true))
  })
})

describe('outils', () => {
  it('masque le nom de l’entité avec une grammaire correcte', () => {
    const demon = { ...GHOSTS[0], name: 'Démon', nameEn: 'Demon' }
    expect(redactGhostName('La vitesse du Démon est normale', demon)).toBe('La vitesse de cette entité est normale')
    expect(redactGhostName('Le Demon peut chasser', demon)).toBe('cette entité peut chasser')
    const onryo = { ...GHOSTS[0], name: 'Onryo', nameEn: 'Onryo' }
    expect(redactGhostName("l'Onryo souffle une flamme", onryo)).toBe('cette entité souffle une flamme')
    const shade = { ...GHOSTS[0], name: 'Ombre', nameEn: 'Shade' }
    expect(redactGhostName('Seule à apparaître en ombre au cercle', shade)).toBe('Seule à apparaître en ombre au cercle')
    expect(redactGhostName("Si c'est une Ombre, elle évite la pièce", shade)).toBe("Si c'est cette entité, elle évite la pièce")
    expect(redactGhostName("un indice d'Obambo", { ...GHOSTS[0], name: 'Obambo', nameEn: 'Obambo' })).toBe('un indice de cette entité')
  })

  it('classe les vitesses', () => {
    const g = (min: number, max: number | null, isRange = false) => ({ ...GHOSTS[0], speed: { ...GHOSTS[0].speed, min, max, alt: null, isRange } })
    expect([...speedClasses(g(1.7, null))]).toEqual(['normal'])
    expect(speedClasses(g(1.0, 3.0)).has('slow')).toBe(true)
    expect(speedClasses(g(1.0, 3.0)).has('normal')).toBe(false)
    expect(speedClasses(g(1.0, 3.0, true)).has('normal')).toBe(true)
  })

  it('convertit vitesse et pas/minute dans les deux sens', () => {
    for (const v of [1, 1.5, 1.7, 2.5, 3]) expect(bpmToSpeed(speedToBpm(v))).toBeCloseTo(v, 6)
    expect(Math.round(speedToBpm(1.7))).toBe(117)
  })

  it('encode et décode un lien de partage', async () => {
    const value = { kind: 'test', notes: [{ title: 'Démon & encens — 60 s', body: '« ok »' }] }
    const enc = await encodePayload(value)
    expect(enc).toMatch(/^[zj][A-Za-z0-9_-]+$/)
    expect(await decodePayload(enc)).toEqual(value)
  })

  it('construit un paquet de cartes aux identifiants uniques', () => {
    const deck = buildDeck(GHOSTS, MECHANICS, [])
    const ids = deck.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    // les preuves restent dans le codex : aucune carte « Quelles sont les 3 preuves… » ni « preuve forcée »
    expect(deck.some((c) => (c.kind as string) === 'evidence' || (c.kind as string) === 'forced')).toBe(false)
    expect(deck.some((c) => /:ev$|:forced$/.test(c.id))).toBe(false)
    expect(deck.filter((c) => c.kind === 'tells').length).toBe(GHOSTS.length)
  })
})

describe('liens reçus', () => {
  const D = 'zq1ZKkktLlGyUlAqzs8tSM0rVajIzEkFAA'
  const profile = { name: 'Léa', coachName: 'Ryz', role: 'student' as const, createdAt: T0 }
  const note = (id: string, author: string, t = T0, extra = {}) => ({
    id, author, createdAt: t, updatedAt: t, ghostId: null, title: `Note ${id}`, body: 'texte', asCard: true, ...extra,
  })

  it('reconnaît un lien de notes ou de bilan, même entouré de texte', () => {
    expect(parseShareInput(`https://ryz.github.io/phasmo-coach/#/importer?d=${D}`)).toEqual({ kind: 'notes', d: D })
    expect(parseShareInput(`  https://x.app/#/rapport?d=${D}  `)).toEqual({ kind: 'report', d: D })
    expect(parseShareInput(`Tiens, mes notes : <https://x.app/#/importer?d=${D}> à plus`)).toEqual({ kind: 'notes', d: D })
    expect(parseShareInput(`https://x.app/#/importer?coller=1&d=${D}&x=1`)).toEqual({ kind: 'notes', d: D })
    expect(parseShareInput(`https://x.app/%23/importer%3Fd%3D${D}`)).toEqual({ kind: 'notes', d: D })
  })

  it('accepte la seule valeur de d= et refuse le reste', () => {
    expect(parseShareInput(D)).toEqual({ kind: 'notes', d: D })
    expect(parseShareInput(`d=${D}`)).toEqual({ kind: 'notes', d: D })
    expect(parseShareInput('')).toBeNull()
    expect(parseShareInput('bonjour')).toBeNull()
    expect(parseShareInput('https://x.app/#/carnet?coller=1')).toBeNull()
    expect(parseShareInput('https://x.app/#/importer?d=abc')).toBeNull()
    expect(parseShareInput('https://x.app/#/importer?d=')).toBeNull()
  })

  it('décode un lien collé jusqu’aux notes', async () => {
    const d = await encodePayload({ kind: 'phasmo-coach/notes', from: 'Ryz', at: T0, notes: [note('a', 'Ryz')] })
    const input = parseShareInput(`https://x.app/#/importer?d=${d}`)
    const p = readNotesPayload(await decodePayload(input!.d))
    expect(p?.notes.map((n) => n.id)).toEqual(['a'])
    expect(p?.from).toBe('Ryz')
  })

  it('valide un carnet reçu', () => {
    expect(readNotesPayload({ kind: 'phasmo-coach/report' })).toBeNull()
    expect(readNotesPayload({ kind: 'phasmo-coach/notes', notes: [] })).toBeNull()
    const p = readNotesPayload({ kind: 'phasmo-coach/notes', from: 3, at: 'hier', notes: [note('a', 'Ryz')] })
    expect(p).toMatchObject({ from: '', at: null })
  })

  it('valide chaque champ d’un bilan, ancien ou récent', () => {
    expect(readReportPayload({ kind: 'phasmo-coach/notes' })).toBeNull()
    const old = readReportPayload({ kind: 'phasmo-coach/report', name: 'Léa', at: T0, streak: 2, learned: 5, total: 300, mastery: { demon: 40 }, activity: [] })
    expect(old).toMatchObject({ name: 'Léa', at: T0, streak: 2, mastery: { demon: 40 } })
    expect(old?.notes).toBeUndefined()
    const bad = readReportPayload({
      kind: 'phasmo-coach/report', name: 5, at: '2026-10-31T10:00:00Z', streak: -3, learned: 'x', total: Infinity,
      mastery: { demon: 400, 'Pas<b>': 10, banshee: 'x' },
      activity: [{ t: 1e300, kind: 'quiz', score: 'a', total: 10, label: 'Quiz' }, 'x'],
      notes: [{ title: 'Encens', phase: 'oups', lapses: -1, grade: 9, due: 'demain' }, { title: '' }],
    })
    expect(bad).toMatchObject({ name: '', at: null, streak: 0, learned: 0, total: 0, mastery: { demon: 100 } })
    expect(bad?.activity).toEqual([{ t: null, kind: 'quiz', score: 0, total: 10, label: 'Quiz' }])
    expect(bad?.notes).toEqual([{ title: 'Encens', phase: 'new', lapses: 0, grade: null, due: null }])
  })

  it('n’envoie que ses propres notes, nouvelles depuis le dernier envoi', () => {
    const notes = [note('a', 'Léa', T0 - DAY), note('b', 'Léa', T0 + DAY), note('c', 'Ryz', T0 + DAY), note('d', 'léa ', T0 + 2 * DAY)]
    expect(notesToShare(notes, profile, T0).map((n) => n.id)).toEqual(['b', 'd'])
    expect(notesToShare(notes, profile, T0, true).map((n) => n.id)).toEqual(['a', 'b', 'd'])
    expect(notesToShare(notes, profile, undefined).map((n) => n.id)).toEqual(['a', 'b', 'd'])
  })

  it('résume dans le bilan où en est chaque note du coach', () => {
    const notes = [note('a', 'Ryz'), note('b', 'Ryz', T0 + 1), note('c', 'Léa'), note('d', 'Ryz', T0, { body: '', answer: undefined })]
    const s = schedule(schedule(undefined, 4, T0), 1, T0 + 4 * DAY)
    const out = reportNotes(notes, profile, { 'n:a': s }, [{ id: 'n:a', t: T0, g: 4, isNew: true }, { id: 'n:a', t: T0 + 4 * DAY, g: 1, isNew: false }])
    expect(out).toEqual([
      { title: 'Note b', phase: 'new', lapses: 0, grade: null, due: null },
      { title: 'Note a', phase: 'learning', lapses: 1, grade: 1, due: s.due },
    ])
  })
})

describe('carnet à deux (facultatif)', () => {
  const note = (id: string, author: string, t = T0, extra = {}) => ({
    id, author, createdAt: t, updatedAt: t, ghostId: null, title: `Note ${id}`, body: 'texte', asCard: true, ...extra,
  })
  const solo = { name: 'Léa', coachName: '', role: 'solo' as const, createdAt: T0 }

  it('commence seul·e, et garde le rôle d’un carnet existant', () => {
    expect(initialState().profile.role).toBe('solo')
    const base = { version: 1, onboarded: true }
    expect(hydrate({ ...base, profile: { name: 'Léa', coachName: 'Ryz', role: 'student' } }).profile).toMatchObject({ role: 'student', coachName: 'Ryz' })
    expect(hydrate({ ...base, profile: { name: 'Ryz', role: 'coach' } }).profile.role).toBe('coach')
    expect(hydrate({ ...base, profile: { name: 'Léa' } }).profile).toMatchObject({ role: 'solo', coachName: '' })
    expect(hydrate({ ...base, profile: { name: 4, role: 'admin', coachName: null } }).profile).toMatchObject({ name: '', role: 'solo', coachName: '' })
  })

  it('n’a pas de coach quand on s’entraîne seul·e', () => {
    expect(coachNameOf({ ...solo, coachName: 'Ryz' })).toBe('')
    expect(isCoachNote(note('a', 'Ryz'), { ...solo, coachName: 'Ryz' })).toBe(false)
    expect(coachNameOf({ ...solo, coachName: ' Ryz ', role: 'student' })).toBe('Ryz')
    expect(coachNameOf({ ...solo, name: 'Ryz', role: 'coach' })).toBe('Ryz')
  })

  it('reconnaît l’expéditeur des notes comme coach', () => {
    expect(adoptCoach(solo, ' Ryz ')).toMatchObject({ role: 'student', coachName: 'Ryz' })
    expect(adoptCoach({ ...solo, role: 'student' }, 'Ryz')).toMatchObject({ role: 'student', coachName: 'Ryz' })
    // ses propres notes (sauvegarde), un envoi sans nom, un coach déjà noté, le carnet d'un coach : rien ne change
    expect(adoptCoach(solo, 'léa')).toBe(solo)
    expect(adoptCoach(solo, '')).toBe(solo)
    const coached = { ...solo, role: 'student' as const, coachName: 'Ryz' }
    expect(adoptCoach(coached, 'Max')).toBe(coached)
    const coach = { ...solo, name: 'Ryz', role: 'coach' as const }
    expect(adoptCoach(coach, 'Léa')).toBe(coach)
  })

  it('ne devient jamais sa propre coach', () => {
    // ses notes transférées sur un nouvel appareil, avant d'y avoir donné son prénom : rien ne change
    const blank = { ...solo, name: '' }
    // le lien d'un coach ouvert avant de donner son prénom fait bien de l'expéditeur son coach…
    expect(adoptCoach(blank, 'Ryz')).toMatchObject({ role: 'student', coachName: 'Ryz' })
    // …et ses propres notes passées d'un appareil à l'autre ne la rendent pas « coachée par elle-même »
    expect(onboardProfile(adoptCoach(blank, 'Inès'), { name: 'Inès' })).toMatchObject({ name: 'Inès', role: 'solo', coachName: '' })
    // un carnet déjà « coaché par soi-même » se corrige à l'ouverture
    const selfCoached = { ...blank, role: 'student' as const, coachName: 'Inès' }
    expect(onboardProfile(selfCoached, { name: 'inès' })).toMatchObject({ name: 'inès', role: 'solo', coachName: '' })
    // un vrai coach reste son coach, et qui s'entraîne seul·e le reste
    expect(onboardProfile({ ...blank, role: 'student', coachName: 'Ryz' }, { name: 'Léa' })).toMatchObject({ name: 'Léa', role: 'student', coachName: 'Ryz' })
    expect(onboardProfile(blank, { name: 'Léa' })).toMatchObject({ name: 'Léa', role: 'solo', coachName: '' })
  })

  it('montre les notes du coach avant les siennes, et une note du coach toute neuve avant les cartes dues', () => {
    const profile = { ...solo, role: 'student' as const, coachName: 'Ryz' }
    // dans le carnet, la plus récente d'abord : sa propre note, écrite après celle du coach
    const notes = [note('own', 'Léa', T0 + DAY), note('coach', 'Ryz', T0)]
    expect(noteCards(notes).map((c) => c.author)).toEqual(['Léa', 'Ryz'])
    const deck = buildDeck(GHOSTS, MECHANICS, notes)
    const base = initialState(T0)
    const state = { ...base, profile, notes }
    expect(unseenCards(deck, state.cards, state.settings, profile).slice(0, 2).map((c) => c.id)).toEqual(['n:coach', 'n:own'])
    // sans coach, l'ordre du carnet reste
    expect(unseenCards(deck, state.cards, state.settings, solo).slice(0, 2).map((c) => c.id)).toEqual(['n:own', 'n:coach'])
    // des cartes dues : la note du coach passe devant, sa propre note s'intercale comme les autres nouvelles
    const old = schedule(schedule(undefined, 4, T0 - 30 * DAY), 4, T0 - 20 * DAY)
    const dueIds = deck.filter((c) => c.deck === 'ghost').slice(0, 6).map((c) => c.id)
    const queue = buildReviewQueue({ ...state, cards: Object.fromEntries(dueIds.map((id) => [id, old])) }, deck, T0).map((c) => c.id)
    expect(queue[0]).toBe('n:coach')
    // le reste, cartes dues et nouvelles mêlées dans un ordre tiré pour la journée
    for (const id of [...dueIds, 'n:own']) expect(queue, id).toContain(id)
    expect(queue.indexOf('n:own')).toBeGreaterThan(0)
    expect(queue).toHaveLength(1 + dueIds.length + state.settings.newPerDay - 1)
  })

  it('résume les notes du coach et ce qui reste à partager', () => {
    const coach = { name: 'Ryz', coachName: '', role: 'coach' as const, createdAt: T0 }
    const notes = [note('a', 'Ryz', T0 - DAY), note('b', 'Ryz', T0 + DAY, { body: '', answer: undefined }), note('c', 'Léa', T0 + DAY)]
    expect(shareSummary(notes, coach, undefined)).toEqual({ written: 2, inReview: 1, toShare: 2, lastShared: null })
    const s = shareSummary(notes, coach, T0)
    expect(s).toEqual({ written: 2, inReview: 1, toShare: 1, lastShared: T0 })
    expect(shareSummaryLine(s)).toBe('2 notes écrites · 1 en révision · 1 à partager')
    expect(shareSummaryLine(shareSummary(notes, coach, T0 + 2 * DAY))).toBe('2 notes écrites · 1 en révision · tout est partagé')
    expect(shareSummaryLine(shareSummary([], coach, 'hier'))).toBe('aucune note écrite pour l’instant')
  })

  it('dit ce qu’un carnet reçu a changé', () => {
    expect(importSummary(0, 0)).toBe('Tout est déjà dans ton carnet')
    expect(importSummary(1, 0)).toBe('1 nouvelle note dans ton carnet')
    expect(importSummary(3, 2)).toBe('3 nouvelles notes et 2 mises à jour dans ton carnet')
    expect(importSummary(0, 1)).toBe('1 note mise à jour dans ton carnet')
  })
})

describe('caviardage : « d’un X »', () => {
  it('donne « de cette entité », jamais « d’cette entité »', () => {
    const deogen = GHOSTS.find((g) => g.id === 'deogen')!
    expect(redactGhostName('La respiration d’un Deogen à la Spirit Box.', deogen)).toBe('La respiration de cette entité à la Spirit Box.')
    expect(redactGhostName("Le souffle d'une Deogen.", deogen)).toBe('Le souffle de cette entité.')
  })
})

describe('révision en QCM', () => {
  const note = (id: string, extra: Partial<CoachNote>): CoachNote => ({
    id,
    createdAt: T0,
    updatedAt: T0,
    ghostId: 'demon',
    title: `Note ${id}`,
    body: 'Le Démon rechasse vite après l’encens.',
    asCard: true,
    author: 'Ryz',
    ...extra,
  })
  const notes: CoachNote[] = [
    note('qcm', { question: 'Combien de temps l’encens bloque-t-il un Démon ?', answer: '60 secondes', wrong: ['90 secondes', '180 secondes', '30 secondes'] }),
    note('deux', { question: 'Le Démon peut-il chasser à 70 % ?', answer: 'Oui', wrong: ['Non'] }),
    note('sans-faux', { question: 'Que retenir du Démon ?', answer: 'Il rechasse vite' }),
    note('sans-question', { wrong: ['Rien'] }),
    note('doublons', { question: 'Q ?', answer: 'Même', wrong: ['même', '  '] }),
  ]
  const deck = buildDeck(GHOSTS, MECHANICS, notes)
  const ctx = (day: string) => ({ allGhosts: GHOSTS, mechanics: MECHANICS, notes, day })
  const DAYS = ['2026-10-31', '2026-11-01', '2026-11-07', '2026-12-25', '2027-03-14', '2026-10-31#1', '2026-10-31#2']
  const facts = MECHANICS.topics.flatMap((t) => t.facts)
  /** un choix d'entité : son nom seul, sans nom anglais entre parenthèses */
  const label = (g: Ghost) => g.name
  const bare = (g: Ghost) =>
    [g.name, g.nameEn, g.name.replace(/^(Le|Les|La) /, ''), g.nameEn.replace(/^The /, '')]
      .filter((n) => n.length > 3)
      .map((n) => new RegExp(`(?<![\\p{L}])${n}(?![\\p{L}])`, 'u'))
  const leaks = (text: string | undefined, g: Ghost) => !!text && (namesGhost(text, g) || bare(g).some((re) => re.test(text)))

  it('chaque carte devient un QCM à une seule bonne réponse, ou se déclare « à retourner »', () => {
    const asked = { ghost: 0, fact: 0, note: 0 }
    for (const day of DAYS) {
      for (const c of deck) {
        const q = questionForCard(c, ctx(day))
        // le Mimic copie tout : parmi les choix, il serait toujours la bonne réponse ; ses cartes se retournent
        if (c.ghostId === 'the-mimic') {
          expect(q, c.id).toBeNull()
          continue
        }
        if (!q) {
          // seules les cartes écrites peuvent rester sans choix : un fait sans réponses rédigées, une note sans mauvaise réponse
          expect(['fact', 'note'], `${c.id} (${day}) sans QCM`).toContain(c.kind)
          if (c.kind === 'fact') expect(facts.find((f) => `m:${f.id}` === c.id)?.choices?.length ?? 0, c.id).toBeLessThan(2)
          if (c.kind === 'note') expect(['n:sans-faux', 'n:sans-question', 'n:doublons'], c.id).toContain(c.id)
          continue
        }
        asked[c.deck === 'mechanics' ? 'fact' : c.deck === 'coach' ? 'note' : 'ghost']++
        const ids = q.choices.map((x) => x.id)
        expect(q.cardId, c.id).toBe(c.id)
        expect(q.multi, c.id).toBe(false)
        expect(q.correct, c.id).toHaveLength(1)
        expect(ids, c.id).toContain(q.correct[0])
        expect(new Set(ids).size, `${c.id} : identifiants en double`).toBe(ids.length)
        expect(new Set(q.choices.map((x) => x.label.trim().toLowerCase())).size, `${c.id} : réponses en double`).toBe(ids.length)
        expect(q.choices.every((x) => x.label.trim().length > 0), c.id).toBe(true)
        expect(ids.length, c.id).toBeLessThanOrEqual(4)
        expect(ids.length, c.id).toBeGreaterThanOrEqual(c.kind === 'note' ? 2 : 3)
        expect(isCorrect(q, q.correct), c.id).toBe(true)
        if (c.deck !== 'ghost') continue

        const g = getGhost(c.ghostId!)!
        const right = q.choices.find((x) => x.id === q.correct[0])!
        expect(right.id, c.id).toBe(g.id)
        // jamais le Mimic parmi les choix
        for (const x of q.choices) expect(x.id, `${c.id} (${day})`).not.toBe('the-mimic')
        expect(mentionsEvidence(`${q.prompt} ${q.quote ?? ''}`), `${c.id}: ${q.prompt}`).toBe(false)
        expect(mentionsEvidence(right.label), `${c.id}: ${right.label}`).toBe(false)
        const named = q.choices.every((x) => getGhost(x.id) && x.label === label(getGhost(x.id)!))
        // des entités en choix : leur nom seul (« Esprit (Spirit) » serait la seule réponse avec une parenthèse)
        for (const x of q.choices) if (getGhost(x.id)) expect(x.label, c.id).not.toBe(`${getGhost(x.id)!.name} (${getGhost(x.id)!.nameEn})`)
        if (named) {
          // les choix sont des entités : ni la question ni la citation ne nomment la bonne
          expect(leaks(q.prompt, g) || leaks(q.quote, g), `${c.id}: ${q.prompt} ${q.quote ?? ''}`).toBe(false)
        } else {
          // les choix sont des phrases : aucune ne nomme une entité (la sienne la désignerait)
          for (const x of q.choices) for (const o of GHOSTS) expect(namesGhost(x.label, o), `${c.id}: ${x.label}`).toBe(false)
        }
      }
    }
    // toutes les cartes des entités (seuils, vitesses, signes, tests) ont leurs choix, sauf celles du Mimic
    expect(asked.ghost).toBe(deck.filter((c) => c.deck === 'ghost' && c.ghostId !== 'the-mimic').length * DAYS.length)
    expect(asked.note).toBe(2 * DAYS.length)
    expect(asked.fact).toBe(facts.filter((f) => !f.evidence && (f.choices?.length ?? 0) >= 2).length * DAYS.length)
  })

  it('les mauvaises réponses d’un signe ne décrivent pas l’entité', () => {
    for (const day of DAYS) {
      for (const c of deck.filter((x) => (x.kind === 'tells' || x.kind === 'reverse' || x.kind === 'sanity' || x.kind === 'speed') && x.ghostId !== 'the-mimic')) {
        const q = questionForCard(c, ctx(day))!
        const g = getGhost(c.ghostId!)!
        for (const x of q.choices) {
          if (x.id === g.id) continue
          const o = getGhost(x.id)
          // un nombre : jamais une valeur que l'entité peut avoir ; un résumé : jamais un seuil qu'elle partage
          if (c.kind === 'sanity' && q.prompt.startsWith('Quel est')) expect(thresholds(g).has(valueOf(x.label)), `${c.id} : ${x.label}`).toBe(false)
          if (c.kind === 'speed' && q.prompt.startsWith('Quelle est')) expect(speedValues(g).has(valueOf(x.label)), `${c.id} : ${x.label}`).toBe(false)
          if (c.kind === 'sanity' && q.prompt.startsWith('Quelle description')) expect([...thresholds(o!)].some((v) => thresholds(g).has(v)), `${c.id} : ${o!.id}`).toBe(false)
          if (c.kind === 'speed' && q.prompt.startsWith('Quelle description')) expect(x.label, c.id).not.toBe(g.speed.summary)
          // « Lequel de ces signes est celui de X ? » : le pronom d'une mauvaise réponse ne l'écarte pas d'emblée
          if (q.prompt.startsWith('Lequel')) expect(/f[ée]minin|masculin/iu.test(x.label), `${c.id}: ${x.label}`).toBe(false)
        }
      }
    }
  })

  it('même carte, même jour : mêmes choix dans le même ordre', () => {
    for (const c of deck) {
      const a = questionForCard(c, ctx('2026-10-31'))
      const b = questionForCard(c, ctx('2026-10-31'))
      expect(b, c.id).toEqual(a)
    }
    // un autre jour, l'ordre change pour au moins une partie des cartes
    const order = (day: string) => deck.map((c) => questionForCard(c, ctx(day))?.choices.map((x) => x.id).join() ?? '').join('|')
    expect(order('2026-11-01')).not.toBe(order('2026-10-31'))
  })

  it('une note devient un QCM avec sa question, sa réponse et ses mauvaises réponses, telles qu’écrites', () => {
    const q = questionForCard(deck.find((c) => c.id === 'n:qcm')!, ctx('2026-10-31'))!
    expect(q.prompt).toBe('Combien de temps l’encens bloque-t-il un Démon ?')
    expect(q.choices.map((x) => x.label).sort()).toEqual(['180 secondes', '30 secondes', '60 secondes', '90 secondes'])
    expect(q.choices.find((x) => q.correct.includes(x.id))!.label).toBe('60 secondes')
    // les doublons et les blancs ne comptent pas : sans vraie mauvaise réponse, la carte se retourne
    expect(questionForCard(deck.find((c) => c.id === 'n:doublons')!, ctx('2026-10-31'))).toBeNull()
  })

  it('un fait sans réponses rédigées reste une carte à retourner', () => {
    const m = {
      topics: [
        {
          id: 't',
          title: 'T',
          icon: 'hunt' as const,
          facts: [
            { id: 'a', text: 'x', q: 'Combien ?', a: '15 s', choices: ['10 s', '15 s', '30 s'], answer: 1 },
            { id: 'b', text: 'y', q: 'Combien encore ?', a: '20 s' },
            { id: 'c', text: 'z', q: 'Rang hors limites ?', a: '1', choices: ['1', '2', '3'], answer: 3 },
          ],
        },
      ],
      trueFalse: [],
    }
    const [a, b, c] = mechanicsCards(m)
    const q = questionForCard(a, { allGhosts: GHOSTS, mechanics: m, day: '2026-10-31' })!
    expect(q.choices.find((x) => q.correct.includes(x.id))!.label).toBe('15 s')
    expect(questionForCard(b, { allGhosts: GHOSTS, mechanics: m, day: '2026-10-31' })).toBeNull()
    expect(questionForCard(c, { allGhosts: GHOSTS, mechanics: m, day: '2026-10-31' })).toBeNull()
  })

  it('garde au plus 3 mauvaises réponses, nettoyées, dans les notes reçues ou chargées', () => {
    const [n] = sanitizeNotes([{ id: 'x', title: 'T', body: 'B', wrong: ['  a ', '', 3, 'b', 'c', 'd', 'x'.repeat(400)] }])
    expect(n.wrong).toEqual(['a', 'b', 'c'])
    expect(sanitizeNotes([{ id: 'y', title: 'T', body: 'B', wrong: 'pas une liste' }])[0].wrong).toBeUndefined()
    expect(sanitizeNotes([{ id: 'z', title: 'T', body: 'B', wrong: ['x'.repeat(400)] }])[0].wrong).toEqual(['x'.repeat(200)])
  })
})

describe('des réponses de même forme', () => {
  /** un choix d'entité : son nom seul, sans nom anglais entre parenthèses */
  const label = (g: Ghost) => g.name
  /** Les choix sont des noms d'entités : un nom ne souffle rien, sa longueur non plus. */
  const named = (q: Question) => q.choices.every((c) => getGhost(c.id) && c.label === label(getGhost(c.id)!))
  const NUMBER = /^\d+(?:,\d+)?\s?(%|m\/s|s|min|m|°C)$/u
  const unit = (l: string) => NUMBER.exec(l)?.[1] ?? 'texte'
  /** Les questions rédigées (fiches, mécaniques, notes) ont leurs propres vérifications : seules comptent ici celles que l'app compose. */
  const composed = (q: Question) => !/^q:(?:auth|fact|note|tf):/u.test(q.id) && !/^q:card:[mn]:/u.test(q.id)

  /** Toutes les questions composées : chaque thème pour chaque entité, sur plusieurs tirages, et chaque carte sur plusieurs jours. */
  let questions: Question[] = []
  beforeAll(() => {
    const out = new Map<string, Question>()
    const keep = (q: Question) => out.set(`${q.id}|${q.choices.map((c) => c.label).join('|')}`, q)
    for (const t of QUIZ_TOPICS) {
      for (const g of GHOSTS) {
        for (let seed = 1; seed <= 6; seed++) {
          for (const q of buildQuiz({ topics: [t.id], ghosts: [g], allGhosts: GHOSTS, mechanics: MECHANICS, count: 30, rng: createRng(seed * 7919 + g.id.length) })) keep(q)
        }
      }
    }
    const deck = buildDeck(GHOSTS, MECHANICS, [])
    for (const day of ['2026-10-31', '2026-11-01', '2026-11-07', '2026-12-25', '2027-03-14', '2027-06-21']) {
      for (const c of deck) {
        const q = questionForCard(c, { allGhosts: GHOSTS, mechanics: MECHANICS, day })
        if (q) keep(q)
      }
    }
    questions = [...out.values()].filter(composed)
  }, 120_000)

  it('reconnaît des réponses qui se trahissent par leur forme', () => {
    // la capture du coach : « 50 % » face à trois longs résumés
    expect(
      homogeneous([
        '50 % de sa cible · 12 à 87 % en moyenne',
        '50 %',
        '60 % lumière éteinte · 40 % lumière allumée',
        '50 % · jusqu’à 80 % si quelqu’un parle dans sa pièce',
      ]),
    ).toBe(false)
    expect(homogeneous(['40 %', '50 %', '60 %', '70 %'])).toBe(true)
    expect(homogeneous(['1,5 m/s', '1,7 m/s', '1,96 m/s', '2,5 m/s'])).toBe(true)
    // pas de mélange de types ni d'unités
    expect(homogeneous(['50 %', '1,7 m/s', '60 %', '70 %'])).toBe(false)
    expect(homogeneous(['50 %', 'Cinquante', '60 %'])).toBe(false)
    // réponses courtes : 12 caractères d'écart au plus
    expect(homogeneous(['Oui', 'Non, jamais'])).toBe(true)
    expect(homogeneous(['Oui', 'Non, sauf en ligne de vue'])).toBe(false)
    // la seule avec une parenthèse, un « · », un chiffre, une nuance : elle se remarque
    const base = ['Ne touche jamais au sel en chasse', 'Éteint les lumières de sa pièce', 'Lance plus d’objets que les autres']
    expect(homogeneous([...base, 'Ne fait aucun événement de chant'])).toBe(true)
    expect(homogeneous([...base, 'Chasse plus tôt (dans le noir)'])).toBe(false)
    expect(homogeneous([...base, 'Chasse tôt · éteint tout'])).toBe(false)
    expect(homogeneous([...base, 'Chasse à 60 % dans le noir'])).toBe(false)
    expect(homogeneous([...base, 'Chasse parfois dans le noir'])).toBe(false)
    // deux contre deux : aucune ne se distingue seule
    expect(homogeneous(['Chasse à 60 % dans le noir', 'Chasse à 40 % sous la lumière', ...base.slice(0, 2)])).toBe(true)
    // la seule qui cite un pourcentage (ou une vitesse), qui commence par un chiffre, qui a des « », un « elle »,
    // un « environ », ou la seule qui « n'accélère pas » : elle se remarque aussi
    expect(homogeneous(['Chasse à 60 % dans le noir', 'Ralentit à 0,4 m/s tout près', ...base.slice(0, 2)])).toBe(false)
    expect(homogeneous([...base, '3,0 m/s si personne n’a rien touché'])).toBe(false)
    expect(homogeneous([...base, 'Peut « sauter » un bruit de pas'])).toBe(false)
    expect(homogeneous([...base, 'Elle ralentit près des joueurs'])).toBe(false)
    expect(homogeneous([...base, 'Alterne environ toutes les minutes'])).toBe(false)
    expect(
      homogeneous([
        '1,7 m/s · accélère en ligne de vue',
        '1,5 ou 1,9 m/s · accélère en ligne de vue',
        '1,4 à 2,7 m/s · n’accélère pas en ligne de vue',
        '1,53 m/s · accélère en ligne de vue',
      ]),
    ).toBe(false)
  })

  it('les seuils et les vitesses se demandent en nombres que le jeu connaît', () => {
    const real = { san: new Set(GHOSTS.flatMap((g) => [...thresholds(g)])), spd: new Set(GHOSTS.flatMap((g) => [...speedValues(g)])) }
    const seen = { san: new Set<string>(), spd: new Set<string>() }
    // sans valeur habituelle (Thayé, Obambo, Deogen…) : seulement des valeurs sous condition (« … du Thayé encore jeune ? »)
    const noBase = {
      san: ['thaye', 'obambo', 'the-mimic'],
      spd: ['thaye', 'obambo', 'hantu', 'moroi', 'deogen', 'deildegast', 'the-twins', 'the-mimic'],
    }
    // ni valeur habituelle, ni valeur sous condition : une plage (« 1,4 à 2,7 m/s selon le froid »), deux valeurs au choix, une copie
    const none = { san: ['the-mimic'], spd: ['hantu', 'moroi', 'deildegast', 'the-twins', 'the-mimic'] }
    const extra: Question[] = []
    /** une entité standard n'a sa question en nombres que rarement (sinon « 50 % » gagnerait) : on la cherche sur plus de tirages */
    const find = (g: Ghost, id: string) => {
      const kind = id.split(':')[1]
      const found = [...questions, ...extra].find((x) => x.id === id)
      if (found) return found
      for (let seed = 1; seed <= 300; seed++) {
        const q = buildQuiz({ topics: [kind === 'san' ? 'sanity' : 'speed'], ghosts: [g], allGhosts: GHOSTS, mechanics: MECHANICS, count: 10, rng: createRng(seed) }).find((x) => x.id === id)
        if (q) {
          extra.push(q)
          return q
        }
      }
      return undefined
    }
    for (const g of GHOSTS) for (const kind of ['san', 'spd'] as const) if (!noBase[kind].includes(g.id)) expect(find(g, `q:${kind}:${g.id}`), `q:${kind}:${g.id}`).toBeDefined()
    // les valeurs sous condition, telles que le résumé les cite
    const conditional: [string, string, string][] = [
      ['q:san:yokai:80', 'Quel est le seuil de chasse du Yokai si quelqu’un parle dans sa pièce\u202f?', '80\u00a0%'],
      ['q:san:thaye:75', 'Quel est le seuil de chasse du Thayé encore jeune\u202f?', '75\u00a0%'],
      ['q:san:dayan:45', 'Quel est le seuil de chasse de la Dayan si tu restes immobile près d’elle\u202f?', '45\u00a0%'],
      ['q:san:obambo:10', 'Quel est le seuil de chasse de l’Obambo en état calme\u202f?', '10\u00a0%'],
      ['q:spd:raiju:2.5', 'Quelle est la vitesse de chasse du Raiju près de l’électronique\u202f?', '2,5\u00a0m/s'],
      ['q:spd:gallu:1.96', 'Quelle est la vitesse de chasse du Gallu en état enragé\u202f?', '1,96\u00a0m/s'],
      ['q:spd:thaye:2.75', 'Quelle est la vitesse de chasse du Thayé encore jeune\u202f?', '2,75\u00a0m/s'],
    ]
    for (const [id, prompt, value] of conditional) {
      const q = find(getGhost(id.split(':')[2])!, id)
      expect(q, id).toBeDefined()
      expect(q!.prompt, id).toBe(prompt)
      expect(q!.choices.find((c) => q!.correct.includes(c.id))!.label, id).toBe(value)
    }
    for (const q of [...questions, ...extra]) {
      const kind = /^q:san:|^q:card:g:[^:]+:san$/u.test(q.id) && q.prompt.startsWith('Quel est') ? 'san' : /^q:spd:|^q:card:g:[^:]+:spd$/u.test(q.id) && q.prompt.startsWith('Quelle est') ? 'spd' : null
      if (!kind) continue
      const g = getGhost(q.ghostId!)!
      seen[kind].add(g.id)
      expect(q.choices, q.id).toHaveLength(4)
      for (const c of q.choices) {
        expect(c.label, q.id).toMatch(kind === 'san' ? /^\d+\s%$/u : /^\d,\d{1,2}\sm\/s$/u)
        // une valeur qui existe dans le jeu ; une mauvaise réponse n'est jamais une valeur de l'entité
        expect(real[kind].has(valueOf(c.label)), `${q.id} : ${c.label}`).toBe(true)
        const own = kind === 'san' ? thresholds(g) : speedValues(g)
        expect(own.has(valueOf(c.label)), `${q.id} : ${c.label}`).toBe(q.correct.includes(c.id))
      }
    }
    const right = (id: string, kind: 'san' | 'spd') => {
      const q = [...questions, ...extra].find((x) => x.ghostId === id && x.id === `q:${kind}:${id}`)!
      return q.choices.find((c) => q.correct.includes(c.id))!.label
    }
    expect(right('spirit', 'san')).toBe('50\u00a0%')
    expect(right('demon', 'san')).toBe('70\u00a0%')
    expect(right('mare', 'san')).toBe('60\u00a0%')
    expect(right('spirit', 'spd')).toBe('1,7\u00a0m/s')
    expect(right('aswang', 'spd')).toBe('1,53\u00a0m/s')
    // le Yokai chasse jusqu'à 80 % quand on parle : « 80 % » n'est jamais une mauvaise réponse pour lui
    for (const q of [...questions, ...extra].filter((x) => x.id === 'q:san:yokai')) expect(q.choices.map((c) => c.label), q.id).not.toContain('80\u00a0%')
    // les seuils et vitesses qui ne tiennent pas en un nombre (Hantu, Moroi, Jumeaux…) n'ont pas de question en nombres
    for (const id of none.san) expect(seen.san.has(id), id).toBe(false)
    for (const id of none.spd) expect(seen.spd.has(id), id).toBe(false)
    expect(seen.san.size).toBeGreaterThanOrEqual(28)
    expect(seen.spd.size).toBeGreaterThanOrEqual(24)
  }, 120_000)

  it('chaque question composée a des choix de même type, de longueur voisine et une seule bonne réponse', () => {
    let shaped = 0
    for (const q of questions) {
      const ids = q.choices.map((c) => c.id)
      expect(q.correct, q.id).toHaveLength(1)
      expect(ids, q.id).toContain(q.correct[0])
      expect(new Set(ids).size, q.id).toBe(ids.length)
      if (named(q)) continue
      shaped++
      const labels = q.choices.map((c) => c.label)
      const show = `${q.id} : ${labels.join(' | ')}`
      expect(new Set(labels.map(unit)).size, show).toBe(1)
      const lengths = labels.map((l) => l.length)
      const [min, max] = [Math.min(...lengths), Math.max(...lengths)]
      expect(max <= 1.6 * min || (max <= 20 && max - min <= 12), show).toBe(true)
      expect(homogeneous(q.choices), show).toBe(true)
    }
    expect(shaped).toBeGreaterThan(1000)
  })

  it('la bonne réponse n’est pas d’habitude la plus longue', () => {
    const uniqueLongest = (q: Question) => {
      const lengths = q.choices.map((c) => c.label.length)
      const max = Math.max(...lengths)
      const right = q.choices.find((c) => q.correct.includes(c.id))!
      return right.label.length === max && lengths.filter((l) => l === max).length === 1
    }
    const shaped = questions.filter((q) => !named(q))
    const share = (qs: Question[]) => qs.filter(uniqueLongest).length / qs.length
    expect(share(shaped)).toBeLessThanOrEqual(0.3)
    // même parmi les seules phrases (départager, signes, résumés), où la longueur se voit le plus
    const sentences = shaped.filter((q) => q.choices.every((c) => unit(c.label) === 'texte' && c.label.length > 20))
    expect(sentences.length).toBeGreaterThan(500)
    expect(share(sentences)).toBeLessThanOrEqual(0.3)
    // ni dans aucune famille de questions à quatre phrases (signes, départages, résumés, tests)
    const family = (q: Question) => (q.id.startsWith('q:card:') ? `carte « ${q.prompt.split(' ').slice(0, 3).join(' ')} »` : q.id.split(':')[1])
    const families = new Map<string, Question[]>()
    for (const q of shaped.filter((x) => x.choices.length >= 3)) families.set(family(q), [...(families.get(family(q)) ?? []), q])
    for (const [name, qs] of families) if (qs.length >= 30) expect(share(qs), `${name} (${qs.length} questions)`).toBeLessThanOrEqual(0.3)
  })

  const rightOf = (q: Question) => q.choices.find((c) => q.correct.includes(c.id))!

  it('une valeur fréquente ne se devine pas : « 50 % » et « 1,7 m/s » ne gagnent pas d’office', () => {
    // le quiz tel qu'on le lance (toutes les entités) et les cartes, sur beaucoup de tirages : chaque occurrence compte
    const asked: Question[] = []
    for (let seed = 1; seed <= 150; seed++) {
      asked.push(...buildQuiz({ topics: ['sanity', 'speed'], ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 12, rng: createRng(seed) }))
    }
    const deck = buildDeck(GHOSTS, MECHANICS, []).filter((c) => c.kind === 'sanity' || c.kind === 'speed')
    for (let d = 1; d <= 40; d++) {
      for (const c of deck) {
        const q = questionForCard(c, { allGhosts: GHOSTS, mechanics: MECHANICS, day: `2026-12-${d}` })
        if (q) asked.push(q)
      }
    }
    const cases = [
      { value: '50\u00a0%', has: (g: Ghost) => thresholds(g).has(50), reverse: 'Laquelle de ces entités a un seuil' },
      { value: '1,7\u00a0m/s', has: (g: Ghost) => speedValues(g).has(1.7), reverse: 'Laquelle de ces entités a une vitesse' },
    ]
    for (const { value, has, reverse } of cases) {
      const offered = asked.filter((q) => q.choices.some((c) => c.label === value))
      const won = offered.filter((q) => rightOf(q).label === value)
      expect(offered.length, value).toBeGreaterThan(100)
      // au hasard, une chance sur quatre : « toujours cette valeur » ne doit pas faire beaucoup mieux
      expect(won.length / offered.length, `${value} : ${won.length}/${offered.length}`).toBeLessThanOrEqual(0.35)
      for (const q of asked) {
        const g = getGhost(q.ghostId!)!
        // à l'envers : la bonne réponse chasse d'habitude à cette valeur, aucune mauvaise n'y passe jamais
        if (q.prompt.startsWith(reverse)) {
          expect(has(g), q.id).toBe(true)
          for (const c of q.choices) {
            if (c.id === g.id) continue
            const o = getGhost(c.id)!
            expect(has(o) || o.speed.isRange || /→/u.test(o.huntSanity.summary) || o.id === 'the-mimic', `${q.id} : ${o.id}`).toBe(false)
          }
        }
      }
    }
    // les deux sortes de questions existent
    expect(asked.some((q) => q.prompt.startsWith('Laquelle de ces entités a un seuil'))).toBe(true)
    expect(asked.some((q) => q.prompt.startsWith('Laquelle de ces entités a une vitesse'))).toBe(true)

    // aucune valeur n'est toujours fausse (ni toujours juste) : chaque valeur proposée en nombres est parfois la
    // bonne réponse (« 80 % » quand on parle près du Yokai, « 2,5 m/s » près de l'électronique pour le Raiju)
    const numbers = asked.filter((q) => /^q:(?:san|spd):|^q:card:g:[^:]+:(?:san|spd)$/u.test(q.id) && q.choices.every((c) => /^\d+(?:,\d+)?\s(?:%|m\/s)$/u.test(c.label)))
    const stat = new Map<string, { shown: number; right: number }>()
    for (const q of numbers) {
      for (const c of q.choices) {
        const x = stat.get(c.label) ?? { shown: 0, right: 0 }
        x.shown++
        if (q.correct.includes(c.id)) x.right++
        stat.set(c.label, x)
      }
    }
    expect(stat.size).toBeGreaterThanOrEqual(20)
    for (const [label, { shown, right }] of stat) {
      if (shown < 40) continue
      expect(right / shown, `${label} : ${right}/${shown}`).toBeGreaterThanOrEqual(0.1)
      expect(right / shown, `${label} : ${right}/${shown}`).toBeLessThanOrEqual(0.45)
    }
  })

  it('« accélère-t-elle en ligne de vue ? » : autant de oui que de non', () => {
    const los: Question[] = []
    for (let seed = 1; seed <= 200; seed++) {
      los.push(...buildQuiz({ topics: ['speed'], ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 10, rng: createRng(seed) }).filter((q) => q.id.startsWith('q:los:')))
    }
    expect(los.length).toBeGreaterThan(100)
    const yes = los.filter((q) => q.correct[0] === 'yes').length / los.length
    expect(yes).toBeGreaterThanOrEqual(0.35)
    expect(yes).toBeLessThanOrEqual(0.65)
  })
})

describe('« Me tester sur X », départages et réponses sans indice', () => {
  /** un choix d'entité : son nom seul, sans nom anglais entre parenthèses */
  const label = (g: Ghost) => g.name
  /** Les choix sont des noms d'entités. */
  const named = (q: Question) => q.choices.every((c) => getGhost(c.id) && c.label === label(getGhost(c.id)!))
  const rightOf = (q: Question) => q.choices.find((c) => q.correct.includes(c.id))!
  const wrongOf = (q: Question) => q.choices.filter((c) => !q.correct.includes(c.id))
  const withoutAsides = (s: string) => s.replace(/\s*\([^()]*\)/gu, '').trim()

  /** Les séries « Me tester sur X » telles que la fiche les lance : thèmes par défaut, dix questions. */
  const solo = new Map<string, Question[][]>()
  /** Ce que l'app compose (sans les questions rédigées) : séries sur une entité, sur toutes, et cartes. */
  let composed: Question[] = []
  beforeAll(() => {
    for (const g of GHOSTS) {
      const runs: Question[][] = []
      for (let seed = 1; seed <= 30; seed++) {
        runs.push(buildQuiz({ topics: DEFAULT_TOPICS, ghosts: [g], allGhosts: GHOSTS, mechanics: MECHANICS, count: 10, rng: createRng(seed * 31 + 7) }))
      }
      solo.set(g.id, runs)
    }
    const out = new Map<string, Question>()
    const keep = (q: Question) => out.set(`${q.id}|${q.choices.map((c) => c.label).join('|')}`, q)
    for (const runs of solo.values()) for (const qs of runs) qs.forEach(keep)
    for (let seed = 1; seed <= 30; seed++) {
      buildQuiz({ topics: QUIZ_TOPICS.map((t) => t.id), ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 40, rng: createRng(seed) }).forEach(keep)
    }
    const deck = buildDeck(GHOSTS, MECHANICS, [])
    for (const day of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-12-24']) {
      for (const c of deck) {
        const q = questionForCard(c, { allGhosts: GHOSTS, mechanics: MECHANICS, day })
        if (q) keep(q)
      }
    }
    composed = [...out.values()].filter((q) => !/^q:(?:auth|fact|note|tf):/u.test(q.id) && !/^q:card:[mn]:/u.test(q.id))
  }, 120_000)

  it('« Me tester sur X » : dix questions, et X n’est pas d’office la bonne réponse', () => {
    let namedCount = 0
    let selfCount = 0
    for (const g of GHOSTS) {
      const runs = solo.get(g.id)!
      // le Mimic copie tout : il n'est jamais une mauvaise réponse, et ses questions à choix de noms seraient
      // gagnées d'avance ; il lui reste ses tests (deux énoncés différents), complétés de ses questions rédigées
      if (g.id === 'the-mimic') {
        for (const qs of runs) {
          expect(qs.length, g.id).toBeGreaterThanOrEqual(4)
          expect(new Set(qs.map((q) => q.prompt)).size, qs.map((q) => q.prompt).join(' | ')).toBe(qs.length)
        }
      } else for (const qs of runs) expect(qs.length, g.id).toBe(10)
      let n = 0
      let self = 0
      for (const q of runs.flat()) {
        if (!named(q)) continue
        n++
        // X est parmi les choix : la bonne réponse, ou une mauvaise d'une question sur une entité qu'on confond avec lui
        expect(q.choices.map((c) => c.id), q.id).toContain(g.id)
        if (q.correct[0] === g.id) self++
        else expect(q.ghostId, q.id).not.toBe(g.id)
      }
      if (n >= 40) {
        expect(self / n, `${g.id} : ${self}/${n}`).toBeGreaterThanOrEqual(0.12)
        expect(self / n, `${g.id} : ${self}/${n}`).toBeLessThanOrEqual(0.4)
      }
      namedCount += n
      selfCount += self
      // et des questions dont les choix sont des faits sur X : signes, nombres, résumés, tests, départages
      expect(runs.flat().some((q) => q.ghostId === g.id && !named(q)), g.id).toBe(true)
    }
    // répondre « X » à chaque fois ne rapporte pas plus que le hasard (une chance sur quatre)
    expect(selfCount / namedCount, `${selfCount}/${namedCount}`).toBeGreaterThanOrEqual(0.2)
    expect(selfCount / namedCount, `${selfCount}/${namedCount}`).toBeLessThanOrEqual(0.3)
    // une question rédigée qui nomme X parmi ses réponses (« Qui suspectes-tu ? ») n'entre pas dans sa série :
    // juste, il serait toujours la bonne réponse ; faux, jamais
    for (const g of GHOSTS) {
      for (let seed = 1; seed <= 8; seed++) {
        for (const q of buildQuiz({ topics: ['expert'], ghosts: [g], allGhosts: GHOSTS, mechanics: MECHANICS, count: 10, rng: createRng(seed) })) {
          for (const c of q.choices) expect(namesGhost(c.label, g), `${q.id} : ${c.label}`).toBe(false)
        }
      }
    }
  })

  it('« Me tester sur X » : ni « 50 % », ni « 1,7 m/s », ni X ne gagnent d’office', () => {
    const all = [...solo.values()].flat(2)
    for (const value of ['50\u00a0%', '1,7\u00a0m/s']) {
      const shown = all.filter((q) => q.choices.some((c) => c.label === value) && /^q:(?:san|spd):/u.test(q.id))
      const won = shown.filter((q) => rightOf(q).label === value)
      expect(shown.length, value).toBeGreaterThan(40)
      expect(won.length / shown.length, `${value} : ${won.length}/${shown.length}`).toBeLessThanOrEqual(0.4)
    }
    // « Laquelle de ces entités a un seuil de 50 %, comme une entité standard ? » ne porte pas sur X lui-même :
    // à 50 %, il ne pourrait jamais en être une mauvaise réponse
    for (const id of ['q:san:std', 'q:spd:std']) {
      let n = 0
      let focus = 0
      for (const [g, runs] of solo) {
        for (const q of runs.flat()) {
          if (q.id !== id) continue
          n++
          if (q.correct[0] === g) focus++
        }
      }
      expect(focus / Math.max(1, n), `${id} : ${focus}/${n}`).toBeLessThanOrEqual(0.35)
    }
  })

  it('une mauvaise réponse raccourcie garde les nombres qui la rendaient fausse', () => {
    const demon = 'L’autre peut chasser très tôt (70 %, et à n’importe quel niveau grâce à sa capacité), mais sans lien avec les flammes.'
    expect(keepsSense(demon, withoutAsides(demon))).toBe(false)
    expect(keepsSense('L’autre peut chasser tôt (65 %) en état agressif, mais jamais au-dessus.', 'L’autre peut chasser tôt en état agressif, mais jamais au-dessus.')).toBe(false)
    // un renvoi qui a perdu le nombre de sa proposition
    expect(keepsSense('Chasse à 1,7 m/s ; seuil 40 % · jamais au-dessus.', 'Chasse à 1,7 m/s ; jamais au-dessus.')).toBe(false)
    // « au-dessus du sol » ne renvoie à rien ; un aparté sans nombre peut partir
    expect(keepsSense('L’autre flotte au-dessus du sol (sans bruit).', 'L’autre flotte au-dessus du sol.')).toBe(true)
    expect(keepsSense('L’autre chasse dès 75 % (jeune) et ralentit en vieillissant.', 'L’autre chasse dès 75 % et ralentit en vieillissant.')).toBe(true)

    // les versions courtes qui perdent tous les nombres de la phrase entière (repérées par leur fin), sauf
    // si une autre fiche dit la même chose, entière et sans nombre
    const tail = (s: string) => s.replace(/[.\s]+$/u, '').slice(-30)
    const lost = new Set<string>()
    const whole = new Set<string>()
    for (const y of GHOSTS) {
      for (const c of y.confusions) {
        const z = getGhost(c.with)
        if (!z || z.id === y.id) continue
        const claim = partnerClaim(c.why, y, z)
        if (claim && !/\d/u.test(claim)) whole.add(tail(claim))
        if (/\d/u.test(claim) && !/\d/u.test(withoutAsides(claim)) && withoutAsides(claim).length >= 30) lost.add(tail(withoutAsides(claim)))
      }
      for (const t of y.keyTells) {
        if (!/\d/u.test(t)) whole.add(tail(t))
        for (const short of [withoutAsides(t), t.split(/\s+·\s+|\s*;\s+/u)[0], t.split(/(?<=[.!?])\s+(?=[\p{Lu}«\d])/u)[0]]) {
          if (short !== t && short.length >= 25 && /\d/u.test(t) && !/\d/u.test(short)) lost.add(tail(short))
        }
      }
    }
    for (const t of whole) lost.delete(t)
    expect(lost.size).toBeGreaterThan(0)
    let checked = 0
    for (const q of composed) {
      if (!/^q:(?:dist|sign-of|test-of):|^q:card:g:[^:]+:(?:tells|test:\d+)$/u.test(q.id)) continue
      const g = getGhost(q.ghostId!)!
      for (const c of wrongOf(q)) {
        checked++
        if (!/\d/u.test(c.label)) expect(lost.has(tail(c.label)), `${q.id} : ${c.label}`).toBe(false)
        // ni renvoi sans son nombre (« mais jamais au-dessus »)
        for (const part of c.label.split(/\s*(?:[;·:()]|[.!?…](?=\s|$))\s*/u)) {
          expect(/(?<!\p{L})(?:au-dessus|en dessous)(?!\s+d)/iu.test(part) && !/\d/u.test(part), `${q.id} : ${c.label}`).toBe(false)
        }
        // « peut chasser très tôt », sans nombre, est vrai de toute entité qui chasse au-dessus de 50 % (« le plus tôt
        // qu'un Démon pourrait chasser », dans un test d'encens, parle de secondes)
        if (Math.max(...thresholds(g)) > 50) {
          expect(/chass[^.;·]*(?<!\p{L})(?:tôt|précoce)(?!\p{L})(?!\s+qu)/iu.test(c.label) && !/\d\s?%/u.test(c.label), `${q.id} : ${c.label}`).toBe(false)
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('départager : aucune note à déchiffrer, chaque réponse nomme l’entité demandée', () => {
    let dist = 0
    for (const q of composed) {
      expect(q.note, q.id).toBeUndefined()
      if (!q.id.startsWith('q:dist:')) continue
      dist++
      const g = getGhost(q.ghostId!)!
      expect(q.prompt.startsWith(`Sans preuve, à quoi reconnais-tu ${le(g.name)} plutôt que `), q.id).toBe(true)
      for (const c of q.choices) expect(namesGhost(c.label, g), `${q.id} : ${c.label}`).toBe(true)
    }
    expect(dist).toBeGreaterThan(300)
  })

  it('aucune réponse composée ne commence par « Il » ou « Elle » : on ne saurait pas de qui elle parle', () => {
    let sentences = 0
    for (const q of composed) {
      if (named(q)) continue
      for (const c of q.choices) {
        sentences++
        expect(c.label, q.id).not.toMatch(/^(?:Il|Elle|Ils|Elles|Lui)\s(?!faut|y a|suffit)/u)
      }
    }
    expect(sentences).toBeGreaterThan(4000)
  })

  it('le Mimic n’est jamais un nom parmi les choix, et ne se trahit ni par « imitée » ni par « copie »', () => {
    // il copie tout : jamais une mauvaise réponse, il serait toujours la bonne. Ni en série, ni en révision
    let own = 0
    for (const q of composed) {
      if (named(q)) expect(q.choices.map((c) => c.id), q.id).not.toContain('the-mimic')
      expect(q.id, q.id).not.toMatch(/^q:card:g:the-mimic:/u)
      if (q.ghostId !== 'the-mimic') continue
      own++
      // ses questions à lui (ses tests) : des phrases, et rien qui souffle « Mimic » à qui lit l'anglais
      expect(named(q), q.id).toBe(false)
      expect(`${q.prompt} ${q.quote ?? ''}`, q.id).not.toMatch(/imit|copi/iu)
    }
    expect(own).toBeGreaterThan(0)
    // les séries sur plusieurs entités ne le proposent pas non plus
    for (let seed = 1; seed <= 20; seed++) {
      for (const q of buildQuiz({ topics: DEFAULT_TOPICS, ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 30, rng: createRng(seed * 13) })) {
        if (named(q)) expect(q.choices.map((c) => c.id), q.id).not.toContain('the-mimic')
      }
    }
  })

  it('« Lequel de ces signes… ? » : la bonne réponse n’a pas une seule jumelle parmi les mauvaises', () => {
    const opening = (s: string) =>
      s
        .toLocaleLowerCase('fr')
        .split(/[^\p{L}\d’']+/u)
        .filter(Boolean)
        .slice(0, 3)
        .join(' ')
    let n = 0
    for (const q of composed) {
      if (!q.prompt.startsWith('Lequel de ces signes')) continue
      n++
      const r = opening(rightOf(q).label)
      const starts = wrongOf(q).map((c) => opening(c.label))
      // « Plus actif quand plusieurs joueurs… » face à « Plus actif quand on parle… » : pile ou face
      const decoy = starts.some((s, i) => s !== r && starts.indexOf(s) !== i)
      expect(starts.filter((s) => s === r).length === 1 && !decoy, `${q.id} : ${q.choices.map((c) => c.label).join(' | ')}`).toBe(false)
    }
    expect(n).toBeGreaterThan(200)
    expect(composed.some((q) => /^q:(?:sign-of:|card:g:)(?:oni|yokai):/u.test(q.id) && q.prompt.startsWith('Lequel'))).toBe(true)
  })

  it('en nombres, la bonne valeur est aussi souvent la plus petite, la deuxième, la troisième que la plus grande', () => {
    const val = (l: string) => Number(l.replace(/[^\d,]/gu, '').replace(',', '.'))
    const ranks = (qs: Question[], prompt: string) => {
      const out = [0, 0, 0, 0]
      for (const q of qs) {
        if (!q.prompt.startsWith(prompt) || q.choices.length !== 4 || !q.choices.every((c) => /^\d/u.test(c.label))) continue
        const sorted = q.choices.map((c) => val(c.label)).sort((a, b) => a - b)
        out[sorted.indexOf(val(rightOf(q).label))]++
      }
      return out
    }
    // le quiz sur toutes les entités et les cartes, tels qu'on les rencontre : chaque occurrence compte
    const asked: Question[] = []
    for (let seed = 1; seed <= 300; seed++) {
      asked.push(...buildQuiz({ topics: ['sanity', 'speed'], ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 12, rng: createRng(seed) }))
    }
    const deck = buildDeck(GHOSTS, MECHANICS, []).filter((c) => c.kind === 'sanity' || c.kind === 'speed')
    for (let d = 1; d <= 60; d++) {
      for (const c of deck) {
        const q = questionForCard(c, { allGhosts: GHOSTS, mechanics: MECHANICS, day: `2027-01-${d}` })
        if (q) asked.push(q)
      }
    }
    // une série sur une seule entité pose sa question en nombres une fois
    const one = [...solo.values()].flat(2)
    for (const prompt of ['Quel est le seuil', 'Quelle est la vitesse']) {
      for (const [where, qs, lo, hi] of [
        ['quiz et cartes', asked, 0.2, 0.3],
        ['séries sur une entité', one, 0.15, 0.35],
      ] as const) {
        const r = ranks(qs, prompt)
        const total = r.reduce((a, b) => a + b, 0)
        expect(total, `${prompt} (${where})`).toBeGreaterThan(150)
        for (const k of r) {
          expect(k / total, `${prompt} (${where}) : ${r.join('/')}`).toBeGreaterThanOrEqual(lo)
          expect(k / total, `${prompt} (${where}) : ${r.join('/')}`).toBeLessThanOrEqual(hi)
        }
      }
    }
  })

  it('« Me tester sur X » se compose sans faire attendre, même sur le Poltergeist', () => {
    // ses signes parlent tous d'objets : il faut une mauvaise réponse qui en parle aussi, et il y en a peu.
    // Chercher les groupes sans elle, puis les refuser un à un, coûtait plus d'une demi-seconde par série
    const polt = getGhost('poltergeist')!
    const run = (topics: QuizTopic[], seed: number) => {
      const t = performance.now()
      const qs = buildQuiz({ topics, ghosts: [polt], allGhosts: GHOSTS, mechanics: MECHANICS, count: 30, rng: createRng(seed) })
      return { ms: performance.now() - t, n: qs.length }
    }
    run(['behavior'], 1)
    for (const topics of [['behavior'], ['zero']] as QuizTopic[][]) {
      const runs = [2, 3, 4, 5, 6].map((seed) => run(topics, seed))
      const ms = runs.map((r) => r.ms).sort((a, b) => a - b)
      expect(ms[2], `${topics} : ${ms.map((x) => x.toFixed(0)).join(' / ')} ms`).toBeLessThan(300)
      if (topics[0] === 'behavior') for (const r of runs) expect(r.n).toBe(30)
    }
  })

  it('warmQuiz prépare les séries par étapes, sans rien changer aux questions', () => {
    // une autre liste (mêmes fiches) : rien n'est encore prêt pour elle
    const [cold, warm] = [[...GHOSTS], [...GHOSTS]]
    let steps = 0
    expect(warmQuiz(warm, () => steps++ < 3)).toBe(false)
    expect(warmQuiz(warm)).toBe(true)
    // déjà prête : chaque étape ne coûte plus rien
    const t = performance.now()
    expect(warmQuiz(warm)).toBe(true)
    expect(performance.now() - t).toBeLessThan(50)
    for (const [ghosts, seed] of [[GHOSTS, 1], [[getGhost('kormos')!], 2], [[getGhost('poltergeist')!], 3]] as const) {
      const quiz = (all: Ghost[]) =>
        buildQuiz({ topics: DEFAULT_TOPICS, ghosts: ghosts === GHOSTS ? all : [...ghosts], allGhosts: all, mechanics: MECHANICS, count: 20, rng: createRng(seed) })
      expect(quiz(warm)).toEqual(quiz(cold))
    }
    const card = buildDeck(GHOSTS, MECHANICS, []).find((c) => c.id === 'g:spirit:spd')!
    const ctx = (all: Ghost[]) => ({ allGhosts: all, mechanics: MECHANICS, day: '2026-11-01' })
    expect(questionForCard(card, ctx(warm))).toEqual(questionForCard(card, ctx([...GHOSTS])))
  })
})

describe('rien ne se devine sans savoir : ni la liste, ni la carte d’avant, ni le nom, ni la fréquence', () => {
  const named = (q: Question) => q.choices.every((c) => getGhost(c.id) && c.label === getGhost(c.id)!.name)
  const deck = buildDeck(GHOSTS, MECHANICS, [])

  it('« les moins maîtrisées » : la bonne réponse n’est pas le seul nom de la liste parmi les choix', () => {
    let n = 0
    let lone = 0
    for (let seed = 1; seed <= 120; seed++) {
      const rng = createRng(seed * 31337)
      const pool = [...GHOSTS].sort(() => rng() - 0.5).slice(0, 6)
      const ids = new Set(pool.map((g) => g.id))
      for (const q of buildQuiz({ topics: DEFAULT_TOPICS, ghosts: pool, allGhosts: GHOSTS, mechanics: MECHANICS, count: 20, rng: createRng(seed * 7 + 1) })) {
        if (!named(q)) continue
        n++
        const listed = q.choices.filter((c) => ids.has(c.id))
        if (listed.length === 1 && q.correct.includes(listed[0].id)) lone++
      }
    }
    expect(n).toBeGreaterThan(800)
    expect(lone / n, `${lone}/${n}`).toBeLessThanOrEqual(0.3)
  }, 60_000)

  it('révision : les nouvelles cartes viennent de plusieurs entités, et deux cartes d’une entité ne se suivent pas', () => {
    const unseen = unseenCards(deck, {}, initialState(T0).settings)
    const first = pickNewCards(unseen, 12)
    expect(first).toHaveLength(12)
    expect(new Set(first.map((c) => c.ghostId)).size).toBeGreaterThanOrEqual(4)
    const state = { ...initialState(T0), onboarded: true }
    const queue = buildReviewQueue(state, deck, T0)
    for (let i = 0; i < queue.length; i++) {
      for (let j = Math.max(0, i - SAME_GHOST_GAP); j < i; j++) expect(queue[j].ghostId, `${queue.map((c) => c.id).join(' ')}`).not.toBe(queue[i].ghostId)
    }
    // même jour, même ordre ; un autre jour, un autre ordre
    expect(buildReviewQueue(state, deck, T0 + 3_600_000).map((c) => c.id)).toEqual(queue.map((c) => c.id))
    const later = { ...state, cards: Object.fromEntries(queue.map((c) => [c.id, schedule(undefined, 4, T0)])) }
    const a = buildReviewQueue(later, deck, T0 + 4 * DAY).map((c) => c.id)
    const b = buildReviewQueue(later, deck, T0 + 5 * DAY).map((c) => c.id)
    expect(a.filter((id) => queue.some((c) => c.id === id))).not.toEqual(queue.map((c) => c.id).filter((id) => a.includes(id)))
    expect(b.length).toBeGreaterThan(0)
  })

  it('révision : les faits de mécanique se mêlent à la séance au lieu de l’ouvrir d’un bloc', () => {
    // réglages par défaut (12 nouvelles cartes par jour, mécaniques comprises), réponses justes à 85 %
    let state = { ...initialState(T0), onboarded: true }
    const rng = createRng(5)
    let mixed = 0
    for (let d = 0; d < 30; d++) {
      const now = T0 + d * DAY
      const queue = buildReviewQueue(state, deck, now)
      const ids = queue.map((c) => c.id).join(' ')
      for (let i = 0; i < queue.length; i++) {
        for (let j = Math.max(0, i - SAME_GHOST_GAP); j < i; j++) if (queue[i].ghostId) expect(queue[j].ghostId, `jour ${d} : ${ids}`).not.toBe(queue[i].ghostId)
      }
      const facts = queue.map((c) => (c.deck === 'mechanics' ? 'M' : 'g')).join('')
      const m = facts.split('M').length - 1
      if (m >= 10 && queue.length - m >= 10) {
        mixed++
        // ni une longue suite de faits, ni une première moitié de séance faite surtout de faits
        expect(Math.max(...(facts.match(/M+/gu) ?? ['']).map((s) => s.length)), `jour ${d} : ${facts}`).toBeLessThanOrEqual(12)
        const half = facts.slice(0, Math.ceil(facts.length / 2))
        expect((half.split('M').length - 1) / half.length, `jour ${d} : ${facts}`).toBeLessThanOrEqual(m / facts.length + 0.2)
      }
      const cards = { ...state.cards }
      const log = [...state.log]
      for (const c of queue) {
        const g = rng() < 0.85 ? 3 : 1
        cards[c.id] = schedule(cards[c.id], g, now)
        log.push({ id: c.id, t: now, g, isNew: !state.cards[c.id] })
      }
      state = { ...state, cards, log }
    }
    expect(mixed).toBeGreaterThanOrEqual(5)
  })

  it('révision : la note du coach ne souffle pas la carte suivante', () => {
    const base = initialState(T0)
    const profile = { ...base.profile, name: 'Léa', coachName: 'Ryz', role: 'student' as const }
    for (const g of GHOSTS) {
      const notes: CoachNote[] = [{ id: 'c1', createdAt: T0, updatedAt: T0, ghostId: g.id, title: 'Note du coach', body: 'texte', asCard: true, author: 'Ryz' }]
      const queue = buildReviewQueue({ ...base, onboarded: true, profile, notes }, buildDeck(GHOSTS, MECHANICS, notes), T0)
      expect(queue[0].id).toBe('n:c1')
      // sa correction nomme l'entité : la carte d'après n'a pas cette entité pour réponse
      const next = queue.slice(1, 1 + SAME_GHOST_GAP)
      expect(next.map((c) => c.ghostId), `${g.id} : ${queue.slice(0, 5).map((c) => c.id).join(' ')}`).not.toContain(g.id)
    }
  })

  it('révision : une même question ne revient pas pour une autre entité dans la journée', () => {
    // les quatre premières entités sont standard : leurs seuils se demandent tous pareil (« … de 50 % … ? »)
    expect(new Set(deck.filter((c) => c.kind === 'sanity').map(askKey)).size).toBeLessThan(deck.filter((c) => c.kind === 'sanity').length)
    let state = { ...initialState(T0), onboarded: true }
    for (let d = 0; d < 30; d++) {
      const now = T0 + d * DAY
      const due = new Set(deck.filter((c) => state.cards[c.id] && state.cards[c.id].due <= now).map((c) => c.id))
      const queue = buildReviewQueue(state, deck, now)
      const fresh = queue.filter((c) => !due.has(c.id))
      const keys = fresh.map(askKey).filter(Boolean)
      // rien ne reste bloqué : chaque jour découvre sa part ; une carte n'attend que si sa question est déjà posée
      const unseen = unseenCards(deck, state.cards, state.settings)
      if (unseen.length) expect(fresh.length, `jour ${d}`).toBeGreaterThan(0)
      if (fresh.length < Math.min(state.settings.newPerDay, unseen.length)) {
        for (const c of unseen.filter((x) => !fresh.includes(x))) expect(keys, `jour ${d} : ${c.id}`).toContain(askKey(c))
      }
      expect(new Set(keys).size, `jour ${d} : ${keys.join(' / ')}`).toBe(keys.length)
      // la question d'une carte due ne revient parmi les nouvelles que s'il ne reste rien d'autre
      const dueKeys = new Set(queue.filter((c) => due.has(c.id)).map(askKey).filter(Boolean))
      const others = unseenCards(deck, state.cards, state.settings).filter((c) => !askKey(c) || !dueKeys.has(askKey(c)))
      if (others.length >= state.settings.newPerDay) for (const k of keys) expect(dueKeys.has(k), `jour ${d} : ${k}`).toBe(false)
      if (d === 0) {
        // la première séance : pas deux fois le même énoncé (avec sa citation)
        const asked = queue
          .map((c) => questionForCard(c, { allGhosts: GHOSTS, mechanics: MECHANICS, day: '2026-11-01', peers: sessionGhosts(queue) }))
          .filter((q): q is Question => !!q)
          .map((q) => `${q.prompt} ${q.quote ?? ''}`)
        expect(new Set(asked).size, asked.join(' / ')).toBe(asked.length)
      }
      // tout juste, en une fois
      state = { ...state, cards: { ...state.cards, ...Object.fromEntries(queue.map((c) => [c.id, schedule(state.cards[c.id], 3, now)])) }, log: [...state.log, ...queue.map((c) => ({ id: c.id, t: now, g: 3 as const, isNew: !state.cards[c.id] }))] }
    }
  }, 60_000)

  it('révision sur sept jours : la carte d’avant ne souffle pas la réponse', () => {
    let state = { ...initialState(T0), onboarded: true }
    const shown: { card: (typeof deck)[number]; q: Question | null }[] = []
    for (let d = 0; d < 7; d++) {
      let now = T0 + d * DAY
      const queue = buildReviewQueue(state, deck, now)
      const peers = sessionGhosts(queue)
      const day = new Date(now).toISOString().slice(0, 10)
      const rest = [...queue]
      const passes: Record<string, number> = {}
      while (rest.length) {
        const card = rest.shift()!
        const pass = passes[card.id] ?? 0
        shown.push({ card, q: questionForCard(card, { allGhosts: GHOSTS, mechanics: MECHANICS, day: pass ? `${day}#${pass}` : day, peers }) })
        // tout juste : la carte s'espace ; en apprentissage, elle repasse plus loin dans la séance (comme la page Réviser)
        const prev = state.cards[card.id]
        const next = schedule(prev, 3, now)
        state = { ...state, cards: { ...state.cards, [card.id]: next }, log: [...state.log, { id: card.id, t: now, g: 3, isNew: !prev }] }
        if (next.due - now < 20 * 60_000) {
          rest.splice(Math.min(rest.length, Math.max(3, Math.round((next.due - now) / 60_000))), 0, card)
          passes[card.id] = pass + 1
        }
        now += 20_000
      }
    }
    let n = 0
    let hinted = 0
    for (let i = 0; i < shown.length; i++) {
      const { q } = shown[i]
      if (!q || !named(q)) continue
      n++
      if (shown.slice(Math.max(0, i - 3), i).some((x) => x.card.ghostId === q.correct[0])) hinted++
    }
    expect(n).toBeGreaterThan(100)
    expect(hinted / n, `${hinted}/${n}`).toBeLessThanOrEqual(0.35)
  }, 60_000)

  it('révision : les mauvaises réponses viennent d’abord des autres entités de la séance', () => {
    const peers = ['spirit', 'wraith', 'phantom', 'poltergeist', 'banshee', 'mare', 'demon', 'yurei']
    const share = (withPeers: boolean) => {
      let n = 0
      let fromPeers = 0
      for (const day of ['2026-11-01', '2026-11-02', '2026-11-03']) {
        for (const c of deck.filter((x) => x.ghostId && peers.includes(x.ghostId))) {
          const q = questionForCard(c, { allGhosts: GHOSTS, mechanics: MECHANICS, day, ...(withPeers ? { peers } : {}) })
          if (!q || !named(q)) continue
          for (const x of q.choices) {
            if (x.id === c.ghostId) continue
            n++
            if (peers.includes(x.id)) fromPeers++
          }
        }
      }
      expect(n).toBeGreaterThan(100)
      return fromPeers / n
    }
    const [without, withPeers] = [share(false), share(true)]
    expect(withPeers, `${withPeers} (sans : ${without})`).toBeGreaterThanOrEqual(0.45)
    expect(withPeers).toBeGreaterThan(1.5 * without)
  })

  /** Le quiz sous toutes ses formes : sur toutes les entités, sur une seule, et les cartes. */
  let asked: Question[] = []
  beforeAll(() => {
    for (let seed = 1; seed <= 60; seed++) {
      asked.push(...buildQuiz({ topics: QUIZ_TOPICS.map((t) => t.id), ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 30, rng: createRng(seed * 104729) }))
    }
    for (const g of GHOSTS) {
      for (let seed = 1; seed <= 6; seed++) {
        asked.push(...buildQuiz({ topics: DEFAULT_TOPICS, ghosts: [g], allGhosts: GHOSTS, mechanics: MECHANICS, count: 10, rng: createRng(seed * 977 + g.id.length) }))
      }
    }
    for (let d = 1; d <= 12; d++) {
      for (const c of deck) {
        const q = questionForCard(c, { allGhosts: GHOSTS, mechanics: MECHANICS, day: `2027-02-${d}` })
        if (q) asked.push(q)
      }
    }
    asked = asked.filter((q) => !/^q:(?:auth|fact|note|tf):/u.test(q.id) && !/^q:card:[mn]:/u.test(q.id))
  }, 180_000)

  it('les choix d’entités sont leur nom seul, et le Mimic n’en fait jamais partie', () => {
    const names = asked.filter(named)
    expect(names.length).toBeGreaterThan(1000)
    for (const q of names) {
      expect(q.choices.map((c) => c.id), q.id).not.toContain('the-mimic')
      for (const c of q.choices) expect(c.label, q.id).not.toMatch(/[()]/u)
    }
  })

  it('chaque résumé de vitesse proposé est parfois la bonne réponse', () => {
    const qs = asked.filter((q) => q.prompt.startsWith('Quelle description correspond à la vitesse'))
    for (let seed = 1; seed <= 300; seed++) {
      qs.push(...buildQuiz({ topics: ['speed'], ghosts: GHOSTS, allGhosts: GHOSTS, mechanics: MECHANICS, count: 10, rng: createRng(seed * 4099) }).filter((q) => q.id.startsWith('q:spdsum:')))
    }
    const stat = new Map<string, { shown: number; right: number }>()
    for (const q of qs) {
      for (const c of q.choices) {
        const x = stat.get(c.label) ?? { shown: 0, right: 0 }
        x.shown++
        if (q.correct.includes(c.id)) x.right++
        stat.set(c.label, x)
      }
    }
    expect(qs.length).toBeGreaterThan(300)
    // « 1,7 m/s · 2,5 m/s si disjoncteur allumé… » (Djinn) comme « 1,0 m/s · 3,0 m/s en te détectant… » (Revenant)
    expect(stat.size).toBeGreaterThanOrEqual(8)
    for (const [label, { shown, right }] of stat) {
      expect(shown, label).toBeGreaterThanOrEqual(60)
      expect(right / shown, `${label} : ${right}/${shown}`).toBeGreaterThanOrEqual(0.15)
    }
  })

  it('« Quel test confirme X ? » : la seule réponse qui nomme une entité n’est pas d’office la bonne', () => {
    const qs = asked.filter((q) => /^q:(?:test-of|card:g:[^:]+:test:\d+)/u.test(q.id) && !named(q))
    let decisive = 0
    for (const q of qs) {
      const naming = q.choices.filter((c) => GHOSTS.some((o) => namesGhost(c.label, o)))
      if (naming.length === 1 && q.correct.includes(naming[0].id)) decisive++
      // jamais le nom de X parmi les réponses
      for (const c of q.choices) expect(namesGhost(c.label, getGhost(q.ghostId!)!), `${q.id} : ${c.label}`).toBe(false)
    }
    expect(qs.length).toBeGreaterThan(100)
    expect(decisive / qs.length, `${decisive}/${qs.length}`).toBeLessThanOrEqual(0.3)
  })

  it('le nom de l’entité (« Poltergeist », « Fantôme »…) ne désigne pas la bonne réponse', () => {
    const HINTS: Record<string, RegExp> = {
      poltergeist: /(?<!\p{L})(?:objets?|lance|lancent|projet\p{L}*)(?!\p{L})/iu,
      banshee: /(?<!\p{L})(?:cris?|chant\p{L}*)(?!\p{L})/iu,
      shade: /silhouette|(?<!\p{L})noire?(?!\p{L})/iu,
      'the-twins': /(?<!\p{L})deux(?!\p{L})|simultan/iu,
      phantom: /dispar|invisib/iu,
      mare: /(?<!\p{L})(?:noir|sombre|obscur)/iu,
      obake: /(?<!\p{L})forme|modèle|transform/iu,
    }
    let checked = 0
    for (const q of asked) {
      const re = q.ghostId && HINTS[q.ghostId]
      if (!re || named(q) || !/^q:(?:dist|sign-of|test-of):|^q:card:g:[^:]+:(?:tells|test:\d+)$/u.test(q.id)) continue
      checked++
      const g = getGhost(q.ghostId!)!
      const has = q.choices.map((c) => re.test(redactGhostName(c.label, g)))
      const alone = has.filter(Boolean).length === 1 && q.correct.includes(q.choices[has.indexOf(true)].id)
      expect(alone, `${q.id} : ${q.choices.map((c) => c.label).join(' | ')}`).toBe(false)
    }
    expect(checked).toBeGreaterThan(30)
  })
})
