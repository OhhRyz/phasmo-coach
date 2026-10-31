import { describe, expect, it } from 'vitest'
import { GHOST_ORDER, GHOSTS, MECHANICS } from '.'
import { EVIDENCE_IDS } from './evidence'

/** Noms des preuves tels qu'ils s'écrivent dans les fiches (« EMF 2 », ou « EMF » seul, restent des interactions). */
const EVIDENCE_NAMES = [/\bEMF (niveau )?5\b/i, /D\.O\.T\.S/i, /\bUV\b|ultraviolet/i, /glaciales?\b/i, /\borbes?\b/i, /écriture/i, /spirit box/i]
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/\u2019/g, "'")
const evidenceNames = (s: string) => EVIDENCE_NAMES.filter((re) => re.test(plain(s))).length

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
        }
        if (h.low >= 0 && h.high >= 0) expect(h.low).toBeLessThanOrEqual(h.high)
        expect(h.high).toBeLessThanOrEqual(100)
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

      // le journal du jeu donne les preuves : les questions portent sur ce qui sert sans preuve
      it('a au moins 5 questions rédigées, aucune sur ses preuves', () => {
        expect(g.quiz.length).toBeGreaterThanOrEqual(5)
        for (const q of g.quiz) {
          // « Quelles sont les preuves… », « Quelle preuve est garantie… » ; « à 0 preuve » reste permis
          expect(plain(q.q).replace(/\b(0|sans) preuves?\b/gi, ''), q.q).not.toMatch(/\bpreuves?\b/i)
          // « Tu as EMF 5, UV et D.O.T.S : quelle entité ? »
          expect(evidenceNames(q.q), q.q).toBeLessThan(2)
          // réponses en forme de liste de preuves
          for (const c of q.choices) expect(evidenceNames(c), `${q.q} → ${c}`).toBeLessThan(2)
        }
      })

      it('a des signes clés qui décrivent un comportement, pas ses preuves', () => {
        for (const t of g.keyTells) {
          expect(evidenceNames(t), t).toBeLessThan(2)
          expect(plain(t), t).not.toMatch(/garanti/i)
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

  it('marque d’un booléen les faits utiles seulement pour relever les preuves', () => {
    type Flagged = { id: string; evidence?: unknown }
    const items: Flagged[] = [...MECHANICS.topics.flatMap((t) => t.facts), ...MECHANICS.trueFalse]
    const flagged = items.filter((x) => x.evidence !== undefined)
    for (const x of flagged) expect(typeof x.evidence, x.id).toBe('boolean')
    expect(flagged.some((x) => x.evidence === true)).toBe(true)
    // ce qui sert encore sans preuve n'est jamais marqué : chasses, vitesses, encens, portées, objets maudits, santé
    for (const t of MECHANICS.topics.filter((t) => t.id !== 'equipement' && t.id !== 'preuves')) {
      for (const f of t.facts as Flagged[]) expect(f.evidence, f.id).toBeUndefined()
    }
  })
})
