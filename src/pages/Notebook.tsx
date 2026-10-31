import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { NoteEditor } from '../components/NoteEditor'
import { useToast } from '../components/Toast'
import { Empty, Modal, PageHead } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import type { CoachNote } from '../engine/cards'
import { formatDate, relativeDays } from '../engine/format'
import { appUrl, copyText, downloadJson, encodePayload } from '../engine/share'
import { sanitizeNotes } from '../store/schema'
import { useStore } from '../store/store'

export interface NotesPayload {
  kind: 'phasmo-coach/notes'
  from: string
  at: number
  notes: CoachNote[]
}

export function Notebook() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [ghost, setGhost] = useState('')
  const [editing, setEditing] = useState<CoachNote | null>(null)
  const [deleting, setDeleting] = useState<CoachNote | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const notes = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.notes
      .filter((n) => !ghost || (ghost === 'general' ? !n.ghostId : n.ghostId === ghost))
      .filter((n) => !q || `${n.title} ${n.body} ${n.question ?? ''} ${n.answer ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt)
  }, [state.notes, query, ghost])

  const payload = (): NotesPayload => ({
    kind: 'phasmo-coach/notes',
    from: state.profile.name,
    at: Date.now(),
    notes: state.notes,
  })

  const share = async () => {
    setShareUrl(appUrl(`/importer?d=${await encodePayload(payload())}`))
  }

  const importFile = async (file: File) => {
    try {
      const json = JSON.parse(await file.text()) as Partial<NotesPayload>
      const notes = json.kind === 'phasmo-coach/notes' ? sanitizeNotes(json.notes) : []
      if (!notes.length) throw new Error('format')
      dispatch({ type: 'notes:import', notes })
      toast(`${notes.length} note${notes.length > 1 ? 's' : ''} importée${notes.length > 1 ? 's' : ''}`)
    } catch {
      toast('Fichier non reconnu')
    }
  }

  return (
    <div className="page narrow">
      <PageHead
        title="Carnet du coach"
        actions={
          <>
            <button type="button" className="btn" onClick={share} disabled={!state.notes.length}>
              Partager par lien
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!state.notes.length}
              onClick={() => downloadJson(`phasmo-coach-notes-${new Date().toISOString().slice(0, 10)}.json`, payload())}
            >
              Exporter
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => fileRef.current?.click()}>
              Importer un fichier
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          </>
        }
      >
        Tout ce que le coach explique, au même endroit. Une note ajoutée à la révision reviendra d’elle-même au bon moment :
        plus besoin de la répéter.
      </PageHead>

      <NoteEditor />

      {state.notes.length > 0 && (
        <div className="row notebook-filters">
          <input
            className="input"
            style={{ flex: '1 1 220px' }}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher dans les notes"
            aria-label="Chercher dans les notes"
          />
          <select className="select" style={{ flex: '0 1 220px' }} value={ghost} onChange={(e) => setGhost(e.target.value)} aria-label="Filtrer par entité">
            <option value="">Toutes les notes ({state.notes.length})</option>
            <option value="general">Générales</option>
            {GHOSTS.filter((g) => state.notes.some((n) => n.ghostId === g.id)).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {notes.length === 0 ? (
        <Empty title={state.notes.length ? 'Aucune note ne correspond' : 'Le carnet est vide'}>
          {!state.notes.length && <p>Écris le premier conseil : une astuce, une erreur à éviter, un test à retenir.</p>}
        </Empty>
      ) : (
        <ul className="list notes">
          {notes.map((n) => {
            const g = n.ghostId ? getGhost(n.ghostId) : undefined
            const rs = state.cards[`n:${n.id}`]
            return (
              <li key={n.id} className={n.pinned ? 'pinned' : undefined}>
                <p className="faint small">
                  {n.pinned && <span className="tag accent">épinglée</span>} {g ? <Link to={`/codex/${g.id}`}>{g.name}</Link> : 'Général'}
                  {n.asCard && ` · ${rs ? (rs.phase === 'review' ? `revient en révision ${relativeDays(rs.due)}` : 'en cours d’apprentissage') : 'pas encore révisée'}`}
                </p>
                <h3>{n.title}</h3>
                {n.body && <p className="pre">{n.body}</p>}
                {n.asCard && n.question && (
                  <p className="qa small">
                    <span>Question : {n.question}</span>
                    {n.answer && <span>Réponse : {n.answer}</span>}
                  </p>
                )}
                <p className="row between note-foot">
                  <span className="faint small">
                    {n.author ? `${n.author}, ` : ''}
                    {formatDate(n.createdAt)}
                  </span>
                  <span className="row" style={{ '--gap': '14px' } as React.CSSProperties}>
                    <button
                      type="button"
                      className="link-btn muted-link small"
                      onClick={() => dispatch({ type: 'note:upsert', note: { ...n, pinned: !n.pinned, updatedAt: Date.now() } })}
                    >
                      {n.pinned ? 'Désépingler' : 'Épingler'}
                    </button>
                    <button type="button" className="link-btn muted-link small" onClick={() => setEditing(n)}>
                      Modifier
                    </button>
                    <button type="button" className="link-btn muted-link small" onClick={() => setDeleting(n)}>
                      Supprimer
                    </button>
                  </span>
                </p>
              </li>
            )
          })}
        </ul>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Modifier la note">
        {editing && <NoteEditor note={editing} onDone={() => setEditing(null)} />}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Supprimer cette note ?"
        actions={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setDeleting(null)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (deleting) dispatch({ type: 'note:delete', id: deleting.id })
                setDeleting(null)
                toast('Note supprimée')
              }}
            >
              Supprimer
            </button>
          </>
        }
      >
        <p className="muted">« {deleting?.title} » et sa carte de révision seront supprimées de cet appareil.</p>
      </Modal>

      <Modal
        open={!!shareUrl}
        onClose={() => setShareUrl(null)}
        title="Partager le carnet"
        actions={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setShareUrl(null)}>
              Fermer
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                if (shareUrl && (await copyText(shareUrl))) toast('Lien copié')
              }}
            >
              Copier le lien
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginBottom: 12 }}>
          Envoie ce lien : en l’ouvrant, l’autre appareil pourra importer les {state.notes.length} note{state.notes.length > 1 ? 's' : ''}.
          Celles qui existent déjà sont mises à jour, rien n’est effacé. Les notes voyagent dans le lien lui-même : aucun serveur
          ne les garde.
        </p>
        <textarea className="textarea mono" readOnly value={shareUrl ?? ''} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: '0.75rem', minHeight: 90 }} />
      </Modal>
    </div>
  )
}
