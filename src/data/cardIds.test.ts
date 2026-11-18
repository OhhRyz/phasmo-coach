import { describe, expect, it } from 'vitest'
import { GHOSTS, MECHANICS } from '.'
import type { Ghost } from './types'
import { buildDeck, cardNumbers } from '../engine/cards'
import { hashString } from '../engine/random'

/**
 * Les identifiants des cartes de révision ne changent jamais de texte.
 *
 * La progression de chaque carnet est rangée par identifiant de carte (localStorage `phasmo-coach/v1`,
 * `cards` et `log`). Deux sortes de cartes tiennent leur identifiant d'un numéro : `g:<entité>:test:<n>` (un
 * test définitif de `confirmationTests`) et `g:<entité>:rev:<n>` (un signe « 0 preuve » de `tells`). Ce numéro
 * est écrit dans la fiche, sur l'élément : `"card": <n>`. Si un identifiant passait d'un texte à un autre, la
 * progression acquise sur l'ancien texte s'appliquerait au nouveau, sans que personne le voie.
 *
 * En modifiant une fiche :
 *  - supprimer un test ou un signe : supprimer l'élément entier, avec son `"card"` ; ne renuméroter personne.
 *    Sa carte disparaît (sa progression reste dans les carnets, sans effet) ; le test ou le signe suivant de la
 *    fiche peut devenir une carte, sous son propre numéro ;
 *  - rétrograder (`definitive: false`, `zeroEvidence: false`) : laisser `"card"` en place, le numéro reste pris ;
 *  - ne jamais déplacer un `"card"` d'un élément à un autre, ni réutiliser un numéro déjà servi dans la fiche ;
 *  - ajouter un test définitif ou un signe « 0 preuve » : s'il devient une carte, ce fichier échoue et donne le
 *    numéro à écrire (le premier jamais servi) ; sinon, rien à écrire.
 *
 * SNAPSHOT : pour chaque carte déjà parue, une empreinte du texte de la fiche (tel qu'écrit dans le JSON).
 *  - Le test « ne change pas de texte » échoue quand un identifiant connu ne tombe plus sur le même texte.
 *    S'il s'agit du même fait, seulement reformulé (la carte doit garder sa progression) : remplacer à la main
 *    l'empreinte de sa ligne par celle que donne le message d'échec. S'il s'agit d'un autre fait : c'est une
 *    erreur dans la fiche (numéro déplacé ou réutilisé) ; rendre son numéro à l'ancien texte et donner au
 *    nouveau un numéro jamais servi. L'ancien texte de chaque carte se lit dans l'historique git de la fiche.
 *  - Une carte supprimée garde sa ligne ici, pour toujours : c'est elle qui interdit de réutiliser son numéro.
 *  - Une nouvelle carte n'échoue pas : le test affiche la ligne à ajouter ici (à faire avant de publier).
 */
