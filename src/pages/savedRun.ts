import { dayKey } from '../engine/format'

/**
 * Un exercice en cours (copie du quiz, série d'écoutes) gardé pour l'onglet et pour la journée : un détour par
 * un autre onglet, le bouton retour ou un rechargement ne le perd plus, la page propose de le reprendre.
 * Rien ne s'enregistre si le stockage est bloqué (navigation privée stricte) : l'exercice reste alors en mémoire.
 */
export function readRun<T>(key: string, valid: (run: T) => boolean, now = Date.now()): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const saved = JSON.parse(raw) as { day?: unknown; run?: T }
    if (saved?.day !== dayKey(now) || !saved.run || typeof saved.run !== 'object') return null
    return valid(saved.run) ? saved.run : null
  } catch {
    return null
  }
}

export function saveRun<T>(key: string, run: T, now = Date.now()): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ day: dayKey(now), run }))
  } catch {
    /* stockage indisponible : l'exercice ne survivra pas à un rechargement */
  }
}

export function clearRun(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* rien à effacer */
  }
}

/**
 * Le chemin que le navigateur vient de recharger (F5, tirer pour rafraîchir), d'après le type de la navigation
 * et l'adresse de la page (« #/enquete?contrat=… » → « /enquete ») ; null pour une ouverture ou un lien suivi.
 */
export function reloadedPath(type: string | undefined, hash: string): string | null {
  if (type !== 'reload') return null
  return hash.replace(/^#/, '').split('?')[0] || '/'
}

let reloaded: string | null = (() => {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return reloadedPath(nav?.type, window.location.hash)
  } catch {
    return null
  }
})()

/**
 * La page vient d'être rechargée sur ce chemin : l'exercice qu'on y faisait (copie, contrat, série) reprend de
 * lui-même, là où il en était, au lieu de rendre la page de réglages. Vrai jusqu'à ce qu'on quitte la page
 * (voir arrivedAt) : y revenir ensuite par un onglet ou un lien propose la reprise, sans la faire.
 */
export function reloadedOn(pathname: string): boolean {
  return reloaded === pathname
}

/** L'app affiche ce chemin : une autre page que celle qui a été rechargée, et le rechargement est oublié. */
export function arrivedAt(pathname: string): void {
  if (reloaded !== pathname) reloaded = null
}
