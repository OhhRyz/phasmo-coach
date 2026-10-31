import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { Empty, PageHeader } from '../components/ui'
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
        <Empty icon="link" title="Lien de partage invalide">
          <p>Le lien est peut-être incomplet (copie-le en entier).</p>
          <Link to="/carnet" className="btn">
            Aller au carnet
          </Link>
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
      <PageHeader eyebrow="Carnet partagé" title={`${data.notes.length} note${data.notes.length > 1 ? 's' : ''} de ${data.from || 'ton coach'}`}>
        Partagé le {formatDate(data.at)}. {fresh} nouvelle{fresh > 1 ? 's' : ''}, {updated} mise{updated > 1 ? 's' : ''} à jour. Tes notes
        existantes ne sont jamais effacées.
      </PageHeader>
      <div className="stack">
        {data.notes.map((n) => (
          <article key={n.id} className="card card-pad note-mini">
            <div className="row" style={{ marginBottom: 6 }}>
              {n.ghostId && <span className="chip chip-accent tiny">{getGhost(n.ghostId)?.name}</span>}
              {existing.has(n.id) ? <span className="chip tiny">déjà dans le carnet</span> : <span className="chip chip-ok tiny">nouvelle</span>}
            </div>
            <h3>{n.title}</h3>
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
              {n.body}
            </p>
          </article>
        ))}
      </div>
      <div className="row" style={{ marginTop: 20 }}>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => {
            dispatch({ type: 'notes:import', notes: data.notes })
            toast('Carnet importé')
            navigate('/carnet')
          }}
        >
          <Icon name="download" size={18} />
          Importer dans mon carnet
        </button>
        <Link to="/carnet" className="btn btn-lg btn-ghost">
          Annuler
        </Link>
      </div>
    </div>
  )
}
