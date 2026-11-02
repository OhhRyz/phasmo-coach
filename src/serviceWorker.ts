import { registerSW } from 'virtual:pwa-register'
import { CHECK_EVERY_MS, createUpdateCheck, createUpdateGate, hashPath, markUpdateReload, setUpdateGate, typingIn } from './engine/update'
import { reloadedOn } from './pages/savedRun'

/**
 * Le service worker, et le passage aux nouvelles versions. Le navigateur ne cherche une nouvelle version qu'au
 * chargement d'une page : un iPhone qui garde l'app ouverte en arrière-plan pendant des jours n'en verrait
 * jamais. On la cherche donc aussi au retour au premier plan et toutes les 30 minutes ; une fois installée,
 * la page se recharge au bon moment (voir engine/update), une seule fois.
 */
export function startServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  // les champs où l'on a tapé depuis l'ouverture de la page : un champ que l'app remplit d'office (le prénom
  // enregistré, celui du coach) n'est pas une saisie en cours, sauf s'il a le focus
  const edited = new WeakSet<EventTarget>()
  document.addEventListener(
    'input',
    (e) => {
      if (e.target) edited.add(e.target)
    },
    true,
  )

  const gate = createUpdateGate({
    now: () => Date.now(),
    typing: () => typingIn(document, (el) => edited.has(el) || el === document.activeElement),
    resumesHere: () => reloadedOn(hashPath(window.location.hash)),
    reload: (_moment, resume) => {
      markUpdateReload(hashPath(window.location.hash), resume)
      window.location.reload()
    },
  })
  setUpdateGate(gate)

  // un geste sur la page : elle n'est plus « au calme », la nouvelle version attendra le bon moment
  const touch = () => gate.interacted()
  for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
    window.addEventListener(type, touch, { capture: true, passive: true })
  }
  // « Importer un fichier » : le sélecteur de fichiers s'ouvre (le clic sur le champ caché, même déclenché par
  // un bouton). Sur Android, il fait passer la page en arrière-plan : pas de rechargement avant de changer de page
  document.addEventListener(
    'click',
    (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'file') gate.picking()
    },
    true,
  )

  let registration: ServiceWorkerRegistration | undefined
  /** Demande au navigateur s'il y a une nouvelle version (voir createUpdateCheck). */
  const check = createUpdateCheck({
    now: () => Date.now(),
    online: () => navigator.onLine,
    registration: () => registration,
  })

  // une page qui avait déjà un service worker : le prochain qui prend la main est une nouvelle version
  // (la toute première installation, elle, ne change rien à la page affichée)
  let controlled = navigator.serviceWorker.controller != null
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) gate.ready()
    controlled = true
  })

  registerSW({
    immediate: true,
    onNeedReload: () => gate.ready(),
    onRegisteredSW: (_url, r) => {
      registration = r
    },
    onRegisterError: () => {
      /* pas de service worker (navigation privée stricte…) : l'app marche, sans hors-ligne ni mise à jour en douce */
    },
  })

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      gate.hidden()
      return
    }
    gate.visible()
    check()
  }
  document.addEventListener('visibilitychange', onVisibility)
  // page ressortie du cache de navigation (bouton retour) : elle peut avoir dormi longtemps
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) onVisibility()
  })
  // le réseau revient (lancée hors ligne, l'app n'a pas pu regarder) : on regarde tout de suite
  window.addEventListener('online', () => check(true))
  window.setInterval(() => {
    if (document.visibilityState === 'visible') check(true)
  }, CHECK_EVERY_MS)

  // un morceau de l'ancienne version manque (la nouvelle l'a remplacé) : on passe tout de suite à la nouvelle
  window.addEventListener('vite:preloadError', (e) => {
    if (!gate.pending) return
    e.preventDefault()
    gate.routeChanged()
  })
}
