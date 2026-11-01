import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getGhost } from '../data'
import { buildReviewQueue } from '../engine/progress'
import { useAppInstalled } from '../install'
import { useStore } from '../store/store'
import { useIsDark, useTheme } from '../theme'
import { InkFilter } from './journal/Journal'
import { roughEllipse, roughRng } from './journal/rough'

const TRAIN_PATHS = ['/entrainement', '/quiz', '/enquete', '/oreille']

const APP = 'Phasmo Coach'
const PAGE_TITLES: Record<string, string> = {
  '/revision': 'Révision du jour',
  '/codex': 'Codex',
  '/entrainement': 'Exercices',
  '/quiz': 'Quiz',
  '/enquete': 'Mise en situation',
  '/oreille': 'À l’oreille',
  '/mecaniques': 'Mécaniques',
  '/carnet': 'Mes notes',
  '/coaching': 'Coaching',
  '/profil': 'Profil et réglages',
  '/rapport': 'Bilan reçu',
  '/importer': 'Notes reçues',
  '/installer': 'Installer l’app',
  '/a-propos': 'À propos',
}

/** Le titre de l'onglet : « Spectre · Codex · Phasmo Coach », « Mes notes · Phasmo Coach »… (l'historique se lit). */
export function pageTitle(pathname: string): string {
  if (pathname === '/') return APP
  const ghost = /^\/codex\/([^/]+)/.exec(pathname)
  if (ghost) {
    const g = getGhost(decodeURIComponent(ghost[1]))
    return `${g ? g.name : 'Fiche introuvable'} · Codex · ${APP}`
  }
  const page = PAGE_TITLES[pathname.replace(/\/+$/, '')]
  return `${page ?? 'Page introuvable'} · ${APP}`
}

function reducedMotion() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Lumière de fenêtre le jour, lampe torche la nuit (suit le pointeur ou le doigt). */
function Ambient() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const amb = ref.current
    if (!amb) return
    const root = document.documentElement
    const reduced = reducedMotion()
    let x = innerWidth * 0.66
    let y = innerHeight * 0.36
    let tx = x
    let ty = y
    let raf = 0
    const t0 = performance.now()
    const r1 = (n: number) => Math.round(n * 10) / 10
    const paint = () => {
      amb.style.setProperty('--mx', `${r1(x)}px`)
      amb.style.setProperty('--my', `${r1(y)}px`)
      document.querySelectorAll<HTMLElement>('.uv').forEach((u) => {
        const b = u.getBoundingClientRect()
        u.style.setProperty('--lx', `${r1(x - b.left)}px`)
        u.style.setProperty('--ly', `${r1(y - b.top)}px`)
      })
    }
    const loop = (now: number) => {
      raf = 0
      if (root.dataset.theme !== 'dark') return
      const sway = reduced ? 0 : 1
      const t = (now - t0) / 1000
      const sx = tx + Math.sin(t * 1.3) * 3 * sway
      const sy = ty + Math.cos(t * 1.7) * 2.5 * sway
      x += (sx - x) * 0.16
      y += (sy - y) * 0.16
      paint()
      if (!reduced && !document.hidden) raf = requestAnimationFrame(loop)
    }
    const kick = () => {
      paint()
      if (!raf && root.dataset.theme === 'dark') raf = requestAnimationFrame(loop)
    }
    const onPointer = (e: PointerEvent) => {
      tx = e.clientX
      ty = e.clientY
      kick()
    }
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      tx = t.clientX
      ty = t.clientY
      kick()
    }
    addEventListener('pointermove', onPointer, { passive: true })
    addEventListener('touchstart', onTouch, { passive: true })
    addEventListener('touchmove', onTouch, { passive: true })
    addEventListener('scroll', paint, { passive: true })
    addEventListener('resize', paint)
    document.addEventListener('visibilitychange', kick)
    const obs = new MutationObserver(kick)
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    kick()

    // de temps en temps, la lampe vacille
    let flickTimer = 0
    if (!reduced) {
      const flick = () => {
        if (root.dataset.theme === 'dark' && !document.hidden) {
          amb.querySelectorAll('.beam, .beam-dark').forEach((b) => {
            b.classList.remove('flicker')
            void (b as HTMLElement).offsetWidth
            b.classList.add('flicker')
          })
        }
        flickTimer = window.setTimeout(flick, 28000 + Math.random() * 30000)
      }
      flickTimer = window.setTimeout(flick, 22000)
    }
    return () => {
      removeEventListener('pointermove', onPointer)
      removeEventListener('touchstart', onTouch)
      removeEventListener('touchmove', onTouch)
      removeEventListener('scroll', paint)
      removeEventListener('resize', paint)
      document.removeEventListener('visibilitychange', kick)
      obs.disconnect()
      if (raf) cancelAnimationFrame(raf)
      window.clearTimeout(flickTimer)
    }
  }, [])
  return (
    <div className="ambient" ref={ref} aria-hidden>
      <div className="window-light" />
      <div className="window-mullions" />
      <div className="beam-dark" />
      <div className="beam" />
      <div className="blackout" />
    </div>
  )
}

