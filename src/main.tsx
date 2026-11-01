// en premier : l'invitation à installer du navigateur arrive tôt, avant l'affichage de la page qui s'en sert
import './install'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/journal.css'
import './styles/app.css'
import './styles/pages/home.css'
import './styles/pages/ghost.css'
import './styles/pages/codex.css'
import './styles/pages/review.css'
import './styles/pages/quiz.css'
import './styles/pages/scenario.css'
import './styles/pages/ear.css'
import './styles/pages/train.css'
import './styles/pages/notebook.css'
import './styles/pages/coaching.css'
import './styles/pages/mechanics.css'
import './styles/pages/misc.css'
import './styles/pages/install.css'
import { App } from './App'
import { GHOSTS } from './data'
import { warmQuiz } from './engine/quiz'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Les questions se préparent pendant que le navigateur n'a rien d'autre à faire : le premier quiz démarre
// ensuite sans attendre. Même tableau GHOSTS que les pages (les calculs sont gardés par tableau).
const idle: (f: IdleRequestCallback) => void =
  typeof window.requestIdleCallback === 'function'
    ? (f) => window.requestIdleCallback(f, { timeout: 4000 })
    : (f) => setTimeout(() => f({ didTimeout: false, timeRemaining: () => 12 }), 300)
const warm: IdleRequestCallback = (d) => {
  // appelé faute de temps libre (timeout) : une seule étape, pour ne pas figer la page
  let once = d.didTimeout
  const more = () => (d.didTimeout ? (once ? !(once = false) : false) : d.timeRemaining() > 8)
  if (!warmQuiz(GHOSTS, more)) idle(warm)
}
idle(warm)
