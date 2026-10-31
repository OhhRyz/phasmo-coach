import { Link } from 'react-router-dom'
import { Empty } from '../components/ui'

export function NotFound() {
  return (
    <div className="page narrow">
      <Empty title="Cette pièce est vide">
        <p>La page demandée n’existe pas (ou elle a été hantée).</p>
        <div className="row">
          <Link to="/" className="btn btn-primary">
            Retour à l’accueil
          </Link>
        </div>
      </Empty>
    </div>
  )
}
