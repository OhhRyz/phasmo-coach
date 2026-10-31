import { describe, expect, it } from 'vitest'
import { GHOSTS, MECHANICS, getGhost } from '../data'
import type { Ghost } from '../data/types'
import { buildDeck } from './cards'
import { EMPTY_FILTER, filterGhosts, matchesEvidence, type FilterState } from './filter'
import { redactGhostName, speedClasses } from './format'
import { buildQuiz, isCorrect, QUIZ_TOPICS } from './quiz'
import { createRng } from './random'
import { DIFFICULTIES, generateScenario, pickVisibleEvidence, scoreScenario } from './scenario'
import { decodePayload, encodePayload } from './share'
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
      for (const n of [g.name, g.nameEn]) {
        if (n.length > 3) expect(q.quote.toLowerCase(), q.id).not.toContain(n.toLowerCase())
      }
    }
  })
})

describe('mise en situation', () => {
  it('respecte le nombre de preuves et la preuve forcée', () => {
    const rng = createRng(42)
    for (const g of GHOSTS) {
      for (const d of DIFFICULTIES) {
        const s = generateScenario(g, d.id, rng)
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

  it('pickVisibleEvidence garde la preuve forcée', () => {
    const g: Ghost = { ...GHOSTS[0], evidence: ['emf', 'uv', 'freezing'], forcedEvidence: 'freezing' }
    for (let i = 0; i < 20; i++) expect(pickVisibleEvidence(g, 1, createRng(i))).toEqual(['freezing'])
  })

  it('le score récompense les enquêtes courtes', () => {
    expect(scoreScenario(2, 10, 0, true)).toBeGreaterThan(scoreScenario(9, 10, 0, true))
    expect(scoreScenario(2, 10, 1, true)).toBeLessThan(scoreScenario(2, 10, 0, true))
    expect(scoreScenario(2, 10, 0, false)).toBe(0)
  })
})

describe('outils', () => {
  it('masque le nom de l’entité avec une grammaire correcte', () => {
    const demon = { ...GHOSTS[0], name: 'Démon', nameEn: 'Demon' }
    expect(redactGhostName('La vitesse du Démon est normale', demon)).toBe('La vitesse de cette entité est normale')
    expect(redactGhostName('Le Demon peut chasser', demon)).toBe('cette entité peut chasser')
    const onryo = { ...GHOSTS[0], name: 'Onryo', nameEn: 'Onryo' }
    expect(redactGhostName("l'Onryo souffle une flamme", onryo)).toBe('cette entité souffle une flamme')
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
    expect(deck.filter((c) => c.kind === 'evidence').length).toBe(GHOSTS.length)
  })
})
