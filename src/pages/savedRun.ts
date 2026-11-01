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
