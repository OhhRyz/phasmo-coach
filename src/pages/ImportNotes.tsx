import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { Empty, PageHead } from '../components/ui'
import { getGhost } from '../data'
import { formatDate } from '../engine/format'
import { decodePayload } from '../engine/share'
import { useStore } from '../store/store'
import type { NotesPayload } from './Notebook'

export function ImportNotes() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { state, dispatch } = useStore()
  const [data, setData] = useState<NotesPayload | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const d = params.get('d')
    if (!d) {
      setError(true)
      return
    }
    decodePayload<NotesPayload>(d)
      .then((p) => (p.kind === 'phasmo-coach/notes' && Array.isArray(p.notes) ? setData(p) : setError(true)))
      .catch(() => setError(true))
  }, [params])

  if (error) {
    return (
      <div className="page narrow">
        <Empty title="Lien de partage invalide">
          <p>Le lien est peut-être incomplet : copie-le en entier.</p>
          <div className="row">
            <Link to="/carnet" className="btn">
              Aller au carnet
            </Link>
          </div>
        </Empty>
      </div>
    )
  }
  if (!data) return <div className="page narrow" />

  const existing = new Set(state.notes.map((n) => n.id))
  const fresh = data.notes.filter((n) => !existing.has(n.id)).length
  const updated = data.notes.filter((n) => {
    const cur = state.notes.find((x) => x.id === n.id)
    return cur && cur.updatedAt < n.updatedAt
  }).length

  return (
    <div className="page narrow">
      <PageHead title={`${data.notes.length} note${data.notes.length > 1 ? 's' : ''} de ${data.from || 'ton coach'}`}>
        Partagées le {formatDate(data.at)}. {fresh} nouvelle{fresh > 1 ? 's' : ''}, {updated} mise{updated > 1 ? 's' : ''} à jour. Les notes
        déjà dans ton carnet ne sont jamais effacées.
      </PageHead>
      <ul className="list notes">
        {data.notes.map((n) => (
          <li key={n.id}>
            <p className="faint small">
              {n.ghostId ? getGhost(n.ghostId)?.name : 'Général'} · {existing.has(n.id) ? 'déjà dans le carnet' : 'nouvelle'}
            </p>
            <h3>{n.title}</h3>
            {n.body && <p className="pre muted">{n.body}</p>}
          </li>
        ))}
      </ul>
      <div className="row" style={{ marginTop: 24 }}>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => {
            dispatch({ type: 'notes:import', notes: data.notes })
            toast('Carnet importé')
            navigate('/carnet')
          }}
        >
          Importer dans mon carnet
        </button>
        <Link to="/carnet" className="btn btn-lg btn-quiet">
          Annuler
        </Link>
      </div>
    </div>
  )
}
