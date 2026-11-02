import { describe, expect, it } from 'vitest'
import { GHOSTS, MECHANICS } from '../data'
import { isZeroVariant, lowerFirst, pairZeroVariants, testException } from './fiche'

describe('Fiche : la variante « sans preuve » d’une ligne reconnue et rangée sous elle', () => {
  it('une même capacité, chiffres adaptés à la partie sans preuve : variante ; deux règles voisines : non', () => {
    expect(
      isZeroVariant(
        'Peut se téléporter près d’un joueur choisi au hasard, en laissant un EMF 2 ou un EMF 5 à son nouvel emplacement.',
        'Peut se téléporter près d’un joueur choisi au hasard, en laissant un EMF 2 à son nouvel emplacement.',
      ),
    ).toBe(true)
    // même début (« Ne fait pas d’… »), mais pas la même règle (Ombre)
    expect(
      isZeroVariant(
        'Ne fait pas d’interaction donnant EMF 2, EMF 3 ou EMF 5 lorsqu’elle est dans la même pièce que le joueur.',
        'Ne fait pas d’événement dans la même pièce qu’un joueur (mais peut démarrer un événement hors de la pièce).',
      ),
    ).toBe(false)
    expect(isZeroVariant('Préfère les événements de chant.', 'Ne poursuit que sa cible pendant une chasse.')).toBe(false)
  })

  it('dans les fiches : exactement les quatre paires connues, la variante juste sous sa ligne, rien de perdu', () => {
    const pairs: string[] = []
    for (const g of GHOSTS) {
      for (const [list, items] of [
        ['tells', g.tells],
        ['behaviors', g.behaviors],
        ['abilities', g.abilities],
      ] as const) {
        const paired = pairZeroVariants(items)
        // chaque ligne apparaît une fois, ligne ou variante
        const shown = paired.flatMap((p) => (p.variant ? [p.item, p.variant] : [p.item]))
        expect(shown.length, `${g.id} ${list}`).toBe(items.length)
        expect(new Set(shown).size, `${g.id} ${list}`).toBe(items.length)
        for (const p of paired) {
          if (!p.variant) continue
          expect(p.item.zeroEvidence, g.id).toBeFalsy()
          expect(p.variant.zeroEvidence, g.id).toBe(true)
          pairs.push(`${g.id}/${list}`)
        }
      }
    }
    expect(pairs.sort()).toEqual(['jinn/abilities', 'moroi/tells', 'shade/behaviors', 'wraith/abilities'])
  })

  it('la variante se lit à la suite de « en partie sans preuve : »', () => {
    expect(lowerFirst('Peut se téléporter')).toBe('peut se téléporter')
    expect(lowerFirst('Disjoncteur allumé, peut faire chuter')).toBe('disjoncteur allumé, peut faire chuter')
  })
})

describe('Fiche : l’exception que nomme un test définitif', () => {
  it('« Seul un Gallu enragé (…) fait pareil » ou « ferait pareil » : le Gallu enragé', () => {
    const wraith = GHOSTS.find((g) => g.id === 'wraith')!
    const [t1, t2] = wraith.confirmationTests
    expect(t1.definitive && t2.definitive).toBe(true)
    expect(testException(t1.text, GHOSTS)).toBe('Gallu enragé')
    expect(testException(t2.text, GHOSTS)).toBe('Gallu enragé')
  })

  it('« (ou un Mimic en train de l’imiter) », « (à Sunny Meadows, un Onryo peut chasser tôt) » : aussi une exception', () => {
    const test = (id: string, k: number) => GHOSTS.find((g) => g.id === id)!.confirmationTests[k].text
    expect(testException(test('obake', 1), GHOSTS)).toBe('Mimic')
    expect(testException(test('demon', 2), GHOSTS)).toBe('Onryo à Sunny Meadows')
    // une parenthèse qui départage deux entités n'est pas une exception
    expect(testException(test('oni', 0), GHOSTS)).toBeNull()
    expect(testException(test('gallu', 0), GHOSTS)).toBeNull()
    expect(testException('C’est un Démon (à Sunny Meadows, un joueur peut se tromper).', GHOSTS)).toBeNull()
    // sur toutes les fiches, les tests définitifs qui nomment une exception
    const named = GHOSTS.flatMap((g) => g.confirmationTests.flatMap((t, k) => (t.definitive && testException(t.text, GHOSTS) ? [`${g.id} ${k + 1}`] : [])))
    expect(named).toEqual(['wraith 1', 'wraith 2', 'demon 3', 'obake 2'])
  })

  it('rien quand le texte ne nomme pas d’exception, ou pas une entité', () => {
    expect(testException('Si l’entité éteint deux fois la même flamme en moins de 20 s, c’est un Onryo.', GHOSTS)).toBeNull()
    expect(testException('Seul un joueur attentif ferait pareil.', GHOSTS)).toBeNull()
    expect(testException('', GHOSTS)).toBeNull()
  })
})

describe('Mécaniques : le délai après l’encens dit sans contradiction avec les fiches', () => {
  const fact = MECHANICS.topics.flatMap((t) => t.facts).find((f) => f.id === 'encens-04')!
  it('90 s au minimum pour une entité standard, plus longtemps possible pour toutes, 180 s obligatoires pour l’Esprit', () => {
    const txt = fact.text.replace(/[  ]/g, ' ')
    expect(txt).toMatch(/entité standard ne peut pas rechasser avant 90 s/)
    expect(txt).toMatch(/n.importe quelle entité peut attendre plus longtemps, 180 s ou davantage/)
    expect(txt).toMatch(/Seul l.Esprit est obligé d.attendre 180 s/)
    // l'ancienne phrase laissait croire que 180 s était la règle pour toutes
    expect(txt).not.toMatch(/peut mettre 180 s avant de chasser/)
    // la carte garde sa question et sa réponse
    expect(fact.a.replace(/[\u00a0\u202f]/g, ' ')).toBe('180 secondes.')
  })
  it('les fiches disent bien 90 s pour une entité standard et 180 s pour l’Esprit', () => {
    const spirit = GHOSTS.find((g) => g.id === 'spirit')!
    expect(spirit.tells.some((t) => /180 s.*90 s standard/.test(t.text.replace(/[  ]/g, ' ')))).toBe(true)
  })
})
