/**
 * Passer à la nouvelle version de l'app sans rien casser. Le service worker (mode « autoUpdate ») télécharge la
 * nouvelle version en arrière-plan et prend aussitôt la main ; la page déjà ouverte, elle, tourne sur l'ancienne
 * tant qu'elle n'est pas rechargée. Ce module décide QUAND la recharger :
 *
 * - tout de suite, si personne n'a encore touché la page depuis son ouverture (ou son retour au premier plan),
 *   dans les premières secondes : le rechargement passe pour la fin du chargement ;
 * - sinon, quand la page passe en arrière-plan (autre app, écran verrouillé, autre onglet) ;
 * - ou au prochain changement de page dans l'app.
 *
 * Jamais pendant une saisie : un champ où l'on a tapé du texte repousse le rechargement au prochain changement de
 * page (un champ rempli d'office, comme le prénom enregistré, ne compte pas). De même quand un sélecteur de fichiers
 * s'est ouvert (« Importer un fichier ») : sur Android, il fait passer la page en arrière-plan. Les exercices en
 * cours (révision, quiz, écoute, contrat) sont gardés dans l'onglet dès leur début et reprennent après le
 * rechargement (voir savedRun) ; le carnet, lui, est enregistré au départ de la page.
 */

/** Sans geste pendant ce temps après l'ouverture (ou le retour au premier plan), on recharge sans attendre. */
export const QUIET_MS = 15_000
/** Page restée ouverte au premier plan : on regarde s'il y a une nouvelle version toutes les 30 minutes. */
export const CHECK_EVERY_MS = 30 * 60_000
/** Retour au premier plan : pas plus d'une vérification par minute (passer d'une app à l'autre en rafale). */
export const CHECK_GAP_MS = 60_000

/** Le moment choisi : « quiet » (personne n'y a touché), « hidden » (en arrière-plan), « route » (changement de page). */
export type ReloadMoment = 'quiet' | 'hidden' | 'route'

export interface GateEnv {
  now(): number
  /** Une saisie est en cours (voir typingIn) : on ne recharge pas, ce qui est tapé serait perdu. */
  typing(): boolean
  /** La page affichée a été ouverte par un rechargement (l'exercice en cours y reprend de lui-même, voir savedRun). */
  resumesHere(): boolean
  /**
   * Recharge la page. `resume` : l'exercice en cours reprend de lui-même après le rechargement, comme après un
   * rechargement demandé (faux quand on vient d'arriver sur une autre page : elle s'ouvre comme d'habitude).
   */
  reload(moment: ReloadMoment, resume: boolean): void
}

export interface UpdateGate {
  /** Une nouvelle version contrôle la page : recharger tout de suite si c'est sans risque, sinon dès que possible. */
  ready(): void
  /** Un geste sur la page (toucher, clic, touche, molette). */
  interacted(): void
  hidden(): void
  /** Retour au premier plan : la page repart « au calme », comme à son ouverture. */
  visible(): void
  /** L'app vient de changer de page (pas un simple paramètre de l'adresse). */
  routeChanged(): void
  /**
   * Un sélecteur de fichiers s'ouvre (« Importer un fichier ») : sur Android, il couvre l'écran et la page passe en
   * arrière-plan sans qu'on l'ait quittée. Rechargée à ce moment, elle ne recevrait jamais le fichier choisi : comme
   * pendant une saisie, la nouvelle version attend le prochain changement de page.
   */
  picking(): void
  /** Une nouvelle version attend le bon moment. */
  readonly pending: boolean
}

export function createUpdateGate(env: GateEnv): UpdateGate {
  let quietSince = env.now()
  let touched = false
  // la page est revenue au premier plan depuis son ouverture : ce qu'on y faisait doit reprendre
  let returned = false
  let pending = false
  let done = false
  // un sélecteur de fichiers s'est ouvert sur cette page (voir picking)
  let choosingFile = false

  const go = (moment: ReloadMoment, resume: boolean) => {
    if (done) return
    done = true
    pending = false
    env.reload(moment, resume)
  }
  /** Recharger maintenant ferait perdre quelque chose : une saisie, ou le fichier qu'on est en train de choisir. */
  const busy = () => choosingFile || env.typing()
  const quiet = () => !touched && env.now() - quietSince < QUIET_MS && !busy()
  const quietReload = () => go('quiet', returned || env.resumesHere())

  return {
    get pending() {
      return pending
    },
    ready() {
      if (done) return
      if (quiet()) quietReload()
      else pending = true
    },
    interacted() {
      touched = true
    },
    hidden() {
      if (pending && !busy()) go('hidden', true)
    },
    visible() {
      quietSince = env.now()
      touched = false
      returned = true
      // passée en arrière-plan pendant une saisie, ou figée avant d'avoir pu se recharger
      if (pending && !busy()) quietReload()
    },
    routeChanged() {
      choosingFile = false
      if (pending) go('route', false)
    },
    picking() {
      choosingFile = true
    },
  }
}

