import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { GHOSTS, JOURNAL_GHOSTS, JOURNAL_ORDER } from '../data'
import { FAMILY_COPY, FAMILY_ORDER, SANITY_FAMILY_COPY, SANITY_FAMILY_ORDER, sanityFamilies, sanityFamily, sanityFamilyNote, speedFamilies, speedFamily, speedFamilyNote } from '../engine/families'
import { NBSP } from '../engine/format'
import { pairZeroVariants, testException } from '../engine/fiche'
import { StoreProvider } from '../store/store'
import { ToastProvider } from '../components/Toast'
import { Codex, normalSpeedNote } from './Codex'
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
    // Spectre, Djinn, Ombre et Moroï
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
  const named = (rows: Element[], g: { name: string }) => rows.filter((li) => li.querySelector('.cx-link')?.firstChild?.textContent === g.name)
  /** les cases d'un tableau de familles (vitesse ou seuil de chasse) : leur titre, leur légende, leurs lignes */
  const boxes = (el: HTMLElement) =>
    [...el.querySelectorAll('.sf [role="group"]')].map((box) => ({
      box,
      title: text(box.querySelector('h3')),
      def: text(box.querySelector('.sf-def')),
      label: box.getAttribute('aria-label'),
      rows: [...box.querySelectorAll('ul > li')],
    }))
  const boardRows = (el: HTMLElement) => boxes(el).flatMap((b) => b.rows)

  it('dans l’ordre du jeu (d’office) : les 30 lignes dans l’ordre du journal du jeu, chacune avec le mot de sa vitesse', () => {
    const el = renderCodex()
    const group = el.querySelector('.cx-rank [role="group"]')!
    expect(group.getAttribute('aria-label')).toBe('Ranger le registre par')
    expect(text(el.querySelector('.cx-rank .typed-label'))).toBe('Ranger par')
    expect([...group.querySelectorAll('button')].map(text)).toEqual(['ordre du jeu', 'vitesse', 'seuil de chasse'])
    expect(pressed(el)).toEqual(['ordre du jeu'])
    expect(el.querySelector('.sf')).toBeNull()
    expect(text(el.querySelector('.cx-right .filehead'))).toContain('Ordre du journal du jeu')
    const rows = [...el.querySelectorAll('ol.cx-reg > li')]
    expect(rows.map((li) => li.querySelector('.cx-link')?.textContent)).toEqual(JOURNAL_GHOSTS.map((g) => g.name))
    // numérotées de 01 à 30 dans cet ordre : Aswang en tête, Yurei en dernier
    expect(rows.map((li) => text(li.querySelector('.cx-num')))).toEqual(JOURNAL_GHOSTS.map((_, i) => String(i + 1).padStart(2, '0')))
    expect([rows[0], rows[29]].map((li) => li.querySelector('.cx-link')?.textContent)).toEqual(['Aswang', 'Yurei'])
    rows.forEach((li, i) => {
      const g = JOURNAL_GHOSTS[i]
      // le mot est la famille de vitesse du classement du coach
      expect(text(li.querySelector('.cx-cls')), g.id).toBe(`Vitesse : ${speedFamily(g)}`)
    })
    const word = (id: string) => text(rows[JOURNAL_ORDER.indexOf(id)].querySelector('.cx-cls'))
    expect(word('aswang')).toBe('Vitesse : lente')
    expect(word('spirit')).toBe('Vitesse : normale')
    expect(word('the-twins')).toBe('Vitesse : lente')
    expect(word('thaye')).toBe('Vitesse : rapide')
    expect(word('moroi')).toBe('Vitesse : rapide')
    expect(word('jinn')).toBe('Vitesse : variable')
    // après le mot, les m/s ; le Mimic, « variable », n'écrit pas ses 1,7 m/s à côté : il dit qu'il copie
    const speed = (id: string) => text(rows[JOURNAL_ORDER.indexOf(id)].querySelector('.cx-speed'))
    expect(speed('spirit')).toBe(', 1,7 m/s')
    expect(speed('the-mimic')).toBe(", copie l'entité imitée")
  })

  it('?rang=vitesse : les quatre cases du coach, chaque entité une seule fois, avec ce qui change sa vitesse', () => {
    const el = renderCodex('?rang=vitesse')
    expect(pressed(el)).toEqual(['vitesse'])
    expect(text(el.querySelector('.cx-right .filehead'))).toContain('Rangé par vitesse')
    expect(el.querySelector('ol.cx-reg')).toBeNull()
    const bs = boxes(el)
    expect(bs.map((b) => b.title)).toEqual(['Lentes', 'Rapides', 'Changent de vitesse', 'Normales'])
    expect(bs.map((b) => b.label)).toEqual(['Entités lentes', 'Entités rapides', 'Entités qui changent de vitesse', 'Entités à vitesse normale'])
    expect(bs.map((b) => b.def)).toEqual([
      '5 entités · moins vite que la normale',
      '5 entités · plus vite que la normale',
      '5 entités · selon la situation',
      '15 entités · toujours 1,7 m/s',
    ])
    const names = (i: number) => bs[i].rows.map((li) => li.querySelector('.cx-link')?.firstChild?.textContent)
    // le classement validé par le coach le 18 novembre, dans l'ordre du journal du jeu
    expect(names(0)).toEqual(['Aswang', 'Dayan', 'Hantu', 'Obambo', 'Les Jumeaux'])
    expect(names(1)).toEqual(['Deildegast', 'Deogen', 'Moroï', 'Revenant', 'Thayé'])
    expect(names(2)).toEqual(['Gallu', 'Djinn', 'Kormos', 'Raiju', 'Le Mimic'])
    expect(names(3)).toHaveLength(15)
    // chaque entité une fois et une seule, dans la case de sa famille, avec son lien
    const families = speedFamilies(JOURNAL_GHOSTS)
    expect(families.map((f) => f.id)).toEqual([...FAMILY_ORDER])
    for (const g of GHOSTS) {
      const lines = named(boardRows(el), g)
      expect(lines, g.id).toHaveLength(1)
      expect(lines[0].querySelector('a')?.getAttribute('href')).toBe(`/codex/${g.id}`)
      const i = FAMILY_ORDER.indexOf(speedFamily(g))
      expect(bs[i].rows.includes(lines[0]), g.id).toBe(true)
      expect(bs[i].title).toBe(FAMILY_COPY[speedFamily(g)].title)
      // au crayon, ce qui change sa vitesse ; rien pour une entité normale
      const note = speedFamilyNote(g)
      expect(lines[0].querySelector('.cx-fnote')?.textContent ?? null, g.id).toBe(note ? ` : ${note}` : null)
    }
    const line = (id: string) => text(named(boardRows(el), GHOSTS.find((g) => g.id === id)!)[0])
    expect(line('thaye')).toBe('Thayé : ralentit en vieillissant')
    expect(line('moroi')).toBe('Moroï : plus lent quand la santé mentale est haute')
    expect(line('revenant')).toBe("Revenant : lent tant qu'il ne te détecte pas")
    expect(line('hantu')).toBe('Hantu : rapide dans le froid')
    expect(line('the-twins')).toBe('Les Jumeaux : un jumeau lent, un jumeau rapide')
    expect(line('dayan')).toBe("Dayan : près d'elle : lente si tu restes immobile, rapide si tu bouges")
    expect(line('jinn')).toBe('Djinn : accélère de loin quand il te voit, disjoncteur allumé')
    expect(line('spirit')).toBe('Esprit')
    // typographie de fr() : le nombre tient à son unité, l'apostrophe est courbe
    expect(el.querySelector('.sf')!.textContent).not.toMatch(/\d (?:m\/s|%|m\b)|'/)
    expect(text(el.querySelector('.cx-rank-hint'))).toBe('le classement du coach : une seule case par entité · à côté du nom, ce qui change sa vitesse')
  })

  it('?rang=seuil : les quatre cases du coach, chaque entité une seule fois, avec son seuil et ce qui le change', () => {
    const el = renderCodex('?rang=seuil')
    expect(pressed(el)).toEqual(['seuil de chasse'])
    expect(text(el.querySelector('.cx-right .filehead'))).toContain('Rangé par seuil de chasse')
    expect(el.querySelector('ol.cx-reg')).toBeNull()
    const bs = boxes(el)
    expect(bs.map((b) => b.title)).toEqual(['Chassent tôt', 'Chassent tard', 'Seuil qui change', 'Normales'])
    expect(bs.map((b) => b.label)).toEqual(['Entités qui chassent tôt', 'Entités qui chassent tard', 'Entités dont le seuil de chasse change', 'Entités au seuil de chasse normal'])
    expect(bs.map((b) => b.def)).toEqual(['3 entités · au-dessus de 50 %', '2 entités · sous 50 %', '9 entités · selon la situation', '16 entités · toujours 50 %'])
    const names = (i: number) => bs[i].rows.map((li) => li.querySelector('.cx-link')?.firstChild?.textContent)
    // le classement validé par le coach le 18 novembre, dans l'ordre du journal du jeu
    expect(names(0)).toEqual(['Démon', 'Onryo', 'Thayé'])
    expect(names(1)).toEqual(['Deogen', 'Ombre'])
    expect(names(2)).toEqual(['Banshee', 'Dayan', 'Gallu', 'Kormos', 'Cauchemar', 'Obambo', 'Raiju', 'Le Mimic', 'Yokai'])
    expect(names(3)).toHaveLength(16)
    // chaque entité une fois et une seule (plus de Banshee dans trois colonnes), dans la case de sa famille, avec son lien
    const families = sanityFamilies(JOURNAL_GHOSTS)
    expect(families.map((f) => f.id)).toEqual([...SANITY_FAMILY_ORDER])
    for (const g of GHOSTS) {
      const lines = named(boardRows(el), g)
      expect(lines, g.id).toHaveLength(1)
      expect(lines[0].querySelector('a')?.getAttribute('href')).toBe(`/codex/${g.id}`)
      const i = SANITY_FAMILY_ORDER.indexOf(sanityFamily(g))
      expect(bs[i].rows.includes(lines[0]), g.id).toBe(true)
      expect(bs[i].title).toBe(SANITY_FAMILY_COPY[sanityFamily(g)].title)
      // au crayon, son seuil et ce qui le change ; rien pour une entité normale
      const note = sanityFamilyNote(g)
      expect(lines[0].querySelector('.cx-fnote')?.textContent ?? null, g.id).toBe(note ? ` : ${note}` : null)
    }
    const line = (id: string) => text(named(boardRows(el), GHOSTS.find((g) => g.id === id)!)[0])
    expect(line('demon')).toBe('Démon : 70 % · à toute santé mentale avec sa capacité')
    expect(line('shade')).toBe('Ombre : 35 %')
    expect(line('banshee')).toBe("Banshee : 50 % de sa cible, pas de l'équipe")
    expect(line('gallu')).toBe('Gallu : 60 % enragé · 40 % affaibli')
    expect(line('the-mimic')).toBe("Le Mimic : copie le seuil de l'entité imitée")
    expect(line('spirit')).toBe('Esprit')
    // typographie de fr() : le nombre tient à son unité, l'apostrophe est courbe
    expect(el.querySelector('.sf')!.textContent).not.toMatch(/\d (?:m\/s|%|m\b)|'/)
    expect(el.querySelector('.sf')!.textContent).toContain(`50${NBSP}%`)
    expect(text(el.querySelector('.cx-rank-hint'))).toBe(
      'seuil de chasse : la santé mentale moyenne à partir de laquelle une chasse peut démarrerle classement du coach : une seule case par entité · à côté du nom, son seuil et ce qui le change',
    )
  })

  it('le sélecteur change l’ordre sur place, et revient à l’ordre du journal', () => {
    const el = renderCodex()
    const button = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('.cx-rank .opt')].find((b) => text(b) === label)!
    act(() => button('vitesse').click())
    expect(pressed(el)).toEqual(['vitesse'])
    expect(boxes(el).map((b) => b.title)).toEqual(['Lentes', 'Rapides', 'Changent de vitesse', 'Normales'])
    act(() => button('seuil de chasse').click())
    expect(pressed(el)).toEqual(['seuil de chasse'])
    expect(boxes(el).map((b) => b.title)).toEqual(['Chassent tôt', 'Chassent tard', 'Seuil qui change', 'Normales'])
    expect(el.querySelector('ol.cx-reg')).toBeNull()
    act(() => button('ordre du jeu').click())
    expect(el.querySelector('.sf')).toBeNull()
    expect(el.querySelectorAll('ol.cx-reg > li')).toHaveLength(GHOSTS.length)
  })

  it('« normale » cochée dans le carnet : Hantu, Moroï, Thayé et Deildegast restent possibles, et la page dit pourquoi', () => {
    const NNBSP = '\u202f'
    expect(normalSpeedNote(GHOSTS)).toBe(
      `Le Hantu, le Moroï, le Thayé et le Deildegast restent possibles${NNBSP}: leur vitesse change par paliers et passe par 1,7${NBSP}m/s ou tout près`,
    )
    // sur la page, dans l'ordre du journal du jeu
    expect(normalSpeedNote(JOURNAL_GHOSTS)).toBe(
      `Le Deildegast, le Hantu, le Moroï et le Thayé restent possibles${NNBSP}: leur vitesse change par paliers et passe par 1,7${NBSP}m/s ou tout près`,
    )
    // sans le critère : pas de note
    expect(renderCodex('?rang=vitesse').querySelector('.cx-field-why')).toBeNull()
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({ filter: { evidenceCount: 3, evidence: {}, speed: ['normal'], huntAbove: null, los: null }, query: '' }))
    const el = renderCodex('?rang=vitesse')
    expect(text(el.querySelector('.cx-field-why'))).toBe('Le Deildegast, le Hantu, le Moroï et le Thayé restent possibles : leur vitesse change par paliers et passe par 1,7 m/s ou tout près')
    const rows = boardRows(el)
    for (const id of ['hantu', 'moroi', 'thaye', 'deildegast']) {
      const g = GHOSTS.find((o) => o.id === id)!
      // gardées par le filtre (comme chez tybayn), sans être pour autant des entités normales
      const lines = named(rows, g)
      expect(lines, id).toHaveLength(1)
      expect(lines[0].classList.contains('is-out'), id).toBe(false)
      expect(speedFamily(g), id).not.toBe('normale')
    }
    // une entité qui n'est jamais à 1,7 m/s est bien barrée (l'Aswang, le Revenant)
    for (const id of ['aswang', 'revenant']) {
      const g = GHOSTS.find((o) => o.id === id)!
      for (const li of named(rows, g)) expect(li.classList.contains('is-out'), id).toBe(true)
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
      const lines = named(boardRows(el), g)
      expect(lines.length, id).toBeGreaterThan(0)
      return lines.every((li) => li.classList.contains('is-out'))
    }
    // EMF 5 trouvé : des quatre, seul le Deildegast a cette preuve
    const emf = note({ evidence: { emf: 'found' } })
    expect(text(emf.note)).toBe('Le Deildegast reste possible : sa vitesse change par paliers et passe par 1,7 m/s ou tout près')
    expect(['hantu', 'moroi', 'thaye'].map((id) => struck(emf.el, id))).toEqual([true, true, true])
    expect(struck(emf.el, 'deildegast')).toBe(false)
    // accélère en ligne de vue : des quatre, seul le Moroï
    const los = note({ los: true })
    expect(text(los.note)).toBe('Le Moroï reste possible : sa vitesse change par paliers et passe par 1,7 m/s ou tout près')
    // le carnet écarte les quatre (EMF 5, UV et températures glaciales : le Djinn) : plus de note
    const jinn = note({ evidence: { emf: 'found', uv: 'found', freezing: 'found' } })
    expect(jinn.note).toBeNull()
    expect(normalSpeedNote([])).toBeNull()
  })

  it('une preuve cochée barre les mêmes entités dans les deux tableaux que dans le registre', () => {
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({ filter: { evidenceCount: 3, evidence: { emf: 'found' }, speed: [], huntAbove: null, los: null }, query: '' }))
    // par seuil comme par vitesse, une seule ligne par entité
    const rows = [...boardRows(renderCodex('?rang=seuil')), ...boardRows(renderCodex('?rang=vitesse'))]
    expect(rows).toHaveLength(2 * GHOSTS.length)
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
  const deogenRows = (el: HTMLElement) => [...el.querySelectorAll('.sf li')].filter((li) => li.querySelector('.cx-link')?.firstChild?.textContent === 'Deogen')

  it('sur téléphone, une preuve cochée : les éliminées restent dans la liste, barrées (l’entité qu’on vient de quitter y est)', () => {
    asPhone()
    sessionStorage.setItem(FILTER_KEY, JSON.stringify(EMF_FOUND))
    // par l'onglet : seulement ce qui reste possible, le Deogen (sans EMF 5) n'y est pas
    const tab = renderPage('/codex?rang=vitesse', '/codex', h(Codex))
    expect(tab.querySelectorAll('.sf li').length).toBeGreaterThan(0)
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
