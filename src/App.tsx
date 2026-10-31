import { useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { StoreProvider } from './store/store'
import { About } from './pages/About'
import { Codex } from './pages/Codex'
import { Ear } from './pages/Ear'
import { GhostPage } from './pages/GhostPage'
import { Home } from './pages/Home'
import { ImportNotes } from './pages/ImportNotes'
import { MechanicsPage } from './pages/Mechanics'
import { Notebook } from './pages/Notebook'
import { NotFound } from './pages/NotFound'
import { Profile } from './pages/Profile'
import { Quiz } from './pages/Quiz'
import { Report } from './pages/Report'
import { Review } from './pages/Review'
import { Scenario } from './pages/Scenario'
import { Train } from './pages/Train'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

/** Un lien vers le quiz depuis le quiz (?ghost=, ?topic=) repart d'une copie neuve. */
function QuizRoute() {
  const { search } = useLocation()
  return <Quiz key={search} />
}

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <HashRouter>
          <ScrollToTop />
          <Layout>
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
              <Route path="/profil" element={<Profile />} />
              <Route path="/rapport" element={<Report />} />
              <Route path="/importer" element={<ImportNotes />} />
              <Route path="/a-propos" element={<About />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </HashRouter>
      </ToastProvider>
    </StoreProvider>
  )
}
