import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { GHOSTS } from '../data'
import { pairZeroVariants, testException } from '../engine/fiche'
import { StoreProvider } from '../store/store'
import { ToastProvider } from '../components/Toast'
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
function renderPage(path: string, route: string, element: ReactElement): HTMLElement {
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
    expect(text(variant)).toMatch(/^en partie sans preuve : peut se téléporter près d'un joueur choisi au hasard, en laissant un EMF 2 à son nouvel emplacement/)
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
    // le Spectre (Gallu enragé), l'Obake (« ou un Mimic en train de l'imiter ») et le Démon (un Onryo à Sunny Meadows)
    const expected: Record<string, number> = { wraith: 2, obake: 1, demon: 1 }
    for (const g of GHOSTS) {
      const named = g.confirmationTests.filter((t) => t.definitive && testException(t.text, GHOSTS)).length
      expect(named, g.id).toBe(expected[g.id] ?? 0)
    }
  })

  it('Obake et Démon : le tampon reste « Définitif », l’exception s’écrit à côté', () => {
    const obake = [...renderFiche('obake').querySelectorAll('.protocol')][1]
    expect(text(obake.querySelector('.stamp'))).toBe('Définitif')
    expect(text(obake.querySelector('.protocol-except'))).toBe('sauf Mimic, voir ci-dessous')
    const demon = [...renderFiche('demon').querySelectorAll('.protocol')][2]
    expect(text(demon.querySelector('.stamp'))).toBe('Définitif')
    expect(text(demon.querySelector('.protocol-except'))).toBe('sauf Onryo à Sunny Meadows, voir ci-dessous')
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
