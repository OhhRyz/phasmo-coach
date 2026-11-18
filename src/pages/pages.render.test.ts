import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { GHOSTS } from '../data'
import { copiesBehavior } from '../engine/filter'
import { NBSP, sanityClasses, speedClasses } from '../engine/format'
import { speedGroupsOf } from '../engine/groups'
import { pairZeroVariants, testException } from '../engine/fiche'
import { StoreProvider } from '../store/store'
import { ToastProvider } from '../components/Toast'
import { Codex, normalSpeedNote, rangesNote } from './Codex'
import { FROM_CODEX, TO_REGISTRY } from './codexReturn'
import { GhostPage } from './GhostPage'
import { InstallPage } from './Install'
import { Notebook } from './Notebook'
import { ProgressPage } from './Progress'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom n'a pas ResizeObserver (le carnet mesure ses pages) : un observateur qui ne voit rien suffit ici
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

const mounted: { root: Root; host: HTMLElement }[] = []
afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount())
    host.remove()
  }
})

/** Une page de l'app telle qu'elle s'affiche (carnet neuf, sans note). */
function renderPage(path: string | { pathname: string; search?: string; state?: unknown }, route: string, element: ReactElement): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => {
    root.render(
      h(StoreProvider, null, h(ToastProvider, null, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: route, element }))))),
    )
  })
  return host
}

const renderFiche = (id: string) => renderPage(`/codex/${id}`, '/codex/:id', h(GhostPage))

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2019]/g, "'")

