import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { JOURNAL_GHOSTS, JOURNAL_ORDER } from '../data'
import { ToastProvider } from '../components/Toast'
import { StoreProvider } from '../store/store'
import { Codex } from './Codex'
import { GhostPage } from './GhostPage'
import { ProgressPage } from './Progress'
import { Scenario } from './Scenario'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom n'a pas ResizeObserver (le carnet mesure ses pages) : un observateur qui ne voit rien suffit ici
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// jsdom n'a pas window.scrollTo (la page des contrats remonte en haut au démarrage)
window.scrollTo = (() => {}) as typeof window.scrollTo

const FILTER_KEY = 'phasmo-coach/codex-filter'
const mounted: { root: Root; host: HTMLElement }[] = []
afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount())
    host.remove()
  }
  sessionStorage.removeItem(FILTER_KEY)
})

function renderPage(path: string, route: string, element: ReactElement): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => {
    root.render(h(StoreProvider, null, h(ToastProvider, null, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: route, element }))))))
  })
  return host
}
const renderCodex = (search = '') => renderPage(`/codex${search}`, '/codex', h(Codex))
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/[  ]/g, ' ').replace(/[’]/g, "'")
const cells = (el: HTMLElement) => [...el.querySelectorAll('ol.jg > li')]
const nameOf = (li: Element) => li.querySelector('.jg-name')?.firstChild?.textContent ?? ''
const withNotebook = (evidence: Record<string, 'found' | 'excluded'>, query = '') =>
  sessionStorage.setItem(FILTER_KEY, JSON.stringify({ filter: { evidenceCount: 3, evidence, speed: [], huntAbove: null, los: null }, query }))

/** La page « Preuves » du journal du jeu en français, photographiée par le coach le 18 novembre 2026 (le jeu écrit « Moroï »). */
const PHOTO = [
  ['Aswang', 'Banshee', 'Dayan'],
  ['Deildegast', 'Démon', 'Deogen'],
  ['Gallu', 'Goryo', 'Hantu'],
  ['Djinn', 'Kormos', 'Cauchemar'],
  ['Moroi', 'Myling', 'Obake'],
  ['Obambo', 'Oni', 'Onryo'],
  ['Fantôme', 'Poltergeist', 'Raiju'],
  ['Revenant', 'Ombre', 'Esprit'],
  ['Thayé', 'Le Mimic', 'Les Jumeaux'],
  ['Spectre', 'Yokai', 'Yurei'],
]

