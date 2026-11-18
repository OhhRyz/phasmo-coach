import { describe, expect, it } from 'vitest'
import { GHOST_ORDER, GHOSTS, JOURNAL_COLUMNS, JOURNAL_GHOSTS, JOURNAL_ORDER, getGhost } from '.'

/**
 * Le journal du jeu, page « Preuves », tel que le coach l'a photographié en français le 18 novembre 2026 :
 * dix lignes de trois noms. L'app affiche les entités dans cet ordre, pour qu'elles soient à la même place.
 * Les noms s'écrivent comme dans le jeu en français, tréma de « Moroï » compris.
 */
const PHOTO: string[][] = [
  ['Aswang', 'Banshee', 'Dayan'],
  ['Deildegast', 'Démon', 'Deogen'],
  ['Gallu', 'Goryo', 'Hantu'],
  ['Djinn', 'Kormos', 'Cauchemar'],
  ['Moroï', 'Myling', 'Obake'],
  ['Obambo', 'Oni', 'Onryo'],
  ['Fantôme', 'Poltergeist', 'Raiju'],
  ['Revenant', 'Ombre', 'Esprit'],
  ['Thayé', 'Le Mimic', 'Les Jumeaux'],
  ['Spectre', 'Yokai', 'Yurei'],
]

describe('ordre du journal du jeu', () => {
  it('trois colonnes, dix lignes, et chaque nom à la place qu’il a sur la photo du journal', () => {
    expect(JOURNAL_COLUMNS).toBe(3)
    expect(JOURNAL_GHOSTS).toHaveLength(PHOTO.length * JOURNAL_COLUMNS)
    const rows: string[][] = []
    for (let i = 0; i < JOURNAL_GHOSTS.length; i += JOURNAL_COLUMNS) rows.push(JOURNAL_GHOSTS.slice(i, i + JOURNAL_COLUMNS).map((g) => g.name))
    expect(rows).toEqual(PHOTO)
  })

  it('les mêmes entités que l’ordre d’apprentissage, chacune une fois, et les mêmes objets que GHOSTS', () => {
    expect([...JOURNAL_ORDER].sort()).toEqual([...GHOST_ORDER].sort())
    expect(new Set(JOURNAL_ORDER).size).toBe(JOURNAL_ORDER.length)
    expect(JOURNAL_GHOSTS.map((g) => g.id)).toEqual(JOURNAL_ORDER)
    for (const g of JOURNAL_GHOSTS) expect(getGhost(g.id)).toBe(g)
    expect(new Set(JOURNAL_GHOSTS)).toEqual(new Set(GHOSTS))
  })

  it('c’est l’ordre alphabétique des noms anglais : une nouvelle entité s’y range d’elle-même à sa place', () => {
    const byEnglishName = [...GHOSTS].sort((a, b) => (a.nameEn < b.nameEn ? -1 : a.nameEn > b.nameEn ? 1 : 0)).map((g) => g.id)
    expect(JOURNAL_ORDER).toEqual(byEnglishName)
  })

  it('l’ordre d’apprentissage, lui, ne change pas : la révision commence toujours par les entités classiques', () => {
    expect(GHOSTS.map((g) => g.id)).toEqual(GHOST_ORDER)
    expect(GHOST_ORDER.slice(0, 5)).toEqual(['spirit', 'wraith', 'phantom', 'poltergeist', 'banshee'])
  })
})
