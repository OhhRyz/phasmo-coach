import { describe, expect, it } from 'vitest'
import { GHOSTS, MECHANICS } from '../data'
import { buildDeck, type Card } from '../engine/cards'
import { askKey, buildReviewQueue, unseenCards } from '../engine/progress'
import { createRng } from '../engine/random'
import { schedule } from '../engine/srs'
import { initialState } from '../store/schema'
import { allSpeeds, BASE_SPEED, classOf, EAR_ROUNDS, makeRounds, MIN_GAP, pickDistractors } from './earRounds'
import { expectedAnswers, sessionMinutes } from './reviewPlan'
import { LEARN_MORE, nextSession, stillToAsk } from './reviewSession'

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

describe('révision : la fiche de séance ne souffle pas la réponse', () => {
  const card = (id: string): Card => ({ id, deck: 'ghost', kind: 'test', ghostId: id, front: '', back: '', order: 0 })
  const [a, b, c] = ['a', 'b', 'c'].map(card)

  it('la carte en cours et celles qui suivent passeront encore : leur entité reste tue', () => {
    expect([...stillToAsk([a, b, c], null)]).toEqual(['a', 'b', 'c'])
  })

  it('une carte ratée qui revient trois cartes plus loin reste tue dans la fiche, même corrigée à l’écran', () => {
    expect(stillToAsk([a, b, c], { again: true }).has('a')).toBe(true)
  })

  it('une carte terminée pour la séance se nomme dès sa correction', () => {
    expect([...stillToAsk([a, b, c], { again: false })]).toEqual(['b', 'c'])
    expect(stillToAsk([a], { again: false }).size).toBe(0)
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
