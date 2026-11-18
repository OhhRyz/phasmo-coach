import { describe, expect, it } from 'vitest'
import { GHOSTS, JOURNAL_GHOSTS, getGhost } from '../data'
import { CHOSEN_IDS, FAMILY_COPY, FAMILY_ORDER, rowSpeedText, speedFamilies, speedFamily, speedFamilyNote, speedWord } from './families'
import { copiesBehavior } from './filter'
import { NBSP, speedText } from './format'

/**
 * Le classement du coach (18 novembre 2026), tel qu'il l'a validé : quatre cases, une seule par entité.
 * Si une fiche change de vitesse, ce tableau se relit avec lui : il ne se déduit pas des nombres.
 */
const BOARD = {
  lente: ['aswang', 'dayan', 'hantu', 'obambo', 'the-twins'],
  rapide: ['deildegast', 'deogen', 'revenant', 'thaye'],
  variable: ['gallu', 'jinn', 'kormos', 'moroi', 'raiju', 'the-mimic'],
  normale: ['banshee', 'demon', 'goryo', 'mare', 'myling', 'obake', 'oni', 'onryo', 'phantom', 'poltergeist', 'shade', 'spirit', 'wraith', 'yokai', 'yurei'],
} as const

const speeds = (id: string) => {
  const s = getGhost(id)!.speed
  return [s.min, s.max, s.alt].filter((v): v is number => v != null)
}

describe('Les quatre familles de vitesse : le classement du coach', () => {
  it('quatre cases, dans cet ordre : lentes, rapides, changent de vitesse, normales', () => {
    expect(FAMILY_ORDER).toEqual(['lente', 'rapide', 'variable', 'normale'])
    expect(FAMILY_ORDER.map((f) => FAMILY_COPY[f].title)).toEqual(['Lentes', 'Rapides', 'Changent de vitesse', 'Normales'])
    expect(FAMILY_ORDER.map((f) => FAMILY_COPY[f].def)).toEqual(['moins vite que la normale', 'plus vite que la normale', 'selon la situation', `toujours 1,7${NBSP}m/s`])
  })

  it('chaque entité a une case et une seule, celle que le coach lui a donnée', () => {
    const boxes = speedFamilies(JOURNAL_GHOSTS)
    expect(boxes.map((b) => b.id)).toEqual([...FAMILY_ORDER])
    for (const b of boxes) expect(b.ghosts.map((g) => g.id), b.id).toEqual(BOARD[b.id])
    // 30 entités, aucune oubliée, aucune en double
    const all = boxes.flatMap((b) => b.ghosts)
    expect(all).toHaveLength(GHOSTS.length)
    expect(new Set(all).size).toBe(GHOSTS.length)
    for (const g of GHOSTS) expect(boxes.filter((b) => b.ghosts.includes(g)), g.id).toHaveLength(1)
    // les entités que le coach a rangées lui-même existent toutes dans les fiches
    for (const id of CHOSEN_IDS) expect(getGhost(id), id).toBeDefined()
  })

  it('la case ne contredit pas la fiche : une lente a une vitesse sous 1,7 m/s, une rapide une vitesse au-dessus, une normale seulement 1,7 m/s', () => {
    for (const id of BOARD.lente) expect(Math.min(...speeds(id)), id).toBeLessThan(1.7)
    for (const id of BOARD.rapide) expect(Math.max(...speeds(id)), id).toBeGreaterThan(1.7)
    for (const id of BOARD.normale) {
      expect(speeds(id), id).toEqual([1.7])
      expect(getGhost(id)!.speed.isRange, id).toBe(false)
    }
    // « changent de vitesse » : plusieurs vitesses sur la fiche, ou l'entité en copie une autre
    for (const id of BOARD.variable) expect(copiesBehavior(getGhost(id)!) || new Set(speeds(id)).size > 1, id).toBe(true)
    // et toute entité qui n'a que 1,7 m/s est bien normale (le Mimic, qui copie, est à part)
    for (const g of GHOSTS) if (!copiesBehavior(g) && !g.speed.isRange && speeds(g.id).every((v) => v === 1.7)) expect(speedFamily(g), g.id).toBe('normale')
  })

  it('à côté du nom, quelques mots de la fiche ; rien pour une entité normale', () => {
    for (const g of GHOSTS) {
      const note = speedFamilyNote(g)
      if (speedFamily(g) === 'normale') expect(note, g.id).toBeNull()
      else {
        expect(note, g.id).toBeTruthy()
        // court (une ligne sur téléphone), sans apostrophe droite ni nombre décollé de son unité
        expect(note!.length, g.id).toBeLessThanOrEqual(64)
        expect(note!, g.id).not.toMatch(/'|\d (?:m|%)/)
      }
    }
    expect(speedFamilyNote(getGhost('thaye')!)).toBe('ralentit en vieillissant')
    expect(speedFamilyNote(getGhost('revenant')!)).toBe('lent tant qu’il ne te détecte pas')
    expect(speedFamilyNote(getGhost('hantu')!)).toBe('rapide dans le froid')
    expect(speedFamilyNote(getGhost('dayan')!)).toBe(`près d’elle : lente si tu restes immobile, rapide si tu bouges`)
    expect(speedFamilyNote(getGhost('kormos')!)).toBe(`accélère s’il te détecte à plus de 5${NBSP}m`)
    expect(speedFamilyNote(getGhost('the-mimic')!)).toBe('copie la vitesse de l’entité imitée')
  })

  it('le mot du registre est la famille ; après lui, les m/s de la fiche (le Mimic dit qu’il copie)', () => {
    for (const g of GHOSTS) {
      expect(speedWord(g), g.id).toBe(speedFamily(g))
      if (copiesBehavior(g)) expect(rowSpeedText(g), g.id).not.toMatch(/\d/)
      else expect(rowSpeedText(g), g.id).toBe(speedText(g))
    }
    expect(speedWord(getGhost('aswang')!)).toBe('lente')
    expect(speedWord(getGhost('spirit')!)).toBe('normale')
    expect(speedWord(getGhost('thaye')!)).toBe('rapide')
    expect(speedWord(getGhost('moroi')!)).toBe('variable')
    expect(rowSpeedText(getGhost('the-mimic')!)).toBe('copie l’entité imitée')
  })
})
