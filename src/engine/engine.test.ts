import { describe, expect, it } from 'vitest'
import { GHOSTS, MECHANICS, getGhost } from '../data'
import type { Ghost } from '../data/types'
import { buildDeck, mechanicsCards, mentionsEvidence } from './cards'
import { EMPTY_FILTER, filterGhosts, matchesEvidence, type FilterState } from './filter'
import { redactGhostName, speedClasses } from './format'
import { buildQuiz, confusionWithoutEvidence, isCorrect, QUIZ_TOPICS, type Question, type QuizTopic } from './quiz'
import { buildReviewQueue, ghostMastery, learnedCount } from './progress'
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
import { adoptCoach, coachNameOf, isCoachNote } from './notes'
import { hydrate, initialState } from '../store/schema'
import { cardMastery, isDue, schedule } from './srs'
import { speedToBpm, bpmToSpeed } from './audio'

const DAY = 86_400_000
const T0 = new Date('2026-10-31T10:00:00').getTime()

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

  /** Toutes les questions d'un thème pour une entité, sur plusieurs tirages. */
  const allFor = (g: Ghost, topic: QuizTopic, prefix: string): Question[] => {
    const out = new Map<string, Question>()
    for (let seed = 1; seed <= 6; seed++) {
      for (const q of buildQuiz({ topics: [topic], ghosts: [g], allGhosts: GHOSTS, mechanics: MECHANICS, count: 10, rng: createRng(seed * 101) })) {
        if (q.id.startsWith(prefix)) out.set(q.id + q.choices.map((c) => c.id).join(), q)
      }
    }
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
    // ce qui se joue sans preuve reste
    expect(mentionsEvidence('Partie à 0 preuve : tu vois des orbes dans la pièce favorite.')).toBe(false)
    expect(mentionsEvidence('Dans quelles conditions entends-tu la respiration du Deogen à la Spirit Box ?')).toBe(false)
    expect(mentionsEvidence('Un EMF 2 apparaît près de toi sans interaction.')).toBe(false)
  })

  it('retire des confusions ce qui parle de preuves', () => {
    const a = confusionWithoutEvidence('UV + D.O.T.S en commun. Le Fantôme disparaît en photo ; il ne cible personne. 3e preuve : Spirit Box vs orbes.')
    expect(a).toMatch(/^Le Fantôme disparaît en photo\s; il ne cible personne\.$/u)
    const b = confusionWithoutEvidence('Même D.O.T.S + glaciales, mais le Yurei a les orbes au lieu de l’écriture ; il peut claquer une porte.')
    expect(b).toBe('Il peut claquer une porte.')
    expect(confusionWithoutEvidence('Mêmes UV et écriture.')).toBe('')
  })

  it('« Comment distinguer X de Y sans preuve ? » : une seule bonne réponse, sans nom qui la souffle', () => {
    const covered = new Set<string>()
    for (const g of GHOSTS) {
      for (const q of allFor(g, 'zero', 'q:dist:')) {
        covered.add(g.id)
        const x = getGhost(q.id.split(':')[2])!
        expect(q.prompt, q.id).toContain(x.name.replace(/^(Le|Les|La) /, ''))
        expect(q.correct, q.id).toEqual([g.id])
        expect(q.choices.length, q.id).toBe(4)
        expect(new Set(q.choices.map((c) => c.label)).size, q.id).toBe(4)
        for (const c of q.choices) {
          // l'entité dont parle chaque réponse devient « l’autre » : aucun nom ne désigne la bonne
          const about = getGhost(c.id)!
          expect(leaks(c.label, about), `${q.id}: ${c.label}`).toBe(false)
          expect(leaks(c.label, g), `${q.id}: ${c.label}`).toBe(false)
          expect(leaks(c.label, x), `${q.id}: ${c.label}`).toBe(false)
          expect(mentionsEvidence(c.label), `${q.id}: ${c.label}`).toBe(false)
          if (c.id !== g.id) {
            // une mauvaise réponse parle d'une autre entité confondue avec x, jamais du Mimic
            expect(x.confusions.map((k) => k.with), q.id).toContain(c.id)
            expect(c.id).not.toBe('the-mimic')
          }
        }
      }
    }
    expect(covered.size).toBeGreaterThanOrEqual(20)
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
