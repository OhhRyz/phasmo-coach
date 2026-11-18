import { describe, expect, it } from 'vitest'
import { GHOSTS, getGhost } from '../data'
import type { Ghost } from '../data/types'
import { copiesBehavior, EMPTY_FILTER, filterGhosts } from './filter'
import { NBSP, sanityClasses, speedClasses, speedText, type SanityClass, type SpeedClass } from './format'
import { realSpeeds } from './speeds'
import {
  codexRankPath,
  losEntryText,
  losOf,
  nearStandardRanges,
  PART_LABEL,
  PART_ORDER,
  partOf,
  rankFromSearch,
  SANITY_COPY,
  SANITY_ORDER,
  sanityEntryText,
  sanityGroups,
  SPEED_COPY,
  SPEED_ORDER,
  speedEntryText,
  speedGroups,
  speedGroupsOf,
  rowSpeedText,
  speedWord,
  STANDARD_SANITY,
  STANDARD_SPEED,
  withRank,
  type Group,
  type GroupEntry,
} from './groups'

const ghost = (id: string): Ghost => getGhost(id)!
const columnsOf = <C extends string>(groups: Group<C>[], g: Ghost): C[] => groups.filter((grp) => grp.entries.some((e) => e.ghost === g)).map((grp) => grp.id)
const entryOf = <C extends string>(groups: Group<C>[], c: C, id: string): GroupEntry => groups.find((grp) => grp.id === c)!.entries.find((e) => e.ghost.id === id)!

