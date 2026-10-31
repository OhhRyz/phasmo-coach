import { describe, expect, it } from 'vitest'
import { GHOST_ORDER, GHOSTS, MECHANICS } from '.'
import { EVIDENCE_IDS } from './evidence'

/** Noms des preuves tels qu'ils s'écrivent dans les fiches (« EMF 2 », ou « EMF » seul, restent des interactions). */
const EVIDENCE_NAMES = [/\bEMF (niveau )?5\b/i, /D\.O\.T\.S/i, /\bUV\b|ultraviolet/i, /glaciales?\b/i, /\borbes?\b/i, /écriture/i, /spirit box/i]
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/\u2019/g, "'")
const evidenceNames = (s: string) => EVIDENCE_NAMES.filter((re) => re.test(plain(s))).length
const ORBS = EVIDENCE_NAMES[4]
/**
 * Les preuves qu'un texte fait relever (empreintes comprises). Les orbes restent permises pour le Mimic :
 * ses faux orbes se cherchent justement en partie à 0 preuve. Le livre d'écriture, lui, est un objet qu'on pose.
 */
const evidenceCited = (s: string, ghostId = '') => {
  const t = plain(s).replace(/livres? d'écriture/gi, 'livre')
  return [...EVIDENCE_NAMES, /empreintes?/i].filter((re) => !(ghostId === 'the-mimic' && re === ORBS) && re.test(t)).map(String)
}

/** « il », « elle », « lui » (comme les repère le quiz) : dans une citation, le pronom trahirait le genre de l'entité. */
const PRONOUN = /(?:^|[\s(])(?:ils?|elles?|lui)\b/i
/** Le nom commun qui souffle l'entité (le caviardage ne touche qu'au nom propre, avec sa majuscule). */
const OWN_NOUN: Record<string, RegExp> = {
  shade: /\bombres?\b/,
  'the-twins': /\bjumea(?:u|ux)\b/,
  phantom: /\bfantômes?\b/,
  spirit: /\besprits?\b/,
  wraith: /\bspectres?\b/,
  demon: /\bdémons?\b/,
  mare: /\bcauchemars?\b/,
  'the-mimic': /\bmimic\b/,
}

/** Ce que le quiz et les cartes citent sans nommer l'entité : signes et capacités « 0 preuve », tests et observations décisifs, profils. */
function quotable(g: (typeof GHOSTS)[number]): string[] {
  return [
    ...[...g.tells, ...g.abilities, ...g.behaviors].filter((t) => t.zeroEvidence).map((t) => t.text),
    ...g.confirmationTests.filter((t) => t.definitive && !t.requires).map((t) => t.text),
    ...g.observations.filter((o) => o.strength === 'definitive' && !o.requires).map((o) => o.text),
    g.speed.summary,
    g.huntSanity.summary,
  ]
}

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

      // la révision ne garde que ce qui sert sans preuve : les preuves restent visibles dans le codex
      it('a des signes clés et un résumé qui décrivent un comportement, pas ses preuves', () => {
        for (const t of g.keyTells) {
          expect(evidenceCited(t, g.id), t).toEqual([])
          expect(plain(t), t).not.toMatch(/garanti/i)
        }
        expect(evidenceCited(g.summary, g.id), g.summary).toEqual([])
      })

      it('a des signes et capacités « 0 preuve » qui ne passent par aucune preuve', () => {
        for (const t of [...g.tells, ...g.abilities, ...g.behaviors].filter((x) => x.zeroEvidence)) {
          expect(evidenceCited(t.text, g.id), t.text).toEqual([])
        }
      })

      it('signale la preuve dont dépend un test ou une observation', () => {
        const items = [...g.confirmationTests.filter((t) => t.definitive), ...g.observations]
        for (const t of items) {
          if (t.requires) {
            expect(EVIDENCE_IDS, t.text).toContain(t.requires)
            expect(g.evidence, t.text).toContain(t.requires)
            continue
          }
          // « Si tu trouves plus de preuves que… » : un test sur les preuves trouvées, déjà écarté du sans-preuve
          const first = plain(t.text).split(/(?<=[.!?])\s+/)[0].replace(/\b(?:0|sans|aucune) preuves?\b/gi, '')
          if (/\bpreuves?\b/i.test(first)) continue
          expect(evidenceCited(t.text, g.id), t.text).toEqual([])
        }
      })

      it('a des citations qui ne trahissent ni son genre ni son nom', () => {
        const bare = (n: string) => n.replace(/^(The |Le |Les |La |L['’])/, '')
        const names = [g.name, bare(g.name), g.nameEn, bare(g.nameEn)].filter((n) => n.length > 2)
        for (const t of quotable(g)) {
          const s = plain(t)
          expect(s, t).not.toMatch(PRONOUN)
          if (OWN_NOUN[g.id]) expect(s, t).not.toMatch(OWN_NOUN[g.id])
          // un libellé entre « » (média du journal…) garde son nom : il soufflerait la réponse
          for (const [, label] of s.matchAll(/«([^»]*)»/g)) for (const n of names) expect(label, t).not.toContain(n)
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

  // une carte ou une question qui fait relever une preuve (empreinte de l'Obake, neige et orbes, respiration
  // sous 5 °C) est « bon à savoir » ; seules les orbes restent, car le Mimic s'y repère même à 0 preuve
  it('ne retient aucun fait qui fait relever une preuve, hormis les orbes du Mimic', () => {
    const notOrbs = (s: string) => evidenceCited(s).filter((re) => re !== String(ORBS))
    for (const t of MECHANICS.topics) {
      for (const f of t.facts.filter((x) => !x.evidence)) expect(notOrbs(`${f.q} ${f.a}`), f.id).toEqual([])
    }
    for (const tf of MECHANICS.trueFalse.filter((x) => !x.evidence)) expect(notOrbs(tf.claim), tf.id).toEqual([])
  })
})