const SNAPSHOT: Record<string, string> = {
  'g:spirit:test:0': '1tvoqfw',
  'g:spirit:rev:0': '50delq',
  'g:wraith:test:0': '1auwyyg',
  'g:wraith:test:1': 'jv0juh',
  'g:wraith:rev:0': 'bduyjg',
  'g:wraith:rev:1': 'apsm6j',
  'g:phantom:test:0': '1yf18bc',
  'g:phantom:test:1': '8kc1ht',
  'g:phantom:rev:0': 'vrrb0r',
  'g:phantom:rev:1': '1ckfdbj',
  'g:poltergeist:test:0': '1lnk4th',
  'g:poltergeist:test:1': 'ckwve2',
  'g:poltergeist:rev:0': '6c7tql',
  'g:banshee:test:0': '6oulyj',
  'g:banshee:test:1': '1p4afgs',
  'g:banshee:rev:0': '1i5hdm6',
  'g:banshee:rev:1': '1fbs11c',
  'g:jinn:test:0': 't9n6fy',
  'g:jinn:rev:0': 'lp8ff0',
  'g:mare:test:0': '160xkkw',
  'g:mare:rev:0': '1a9i840',
  'g:mare:rev:1': '1hs14ge',
  'g:revenant:test:0': '1eev3rr',
  'g:revenant:rev:0': '19b9psi',
  'g:shade:test:0': 'bx1a75',
  'g:shade:test:1': 'mxpc44',
  'g:shade:rev:0': '1kei9x0',
  'g:shade:rev:1': 'm59hrm',
  'g:demon:test:0': '34f9sp',
  'g:demon:test:1': '18r7m14',
  'g:demon:rev:0': '18b27ea',
  'g:demon:rev:1': '1vse8n7',
  'g:yurei:test:0': '1ges8iw',
  'g:yurei:rev:0': '1lbgg60',
  'g:yurei:rev:1': 'm8kbgs',
  'g:oni:test:0': '1fx8um9',
  'g:oni:test:1': '43gftr',
  'g:oni:rev:0': '2hnybm',
  'g:oni:rev:1': 'wqgidp',
  'g:yokai:test:0': 'hp8t6b',
  'g:yokai:test:1': 'r7nmrc',
  'g:yokai:rev:0': 'sfhc6s',
  'g:yokai:rev:1': '1eq3bxo',
  'g:hantu:test:0': 'b1touy',
  'g:hantu:test:1': '8rca8v',
  'g:hantu:rev:0': 'fzorzy',
  'g:hantu:rev:1': '15zuqbd',
  'g:myling:test:0': 'c6bpa0',
  'g:myling:test:1': 'xcwtib',
  'g:myling:rev:0': 'i607fz',
  'g:myling:rev:1': 'tq1jyt',
  'g:onryo:test:0': '13vzjfa',
  'g:onryo:rev:0': 'pp63g1',
  'g:onryo:rev:1': '1kz4qct',
  'g:the-twins:rev:0': 'rntr5k',
  'g:the-twins:rev:1': '4eh85a',
  'g:raiju:test:0': 'f3q0t2',
  'g:raiju:test:1': '100yjyw',
  'g:raiju:rev:0': '1dru4yo',
  'g:raiju:rev:1': '3meo7z',
  'g:obake:test:0': '1pi79eo',
  'g:obake:test:2': 'qaa17t',
  'g:obake:rev:0': '1plelh3',
  'g:obake:rev:1': '1qhc41s',
  'g:the-mimic:test:0': 'v3ubls',
  'g:the-mimic:test:1': '1wd5gph',
  'g:the-mimic:rev:0': '1fwnyh6',
  'g:moroi:test:0': 'qpeq5w',
  'g:moroi:test:1': 'yrxs8x',
  'g:moroi:rev:0': 'sy2sd4',
  'g:moroi:rev:1': 'p4z735',
  'g:deogen:test:0': 'po7n35',
  'g:deogen:rev:0': 'qvclzg',
  'g:deogen:rev:1': 'glfhnj',
  'g:thaye:test:0': 'peptdx',
  'g:thaye:test:1': '1jhtu96',
  'g:thaye:rev:0': '7xxttp',
  'g:thaye:rev:1': 'qxbyci',
  'g:gallu:test:0': 'akp5nv',
  'g:gallu:test:1': '11lkyvu',
  'g:gallu:rev:0': '1chu0zm',
  'g:gallu:rev:1': 'ldtd3c',
  'g:obambo:test:0': '19re4o4',
  'g:obambo:rev:0': '16h8vbu',
  'g:obambo:rev:1': '149l6oj',
  'g:dayan:test:0': 'gwa9w5',
  'g:dayan:rev:0': '1wvwuat',
  'g:aswang:test:0': '1vt1ndt',
  'g:aswang:test:1': '1thv95k',
  'g:aswang:rev:0': 'cuqcrp',
  'g:aswang:rev:1': 'hcsqjj',
  'g:kormos:test:0': 'er23u5',
  'g:kormos:rev:0': '1gyy264',
  'g:kormos:rev:1': '137ot5z',
  'g:deildegast:test:0': '90iyc',
  'g:deildegast:test:1': '1pn0gi5',
  'g:deildegast:rev:0': '17n9frq',
  'g:deildegast:rev:1': 'eczfb4',
}

/** Nombre de cartes de l'instantané au gel des identifiants (novembre 2026) : il ne peut que grandir. */
const FROZEN = 98

const RAW = Object.values(import.meta.glob<Ghost>('./ghosts/*.json', { eager: true, import: 'default' }))

interface Numbered {
  id: string
  /** `g:<entité>:test:` ou `g:<entité>:rev:` */
  prefix: string
  where: string
  text: string
  /** le numéro est écrit dans la fiche (et non attribué par repli) */
  written: boolean
}

/** Les éléments numérotés d'une liste d'une fiche brute, avec l'identifiant de carte qu'ils donnent. */
function numbered<T extends { text: string; card?: number }>(g: Ghost, field: string, kind: string, items: readonly T[], eligible: (t: T) => boolean): Numbered[] {
  const prefix = `g:${g.id}:${kind}:`
  return [...cardNumbers(items, eligible)].map(([t, n]) => ({
    id: `${prefix}${n}`,
    prefix,
    where: `${g.id} ${field}[${items.indexOf(t)}]`,
    text: t.text,
    written: t.card === n,
  }))
}

