import { afterEach, describe, expect, it } from 'vitest'
import { reloadedPath } from '../pages/savedRun'
import mainSource from '../main.tsx?raw'
import swSource from '../serviceWorker.ts?raw'
import viteConfig from '../../vite.config.ts?raw'
import vercel from '../../vercel.json'
import {
  CHECK_GAP_MS,
  createUpdateCheck,
  createUpdateGate,
  hashPath,
  markUpdateReload,
  QUIET_MS,
  takeUpdateReload,
  typingIn,
  UPDATE_KEY,
  type GateEnv,
  type ReloadMoment,
} from './update'

/** Une page simulée : l'horloge, la saisie et ce qui a été rechargé, à la main. */
function page(opts: { typing?: boolean; resumesHere?: boolean } = {}) {
  let t = 1_000_000
  const state = { typing: opts.typing ?? false, resumesHere: opts.resumesHere ?? false }
  const reloads: { moment: ReloadMoment; resume: boolean }[] = []
  const env: GateEnv = {
    now: () => t,
    typing: () => state.typing,
    resumesHere: () => state.resumesHere,
    reload: (moment, resume) => reloads.push({ moment, resume }),
  }
  const gate = createUpdateGate(env)
  return { gate, reloads, state, wait: (ms: number) => (t += ms) }
}

describe('Nouvelle version : recharger au bon moment, une seule fois', () => {
  it('personne n’a touché la page depuis son ouverture : rechargée tout de suite', () => {
    const p = page()
    p.wait(3000)
    p.gate.ready()
    expect(p.reloads).toEqual([{ moment: 'quiet', resume: false }])
    expect(p.gate.pending).toBe(false)
  })

  it('page ouverte par un rechargement (F5) : l’exercice reprend aussi après celui de la mise à jour', () => {
    const p = page({ resumesHere: true })
    p.gate.ready()
    expect(p.reloads).toEqual([{ moment: 'quiet', resume: true }])
  })

  it('un geste sur la page : la mise à jour attend, puis se fait au passage en arrière-plan', () => {
    const p = page()
    p.gate.interacted()
    p.gate.ready()
    expect(p.reloads).toEqual([])
    expect(p.gate.pending).toBe(true)
    p.gate.hidden()
    // l'exercice en cours (révision, quiz…) reprend là où il en était
    expect(p.reloads).toEqual([{ moment: 'hidden', resume: true }])
    expect(p.gate.pending).toBe(false)
  })

  it('page restée ouverte longtemps sans geste : pas de rechargement surprise pendant la lecture', () => {
    const p = page()
    p.wait(QUIET_MS + 1)
    p.gate.ready()
    expect(p.reloads).toEqual([])
    expect(p.gate.pending).toBe(true)
  })

  it('au prochain changement de page, la page d’arrivée s’ouvre comme d’habitude (pas de reprise forcée)', () => {
    const p = page()
    p.gate.interacted()
    p.gate.ready()
    p.gate.routeChanged()
    expect(p.reloads).toEqual([{ moment: 'route', resume: false }])
  })

  it('jamais pendant une saisie : ni au calme, ni en arrière-plan ; au prochain changement de page', () => {
    const p = page({ typing: true })
    p.gate.ready()
    expect(p.reloads).toEqual([])
    p.gate.hidden()
    p.gate.visible()
    expect(p.reloads).toEqual([])
    // la note est enregistrée, le champ vidé ; on change de page
    p.state.typing = false
    p.gate.routeChanged()
    expect(p.reloads).toEqual([{ moment: 'route', resume: false }])
  })

  it('retour au premier plan : la page repart au calme ; la mise à jour trouvée alors se fait sans attendre', () => {
    const p = page()
    p.gate.interacted()
    p.wait(QUIET_MS * 10)
    p.gate.hidden()
    p.gate.visible()
    p.wait(2000)
    p.gate.ready()
    // ce qu'on faisait avant de partir reprend
    expect(p.reloads).toEqual([{ moment: 'quiet', resume: true }])
  })

  it('une saisie interrompue par l’arrière-plan : rechargée au retour une fois le champ vidé', () => {
    const p = page({ typing: true })
    p.gate.interacted()
    p.gate.ready()
    p.gate.hidden()
    expect(p.reloads).toEqual([])
    p.state.typing = false
    p.gate.visible()
    expect(p.reloads).toEqual([{ moment: 'quiet', resume: true }])
  })

  it('un sélecteur de fichiers ouvert (« Importer un fichier ») : ni en arrière-plan ni au retour ; au prochain changement de page', () => {
    // sur Android, le sélecteur couvre l'écran : la page passe en arrière-plan sans qu'on l'ait quittée
    const p = page()
    p.gate.interacted()
    p.gate.ready()
    p.gate.picking()
    p.gate.hidden()
    expect(p.reloads).toEqual([])
    // le fichier choisi, la page revient au premier plan : elle l'importe, sans rechargement
    p.gate.visible()
    expect(p.reloads).toEqual([])
    expect(p.gate.pending).toBe(true)
    p.gate.routeChanged()
    expect(p.reloads).toEqual([{ moment: 'route', resume: false }])
  })

  it('le sélecteur de fichiers ne retient que sa page : la nouvelle version trouvée sur la page suivante se fait au calme', () => {
    const p = page()
    p.gate.interacted()
    p.gate.picking()
    // la mise à jour n'est pas encore là : le changement de page ne recharge rien, mais oublie le sélecteur
    p.gate.routeChanged()
    expect(p.reloads).toEqual([])
    p.gate.ready()
    p.gate.hidden()
    expect(p.reloads).toEqual([{ moment: 'hidden', resume: true }])
    // ouvert avant que la page ait été touchée (aucun geste encore) : pas de rechargement « au calme » non plus
    const q = page()
    q.gate.picking()
    q.gate.ready()
    expect(q.reloads).toEqual([])
    expect(q.gate.pending).toBe(true)
  })

  it('rien en attente : passer en arrière-plan ou changer de page ne recharge rien', () => {
    const p = page()
    p.gate.interacted()
    p.gate.hidden()
    p.gate.visible()
    p.gate.routeChanged()
    expect(p.reloads).toEqual([])
  })

  it('une seule fois, même si le service worker le signale deux fois', () => {
    const p = page()
    p.gate.ready()
    p.gate.ready()
    p.gate.hidden()
    p.gate.routeChanged()
    expect(p.reloads).toHaveLength(1)
    const q = page()
    q.gate.interacted()
    q.gate.ready()
    q.gate.ready()
    q.gate.hidden()
    q.gate.routeChanged()
    expect(q.reloads).toHaveLength(1)
  })
})