/** Le disjoncteur du jeu : bascule entre jour et nuit, avec une brève coupure de courant. */
function Breaker() {
  const [, setTheme] = useTheme()
  const dark = useIsDark()
  const flip = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    const blackout = document.querySelector('.blackout')
    if (reducedMotion() || !blackout) return setTheme(next)
    blackout.classList.remove('on')
    void (blackout as HTMLElement).offsetWidth
    blackout.classList.add('on')
    window.setTimeout(() => setTheme(next), 120)
  }
  return (
    <button className="breaker" type="button" aria-pressed={dark} aria-label={'Disjoncteur\u202f: passer en thème clair ou sombre'} onClick={flip}>
      <span className="breaker-box">
        <span className="breaker-lever" />
      </span>
      <span className="breaker-txt">
        <span>Lumière</span>
        <span>{dark ? 'OFF' : 'ON'}</span>
      </span>
    </button>
  )
}

function CountCircle({ n }: { n: number }) {
  const label = n > 99 ? '99+' : String(n)
  const w = 12 + label.length * 9
  const d = roughEllipse(w, 20, roughRng('count'), 0.05, 0.1)
  return (
    <b className="count" aria-label={`${n} carte${n > 1 ? 's' : ''} à réviser`}>
      {label}
      <svg className="draw" viewBox={`0 0 ${w + 14} 32`} aria-hidden>
        <path d={d} transform="translate(7 6)" pathLength={1} strokeWidth={1.6} style={{ ['--d' as string]: '1.2s' }} />
      </svg>
    </b>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { state, deck, saveFailed } = useStore()
  const { pathname } = useLocation()
  const appInstalled = useAppInstalled()
  useTheme() // garde le thème synchronisé (choix « comme l'appareil »)
  // un titre d'onglet par page (le bilan le précise ensuite avec le prénom de l'élève)
  useEffect(() => {
    document.title = pageTitle(pathname)
  }, [pathname])
  // avant l'ouverture du carnet, aucun compteur : rien n'invite à partir ailleurs que sur l'accueil
  const due = useMemo(() => (state.onboarded ? buildReviewQueue(state, deck, Date.now()).length : 0), [state, deck])
  const trainActive = TRAIN_PATHS.some((p) => pathname.startsWith(p))
  const current = (active: boolean) => (active ? ('page' as const) : undefined)

  return (
    <>
      <InkFilter />
      <Ambient />
      <header className="desk-top">
        <Link className="brand" to="/">
          <span className="brand-name">
            Phasmo <i>Coach</i>
          </span>
          <span className="brand-sub">Carnet d’enquête{state.profile.name ? ` de ${state.profile.name}` : ''}</span>
        </Link>
        <div className="desk-tools">
          <Link to="/profil" className="who" aria-current={current(pathname.startsWith('/profil'))}>
            <b>{state.profile.name || 'Profil'}</b>
            <span>réglages</span>
          </Link>
          <Breaker />
        </div>
      </header>

      <nav className="tabs" aria-label="Navigation principale">
        {/* un seul mot par endroit, le même sur ordinateur et sur téléphone (« Mes notes » s'abrège en « Notes ») */}
        <Link className="tab" to="/" aria-current={current(pathname === '/')}>
          <span className="long">Accueil</span>
          <span className="short">Accueil</span>
        </Link>
        <Link className="tab" to="/revision" aria-current={current(pathname.startsWith('/revision'))}>
          <span className="long">Réviser</span>
          <span className="short">Réviser</span>
          {due > 0 && <CountCircle n={due} />}
        </Link>
        <Link className="tab" to="/codex" aria-current={current(pathname.startsWith('/codex'))}>
          <span className="long">Codex</span>
          <span className="short">Codex</span>
        </Link>
        {/* sur téléphone l'onglet Mécaniques est masqué : l'onglet Exercices s'allume à sa place */}
        <Link className={`tab${pathname.startsWith('/mecaniques') ? ' also-current' : ''}`} to="/entrainement" aria-current={current(trainActive)}>
          <span className="long">Exercices</span>
          <span className="short">Exercices</span>
        </Link>
        <Link className="tab" to="/mecaniques" aria-current={current(pathname.startsWith('/mecaniques'))}>
          <span className="long">Mécaniques</span>
          <span className="short">Méca</span>
        </Link>
        <Link className="tab" to="/carnet" aria-current={current(pathname.startsWith('/carnet'))}>
          <span className="long">Mes notes</span>
          <span className="short">Notes</span>
        </Link>
      </nav>

      {saveFailed && (
        <p className="save-warning" role="alert">
          Ta progression n’a pas pu être enregistrée sur cet appareil (stockage plein ou bloqué). Exporte une sauvegarde depuis le
          profil pour ne rien perdre.
        </p>
      )}

      {children}

      <footer className="desk-foot">
        <span>Projet de fan, non affilié à Kinetic Games. Données issues de l’Unofficial Phasmo Cheat Sheet de Ty Bayn.</span>
        {/* le coaching est facultatif : l'app sert à tout le monde, il se règle depuis ce lien */}
        <span className="desk-foot-links">
          {/* rouvre la fiche « Mode d'emploi » de l'accueil, rangée après la première lecture */}
          <Link to="/?guide=1">Mode d’emploi</Link>
          {/* une fois l'app installée, le lien n'a plus lieu d'être */}
          {!appInstalled && (
            <Link to="/installer" aria-current={current(pathname.startsWith('/installer'))}>
              Installer l’app
            </Link>
          )}
          <Link to="/coaching" aria-current={current(pathname.startsWith('/coaching'))}>
            Coaching
          </Link>
          <Link to="/a-propos" aria-current={current(pathname.startsWith('/a-propos'))}>
            Sources et licence
          </Link>
        </span>
      </footer>
    </>
  )
}