describe('Fiche : une capacité redite pour la partie sans preuve ne se lit plus comme un doublon', () => {
  it('Spectre : la téléportation sans preuve (EMF 2) se range sous la ligne complète (EMF 2 ou EMF 5), annoncée comme telle', () => {
    const el = renderFiche('wraith')
    const items = [...el.querySelectorAll('.lines li')].filter((li) => text(li).includes('Peut se téléporter'))
    expect(items).toHaveLength(1)
    const li = items[0]
    expect(text(li)).toMatch(/^Peut se téléporter près d'un joueur choisi au hasard, en laissant un EMF 2 ou un EMF 5/)
    const variant = li.querySelector('.zero-variant')
    expect(text(variant)).toMatch(/^en partie à 0 preuve : peut se téléporter près d'un joueur choisi au hasard, en laissant un EMF 2 à son nouvel emplacement/)
    // la mention « marche sans preuve » ne double pas l'annonce
    expect(li.querySelector('.zero-mark')).toBeNull()
  })

  it('même règle sur toutes les fiches : chaque variante sous sa ligne, aucune ligne perdue', () => {
    let variants = 0
    for (const g of GHOSTS) {
      const el = renderFiche(g.id)
      const lists = [g.tells, g.behaviors, g.abilities].filter((l) => l.length)
      const expected = lists.reduce((n, l) => n + pairZeroVariants(l).length, 0)
      expect(el.querySelectorAll('.lines > li').length, g.id).toBe(expected)
      const pairs = lists.reduce((n, l) => n + pairZeroVariants(l).filter((p) => p.variant).length, 0)
      expect(el.querySelectorAll('.zero-variant').length, g.id).toBe(pairs)
      variants += pairs
      act(() => mounted.at(-1)!.root.unmount())
    }
    // Spectre, Djinn, Ombre et Moroi
    expect(variants).toBe(4)
  })
})

describe('Fiche : un test définitif qui nomme lui-même une exception', () => {
  it('Spectre : le tampon reste « Définitif », l’exception du Gallu enragé s’écrit à côté', () => {
    const el = renderFiche('wraith')
    const tests = [...el.querySelectorAll('.protocol')]
    const notes = tests.map((t) => text(t.querySelector('.protocol-except')))
    expect(notes.slice(0, 2)).toEqual(['sauf Gallu enragé, voir ci-dessous', 'sauf Gallu enragé, voir ci-dessous'])
    for (const t of tests.slice(0, 2)) expect(text(t.querySelector('.stamp'))).toBe('Définitif')
    // les indices n'ont pas de mention
    expect(notes.slice(2).every((n) => n === '')).toBe(true)
  })

  it('seulement quand le texte du test nomme l’exception : aucune autre fiche n’en reçoit', () => {
    // le Spectre (Gallu enragé) et le Démon (un Onryo à Sunny Meadows) ; l'Obake n'en a plus : son test des empreintes
    // (« ou un Mimic en train de l'imiter ») a quitté la fiche à l'audit de véracité (nov. 2026, absent des tests de tybayn)
    const expected: Record<string, number> = { wraith: 2, demon: 1 }
    for (const g of GHOSTS) {
      const named = g.confirmationTests.filter((t) => t.definitive && testException(t.text, GHOSTS)).length
      expect(named, g.id).toBe(expected[g.id] ?? 0)
    }
  })

  it('Obake et Démon : le tampon reste « Définitif », l’exception s’écrit à côté', () => {
    // Obake : ses deux tests (changement d'apparence, pas manquant après le sel) restent « Définitif », sans mention
    // d'exception depuis que le test des empreintes (« sauf Mimic ») a quitté la fiche (audit de véracité, nov. 2026)
    const obake = [...renderFiche('obake').querySelectorAll('.protocol')]
    expect(obake).toHaveLength(2)
    for (const t of obake) {
      expect(text(t.querySelector('.stamp'))).toBe('Définitif')
      expect(text(t.querySelector('.protocol-except'))).toBe('')
    }
    const demon = [...renderFiche('demon').querySelectorAll('.protocol')][2]
    expect(text(demon.querySelector('.stamp'))).toBe('Définitif')
    expect(text(demon.querySelector('.protocol-except'))).toBe('sauf Onryo à Sunny Meadows, voir ci-dessous')
  })
})

describe('Fiche : la preuve qui reste toujours visible s’appelle « preuve obligatoire »', () => {
  it('le tampon, sa ligne d’explication et le rappel du carnet de preuves disent « obligatoire », plus « garantie » ni « forcée »', () => {
    const stamped = GHOSTS.filter((g) => g.forcedEvidence)
    expect(stamped.length).toBeGreaterThanOrEqual(4)
    let withStamp = 0
    for (const g of stamped) {
      const page = renderFiche(g.id)
      // le rappel écrit à côté de la preuve, dans le carnet de preuves de la fiche
      expect(text(page), g.id).toContain("obligatoire dès qu'il y a au moins 1 preuve")
      expect(text(page), g.id).not.toMatch(/preuves? (?:garantie|forcée)|garantie dès/i)
      const why = page.querySelector('.gh-stamp-why')
      if (!why) continue
      withStamp++
      expect([...page.querySelectorAll('.stamp')].map(text), g.id).toContain('Preuve obligatoire')
      expect(text(why), g.id).toMatch(/fait partie des preuves visibles dès que la difficulté en donne au moins une/)
    }
    // d'autres tampons passent devant (« Chasse très tôt »…) : au moins une fiche porte bien celui-ci
    expect(withStamp).toBeGreaterThan(0)
  })
})

describe('Codex : le registre se range par numéro, par vitesse ou par seuil de chasse', () => {
  const FILTER_KEY = 'phasmo-coach/codex-filter'
  afterEach(() => sessionStorage.removeItem(FILTER_KEY))
  const renderCodex = (search = '') => renderPage(`/codex${search}`, '/codex', h(Codex))
  const pressed = (el: HTMLElement) => [...el.querySelectorAll('.cx-rank .opt')].filter((b) => b.getAttribute('aria-pressed') === 'true').map(text)
  /** les colonnes du registre rangé : leur titre, les noms de leurs lignes, et leurs deux parties (« toujours », « par moments ») */
  const columns = (el: HTMLElement) =>
    [...el.querySelectorAll('.cx-ledger [role="group"]')].map((grp) => ({
      grp,
      title: text(grp.querySelector('h3')),
      label: grp.getAttribute('aria-label'),
      rows: [...grp.querySelectorAll('ul > li')],
      parts: [...grp.querySelectorAll('.cx-part')].map((part) => ({
        title: text(part.querySelector('h4')),
        names: [...part.querySelectorAll('ul > li .cx-link')].map((a) => a.firstChild?.textContent ?? ''),
        none: text(part.querySelector('.cx-part-none')),
      })),
    }))
  const named = (rows: Element[], g: { name: string }) => rows.filter((li) => li.querySelector('.cx-link')?.firstChild?.textContent === g.name)

  it('par numéro (d’office) : les 30 lignes dans l’ordre du journal, chacune avec le mot de sa vitesse', () => {
    const el = renderCodex()
    const group = el.querySelector('.cx-rank [role="group"]')!
    expect(group.getAttribute('aria-label')).toBe('Ranger le registre par')
    expect(text(el.querySelector('.cx-rank .typed-label'))).toBe('Ranger par')
    expect([...group.querySelectorAll('button')].map(text)).toEqual(['numéro', 'vitesse', 'seuil de chasse'])
    expect(pressed(el)).toEqual(['numéro'])
    expect(el.querySelector('.cx-ledger')).toBeNull()
    expect(text(el.querySelector('.cx-right .filehead'))).toContain('Ordre du journal du jeu')
    const rows = [...el.querySelectorAll('ol.cx-reg > li')]
    expect(rows.map((li) => li.querySelector('.cx-link')?.textContent)).toEqual(GHOSTS.map((g) => g.name))
    rows.forEach((li, i) => {
      const g = GHOSTS[i]
      const several = copiesBehavior(g) || speedClasses(g).size > 1
      const word = text(li.querySelector('.cx-cls'))
      expect(word, g.id).toMatch(/^Vitesse : (lente|normale|rapide|variable)$/)
      expect(word.endsWith('variable'), g.id).toBe(several)
    })
    const word = (id: string) => text(rows[GHOSTS.findIndex((g) => g.id === id)].querySelector('.cx-cls'))
    expect(word('aswang')).toBe('Vitesse : lente')
    expect(word('spirit')).toBe('Vitesse : normale')
    expect(word('the-twins')).toBe('Vitesse : variable')
    // après le mot, les m/s ; le Mimic, « variable », n'écrit pas ses 1,7 m/s à côté : il dit qu'il copie
    const speed = (id: string) => text(rows[GHOSTS.findIndex((g) => g.id === id)].querySelector('.cx-speed'))
    expect(speed('spirit')).toBe(', 1,7 m/s')
    expect(speed('the-mimic')).toBe(", copie l'entité imitée")
  })

  it('?rang=vitesse : trois colonnes titrées, chaque entité dans chacune de ses classes, avec la valeur qui l’y range', () => {
    const el = renderCodex('?rang=vitesse')
    expect(pressed(el)).toEqual(['vitesse'])
    expect(text(el.querySelector('.cx-right .filehead'))).toContain('Rangé par vitesse')
    expect(el.querySelector('ol.cx-reg')).toBeNull()
    const cols = columns(el)
    expect(cols.map((c) => c.title)).toEqual(['Lentes', 'Normales', 'Rapides'])
    expect(cols.map((c) => c.label)).toEqual(['Entités lentes', 'Entités à vitesse normale', 'Entités rapides'])
    expect(cols.map((c) => text(c.grp.querySelector('.cx-grp-def')))).toEqual(['moins de 1,7 m/s', '1,7 m/s', 'plus de 1,7 m/s'])
    expect(cols.map((c) => text(c.grp.querySelector('.cx-grp-play')))).toEqual([
      'des pas plus lents que la normale',
      'les pas de référence, ceux de la plupart des entités',
      'des pas plus rapides que la normale',
    ])
    const order = ['slow', 'normal', 'fast'] as const
    const name = (id: string) => GHOSTS.find((g) => g.id === id)!.name
    for (const g of GHOSTS) {
      const cls = speedGroupsOf(g)
      expect(cls.size, g.id).toBeGreaterThan(0)
      order.forEach((c, i) => {
        const lines = named(cols[i].rows, g)
        expect(lines.length, `${g.id} ${c}`).toBe(cls.has(c) ? 1 : 0)
        for (const li of lines) expect(li.querySelector('a')?.getAttribute('href')).toBe(`/codex/${g.id}`)
        // sous « toujours » quand l'entité n'a que cette colonne, sous « par moments » sinon
        const [always, sometimes] = cols[i].parts
        expect(always.names.includes(g.name), `${g.id} ${c} toujours`).toBe(cls.has(c) && cls.size === 1)
        expect(sometimes.names.includes(g.name), `${g.id} ${c} par moments`).toBe(cls.has(c) && cls.size > 1)
      })
    }
    // chaque colonne : « toujours », puis « par moments » (lu avec le titre de la colonne par un lecteur d'écran)
    expect(cols.map((c) => c.parts.map((p) => p.title))).toEqual([
      ['Lentes, toujours', 'Lentes, par moments'],
      ['Normales, toujours', 'Normales, par moments'],
      ['Rapides, toujours', 'Rapides, par moments'],
    ])
    // le retour du coach : au milieu, d'abord les quinze entités qui n'ont que 1,7 m/s ; ni Hantu, ni Moroi, ni Thayé, ni Deildegast
    expect(cols[1].parts[0].names).toEqual(
      ['spirit', 'wraith', 'phantom', 'poltergeist', 'banshee', 'mare', 'shade', 'demon', 'yurei', 'oni', 'yokai', 'goryo', 'myling', 'onryo', 'obake'].map(name),
    )
    expect(cols[1].parts[1].names).toEqual(['jinn', 'raiju', 'the-mimic', 'gallu', 'dayan', 'kormos'].map(name))
    for (const id of ['hantu', 'moroi', 'thaye', 'deildegast']) {
      const g = GHOSTS.find((o) => o.id === id)!
      expect(named(cols[1].rows, g), id).toHaveLength(0)
      expect(named(cols[0].rows, g), id).toHaveLength(1)
      expect(named(cols[2].rows, g), id).toHaveLength(1)
    }
    expect(cols[0].parts[0].names).toEqual([name('aswang')])
    // aucune entité n'est toujours rapide : la colonne l'écrit
    expect(cols[2].parts[0].names).toEqual([])
    expect(cols[2].parts[0].none).toBe("aucune entité n'est toujours rapide")
    expect(cols[0].parts[0].none).toBe('')
    const line = (i: number, id: string) => text(named(cols[i].rows, GHOSTS.find((g) => g.id === id)!)[0])
    expect(line(0, 'aswang')).toBe('Aswang : 1,53 m/s · accélère en ligne de vue')
    expect(line(0, 'dayan')).toBe('Dayan : 1,2 m/s · accélère en ligne de vue selon les conditions')
    expect(line(1, 'dayan')).toContain(' : 1,7 m/s · ')
    expect(line(2, 'dayan')).toContain(' : 2,25 m/s · ')
    expect(line(0, 'hantu')).toBe("Hantu : 1,4 m/s au plus lent · n'accélère pas en ligne de vue")
    expect(line(2, 'hantu')).toContain(' : 2,7 m/s au plus rapide · ')
    expect(line(1, 'the-mimic')).toBe("Le Mimic : copie la vitesse de l'entité imitée")
    // typographie de fr() : le nombre tient à son unité, l'apostrophe est courbe
    const raw = cols[0].grp.textContent ?? ''
    expect(raw).toContain(`1,53${NBSP}m/s`)
    expect(raw).toContain(`moins de 1,7${NBSP}m/s`)
    expect(raw).toContain('n’accélère pas en ligne de vue')
    expect(el.querySelector('.cx-ledger')!.textContent).not.toMatch(/\d (?:m\/s|%)|'/)
    expect(text(el.querySelector('.cx-rank-hint'))).toBe(
      "vitesses de la fiche, hors accélération en ligne de vue« toujours » : l'entité n'a que cette vitesse · « par moments » : elle en change, et figure dans chaque colonne où tombe une vitesse de sa fiche" +
        'Le Hantu, le Moroi, le Thayé et le Deildegast changent de vitesse par paliers : rangés à leur plus lent et à leur plus rapide',
    )
    // la troisième ligne nomme les entités dont la fiche donne une plage, et elles seules
    expect(text({ textContent: rangesNote(GHOSTS) } as Element)).toBe('Le Hantu, le Moroi, le Thayé et le Deildegast changent de vitesse par paliers : rangés à leur plus lent et à leur plus rapide')
    expect(rangesNote(GHOSTS.filter((g) => !g.speed.isRange))).toBeNull()
    expect(text({ textContent: rangesNote(GHOSTS.filter((g) => g.id === 'hantu')) } as Element)).toBe('Le Hantu change de vitesse par paliers : rangé à son plus lent et à son plus rapide')
  })

  it('?rang=seuil : « Tôt », « Normal », « Tard », chaque entité dans chacune de ses classes de seuil', () => {
    const el = renderCodex('?rang=seuil')
    expect(pressed(el)).toEqual(['seuil de chasse'])
    expect(text(el.querySelector('.cx-right .filehead'))).toContain('Rangé par seuil de chasse')
    const cols = columns(el)
    expect(cols.map((c) => c.title)).toEqual(['Tôt', 'Normal', 'Tard'])
    expect(cols.map((c) => c.label)).toEqual(['Entités qui peuvent chasser tôt', 'Entités au seuil de chasse normal', 'Entités qui peuvent chasser tard'])
    expect(cols.map((c) => text(c.grp.querySelector('.cx-grp-def')))).toEqual(['peut chasser au-dessus de 50 %', '50 %', 'sous 50 %'])
    const order = ['early', 'normal', 'late'] as const
    for (const g of GHOSTS) {
      const cls = sanityClasses(g)
      expect(cls.size, g.id).toBeGreaterThan(0)
      order.forEach((c, i) => {
        const lines = named(cols[i].rows, g)
        expect(lines.length, `${g.id} ${c}`).toBe(cls.has(c) ? 1 : 0)
        const [always, sometimes] = cols[i].parts
        expect(always.names.includes(g.name), `${g.id} ${c} toujours`).toBe(cls.has(c) && cls.size === 1)
        expect(sometimes.names.includes(g.name), `${g.id} ${c} par moments`).toBe(cls.has(c) && cls.size > 1)
      })
    }
    expect(cols.map((c) => c.parts.map((p) => p.title))).toEqual([
      ['Tôt, toujours', 'Tôt, par moments'],
      ['Normal, toujours', 'Normal, par moments'],
      ['Tard, toujours', 'Tard, par moments'],
    ])
    const name = (id: string) => GHOSTS.find((g) => g.id === id)!.name
    expect(cols[0].parts[0].names).toEqual([name('demon')])
    expect(cols[2].parts[0].names).toEqual([name('shade'), name('deogen')])
    // aucune partie vide dans ce classement
    expect(cols.flatMap((c) => c.parts.map((p) => p.none))).toEqual(['', '', '', '', '', ''])
    const line = (i: number, id: string) => text(named(cols[i].rows, GHOSTS.find((g) => g.id === id)!)[0])
    expect(line(1, 'spirit')).toBe('Esprit : 50 %')
    expect([line(0, 'gallu'), line(1, 'gallu'), line(2, 'gallu')]).toEqual(['Gallu : 60 %', 'Gallu : 50 %', 'Gallu : 40 %'])
    expect(line(0, 'demon')).toBe('Démon : 70 % ou 100 %')
    expect(text(el.querySelector('.cx-rank-hint'))).toBe(
      "santé mentale moyenne à partir de laquelle une chasse peut démarrer« toujours » : l'entité n'a que ce seuil · « par moments » : elle en change, et figure dans chaque colonne où tombe un seuil de sa fiche",
    )
    expect(el.querySelector('.cx-ledger')!.textContent).toContain(`50${NBSP}%`)
    // pas d'accélération en ligne de vue dans ce classement
    expect(el.querySelector('.cx-glos')).toBeNull()
  })

  it('le sélecteur change l’ordre sur place, et revient à l’ordre du journal', () => {
    const el = renderCodex()
    const button = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('.cx-rank .opt')].find((b) => text(b) === label)!
    act(() => button('vitesse').click())
    expect(pressed(el)).toEqual(['vitesse'])
    expect(columns(el).map((c) => c.title)).toEqual(['Lentes', 'Normales', 'Rapides'])
    act(() => button('seuil de chasse').click())
    expect(columns(el).map((c) => c.title)).toEqual(['Tôt', 'Normal', 'Tard'])
    act(() => button('numéro').click())
    expect(el.querySelector('.cx-ledger')).toBeNull()
    expect(el.querySelectorAll('ol.cx-reg > li')).toHaveLength(GHOSTS.length)
  })

  it('« normale » cochée dans le carnet : Hantu, Moroi, Thayé et Deildegast restent possibles, et la page dit pourquoi', () => {
    const NNBSP = '\u202f'
    expect(normalSpeedNote(GHOSTS)).toBe(
      `Le Hantu, le Moroi, le Thayé et le Deildegast restent possibles${NNBSP}: leur vitesse change par paliers et passe par 1,7${NBSP}m/s ou tout près`,
    )
    // sans le critère : pas de note
    expect(renderCodex('?rang=vitesse').querySelector('.cx-field-why')).toBeNull()
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({ filter: { evidenceCount: 3, evidence: {}, speed: ['normal'], huntAbove: null, los: null }, query: '' }))
    const el = renderCodex('?rang=vitesse')
    expect(text(el.querySelector('.cx-field-why'))).toBe('Le Hantu, le Moroi, le Thayé et le Deildegast restent possibles : leur vitesse change par paliers et passe par 1,7 m/s ou tout près')
    const cols = columns(el)
    for (const id of ['hantu', 'moroi', 'thaye', 'deildegast']) {
      const g = GHOSTS.find((o) => o.id === id)!
      // gardées par le filtre (comme chez tybayn), mais toujours absentes de la colonne du milieu
      const lines = [...named(cols[0].rows, g), ...named(cols[2].rows, g)]
      expect(lines, id).toHaveLength(2)
      for (const li of lines) expect(li.classList.contains('is-out'), id).toBe(false)
      expect(named(cols[1].rows, g), id).toHaveLength(0)
    }
    // une entité qui n'est jamais à 1,7 m/s est bien barrée (l'Aswang, le Revenant)
    for (const id of ['aswang', 'revenant']) {
      const g = GHOSTS.find((o) => o.id === id)!
      for (const li of named(cols.flatMap((c) => c.rows), g)) expect(li.classList.contains('is-out'), id).toBe(true)
    }
  })

  it('« normale » avec une autre preuve ou un autre critère : la note ne nomme que les entités encore possibles', () => {
    const note = (filter: object) => {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify({ filter: { evidenceCount: 3, evidence: {}, speed: ['normal'], huntAbove: null, los: null, ...filter }, query: '' }))
      const el = renderCodex('?rang=vitesse')
      return { el, note: el.querySelector('.cx-field-why') }
    }
    const struck = (el: HTMLElement, id: string) => {
      const g = GHOSTS.find((o) => o.id === id)!
      const lines = named(columns(el).flatMap((c) => c.rows), g)
      expect(lines.length, id).toBeGreaterThan(0)
      return lines.every((li) => li.classList.contains('is-out'))
    }
    // EMF 5 trouvé : des quatre, seul le Deildegast a cette preuve
    const emf = note({ evidence: { emf: 'found' } })
    expect(text(emf.note)).toBe('Le Deildegast reste possible : sa vitesse change par paliers et passe par 1,7 m/s ou tout près')
    expect(['hantu', 'moroi', 'thaye'].map((id) => struck(emf.el, id))).toEqual([true, true, true])
    expect(struck(emf.el, 'deildegast')).toBe(false)
    // accélère en ligne de vue : des quatre, seul le Moroi
    const los = note({ los: true })
    expect(text(los.note)).toBe('Le Moroi reste possible : sa vitesse change par paliers et passe par 1,7 m/s ou tout près')
    // le carnet écarte les quatre (EMF 5, UV et températures glaciales : le Djinn) : plus de note
    const jinn = note({ evidence: { emf: 'found', uv: 'found', freezing: 'found' } })
    expect(jinn.note).toBeNull()
    expect(normalSpeedNote([])).toBeNull()
  })

  it('une preuve cochée barre les mêmes entités dans les colonnes que dans le registre', () => {
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({ filter: { evidenceCount: 3, evidence: { emf: 'found' }, speed: [], huntAbove: null, los: null }, query: '' }))
    const el = renderCodex('?rang=vitesse')
    const rows = columns(el).flatMap((c) => c.rows)
    expect(rows.length).toBeGreaterThan(GHOSTS.length)
    let out = 0
    for (const g of GHOSTS) {
      const keeps = g.evidence.includes('emf')
      for (const li of named(rows, g)) {
        expect(li.classList.contains('is-out'), g.id).toBe(!keeps)
        expect(text(li.querySelector('.cx-link')), g.id).toBe(keeps ? g.name : `${g.name} (éliminée)`)
        expect(!!li.querySelector('.cx-strike'), g.id).toBe(!keeps)
        if (!keeps) out++
      }
    }
    expect(out).toBeGreaterThan(0)
  })
})