describe('Saisie en cours : un champ de texte rempli', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('un champ vide ne compte pas, même sous le curseur ; rempli, si', () => {
    document.body.innerHTML = '<textarea id="note"></textarea><input id="name" type="text"><input type="checkbox" checked>'
    expect(typingIn(document)).toBe(false)
    // le prénom de la première page a le focus d'office : rien de tapé, rien à perdre
    const name = document.getElementById('name') as HTMLInputElement
    name.focus()
    expect(typingIn(document)).toBe(false)
    name.value = 'Lé'
    expect(typingIn(document)).toBe(true)
    name.value = ''
    const note = document.getElementById('note') as HTMLTextAreaElement
    note.value = 'Le Banshee chante'
    note.blur()
    expect(typingIn(document)).toBe(true)
  })

  it('un lien à copier (lecture seule), un champ désactivé, une case ou un bouton ne sont pas une saisie', () => {
    document.body.innerHTML =
      '<textarea readonly>https://phasmo-coach.vercel.app/#/importer?n=z123</textarea><input type="radio" checked><button>Copier</button><input type="text" disabled value="x"><input type="hidden" value="y">'
    ;(document.querySelector('textarea') as HTMLTextAreaElement).focus()
    expect(typingIn(document)).toBe(false)
  })

  it('un champ rempli d’office (le prénom enregistré, celui du coach) ne compte que si on y a tapé, ou s’il a le focus', () => {
    document.body.innerHTML = '<input id="name" class="input" value="Léa"><input id="coach" value="Sensei"><textarea id="note"></textarea>'
    const name = document.getElementById('name') as HTMLInputElement
    // ce que fait serviceWorker.ts : les champs où l'on a tapé, et celui qui a le focus
    const edited = new WeakSet<EventTarget>()
    const onInput = (e: Event) => {
      if (e.target) edited.add(e.target)
    }
    document.addEventListener('input', onInput, true)
    const touched = (el: Element) => edited.has(el) || el === document.activeElement
    try {
      // la page Profil telle qu'elle s'ouvre : rien de tapé, rien à perdre
      expect(typingIn(document, touched)).toBe(false)
      // sans filtre, un champ rempli compte (le comportement par défaut)
      expect(typingIn(document)).toBe(true)
      // le prénom modifié : une saisie en cours
      name.value = 'Léana'
      name.dispatchEvent(new Event('input', { bubbles: true }))
      expect(typingIn(document, touched)).toBe(true)
      // un autre champ rempli d'office qu'on vient de toucher pour écrire (focus) : une saisie aussi
      document.body.innerHTML = '<input id="coach" value="Sensei">'
      expect(typingIn(document, touched)).toBe(false)
      ;(document.getElementById('coach') as HTMLInputElement).focus()
      expect(typingIn(document, touched)).toBe(true)
    } finally {
      document.removeEventListener('input', onInput, true)
    }
  })

  it('recherche et nombre comptent comme du texte', () => {
    document.body.innerHTML = '<input type="search" value="ban">'
    expect(typingIn(document)).toBe(true)
    document.body.innerHTML = '<input type="number" value="12">'
    expect(typingIn(document)).toBe(true)
  })
})

