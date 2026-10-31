import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { NoteEditor } from '../components/NoteEditor'
import { useToast } from '../components/Toast'
import { Empty, Modal, PageHeader } from '../components/ui'
import { GHOSTS, getGhost } from '../data'
import type { CoachNote } from '../engine/cards'
import { formatDate } from '../engine/format'
import { appUrl, copyText, downloadJson, encodePayload } from '../engine/share'
import { relativeDays } from '../engine/format'
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
    const data = await encodePayload(payload())
    const url = appUrl(`/importer?d=${data}`)
    setShareUrl(url)
  }

  const importFile = async (file: File) => {
    try {
      const json = JSON.parse(await file.text()) as Partial<NotesPayload>
      if (json.kind !== 'phasmo-coach/notes' || !Array.isArray(json.notes)) throw new Error('format')
      dispatch({ type: 'notes:import', notes: json.notes })
      toast(`${json.notes.length} note${json.notes.length > 1 ? 's' : ''} importée${json.notes.length > 1 ? 's' : ''}`)
    } catch {
      toast('Fichier non reconnu')
    }
  }

  const reviewState = (n: CoachNote) => state.cards[`n:${n.id}`]

  return (
    <div className="page">
      <PageHeader
        eyebrow="Savoir"
        title="Carnet du coach"
        actions={
          <>
            <button type="button" className="btn" onClick={share} disabled={!state.notes.length}>
              <Icon name="share" size={18} />
              Partager par lien
            </button>
            <button type="button" className="btn btn-ghost btn-icon" title="Exporter en fichier" aria-label="Exporter en fichier" disabled={!state.notes.length} onClick={() => downloadJson(`phasmo-coach-notes-${new Date().toISOString().slice(0, 10)}.json`, payload())}>
              <Icon name="download" size={18} />
            </button>
            <button type="button" className="btn btn-ghost btn-icon" title="Importer un fichier" aria-label="Importer un fichier" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={18} />
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          </>
        }
      >
        Tout ce que le coach explique, au même endroit. Chaque note peut devenir une carte de révision : elle reviendra
        d’elle-même au bon moment, inutile de la répéter.
      </PageHeader>

      <NoteEditor />

      <div className="row notebook-filters">
        <div className="search" style={{ flex: '1 1 240px' }}>
          <Icon name="search" size={17} />
          <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher dans les notes" aria-label="Rechercher dans les notes" />
        </div>
        <select className="select" style={{ flex: '0 1 240px' }} value={ghost} onChange={(e) => setGhost(e.target.value)} aria-label="Filtrer par entité">
          <option value="">Toutes les notes ({state.notes.length})</option>
          <option value="general">Générales</option>
          {GHOSTS.filter((g) => state.notes.some((n) => n.ghostId === g.id)).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {notes.length === 0 ? (
        <div className="card">
          <Empty icon="notebook" title={state.notes.length ? 'Aucune note ne correspond' : 'Le carnet est vide'}>
            {!state.notes.length && <p>Écris le premier conseil ci-dessus : une astuce, une erreur à éviter, un test à retenir.</p>}
          </Empty>
        </div>
      ) : (
        <div className="notes-grid">
          {notes.map((n) => {
            const g = n.ghostId ? getGhost(n.ghostId) : undefined
            const rs = reviewState(n)
            return (
              <article key={n.id} className={`card card-pad note-card${n.pinned ? ' pinned' : ''}`}>
                <div className="row between">
                  <div className="row" style={{ '--gap': '6px' } as React.CSSProperties}>
                    {g ? (
                      <Link to={`/codex/${g.id}`} className="chip chip-accent tiny">
                        {g.name}
                      </Link>
                    ) : (
                      <span className="chip tiny">Général</span>
                    )}
                    {n.asCard && (
                      <span className="chip tiny" title="Carte de révision">
                        <Icon name="layers" size={12} />
                        {rs ? (rs.phase === 'review' ? `revient ${relativeDays(rs.due)}` : 'en apprentissage') : 'à découvrir'}
                      </span>
                    )}
                  </div>
                  <div className="row" style={{ '--gap': '2px' } as React.CSSProperties}>
                    <button
                      type="button"
                      className={`btn btn-ghost btn-sm btn-icon${n.pinned ? ' pin-on' : ''}`}
                      title={n.pinned ? 'Désépingler' : 'Épingler'}
                      aria-label={n.pinned ? 'Désépingler' : 'Épingler'}
                      onClick={() => dispatch({ type: 'note:upsert', note: { ...n, pinned: !n.pinned, updatedAt: Date.now() } })}
                    >
                      <Icon name="pin" size={16} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" title="Modifier" aria-label="Modifier" onClick={() => setEditing(n)}>
                      <Icon name="edit" size={16} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" title="Supprimer" aria-label="Supprimer" onClick={() => setDeleting(n)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>
                <h3>{n.title}</h3>
                {n.body && <p className="note-body">{n.body}</p>}
                {n.asCard && n.question && (
                  <div className="note-qa">
                    <span>
                      <b>Q.</b> {n.question}
                    </span>
                    {n.answer && (
                      <span>
                        <b>R.</b> {n.answer}
                      </span>
                    )}
                  </div>
                )}
                <p className="faint note-foot">
                  {n.author ? `${n.author} · ` : ''}
                  {formatDate(n.createdAt)}
                </p>
              </article>
            )
          })}
        </div>
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
            <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)}>
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
              <Icon name="trash" size={16} />
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
            <button type="button" className="btn btn-ghost" onClick={() => setShareUrl(null)}>
              Fermer
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                if (shareUrl && (await copyText(shareUrl))) toast('Lien copié')
              }}
            >
              <Icon name="copy" size={16} />
              Copier le lien
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginBottom: 12 }}>
          Envoie ce lien : en l’ouvrant, l’autre appareil pourra importer les {state.notes.length} note{state.notes.length > 1 ? 's' : ''} (les
          notes déjà présentes sont mises à jour, rien n’est effacé). Les notes voyagent dans le lien, aucun serveur ne les
          stocke.
        </p>
        <textarea className="textarea mono" readOnly value={shareUrl ?? ''} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: '0.75rem', minHeight: 90 }} />
      </Modal>
    </div>
  )
}
