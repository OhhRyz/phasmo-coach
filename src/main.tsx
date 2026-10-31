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
import './styles/pages/notebook.css'
import './styles/pages/coaching.css'
import './styles/pages/mechanics.css'
import './styles/pages/misc.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