describe('Codex : arrivé d’une fiche par « voir les entités par vitesse » ou « par seuil de chasse »', () => {
  const FILTER_KEY = 'phasmo-coach/codex-filter'
  const EMF_FOUND = { filter: { evidenceCount: 3, evidence: { emf: 'found' }, speed: [], huntAbove: null, los: null }, query: '' }
  const g = globalThis as { matchMedia?: unknown }
  const realMatchMedia = g.matchMedia
  afterEach(() => {
    sessionStorage.removeItem(FILTER_KEY)
    g.matchMedia = realMatchMedia
  })
  /** un écran de téléphone : le registre n'y montre d'emblée que les entités encore possibles */
  const asPhone = () => {
    g.matchMedia = (q: string) => ({ matches: q === '(max-width: 759px)', media: q, addEventListener() {}, removeEventListener() {} })
  }
  const deogenRows = (el: HTMLElement) => [...el.querySelectorAll('.cx-ledger li')].filter((li) => li.querySelector('.cx-link')?.firstChild?.textContent === 'Deogen')

  it('sur téléphone, une preuve cochée : les éliminées restent dans la liste, barrées (l’entité qu’on vient de quitter y est)', () => {
    asPhone()
    sessionStorage.setItem(FILTER_KEY, JSON.stringify(EMF_FOUND))
    // par l'onglet : seulement ce qui reste possible, le Deogen (sans EMF 5) n'y est pas
    const tab = renderPage('/codex?rang=vitesse', '/codex', h(Codex))
    expect(tab.querySelectorAll('.cx-ledger li').length).toBeGreaterThan(0)
    expect(deogenRows(tab)).toHaveLength(0)
    // par le lien de la fiche du Deogen : sa ligne est là, barrée
    const el = renderPage({ pathname: '/codex', search: '?rang=vitesse', state: TO_REGISTRY }, '/codex', h(Codex))
    const rows = deogenRows(el)
    expect(rows.length).toBeGreaterThan(0)
    for (const li of rows) {
      expect(li.classList.contains('is-out')).toBe(true)
      expect(li.querySelector('.cx-strike')).not.toBeNull()
    }
    // « les masquer » marche toujours
    const toggle = el.querySelector<HTMLButtonElement>('.cx-out-toggle')!
    expect(text(toggle)).toBe('les masquer')
    act(() => toggle.click())
    expect(deogenRows(el)).toHaveLength(0)
    expect(text(el.querySelector('.cx-out-toggle'))).toBe('les revoir')
  })

  it('une recherche tapée, une fiche, le lien vers le codex rangé, deux retours arrière : la recherche est toujours là', () => {
    let nav!: NavigateFunction
    const Grab = () => {
      nav = useNavigate()
      return null
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    mounted.push({ root, host })
    act(() => {
      root.render(
        h(
          StoreProvider,
          null,
          h(
            ToastProvider,
            null,
            h(
              MemoryRouter,
              { initialEntries: ['/codex?rang=vitesse'] },
              h(Grab),
              h(Routes, null, h(Route, { path: '/codex', element: h(Codex) }), h(Route, { path: '/codex/:id', element: h(GhostPage) })),
            ),
          ),
        ),
      )
    })
    const search = () => host.querySelector<HTMLInputElement>('.cx-search input')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(search(), 'froid')
      search().dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(search().value).toBe('froid')
    expect(JSON.parse(sessionStorage.getItem(FILTER_KEY)!).query).toBe('froid')
    // la fiche du Hantu, puis son lien « voir les entités par seuil de chasse » : un codex neuf, sans recherche
    act(() => nav('/codex/hantu', { state: FROM_CODEX }))
    expect(host.querySelector('.cx-search')).toBeNull()
    act(() => nav('/codex?rang=seuil', { state: TO_REGISTRY }))
    expect(search().value).toBe('')
    expect(host.querySelector('.cx-rank .opt[aria-pressed="true"]')?.textContent).toBe('seuil de chasse')
    // deux retours arrière (la fiche, puis le codex où la recherche a été tapée) : il la retrouve
    act(() => nav(-1))
    expect(host.querySelector('.cx-search')).toBeNull()
    act(() => nav(-1))
    expect(host.querySelector('.cx-rank .opt[aria-pressed="true"]')?.textContent).toBe('vitesse')
    expect(search().value).toBe('froid')
  })
})

describe('Fiche : de la vitesse et du seuil vers le registre rangé du Codex', () => {
  it('« voir les entités par seuil de chasse » et « par vitesse », à côté de chaque mesure', () => {
    const el = renderFiche('hantu')
    const links = [...el.querySelectorAll('.measure .measure-see a')]
    expect(links.map(text)).toEqual(['voir les entités par seuil de chasse', 'voir les entités par vitesse'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/codex?rang=seuil', '/codex?rang=vitesse'])
    // chacun juste sous la ligne de sa mesure
    expect(text(links[0].closest('.measure')!.querySelector('h3'))).toBe('Seuil de chasse')
    expect(text(links[1].closest('.measure')!.querySelector('h3'))).toBe('Vitesse en chasse')
    for (const a of links) expect(a.parentElement!.previousElementSibling?.className).toBe('measure-head')
  })
})

describe('Fiche : « Signaler une erreur » depuis le sommaire', () => {
  it('le sommaire finit par « Signaler une erreur », qui ouvre la fenêtre de signalement', () => {
    const el = renderFiche('hantu')
    const links = [...el.querySelectorAll('.gh-toc .link')]
    const last = links.at(-1) as HTMLButtonElement
    expect(text(last)).toBe('Signaler une erreur')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    act(() => last.click())
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(text(dialog)).toContain('Hantu')
  })
})

describe('Ma progression : un chemin de retour vers le profil', () => {
  it('« ‹ Profil » en tête de page, comme « ‹ Exercices » sur les exercices', () => {
    const el = renderPage('/progression', '/progression', h(ProgressPage))
    const back = el.querySelector('.filehead a')
    expect(text(back)).toBe('‹ Profil')
    expect(back?.getAttribute('href')).toBe('/profil')
  })
})

describe('Mes notes : le carnet de preuves de la partie est ailleurs', () => {
  it('une ligne en haut de la page mène au Codex', () => {
    const el = renderPage('/carnet', '/carnet', h(Notebook))
    const line = el.querySelector('.carnet-codex')
    expect(text(line)).toMatch(/^le carnet de preuves de ta partie est dans le Codex : ouvrir le carnet de preuves$/)
    expect(line?.querySelector('a')?.getAttribute('href')).toBe('/codex')
    // tout en haut : avant le formulaire de la note
    const form = el.querySelector('.carnet-consigne')!
    expect(line!.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Installer l’app sur ordinateur : le choix du téléphone juste au-dessus des étapes qu’il change', () => {
  it('« Les étapes pour » vient avant la fiche des étapes, et la fiche avant le code QR', () => {
    const el = renderPage('/installer', '/installer', h(InstallPage))
    const chooser = el.querySelector('.install-choose--open')!
    expect(text(chooser)).toMatch(/^Les étapes pour/)
    const iphone = [...chooser.querySelectorAll('button')].find((b) => text(b) === 'iPhone')!
    act(() => iphone.click())
    const guide = el.querySelector('#marche-a-suivre')!
    expect(text(guide)).toContain('Sur iPhone, avec Safari')
    const phone = el.querySelector('.install-phone')!
    expect(chooser.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(guide.compareDocumentPosition(phone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // rien entre le choix et la fiche
    expect(chooser.nextElementSibling).toBe(guide)
  })
})
