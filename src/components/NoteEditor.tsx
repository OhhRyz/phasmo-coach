import { useState } from 'react'
import { GHOSTS } from '../data'
import type { CoachNote } from '../engine/cards'
import { newId, useStore } from '../store/store'
import { useToast } from './Toast'

export function NoteEditor({
  ghostId = null,
  note,
  compact,
  onDone,
}: {
  ghostId?: string | null
  note?: CoachNote
  compact?: boolean
  onDone?: () => void
}) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [open, setOpen] = useState(!compact || !!note)
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [ghost, setGhost] = useState<string | null>(note?.ghostId ?? ghostId)
  const [asCard, setAsCard] = useState(note?.asCard ?? true)
  const [question, setQuestion] = useState(note?.question ?? '')
  const [answer, setAnswer] = useState(note?.answer ?? '')

  const reset = () => {
    setTitle('')
    setBody('')
    setQuestion('')
    setAnswer('')
    setAsCard(true)
    setGhost(ghostId)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() && !body.trim()) return
    const now = Date.now()
    const n: CoachNote = {
      id: note?.id ?? newId(),
      createdAt: note?.createdAt ?? now,
      updatedAt: now,
      ghostId: ghost,
      title: title.trim() || body.trim().slice(0, 60),
      body: body.trim(),
      asCard,
      question: question.trim() || undefined,
      answer: answer.trim() || undefined,
      author: note?.author ?? (state.profile.role === 'coach' ? state.profile.name : state.profile.coachName) ?? '',
      pinned: note?.pinned,
    }
    dispatch({ type: 'note:upsert', note: n })
    toast(note ? 'Note mise à jour' : asCard ? 'Note ajoutée à la révision' : 'Note enregistrée')
    if (!note) reset()
    if (compact && !note) setOpen(false)
    onDone?.()
  }

  if (!open) {
    return (
      <button type="button" className="btn note-add" onClick={() => setOpen(true)}>
        Ajouter une note du coach
      </button>
    )
  }

  return (
    <form className="panel stack note-editor" onSubmit={submit}>
      <div className="grid-2">
        <label className="field">
          <span>Titre</span>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex. Le piège du Démon et de l’encens"
            maxLength={120}
            autoFocus={!note}
          />
        </label>
        <label className="field">
          <span>Entité concernée</span>
          <select className="select" value={ghost ?? ''} onChange={(e) => setGhost(e.target.value || null)}>
            <option value="">Général (aucune entité)</option>
            {GHOSTS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Ce que je t’explique</span>
        <textarea
          className="textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Le conseil, l’explication ou l’erreur à ne plus refaire…"
          maxLength={4000}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={asCard} onChange={(e) => setAsCard(e.target.checked)} />
        <span>
          Ajouter à la révision espacée
          <span className="faint small" style={{ display: 'block' }}>
            La note reviendra d’elle-même au bon moment, pour ne pas être oubliée.
          </span>
        </span>
      </label>
      {asCard && (
        <div className="grid-2">
          <label className="field">
            <span>Question (facultatif)</span>
            <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="ex. Combien de temps l’encens bloque-t-il un Démon ?" />
            <small>Sinon, le titre sert de question.</small>
          </label>
          <label className="field">
            <span>Réponse attendue (facultatif)</span>
            <input className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="ex. 60 secondes au lieu de 90" />
            <small>Sinon, le texte de la note sert de réponse.</small>
          </label>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {(compact || note) && (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              if (!note) setOpen(false)
              onDone?.()
            }}
          >
            Annuler
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={!title.trim() && !body.trim()}>
          {note ? 'Enregistrer' : 'Ajouter la note'}
        </button>
      </div>
    </form>
  )
}
