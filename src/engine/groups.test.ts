import { describe, expect, it } from 'vitest'
import { GHOSTS, getGhost } from '../data'
import type { Ghost } from '../data/types'
import { speedFamily } from './families'
import { EMPTY_FILTER, filterGhosts } from './filter'
import { realSpeeds } from './speeds'
import { codexRankPath, nearStandardRanges, rankFromSearch, STANDARD_SANITY, STANDARD_SPEED, withRank } from './groups'

const ghost = (id: string): Ghost => getGhost(id)!

describe('Carnet de preuves : les plages que le critère « normale » garde', () => {
  it('leurs paliers passent par 1,7 m/s ou tout près (0,05 m/s au plus), sans en faire des entités normales', () => {
    expect(nearStandardRanges(GHOSTS).map((g) => g.id)).toEqual(['hantu', 'moroi', 'thaye', 'deildegast'])
    const nearest = (id: string) => Math.min(...realSpeeds(ghost(id)).map((v) => Math.abs(v - STANDARD_SPEED)))
    // 1,75 m/s entre 12 et 15 °C ; 1,66 et 1,749 m/s ; 1,7 m/s pile au 6e vieillissement ; 1,7 m/s pile au 13e objet
    expect(nearest('hantu')).toBeCloseTo(0.05, 6)
    expect(nearest('moroi')).toBeCloseTo(0.04, 6)
    expect(nearest('thaye')).toBe(0)
    expect(nearest('deildegast')).toBe(0)
    // le filtre les garde quand on coche « normale » (comme celui de tybayn)
    const kept = new Set(filterGhosts(GHOSTS, { ...EMPTY_FILTER, speed: ['normal'] }))
    for (const g of nearStandardRanges(GHOSTS)) {
      expect(kept.has(g), g.id).toBe(true)
      // et aucune n'est rangée parmi les normales dans le classement du coach
      expect(speedFamily(g), g.id).not.toBe('normale')
    }
  })
})

describe('Registre : valeurs standard et adresse', () => {
  it('les valeurs standard du jeu : 1,7 m/s et 50 % de santé mentale moyenne', () => {
    expect(STANDARD_SPEED).toBe(1.7)
    expect(STANDARD_SANITY).toBe(50)
  })

  it('?rang= : « vitesse » ou « seuil » ; absent ou inconnu, l’ordre du journal du jeu', () => {
    expect(rankFromSearch(new URLSearchParams(''))).toBe('numero')
    expect(rankFromSearch(new URLSearchParams('rang=vitesse'))).toBe('vitesse')
    expect(rankFromSearch(new URLSearchParams('rang=seuil'))).toBe('seuil')
    expect(rankFromSearch(new URLSearchParams('rang=nimporte'))).toBe('numero')
    expect(rankFromSearch(new URLSearchParams('rang=numero'))).toBe('numero')
  })

  it('changer d’ordre garde les autres paramètres ; l’ordre par défaut ne s’écrit pas', () => {
    expect(withRank(new URLSearchParams('a=1'), 'vitesse').toString()).toBe('a=1&rang=vitesse')
    expect(withRank(new URLSearchParams('a=1&rang=vitesse'), 'seuil').toString()).toBe('a=1&rang=seuil')
    expect(withRank(new URLSearchParams('a=1&rang=seuil'), 'numero').toString()).toBe('a=1')
    // sans toucher aux paramètres reçus
    const before = new URLSearchParams('rang=seuil')
    withRank(before, 'numero')
    expect(before.toString()).toBe('rang=seuil')
    expect(codexRankPath('vitesse')).toBe('/codex?rang=vitesse')
    expect(codexRankPath('seuil')).toBe('/codex?rang=seuil')
    expect(codexRankPath('numero')).toBe('/codex')
  })
})
