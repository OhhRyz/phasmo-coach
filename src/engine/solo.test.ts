import { describe, expect, it } from 'vitest'
// solo.ts d'abord, avant quiz.ts : les deux modules s'importent l'un l'autre, et rien ne doit en dépendre au chargement
import { buildSoloQuiz, soloFacts, soloQuestion, soloSupply, soloType, SOLO_COUNT } from './solo'
import { GHOSTS, MECHANICS, getGhost } from '../data'
import { mentionsEvidence } from './cards'
import { buildQuiz, DEFAULT_TOPICS } from './quiz'
import { createRng } from './random'

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
    expect(direct.length).toBeGreaterThan(5)
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

  it('rien n’est jamais présenté comme faux pour le Mimic, ni comme l’excluant, hors de sa propre fiche', () => {
    const mimic = getGhost('the-mimic')!
    const types = new Set(soloSupply(mimic, GHOSTS).map((s) => s.type))
    for (const t of ['T2', 'T5', 'T6', 'T7a', 'T7b'] as const) expect(types.has(t), t).toBe(false)
    for (const s of soloSupply(mimic, GHOSTS)) {
      const q = soloQuestion(mimic, GHOSTS, s.id, createRng(3))
      // « Non, ça l'exclut » : seulement son propre test d'élimination (pas d'orbes dans la pièce favorite)
      if (q && s.type === 'T8' && q.correct[0] === 'excludes') expect(s.id).toMatch(/^q:constat:the-mimic:the-mimic:E\d+$/u)
    }
    // et il n'est jamais l'entité proche d'une autre copie
    for (const g of GHOSTS) for (const s of soloSupply(g, GHOSTS)) if (g.id !== 'the-mimic') expect(s.id.split(':').slice(2), s.id).not.toContain('the-mimic')
  })

  it('une question à deux noms propose X et une entité qu’on confond avec lui, jamais quatre noms', () => {
    const names = new Set(GHOSTS.map((g) => g.name))
    for (const id of ['deogen', 'thaye', 'kormos', 'oni']) {
      for (const seed of [1, 2, 3]) {
        for (const q of copies(id, seed * 77).first) {
          if (!q.choices.every((c) => names.has(c.label))) continue
          expect(soloType(q), q.id).toBe('T7b')
          expect(q.choices.map((c) => c.id).sort(), q.id).toEqual([id, q.id.split(':')[3]].sort())
        }
      }
    }
  })
})
