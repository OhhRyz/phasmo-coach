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
    // ce qui sert encore sans preuve n'est jamais marqué : chasses, vitesses, encens, portées, objets maudits, santé ;
    // sauf un fait qui ne parle que des preuves du journal (le vœu « Je souhaite avoir de l'information », qui en retire une)
    for (const t of MECHANICS.topics.filter((t) => t.id !== 'equipement' && t.id !== 'preuves')) {
      for (const f of t.facts.filter((x) => x.evidence)) expect(plain(f.a), f.id).toMatch(/\bpreuves?\b/i)
    }
    // jamais posé en question (ni révisé, ni au quiz) : un fait « bon à savoir » n'a pas de QCM
    for (const f of MECHANICS.topics.flatMap((t) => t.facts).filter((x) => x.evidence)) {
      expect(f.choices, f.id).toBeUndefined()
      expect(f.answer, f.id).toBeUndefined()
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

describe('mécaniques en QCM', () => {
  /** Le QCM d'un fait, lu tel qu'il est écrit dans mechanics.json. */
  type Mcq = { id: string; a: string; evidence?: boolean; choices?: unknown; answer?: unknown }
  const retained = MECHANICS.topics.flatMap((t) => t.facts as Mcq[]).filter((f) => !f.evidence)
  const choicesOf = (f: Mcq) => f.choices as string[]
  const rightOf = (f: Mcq) => choicesOf(f)[f.answer as number]
  const wrongOf = (f: Mcq) => choicesOf(f).filter((_, i) => i !== f.answer)
  const numbers = (s: string) => plain(s).match(/\d+(?:,\d+)?/g) ?? []
  /** « 2,5 m/s » → « # m/s » : la forme d'une réponse chiffrée. */
  const shape = (s: string) => plain(s).replace(/\d+(?:,\d+)?/g, '#')
  const same = (s: string) => plain(s).toLowerCase().replace(/\s+/g, ' ').trim()

  it('pose chaque fait retenu en QCM : 4 réponses distinctes et le rang de la bonne', () => {
    expect(retained.length).toBeGreaterThan(0)
    for (const f of retained) {
      expect(Array.isArray(f.choices), f.id).toBe(true)
      const choices = choicesOf(f)
      expect(choices, f.id).toHaveLength(4)
      for (const c of choices) {
        expect(typeof c, f.id).toBe('string')
        expect(c.trim().length, f.id).toBeGreaterThan(0)
        // le style des questions rédigées des fiches : pas de point final
        expect(c, `${f.id} → ${c}`).not.toMatch(/\.$/)
        // jamais de réponse fourre-tout
        expect(plain(c), `${f.id} → ${c}`).not.toMatch(/toutes (les|ces) réponses|aucune (de ces|des) réponses|tout est vrai/i)
      }
      expect(new Set(choices.map(same)).size, f.id).toBe(4)
      expect(Number.isInteger(f.answer), f.id).toBe(true)
      expect(f.answer as number, f.id).toBeGreaterThanOrEqual(0)
      expect(f.answer as number, f.id).toBeLessThan(4)
    }
  })

  it('a pour bonne réponse une version courte de la réponse rédigée', () => {
    for (const f of retained) {
      const right = rightOf(f)
      for (const w of wrongOf(f)) expect(same(w), f.id).not.toBe(same(right))
      // ses nombres sont ceux de la réponse rédigée
      for (const n of numbers(right)) expect(numbers(f.a), `${f.id} → ${right}`).toContain(n)
      // une question fermée : la bonne réponse dit oui ou non comme la réponse rédigée, les leurres aussi
      const yes = /^(Oui|Non)\b/.exec(plain(f.a))?.[1]
      if (yes) {
        expect(plain(right).startsWith(yes), `${f.id} → ${right}`).toBe(true)
        for (const c of choicesOf(f)) expect(plain(c), f.id).toMatch(/^(Oui|Non)\b/)
        expect(choicesOf(f).filter((c) => plain(c).startsWith(yes)).length, f.id).toBeLessThan(4)
      }
    }
  })

  it('propose des leurres de même forme que la bonne réponse', () => {
    for (const f of retained) {
      const right = rightOf(f)
      // une réponse chiffrée (« 2,5 m/s », « 26 actions ») : quatre valeurs différentes dans la même unité
      if (/^#(?: [^\s,]+){0,2}$/.test(shape(right))) {
        for (const c of choicesOf(f)) expect(shape(c), `${f.id} → ${c}`).toBe(shape(right))
        expect(new Set(choicesOf(f).map((c) => numbers(c)[0])).size, f.id).toBe(4)
      }
      // la bonne réponse ne se repère pas à sa longueur
      const longest = Math.max(...wrongOf(f).map((c) => plain(c).length))
      expect(plain(right).length, `${f.id} → ${right}`).toBeLessThanOrEqual(longest * 1.5 + 4)
    }
    // ni à sa place : chaque rang porte la bonne réponse d'au moins un fait sur six
    for (let i = 0; i < 4; i++) expect(retained.filter((f) => f.answer === i).length, `rang ${i}`).toBeGreaterThanOrEqual(retained.length / 6)
  })

  it('ne fait relever aucune preuve dans les réponses proposées, hormis les orbes du Mimic', () => {
    const notOrbs = (s: string) => evidenceCited(s).filter((re) => re !== String(ORBS))
    for (const f of retained) for (const c of choicesOf(f)) expect(notOrbs(c), `${f.id} → ${c}`).toEqual([])
  })
})

/**
 * Les QCM écrits à la main (questions des fiches, faits de mécaniques retenus) : quelqu'un qui ne connaît
 * pas le jeu ne doit pas repérer la bonne réponse à sa forme. Mêmes type, longueur et structure pour les
 * quatre réponses ; le détail en plus va dans l'explication.
 */
describe('QCM rédigés : des réponses de même forme', () => {
  type Mcq = { id: string; q: string; choices: string[]; answer: number }
  const fromGhosts: Mcq[] = GHOSTS.flatMap((g) => g.quiz.map((q, i) => ({ id: `${g.id}#${i}`, q: q.q, choices: q.choices, answer: q.answer })))
  const fromFacts: Mcq[] = MECHANICS.topics
    .flatMap((t) => t.facts)
    .filter((f) => !f.evidence && Array.isArray(f.choices) && typeof f.answer === 'number')
    .map((f) => ({ id: f.id, q: f.q, choices: f.choices as string[], answer: f.answer as number }))
  const all = [...fromGhosts, ...fromFacts]
  const label = (q: Mcq) => `${q.id} : ${q.choices.join(' | ')}`
  const size = (s: string) => [...plain(s)].length
  const shape = (s: string) => plain(s).replace(/\d+(?:,\d+)?/g, '#')
  /** « 50 % », « 1,7 m/s », « 26 actions » : une valeur et son unité, rien d'autre. */
  const isValue = (s: string) => /^#(?: [^\s,]+){0,2}$/.test(shape(s))
  /** une valeur mesurée (« 8 s », « 25 % », « 3 m ») ; « Patient 07 » reste un nom */
  const VALUE = /\d+(?:,\d+)?\s?(?:%|m\/s|m|s|min|minutes?|secondes?|fois|°C)(?![\p{L}])/u
  /** une nuance : « toujours », « seulement », « environ »… */
  const HEDGE =
    /(?<![\p{L}])(?:toujours|jamais|seulement|uniquement|forcément|sûrement|parfois|rarement|souvent|surtout|généralement|en général|habituellement|en moyenne|environ)(?![\p{L}])/iu
  /** « n'accélère pas », « sans accélération » : le sens de l'accélération en ligne de vue */
  const NO_LOS = /n'accélère (?:pas|jamais|plus)|sans (?:aucune |la moindre |jamais )?accél[ée]r|aucune accélération/iu
  const POLARITY = /^(Oui|Non|Vrai|Faux)\b/
  const NEGATION = /^Ce n'est pas\b/
  /** « X, mais Y », « X, même Y », « X, car Y », « X, pas Y », « même sans… » : une réponse en deux temps, qui nuance */
  const CONCESSION = /,\s*(?:mais|même|comme|car|pas)(?![\p{L}])|(?<![\p{L}])même (?:sans|en|si)(?![\p{L}])/iu
  /** Ce qui se voit d'un coup d'œil : la seule réponse qui l'a (ou la seule qui ne l'a pas) se remarque. */
  const MARKS: [string, RegExp][] = [
    ['parenthèse', /\(/],
    ['« · »', /·/],
    ['« : »', /:/],
    ['« ; »', /;/],
    ['guillemets', /[«»]/],
    ['valeur chiffrée', VALUE],
    ['pourcentage', /%/],
    ['vitesse', /m\/s/],
    ['nuance', HEDGE],
    ['ligne de vue', NO_LOS],
    ['« Ce n’est pas »', NEGATION],
    // une réponse nuancée en deux temps (« Il disparaît, mais… », « …, même sans te voir ») parmi des réponses d'un seul tenant
    ['nuance en deux temps', CONCESSION],
    // « Ce n'est pas une Dayan » parmi trois « Ce n'est pas un … »
    ['« une » (féminin)', /^(?:Ce n'est pas|C'est forcément|C'est sûrement) une\b/],
  ]
  /** une virgule de phrase (pas celle de « 1,7 ») : deux propositions là où les autres réponses n'en ont qu'une */
  const COMMA = /,(?!\d)/
  const uniqueLongest = (q: Mcq) => {
    const lengths = q.choices.map(size)
    const max = Math.max(...lengths)
    return lengths[q.answer] === max && lengths.filter((x) => x === max).length === 1
  }
  const uniqueShortest = (q: Mcq) => {
    const lengths = q.choices.map(size)
    const min = Math.min(...lengths)
    return lengths[q.answer] === min && lengths.filter((x) => x === min).length === 1
  }
  /** Les mots qui portent le sens (sans articles, prépositions, pronoms ni élisions) : « 1,7 » reste un seul mot. */
  const STOP = new Set(
    'les des une un le la de du et en au aux à a est son sa ses il elle on qui que quoi quel quelle quels quelles dans sur pour par pas ne plus avec tu te ton ta tes se ce cette ces y ou entité entités chasse chasses'.split(' '),
  )
  const words = (s: string) =>
    new Set(
      plain(s)
        .toLowerCase()
        .replace(/(?<![\p{L}])(?:l|d|s|n|qu|t|j|c|m|jusqu|lorsqu|puisqu)'/gu, ' ')
        .replace(/[«»()·:;.?!']/g, ' ')
        .replace(/,(?!\d)/g, ' ')
        .split(/\s+/)
        .filter((w) => w && !STOP.has(w)),
    )
  /** Les noms des entités tels qu'ils s'écrivent dans une réponse (« Le Spectre », « Spectre »), avec leur majuscule. */
  const NAMES = GHOSTS.map((g) => {
    const names = [g.name, g.name.replace(/^(?:Les |Le |La |L['’])/u, '')].map((n) => plain(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return { id: g.id, re: new RegExp(`(?<![\\p{L}])(?:${names.join('|')})(?![\\p{L}])`, 'u') }
  })

  it('couvre les questions des fiches et les faits retenus', () => {
    expect(fromGhosts.length).toBeGreaterThanOrEqual(GHOSTS.length * 5)
    expect(fromFacts.length).toBeGreaterThan(0)
  })

  it('a des réponses de longueur voisine', () => {
    for (const q of all) {
      const lengths = q.choices.map(size)
      const [min, max] = [Math.min(...lengths), Math.max(...lengths)]
      // la plus longue ne dépasse pas 1,6 fois la plus courte ; entre réponses courtes (20 caractères au plus), 12 d'écart au plus
      expect(max <= min * 1.6 || (max <= 20 && max - min <= 12), label(q)).toBe(true)
    }
  })

  it('donne les réponses chiffrées dans la même unité, avec des valeurs différentes', () => {
    for (const q of all) {
      if (!q.choices.some(isValue)) continue
      expect(new Set(q.choices.map(shape)).size, label(q)).toBe(1)
      expect(new Set(q.choices.map((c) => plain(c).match(/\d+(?:,\d+)?/)?.[0])).size, label(q)).toBe(q.choices.length)
    }
  })

  it('n’isole aucune réponse par sa structure', () => {
    for (const q of all) {
      // des valeurs nues (« 50 % », « 1,7 m/s ») : seule la valeur change
      if (q.choices.every(isValue)) continue
      const choices = q.choices.map(plain)
      const n = choices.length
      // ni la seule à porter une parenthèse, un « · », des guillemets, un chiffre, une nuance, un « n'accélère pas »…, ni la seule à s'en passer
      for (const [name, re] of MARKS) {
        const k = choices.filter((c) => re.test(c)).length
        expect(k === 1 || (n > 2 && k === n - 1), `${label(q)} (${name} : ${k}/${n})`).toBe(false)
      }
      // « Oui, … » / « Non, … » : toutes les réponses commencent ainsi, autant de oui que de non
      if (choices.some((c) => POLARITY.test(c))) {
        for (const c of choices) expect(c, label(q)).toMatch(POLARITY)
        const yes = choices.filter((c) => /^(?:Oui|Vrai)\b/.test(c)).length
        if (n % 2 === 0) expect(yes, `${label(q)} (oui/non)`).toBe(n / 2)
      }
    }
  })

  it('ne fait pas de la bonne réponse celle qui parle de l’entité la plus citée', () => {
    for (const q of all) {
      const choices = q.choices.map(plain)
      // les entités citées dans certaines réponses seulement, et dans combien
      const counts = NAMES.map(({ id, re }) => ({ id, re, k: choices.filter((c) => re.test(c)).length })).filter((x) => x.k && x.k < choices.length)
      if (!counts.length) continue
      const top = Math.max(...counts.map((x) => x.k))
      const leaders = counts.filter((x) => x.k === top)
      if (top < 2 || leaders.length > 1) continue
      expect(leaders[0].re.test(choices[q.answer]), `${label(q)} (${leaders[0].id} cité ${top} fois)`).toBe(false)
    }
  })

  it('ne fait pas de la bonne réponse le mélange des autres', () => {
    // chaque mauvaise réponse change un morceau de la bonne : la bonne est alors celle qui partage le plus avec les autres
    for (const set of [fromGhosts, fromFacts]) {
      let medoids = 0
      let rightMedoids = 0
      for (const q of set) {
        const sets = q.choices.map(words)
        const shared = sets.map((w, i) => sets.reduce((sum, o, j) => (j === i ? sum : sum + [...w].filter((x) => o.has(x)).length), 0))
        const others = shared.filter((_, i) => i !== q.answer)
        expect(shared[q.answer] - Math.max(...others), `${label(q)} (mots partagés : ${shared.join('/')})`).toBeLessThan(2)
        const best = Math.max(...shared)
        if (shared.filter((x) => x === best).length > 1) continue
        medoids++
        if (shared[q.answer] === best) rightMedoids++
      }
      // la réponse « au centre » des autres n'est la bonne qu'au hasard (une fois sur quatre), pas plus d'une fois sur trois
      expect(rightMedoids, `${rightMedoids} sur ${medoids}`).toBeLessThanOrEqual(Math.max(2, medoids * 0.35))
    }
  })

  it('ne fait pas de la bonne réponse la seule à reprendre la question', () => {
    for (const q of all) {
      const asked = words(q.q)
      const echo = q.choices.map((c) => [...words(c)].filter((w) => w.length > 3 && asked.has(w)).length)
      const others = echo.filter((_, i) => i !== q.answer)
      expect(echo[q.answer] > Math.max(...others), `${label(q)} (mots de la question : ${echo.join('/')})`).toBe(false)
    }
  })

  it('ne fait de la bonne réponse ni la plus longue, ni la plus courte', () => {
    for (const set of [fromGhosts, fromFacts]) {
      // seule réponse la plus longue (ou la plus courte) dans 30 % des questions au plus (le hasard en donne environ 25 %)
      const longest = set.filter(uniqueLongest)
      expect(longest.length, longest.map((q) => q.id).join(', ')).toBeLessThanOrEqual(set.length * 0.3)
      const shortest = set.filter(uniqueShortest)
      expect(shortest.length, shortest.map((q) => q.id).join(', ')).toBeLessThanOrEqual(set.length * 0.3)
    }
  })

  it('ne fait pas de la bonne réponse, d’une question à l’autre, la seule en deux propositions', () => {
    // la seule réponse avec une virgule (ou la seule sans) : la bonne une fois sur quatre au hasard, pas plus de trois fois sur dix
    let odd = 0
    const right: string[] = []
    for (const q of all) {
      if (q.choices.every(isValue)) continue
      const choices = q.choices.map(plain)
      const n = choices.length
      const k = choices.filter((c) => COMMA.test(c)).length
      if (k !== 1 && !(n > 2 && k === n - 1)) continue
      odd++
      if (COMMA.test(choices[q.answer]) === (k === 1)) right.push(q.id)
    }
    expect(right.length, `${right.length} sur ${odd} : ${right.join(', ')}`).toBeLessThanOrEqual(Math.max(2, odd * 0.3))
  })

  it('place la bonne réponse à tous les rangs', () => {
    for (const set of [fromGhosts, fromFacts]) {
      for (let i = 0; i < 4; i++) expect(set.filter((q) => q.answer === i).length, `rang ${i}`).toBeGreaterThanOrEqual(set.length / 6)
    }
  })
})

/**
 * D'une question à l'autre : une stratégie qui ignore le jeu (« prends toujours le Non », « prends l'élimination
 * de l'entité de la fiche », « prends 1,7 m/s avec accélération ») ne gagne pas plus souvent qu'au hasard.
 */
describe('QCM rédigés : aucun motif d’une question à l’autre', () => {
  const POSITIVE = /^(?:Oui|Vrai)\b/
  const NEGATIVE = /^(?:Non|Faux)\b/
  /** autant de « oui » que de « non » parmi les bonnes réponses, à 15 points près */
  const balanced = (yes: number, n: number, what: string) => {
    expect(n, what).toBeGreaterThanOrEqual(6)
    expect(yes / n, `${what} : ${yes} positives sur ${n}`).toBeGreaterThanOrEqual(0.35)
    expect(yes / n, `${what} : ${yes} positives sur ${n}`).toBeLessThanOrEqual(0.65)
  }
  const authored = GHOSTS.flatMap((g) => g.quiz.map((q, i) => ({ g, id: `${g.id}#${i}`, ...q })))

  it('ne répond pas presque toujours « Non » ou « Faux » aux questions fermées des fiches', () => {
    const polar = authored.filter((q) => q.choices.every((c) => POSITIVE.test(plain(c)) || NEGATIVE.test(plain(c))))
    balanced(polar.filter((q) => POSITIVE.test(plain(q.choices[q.answer]))).length, polar.length, 'questions des fiches')
  })

  it('ne répond pas presque toujours « Non » aux faits posés en question fermée', () => {
    const polar = MECHANICS.topics.flatMap((t) => t.facts).filter((f) => !f.evidence && /^(?:Oui|Non)\b/.test(plain(f.a)))
    balanced(polar.filter((f) => /^Oui\b/.test(plain(f.a))).length, polar.length, 'faits des mécaniques')
  })

  it('ne donne pas presque toujours « faux » aux affirmations des mécaniques', () => {
    const claims = MECHANICS.trueFalse.filter((x) => !x.evidence)
    balanced(claims.filter((x) => x.answer).length, claims.length, 'vrai ou faux')
  })

  /** « Ce n'est pas un Esprit », « C'est forcément un Démon » → l'entité nommée (son identifiant), ou le libellé s'il n'en nomme aucune */
  const bare = (s: string) => plain(s).replace(/^(?:Les |Le |La |L')/u, '')
  const VERDICT = /^(?:Ce n'est pas|C'est (?:forcément|sûrement)) (?:une? |le |la |les |l')(.+)$/u
  const named = (c: string) => {
    const name = VERDICT.exec(plain(c))?.[1] ?? c
    return GHOSTS.find((g) => bare(g.name) === name)?.id ?? name
  }
  const grids = authored.filter((q) => q.choices.every((c) => VERDICT.test(plain(c))))

  it('n’écarte pas toujours l’entité de la fiche dans les grilles « Ce n’est pas un … »', () => {
    expect(grids.length).toBeGreaterThanOrEqual(6)
    for (const q of grids) for (const c of q.choices) expect(GHOST_ORDER, `${q.id} → ${c}`).toContain(named(c))
    // « prends l'élimination de l'entité de la fiche » ne gagne pas partout : d'autres grilles écartent l'entité qu'on confond avec elle
    const own = grids.filter((q) => /^Ce n'est pas\b/u.test(plain(q.choices[q.answer])) && named(q.choices[q.answer]) === q.g.id)
    expect(own.length / grids.length, `${own.length} sur ${grids.length} : ${own.map((q) => q.id).join(', ')}`).toBeLessThanOrEqual(0.7)
    // ni une entité « bouche-trou » : mauvaise réponse de trois grilles ou plus, elle est la bonne d'au moins une
    const wrongIn = new Map<string, string[]>()
    const rightIn = new Set<string>()
    for (const q of grids) {
      q.choices.forEach((c, i) => {
        const e = named(c)
        if (i === q.answer) rightIn.add(e)
        else wrongIn.set(e, [...(wrongIn.get(e) ?? []), q.id])
      })
    }
    for (const [e, ids] of wrongIn) {
      if (ids.length >= 3) expect(rightIn.has(e), `${e}, mauvaise réponse de ${ids.join(', ')}, n'est jamais la bonne`).toBe(true)
    }
  })

  it('ne fait pas toujours gagner la même vitesse, ni « avec accélération », dans les grilles de vitesse', () => {
    // « 1,7 m/s avec accélération standard en ligne de vue » | « 1,5 m/s sans aucune accélération… » | …
    const GRID = /^(\d+(?:,\d+)?) m\/s (avec|sans)\b/u
    const facts = MECHANICS.topics.flatMap((t) => t.facts).filter((f) => !f.evidence && Array.isArray(f.choices))
    const qs = [...authored, ...facts.map((f) => ({ choices: f.choices as string[], answer: f.answer as number }))].filter(
      (q) => q.choices.length >= 4 && q.choices.every((c) => GRID.test(plain(c))),
    )
    expect(qs.length).toBeGreaterThanOrEqual(2)
    const answers = qs.map((q) => GRID.exec(plain(q.choices[q.answer]))!)
    expect(new Set(answers.map((m) => m[2])).size, 'avec / sans').toBe(2)
    expect(new Set(answers.map((m) => m[1])).size, 'vitesse').toBeGreaterThan(1)
  })

  type Mcq = { id: string; q: string; choices: string[]; answer: number }
  const retainedFacts: Mcq[] = MECHANICS.topics
    .flatMap((t) => t.facts)
    .filter((f) => !f.evidence && Array.isArray(f.choices) && typeof f.answer === 'number')
    .map((f) => ({ id: f.id, q: f.q, choices: f.choices as string[], answer: f.answer as number }))
  const sets: [string, Mcq[]][] = [
    ['questions des fiches', authored],
    ['faits des mécaniques', retainedFacts],
  ]

  it('ne place pas toujours la bonne valeur au même rang, du plus petit au plus grand', () => {
    // « 40 % | 50 % | 60 % | 75 % », « À moins de 5 m | … » : une seule valeur par réponse, la même forme autour.
    // « Évite les extrêmes » ou « prends la deuxième plus grande » ne gagne pas plus souvent qu'au hasard :
    // une fois rangées, la bonne valeur est la plus petite, la deuxième, la troisième ou la plus grande de 15 à 35 % du temps
    const shape = (s: string) => plain(s).replace(/\d+(?:,\d+)?/g, '#')
    for (const [what, set] of sets) {
      const ranks = [0, 0, 0, 0]
      for (const q of set) {
        if (q.choices.length !== 4 || new Set(q.choices.map(shape)).size !== 1) continue
        const found = q.choices.map((c) => plain(c).match(/\d+(?:,\d+)?/g) ?? [])
        if (!found.every((v) => v.length === 1)) continue
        const values = found.map((v) => Number(v[0].replace(',', '.')))
        if (new Set(values).size !== 4) continue
        ranks[[...values].sort((a, b) => a - b).indexOf(values[q.answer])]++
      }
      const n = ranks.reduce((a, b) => a + b, 0)
      expect(n, what).toBeGreaterThanOrEqual(20)
      for (let i = 0; i < 4; i++) {
        expect(ranks[i] / n, `${what} : rang ${i + 1} sur 4 (${ranks.join('/')})`).toBeGreaterThanOrEqual(0.15)
        expect(ranks[i] / n, `${what} : rang ${i + 1} sur 4 (${ranks.join('/')})`).toBeLessThanOrEqual(0.35)
      }
    }
  })

  it('ne met pas la bonne réponse, plus souvent qu’au hasard, dans la paire de réponses presque identiques', () => {
    // « Il reste visible plus longtemps… » à côté de « Il reste invisible plus longtemps… » : quand deux réponses se
    // ressemblent nettement plus que les deux autres, « prends l'une des deux » ne doit gagner qu'une fois sur deux
    const tokens = (s: string) =>
      new Set(
        plain(s)
          .toLowerCase()
          .replace(/'/g, ' ')
          .replace(/[«»(),·:;.?!]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 1),
      )
    const overlap = (a: string, b: string) => {
      const [x, y] = [tokens(a), tokens(b)]
      const common = [...x].filter((w) => y.has(w)).length
      return common / (x.size + y.size - common)
    }
    const bare = /^\d+(?:,\d+)?\s?\S*$/
    for (const [what, set] of sets) {
      const twins: string[] = []
      const right: string[] = []
      for (const q of set) {
        const c = q.choices.map(plain)
        if (c.length !== 4 || c.every((x) => bare.test(x))) continue
        const pairs: [number, number, number][] = []
        for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) pairs.push([overlap(c[a], c[b]), a, b])
        pairs.sort((x, y) => y[0] - x[0])
        const [[top, a, b], [second]] = pairs
        const [k, l] = [0, 1, 2, 3].filter((i) => i !== a && i !== b)
        if (top < 0.4 || top - overlap(c[k], c[l]) < 0.2 || top - second < 0.1) continue
        twins.push(q.id)
        if (a === q.answer || b === q.answer) right.push(q.id)
      }
      expect(right.length, `${what} : ${right.length} sur ${twins.length} (${right.join(', ')})`).toBeLessThanOrEqual(Math.max(2, twins.length * 0.6))
    }
  })

  it('cite aussi en mauvaise réponse toute entité qui sert de bonne réponse', () => {
    // le Mimic seulement en bonne réponse (« C'est un Mimic », « Le Mimic ») : le nommer suffisait à gagner
    const NAMES = GHOSTS.map((g) => {
      const names = [g.name, g.name.replace(/^(?:Les |Le |La |L['’])/u, '')].map((n) => plain(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      return { id: g.id, re: new RegExp(`(?<![\\p{L}])(?:${names.join('|')})(?![\\p{L}])`, 'u') }
    })
    const rightIn = new Map<string, string[]>()
    const wrongIn = new Set<string>()
    // les questions posées au quiz : ni la question ni la bonne réponse ne parlent de preuve
    for (const q of authored.filter((x) => !evidenceNames(x.q) && !evidenceNames(x.choices[x.answer]))) {
      q.choices.forEach((c, i) => {
        const cited = NAMES.filter((n) => n.re.test(plain(c)))
        if (cited.length !== 1) return
        if (i === q.answer) rightIn.set(cited[0].id, [...(rightIn.get(cited[0].id) ?? []), q.id])
        else wrongIn.add(cited[0].id)
      })
    }
    expect(rightIn.size).toBeGreaterThanOrEqual(GHOSTS.length / 2)
    for (const [id, ids] of rightIn) expect(wrongIn.has(id), `${id}, bonne réponse de ${ids.join(', ')}, n'est jamais une mauvaise réponse`).toBe(true)
  })
})
