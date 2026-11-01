import { useSyncExternalStore } from 'react'
import { isStandalone } from './engine/device'

/**
 * L'invitation à installer de Chrome, Edge ou Samsung Internet (`beforeinstallprompt`). Elle n'arrive
 * qu'une fois, tôt, souvent avant que la page « Installer l'app » soit affichée : ce module est importé en
 * premier par main.tsx, la garde de côté, et la ressort quand on touche le bouton.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>
}

export interface InstallState {
  /** Le navigateur peut ouvrir sa fenêtre d'installation (l'invitation est gardée). */
  canPrompt: boolean
  /** L'installation vient de se faire (événement `appinstalled`). */
  installed: boolean
}

let deferred: InstallPromptEvent | null = null
let state: InstallState = { canPrompt: false, installed: false }
const listeners = new Set<() => void>()

function set(next: Partial<InstallState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

let started = false

/** Branche la capture (une seule fois). Appelée à l'import, avant le premier rendu. */
export function captureInstallPrompt() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('beforeinstallprompt', (e) => {
    // pas de bandeau du navigateur : c'est le bouton de la page qui ouvre la fenêtre, au bon moment
    e.preventDefault()
    deferred = e as InstallPromptEvent
    set({ canPrompt: true })
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    set({ canPrompt: false, installed: true })
  })
}

captureInstallPrompt()

/**
 * Ouvre la fenêtre d'installation du navigateur. 'unavailable' : pas d'invitation gardée (déjà refusée,
 * Firefox, Safari…), il faut passer par le menu du navigateur.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred
  if (!e) return 'unavailable'
  // une invitation ne sert qu'une fois : le navigateur en renverra une autre s'il le juge utile
  deferred = null
  set({ canPrompt: false })
  try {
    await e.prompt()
    const choice = await e.userChoice
    return choice.outcome === 'accepted' ? 'accepted' : 'dismissed'
  } catch {
    return 'unavailable'
  }
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function getInstallState(): InstallState {
  return state
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getInstallState)
}

/** Les liens « Installer l'app » n'ont plus lieu d'être : app ouverte installée, ou installée à l'instant. */
export function useAppInstalled(): boolean {
  const standalone = useStandalone()
  const { installed } = useInstallState()
  return standalone || installed
}

const STANDALONE = '(display-mode: standalone)'

/** L'app est-elle ouverte installée ? Suit le changement (Chrome bascule l'onglet en fenêtre d'app). */
export function useStandalone(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof matchMedia === 'undefined') return () => {}
      const mq = matchMedia(STANDALONE)
      mq.addEventListener?.('change', cb)
      return () => mq.removeEventListener?.('change', cb)
    },
    isStandalone,
  )
}