const ITEMS: Numbered[] = RAW.flatMap((g) => [
  ...numbered(g, 'confirmationTests', 'test', g.confirmationTests ?? [], (t) => t.definitive),
  ...numbered(g, 'tells', 'rev', g.tells ?? [], (t) => !!t.zeroEvidence),
])
const BY_ID = new Map(ITEMS.map((x) => [x.id, x]))
const DECK = buildDeck(GHOSTS, MECHANICS, []).filter((c) => c.kind === 'test' || c.kind === 'reverse')
const short = (text: string) => (text.length > 90 ? `${text.slice(0, 89)}…` : text)

describe('identifiants des cartes de révision', () => {
  it('les numéros écrits dans les fiches sont des entiers, uniques dans leur liste', () => {
    for (const g of RAW) {
      for (const [field, items] of [['confirmationTests', g.confirmationTests ?? []], ['tells', g.tells ?? []]] as const) {
        const written = items.map((t) => t.card).filter((n) => n !== undefined)
        for (const n of written) expect(Number.isInteger(n) && n >= 0, `${g.id} ${field} : "card": ${n}`).toBe(true)
        expect(new Set(written).size, `${g.id} ${field} : un numéro de carte est écrit deux fois`).toBe(written.length)
      }
      // seuls les tests et les signes de `tells` donnent des cartes numérotées
      for (const t of [...(g.behaviors ?? []), ...(g.abilities ?? [])]) expect(t.card, `${g.id} : « ${short(t.text)} »`).toBeUndefined()
    }
  })

  it('chaque carte de test ou de signe vient d’un élément qui porte son numéro', () => {
    expect(DECK.length).toBeGreaterThan(0)
    const missing: string[] = []
    const next = new Map<string, number>()
    for (const x of ITEMS.filter((i) => !i.written && DECK.some((c) => c.id === i.id))) {
      // le premier numéro jamais servi : après ceux des fiches et ceux de l'instantané (cartes supprimées comprises)
      const used = [...ITEMS.filter((i) => i.written).map((i) => i.id), ...Object.keys(SNAPSHOT)]
        .filter((id) => id.startsWith(x.prefix))
        .map((id) => Number(id.slice(x.prefix.length)))
      const n = next.get(x.prefix) ?? Math.max(-1, ...used) + 1
      next.set(x.prefix, n + 1)
      missing.push(`${x.where} donne une carte sans numéro écrit : ajoute "card": ${n} à « ${short(x.text)} »`)
    }
    expect(missing).toEqual([])
    for (const c of DECK) expect(BY_ID.has(c.id), c.id).toBe(true)
  })

  it('un identifiant de carte ne change pas de texte', () => {
    const moved = ITEMS.filter((x) => SNAPSHOT[x.id] !== undefined && SNAPSHOT[x.id] !== hashString(x.text)).map(
      (x) =>
        `${x.id} (${x.where}) : empreinte '${SNAPSHOT[x.id]}' dans l'instantané, '${hashString(x.text)}' pour « ${short(x.text)} ». ` +
        'Même fait reformulé : remplace l’empreinte dans SNAPSHOT. Autre fait : numéro déplacé ou réutilisé, à corriger dans la fiche.',
    )
    expect(moved).toEqual([])
  })

  it('l’instantané garde toutes les cartes déjà parues', () => {
    expect(Object.keys(SNAPSHOT).length).toBeGreaterThanOrEqual(FROZEN)
    for (const [id, hash] of Object.entries(SNAPSHOT)) {
      expect(id, id).toMatch(/^g:[a-z-]+:(?:test|rev):\d+$/u)
      expect(hash, id).toMatch(/^[0-9a-z]{1,7}$/u)
    }
    // nouvelles cartes : rien n'échoue, mais leur ligne est à ajouter (elle protège ensuite leur identifiant)
    const fresh = DECK.filter((c) => SNAPSHOT[c.id] === undefined).map((c) => `  '${c.id}': '${hashString(BY_ID.get(c.id)?.text ?? '')}',`)
    if (fresh.length) console.warn(`Nouvelles cartes à ajouter à SNAPSHOT (src/data/cardIds.test.ts) :\n${fresh.join('\n')}`)
  })
})