describe('Chercher une nouvelle version : pas en rafale, et tout de suite quand le réseau revient', () => {
  /** Un enregistrement de service worker simulé : on compte les demandes faites au navigateur. */
  function checker(opts: { online: boolean; fail?: boolean }) {
    let t = 5_000_000
    const state = { online: opts.online, installing: null as ServiceWorker | null, fail: opts.fail ?? false }
    let updates = 0
    const registration = {
      get installing() {
        return state.installing
      },
      update: () => {
        updates++
        return state.fail ? Promise.reject(new Error('réseau')) : Promise.resolve()
      },
    } as unknown as ServiceWorkerRegistration
    const check = createUpdateCheck({ now: () => t, online: () => state.online, registration: () => registration })
    return { check, state, updates: () => updates, wait: (ms: number) => (t += ms) }
  }

  it('ouverte en ligne : l’ouverture vient de chercher ; le retour au premier plan attend une minute, pas le passage régulier', () => {
    const c = checker({ online: true })
    c.check()
    expect(c.updates()).toBe(0)
    c.wait(CHECK_GAP_MS)
    c.check()
    expect(c.updates()).toBe(1)
    c.check()
    expect(c.updates()).toBe(1)
    // toutes les 30 minutes, et au retour du réseau : sans attendre
    c.check(true)
    expect(c.updates()).toBe(2)
  })

  it('ouverte hors ligne : rien tant qu’il n’y a pas de réseau ; à son retour, une seule demande', () => {
    const c = checker({ online: false })
    c.check()
    c.check(true)
    expect(c.updates()).toBe(0)
    // le réseau revient (événement « online », voir serviceWorker.ts : check(true))
    c.state.online = true
    c.check(true)
    expect(c.updates()).toBe(1)
    // le retour au premier plan juste après ne redemande pas
    c.check()
    expect(c.updates()).toBe(1)
    // sans l'événement (iOS endormi), le premier retour au premier plan en ligne n'attend pas la minute
    const d = checker({ online: false })
    d.state.online = true
    d.check()
    expect(d.updates()).toBe(1)
  })

  it('pas pendant un téléchargement en cours ; une demande qui échoue ne compte pas', async () => {
    const c = checker({ online: true })
    c.wait(CHECK_GAP_MS)
    c.state.installing = {} as ServiceWorker
    c.check()
    expect(c.updates()).toBe(0)
    c.state.installing = null
    c.state.fail = true
    c.check()
    expect(c.updates()).toBe(1)
    await Promise.resolve()
    await Promise.resolve()
    c.state.fail = false
    c.check()
    expect(c.updates()).toBe(2)
  })
})