export interface CheckEnv {
  now(): number
  online(): boolean
  /** L'enregistrement du service worker, une fois connu. */
  registration(): Pick<ServiceWorkerRegistration, 'installing' | 'update'> | undefined
}

/**
 * Demande au navigateur s'il y a une nouvelle version : rien hors ligne ni pendant un téléchargement en cours, et
 * pas plus d'une fois par minute (CHECK_GAP_MS), sauf `force`. L'ouverture de la page en a déjà fait une, sauf si
 * elle s'est faite hors ligne : alors la première occasion en ligne n'attend pas. Une demande qui échoue (réseau
 * coupé sans que le navigateur le sache) ne compte pas : la suivante réessaie.
 */
export function createUpdateCheck(env: CheckEnv): (force?: boolean) => void {
  let last = env.online() ? env.now() : -Infinity
  return (force = false) => {
    const r = env.registration()
    if (!r || r.installing || !env.online()) return
    const now = env.now()
    if (!force && now - last < CHECK_GAP_MS) return
    last = now
    r.update().catch(() => {
      if (last === now) last = -Infinity
    })
  }
}

const TEXT_INPUTS = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number'])

function editable(el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled
  if (el instanceof HTMLInputElement) return TEXT_INPUTS.has(el.getAttribute('type')?.toLowerCase() ?? '') && !el.readOnly && !el.disabled
  return el instanceof HTMLElement && el.isContentEditable
}

function filled(el: HTMLInputElement | HTMLTextAreaElement | HTMLElement): boolean {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value.length > 0 : (el.textContent ?? '').length > 0
}

/**
 * Une saisie est en cours : un champ de texte modifiable contient du texte (une note commencée, un lien collé,
 * une recherche, un prénom). Les champs en lecture seule (un lien à copier) ne comptent pas, ni un champ vide
 * qui a seulement le focus (posé d'office à l'ouverture de la page) : un rechargement n'y ferait rien perdre, et
 * qui vient de le toucher pour écrire n'est plus « au calme » (voir createUpdateGate).
 *
 * `touched` : le champ est celui de l'utilisateur (il y a tapé, ou il a le focus). Un champ que l'app remplit
 * d'office (le prénom enregistré sur la page Profil, celui du coach) ne compte pas tant qu'on n'y touche pas : la
 * page se rechargerait à l'identique.
 */
export function typingIn(doc: Document, touched: (el: Element) => boolean = () => true): boolean {
  for (const el of doc.querySelectorAll('textarea, input, [contenteditable]')) {
    if (editable(el) && filled(el) && touched(el)) return true
  }
  return false
}

/** Rechargement fait pour passer à la nouvelle version : noté juste avant, lu au chargement suivant. */
export interface UpdateReload {
  t: number
  /** Le chemin rechargé (« /quiz »). */
  path: string
  resume: boolean
}

export const UPDATE_KEY = 'phasmo-coach/mise-a-jour'
/** Une note plus vieille n'est pas celle de ce chargement (rechargement annulé, onglet rouvert bien plus tard). */
const UPDATE_TTL = 60_000

export function markUpdateReload(path: string, resume: boolean, now = Date.now()): void {
  try {
    sessionStorage.setItem(UPDATE_KEY, JSON.stringify({ t: now, path, resume } satisfies UpdateReload))
  } catch {
    /* stockage indisponible : la page rechargée se comporte comme après un rechargement ordinaire */
  }
}

/** Lit la note laissée avant le rechargement, et l'efface : elle ne vaut que pour ce chargement-ci. */
export function takeUpdateReload(now = Date.now()): UpdateReload | null {
  try {
    const raw = sessionStorage.getItem(UPDATE_KEY)
    if (raw == null) return null
    sessionStorage.removeItem(UPDATE_KEY)
    const r = JSON.parse(raw) as Partial<UpdateReload> | null
    if (typeof r?.t !== 'number' || typeof r.path !== 'string' || typeof r.resume !== 'boolean') return null
    if (r.t > now || now - r.t > UPDATE_TTL) return null
    return { t: r.t, path: r.path, resume: r.resume }
  } catch {
    return null
  }
}

/** Ce chargement vient d'une mise à jour de l'app (lu une fois, au démarrage). */
export const justUpdated: UpdateReload | null = typeof window === 'undefined' ? null : takeUpdateReload()

/** Le chemin de l'app dans l'adresse (« #/enquete?contrat=… » → « /enquete »). */
export function hashPath(hash: string): string {
  return hash.replace(/^#/, '').split('?')[0] || '/'
}

let gate: UpdateGate | null = null

/** Branché par serviceWorker.ts ; sans service worker (tests, navigateur ancien), les appels ne font rien. */
export function setUpdateGate(g: UpdateGate | null): void {
  gate = g
}

/** L'app vient de changer de page : une nouvelle version qui attendait s'installe maintenant. */
export function updateOnRouteChange(): void {
  gate?.routeChanged()
}
