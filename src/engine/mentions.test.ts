import { describe, expect, it } from 'vitest'
import { getGhost, GHOSTS } from '../data'
import type { Ghost } from '../data/types'
import { entityMentions, type Mention } from './mentions'

const links = (parts: Mention[]) => parts.filter((p): p is { id: string; text: string } => typeof p !== 'string')
const joined = (parts: Mention[]) => parts.map((p) => (typeof p === 'string' ? p : p.text)).join('')

/** Les textes de fiche où une autre entité peut être citée, avec ce qui ne se lie jamais (la fiche, la ligne). */
function ficheTexts(g: Ghost): { text: string; skip: string[] }[] {
  const self = [g.id]
  return [
    ...g.keyTells.map((text) => ({ text, skip: self })),
    ...[...g.tells, ...g.behaviors, ...g.abilities].map((t) => ({ text: t.text, skip: self })),
    ...g.confirmationTests.map((t) => ({ text: t.text, skip: self })),
    ...g.eliminationTests.map((t) => ({ text: t.text, skip: self })),
    ...g.confusions.map((c) => ({ text: c.why, skip: [g.id, c.with] })),
    ...g.observations.map((o) => ({ text: o.text, skip: self })),
    ...[...g.speed.details, ...g.huntSanity.details, ...g.changes, ...g.uncertain].map((text) => ({ text, skip: self })),
  ]
}

describe('fiches : les autres entités citées mènent à leur fiche', () => {
  it('l’Obambo cité dans le test du Hantu devient un lien', () => {
    const hantu = getGhost('hantu')!
    const test = hantu.confirmationTests.find((t) => t.text.includes('Obambo'))!
    const parts = entityMentions(test.text, GHOSTS, ['hantu'])
    expect(links(parts)).toEqual([{ id: 'obambo', text: 'Obambo' }])
    // le texte reste le même, mot pour mot : seul le nom devient un lien (l'article reste du texte)
    expect(joined(parts)).toBe(test.text)
    expect(parts.some((p) => typeof p === 'string' && /L['’]$/u.test(p))).toBe(true)
  })

  it('au masculin, au féminin, avec élision : « le Gallu », « la Banshee », « une Dayan », « l’Ombre », « d’Obambo », « les Jumeaux »', () => {
    const text = 'Le Gallu, la Banshee, une Dayan, l’Ombre, un cri d’Obambo et les Jumeaux.'
    expect(links(entityMentions(text, GHOSTS)).map((l) => l.id)).toEqual(['gallu', 'banshee', 'dayan', 'shade', 'obambo', 'the-twins'])
    expect(links(entityMentions('Méfie-toi du Mimic et des Jumeaux.', GHOSTS)).map((l) => l.text)).toEqual(['Mimic', 'Jumeaux'])
  })

  it('jamais un mot courant, une difficulté, une preuve ni un morceau de mot', () => {
    for (const text of [
      'En difficulté Cauchemar ou Démence, une preuve est cachée.',
      'Pose des questions à la Spirit Box.',
      'Une ombre passe, l’esprit vagabonde, un fantôme.',
      'Les Gallus et les Onis.',
      'Esprit : EMF 5 + Écriture.',
      'Le Démonologue arrive.',
    ]) {
      expect(links(entityMentions(text, GHOSTS)), text).toEqual([])
      expect(entityMentions(text, GHOSTS), text).toEqual([text])
    }
  })

  it('rien entre « » (libellé du jeu, phrase citée) ; une seule fois par texte ; ni la fiche ni la ligne en cours', () => {
    expect(links(entityMentions('« Un Gallu n’est jamais lent » : le Gallu enragé file.', GHOSTS))).toEqual([{ id: 'gallu', text: 'Gallu' }])
    const wraith = getGhost('wraith')!
    const test = wraith.confirmationTests.find((t) => (t.text.match(/Gallu/gu) ?? []).length > 1)!
    expect(links(entityMentions(test.text, GHOSTS, ['wraith']))).toEqual([{ id: 'gallu', text: 'Gallu' }])
    expect(links(entityMentions('Le Spectre et le Gallu.', GHOSTS, ['wraith', 'gallu']))).toEqual([])
  })

  it('sur toutes les fiches : chaque lien est le nom exact d’une autre entité, et le texte reste identique', () => {
    let total = 0
    for (const g of GHOSTS) {
      for (const { text, skip } of ficheTexts(g)) {
        const parts = entityMentions(text, GHOSTS, skip)
        expect(joined(parts), `${g.id} : ${text}`).toBe(text)
        for (const l of links(parts)) {
          const other = getGhost(l.id)!
          expect(other, l.id).toBeTruthy()
          expect(skip, `${g.id} : ${text}`).not.toContain(l.id)
          expect(other.name.replace(/^(?:Le|La|Les) /u, '')).toBe(l.text)
          total++
        }
      }
    }
    // une quarantaine de citations dans les fiches actuelles : la règle ne doit pas les perdre en route
    expect(total).toBeGreaterThan(30)
  })
})
