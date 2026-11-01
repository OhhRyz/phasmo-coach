import { useMemo } from 'react'
import { FileHead, Notebook, Page } from '../components/journal/Journal'
import { notebookStats, NotebookStats, Registry } from '../components/Registry'
import { safeDate } from '../engine/format'
import { useMastery } from '../store/hooks'
import { useStore } from '../store/store'

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * « Ma progression » : un seul endroit pour voir où l'on en est, sans changer d'onglet. Le registre des
 * entités de l'accueil et les chiffres de la carte d'enquête du profil, rien de plus.
 */
export function ProgressPage() {
  const { state, deck } = useStore()
  const mastery = useMastery()
  const now = useMemo(() => Date.now(), [])
  const stats = notebookStats(state, deck, now)
  return (
    <Notebook single className="progression">
      <Page section="1" label="Ma progression">
        <FileHead>
          <span>
            Carnet de <b>{state.profile.name || '—'}</b>
          </span>
          <span>
            Ouvert le <b>{safeDate(DATE, state.profile.createdAt)}</b>
          </span>
        </FileHead>

        <div className="entry">
          <h1 className="entry-date">
            <em>Le registre des entités</em>
            Ma progression
          </h1>
        </div>
        <NotebookStats {...stats} className="progress-stats" />

        <section className="progress-registry" aria-labelledby="h-prog-reg">
          <Registry id="h-prog-reg" mastery={mastery} />
        </section>
      </Page>
    </Notebook>
  )
}
