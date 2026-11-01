import { describe, expect, it } from 'vitest'
import { GHOSTS } from '../data'
import { createRng } from '../engine/random'
import { allSpeeds, BASE_SPEED, classOf, EAR_ROUNDS, makeRounds, MIN_GAP, pickDistractors } from './earRounds'
import { expectedAnswers, sessionMinutes } from './reviewPlan'

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
  it('compte les réponses attendues, pas les cartes : 12 cartes nouvelles, environ 10 min', () => {
    expect(expectedAnswers(12, 0)).toBe(30)
    expect(sessionMinutes(12, 0)).toBe(10)
  })

  it('une carte due coûte moins qu’une nouvelle ; jamais moins d’une minute', () => {
    expect(sessionMinutes(0, 12)).toBeLessThan(sessionMinutes(12, 0))
    expect(sessionMinutes(0, 1)).toBe(1)
    expect(sessionMinutes(0, 0)).toBe(1)
  })
})