describe('Rechargement de mise à jour : noté avant, lu une fois après', () => {
  afterEach(() => sessionStorage.removeItem(UPDATE_KEY))

  it('la note se lit une seule fois, puis disparaît', () => {
    markUpdateReload('/quiz', true, 5000)
    expect(takeUpdateReload(6000)).toEqual({ t: 5000, path: '/quiz', resume: true })
    expect(takeUpdateReload(6000)).toBeNull()
  })

  it('une note trop vieille, venue du futur ou illisible ne vaut rien', () => {
    markUpdateReload('/', false, 5000)
    expect(takeUpdateReload(5000 + 61_000)).toBeNull()
    markUpdateReload('/', false, 9000)
    expect(takeUpdateReload(5000)).toBeNull()
    sessionStorage.setItem(UPDATE_KEY, '{pas du json')
    expect(takeUpdateReload()).toBeNull()
    sessionStorage.setItem(UPDATE_KEY, JSON.stringify({ t: 1, path: 3 }))
    expect(takeUpdateReload(2)).toBeNull()
  })

  it('reprise de l’exercice : comme un F5 sur la page en cours, pas en arrivant sur une autre page', () => {
    expect(hashPath('#/enquete?contrat=reprendre')).toBe('/enquete')
    expect(hashPath('')).toBe('/')
    // rechargé sur la page de l'exercice (au calme, ou en arrière-plan) : il reprend
    expect(reloadedPath('reload', '#/quiz', { resume: true })).toBe('/quiz')
    // rechargé en arrivant sur la page : elle s'ouvre comme par un lien
    expect(reloadedPath('reload', '#/quiz', { resume: false })).toBeNull()
    // sans note, un rechargement reste un rechargement
    expect(reloadedPath('reload', '#/quiz', null)).toBe('/quiz')
    expect(reloadedPath('navigate', '#/quiz', { resume: true })).toBeNull()
  })
})

describe('Hébergement : la page et le service worker jamais gardés en cache, les fichiers versionnés pour toujours', () => {
  const cache = (source: string) => vercel.headers.find((h) => h.source === source)?.headers.find((h) => h.key === 'Cache-Control')?.value

  it('index.html, sw.js et le manifeste se revalident à chaque visite', () => {
    for (const source of ['/', '/index.html', '/sw.js', '/manifest.webmanifest']) {
      expect(cache(source), source).toMatch(/max-age=0\b.*must-revalidate|no-cache/)
    }
  })

  it('seuls les fichiers à empreinte (assets) sont gardés un an', () => {
    expect(cache('/assets/(.*)')).toBe('public, max-age=31536000, immutable')
    const immutable = vercel.headers.filter((h) => h.headers.some((x) => /immutable/.test(x.value))).map((h) => h.source)
    expect(immutable).toEqual(['/assets/(.*)'])
  })

  it('un seul enregistrement du service worker : pas de registerSW.js injecté en plus de virtual:pwa-register', () => {
    expect(viteConfig).toMatch(/registerType: 'autoUpdate'/)
    expect(viteConfig).toMatch(/injectRegister: false/)
    // sans registerSW.js injecté, le plugin ne règle plus l'activation immédiate : elle est écrite en clair
    expect(viteConfig).toMatch(/skipWaiting: true/)
    expect(viteConfig).toMatch(/clientsClaim: true/)
    expect(mainSource).toMatch(/startServiceWorker\(\)/)
    expect(swSource).toMatch(/from 'virtual:pwa-register'/)
    expect(swSource).toMatch(/immediate: true/)
  })

  it('le service worker branché : réseau revenu, champs tapés, sélecteur de fichiers', () => {
    // le réseau revient : on cherche tout de suite, sans l'attente d'une minute
    expect(swSource).toMatch(/addEventListener\('online', \(\) => check\(true\)\)/)
    // seuls les champs où l'on a tapé (ou celui qui a le focus) sont une saisie
    expect(swSource).toMatch(/typingIn\(document, \(el\) => edited\.has\(el\) \|\| el === document\.activeElement\)/)
    expect(swSource).toMatch(/'input',[\s\S]*?edited\.add\(e\.target\)/)
    // un clic sur un champ de fichier (même par un bouton) retient la mise à jour jusqu'au changement de page
    expect(swSource).toMatch(/type === 'file'\) gate\.picking\(\)/)
  })
})
