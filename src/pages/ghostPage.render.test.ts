import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { StoreProvider } from '../store/store'
import { ToastProvider } from '../components/Toast'
import { GhostPage } from './GhostPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom n'a pas ResizeObserver (le carnet mesure ses pages) : un observateur qui ne voit rien suffit ici
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

function renderFiche(id: string): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      h(StoreProvider, null, h(ToastProvider, null, h(MemoryRouter, { initialEntries: [`/codex/${id}`] }, h(Routes, null, h(Route, { path: '/codex/:id', element: h(GhostPage) }))))),
    )
  })
  return host
}

describe('probe', () => {
  it('renders', () => {
    const el = renderFiche('wraith')
    console.log(el.querySelector('.gh-toc')?.textContent)
    expect(el.textContent).toContain('Spectre')
  })
})
