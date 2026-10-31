import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHead } from '../components/ui'
import { buildReviewQueue } from '../engine/progress'
import { useStore } from '../store/store'

export function Train() {
  const { state, deck } = useStore()
  const due = useMemo(() => buildReviewQueue(state, deck, Date.now()).length, [state, deck])
  const modes = [
    {
      to: '/revision',
      title: 'Révision du jour',
      text: due ? `${due} carte${due > 1 ? 's' : ''} t’attendent. Les cartes reviennent juste avant d’être oubliées.` : 'À jour pour aujourd’hui.',
    },
    { to: '/enquete', title: 'Mise en situation', text: 'Une enquête simulée : indices au fil du contrat, carnet de preuves, élimination.' },
    { to: '/quiz', title: 'Quiz', text: 'Preuves, vitesses, seuils de chasse, comportements, tests sans preuve.' },
    { to: '/oreille', title: 'À l’oreille', text: 'Reconnaître la vitesse d’une entité au rythme de ses pas.' },
    { to: '/mecaniques', title: 'Mécaniques', text: 'Chasses, encens, équipement et idées reçues.' },
  ]
  return (
    <div className="page narrow">
      <PageHead title="S’entraîner">
        La révision fixe les connaissances, les enquêtes apprennent à s’en servir. Un peu des deux chaque jour, c’est l’idéal.
      </PageHead>
      <ul className="list modes">
        {modes.map((m) => (
          <li key={m.to}>
            <Link to={m.to} className="mode">
              <h2>{m.title}</h2>
              <p className="muted">{m.text}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
