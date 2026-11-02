import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { setUpdateGate, type UpdateGate } from '../engine/update'
import { UpdateNotice, UpdateOnNavigate } from './AppUpdate'
import { ToastProvider } from './Toast'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Une fausse attente de mise à jour : on compte les changements de page qui lui sont signalés. */
function fakeGate() {
  const calls = { route: 0 }
  const gate: UpdateGate = {
    pending: true,
    ready() {},
    interacted() {},
    hidden() {},
    visible() {},
    routeChanged() {
      calls.route++
    },
    picking() {},
  }
  return { gate, calls }
}

let go: ((to: string) => void) | null = null
function Driver() {
  const navigate = useNavigate()
  go = (to) => navigate(to)
  return null
}

function mount(children: ReturnType<typeof h>[]) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(h(ToastProvider, null, h(MemoryRouter, { initialEntries: ['/codex'] }, ...children))))
  return {
    host,
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
  }
}

afterEach(() => setUpdateGate(null))

describe('Nouvelle version en attente : le changement de page est un bon moment', () => {
  it('signalé à chaque nouvelle page, pas à l’ouverture ni quand seul un paramètre de l’adresse change', () => {
    const { gate, calls } = fakeGate()
    setUpdateGate(gate)
    const m = mount([h(UpdateOnNavigate, { key: 'u' }), h(Driver, { key: 'd' })])
    expect(calls.route).toBe(0)
    // une recherche tapée dans le codex s'écrit dans l'adresse : ce n'est pas un changement de page
    act(() => go!('/codex?q=ban'))
    expect(calls.route).toBe(0)
    act(() => go!('/codex/banshee'))
    expect(calls.route).toBe(1)
    act(() => go!('/revision'))
    expect(calls.route).toBe(2)
    m.unmount()
  })

  it('sans service worker (aucune attente branchée), changer de page ne fait rien', () => {
    const m = mount([h(UpdateOnNavigate, { key: 'u' }), h(Driver, { key: 'd' })])
    expect(() => act(() => go!('/carnet'))).not.toThrow()
    m.unmount()
  })
})

describe('Après la mise à jour : une ligne, en mots', () => {
  it('« Nouvelle version installée », une seule fois par chargement ; rien sans mise à jour', () => {
    const none = mount([h(UpdateNotice, { key: 'n', update: null })])
    expect(none.host.querySelector('.toast')).toBeNull()
    none.unmount()
    const m = mount([h(UpdateNotice, { key: 'n', update: { t: 1, path: '/', resume: false } })])
    expect([...m.host.querySelectorAll('.toast')].map((t) => t.textContent)).toEqual(['Nouvelle version installée'])
    m.unmount()
    // la page remontée (StrictMode, autre rendu) ne le redit pas
    const again = mount([h(UpdateNotice, { key: 'n', update: { t: 1, path: '/', resume: false } })])
    expect(again.host.querySelector('.toast')).toBeNull()
    again.unmount()
  })
})
