import { describe, expect, it } from 'vitest'
import { GHOSTS, JOURNAL_GHOSTS, getGhost } from '../data'
import {
  CHOSEN_IDS,
  FAMILY_COPY,
  FAMILY_ORDER,
  rowSpeedText,
  SANITY_CHOSEN_IDS,
  SANITY_FAMILY_COPY,
  SANITY_FAMILY_ORDER,
  sanityFamilies,
  sanityFamily,
  sanityFamilyNote,
  speedFamilies,
  speedFamily,
  speedFamilyNote,
  speedWord,
} from './families'
import { copiesBehavior } from './filter'
import { NBSP, speedText } from './format'

/**
 * Le classement du coach (18 novembre 2026), tel qu'il l'a validé : quatre cases, une seule par entité.
 * Si une fiche change de vitesse, ce tableau se relit avec lui : il ne se déduit pas des nombres.
 */
const BOARD = {
  lente: ['aswang', 'dayan', 'hantu', 'obambo', 'the-twins'],
  rapide: ['deildegast', 'deogen', 'moroi', 'revenant', 'thaye'],
  variable: ['gallu', 'jinn', 'kormos', 'raiju', 'the-mimic'],
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
    // le Moroï, rangé parmi les rapides par le coach : sa fiche le fait partir de 1,5 m/s tant que la santé mentale est haute
    expect(speedFamilyNote(getGhost('moroi')!)).toBe('plus lent quand la santé mentale est haute')
    expect(getGhost('moroi')!.speed.min).toBeLessThan(1.7)
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
    expect(speedWord(getGhost('moroi')!)).toBe('rapide')
    expect(speedWord(getGhost('jinn')!)).toBe('variable')
    expect(rowSpeedText(getGhost('the-mimic')!)).toBe('copie l’entité imitée')
  })
})

/**
 * Le classement des seuils de chasse, tel que le coach l'a validé (18 novembre 2026) : quatre cases, une seule par
 * entité. Comme celui des vitesses, il se relit avec lui si une fiche change : il ne se déduit pas des nombres.
 */
const SANITY_BOARD = {
  tot: ['demon', 'onryo', 'thaye'],
  tard: ['deogen', 'shade'],
  variable: ['banshee', 'dayan', 'gallu', 'kormos', 'mare', 'obambo', 'raiju', 'the-mimic', 'yokai'],
  normale: ['aswang', 'deildegast', 'goryo', 'hantu', 'jinn', 'moroi', 'myling', 'obake', 'oni', 'phantom', 'poltergeist', 'revenant', 'spirit', 'the-twins', 'wraith', 'yurei'],
} as const