describe('Registre rangé par vitesse : lentes, normales, rapides', () => {
  const groups = speedGroups(GHOSTS)

  it('trois colonnes, dans cet ordre, et chaque entité dans au moins une', () => {
    expect(groups.map((g) => g.id)).toEqual(['slow', 'normal', 'fast'])
    expect(SPEED_ORDER).toEqual(['slow', 'normal', 'fast'])
    for (const g of GHOSTS) expect(columnsOf(groups, g).length, g.id).toBeGreaterThan(0)
  })

  /** Les entités dont la fiche donne une plage de vitesses (elles changent par paliers) : jamais dans la colonne du milieu. */
  const RANGES = ['hantu', 'moroi', 'thaye', 'deildegast']
  /** Les entités qui n'ont que 1,7 m/s : la carte de tybayn n'écrit pour elles que « 1.7 m/s » (le Mimic, qui copie, est à part). */
  const ALWAYS_NORMAL = ['spirit', 'wraith', 'phantom', 'poltergeist', 'banshee', 'mare', 'shade', 'demon', 'yurei', 'oni', 'yokai', 'goryo', 'myling', 'onryo', 'obake']

  it('une colonne par vitesse écrite sur la fiche : une plage n’est rangée que par ses deux bornes, jamais au milieu', () => {
    let copies = 0
    for (const g of GHOSTS) {
      const cols = new Set(columnsOf(groups, g))
      expect(cols, g.id).toEqual(speedGroupsOf(g))
      if (copiesBehavior(g)) {
        copies++
        expect(cols, g.id).toEqual(new Set(SPEED_ORDER))
      } else if (g.speed.isRange) {
        expect(cols, g.id).toEqual(new Set<SpeedClass>(['slow', 'fast']))
      } else {
        // hors plage : les mêmes classes que le filtre du carnet de preuves
        expect(cols, g.id).toEqual(speedClasses(g))
      }
    }
    // le Mimic
    expect(copies).toBe(1)
    expect(GHOSTS.filter((g) => g.speed.isRange).map((g) => g.id).sort()).toEqual([...RANGES].sort())
  })

  it('« Normales » : seulement des entités dont 1,7 m/s est une vitesse écrite sur la fiche (retour du coach du 18 novembre)', () => {
    const normal = groups.find((grp) => grp.id === 'normal')!
    for (const e of normal.entries) {
      if (copiesBehavior(e.ghost)) continue
      const s = e.ghost.speed
      expect(s.isRange, e.ghost.id).toBe(false)
      expect([s.min, s.max, s.alt], e.ghost.id).toContain(STANDARD_SPEED)
      // et c'est une vitesse que l'entité a réellement en chasse (paliers de tybayn compris)
      expect(realSpeeds(e.ghost), e.ghost.id).toContain(STANDARD_SPEED)
      expect(e.values, e.ghost.id).toEqual([STANDARD_SPEED])
    }
    const ids = normal.entries.map((e) => e.ghost.id)
    for (const id of RANGES) expect(ids, id).not.toContain(id)
    // les quinze entités qui n'ont que 1,7 m/s, puis celles qui y sont par moments
    expect(normal.entries.filter((e) => !e.several).map((e) => e.ghost.id).sort()).toEqual([...ALWAYS_NORMAL].sort())
    expect(normal.entries.filter((e) => e.several).map((e) => e.ghost.id).sort()).toEqual(['dayan', 'gallu', 'jinn', 'kormos', 'raiju', 'the-mimic'])
  })

  it('une plage va bien de lent à rapide : ses paliers (tybayn) commencent sous 1,7 m/s et finissent au-dessus', () => {
    for (const id of RANGES) {
      const g = ghost(id)
      const steps = realSpeeds(g)
      expect(Math.min(...steps), id).toBe(g.speed.min)
      expect(Math.max(...steps), id).toBe(g.speed.max)
      expect(g.speed.min, id).toBeLessThan(STANDARD_SPEED)
      expect(g.speed.max!, id).toBeGreaterThan(STANDARD_SPEED)
      expect(columnsOf(groups, g), id).toEqual(['slow', 'fast'])
    }
  })

  it('face au critère « Vitesse en chasse » du carnet de preuves : mêmes colonnes, sauf les plages, que le filtre garde au milieu', () => {
    const ranges = new Set(RANGES.map(ghost))
    for (const c of SPEED_ORDER) {
      const kept = new Set(filterGhosts(GHOSTS, { ...EMPTY_FILTER, speed: [c] }))
      const column = new Set(groups.find((grp) => grp.id === c)!.entries.map((e) => e.ghost))
      // le filtre élimine : une plage qui traverse 1,7 m/s reste possible quand on entend des pas normaux
      if (c === 'normal') for (const g of ranges) expect(kept.has(g), g.id).toBe(true)
      const expected = c === 'normal' ? new Set([...kept].filter((g) => !ranges.has(g))) : kept
      expect(column, c).toEqual(expected)
    }
  })

  it('le filtre du carnet garde ces plages sous « normale » : leurs paliers passent par 1,7 m/s ou tout près (0,05 m/s au plus)', () => {
    expect(nearStandardRanges(GHOSTS).map((g) => g.id)).toEqual(['hantu', 'moroi', 'thaye', 'deildegast'])
    const nearest = (id: string) => Math.min(...realSpeeds(ghost(id)).map((v) => Math.abs(v - STANDARD_SPEED)))
    // 1,75 m/s entre 12 et 15 °C ; 1,66 et 1,749 m/s ; 1,7 m/s pile au 6e vieillissement ; 1,7 m/s pile au 13e objet
    expect(nearest('hantu')).toBeCloseTo(0.05, 6)
    expect(nearest('moroi')).toBeCloseTo(0.04, 6)
    expect(nearest('thaye')).toBe(0)
    expect(nearest('deildegast')).toBe(0)
    // aucune de ces entités n'est pour autant rangée parmi les normales
    for (const g of nearStandardRanges(GHOSTS)) expect(speedGroupsOf(g).has('normal'), g.id).toBe(false)
  })

  it('« toujours » puis « par moments » : une entité est « toujours » dans sa colonne quand elle n’en a pas d’autre', () => {
    expect(PART_ORDER).toEqual(['always', 'sometimes'])
    expect(PART_LABEL).toEqual({ always: 'toujours', sometimes: 'par moments' })
    for (const grp of groups) for (const e of grp.entries) expect(partOf(e), `${e.ghost.id} ${grp.id}`).toBe(columnsOf(groups, e.ghost).length > 1 ? 'sometimes' : 'always')
    const always = (c: SpeedClass) => groups.find((grp) => grp.id === c)!.entries.filter((e) => partOf(e) === 'always').map((e) => e.ghost.id)
    expect(always('slow')).toEqual(['aswang'])
    expect(always('normal').sort()).toEqual([...ALWAYS_NORMAL].sort())
    // aucune entité n'est toujours rapide : la colonne l'écrit (« aucune entité »)
    expect(always('fast')).toEqual([])
  })

  it('dans chaque colonne, l’ordre du journal du jeu et son numéro', () => {
    for (const grp of groups) {
      const ns = grp.entries.map((e) => e.n)
      expect(ns).toEqual([...ns].sort((a, b) => a - b))
      for (const e of grp.entries) expect(GHOSTS[e.n - 1]).toBe(e.ghost)
    }
  })

  it('rien d’inventé : chaque valeur écrite est un champ min, max ou alt de la fiche, du bon côté de 1,7 m/s', () => {
    const side = (v: number, c: SpeedClass) => (c === 'slow' ? v < STANDARD_SPEED : c === 'fast' ? v > STANDARD_SPEED : v === STANDARD_SPEED)
    for (const grp of groups)
      for (const e of grp.entries) {
        const s = e.ghost.speed
        const fields = [s.min, s.max, s.alt].filter((v): v is number => v != null)
        for (const v of e.values) expect(fields, `${e.ghost.id} ${grp.id}`).toContain(v)
        if (e.kind === 'copy') {
          expect(copiesBehavior(e.ghost)).toBe(true)
          expect(e.values).toEqual([])
        } else if (e.kind === 'values') {
          expect(s.isRange, e.ghost.id).toBe(false)
          expect(e.values.length, `${e.ghost.id} ${grp.id}`).toBeGreaterThan(0)
          for (const v of e.values) expect(side(v, grp.id), `${e.ghost.id} ${grp.id} ${v}`).toBe(true)
        } else {
          // une plage : sa borne du côté de la colonne, et pas de ligne au milieu
          expect(s.isRange, e.ghost.id).toBe(true)
          const lo = Math.min(...fields)
          const hi = Math.max(...fields)
          expect(grp.id, e.ghost.id).not.toBe('normal')
          if (grp.id === 'slow') expect([e.kind, e.values]).toEqual(['low', [lo]])
          if (grp.id === 'fast') expect([e.kind, e.values]).toEqual(['high', [hi]])
          expect(side(e.values[0], grp.id), e.ghost.id).toBe(true)
        }
      }
  })

  it('aucune vitesse de la fiche n’est perdue : hors plage, chacune est écrite dans une colonne et une seule', () => {
    for (const g of GHOSTS) {
      if (copiesBehavior(g) || g.speed.isRange) continue
      const fields = [...new Set([g.speed.min, g.speed.max, g.speed.alt].filter((v): v is number => v != null))].sort((a, b) => a - b)
      const written = groups.flatMap((grp) => grp.entries.filter((e) => e.ghost === g).flatMap((e) => e.values)).sort((a, b) => a - b)
      expect(written, g.id).toEqual(fields)
    }
  })

  it('`several` : l’entité figure dans plusieurs colonnes, et seulement alors', () => {
    for (const grp of groups) for (const e of grp.entries) expect(e.several, `${e.ghost.id} ${grp.id}`).toBe(columnsOf(groups, e.ghost).length > 1)
    expect(entryOf(groups, 'slow', 'aswang').several).toBe(false)
    expect(columnsOf(groups, ghost('dayan'))).toEqual(['slow', 'normal', 'fast'])
    expect(columnsOf(groups, ghost('the-twins'))).toEqual(['slow', 'fast'])
  })

  it('ce qui s’écrit sur la ligne : la valeur de la colonne, la borne d’une plage, ou « copie… » pour le Mimic', () => {
    expect(speedEntryText(entryOf(groups, 'slow', 'aswang'))).toBe(`1,53${NBSP}m/s`)
    expect(speedEntryText(entryOf(groups, 'slow', 'dayan'))).toBe(`1,2${NBSP}m/s`)
    expect(speedEntryText(entryOf(groups, 'normal', 'dayan'))).toBe(`1,7${NBSP}m/s`)
    expect(speedEntryText(entryOf(groups, 'fast', 'dayan'))).toBe(`2,25${NBSP}m/s`)
    expect(speedEntryText(entryOf(groups, 'slow', 'hantu'))).toBe(`descend à 1,4${NBSP}m/s`)
    expect(groups.find((grp) => grp.id === 'normal')!.entries.some((e) => e.ghost.id === 'hantu')).toBe(false)
    expect(speedEntryText(entryOf(groups, 'fast', 'hantu'))).toBe(`monte à 2,7${NBSP}m/s`)
    expect(speedEntryText(entryOf(groups, 'slow', 'deildegast'))).toBe(`descend à 0,4${NBSP}m/s`)
    expect(speedEntryText(entryOf(groups, 'fast', 'thaye'))).toBe(`monte à 2,75${NBSP}m/s`)
    expect(speedEntryText(entryOf(groups, 'slow', 'moroi'))).toBe(`descend à 1,5${NBSP}m/s`)
    // le résumé de la fiche, tel quel, sans sa majuscule
    expect(speedEntryText(entryOf(groups, 'normal', 'the-mimic'))).toBe('copie la vitesse de l’entité imitée')
    // toujours un nombre de la fiche suivi de son unité (espace insécable), sauf pour l'entité qui en copie une autre
    for (const grp of groups)
      for (const e of grp.entries) if (e.kind !== 'copy') expect(speedEntryText(e), e.ghost.id).toMatch(new RegExp(`\\d${NBSP}m/s$`))
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

describe('Registre : l’accélération en ligne de vue et le mot de la vitesse', () => {
  it('« accélère », « n’accélère pas », ou « selon les conditions » : d’après speed.los et speed.losVaries', () => {
    for (const g of GHOSTS) {
      const los = losOf(g)
      if (copiesBehavior(g)) expect(los, g.id).toBeNull()
      else if (g.speed.losVaries) expect(los, g.id).toBe('varies')
      else expect(los, g.id).toBe(g.speed.los ? 'yes' : 'no')
    }
    expect(losEntryText(ghost('spirit'))).toBe('accélère en ligne de vue')
    expect(losEntryText(ghost('hantu'))).toBe('n’accélère pas en ligne de vue')
    expect(losEntryText(ghost('kormos'))).toBe('accélère en ligne de vue selon les conditions')
    // le Mimic copie aussi cela : sa ligne dit seulement qu'il copie
    expect(losEntryText(ghost('the-mimic'))).toBeNull()
  })

  it('« lente », « normale », « rapide » pour une seule classe ; « variable » dès qu’il y en a plusieurs', () => {
    const groups = speedGroups(GHOSTS)
    const one = { slow: 'lente', normal: 'normale', fast: 'rapide' } as const
    for (const g of GHOSTS) {
      const cols = columnsOf(groups, g)
      expect(speedWord(g), g.id).toBe(cols.length > 1 ? 'variable' : one[cols[0]])
    }
    expect(speedWord(ghost('aswang'))).toBe('lente')
    expect(speedWord(ghost('spirit'))).toBe('normale')
    expect(speedWord(ghost('hantu'))).toBe('variable')
    expect(speedWord(ghost('the-mimic'))).toBe('variable')
  })

  it('après le mot, les m/s de la fiche ; le Mimic, « variable », dit qu’il copie au lieu d’écrire ses 1,7 m/s', () => {
    for (const g of GHOSTS) {
      if (copiesBehavior(g)) expect(rowSpeedText(g), g.id).not.toMatch(/\d/)
      else expect(rowSpeedText(g), g.id).toBe(speedText(g))
    }
    expect(rowSpeedText(ghost('the-mimic'))).toBe('copie l’entité imitée')
    expect(rowSpeedText(ghost('spirit'))).toBe(`1,7${NBSP}m/s`)
  })
})

describe('Registre : titres des colonnes et adresse', () => {
  it('typographie française : apostrophe courbe, espace insécable entre le nombre et son unité', () => {
    const texts = [...Object.values(SPEED_COPY), ...Object.values(SANITY_COPY)].flatMap((c) => [c.title, c.def, c.play, c.label])
    for (const t of texts) {
      expect(t).not.toContain("'")
      expect(t).not.toMatch(/\d (?:%|m\/s)/)
    }
    expect(SPEED_COPY.slow.def).toBe(`moins de 1,7${NBSP}m/s`)
    expect(SPEED_COPY.normal.def).toBe(`1,7${NBSP}m/s`)
    expect(SPEED_COPY.fast.def).toBe(`plus de 1,7${NBSP}m/s`)
    expect(SANITY_COPY.early.def).toBe(`peut chasser au-dessus de 50${NBSP}%`)
    expect(SANITY_COPY.normal.def).toBe(`50${NBSP}%`)
    expect(SANITY_COPY.late.def).toBe(`sous 50${NBSP}%`)
    expect([SPEED_COPY.slow.title, SPEED_COPY.normal.title, SPEED_COPY.fast.title]).toEqual(['Lentes', 'Normales', 'Rapides'])
    expect([SANITY_COPY.early.title, SANITY_COPY.normal.title, SANITY_COPY.late.title]).toEqual(['Tôt', 'Normal', 'Tard'])
  })

  it('« la plupart des entités » : plus de la moitié sont bien à 1,7 m/s, et à 50 %', () => {
    expect(speedGroups(GHOSTS)[1].entries.length).toBeGreaterThan(GHOSTS.length / 2)
    expect(sanityGroups(GHOSTS)[1].entries.length).toBeGreaterThan(GHOSTS.length / 2)
    // et la moitié des entités n'ont que cette vitesse, plus de la moitié que ce seuil
    expect(speedGroups(GHOSTS)[1].entries.filter((e) => !e.several).length).toBeGreaterThanOrEqual(GHOSTS.length / 2)
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
