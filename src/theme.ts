import { useEffect, useSyncExternalStore } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'phasmo-coach/theme'
const listeners = new Set<() => void>()

function systemDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
}

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* stockage indisponible */
  }
  return 'system'
}

let current: ThemeChoice = read()

export function applyTheme(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && systemDark())
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0c0b' : '#33413a')
}

function setTheme(choice: ThemeChoice) {
  current = choice
  try {
    localStorage.setItem(KEY, choice)
  } catch {
    /* stockage indisponible */
  }
  applyTheme(choice)
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Thème clair, sombre ou celui de l'appareil ; partagé par toute l'app et mémorisé sur l'appareil. */
export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribe, () => current)

  // suit le réglage de l'appareil quand le choix est « automatique »
  useEffect(() => {
    if (choice !== 'system' || typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [choice])

  return [choice, setTheme]
}