describe('Codex : la grille du journal du jeu', () => {
  it('les 30 noms sur trois colonnes, ligne par ligne comme sur la photo du journal, chacun ouvrant sa fiche', () => {
    const el = renderCodex()
    const grid = el.querySelector<HTMLElement>('ol.jg')!
    expect(grid.style.getPropertyValue('--jg-cols')).toBe('3')
    expect(grid.getAttribute('aria-label')).toBe('Les entités, à la même place que dans le journal du jeu')
    const list = cells(el)
    expect(list.map(nameOf)).toEqual(PHOTO.flat())
    expect(list.map((li) => li.querySelector('a')?.getAttribute('href'))).toEqual(JOURNAL_ORDER.map((id) => `/codex/${id}`))
    // rien de barré tant que le carnet est vide
    expect(el.querySelectorAll('ol.jg .is-out')).toHaveLength(0)
    expect(el.querySelectorAll('ol.jg .cx-strike')).toHaveLength(0)
    expect(text(el.querySelector('.jg-note'))).toBe('à la même place que dans le journal du jeu')
    // la grille vient avant le registre détaillé, qui suit le même ordre
    const rank = el.querySelector('.cx-rank')!
    expect(grid.compareDocumentPosition(rank) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect([...el.querySelectorAll('ol.cx-reg > li .cx-link')].map((a) => a.textContent)).toEqual(PHOTO.flat())
  })

  it('une preuve cochée : les entités écartées restent à leur place, barrées ; aucune case ne bouge', () => {
    withNotebook({ emf: 'found' })
    const el = renderCodex()
    const list = cells(el)
    expect(list.map(nameOf)).toEqual(PHOTO.flat())
    let out = 0
    list.forEach((li, i) => {
      const g = JOURNAL_GHOSTS[i]
      const keeps = g.evidence.includes('emf')
      expect(li.classList.contains('is-out'), g.id).toBe(!keeps)
      expect(!!li.querySelector('.cx-strike'), g.id).toBe(!keeps)
      expect(text(li.querySelector('a')), g.id).toBe(keeps ? g.name : `${g.name} (éliminée)`)
      if (!keeps) out++
    })
    // les entités sans EMF 5 ; le compteur du registre dit la même chose
    expect(out).toBe(JOURNAL_GHOSTS.filter((g) => !g.evidence.includes('emf')).length)
    expect(text(el.querySelector('.cx-count-n'))).toBe(`${30 - out} possibles`)
  })

  it('le carnet conclut : la dernière entité possible est entourée dans sa case, les 29 autres barrées', () => {
    // EMF 5, Spirit Box et écriture : l'Esprit
    withNotebook({ emf: 'found', spiritbox: 'found', writing: 'found' })
    const el = renderCodex()
    const list = cells(el)
    const only = list.filter((li) => li.classList.contains('is-only'))
    expect(only.map(nameOf)).toEqual(['Esprit'])
    expect(list.indexOf(only[0])).toBe(JOURNAL_ORDER.indexOf('spirit'))
    expect(only[0].querySelector('.rough')).not.toBeNull()
    expect(list.filter((li) => li.classList.contains('is-out'))).toHaveLength(29)
  })

  it('une recherche est une consultation : la grille lui laisse la place, et revient quand on l’efface', () => {
    const el = renderCodex()
    const search = el.querySelector<HTMLInputElement>('input[type="search"], .cx-search input')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    const type = (value: string) =>
      act(() => {
        setValue.call(search, value)
        search.dispatchEvent(new Event('input', { bubbles: true }))
      })
    expect(el.querySelector('ol.jg')).not.toBeNull()
    type('sel')
    expect(el.querySelector('ol.jg')).toBeNull()
    expect(text(el.querySelector('.cx-searchline'))).toContain('sel')
    type('')
    expect(cells(el).map(nameOf)).toEqual(PHOTO.flat())
  })

  it('rangé par vitesse ou par seuil : la grille reste en tête, à l’identique', () => {
    for (const search of ['?rang=vitesse', '?rang=seuil']) {
      const el = renderCodex(search)
      expect(cells(el).map(nameOf), search).toEqual(PHOTO.flat())
    }
  })
})

describe('Fiche : son numéro et ses voisines suivent le journal du jeu', () => {
  const renderFiche = (id: string) => renderPage(`/codex/${id}`, '/codex/:id', h(GhostPage))

  it('l’Aswang est la fiche 1, le Yurei la fiche 30, l’Esprit la fiche 24', () => {
    for (const [id, n] of [
      ['aswang', 1],
      ['spirit', 24],
      ['yurei', 30],
    ] as const) {
      const el = renderFiche(id)
      expect(text(el), id).toContain(`Fiche ${n} / 30`)
      expect(text(el), id).toContain(`n° ${n}`)
    }
  })
})

describe('La même grille ailleurs : registre de la progression et mises en situation', () => {
  it('« Ma progression » : les 30 noms dans l’ordre du journal, sur trois colonnes, sans numéro', () => {
    const el = renderPage('/progression', '/progression', h(ProgressPage))
    const reg = el.querySelector<HTMLElement>('ol.registry')!
    expect(reg.style.getPropertyValue('--jg-cols')).toBe('3')
    expect([...reg.querySelectorAll(':scope > li .nm')].map((a) => a.textContent)).toEqual(PHOTO.flat())
    expect([...reg.querySelectorAll(':scope > li .nm')].map((a) => a.getAttribute('href'))).toEqual(JOURNAL_ORDER.map((id) => `/codex/${id}`))
    expect(reg.querySelector('.num')).toBeNull()
    expect(reg.querySelectorAll(':scope > li .pct')).toHaveLength(30)
  })

  it('mise en situation : la grille garde les 30 noms à leur place ; les preuves barrent, et on barre aussi à la main', () => {
    const el = renderPage('/enquete', '/enquete', h(Scenario))
    const start = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => /Commencer le contrat/.test(b.textContent ?? ''))!
    act(() => start.click())
    const grid = el.querySelector<HTMLElement>('.sc-cands')!
    expect(grid.tagName).toBe('OL')
    expect(grid.style.getPropertyValue('--jg-cols')).toBe('3')
    const buttons = () => [...grid.querySelectorAll<HTMLButtonElement>(':scope > li > .sc-cand')]
    const names = () => buttons().map((b) => b.firstChild?.textContent)
    expect(names()).toEqual(PHOTO.flat())
    // rien de barré au départ, tout se barre à la main
    expect(buttons().filter((b) => b.disabled)).toHaveLength(0)
    // une preuve trouvée : les entités qui ne l'ont pas restent à leur place, barrées, et ne se touchent plus
    const emf = [...el.querySelectorAll<HTMLButtonElement>('.sc-board button')].find((b) => /EMF niveau 5/.test(b.textContent ?? ''))!
    act(() => emf.click())
    expect(names()).toEqual(PHOTO.flat())
    buttons().forEach((b, i) => {
      const g = JOURNAL_GHOSTS[i]
      const keeps = g.evidence.includes('emf')
      expect(b.classList.contains('is-out'), g.id).toBe(!keeps)
      expect(b.disabled, g.id).toBe(!keeps)
      expect(text(b), g.id).toBe(keeps ? g.name : `${g.name} (écartée par tes preuves)`)
    })
    // barrer à la main une entité encore possible, puis la rétablir
    const free = buttons().find((b) => !b.disabled)!
    act(() => free.click())
    expect(free.classList.contains('is-struck')).toBe(true)
    expect(free.getAttribute('aria-pressed')).toBe('true')
    expect(names()).toEqual(PHOTO.flat())
    act(() => free.click())
    expect(free.classList.contains('is-struck')).toBe(false)
  })
})
