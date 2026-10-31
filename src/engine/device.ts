/** Ce que l'app sait de l'appareil, pour guider l'installation et protéger le carnet. */

export type Platform = 'ios' | 'android' | 'other'

export function platform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  // iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

/** L'app tourne-t-elle installée (écran d'accueil) plutôt que dans un onglet du navigateur ? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches)
}

/**
 * Demande au navigateur de ne pas effacer le stockage de l'app (Chrome, Firefox ; Safari l'ignore
 * hors app installée). Sans effet visible si c'est refusé.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

/** Phrase d'installation adaptée à l'appareil, ou null si l'app est déjà installée. */
export function installHint(): string | null {
  if (isStandalone()) return null
  switch (platform()) {
    case 'ios':
      return 'Sur iPhone, installe le carnet : dans Safari, bouton Partager puis « Sur l’écran d’accueil ». Dans un simple onglet, Safari peut l’effacer après 7 jours sans visite.'
    case 'android':
      return 'Sur Android, installe le carnet : menu de Chrome puis « Installer l’application ». Il marchera aussi hors ligne.'
    default:
      return null
  }
}
