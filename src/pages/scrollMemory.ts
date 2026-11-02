/**
 * Où l'on en était sur chaque page de l'historique de l'onglet : le bouton « Précédent » ramène sur la fiche à
 * l'endroit qu'on avait quitté (un lien dans le texte, « Ne pas confondre »…), au lieu du haut de la page. Le
 * navigateur le fait parfois de lui-même, mais pas partout ni à coup sûr (Safari sur iPhone) : l'app s'en
 * charge, par entrée d'historique, et la mémoire tient au rechargement de l'onglet.
 */
export const SCROLL_KEY = 'phasmo-coach/scroll'
/** Les dernières entrées seulement : l'onglet ne garde pas indéfiniment des positions qu'on ne rouvrira plus. */
export const SCROLL_MAX = 60

/** La position gardée pour une entrée, ramenée à la fin de la liste (la plus récente) ; les plus anciennes tombent. */
export function rememberScroll(list: readonly (readonly [string, number])[], key: string, y: number, max = SCROLL_MAX): [string, number][] {
  const out: [string, number][] = list.filter(([k]) => k !== key).map(([k, v]) => [k, v])
  out.push([key, Math.max(0, Math.round(y))])
  return out.slice(-max)
}

/** La position gardée pour une entrée d'historique, ou null (jamais vue, ou mémoire illisible). */
export function scrollFor(list: readonly (readonly [string, number])[], key: string): number | null {
  for (let i = list.length - 1; i >= 0; i--) if (list[i][0] === key) return list[i][1]
  return null
}

/** Une mémoire lue du stockage : seulement des paires [entrée, position] valables. */
export function parseScrolls(raw: string | null): [string, number][] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v
      .filter((p): p is [string, number] => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'number' && Number.isFinite(p[1]) && p[1] >= 0)
      .map(([k, y]) => [k, y] as [string, number])
      .slice(-SCROLL_MAX)
  } catch {
    return []
  }
}

/**
 * La clé d'une entrée d'historique dans la mémoire. Le routeur nomme « default » toute entrée qu'il n'a pas
 * créée lui-même : la première de l'onglet (numérotée 0) comme une adresse tapée à la main (sans numéro). La
 * première se reconnaît à son numéro ; une adresse tapée n'a pas de place gardée (null : elle s'ouvre en haut).
 * Rechargée, une adresse tapée reçoit elle aussi le numéro 0 : la clé porte alors l'adresse (`path`), et la
 * place gardée d'une autre page (la première de l'onglet) ne s'y applique jamais.
 */
export function memoryKey(key: string, historyState: unknown, path?: string): string | null {
  if (key !== 'default') return key
  const idx = historyState && typeof historyState === 'object' ? (historyState as { idx?: unknown }).idx : undefined
  if (typeof idx !== 'number') return null
  return path === undefined ? `default@${idx}` : `default@${idx}|${path}`
}

/**
 * Revenir sur cette entrée doit-il ramener la position gardée ? Par « Précédent » / « Suivant » (POP), oui ;
 * sauf au tout premier affichage de l'onglet, qui n'est un retour que si la page vient d'être rechargée ou
 * rouverte par l'historique (sinon une vieille position de la première entrée, « default », reviendrait sur
 * une ouverture à neuf).
 */
export function restoresScroll(navigationType: string, firstRender: boolean, pageLoad: string | undefined): boolean {
  if (navigationType !== 'POP') return false
  return !firstRender || pageLoad === 'reload' || pageLoad === 'back_forward'
}

let memory: [string, number][] | null = null
let pending = 0

function load(): [string, number][] {
  if (memory) return memory
  try {
    memory = parseScrolls(sessionStorage.getItem(SCROLL_KEY))
  } catch {
    memory = []
  }
  return memory
}

function persist() {
  pending = 0
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(load()))
  } catch {
    /* stockage indisponible : la mémoire reste le temps de l'onglet ouvert */
  }
}

/** Note la position de la page pour cette entrée (écrite dans le stockage un peu après, ou au départ de la page). */
export function saveScroll(key: string, y: number): void {
  memory = rememberScroll(load(), key, y)
  if (!pending && typeof window !== 'undefined') pending = window.setTimeout(persist, 250)
}

export function flushScroll(): void {
  if (pending) window.clearTimeout(pending)
  persist()
}

export function savedScroll(key: string): number | null {
  return scrollFor(load(), key)
}

/** Le type du chargement de la page (« navigate », « reload », « back_forward »), s'il est connu. */
export function pageLoadType(): string | undefined {
  try {
    return (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type
  } catch {
    return undefined
  }
}

/**
 * Ramène la page à `y`, tout de suite puis encore à l'image suivante (une mise en page tardive ne la fait pas
 * glisser). La page qui revient peut ne pas avoir encore toute sa hauteur (polices, images) : on réessaie
 * quelques instants, tant qu'elle est trop courte, et l'on s'arrête dès qu'on touche, fait défiler ou tape au
 * clavier. Renvoie de quoi annuler.
 */
export function restoreScroll(y: number, within = 1500): () => void {
  const start = performance.now()
  let raf = 0
  let frames = 0
  const events = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const
  const stop = () => {
    cancelAnimationFrame(raf)
    for (const e of events) window.removeEventListener(e, stop)
  }
  const step = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo(0, Math.min(y, Math.max(0, max)))
    frames++
    if ((max >= y - 1 && frames >= 2) || performance.now() - start > within) return stop()
    raf = requestAnimationFrame(step)
  }
  for (const e of events) window.addEventListener(e, stop, { passive: true })
  step()
  return stop
}
