import { describe, expect, it } from 'vitest'
import { GHOSTS, getGhost } from '../data'
import type { Ghost } from '../data/types'
import { speedFamily } from './families'
import { copiesBehavior, EMPTY_FILTER, filterGhosts } from './filter'
import { NBSP, sanityClasses, type SanityClass } from './format'
import { realSpeeds } from './speeds'
import {
  codexRankPath,
  nearStandardRanges,
  PART_LABEL,
  PART_ORDER,
  partOf,
  rankFromSearch,
  SANITY_COPY,
  SANITY_ORDER,
  sanityEntryText,
  sanityGroups,
  STANDARD_SANITY,
  STANDARD_SPEED,
  withRank,
  type Group,
  type GroupEntry,
} from './groups'

const ghost = (id: string): Ghost => getGhost(id)!
const columnsOf = <C extends string>(groups: Group<C>[], g: Ghost): C[] => groups.filter((grp) => grp.entries.some((e) => e.ghost === g)).map((grp) => grp.id)
const entryOf = <C extends string>(groups: Group<C>[], c: C, id: string): GroupEntry => groups.find((grp) => grp.id === c)!.entries.find((e) => e.ghost.id === id)!

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

describe('Registre rangé par seuil de chasse : tôt, normal, tard', () => {
  const groups = sanityGroups(GHOSTS)

  it('trois colonnes, dans cet ordre, et chaque entité dans au moins une', () => {
    expect(groups.map((g) => g.id)).toEqual(['early', 'normal', 'late'])
    expect(SANITY_ORDER).toEqual(['early', 'normal', 'late'])
    for (const g of GHOSTS) expect(columnsOf(groups, g).length, g.id).toBeGreaterThan(0)
  })

  it('les colonnes d’une entité sont ses classes de seuil (sanityClasses)', () => {
    for (const g of GHOSTS) expect(new Set(columnsOf(groups, g)), g.id).toEqual(sanityClasses(g))
  })

  it('rien d’inventé : chaque seuil écrit est un champ low, normal ou high de la fiche, du bon côté de 50 %', () => {
    const side = (v: number, c: SanityClass) => (c === 'late' ? v < STANDARD_SANITY : c === 'early' ? v > STANDARD_SANITY : v === STANDARD_SANITY)
    for (const grp of groups)
      for (const e of grp.entries) {
        const h = e.ghost.huntSanity
        if (e.kind === 'copy') {
          expect(copiesBehavior(e.ghost)).toBe(true)
          continue
        }
        expect(e.kind).toBe('values')
        expect(e.values.length, `${e.ghost.id} ${grp.id}`).toBeGreaterThan(0)
        for (const v of e.values) {
          expect([h.low, h.normal, h.high], e.ghost.id).toContain(v)
          expect(side(v, grp.id), `${e.ghost.id} ${grp.id} ${v}`).toBe(true)
        }
      }
  })

  it('aucun seuil de la fiche n’est perdu : chacun est écrit dans une colonne et une seule', () => {
    for (const g of GHOSTS) {
      if (copiesBehavior(g)) continue
      const h = g.huntSanity
      const fields = [...new Set([h.low, h.normal, h.high].filter((v) => v >= 0))].sort((a, b) => a - b)
      const written = groups.flatMap((grp) => grp.entries.filter((e) => e.ghost === g).flatMap((e) => e.values)).sort((a, b) => a - b)
      expect(written, g.id).toEqual(fields)
    }
  })

  it('`several` : l’entité figure dans plusieurs colonnes de seuil, et seulement alors', () => {
    for (const grp of groups) for (const e of grp.entries) expect(e.several, `${e.ghost.id} ${grp.id}`).toBe(columnsOf(groups, e.ghost).length > 1)
    expect(columnsOf(groups, ghost('gallu'))).toEqual(['early', 'normal', 'late'])
    // un seuil normal inconnu (-1) ne range pas l'Obambo dans « Normal »
    expect(columnsOf(groups, ghost('obambo'))).toEqual(['early', 'late'])
    expect(entryOf(groups, 'normal', 'spirit').several).toBe(false)
  })

  it('« toujours » pour un seul seuil : le Démon chasse toujours tôt, l’Ombre et le Deogen toujours tard', () => {
    expect(PART_ORDER).toEqual(['always', 'sometimes'])
    expect(PART_LABEL).toEqual({ always: 'toujours', sometimes: 'par moments' })
    const always = (c: SanityClass) => groups.find((grp) => grp.id === c)!.entries.filter((e) => partOf(e) === 'always').map((e) => e.ghost.id)
    expect(always('early')).toEqual(['demon'])
    expect(always('late').sort()).toEqual(['deogen', 'shade'])
    // les seize entités dont la carte de tybayn n'écrit que « 50 % »
    expect(always('normal').sort()).toEqual(
      ['aswang', 'deildegast', 'goryo', 'hantu', 'jinn', 'moroi', 'myling', 'obake', 'oni', 'phantom', 'poltergeist', 'revenant', 'spirit', 'the-twins', 'wraith', 'yurei'].sort(),
    )
    for (const id of always('normal')) expect(new Set([ghost(id).huntSanity.low, ghost(id).huntSanity.normal, ghost(id).huntSanity.high]), id).toEqual(new Set([STANDARD_SANITY]))
  })

  it('ce qui s’écrit sur la ligne : le ou les seuils de la colonne', () => {
    expect(sanityEntryText(entryOf(groups, 'normal', 'spirit'))).toBe(`50${NBSP}%`)
    expect(sanityEntryText(entryOf(groups, 'late', 'shade'))).toBe(`35${NBSP}%`)
    expect(sanityEntryText(entryOf(groups, 'early', 'demon'))).toBe(`70${NBSP}% ou 100${NBSP}%`)
    expect(sanityEntryText(entryOf(groups, 'early', 'mare'))).toBe(`60${NBSP}%`)
    expect(sanityEntryText(entryOf(groups, 'late', 'mare'))).toBe(`40${NBSP}%`)
    expect(sanityEntryText(entryOf(groups, 'late', 'the-mimic'))).toBe(`copie le seuil de l’entité imitée (10 à 100${NBSP}%)`)
  })
})

describe('Registre : titres des colonnes et adresse', () => {
  it('typographie française : apostrophe courbe, espace insécable entre le nombre et son unité', () => {
    const texts = Object.values(SANITY_COPY).flatMap((c) => [c.title, c.def, c.play, c.label, c.none])
    for (const t of texts) {
      expect(t).not.toContain("'")
      expect(t).not.toMatch(/\d (?:%|m\/s)/)
    }
    expect(SANITY_COPY.early.def).toBe(`peut chasser au-dessus de 50${NBSP}%`)
    expect(SANITY_COPY.normal.def).toBe(`50${NBSP}%`)
    expect(SANITY_COPY.late.def).toBe(`sous 50${NBSP}%`)
    expect([SANITY_COPY.early.title, SANITY_COPY.normal.title, SANITY_COPY.late.title]).toEqual(['Tôt', 'Normal', 'Tard'])
  })

  it('« la plupart des entités » : plus de la moitié sont bien à 50 %', () => {
    expect(sanityGroups(GHOSTS)[1].entries.length).toBeGreaterThan(GHOSTS.length / 2)
    expect(sanityGroups(GHOSTS)[1].entries.filter((e) => !e.several).length).toBeGreaterThan(GHOSTS.length / 2)
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
