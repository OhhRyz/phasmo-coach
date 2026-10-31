import { useId, useMemo, type CSSProperties, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { buildReviewQueue, streak } from '../engine/progress'
import { useStore } from '../store/store'
import { Icon, type IconName } from './Icon'

export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  // identifiants uniques : plusieurs logos coexistent (barre latérale, barre du haut, accueil)
  const uid = useId().replace(/:/g, '')
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b9a4ff" />
          <stop offset="1" stopColor="#6f8dff" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor="#a48bff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#a48bff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="#151a28" />
      <circle cx="20" cy="18" r="16" fill={`url(#${uid}-glow)`} />
      <path
        d="M11 31V18.5a9 9 0 0 1 18 0V31l-3-2.3-3 2.3-3-2.3-3 2.3-3-2.3z"
        fill="none"
        stroke={`url(#${uid}-g)`}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="16.5" cy="18.5" r="1.7" fill="#d9ceff" />
      <circle cx="23.5" cy="18.5" r="1.7" fill="#d9ceff" />
    </svg>
  )
}

interface NavItem {
  to: string
  label: string
  icon: IconName
  badge?: number
  end?: boolean
}

function initials(name: string): string {
  const n = name.trim()
  if (!n) return '?'
  return n
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function Layout({ children }: { children: ReactNode }) {
  const { state, deck } = useStore()
  const location = useLocation()
  const now = Date.now()
  const due = useMemo(() => buildReviewQueue(state, deck, now).length, [state, deck, now])
  const days = useMemo(() => streak(state, now), [state, now])

  const train: NavItem[] = [
    { to: '/revision', label: 'Révision du jour', icon: 'layers', badge: due },
    { to: '/quiz', label: 'Quiz', icon: 'quiz' },
    { to: '/enquete', label: 'Mise en situation', icon: 'search' },
    { to: '/oreille', label: 'À l’oreille', icon: 'ear' },
  ]
  const know: NavItem[] = [
    { to: '/codex', label: 'Codex des entités', icon: 'codex' },
    { to: '/mecaniques', label: 'Mécaniques', icon: 'compass' },
    { to: '/carnet', label: 'Carnet du coach', icon: 'notebook', badge: state.notes.length || undefined },
  ]
  const trainActive = ['/entrainement', '/quiz', '/enquete', '/oreille', '/mecaniques'].some((p) => location.pathname.startsWith(p))

  const link = (item: NavItem) => (
    <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      <Icon name={item.icon} />
      {item.label}
      {!!item.badge && <span className="badge">{item.badge > 99 ? '99+' : item.badge}</span>}
    </NavLink>
  )

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Navigation principale">
        <Link to="/" className="brand">
          <BrandMark />
          <span className="brand-name">
            Phasmo Coach
            <span className="brand-sub">Entraînement hors-jeu</span>
          </span>
        </Link>
        <nav className="nav">
          {link({ to: '/', label: 'Accueil', icon: 'home', end: true })}
          <div className="nav-label">S’entraîner</div>
          {train.map(link)}
          <div className="nav-label">Savoir</div>
          {know.map(link)}
        </nav>
        <div className="sidebar-foot">
          <Link to="/profil" className="profile-mini">
            <span className="avatar">{initials(state.profile.name)}</span>
            <span className="who">
              <strong>{state.profile.name || 'Mon profil'}</strong>
              <span>
                {days > 0 ? `${days} jour${days > 1 ? 's' : ''} d’affilée` : 'Commence ta série aujourd’hui'}
              </span>
            </span>
            {days > 0 && (
              <span className="chip chip-lantern" style={{ marginLeft: 'auto' }}>
                <Icon name="flame" size={14} />
                {days}
              </span>
            )}
          </Link>
          <p className="legal-mini">
            Projet de fan, non affilié à Kinetic Games. <Link to="/a-propos">Sources & licence</Link>
          </p>
        </div>
      </aside>

      <header className="topbar">
        <Link to="/" className="brand">
          <BrandMark />
          <span className="brand-name">Phasmo Coach</span>
        </Link>
        <div className="row" style={{ '--gap': '8px' } as CSSProperties}>
          {days > 0 && (
            <span className="chip chip-lantern" title="Jours d’affilée">
              <Icon name="flame" size={14} />
              {days}
            </span>
          )}
          <Link to="/profil" className="avatar" aria-label="Profil" style={{ width: 32, height: 32, fontSize: '0.8rem' }}>
            {initials(state.profile.name)}
          </Link>
        </div>
      </header>

      <main className="main" id="contenu">
        {children}
      </main>

      <nav className="tabbar" aria-label="Navigation">
        <NavLink to="/" end className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          <Icon name="home" size={22} />
          Accueil
        </NavLink>
        <NavLink to="/codex" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          <Icon name="codex" size={22} />
          Codex
        </NavLink>
        <NavLink to="/revision" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          <Icon name="layers" size={22} />
          Réviser
          {due > 0 && <span className="badge">{due > 99 ? '99+' : due}</span>}
        </NavLink>
        <NavLink to="/entrainement" className={() => `tab${trainActive ? ' active' : ''}`}>
          <Icon name="train" size={22} />
          S’entraîner
        </NavLink>
        <NavLink to="/carnet" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          <Icon name="notebook" size={22} />
          Carnet
        </NavLink>
      </nav>
    </div>
  )
}