describe('Les quatre familles de seuil de chasse : le classement du coach', () => {
  it('quatre cases, dans cet ordre : chassent tôt, chassent tard, seuil qui change, normales', () => {
    expect(SANITY_FAMILY_ORDER).toEqual(['tot', 'tard', 'variable', 'normale'])
    expect(SANITY_FAMILY_ORDER.map((f) => SANITY_FAMILY_COPY[f].title)).toEqual(['Chassent tôt', 'Chassent tard', 'Seuil qui change', 'Normales'])
    expect(SANITY_FAMILY_ORDER.map((f) => SANITY_FAMILY_COPY[f].def)).toEqual([`au-dessus de 50${NBSP}%`, `sous 50${NBSP}%`, 'selon la situation', `toujours 50${NBSP}%`])
    for (const f of SANITY_FAMILY_ORDER) for (const t of Object.values(SANITY_FAMILY_COPY[f])) expect(t).not.toMatch(/'|\d (?:m|%)/)
  })

  it('chaque entité a une case et une seule, celle que le coach lui a donnée', () => {
    const boxes = sanityFamilies(JOURNAL_GHOSTS)
    expect(boxes.map((b) => b.id)).toEqual([...SANITY_FAMILY_ORDER])
    // dans l'ordre du journal du jeu (celui des noms anglais : le Cauchemar, « Mare », vient après le Kormos)
    for (const b of boxes) expect(b.ghosts.map((g) => g.id).sort(), b.id).toEqual([...SANITY_BOARD[b.id]].sort())
    for (const b of boxes) expect(b.ghosts, b.id).toEqual(JOURNAL_GHOSTS.filter((g) => sanityFamily(g) === b.id))
    const all = boxes.flatMap((b) => b.ghosts)
    expect(all).toHaveLength(GHOSTS.length)
    expect(new Set(all).size).toBe(GHOSTS.length)
    for (const id of SANITY_CHOSEN_IDS) expect(getGhost(id), id).toBeDefined()
  })

  it('la case ne contredit pas la fiche : tôt, un seuil habituel au-dessus de 50 % ; tard, tous ses seuils sous 50 % ; normale, seulement 50 %', () => {
    const sanity = (id: string) => getGhost(id)!.huntSanity
    for (const id of SANITY_BOARD.tot) expect(sanity(id).normal, id).toBeGreaterThan(50)
    for (const id of SANITY_BOARD.tard) {
      expect(sanity(id).normal, id).toBeLessThan(50)
      expect(sanity(id).high, id).toBeLessThan(50)
    }
    for (const id of SANITY_BOARD.normale) expect([sanity(id).low, sanity(id).normal, sanity(id).high], id).toEqual([50, 50, 50])
    // « seuil qui change » : plusieurs seuils sur la fiche, ou l'entité en copie une autre
    for (const id of SANITY_BOARD.variable) expect(copiesBehavior(getGhost(id)!) || sanity(id).low !== sanity(id).high, id).toBe(true)
    // et toute entité qui n'a que 50 % est bien normale
    for (const g of GHOSTS) if (!copiesBehavior(g) && g.huntSanity.low === 50 && g.huntSanity.high === 50) expect(sanityFamily(g), g.id).toBe('normale')
  })

  it('à côté du nom, le seuil de la fiche et ce qui le change : chaque pourcentage écrit vient de la fiche ; rien pour une entité normale', () => {
    const plain = (t: string) => t.replace(/[\u00a0\u202f]/gu, ' ')
    for (const g of GHOSTS) {
      const note = sanityFamilyNote(g)
      if (sanityFamily(g) === 'normale') {
        expect(note, g.id).toBeNull()
        continue
      }
      expect(note, g.id).toBeTruthy()
      // court (deux lignes au plus sur téléphone), sans apostrophe droite ni nombre décollé de son unité
      expect(note!.length, g.id).toBeLessThanOrEqual(64)
      expect(note!, g.id).not.toMatch(/'|\d (?:m|%)/)
      // chaque pourcentage de la note est écrit sur la fiche (résumé ou détails du seuil de chasse)
      const h = g.huntSanity
      const fiche = plain([h.summary, ...h.details].join(' '))
      const written = [...plain(note!).matchAll(/(\d+) %/gu)].map((m) => m[1])
      if (!copiesBehavior(g)) expect(written.length, g.id).toBeGreaterThan(0)
      for (const v of written) expect(fiche, `${g.id} : ${v} %`).toMatch(new RegExp(`(?<!\\d)${v} %`, 'u'))
    }
    expect(sanityFamilyNote(getGhost('demon')!)).toBe(`70${NBSP}% · à toute santé mentale avec sa capacité`)
    expect(sanityFamilyNote(getGhost('onryo')!)).toBe(`60${NBSP}% · à toute santé mentale après 3 flammes éteintes`)
    expect(sanityFamilyNote(getGhost('shade')!)).toBe(`35${NBSP}%`)
    expect(sanityFamilyNote(getGhost('mare')!)).toBe(`60${NBSP}% lumière éteinte · 40${NBSP}% allumée`)
    expect(sanityFamilyNote(getGhost('banshee')!)).toBe(`50${NBSP}% de sa cible, pas de l’équipe`)
    expect(sanityFamilyNote(getGhost('yokai')!)).toBe(`jusqu’à 80${NBSP}% si quelqu’un parle dans sa pièce`)
    expect(sanityFamilyNote(getGhost('the-mimic')!)).toBe('copie le seuil de l’entité imitée')
  })
})
