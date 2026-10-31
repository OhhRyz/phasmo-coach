import { useMemo, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { buildReviewQueue } from '../engine/progress'
import { useStore } from '../store/store'
import { useTheme, type ThemeChoice } from '../theme'

const TRAIN_PATHS = ['/entrainement', '/quiz', '/enquete', '/oreille']

const THEME_LABEL: Record<ThemeChoice, string> = { system: 'Thème auto', light: 'Thème clair', dark: 'Thème sombre' }
const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' }

export function Layout({ children }: { children: ReactNode }) {
  const { state, deck, saveFailed } = useStore()
  const { pathname } = useLocation()
  const [theme, setTheme] = useTheme()
  const due = useMemo(() => buildReviewQueue(state, deck, Date.now()).length, [state, deck])
  const trainActive = TRAIN_PATHS.some((p) => pathname.startsWith(p))
  const cls = (active: boolean) => (active ? 'active' : undefined)

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="wordmark">
            Phasmo <em>Coach</em>
          </Link>
          <nav className="nav" aria-label="Navigation principale">
            <NavLink to="/" end className={({ isActive }) => cls(isActive)}>
              Accueil
            </NavLink>
            <NavLink to="/revision" className={({ isActive }) => cls(isActive)}>
              Réviser
              {due > 0 && <span className="count">{due > 99 ? '99+' : due}</span>}
            </NavLink>
            <NavLink to="/entrainement" className={() => cls(trainActive)}>
              S’entraîner
            </NavLink>
            <NavLink to="/codex" className={({ isActive }) => cls(isActive)}>
              Codex
            </NavLink>
            <NavLink to="/mecaniques" className={({ isActive }) => cls(isActive)}>
              Mécaniques
            </NavLink>
            <NavLink to="/carnet" className={({ isActive }) => cls(isActive)}>
              Carnet
            </NavLink>
          </nav>
          <div className="header-side">
            <button type="button" className="theme-toggle" onClick={() => setTheme(NEXT_THEME[theme])} title="Changer de thème">
              {THEME_LABEL[theme]}
            </button>
            <NavLink to="/profil" className={({ isActive }) => cls(isActive)}>
              {state.profile.name || 'Profil'}
            </NavLink>
          </div>
        </div>
      </header>

      {saveFailed && (
        <p className="save-warning" role="alert">
          Ta progression n’a pas pu être enregistrée sur cet appareil (stockage plein ou bloqué). Exporte une sauvegarde depuis le
          profil pour ne rien perdre.
        </p>
      )}
      <main className="main" id="contenu">
        {children}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span>Projet de fan, non affilié à Kinetic Games. Données issues de l’Unofficial Phasmo Cheat Sheet de Ty Bayn.</span>
          <Link to="/a-propos">Sources, licence et fonctionnement</Link>
        </div>
      </footer>

      <nav className="tabbar" aria-label="Navigation">
        <NavLink to="/" end className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          Accueil
        </NavLink>
        <NavLink to="/revision" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          Réviser
          {due > 0 && <span className="count">{due > 99 ? '99+' : due}</span>}
        </NavLink>
        <NavLink to="/entrainement" className={() => `tab${trainActive ? ' active' : ''}`}>
          S’entraîner
        </NavLink>
        <NavLink to="/codex" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          Codex
        </NavLink>
        <NavLink to="/carnet" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          Carnet
        </NavLink>
      </nav>
    </div>
  )
}
