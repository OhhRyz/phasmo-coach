import { useEffect, useLayoutEffect, useRef } from 'react'
import { HashRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { StoreProvider } from './store/store'
import { About } from './pages/About'
import { Codex } from './pages/Codex'
import { Coaching } from './pages/Coaching'
import { Ear } from './pages/Ear'
import { GhostPage } from './pages/GhostPage'
import { Home } from './pages/Home'
import { ImportNotes } from './pages/ImportNotes'
import { InstallPage } from './pages/Install'
import { MechanicsPage } from './pages/Mechanics'
import { Notebook } from './pages/Notebook'
import { NotFound } from './pages/NotFound'
import { Profile } from './pages/Profile'
import { ProgressPage } from './pages/Progress'
import { Quiz } from './pages/Quiz'
import { RESUME_PARAM } from './pages/quizRun'
import { arrivedAt } from './pages/savedRun'
import { flushScroll, pageLoadType, restoresScroll, restoreScroll, savedScroll, saveScroll } from './pages/scrollMemory'
import { Report } from './pages/Report'
import { Review } from './pages/Review'
import { Scenario } from './pages/Scenario'
import { Train } from './pages/Train'

// l'app ramène elle-même la position au retour arrière (voir ScrollToTop) : le navigateur ne s'en mêle plus
if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
  try {
    history.scrollRestoration = 'manual'
  } catch {
    /* navigateur qui refuse : il restaure à sa façon */
  }
}

/**
 * Une nouvelle page s'ouvre en haut. « Précédent » (ou « Suivant », ou un rechargement) ramène la page à
 * l'endroit où on l'avait quittée : la position est gardée par entrée d'historique (voir scrollMemory).
 */
function ScrollToTop() {
  const { pathname, key } = useLocation()
  const navigationType = useNavigationType()
  const current = useRef(key)
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    const onScroll = () => saveScroll(current.current, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', flushScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', flushScroll)
    }
  }, [])

  // avant que la page ne s'affiche : pas d'éclair du haut de la page avant de redescendre
  useLayoutEffect(() => {
    current.current = key
    const first = lastPath.current === null
    const changed = lastPath.current !== pathname
    lastPath.current = pathname
    const y = restoresScroll(navigationType, first, pageLoadType()) ? savedScroll(key) : null
    if (y != null) return restoreScroll(y)
    if (changed) window.scrollTo(0, 0)
  }, [key]) // une entrée d'historique, une seule décision : en haut, ou là où on l'avait quittée

  useEffect(() => {
    // une autre page que celle qu'on a rechargée : l'exercice en cours ne reprendra plus de lui-même (voir reloadedOn)
    arrivedAt(pathname)
  }, [pathname])
  return null
}

/**
 * Un lien vers le quiz depuis le quiz (?ghost=, ?topic=) repart d'une copie neuve. « Reprendre la copie »
 * (?copie=reprendre, effacé une fois servi) n'en distribue pas : son paramètre ne compte pas.
 */
function QuizRoute() {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  params.delete(RESUME_PARAM)
  return <Quiz key={params.toString()} />
}

function SafeRoutes({ children }: { children: React.ReactNode }) {
  const { pathname, search } = useLocation()
  return <ErrorBoundary resetKey={pathname + search}>{children}</ErrorBoundary>
}

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <HashRouter>
          <ScrollToTop />
          <Layout>
            <SafeRoutes>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/codex" element={<Codex />} />
              <Route path="/codex/:id" element={<GhostPage />} />
              <Route path="/revision" element={<Review />} />
              <Route path="/entrainement" element={<Train />} />
              <Route path="/quiz" element={<QuizRoute />} />
              <Route path="/enquete" element={<Scenario />} />
              <Route path="/oreille" element={<Ear />} />
              <Route path="/mecaniques" element={<MechanicsPage />} />
              <Route path="/carnet" element={<Notebook />} />
              <Route path="/coaching" element={<Coaching />} />
              <Route path="/profil" element={<Profile />} />
              <Route path="/progression" element={<ProgressPage />} />
              <Route path="/rapport" element={<Report />} />
              <Route path="/importer" element={<ImportNotes />} />
              <Route path="/installer" element={<InstallPage />} />
              <Route path="/a-propos" element={<About />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </SafeRoutes>
          </Layout>
        </HashRouter>
      </ToastProvider>
    </StoreProvider>
  )
}
