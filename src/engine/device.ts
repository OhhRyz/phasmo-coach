/** Ce que l'app sait de l'appareil, pour guider l'installation et protéger le carnet. */

export type Platform = 'ios' | 'android' | 'other'

/** Système : iPhone et iPad (« ios »), Android, ou un ordinateur (« desktop », tout le reste). */
export type Os = 'ios' | 'android' | 'desktop'
export type Browser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'opera' | 'other'

export interface Device {
  os: Os
  /** iPad, y compris en « mode ordinateur » (il se présente alors comme un Mac). */
  ipad: boolean
  browser: Browser
  /**
   * Version principale du navigateur quand elle compte, lue dans « Version/N » : Safari sur Mac (17 et plus sait
   * installer), Safari sur iPhone (26 et plus range Partager à gauche de l'adresse ; iOS 26 se dit encore
   * « iPhone OS 18_6 », seul « Version/26 » le trahit).
   */
  version: number | null
  /**
   * Navigateur intégré d'une autre app (Instagram, Facebook…) : le nom de l'app, « une autre app » si
   * on ne la reconnaît pas, null dans un vrai navigateur. On ne peut rien installer depuis là.
   */
  inApp: string | null
  /** L'app tourne déjà installée (ouverte depuis l'écran d'accueil). */
  standalone: boolean
}

/** Nom affiché quand le navigateur intégré n'est pas reconnu. */
export const UNKNOWN_APP = 'une autre app'

/** Navigateurs intégrés aux apps : on ne peut pas installer depuis là (le menu « … » renvoie au vrai navigateur). */
const IN_APPS: [RegExp, string][] = [
  [/Instagram/, 'Instagram'],
  // Messenger avant Facebook : il porte aussi les marques FBAN/FBAV
  [/Messenger|FB_IAB\/(MESSENGER|Orca)|FBAN\/MessengerForiOS/, 'Messenger'],
  [/FBAN|FBAV|FB_IAB|FBIOS|FB4A/, 'Facebook'],
  [/musical_ly|BytedanceWebview|TikTok|AppName\/trill/i, 'TikTok'],
  [/Snapchat/, 'Snapchat'],
  [/LinkedInApp/, 'LinkedIn'],
  [/\bLine\/\d/, 'LINE'],
]

/**
 * Reconnaît l'appareil d'après le user agent. Fonction pure : `maxTouchPoints` sert à démasquer l'iPad
 * (en mode ordinateur, il se dit Macintosh), `standalone` dit si l'app est déjà ouverte installée.
 */
export function detectDevice(ua: string, maxTouchPoints = 0, standalone = false): Device {
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
  // tablette Android : Chrome y demande la version « ordinateur » des sites et se dit « X11; Linux x86_64 ».
  // On la reconnaît à l'écran tactile (un rare ordinateur Linux tactile aurait la marche à suivre d'Android ;
  // les Chromebook signent CrOS et restent des ordinateurs)
  const androidTablet = /X11; Linux (x86_64|aarch64)/.test(ua) && maxTouchPoints > 1 && !/CrOS/.test(ua)
  const os: Os = ipad || /iPhone|iPod/.test(ua) ? 'ios' : /Android/.test(ua) || androidTablet ? 'android' : 'desktop'

  let browser: Browser = 'other'
  if (os === 'ios') {
    // sur iPhone, tous les navigateurs utilisent le moteur de Safari mais signent de leur nom
    if (/CriOS\//.test(ua)) browser = 'chrome'
    else if (/EdgiOS\//.test(ua)) browser = 'edge'
    else if (/FxiOS\//.test(ua)) browser = 'firefox'
    else if (/OPiOS\/|OPT\//.test(ua)) browser = 'opera'
    else if (/Version\/[\d.]+.*Safari\//.test(ua) && !/GSA\/|Ddg\/|DuckDuckGo/.test(ua)) browser = 'safari'
  } else {
    if (/SamsungBrowser\//.test(ua)) browser = 'samsung'
    else if (/EdgA?\/|Edge\//.test(ua)) browser = 'edge'
    else if (/OPR\/|OPT\/|Opera/.test(ua)) browser = 'opera'
    else if (/Firefox\//.test(ua)) browser = 'firefox'
    else if (/Chrome\/|Chromium\//.test(ua)) browser = 'chrome'
    else if (/Version\/[\d.]+.*Safari\//.test(ua)) browser = 'safari'
  }
  const v = browser === 'safari' ? /Version\/(\d+)/.exec(ua) : null
  const version = v ? Number(v[1]) : null

  let inApp: string | null = null
  if (!standalone) {
    inApp = IN_APPS.find(([re]) => re.test(ua))?.[1] ?? null
    // Android : la vue web d'une app signe « ; wv) » ; iPhone : une vue web d'app n'a pas la marque « Safari/ »
    // (l'app installée non plus, d'où le test standalone plus haut)
    if (!inApp && ((os === 'android' && /; wv\)/.test(ua)) || (os === 'ios' && !/Safari\//.test(ua)))) inApp = UNKNOWN_APP
  }
  return { os, ipad, browser, version, inApp, standalone }
}

/**
 * Une tablette plutôt qu'un téléphone : iPad (même en « mode ordinateur »), tablette Android (Chrome y
 * retire « Mobile » de sa signature, ou se dit « X11; Linux » en version ordinateur). Fonction pure.
 */
export function isTablet(ua: string, maxTouchPoints = 0): boolean {
  const d = detectDevice(ua, maxTouchPoints)
  return d.ipad || (d.os === 'android' && !/Mobile/.test(ua))
}

/** L'appareil qui affiche la page. */
export function currentDevice(): Device {
  if (typeof navigator === 'undefined') return detectDevice('')
  return detectDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0, isStandalone())
}

export function platform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const { os } = detectDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0)
  return os === 'desktop' ? 'other' : os
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

/**
 * Pourquoi installer le carnet, en une phrase adaptée au téléphone ; null sur ordinateur ou si l'app
 * est déjà installée. La marche à suivre est sur la page « Installer l'app ».
 */
export function installHint(): string | null {
  if (isStandalone()) return null
  switch (platform()) {
    case 'ios':
      return 'Installe le carnet sur ton écran d’accueil : dans un simple onglet, le navigateur peut l’effacer après 7 jours sans visite.'
    case 'android':
      return 'Installe le carnet sur ton écran d’accueil : il s’ouvrira d’un geste et marchera aussi hors ligne.'
    default:
      return null
  }
}
