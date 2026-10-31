import { describe, expect, it } from 'vitest'
import { GHOST_ORDER, GHOSTS, MECHANICS } from '.'
import { EVIDENCE_IDS } from './evidence'

/**
 * Validation du jeu de données : à relancer après chaque mise à jour des fiches
 * (`npm test`). Un échec ici signifie une fiche incohérente.
 */
describe('fiches des entités', () => {
  it('contient toutes les entités attendues, une seule fois', () => {
    const ids = GHOSTS.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(GHOST_ORDER, id).toContain(id)
  })

  for (const g of GHOSTS) {
    describe(g.id, () => {
      it('a exactement 3 preuves valides et distinctes', () => {
        expect(g.evidence).toHaveLength(3)
        expect(new Set(g.evidence).size).toBe(3)
        for (const e of g.evidence) expect(EVIDENCE_IDS).toContain(e)
        if (g.forcedEvidence) expect(g.evidence).toContain(g.forcedEvidence)
        if (g.fakeEvidence) expect(g.evidence).not.toContain(g.fakeEvidence)
      })

      it('a des vitesses et seuils cohérents', () => {
        const s = g.speed
        if (s.min >= 0) {
          expect(s.min).toBeGreaterThan(0)
          expect(s.min).toBeLessThan(6)
          if (s.max != null) expect(s.max).toBeGreaterThan(0)
          if (s.isRange) expect(s.max).not.toBeNull()
        }
        const h = g.huntSanity
        if (h.normal >= 0) {
          expect(h.low).toBeLessThanOrEqual(h.normal)
          expect(h.high).toBeGreaterThanOrEqual(h.normal)
          expect(h.high).toBeLessThanOrEqual(100)
        }
        expect(s.summary.length).toBeGreaterThan(0)
        expect(h.summary.length).toBeGreaterThan(0)
      })

      it('a des textes renseignés', () => {
        expect(g.name.length).toBeGreaterThan(1)
        expect(g.summary.length).toBeGreaterThan(10)
        expect(g.keyTells.length).toBeGreaterThanOrEqual(1)
      })

      it('a des questions rédigées valides', () => {
        for (const q of g.quiz) {
          expect(q.choices.length, q.q).toBeGreaterThanOrEqual(2)
          expect(q.answer, q.q).toBeGreaterThanOrEqual(0)
          expect(q.answer, q.q).toBeLessThan(q.choices.length)
          expect(new Set(q.choices).size, q.q).toBe(q.choices.length)
        }
      })

      it('a des confusions vers des entités existantes', () => {
        for (const c of g.confusions) {
          expect(GHOSTS.map((x) => x.id), c.with).toContain(c.with)
          expect(c.with).not.toBe(g.id)
        }
      })

      it('a des observations conformes', () => {
        for (const o of g.observations) {
          expect(['behavior', 'hunt', 'interaction', 'event', 'tell'], o.text).toContain(o.kind)
          expect(['definitive', 'strong', 'hint'], o.text).toContain(o.strength)
        }
      })
    })
  }

  it('chaque combinaison de 3 preuves est unique', () => {
    const seen = new Map<string, string>()
    for (const g of GHOSTS) {
      const key = [...g.evidence].sort().join('+')
      expect(seen.get(key), `${g.id} = ${seen.get(key)}`).toBeUndefined()
      seen.set(key, g.id)
    }
  })
})

describe('mécaniques', () => {
  it('a des identifiants uniques et des textes non vides', () => {
    const ids = [...MECHANICS.topics.flatMap((t) => t.facts.map((f) => f.id)), ...MECHANICS.trueFalse.map((t) => t.id)]
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of MECHANICS.topics) for (const f of t.facts) expect(f.q && f.a && f.text, f.id).toBeTruthy()
    for (const tf of MECHANICS.trueFalse) expect(typeof tf.answer).toBe('boolean')
  })
})
