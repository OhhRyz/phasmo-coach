import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { PageHeader } from '../components/ui'
import { buildReviewQueue } from '../engine/progress'
import { useStore } from '../store/store'

interface Mode {
  to: string
  icon: IconName
  title: string
  text: string
  tag?: string
}

export function Train() {
  const { state, deck } = useStore()
  const due = useMemo(() => buildReviewQueue(state, deck, Date.now()).length, [state, deck])
  const modes: Mode[] = [
    { to: '/revision', icon: 'layers', title: 'Révision du jour', text: 'Les cartes qui risquent de s’effacer, au bon moment.', tag: due ? `${due} carte${due > 1 ? 's' : ''}` : 'À jour' },
    { to: '/enquete', icon: 'search', title: 'Mise en situation', text: 'Une enquête simulée : indices au fil du contrat, preuves, élimination.' },
    { to: '/quiz', icon: 'quiz', title: 'Quiz', text: 'Preuves, vitesses, seuils, comportements et tests 0 preuve.' },
    { to: '/oreille', icon: 'ear', title: 'À l’oreille', text: 'Reconnaître la vitesse d’une entité au rythme de ses pas.' },
    { to: '/mecaniques', icon: 'compass', title: 'Mécaniques', text: 'Chasses, encens, équipement et idées reçues.' },
    { to: '/codex', icon: 'codex', title: 'Codex', text: 'Toutes les fiches, avec le filtre d’élimination.' },
  ]
  return (
    <div className="page">
      <PageHeader eyebrow="S’entraîner" title="Choisis ton entraînement">
        Varie les exercices : la révision fixe les connaissances, les enquêtes t’apprennent à t’en servir.
      </PageHeader>
      <div className="mode-grid">
        {modes.map((m) => (
          <Link key={m.to} to={m.to} className="card card-pad card-hover mode-card">
            <span className="mode-icon">
              <Icon name={m.icon} size={22} />
            </span>
            <div>
              <div className="row between">
                <h2>{m.title}</h2>
                {m.tag && <span className="chip chip-accent">{m.tag}</span>}
              </div>
              <p className="muted">{m.text}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
